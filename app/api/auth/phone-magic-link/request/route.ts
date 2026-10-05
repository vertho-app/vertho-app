import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { validateWhatsApp } from '@/lib/phone';
import { emailDeAcessoPorTelefone, isProxyEmail } from '@/lib/phone-otp';
import { resolveAppLocale } from '@/lib/i18n';
import { sendAccessLink } from '@/lib/notifications/access-link-service';
import { authLimiter, limitarPorDestino } from '@/lib/rate-limit';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';
import { tenantUrl } from '@/lib/domain';
import { ehDestinoDoPainel } from '@/lib/auth/login-senha';
import { CODIGO_CANAL_INDISPONIVEL, CODIGO_ESCOLHER_ORGANIZACAO, CODIGO_FALHA_NO_ENVIO, CODIGO_TELEFONE_INVALIDO } from '@/lib/auth/login-respostas';

export const dynamic = 'force-dynamic';

/**
 * Mesma forma de slug que o `/api/auth/magic-link` aceita na escolha da
 * organização: o que vem do cliente só entra na busca se tiver cara de slug.
 */
const SLUG_ESCOLHIDO = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Tira de um texto de log qualquer sequência longa de dígitos, que pode ser o
 * telefone inteiro (o motivo que o provedor devolve, a mensagem do Auth e o
 * e-mail proxy `wa.<empresa>.<telefone>@...` o carregam). Sobram os 4 últimos,
 * o bastante para o operador reconhecer o caso.
 */
function semNumeros(texto: unknown): string {
  return String(texto ?? '').replace(/\d{8,}/g, (digitos) => `…${digitos.slice(-4)}`);
}

type Descoberta =
  | { tipo: 'erro' }
  | { tipo: 'nenhuma' }
  | { tipo: 'uma'; slug: string }
  | { tipo: 'escolher'; orgs: Array<{ slug: string; nome: string }> };

/**
 * Em qual organização está este número, quando o pedido não vem de um
 * subdomínio de tenant. Mesmo desenho do login por e-mail (`check-email` +
 * `magic-link`), aplicado ao telefone (R-76).
 *
 * `empresaSlug` é a escolha que a pessoa fez na tela e vem do CLIENTE, então
 * nunca é confiada: só ESCOPA a busca. Quem decide se há cadastro naquela
 * empresa é o fluxo adiante, que lê o telefone DENTRO dela; se o número não
 * estiver lá, o desfecho é o mesmo de qualquer número desconhecido.
 *
 * Tenants de demonstração ficam de fora (o envio real é bloqueado neles, então
 * seria uma opção que não envia nada) e a lista só existe com 2 ou mais
 * organizações: com 1 não há o que perguntar, e listar revelaria onde a pessoa
 * trabalha sem necessidade nenhuma. O corte é sobre a lista JÁ FILTRADA, como no
 * `check-email`.
 *
 * Esta é a ÚNICA leitura de `colaboradores` sem filtro de empresa da rota, e ela
 * pede só `empresa_id` pelo telefone exato (E.164, validado antes). Por isso a
 * rota consta em `config/tenant-read-allowlist.json`. O teto por IP e o teto por
 * telefone rodam ANTES de chegar aqui.
 */
