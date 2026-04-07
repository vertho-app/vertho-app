'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

// ── Load competências da empresa ────────────────────────────────────────────

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

// ── Salvar (criar ou atualizar) competência ─────────────────────────────────

export async function salvarCompetencia(empresaId, comp) {
  const sb = createSupabaseAdmin();
  try {
    const registro = {
      empresa_id: empresaId,
      nome: comp.nome,
      descricao: comp.descricao,
      cargo: comp.cargo,
      peso: comp.peso || 3,
      origem: comp.origem || 'manual',
      ...(comp.gabarito && { gabarito: comp.gabarito }),
    };

    let result;
    if (comp.id) {
      // Atualizar existente
      result = await sb.from('competencias')
        .update(registro)
        .eq('id', comp.id)
        .eq('empresa_id', empresaId)
        .select()
        .single();
    } else {
      // Criar nova
      result = await sb.from('competencias')
        .insert(registro)
        .select()
        .single();
    }

    if (result.error) return { success: false, error: result.error.message };
    return { success: true, data: result.data, message: comp.id ? 'Competência atualizada' : 'Competência criada' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Excluir competência ─────────────────────────────────────────────────────

export async function excluirCompetencia(id) {
  const sb = createSupabaseAdmin();
  try {
    const { error } = await sb.from('competencias').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Competência excluída' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
