'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadAdminDashboard() {
  const sb = createSupabaseAdmin();

  const { data: empresas } = await sb.from('empresas')
    .select('id, nome, segmento, slug, created_at')
    .order('nome');

  if (!empresas) return { empresas: [], totalColabs: 0 };

  const enriched = await Promise.all((empresas || []).map(async emp => {
    const { count } = await sb.from('colaboradores')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', emp.id);
    return { ...emp, totalColab: count || 0 };
  }));

  const totalColabs = enriched.reduce((s, e) => s + e.totalColab, 0);

  return { empresas: enriched, totalColabs };
}
