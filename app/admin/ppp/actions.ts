'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requirePermissionAction, assertTenantAccessAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';

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
  // Gate TENANT-SCOPED (auditoria 23/07): o payload não traz empresaId — o
  // tenant é derivado da LINHA (lê, prova posse, apaga).
  const ctx = await requirePermissionAction('content.manage');
  const sb = createSupabaseAdmin();
  const { data: linha } = await sb.from('ppp_escolas').select('empresa_id').eq('id', id).maybeSingle();
  if (!linha) return { success: false, error: 'PPP não encontrado' };
  await assertTenantAccessAction(ctx, linha.empresa_id);
  const { error } = await sb.from('ppp_escolas').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
