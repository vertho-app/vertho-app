'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresa(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('empresas').select('id, nome, segmento').eq('id', empresaId).single();
  return data;
}

export async function loadPPPs(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('ppp_escolas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function excluirPPP(id) {
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('ppp_escolas').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
