import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { authLimiter } from '@/lib/rate-limit';
import { resolveAppLocale } from '@/lib/i18n';
import { resolveSafeAuthRedirect } from '@/lib/auth/redirect';
import { sendAccessLink, recipientFromLookup } from '@/lib/notifications/access-link-service';
import { tenantUrl } from '@/lib/domain';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Rate limit por IP — rota não autenticada que dispara email/WhatsApp (custo).
  const limited = await authLimiter.check(req);
  if (limited) return limited;

  try {
    const { email, redirectTo, locale: bodyLocale, empresaSlug } = await req.json();
    const locale = resolveAppLocale(bodyLocale, req.cookies.get('vertho-locale')?.value);
    if (!email) return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });

    const trimmed = email.trim().toLowerCase();
    const sb = createSupabaseAdmin();

    // ── Elegibilidade + escopo de tenant ───────────────────────────────────
    // Só enviamos link a quem é colaborador (de alguma empresa) ou platform admin.
    // COM subdomínio: exigimos que o email pertença ÀQUELA empresa (fecha o
    // open-relay e o vazamento cross-tenant). SEM subdomínio (apex): o magic link
    // é GLOBAL por email — o tenant vem da ESCOLHA da pessoa na tela de login, e
    // só quando ela não escolhe é que se pega um registro representativo.
    // (findColabByEmail é fail-closed na ambiguidade por ser usado em
    // autorização; usá-lo aqui causava "sucesso silencioso" p/ emails duplicados
    // em tenants — o usuário existia mas nada era enviado.)
    //
    // O tenant sai do subdomínio; no endereço genérico (`app.vertho.ai`, apex)
    // não há subdomínio, e aí vale a organização que a pessoa ESCOLHEU na tela
    // de login (`/api/auth/check-email` devolve a lista quando o e-mail está em
    // mais de uma). A escolha é do cliente, então nunca é confiada: ela só
    // ESCOPA a busca — se o e-mail não estiver naquela empresa, não acha nada e
    // o fluxo devolve sucesso genérico sem enviar.
    const slugDoHost = getTenantSlug(req);
    const slugEscolhido = typeof empresaSlug === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test(empresaSlug.trim().toLowerCase())
      ? empresaSlug.trim().toLowerCase()
      : null;
    const slugAlvo = slugDoHost || slugEscolhido;

    let colab: { nome_completo: string | null; telefone: string | null; empresa_id: string } | null = null;
    if (slugAlvo) {
      const { data: empresa } = await sb.from('empresas').select('id').eq('slug', slugAlvo).maybeSingle();
      if (empresa) {
        const { data } = await sb.from('colaboradores')
          .select('nome_completo, telefone, empresa_id')
          .eq('email', trimmed).eq('empresa_id', empresa.id)
          .limit(1).maybeSingle();
        colab = data as typeof colab;
      }
    } else {
      // Sem tenant e sem escolha: o mesmo e-mail existe em mais de uma empresa
      // nesta base, e `limit(1)` SEM `order` deixa o registro a critério do
      // planner. Isso já mordeu: o cadastro sorteado podia ser um sem telefone
      // (`teste-piloto`), e aí o WhatsApp era pulado como "colaborador sem
      // telefone" — um silêncio que nem telemetria deixava. Ordenar por
      // telefone-primeiro torna a escolha determinística E enviável.
      const { data } = await sb.from('colaboradores')
        .select('nome_completo, telefone, empresa_id')
        .eq('email', trimmed)
        .order('telefone', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(1).maybeSingle();
      colab = data as typeof colab;
    }

    let platformAdmin: { nome: string | null } | null = null;
    if (!colab) {
      const { data: admin } = await sb.from('platform_admins')
        .select('nome').eq('email', trimmed).maybeSingle();
      platformAdmin = admin as typeof platformAdmin;
    }

    // Representante comercial (RC): não é colaborador de tenant nem platform
    // admin, mas é um login legítimo (Portal do Representante). Elegível quando
    // ativo. Sem tenant/telefone → link por e-mail, redirect para /representante.
    let rep: { name: string | null } | null = null;
    if (!colab && !platformAdmin) {
      const { data } = await sb.from('sales_representatives')
        .select('name').eq('email', trimmed).eq('status', 'active').maybeSingle();
      rep = data as typeof rep;
    }

    const baseRecipient = recipientFromLookup(colab, platformAdmin);
    const recipient = baseRecipient.eligible
      ? baseRecipient
      : rep
        ? { eligible: true, nome: (rep.name || '').split(' ')[0] || '', telefone: null as string | null }
        : baseRecipient;
    // Não é colaborador, admin nem RC → sucesso genérico SEM enviar (anti-enumeração).
    if (!recipient.eligible) {
      return NextResponse.json({ success: true });
    }

    const redirect = resolveSafeAuthRedirect(req, redirectTo);

    // Gera magic link via admin API (sem o rate limit de SMTP do Supabase Auth).
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email: trimmed,
      options: { redirectTo: redirect.safeRedirectTo },
    });
    if (linkErr || !linkData?.properties) {
      console.error('[magic-link] generateLink failed:', linkErr?.message);
      return NextResponse.json({ error: `Falha ao gerar link: ${linkErr?.message || 'erro desconhecido'}` });
    }

    const tokenHash = linkData.properties.hashed_token;
    const actionLink = linkData.properties.action_link;

    const empresa = colab?.empresa_id
      ? (await sb.from('empresas').select('nome, slug').eq('id', colab.empresa_id).maybeSingle()).data
      : null;
    const empresaNome = empresa?.nome || 'Vertho';
    const slugDoTenant = (empresa as { slug?: string } | null)?.slug || null;

    // RC vai direto ao Portal do Representante (evita o flash no /dashboard, que
    // de todo modo redirecionaria via guard). Deep-links /representante/* passam.
    const isRep = !colab && !platformAdmin && !!rep;
    const nextPath = isRep && !redirect.nextPath.startsWith('/representante')
      ? '/representante' : redirect.nextPath;

    // 🔴 O DESTINO PEDIDO MANDA NO HOST — antes do cadastro (medido 19/08/2026)
    // ────────────────────────────────────────────────────────────────────────
    // O painel da plataforma (`/admin`, `/admin-v2`) vive no endereço genérico,
    // que NÃO é tenant. A régua que decide quem entra ali é o e-mail
    // (`platform_admins`), não a empresa — mas o link era montado olhando só o
    // CADASTRO: "tem colaborador ⇒ manda para o subdomínio dele".
    //
    // Os três platform admins têm cadastro de colaborador. Resultado, medido no
    // dia: às 08:58 a sessão do Samuel morreu (`refresh_token_not_found`), ele
    // pediu o link às 08:59, entrou às 08:59:24 — no subdomínio do tenant — e
    // às 09:00 o `/admin/dashboard` ainda respondia 307. O link levava para uma
    // casa que não era a que ele tinha pedido, e o ciclo se repetia: nenhum
    // pedido de link conseguia devolvê-lo ao painel.
    //
    // 🔑 A regra que faltava: o cadastro diz onde é a casa da pessoa; o
    // `next` diz para onde ELA pediu para ir. Quando o destino é o painel da
    // plataforma e o e-mail é de admin, a sessão precisa nascer no host de onde
    // o pedido saiu (`redirect.origin`, já validado contra open redirect).
    const destinoEhPainelPlataforma = /^\/admin(-v2)?(\/|$|\?)/.test(nextPath);
    // A consulta de `platform_admins` acima só acontece quando NÃO há
    // colaborador — e é exatamente a mesma pessoa que precisa das duas coisas.
    // Aqui a pergunta é outra e tem que ser feita de novo, sem o `if`.
    let ehAdminDaPlataforma = !!platformAdmin;
    if (destinoEhPainelPlataforma && !ehAdminDaPlataforma) {
      const { data: adminDoDestino } = await sb.from('platform_admins')
        .select('email').eq('email', trimmed).maybeSingle();
      ehAdminDaPlataforma = !!adminDoDestino;
    }
    // ⚠️ `nextPath` vem do cliente (via `redirectTo`), então ele sozinho não
    // decide nada: sem o e-mail estar em `platform_admins`, pedir `/admin` não
    // muda o host — só levaria a pessoa a um painel que o gate recusa.
    const paraPainelPlataforma = destinoEhPainelPlataforma && ehAdminDaPlataforma;

    // A sessão precisa nascer no subdomínio do TENANT: o cookie não declara
    // `domain`, então fica preso ao host exato. Entrar por `app.vertho.ai`
    // deixava a pessoa logada num host sem tenant — o que o middleware registra
    // como `[authz] email ambíguo (multi-tenant) sem tenant resolvido` e trata
    // fail-closed. Quando sabemos a empresa, o link vai para a casa dela; o
    // `token_hash` é global (é o mesmo despacho que o `/entrar` faz).
    const origemCallback = paraPainelPlataforma
      ? redirect.origin
      : slugDoTenant ? tenantUrl(slugDoTenant) : redirect.origin;

    // Callback server-side com token_hash — evita PKCE quebrar quando o link é
    // aberto em outro navegador (email) ou no app do WhatsApp.
    const callbackLink = tokenHash
      ? `${origemCallback}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=${encodeURIComponent(nextPath)}`
      : null;

    const result = await sendAccessLink({
      to: trimmed,
      telefone: recipient.telefone,
      nome: recipient.nome,
      empresaNome,
      empresaId: colab?.empresa_id ?? null, // gate de tenant-demo
      locale,
      emailLink: callbackLink || actionLink,
      // ⚠️ O WhatsApp NÃO consegue endereçar o painel da plataforma, e mandá-lo
      // assim mesmo seria pior que não mandar: o botão do template aprovado
      // carrega `<slug>~<token_hash>` e o `/entrar` sempre despacha para o
      // SUBDOMÍNIO do slug. O e-mail levaria ao painel e o WhatsApp ao tenant —
      // dois destinos para o mesmo pedido, e o segundo queimando o token de uso
      // único do primeiro. Aqui o canal é pulado com motivo, não silenciosamente.
      whatsappLink: paraPainelPlataforma ? null : callbackLink,
      // Rede de segurança do botão do template quando o host não tem tenant.
      tenantSlug: paraPainelPlataforma ? null : slugDoTenant,
    });

    // NUNCA reportar sucesso se nenhum canal foi realmente enviado (fim do
    // "sucesso silencioso").
    if (!result.anySent) {
      const motivo = [
        result.emailReason && `email: ${result.emailReason}`,
        result.whatsappReason && `whatsapp: ${result.whatsappReason}`,
      ].filter(Boolean).join('; ');
      console.error('[magic-link] nenhum canal enviado:', motivo);
      return NextResponse.json({ error: `Não foi possível enviar o link de acesso.${motivo ? ` (${motivo})` : ''}` });
    }

    return NextResponse.json({ success: true, email: result.email, whatsapp: result.whatsapp });
  } catch (err: any) {
    console.error('[magic-link]', err.message);
    return NextResponse.json({ error: `Erro: ${err.message}` });
  }
}
