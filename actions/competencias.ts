'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';

// ── Load competências da empresa ────────────────────────────────────────────

export async function loadCompetencias(empresaId: string) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  try {
    const tdb = tenantDb(empresaId);
    const { data, error } = await tdb.from('competencias')
      .select('*')
      .order('cargo')
      .order('nome');

    if (error) return { success: false, error: error.message };
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── Salvar (criar ou atualizar) competência ─────────────────────────────────

export async function salvarCompetencia(empresaId: string, comp: any) {
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  try {
    const tdb = tenantDb(empresaId);
    // empresa_id é injetado pelo tdb.insert/update
    const registro = {
      nome: comp.nome,
      descricao: comp.descricao,
      cargo: comp.cargo,
      peso: comp.peso || 3,
      origem: comp.origem || 'manual',
      ...(comp.gabarito && { gabarito: comp.gabarito }),
    };

    let result;
    if (comp.id) {
      result = await tdb.from('competencias')
        .update(registro)
        .eq('id', comp.id)
        .select()
        .single();
    } else {
      result = await tdb.from('competencias')
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

export async function excluirCompetencia(id: string) {
  // Não recebe empresaId — descobre via raw + valida tenant pra defesa em profundidade.
  try {
    const sbRaw = createSupabaseAdmin();
    const { data: row } = await sbRaw.from('competencias').select('empresa_id').eq('id', id).maybeSingle();
    if (!row) return { success: false, error: 'Não encontrada' };
    const tdb = tenantDb(row.empresa_id);
    const { error } = await tdb.from('competencias').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Competência excluída' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
