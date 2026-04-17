'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';

/**
 * Lista auditorias da semana 14 de todas as empresas.
 * Só platform admin Vertho acessa.
 *
 * @param {string} email do usuário autenticado
 * @param {Object} filtros { status: 'todos'|'aprovado'|'revisar', empresaId?, limit? }
 */
export async function listarAuditoriasSem14(filtros: any = {}) {
  await requireAdminAction();

  const sb = createSupabaseAdmin();
  const limit = filtros.limit || 50;

  // Sem 14 concluída + com auditoria preenchida
  let q = sb.from('temporada_semana_progresso')
    .select(`
      id, trilha_id, colaborador_id, empresa_id, semana, status,
      concluido_em, feedback,
      colaboradores!inner(nome_completo, cargo, email),
      empresas!inner(nome),
      trilhas!inner(competencia_foco, numero_temporada)
    `)
    .eq('semana', 14)
    .eq('status', 'concluido')
    .not('feedback', 'is', null)
    .order('concluido_em', { ascending: false })
    .limit(limit);

  if (filtros.empresaId) q = q.eq('empresa_id', filtros.empresaId);

  const { data, error } = await q;
  if (error) return { error: error.message };

  // Filtra client-side pelo status da auditoria (JSONB não é trivial no Supabase filter)
  const rows = (data || []).map((r: any) => {
    const fb = r.feedback || {};
    const auditoria = fb.auditoria || null;
    return {
      id: r.id,
      trilhaId: r.trilha_id,
      colaborador: r.colaboradores?.nome_completo,
      cargo: r.colaboradores?.cargo,
      email: r.colaboradores?.email,
      empresa: r.empresas?.nome,
      empresaId: r.empresa_id,
      competencia: r.trilhas?.competencia_foco,
      temporada: r.trilhas?.numero_temporada,
      concluidoEm: r.concluido_em,
      notaMediaPre: fb.nota_media_pre || null,
      notaMediaPos: fb.nota_media_pos || null,
      deltaMedio: fb.delta_medio || null,
      auditoriaNota: auditoria?.nota_auditoria ?? null,
      auditoriaStatus: auditoria?.status || 'sem_auditoria',
      auditoriaAlertas: auditoria?.alertas || [],
      auditoriaResumo: auditoria?.resumo_auditoria || null,
      ajustesSugeridos: auditoria?.ajustes_sugeridos || [],
    };
  });

  const filtered = filtros.status && filtros.status !== 'todos'
    ? rows.filter(r => r.auditoriaStatus === filtros.status)
    : rows;

  const resumo = {
    total: rows.length,
    aprovado: rows.filter(r => r.auditoriaStatus === 'aprovado').length,
    revisar: rows.filter(r => r.auditoriaStatus === 'revisar').length,
    semAuditoria: rows.filter(r => r.auditoriaStatus === 'sem_auditoria').length,
  };

  return { ok: true, rows: filtered, resumo };
}

/**
 * Retorna detalhe completo de uma auditoria — avaliação primária + auditoria
 * lado a lado pra review manual da Vertho.
 */
/**
 * Regera o scoring da sem 14 injetando o feedback da auditoria anterior
 * no prompt do scorer — a IA corrige com base nos alertas.
 * Depois roda check de novo.
 */
