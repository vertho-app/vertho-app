'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';

export async function loadEmpresas() {
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadRelatorios(empresaId: string) {
  const sb = await requireAdminSupabase();
  try {
    const { data, error } = await sb.from('relatorios')
      .select('id, colaborador_id, tipo, created_at, colaboradores(nome_completo)')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'individual')
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
