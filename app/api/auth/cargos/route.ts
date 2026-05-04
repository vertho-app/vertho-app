import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { getTenantSlug } from '@/lib/tenant-resolver';

export const dynamic = 'force-dynamic';

/**
 * Lista cargos cadastrados no `cargos_empresa` para o tenant atual.
 * Usado no modal de auto-cadastro pra restringir o campo Cargo a valores
 * pré-aprovados (em vez de free-text).
 *
 * Tenant resolvido pelo header `x-tenant-slug` injetado pelo middleware.
 * Sem auth — endpoint público leve, retorna apenas { id, nome } ordenado.
 */
export async function GET(req: NextRequest) {
  try {
    const slug = getTenantSlug(req);
    if (!slug) return NextResponse.json({ cargos: [] });

    const sb = createSupabaseAdmin();
    const { data: empresa } = await sb
      .from('empresas')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (!empresa) return NextResponse.json({ cargos: [] });

    const { data } = await sb
      .from('cargos_empresa')
      .select('id, nome')
      .eq('empresa_id', empresa.id)
      .order('nome');

    return NextResponse.json({ cargos: data || [] });
  } catch (err: any) {
    console.error('[cargos]', err.message);
    return NextResponse.json({ cargos: [] });
  }
}
