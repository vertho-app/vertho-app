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
    // 1. Tentar cargos_empresa
    // Buscar cargos — tentar com top5_workshop, fallback sem
    let cargosEmpresa = null;
    const { data: ce1, error: err1 } = await sb.from('cargos_empresa')
      .select('id, nome, area_depto, descricao, top5_workshop')
      .eq('empresa_id', empresaId)
      .order('nome');
    if (!err1) {
      cargosEmpresa = ce1;
    } else {
      // Coluna top5_workshop pode não existir
      const { data: ce2 } = await sb.from('cargos_empresa')
        .select('id, nome, area_depto, descricao')
        .eq('empresa_id', empresaId)
        .order('nome');
      cargosEmpresa = ce2;
    }

    // 2. Buscar cargos dos colaboradores (sempre, como fallback)
    const { data: colabs } = await sb.from('colaboradores')
      .select('cargo')
      .eq('empresa_id', empresaId)
      .not('cargo', 'is', null);

    const cargosColab = [...new Set((colabs || []).map(c => c.cargo).filter(Boolean))].sort();

    // 3. Merge: usar cargos_empresa se existir, senão criar do colaborador
    const cargosNomes = cargosEmpresa?.length
      ? [...new Set([...cargosEmpresa.map(c => c.nome), ...cargosColab])].sort()
      : cargosColab;

    if (!cargosNomes.length) return { success: true, data: [] };

    // 4. Para cada cargo, buscar top10
    const cargosEmpMap = Object.fromEntries((cargosEmpresa || []).map(c => [c.nome, c]));
    const result = [];

    for (const nome of cargosNomes) {
      const ce = cargosEmpMap[nome];
      let top10Names = [];

      try {
        const { data: top10 } = await sb.from('top10_cargos')
          .select('*, competencia:competencias(id, nome, cod_comp)')
          .eq('empresa_id', empresaId)
          .eq('cargo', nome)
          .order('posicao');
        top10Names = (top10 || []).map(t => t.competencia?.nome).filter(Boolean);
      } catch {
        // tabela pode não existir ainda
      }

      let top5 = [];
      try { top5 = ce?.top5_workshop || []; } catch { /* coluna pode não existir */ }

      result.push({
        id: ce?.id || nome,
        nome,
        area_depto: ce?.area_depto || null,
        top5_workshop: top5,
        competencias_top10: top10Names,
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
    // Se cargoId é UUID, atualiza cargos_empresa; senão ignora
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
    if (uuidRegex.test(cargoId)) {
      const { error } = await sb.from('cargos_empresa')
        .update({ top5_workshop: top5 })
        .eq('id', cargoId);
      if (error) return { success: false, error: error.message };
    }
    return { success: true, message: 'Top 5 salvo com sucesso' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
