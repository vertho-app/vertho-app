'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadRelatorios(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data, error } = await sb.from('relatorios')
      .select('id, colaborador_id, tipo, created_at, colaboradores(nome_completo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual')
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
