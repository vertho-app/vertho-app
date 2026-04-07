'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadPPPs(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data, error } = await sb.from('ppp_escolas')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