async function organizacoesDoTelefone(
  sb: ReturnType<typeof createSupabaseAdmin>,
  e164: string,
  empresaSlug: unknown,
): Promise<Descoberta> {
  const escolhido = typeof empresaSlug === 'string' && SLUG_ESCOLHIDO.test(empresaSlug.trim().toLowerCase())
    ? empresaSlug.trim().toLowerCase()
    : null;

  if (escolhido) {
    const { data: empresaEscolhida, error: erroEscolhida } = await sb
      .from('empresas')
      .select('slug, is_demo')
      .eq('slug', escolhido)
      .maybeSingle();
    if (erroEscolhida) {
      console.error('[phone-magic-link/request] empresa escolhida:', semNumeros(erroEscolhida.message));
      return { tipo: 'erro' };
    }
    // Não existe ou é de demonstração: o mesmo desfecho de número desconhecido.
    if (!empresaEscolhida || empresaEscolhida.is_demo) return { tipo: 'nenhuma' };
    return { tipo: 'uma', slug: empresaEscolhida.slug as string };
  }

  const { data: vinculos, error: erroVinculos } = await sb
    .from('colaboradores')
    .select('empresa_id')
    .eq('telefone', e164)
    .eq('login_por_whatsapp', true);
  if (erroVinculos) {
    console.error('[phone-magic-link/request] organizações do número:', semNumeros(erroVinculos.message));
    return { tipo: 'erro' };
  }

  const ids = [...new Set((vinculos || []).map((v: any) => v.empresa_id).filter(Boolean))];
  if (!ids.length) return { tipo: 'nenhuma' };

  const { data: empresas, error: erroEmpresas } = await sb
    .from('empresas')
    .select('slug, nome, is_demo')
    .in('id', ids)
    .order('nome', { ascending: true });
  if (erroEmpresas) {
    console.error('[phone-magic-link/request] empresas do número:', semNumeros(erroEmpresas.message));
    return { tipo: 'erro' };
  }

  const orgs = (empresas || [])
    .filter((e: any) => e.slug && !e.is_demo)
    .map((e: any) => ({ slug: e.slug as string, nome: (e.nome as string) || (e.slug as string) }));

  if (orgs.length === 0) return { tipo: 'nenhuma' };
  if (orgs.length === 1) return { tipo: 'uma', slug: orgs[0].slug };
  return { tipo: 'escolher', orgs };
}

/**
 * Envia link de acesso por WhatsApp para colaboradores phone-only.
 *
 * Mantem a identidade real do usuario como telefone, mas usa o email proxy
 * interno apenas para criar a sessao Supabase via /auth/callback.
 */
