'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  return data || [];
}

export async function loadResumoEmpresa(empresaId) {
  const sb = createSupabaseAdmin();
  const { count: colabs } = await sb.from('colaboradores')
    .select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId);
  const { data: comps } = await sb.from('competencias')
    .select('cod_comp').eq('empresa_id', empresaId);
  return { colabs: colabs || 0, competencias: comps?.length || 0 };
}

export async function importarColaboradoresLote(empresaId, colabs) {
  const sb = createSupabaseAdmin();
  const { data: existentes } = await sb.from('colaboradores')
    .select('email').eq('empresa_id', empresaId);
  const emailsExistentes = new Set((existentes || []).map(c => c.email.toLowerCase()));

  const VALID_ROLES = ['colaborador', 'gestor', 'rh'];

  const novos = colabs
    .filter(c => c.email && !emailsExistentes.has(c.email.toLowerCase()))
    .map(c => ({
      empresa_id: empresaId,
      nome_completo: c.nome?.trim() || null,
      email: c.email.trim().toLowerCase(),
      cargo: c.cargo?.trim() || null,
      role: VALID_ROLES.includes(c.role?.trim()?.toLowerCase()) ? c.role.trim().toLowerCase() : 'colaborador',
    }));

  if (novos.length === 0) return { success: true, message: '0 novos (todos já existiam)' };

  const { error } = await sb.from('colaboradores').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} colaboradores importados` };
}

export async function loadColaboradores(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, perfil_dominante, mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return data || [];
}

export async function atualizarColaborador(id, campos) {
  const sb = createSupabaseAdmin();
  const VALID_ROLES = ['colaborador', 'gestor', 'rh'];
  const update = {};
  if (campos.nome_completo !== undefined) update.nome_completo = campos.nome_completo?.trim() || null;
  if (campos.email !== undefined) update.email = campos.email?.trim().toLowerCase() || null;
  if (campos.cargo !== undefined) update.cargo = campos.cargo?.trim() || null;
  if (campos.area_depto !== undefined) update.area_depto = campos.area_depto?.trim() || null;
  if (campos.role !== undefined && VALID_ROLES.includes(campos.role)) update.role = campos.role;

  const { error } = await sb.from('colaboradores').update(update).eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function excluirColaborador(id) {
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('colaboradores').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
