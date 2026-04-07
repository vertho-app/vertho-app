'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadCargos(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data, error } = await sb.from('cargos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function salvarTop5(cargoId, top5) {
  const sb = createSupabaseAdmin();
  try {
    const { error } = await sb.from('cargos')
      .update({ top5_workshop: top5 })
      .eq('id', cargoId);

    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Top 5 salvo com sucesso' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
