'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

export async function loadEmpresas() {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadCargos(empresaId) {
  const sb = createSupabaseAdmin();
  try {
    // Buscar cargos da tabela cargos_empresa
    const { data: cargosEmpresa } = await sb.from('cargos_empresa')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nome');

    if (cargosEmpresa?.length) {
      // Para cada cargo, buscar top10 selecionadas
      const result = [];
      for (const c of cargosEmpresa) {
        const { data: top10 } = await sb.from('top10_cargos')
          .select('*, competencia:competencias(id, nome, cod_comp)')
          .eq('empresa_id', empresaId)
          .eq('cargo', c.nome)
          .order('posicao');
        result.push({
          ...c,
          competencias_top10: (top10 || []).map(t => t.competencia?.nome).filter(Boolean),
        });
      }
      return { success: true, data: result };
    }

    // Fallback: cargos dos colaboradores
    const { data: colabs } = await sb.from('colaboradores')
      .select('cargo')
      .eq('empresa_id', empresaId)
      .not('cargo', 'is', null);

    const cargosUnicos = [...new Set((colabs || []).map(c => c.cargo).filter(Boolean))].sort();
    const result = [];
    for (const nome of cargosUnicos) {
      const { data: top10 } = await sb.from('top10_cargos')
        .select('*, competencia:competencias(id, nome, cod_comp)')
        .eq('empresa_id', empresaId)
        .eq('cargo', nome)
        .order('posicao');
      result.push({
        id: nome, // usar nome como ID temporário
        nome,
        competencias_top10: (top10 || []).map(t => t.competencia?.nome).filter(Boolean),
      });
    }
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function salvarTop5(cargoId, top5) {
  const sb = createSupabaseAdmin();
  try {
    const { error } = await sb.from('cargos_empresa')
      .update({ top5_workshop: top5 })
      .eq('id', cargoId);

    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Top 5 salvo com sucesso' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
