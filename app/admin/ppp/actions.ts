'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';

export async function loadEmpresa(empresaId) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('empresas').select('id, nome, segmento').eq('id', empresaId).single();
  return data;
}

export async function loadPPPs(empresaId) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('ppp_escolas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function excluirPPP(id) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('ppp_escolas').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
