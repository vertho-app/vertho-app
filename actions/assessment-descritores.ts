'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Carrega assessment de descritores por colaborador de uma empresa.
 * Retorna grid editável: { colabs[], competencias[descritores[]], notas{colabId_descritor: nota} }
 */
export async function loadAssessmentGrid(empresaId: string, competenciaFiltro: string | null = null) {
  try {
    if (!empresaId) return { error: 'empresaId obrigatório' };
    const sb = createSupabaseAdmin();

    const { data: colabs } = await sb.from('colaboradores')
      .select('id, nome_completo, cargo')
      .eq('empresa_id', empresaId)
      .order('nome_completo');

    // Pega competências + descritores: prioriza competencias (empresa), fallback competencias_base
    let compsQuery = sb.from('competencias')
      .select('nome, nome_curto')
      .eq('empresa_id', empresaId)
      .not('nome_curto', 'is', null);
    if (competenciaFiltro) compsQuery = compsQuery.eq('nome', competenciaFiltro);
    const { data: rowsEmp } = await compsQuery;

    let rows = rowsEmp || [];
    if (rows.length === 0) {
      let baseQ = sb.from('competencias_base')
        .select('nome, nome_curto').not('nome_curto', 'is', null);
      if (competenciaFiltro) baseQ = baseQ.eq('nome', competenciaFiltro);
      const { data: base } = await baseQ;
      rows = base || [];
    }

    const byComp: Record<string, Set<string>> = {};
    for (const r of rows) {
      if (!byComp[r.nome]) byComp[r.nome] = new Set();
      byComp[r.nome].add(r.nome_curto);
    }
    const competencias = Object.keys(byComp).sort().map(nome => ({
      nome,
      descritores: [...byComp[nome]].sort() as string[],
    }));

    // Notas existentes
    const { data: notas } = await sb.from('descriptor_assessments')
      .select('colaborador_id, competencia, descritor, nota')
      .eq('empresa_id', empresaId);

    const notasMap: Record<string, any> = {};
    for (const n of (notas || [])) {
      notasMap[`${n.colaborador_id}::${n.competencia}::${n.descritor}`] = n.nota;
    }

    return { success: true, colabs: colabs || [], competencias, notas: notasMap };
  } catch (err) {
    return { error: err?.message };
  }
}

/**
 * Upsert uma nota de assessment.
 */
interface SalvarNotaParams {
  empresaId: string;
  colaboradorId: string;
  competencia: string;
  descritor: string;
  nota: number;
  cargo?: string;
}

export async function salvarNotaAssessment({ empresaId, colaboradorId, competencia, descritor, nota, cargo }: SalvarNotaParams) {
  try {
    const sb = createSupabaseAdmin();
    const { error } = await sb.from('descriptor_assessments').upsert({
      empresa_id: empresaId,
      colaborador_id: colaboradorId,
      cargo,
      competencia,
      descritor,
      nota: Number(nota),
      origem: 'manual',
      assessment_date: new Date().toISOString(),
    }, { onConflict: 'colaborador_id,competencia,descritor' });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}

/**
 * Apaga um assessment (ex: ao limpar uma célula).
 */
export async function deletarNotaAssessment({ colaboradorId, competencia, descritor }: { colaboradorId: string; competencia: string; descritor: string }) {
  try {
    const sb = createSupabaseAdmin();
    const { error } = await sb.from('descriptor_assessments').delete()
      .eq('colaborador_id', colaboradorId)
      .eq('competencia', competencia)
      .eq('descritor', descritor);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message };
  }
}
