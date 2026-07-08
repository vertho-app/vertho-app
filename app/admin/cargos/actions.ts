'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { focoDoCargo, MAX_FOCO } from '@/lib/foco-cargo';

export async function loadEmpresas() {
  const sb = await requireAdminSupabase();
  const { data, error } = await sb.from('empresas').select('id, nome').order('nome');
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function loadCargos(empresaId: string) {
  const sb = await requireAdminSupabase();
  try {
    // 1. cargos_empresa (com top5 quando coluna existe)
    let cargosEmpresa: any[] | null = null;
    const { data: ce1, error: err1 } = await sb.from('cargos_empresa')
      .select('id, nome, area_depto, descricao, top5_workshop, eh_lideranca, competencia_foco, competencias_foco')
      .eq('empresa_id', empresaId)
      .order('nome');
    if (!err1) {
      cargosEmpresa = ce1;
    } else {
      const { data: ce2 } = await sb.from('cargos_empresa')
        .select('id, nome, area_depto, descricao')
        .eq('empresa_id', empresaId)
        .order('nome');
      cargosEmpresa = ce2;
    }

    // 2. Cargos distintos em colaboradores
    const { data: colabs } = await sb.from('colaboradores')
      .select('cargo')
      .eq('empresa_id', empresaId)
      .not('cargo', 'is', null);
    const cargosColab = [...new Set((colabs || []).map((c: any) => c.cargo).filter(Boolean))].sort();

    // 3. Cargos com top10 — pode haver cargos "órfãos" (a IA1 às vezes
    // normaliza/abrevia nomes ex: "Consultor" no lugar de "Rare Diseases
    // Demand Sr Consultant"). Pegamos todos pra exibir na UI.
    let top10Rows: any[] = [];
    try {
      const { data: t10 } = await sb.from('top10_cargos')
        .select('cargo, posicao, competencia_id, competencia:competencias(id, nome, cod_comp)')
        .eq('empresa_id', empresaId)
        .order('cargo')
        .order('posicao');
      top10Rows = t10 || [];
    } catch {
      // tabela pode não existir ainda
    }
    const cargosTop10 = [...new Set(top10Rows.map((t: any) => t.cargo).filter(Boolean))];
    const top10ByCargo = new Map<string, string[]>();
    for (const t of top10Rows) {
      const nome = t.competencia?.nome;
      if (!nome) continue;
      if (!top10ByCargo.has(t.cargo)) top10ByCargo.set(t.cargo, []);
      top10ByCargo.get(t.cargo)!.push(nome);
    }

    // 3b. Competências VOTADAS por cargo (votacao_competencias). O workshop deve
    // permitir selecionar também as escolhidas na votação que NÃO ficaram na Top
    // 10 da IA — senão ficam inacessíveis (bug reportado).
    const votadasByCargo = new Map<string, Set<string>>();
    try {
      const { data: votos } = await (sb.from('votacao_competencias') as any)
        .select('cargo, competencias_escolhidas')
        .eq('empresa_id', empresaId);
      for (const v of (votos || [])) {
        if (!v.cargo) continue;
        const arr = Array.isArray(v.competencias_escolhidas) ? v.competencias_escolhidas : [];
        if (!votadasByCargo.has(v.cargo)) votadasByCargo.set(v.cargo, new Set());
        const set = votadasByCargo.get(v.cargo)!;
        for (const nm of arr) if (nm) set.add(String(nm));
      }
    } catch { /* tabela pode não existir ainda */ }

    // 4. Merge: união de todas as fontes
    const cargosNomes = [
      ...new Set([
        ...(cargosEmpresa || []).map((c: any) => c.nome),
        ...cargosColab,
        ...cargosTop10,
      ].filter(Boolean)),
    ].sort();

    if (!cargosNomes.length) return { success: true, data: [] };

    const cargosEmpMap = Object.fromEntries((cargosEmpresa || []).map((c: any) => [c.nome, c]));
    const result: any[] = [];

    for (const nome of cargosNomes) {
      const ce = cargosEmpMap[nome];
      const isOrfao = !ce && !cargosColab.includes(nome) && cargosTop10.includes(nome);
      const semColabs = !ce && !cargosColab.includes(nome);
      const top10Names = top10ByCargo.get(nome) || [];
      const top10Set = new Set(top10Names);
      const competencias_votadas_extra = [...(votadasByCargo.get(nome) || [])]
        .filter((v) => !top10Set.has(v)).sort();

      result.push({
        id: ce?.id || nome,
        nome,
        area_depto: ce?.area_depto || null,
        eh_lideranca: ce?.eh_lideranca !== false,
        top5_workshop: ce?.top5_workshop || [],
        competencias_foco: focoDoCargo(ce),
        competencias_top10: top10Names,
        competencias_votadas_extra,
        // Flags pra UI: cargo órfão = só existe em top10_cargos (IA gerou
        // nome diferente do oficial). Admin pode "vincular" a um nome
        // válido de cargos_empresa via renomearTop10Cargo.
        is_orfao: isOrfao,
        sem_colaboradores: semColabs,
      });
    }

    return { success: true, data: result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Renomeia o `cargo` em todas as linhas de top10_cargos da empresa —
 * útil quando a IA1 gerou um nome normalizado/abreviado e queremos vincular
 * ao cargo oficial em cargos_empresa.
 */
export async function renomearTop10Cargo(empresaId: string, deNome: string, paraNome: string) {
  const sb = await requireAdminSupabase('companies.manage');
  if (!deNome || !paraNome) return { success: false, error: 'Nomes obrigatórios' };
  if (deNome === paraNome) return { success: true, message: 'Sem alteração' };
  try {
    const { error } = await sb.from('top10_cargos')
      .update({ cargo: paraNome })
      .eq('empresa_id', empresaId)
      .eq('cargo', deNome);
    if (error) return { success: false, error: error.message };
    return { success: true, message: `Top 10 vinculado: "${deNome}" → "${paraNome}"` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function salvarTop5(cargoId: string, top5: any) {
  const sb = await requireAdminSupabase('companies.manage');
  try {
    // Se cargoId é UUID, atualiza cargos_empresa; senão ignora
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
    if (uuidRegex.test(cargoId)) {
      // Predicado de tenant explícito: mutação restrita ao tenant da linha lida
      const { data: cargoLinha } = await sb.from('cargos_empresa').select('empresa_id').eq('id', cargoId).maybeSingle();
      if (!cargoLinha) return { success: false, error: 'Cargo não encontrado' };
      const { error } = await sb.from('cargos_empresa')
        .update({ top5_workshop: top5 })
        .eq('id', cargoId)
        .eq('empresa_id', cargoLinha.empresa_id);
      if (error) return { success: false, error: error.message };
    }
    return { success: true, message: 'Top 5 salvo com sucesso' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Salva as competências FOCO do cargo (máx. 2 — a trilha padrão é DUO). Fonte
 * única que PDI e trilha leem (ver lib/foco-cargo). Escreve `competencias_foco`
 * (array) + `competencia_foco` (1ª, backward-compat).
 */
export async function salvarCompetenciasFoco(cargoId: string, foco: string[]) {
  const sb = await requireAdminSupabase('companies.manage');
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
    if (!uuidRegex.test(cargoId)) return { success: false, error: 'Cargo precisa estar em cargos_empresa' };
    const limpa = [...new Set((Array.isArray(foco) ? foco : []).map((s) => (s || '').toString().trim()).filter(Boolean))].slice(0, MAX_FOCO);
    // Predicado de tenant explícito: mutação restrita ao tenant da linha lida
    const { data: cargoLinha } = await sb.from('cargos_empresa').select('empresa_id').eq('id', cargoId).maybeSingle();
    if (!cargoLinha) return { success: false, error: 'Cargo não encontrado' };
    const { error } = await sb.from('cargos_empresa')
      .update({ competencias_foco: limpa, competencia_foco: limpa[0] || null })
      .eq('id', cargoId)
      .eq('empresa_id', cargoLinha.empresa_id);
    if (error) return { success: false, error: error.message };
    return { success: true, message: 'Competências foco salvas' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function salvarEhLideranca(cargoId: string, ehLideranca: boolean) {
  const sb = await requireAdminSupabase('companies.manage');
  try {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
    if (!uuidRegex.test(cargoId)) return { success: false, error: 'Cargo precisa estar em cargos_empresa' };
    const { data: cargo } = await sb.from('cargos_empresa')
      .select('nome, empresa_id').eq('id', cargoId).maybeSingle();
    const { error } = await sb.from('cargos_empresa')
      .update({ eh_lideranca: !!ehLideranca })
      .eq('id', cargoId);
    if (error) return { success: false, error: error.message };

    // Invalida fits existentes desse cargo (vão ser recalculados sob nova regra)
    if (cargo) {
      await sb.from('fit_resultados').delete()
        .eq('empresa_id', cargo.empresa_id).eq('cargo', cargo.nome);
    }
    return { success: true, message: 'Salvo · fits recalcular pendente' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
