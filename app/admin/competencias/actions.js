'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome, segmento').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadCompetencias(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    const { data, error } = await sb.from('competencias')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('cargo')
      .order('nome');

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function loadCompetenciasBase(segmento) {
  const sb = createSupabaseAdmin();
  try {
    let query = sb.from('competencias_base').select('*').order('nome');
    if (segmento) query = query.eq('segmento', segmento);
    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function salvarCompetencia(empresaId, comp) {
  const sb = createSupabaseAdmin();
  try {
    const registro = {
      empresa_id: empresaId,
      nome: comp.nome,
      descricao: comp.descricao || null,
      cargo: comp.cargo || null,
      cod_comp: comp.cod_comp || null,
      pilar: comp.pilar || null,
      peso: comp.peso || 3,
      origem: comp.origem || 'manual',
    };

    let result;
    if (comp.id) {
      result = await sb.from('competencias')
        .update(registro)
        .eq('id', comp.id)
        .eq('empresa_id', empresaId)
        .select().single();
    } else {
      result = await sb.from('competencias')
        .insert(registro)
        .select().single();
    }

    if (result.error) return { success: false, error: result.error.message };
    return { success: true, data: result.data, message: comp.id ? 'Atualizada' : 'Criada' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function excluirCompetencia(id) {
  const sb = createSupabaseAdmin();
  try {
    const { error } = await sb.from('competencias').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Excluida' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function importarCompetenciasCSV(empresaId, comps) {
  const sb = createSupabaseAdmin();
  const { data: existentes } = await sb.from('competencias')
    .select('nome, cargo').eq('empresa_id', empresaId);
  const existSet = new Set((existentes || []).map(c => `${c.nome}||${c.cargo}`.toLowerCase()));

  const novos = comps
    .filter(c => c.nome && !existSet.has(`${c.nome}||${c.cargo || ''}`.toLowerCase()))
    .map(c => ({
      empresa_id: empresaId,
      nome: c.nome.trim(),
      cod_comp: c.cod_comp?.trim() || null,
      pilar: c.pilar?.trim() || null,
      cargo: c.cargo?.trim() || null,
      descricao: c.descricao?.trim() || null,
      origem: 'csv',
    }));

  if (novos.length === 0) return { success: true, message: '0 novas (todas já existiam)' };
  const { error } = await sb.from('competencias').insert(novos);
  if (error) return { success: false, error: error.message };
  return { success: true, message: `${novos.length} competências importadas` };
}

export async function copiarBaseParaEmpresa(empresaId, baseId, cargo = null) {
  const sb = createSupabaseAdmin();
  try {
    const { data: base, error: errBase } = await sb.from('competencias_base')
      .select('*').eq('id', baseId).single();

    if (errBase) return { success: false, error: errBase.message };

    const { error } = await sb.from('competencias').insert({
      empresa_id: empresaId,
      nome: base.nome,
      descricao: base.descricao,
      pilar: base.pilar || null,
      cod_comp: base.cod_comp || null,
      cargo: cargo || base.cargo || null,
      peso: base.peso_padrao || 3,
      origem: 'base',
    });

    if (error) return { success: false, error: error.message };
    return { success: true, message: `"${base.nome}" copiada${cargo ? ` para ${cargo}` : ''}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function loadCargosEmpresa(empresaId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('colaboradores')
    .select('cargo')
    .eq('empresa_id', empresaId)
    .not('cargo', 'is', null);
  return [...new Set((data || []).map(c => c.cargo).filter(Boolean))].sort();
}
