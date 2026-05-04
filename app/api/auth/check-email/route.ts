import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';

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
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email obrigatório' }, { status: 400 });
    }

    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
    }

    const slug = getTenantSlug(req);
    if (!slug) {
      // Sem tenant — não há como verificar; segue fluxo padrão (magic-link
      // tradicional decide depois). Cliente trata como exists=true.
      return NextResponse.json({ exists: true, allowSignup: false });
    }

    const sb = createSupabaseAdmin();
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
