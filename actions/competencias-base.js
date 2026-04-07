'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

// ── Load competências base (globais, por segmento) ──────────────────────────

export async function loadCompetenciasBase(segmento) {
  const sb = createSupabaseAdmin();
  try {
    let query = sb.from('competencias_base').select('*').order('nome');
    if (segmento) {
      query = query.eq('segmento', segmento);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Salvar competência base ─────────────────────────────────────────────────

export async function salvarCompetenciaBase(comp) {
  const sb = createSupabaseAdmin();
  try {
    const registro = {
      nome: comp.nome,
      descricao: comp.descricao,
      segmento: comp.segmento || null,
      categoria: comp.categoria || null,
      peso_padrao: comp.peso_padrao || 3,
    };

    let result;
    if (comp.id) {
      result = await sb.from('competencias_base')
        .update(registro)
        .eq('id', comp.id)
        .select()
        .single();
    } else {
      result = await sb.from('competencias_base')
        .insert(registro)
        .select()
        .single();
    }

    if (result.error) return { success: false, error: result.error.message };
    return { success: true, data: result.data, message: comp.id ? 'Competência base atualizada' : 'Competência base criada' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Excluir competência base ────────────────────────────────────────────────

export async function excluirCompetenciaBase(id) {
  const sb = createSupabaseAdmin();
  try {
    const { error } = await sb.from('competencias_base').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Competência base excluída' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