export async function POST(req: NextRequest) {
  const limited = await authLimiter.check(req);
  if (limited) return limited;

  try {
    const { telefone, redirectTo, locale: bodyLocale, empresaSlug } = await req.json();
    const locale = resolveAppLocale(bodyLocale, req.cookies.get('vertho-locale')?.value);

    const check = validateWhatsApp(telefone);
    if (check.valid === false) {
      return NextResponse.json({ error: check.error, codigo: CODIGO_TELEFONE_INVALIDO }, { status: 400 });
    }
    const e164 = check.e164;

    // Teto por telefone (R-79): o limite por IP não segurava uma rajada de
    // templates pagos para o WhatsApp de uma pessoa vinda de IPs variados.
    // Antes de QUALQUER consulta ao cadastro (inclusive a que descobre a
    // organização no endereço genérico), para valer igual para número
    // cadastrado e não cadastrado.
    const limiteDoDestino = await limitarPorDestino(req, 'telefone', e164);
    if (limiteDoDestino) return limiteDoDestino;

    const sb = createSupabaseAdmin();

    // 🔑 Endereço genérico (`app.vertho.ai`): sem subdomínio não há organização
    // declarada, e até 04/10/2026 a rota respondia 400 (antes disso, `{ ok: true }`
    // sem enviar nada, e a tela dizia "Link enviado!": R-76). Agora a organização
    // sai do NÚMERO, no mesmo desenho do login por e-mail:
    //   · 1 organização -> segue como se o host fosse o dela;
    //   · 2 ou mais     -> devolve a lista para a tela perguntar em qual entrar;
    //   · nenhuma       -> `{ ok: true }` sem enviar, IGUAL ao de um número
    //                      desconhecido no host de um tenant (anti-enumeração:
    //                      nada na resposta distingue 0 de 1).
    // No host de um tenant nada disto roda: o host manda, e o `empresaSlug` do
    // corpo é ignorado.
    const slugDoHost = getTenantSlug(req);
    let slug = slugDoHost;
    if (!slug) {
      const descoberta = await organizacoesDoTelefone(sb, e164, empresaSlug);
      if (descoberta.tipo === 'erro') {
        // Falha de banco não é "número desconhecido": a pessoa precisa saber
        // que nada saiu.
        return NextResponse.json({ error: 'Falha ao preparar o acesso.', codigo: CODIGO_FALHA_NO_ENVIO }, { status: 500 });
      }
      if (descoberta.tipo === 'nenhuma') return NextResponse.json({ ok: true });
      if (descoberta.tipo === 'escolher') {
        return NextResponse.json({ codigo: CODIGO_ESCOLHER_ORGANIZACAO, orgs: descoberta.orgs });
      }
      slug = descoberta.slug;
    }

    const { data: empresa } = await sb
      .from('empresas')
      .select('id, nome')
      .eq('slug', slug)
      .maybeSingle();
    if (!empresa) return NextResponse.json({ ok: true });

    const { data: colab } = await sb
      .from('colaboradores')
      .select('id, nome_completo, email')
      .eq('empresa_id', empresa.id)
      .eq('telefone', e164)
      .eq('login_por_whatsapp', true)
      .limit(1)
      .maybeSingle();

    if (!colab) return NextResponse.json({ ok: true });

    // Identidade: e-mail REAL do colab quando houver (login por WhatsApp e e-mail
    // no mesmo auth.users); senão o proxy interno.
    const authEmail = emailDeAcessoPorTelefone(colab.email, empresa.id, e164);

    const { error: createErr } = await sb.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
    });
    if (createErr && !/already|registered|exists/i.test(createErr.message)) {
      console.error('[phone-magic-link/request] createUser:', semNumeros(createErr.message));
      return NextResponse.json({ error: 'Falha ao preparar o acesso.', codigo: CODIGO_FALHA_NO_ENVIO }, { status: 500 });
    }

    // Só sincroniza colaboradores.email quando a identidade é o proxy. NUNCA
    // sobrescreve um e-mail real cadastrado.
    if (isProxyEmail(authEmail) && (colab.email || '').toLowerCase() !== authEmail) {
      await sb.from('colaboradores').update({ email: authEmail })
        .eq('id', colab.id).eq('empresa_id', empresa.id);
    }

    const redirect = resolveSafeAuthRedirect(req, redirectTo);
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: { redirectTo: redirect.safeRedirectTo },
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('[phone-magic-link/request] generateLink:', semNumeros(linkErr?.message));
      return NextResponse.json({ error: 'Falha ao gerar o link de acesso.', codigo: CODIGO_FALHA_NO_ENVIO }, { status: 500 });
    }

    // A sessão precisa nascer no subdomínio do TENANT: o cookie não declara
    // `domain`, então fica preso ao host exato (mesma razão do `magic-link` por
    // e-mail). No host de um tenant, esse é o da própria requisição, como sempre
    // foi. No endereço genérico o host da requisição NÃO é de tenant, e o link
    // vai para a casa da organização descoberta ou escolhida.
    const origemDoLink = slugDoHost ? redirect.origin : tenantUrl(slug);

    // Pedir o painel da plataforma (`/admin...`) no endereço genérico não leva o
    // link do WhatsApp para lá: o botão do template só alcança o tenant (o
    // `/entrar` despacha para o subdomínio do slug, sempre com `/dashboard`).
    // Aqui o `next` também fica no `/dashboard`, em vez de apontar um painel
    // que o host do tenant não serve.
    const nextPath = !slugDoHost && ehDestinoDoPainel(redirect.nextPath) ? '/dashboard' : redirect.nextPath;

    const link =
      `${origemDoLink}/auth/callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}` +
      `&type=email&next=${encodeURIComponent(nextPath)}`;

    const result = await sendAccessLink({
      to: authEmail,
      telefone: e164,
      nome: colab.nome_completo?.split(' ')[0] || '',
      empresaNome: empresa.nome || 'Vertho',
      empresaId: empresa.id, // gate de tenant-demo
      locale,
      whatsappLink: link,
      // Rede de segurança do botão do template quando o host não tem tenant.
      tenantSlug: slug,
      channels: ['whatsapp'],
    });

    if (result.whatsapp !== 'sent') {
      console.error('[phone-magic-link/request] não enviado:', semNumeros(result.whatsappReason));
      // Preserva os status HTTP: Z-API não configurado → 503; falha de envio → 502.
      const indisponivel = /não configurado|nao configurado/i.test(result.whatsappReason || '');
      return indisponivel
        ? NextResponse.json({ error: 'Canal WhatsApp indisponível no momento.', codigo: CODIGO_CANAL_INDISPONIVEL }, { status: 503 })
        : NextResponse.json({ error: 'Não foi possível enviar o link pelo WhatsApp. Tente novamente.', codigo: CODIGO_FALHA_NO_ENVIO }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[phone-magic-link/request]', semNumeros(err.message));
    return NextResponse.json({ error: 'Erro ao enviar link de acesso.', codigo: CODIGO_FALHA_NO_ENVIO }, { status: 500 });
  }
}
