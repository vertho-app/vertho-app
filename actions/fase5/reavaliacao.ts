'use server';

import { tenantDb } from '@/lib/tenant-db';
import { buscarDescritoresDaCompetencia } from '@/lib/matriz-por-cargo';
import { type AIConfig } from '../ai-client';
import { requireAdminAction } from '@/lib/auth/action-context';

// ══════════════════════════════════════════════════════════════════════════════
// 2. INICIAR REAVALIAÇÃO EM LOTE
// 1 sessão por colaborador. Mesma lógica do PDI (montarTrilhasLote):
//   - Usa competência foco do cargo SE o colab tem gap nela
//   - Senão usa a competência com maior gap (gap = 4 - nivel_ia4)
// ══════════════════════════════════════════════════════════════════════════════

export async function iniciarReavaliacaoLote(empresaId: string, aiConfig: AIConfig = {}) {
  await requireAdminAction('ai.audit.regenerate');
  if (!empresaId) return { success: false, error: 'empresaId obrigatório' };
  const tdb = tenantDb(empresaId);
  try {
    const { data: colaboradores } = await tdb.from('colaboradores')
      .select('id, nome_completo, cargo, email, perfil_dominante, d_natural, i_natural, s_natural, c_natural, perfil_externo_fonte, perfil_externo_dados');
    if (!colaboradores?.length) return { success: false, error: 'Nenhum colaborador encontrado' };

    // Cenários B (chave: competencia_id::cargo)
    const { data: cenariosB } = await tdb.from('banco_cenarios')
      .select('id, competencia_id, cargo').eq('tipo_cenario', 'cenario_b');
    if (!cenariosB?.length) return { success: false, error: 'Nenhum cenário B. Gere cenários B primeiro.' };
    const cenarioMap = {};
    cenariosB.forEach(c => { cenarioMap[`${c.competencia_id}::${c.cargo}`] = c.id; });

    // Respostas iniciais (baseline + cálculo de gap)
    const { data: respostas } = await tdb.from('respostas')
      .select('colaborador_id, competencia_id, nivel_ia4, avaliacao_ia')
      .not('avaliacao_ia', 'is', null);
    if (!respostas?.length) return { success: false, error: 'Nenhuma avaliação IA4 encontrada. Rode IA4 primeiro.' };
    const baselineMap = {};
    (respostas || []).forEach(r => {
      baselineMap[`${r.colaborador_id}::${r.competencia_id}`] = {
        nivel: r.nivel_ia4,
        avaliacao: r.avaliacao_ia,
      };
    });

    // Competência foco por cargo (definida pelo RH)
    const { data: cargosEmpresa } = await tdb.from('cargos_empresa')
      .select('nome, competencia_foco');
    const focoMap = {};
    (cargosEmpresa || []).forEach(c => { if (c.competencia_foco) focoMap[c.nome] = c.competencia_foco; });

    // Competências (parent rows, cod_desc IS NULL)
    const { data: competencias, error: compErr } = await tdb.from('competencias')
      .select('id, nome, cargo, cod_comp')
      .is('cod_desc', null);
    if (compErr) return { success: false, error: `competencias: ${compErr.message}` };
    const compByIdMap = {};
    const compByNomeCargoMap = {};
    (competencias || []).forEach(c => {
      compByIdMap[c.id] = c;
      compByNomeCargoMap[`${c.nome}::${c.cargo}`] = c;
    });

    // Descritores por (cod_comp, cargo) — UMA query agrupada em memória (era 1
    // query por competência, N+1 puro). O cargo entra no filtro E na chave: a
    // mesma matriz pode estar copiada em 2 cargos (lib/matriz-por-cargo).
    const descritoresCache = {};
    const codComps = [...new Set((competencias || []).map(c => c.cod_comp).filter(Boolean))];
    const cargos = [...new Set((competencias || []).map(c => c.cargo).filter(Boolean))];
    const { data: todosDescs, error: descErr } = codComps.length && cargos.length
      ? await tdb.from('competencias')
          .select('cod_comp, cargo, cod_desc, nome_curto, descritor_completo')
          .in('cod_comp', codComps)
          .in('cargo', cargos)
          .not('cod_desc', 'is', null)
      : { data: [], error: null };
    if (descErr) return { success: false, error: `descritores: ${descErr.message}` };
    const descsPorCompCargo = {};
    for (const d of todosDescs || []) {
      const chave = `${d.cod_comp}::${d.cargo}`;
      (descsPorCompCargo[chave] = descsPorCompCargo[chave] || []).push(d);
    }
    for (const comp of competencias || []) {
      // Sem cargo a competência fica fora do `.in('cargo')`: lê as irmãs sem cargo.
      const descs = comp.cargo
        ? descsPorCompCargo[`${comp.cod_comp}::${comp.cargo}`]
        : await buscarDescritoresDaCompetencia(tdb, comp, 'cod_desc, nome_curto, descritor_completo');
      descritoresCache[comp.id] = (descs || []).map((d, i) => ({
        codigo: d.cod_desc || `D${i + 1}`,
        nome: d.nome_curto || d.descritor_completo || `Descritor ${i + 1}`,
      }));
    }

    // Agrupar gaps por colaborador (gap = 4 - nivel)
    const gapsPorColab = {};
    respostas.forEach(r => {
      const comp = compByIdMap[r.competencia_id];
      if (!comp) return;
      if (!gapsPorColab[r.colaborador_id]) gapsPorColab[r.colaborador_id] = [];
      const nivel = r.nivel_ia4 || 0;
      gapsPorColab[r.colaborador_id].push({
        comp,
        nivel,
        gap: 4 - nivel,
      });
    });

    // Trilha progresso (temporada_semana_progresso — schema novo)
    const { data: progressos } = await tdb.from('temporada_semana_progresso')
      .select('colaborador_id, semana, conteudo_consumido');
    const progMap: Record<string, { pct_conclusao: number; semana_atual: number }> = {};
    (progressos || []).forEach(p => {
      const prev = progMap[p.colaborador_id];
      const sem = p.semana || 0;
      if (!prev || sem > prev.semana_atual) {
        progMap[p.colaborador_id] = { semana_atual: sem, pct_conclusao: Math.round((sem / 14) * 100) };
      }
    });

    // Sessões já criadas (dedupe por colab+comp)
    const { data: sessoes } = await tdb.from('reavaliacao_sessoes')
      .select('colaborador_id, competencia_id');
    const jaCriado = new Set((sessoes || []).map(s => `${s.colaborador_id}::${s.competencia_id}`));

    let criados = 0, pulados = 0;
    const motivosPulo = [];

    for (const colab of colaboradores) {
      const gaps = gapsPorColab[colab.id];
      if (!gaps?.length) { pulados++; motivosPulo.push(`${colab.nome_completo}: sem avaliações`); continue; }

      // 1) Tentar competência foco do cargo
      let compAlvo = null;
      const foco = focoMap[colab.cargo];
      if (foco) {
        const compFoco = gaps.find(g => {
          const fL = foco.toLowerCase();
          const cL = g.comp.nome.toLowerCase();
          return cL === fL || cL.includes(fL) || fL.includes(cL);
        });
        if (compFoco && compFoco.gap > 0) compAlvo = compFoco.comp;
      }

      // 2) Senão, maior gap
      if (!compAlvo) {
        const comGap = gaps.filter(g => g.gap > 0).sort((a, b) => b.gap - a.gap);
        if (comGap.length > 0) compAlvo = comGap[0].comp;
      }

      if (!compAlvo) { pulados++; motivosPulo.push(`${colab.nome_completo}: sem gap em nenhuma competência`); continue; }

      // 3) Precisa ter cenário B para essa comp+cargo
      const cenarioBId = cenarioMap[`${compAlvo.id}::${colab.cargo}`];
      if (!cenarioBId) {
        pulados++;
        motivosPulo.push(`${colab.nome_completo}: sem cenário B para "${compAlvo.nome}"`);
        continue;
      }

      // 4) Dedupe
      if (jaCriado.has(`${colab.id}::${compAlvo.id}`)) { pulados++; continue; }

      const baseline = baselineMap[`${colab.id}::${compAlvo.id}`] || null;
      const trilha = progMap[colab.id] || null;

      const avIni = typeof baseline?.avaliacao === 'string' ? JSON.parse(baseline.avaliacao) : baseline?.avaliacao;
      const pontosFortes = avIni?.descritores_destaque?.pontos_fortes || avIni?.pontos_fortes || [];
      const pontosAtencao = avIni?.descritores_destaque?.gaps_prioritarios || avIni?.pontos_desenvolvimento || [];

      const descritores = descritoresCache[compAlvo.id] || [];

      // empresa_id é injetado pelo tdb.insert
      const { error } = await tdb.from('reavaliacao_sessoes').insert({
        colaborador_id: colab.id,
        competencia_id: compAlvo.id,
        cenario_b_id: cenarioBId,
        baseline_nivel: baseline?.nivel || null,
        baseline_avaliacao: baseline?.avaliacao || null,
        status: 'pendente',
        historico: [],
        turno: 0,
        extracao_qualitativa: {
          _contexto_sessao: {
            pontos_fortes: pontosFortes,
            pontos_atencao: pontosAtencao,
            descritores: descritores,
            disc: { perfil: colab.perfil_dominante, D: colab.d_natural, I: colab.i_natural, S: colab.s_natural, C: colab.c_natural },
            trilha: trilha ? { pct: trilha.pct_conclusao, semana: trilha.semana_atual } : null,
          },
        },
      });

      if (error) {
        console.error('[reavaliacao_sessoes insert]', error.message);
        pulados++;
      } else {
        criados++;
      }
    }

    let msg = `${criados} sessões criadas (1 por colaborador)`;
    if (pulados > 0) msg += ` | ${pulados} pulados`;
    if (motivosPulo.length) console.log('[iniciarReavaliacao] motivos:', motivosPulo);
    return { success: true, message: msg };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
