import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';
import { authLimiter } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Verifica se um email já está cadastrado em `colaboradores` para o tenant
 * atual, e se o tenant aceita auto-cadastro (sys_config.allow_open_signup).
 *
 * Resposta:
 *   { exists: true,  allowSignup: false }  → seguir fluxo magic-link
 *   { exists: false, allowSignup: true  }  → abrir modal de cadastro
 *   { exists: false, allowSignup: false }  → mostrar erro "email não cadastrado"
 *
 * Tenant resolvido pelo header `x-tenant-slug` injetado pelo middleware
 * em subdomínios de tenant (ex: bett.vertho.ai).
 */
/**
 * Empresas em que este e-mail é colaborador — só para a tela de login perguntar
 * "entrar em qual?" quando o pedido não vem de um subdomínio de tenant.
 *
 * Devolve lista VAZIA quando ela tem menos que `minimo` empresas: sem escolha a
 * fazer não há o que perguntar, e uma lista de tamanho 1 revelaria onde a pessoa
 * trabalha sem necessidade nenhuma. O `minimo` é 2 no caso comum e 1 para quem
 * administra a plataforma, que ganha o painel como opção extra na mesma tela.
 * Tenants de demonstração ficam de fora porque o envio real é bloqueado neles
 * (`isTenantDemo`) — seria uma opção que não envia nada.
 */
async function organizacoesDoEmail(
  sb: ReturnType<typeof createSupabaseAdmin>,
  email: string,
  minimo = 2,
): Promise<Array<{ slug: string; nome: string }>> {
  const { data: vinculos, error } = await sb
    .from('colaboradores')
    .select('empresa_id')
    .eq('email', email);
  if (error || !vinculos?.length) return [];

  const ids = [...new Set(vinculos.map((v: any) => v.empresa_id).filter(Boolean))];
  if (!ids.length) return [];

  const { data: empresas } = await sb
    .from('empresas')
    .select('slug, nome, is_demo')
    .in('id', ids)
    .order('nome', { ascending: true });

  const lista = (empresas || [])
    .filter((e: any) => e.slug && !e.is_demo)
    .map((e: any) => ({ slug: e.slug as string, nome: (e.nome as string) || e.slug }));

  // O corte é sobre a lista JÁ FILTRADA, e não sobre a contagem de vínculos: quem
  // tem dois cadastros mas um deles em tenant de demonstração veria uma opção só
  // — que não é escolha nenhuma e ainda revela onde a pessoa trabalha.
  return lista.length >= minimo ? lista : [];
}

/**
 * Este e-mail administra a PLATAFORMA (equipe Vertho)?
 *
 * A régua é deliberadamente a MESMA do `/api/auth/magic-link` (`platform_admins`,
 * e não o fallback `ADMIN_EMAILS`): é aquela rota que decide em que host a sessão
 * nasce quando o destino é o painel. Oferecer aqui uma opção que ela não
 * reconhecesse daria um botão que manda a sessão para o subdomínio de um tenant —
 * o painel continuaria inalcançável, agora com um botão prometendo o contrário.
 */
async function ehAdminDaPlataforma(
  sb: ReturnType<typeof createSupabaseAdmin>,
  email: string,
): Promise<boolean> {
  const { data, error } = await sb.from('platform_admins')
    .select('email').eq('email', email).maybeSingle();
  if (error) {
    // Fail-closed e AUDÍVEL. A falha aqui se disfarça de resposta legítima — a
    // opção do painel simplesmente não aparece, e a tela fica idêntica à de quem
    // não é admin. Sem esta linha, banco fora do ar viraria "a Juliane não é
    // sócia". O e-mail não vai para o log: é PII, e o que importa é que a
    // consulta caiu, não de quem.
    console.error('[check-email] platform_admins indisponível:', error.message);
    return false;
  }
  return !!data;
}

export async function POST(req: NextRequest) {
  // Rate limit por IP — endpoint que revela existência de email (enumeração).
  const limited = await authLimiter.check(req);
  if (limited) return limited;

  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    }

    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();
    const slug = getTenantSlug(req);
    if (!slug) {
      // Sem tenant (endereço genérico `app.vertho.ai` ou apex) não há empresa
      // para verificar — segue o fluxo padrão, e o cliente trata como
      // exists=true (não é aqui que se decide quem existe: dizer "não" no host
      // genérico entregaria enumeração de graça).
      //
      // 🔑 O que MUDA aqui é a pergunta seguinte: em QUAL empresa. Sem
      // subdomínio o link nascia num host sem tenant, e a sessão vinha sem
      // tenant resolvido — o `[authz] email ambíguo (multi-tenant)` dos logs.
      // Devolvendo as organizações do e-mail, a tela de login pergunta em vez
      // de sortear.
      //
      // ⚠️ E a lista de organizações não esgota os destinos possíveis: os 3
      // platform admins têm cadastro de colaborador em 2 a 4 empresas (medido
      // 24/08/2026), então TODOS caem nesta tela — e o painel da plataforma não
      // é uma empresa, logo não aparecia em lugar nenhum. Escolher qualquer
      // organização faz a sessão nascer no subdomínio dela, e do dashboard não
      // há caminho de volta: o painel ficava acessível só por URL digitada.
      //
      // O custo de devolver isto num endpoint público é um bit de enumeração
      // ("este e-mail administra a plataforma"). Ele é aceito porque a própria
      // lista de organizações já é um dado mais sensível que ele, o rate limit
      // por IP vale para os dois, e o acesso continua dependendo do link de uso
      // único — o botão não abre porta nenhuma, só mostra onde ela está.
      const painelPlataforma = await ehAdminDaPlataforma(sb, trimmed);
      return NextResponse.json({
        exists: true,
        allowSignup: false,
        // Com o painel na tela, UMA organização já é uma escolha de verdade
        // ("Bett" ou "Administração Vertho") — por isso o mínimo cai para 1.
        orgs: await organizacoesDoEmail(sb, trimmed, painelPlataforma ? 1 : 2),
        painelPlataforma,
      });
    }

    const { data: empresa } = await sb
      .from('empresas')
      .select('id, sys_config')
      .eq('slug', slug)
      .maybeSingle();

    if (!empresa) {
      return NextResponse.json({ exists: true, allowSignup: false });
    }

    const allowSignup = !!(empresa.sys_config?.allow_open_signup === true);

    const { data: colab } = await sb
      .from('colaboradores')
      .select('id')
      .eq('email', trimmed)
      .eq('empresa_id', empresa.id)
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ exists: !!colab, allowSignup });
  } catch (err: any) {
    console.error('[check-email]', err.message);
    return NextResponse.json({ error: 'Erro ao verificar email' }, { status: 500 });
  }
}