export async function regerarScoringComFeedback(progressoId) {
  await requireAdminAction();

  const sb = createSupabaseAdmin();
  const { data: prog } = await sb.from('temporada_semana_progresso')
    .select('id, trilha_id, empresa_id, colaborador_id, feedback')
    .eq('id', progressoId).maybeSingle();
  if (!prog) return { error: 'Registro não encontrado' };

  const fb = prog.feedback || {};
  const auditoriaAnterior = fb.auditoria;
  if (!auditoriaAnterior) return { error: 'Sem auditoria anterior pra usar como feedback' };

  const { data: trilha } = await sb.from('trilhas')
    .select('id, empresa_id, colaborador_id, competencia_foco, descritores_selecionados')
    .eq('id', prog.trilha_id).maybeSingle();
  if (!trilha) return { error: 'Trilha não encontrada' };

  const { data: colab } = await sb.from('colaboradores')
    .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();

  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  const { callAI } = await import('@/actions/ai-client');

  // Enriquece com régua + nota_pre fresh (reusa helpers do evaluation route)
  const nomes = descritores.map(d => d.descritor);
  let { data: regRows } = await sb.from('competencias')
    .select('nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
    .eq('empresa_id', trilha.empresa_id).eq('nome', trilha.competencia_foco)
    .in('nome_curto', nomes);
  if (!regRows?.length) {
    const { data: base } = await sb.from('competencias_base')
      .select('nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
      .eq('nome', trilha.competencia_foco).in('nome_curto', nomes);
    regRows = base || [];
  }
  const regMap = Object.fromEntries(regRows.map(r => [r.nome_curto, r]));
  const { data: assRows } = await sb.from('descriptor_assessments')
    .select('descritor, nota').eq('colaborador_id', trilha.colaborador_id)
    .eq('competencia', trilha.competencia_foco).in('descritor', nomes);
  const notaMap = Object.fromEntries((assRows || []).map(a => [a.descritor, Number(a.nota)]));
  const descritoresEnriquecidos = descritores.map(d => ({
    ...d, ...(regMap[d.descritor] || {}),
    nota_atual: notaMap[d.descritor] != null ? notaMap[d.descritor] : d.nota_atual,
  }));

  // Acumulada + evidências
  const { data: prog13 } = await sb.from('temporada_semana_progresso')
    .select('feedback').eq('trilha_id', trilha.id).eq('semana', 13).maybeSingle();
  const acumuladoPrimaria = prog13?.feedback?.acumulado?.primaria || null;

  // Monta feedback da auditoria anterior como instrução extra pro scorer
  const feedbackAuditoria = [
    `A avaliação anterior recebeu nota ${auditoriaAnterior.nota_auditoria}/100 da auditoria.`,
    auditoriaAnterior.resumo_auditoria && `Resumo: ${auditoriaAnterior.resumo_auditoria}`,
    ...(auditoriaAnterior.alertas || []).map(a =>
      typeof a === 'string' ? `Alerta: ${a}` : `Alerta [${a.descritor || a.tipo || ''}]: ${a.descricao || a.detalhe || ''}`
    ),
    ...(auditoriaAnterior.ajustes_sugeridos || []).map(a =>
      `Ajuste sugerido [${a.descritor}]: nota ${a.nota_pos_sugerida} — ${a.motivo}`
    ),
  ].filter(Boolean).join('\n');

  const { promptEvolutionScenarioScore, validateEvolutionScenarioScore } = await import('@/lib/season-engine/prompts/evolution-scenario');
  const { promptEvolutionScenarioCheck } = await import('@/lib/season-engine/prompts/evolution-scenario-check');

  // Agrega evidências das 13 sems (era '' antes — root cause do "EVIDÊNCIAS AUSENTES")
  const { data: progs } = await sb.from('temporada_semana_progresso')
    .select('semana, tipo, reflexao, feedback')
    .eq('trilha_id', trilha.id).lte('semana', 13).order('semana');
  const plano = trilha.descritores_selecionados; // fallback — plano completo seria melhor
  const { data: planRow } = await sb.from('trilhas').select('temporada_plano').eq('id', trilha.id).maybeSingle();
  const planoArr = Array.isArray(planRow?.temporada_plano) ? planRow.temporada_plano : [];
  const descPorSem = Object.fromEntries(planoArr.map(s => [s.semana, s.descritor]));
  const cobPorSem = Object.fromEntries(planoArr.map(s => [s.semana, s.descritores_cobertos || []]));
  const linhas = Object.fromEntries(nomes.map(n => [n, []]));
  for (const p of (progs || [])) {
    const r = p.reflexao || {};
    const f = p.feedback || {};
    if (p.tipo === 'conteudo' && r.insight_principal) {
      const d = descPorSem[p.semana];
      if (d && linhas[d]) linhas[d].push(`Sem ${p.semana} | insight: "${r.insight_principal}" | desafio: ${r.desafio_realizado || '?'} | qualidade: ${r.qualidade_reflexao || '?'}`);
    }
    if (p.tipo === 'aplicacao' && f) {
      for (const d of (cobPorSem[p.semana] || [])) {
        if (!linhas[d]) continue;
        const aval = (f.avaliacao_por_descritor || []).find(a => a.descritor === d);
        if (aval) linhas[d].push(`Sem ${p.semana} (${f.modo || 'cenario'}) | nota: ${aval.nota} | obs: "${aval.observacao || ''}"`);
      }
    }
    if (p.semana === 13 && r.evolucao_percebida) {
      for (const ev of r.evolucao_percebida) {
        if (linhas[ev.descritor]) linhas[ev.descritor].push(`Sem 13 | antes: "${ev.antes || ''}" | depois: "${ev.depois || ''}" | nivel: ${ev.nivel_percebido ?? '?'}`);
      }
    }
  }
  const evidenciasAcumuladas = nomes.map(n =>
    `### ${n}\n` + (linhas[n].length ? '- ' + linhas[n].join('\n- ') : '(sem evidência)')
  ).join('\n\n');

  const nomeColab = (colab?.nome_completo || '').split(' ')[0];

  // Scorer com feedback injetado
  const { system, user } = promptEvolutionScenarioScore({
    competencia: trilha.competencia_foco,
    descritores: descritoresEnriquecidos,
    cenario: fb.cenario,
    resposta: fb.cenario_resposta,
    nomeColab,
    perfilDominante: colab?.perfil_dominante,
    evidenciasAcumuladas,
    acumuladoPrimaria,
  });

  const systemComFeedback = system +
    `\n\nATENÇÃO: O nome do colaborador é "${nomeColab}". NÃO use nomes de personagens do cenário (Marcelo, Henrique, etc.) no resumo_avaliacao — use SOMENTE "${nomeColab}".` +
    `\n\n## FEEDBACK DA AUDITORIA ANTERIOR (CORRIJA OS PROBLEMAS ABAIXO):\n${feedbackAuditoria}`;

  let parsed = {};
  try {
    const r = await callAI(systemComFeedback, user, {}, 10000);
    let cleaned14 = r.trim();
    if (cleaned14.startsWith('```')) cleaned14 = cleaned14.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
    parsed = validateEvolutionScenarioScore(JSON.parse(cleaned14));
  } catch (e) {
    return { error: 'Scorer falhou: ' + e.message };
  }

  // Check novo
  let auditoria = null;
  try {
    const { system: sC, user: uC } = promptEvolutionScenarioCheck({
      competencia: trilha.competencia_foco,
      descritores: descritoresEnriquecidos,
      cenario: fb.cenario,
      resposta: fb.cenario_resposta,
      avaliacaoPrimaria: parsed,
      evidenciasAcumuladas,
    });
    const rC = await callAI(sC, uC, {}, 8000);
    auditoria = JSON.parse(rC.replace(/```json\n?|```\n?/g, '').trim());
  } catch (e) {
    console.warn('[regerar check]', e.message);
  }

  // Salva
  const novoFb = {
    ...fb, ...parsed,
    auditoria,
    auditoria_anterior: auditoriaAnterior,
    regerado_com_feedback: true,
    regerado_em: new Date().toISOString(),
  };
  await sb.from('temporada_semana_progresso').update({ feedback: novoFb }).eq('id', prog.id);

  // Regenera Evolution Report
  try {
    const { gerarEvolutionReport } = await import('@/actions/evolution-report');
    await gerarEvolutionReport(prog.trilha_id);
  } catch (e) { console.warn('[regerar ER]', e.message); }

  return { ok: true, novaNota: auditoria?.nota_auditoria, novoStatus: auditoria?.status };
}

export async function loadAuditoriaSem14Detalhe(progressoId) {
  await requireAdminAction();

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('temporada_semana_progresso')
    .select(`
      id, trilha_id, semana, concluido_em, feedback,
      colaboradores!inner(nome_completo, cargo, perfil_dominante),
      empresas!inner(nome),
      trilhas!inner(competencia_foco, descritores_selecionados)
    `)
    .eq('id', progressoId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'Registro não encontrado' };
  const d: any = data;

  // Busca progresso da sem 13 pra acumulada
  const { data: fb13 } = await sb.from('temporada_semana_progresso')
    .select('feedback').eq('trilha_id', d.trilha_id).eq('semana', 13).maybeSingle();

  const fb = d.feedback || {};
  return {
    ok: true,
    detalhe: {
      colaborador: d.colaboradores?.nome_completo,
      cargo: d.colaboradores?.cargo,
      perfilDominante: d.colaboradores?.perfil_dominante,
      empresa: d.empresas?.nome,
      competencia: d.trilhas?.competencia_foco,
      concluidoEm: d.concluido_em,
      cenario: fb.cenario,
      resposta: fb.cenario_resposta,
      avaliacaoPrimaria: {
        avaliacao_por_descritor: fb.avaliacao_por_descritor,
        nota_media_pre: fb.nota_media_pre,
        nota_media_cenario: fb.nota_media_cenario || null,
        nota_media_pos: fb.nota_media_pos,
        delta_medio: fb.delta_medio,
        resumo_avaliacao: fb.resumo_avaliacao,
      },
      acumulada: (() => {
        try {
          const a = (fb13 as any)?.feedback?.acumulado?.primaria?.avaliacao_acumulada || [];
          return a.map((x: any) => ({ descritor: x.descritor, nota_acumulada: x.nota_acumulada }));
        } catch { return []; }
      })(),
      auditoria: fb.auditoria,
    },
  };
}
