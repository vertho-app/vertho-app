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
 * Devolve lista VAZIA quando há 0 ou 1 empresa: com uma só não há o que
 * perguntar, e a lista de tamanho 1 revelaria onde a pessoa trabalha sem
 * necessidade nenhuma. Tenants de demonstração ficam de fora porque o envio
 * real é bloqueado neles (`isTenantDemo`) — seria uma opção que não envia nada.
 */
async function organizacoesDoEmail(
  sb: ReturnType<typeof createSupabaseAdmin>,
  email: string,
): Promise<Array<{ slug: string; nome: string }>> {
  const { data: vinculos, error } = await sb
    .from('colaboradores')
    .select('empresa_id')
    .eq('email', email);
  if (error || !vinculos?.length) return [];

  const ids = [...new Set(vinculos.map((v: any) => v.empresa_id).filter(Boolean))];
  if (ids.length < 2) return [];

  const { data: empresas } = await sb
    .from('empresas')
    .select('slug, nome, is_demo')
    .in('id', ids)
    .order('nome', { ascending: true });

  return (empresas || [])
    .filter((e: any) => e.slug && !e.is_demo)
    .map((e: any) => ({ slug: e.slug as string, nome: (e.nome as string) || e.slug }));
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
      return NextResponse.json({
        exists: true,
        allowSignup: false,
        orgs: await organizacoesDoEmail(sb, trimmed),
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
