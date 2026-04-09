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
  // Tentar com telefone, fallback sem
  const { data: d1, error: e1 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, telefone, mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  if (!e1) return d1 || [];
  const { data: d2 } = await sb.from('colaboradores')
    .select('id, nome_completo, email, cargo, role, area_depto, mapeamento_em')
    .eq('empresa_id', empresaId)
    .order('nome_completo');
  return (d2 || []).map(c => ({ ...c, telefone: null }));
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

// ── Cargos ──────────────────────────────────────────────────────────────────

export async function loadCargos(empresaId) {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('cargos_empresa')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) return [];
  return data || [];
}

export async function salvarCargo(empresaId, cargo) {
  const sb = createSupabaseAdmin();
  const registro = {
    empresa_id: empresaId,
    nome: cargo.nome?.trim(),
    area_depto: cargo.area_depto?.trim() || null,
    descricao: cargo.descricao?.trim() || null,
    principais_entregas: cargo.principais_entregas?.trim() || null,
    contexto_cultural: cargo.contexto_cultural?.trim() || null,
    stakeholders: cargo.stakeholders?.trim() || null,
    decisoes_recorrentes: cargo.decisoes_recorrentes?.trim() || null,
    tensoes_comuns: cargo.tensoes_comuns?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (!registro.nome) return { success: false, error: 'Nome do cargo é obrigatório' };

  let result;
  if (cargo.id) {
    result = await sb.from('cargos_empresa').update(registro).eq('id', cargo.id).select().single();
  } else {
    result = await sb.from('cargos_empresa').insert(registro).select().single();
  }
  if (result.error) return { success: false, error: result.error.message };
  return { success: true, data: result.data };
}

export async function excluirCargo(id) {
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('cargos_empresa').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function sincronizarCargosDeColaboradores(empresaId) {
  const sb = createSupabaseAdmin();
  // Buscar cargos únicos dos colaboradores
  const { data: colabs } = await sb.from('colaboradores')
    .select('cargo, area_depto')
    .eq('empresa_id', empresaId)
    .not('cargo', 'is', null);

  const cargosMap = {};
  (colabs || []).forEach(c => {
    if (c.cargo && !cargosMap[c.cargo]) {
      cargosMap[c.cargo] = c.area_depto || null;
    }
  });

  // Buscar cargos já existentes
  const { data: existentes } = await sb.from('cargos_empresa')
    .select('nome').eq('empresa_id', empresaId);
  const existSet = new Set((existentes || []).map(c => c.nome.toLowerCase()));

  const novos = Object.entries(cargosMap)
    .filter(([nome]) => !existSet.has(nome.toLowerCase()))
    .map(([nome, area]) => ({
      empresa_id: empresaId,
      nome,
      area_depto: area,
    }));

  if (novos.length === 0) return { success: true, message: 'Todos os cargos já estavam cadastrados' };

  const { error } = await sb.from('cargos_empresa').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} cargos sincronizados dos colaboradores` };
}
