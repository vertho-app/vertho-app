'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';

export async function loadEmpresa(empresaId) {
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('empresas').select('id, nome, segmento').eq('id', empresaId).single();
  return data;
}

export async function loadPPPs(empresaId) {
  const sb = await requireAdminSupabase();
  const { data } = await sb.from('ppp_escolas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function excluirPPP(id) {
  const sb = await requireAdminSupabase();
  const { error } = await sb.from('ppp_escolas').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
