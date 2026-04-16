'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { callAI } from './ai-client';
import { promptAvaliacaoAcumulada, promptAvaliacaoAcumuladaCheck } from '@/lib/season-engine/prompts/acumulado';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';

/**
 * Gera avaliação acumulada da temporada (1ª IA) + check por 2ª IA e
 * persiste em temporada_semana_progresso (semana=13).feedback.acumulado.
 *
 * Trigger: chamada no fim da semana 13, automaticamente, após extração
 * qualitativa. Também pode ser chamada manualmente pelo admin Vertho.
 */
export async function gerarAvaliacaoAcumulada(trilhaId) {
  // Descobre tenant via trilha (raw — query inicial sem tenant conhecido).
  const sbRaw = createSupabaseAdmin();
  const { data: trilha } = await sbRaw.from('trilhas')
    .select('id, empresa_id, colaborador_id, competencia_foco, descritores_selecionados, temporada_plano')
    .eq('id', trilhaId).maybeSingle();
  if (!trilha) return { error: 'trilha não encontrada' };

  const tdb = tenantDb(trilha.empresa_id);

  const { data: colab } = await tdb.from('colaboradores')
    .select('nome_completo, cargo').eq('id', trilha.colaborador_id).maybeSingle();
  const nome = (colab?.nome_completo || '').split(' ')[0] || 'colab';

  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  if (!descritores.length) return { error: 'sem descritores_selecionados' };

  // Enriquece com régua + nota_pre fresh
  const descritoresComRegua = await enriquecerComRegua(tdb, sbRaw, trilha.competencia_foco, descritores);
  const descritoresFresh = await atualizarNotaAtualFresh(tdb, trilha.colaborador_id, trilha.competencia_foco, descritoresComRegua);

  // Agrega evidências das 13 semanas
  const evidenciasAcumuladas = await agregarEvidencias(tdb, trilhaId, descritoresFresh, trilha.temporada_plano);

  // PII masking pro prompt externo (Claude). Nome do colab vira alias;
  // evidências (transcripts literais) passam pelo sanitizador.
  const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
  const evidenciasMasked = maskTextPII(evidenciasAcumuladas, piiMap);

  // 1ª IA — avaliação primária
  let primaria = null;
  try {
    const { system, user } = promptAvaliacaoAcumulada({
      competencia: trilha.competencia_foco,
      descritores: descritoresFresh,
      evidenciasAcumuladas: evidenciasMasked,
      nomeColab: colabMasked.nome,
    });
    const r = await callAI(system, user, {}, 8000);
    primaria = JSON.parse(r.replace(/```json\n?|```\n?/g, '').trim());
    // Despersonaliza textos livres antes de persistir
    if (primaria?.resumo_geral) primaria.resumo_geral = unmaskPII(primaria.resumo_geral, piiMap);
    if (Array.isArray(primaria?.avaliacao_acumulada)) {
      primaria.avaliacao_acumulada = primaria.avaliacao_acumulada.map(d => ({
        ...d, justificativa: unmaskPII(d.justificativa, piiMap),
      }));
    }
  } catch (err) {
    console.error('[acumulado primária]', err);
    return { error: 'Falha na 1ª IA: ' + err.message };
  }

  // 2ª IA — check (mask também na primária que vai pro prompt)
  let auditoria = null;
  try {
    const primariaMask = JSON.parse(maskTextPII(JSON.stringify(primaria), piiMap));
    const { system, user } = promptAvaliacaoAcumuladaCheck({
      competencia: trilha.competencia_foco,
      descritores: descritoresFresh,
      evidenciasAcumuladas: evidenciasMasked,
      avaliacaoPrimaria: primariaMask,
    });
    const r = await callAI(system, user, {}, 6000);
    auditoria = JSON.parse(r.replace(/```json\n?|```\n?/g, '').trim());
    if (auditoria?.resumo_auditoria) auditoria.resumo_auditoria = unmaskPII(auditoria.resumo_auditoria, piiMap);
  } catch (err) {
    console.error('[acumulado check]', err);
    // Não falha — grava primária sem auditoria
  }

  // Persiste em sem 13 feedback.acumulado (ou cria linha se não houver)
  const payload = {
    gerado_em: new Date().toISOString(),
    primaria,
    auditoria,
  };

  const { data: prog13 } = await tdb.from('temporada_semana_progresso')
    .select('id, feedback').eq('trilha_id', trilhaId).eq('semana', 13).maybeSingle();

  if (prog13) {
    const novoFb = { ...(prog13.feedback || {}), acumulado: payload };
    await tdb.from('temporada_semana_progresso').update({ feedback: novoFb }).eq('id', prog13.id);
  } else {
    // empresa_id é injetado pelo tdb.insert
    await tdb.from('temporada_semana_progresso').insert({
      trilha_id: trilhaId,
      colaborador_id: trilha.colaborador_id,
      semana: 13, tipo: 'avaliacao', status: 'em_andamento',
      feedback: { acumulado: payload },
    });
  }

  return { ok: true, primaria, auditoria };
}

// ── Helpers ──

async function enriquecerComRegua(tdb, sbRaw, competencia, descritores) {
  const nomesCurtos = descritores.map(d => d.descritor);
  let { data: rows } = await tdb.from('competencias')
    .select('nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
    .eq('nome', competencia).in('nome_curto', nomesCurtos);
  if (!rows || rows.length === 0) {
    // competencias_base é GLOBAL (catálogo nacional) → raw
    const { data: base } = await sbRaw.from('competencias_base')
      .select('nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
      .eq('nome', competencia).in('nome_curto', nomesCurtos);
    rows = base || [];
  }
  const mapa = Object.fromEntries((rows || []).map(r => [r.nome_curto, r]));
  return descritores.map(d => ({ ...d, ...(mapa[d.descritor] || {}) }));
}

async function atualizarNotaAtualFresh(tdb, colaboradorId, competencia, descritores) {
  const nomes = descritores.map(d => d.descritor);
  const { data } = await tdb.from('descriptor_assessments')
    .select('descritor, nota')
    .eq('colaborador_id', colaboradorId).eq('competencia', competencia).in('descritor', nomes);
  const mapa = Object.fromEntries((data || []).map(a => [a.descritor, Number(a.nota)]));
  return descritores.map(d => ({
    ...d,
    nota_atual: mapa[d.descritor] != null ? mapa[d.descritor] : d.nota_atual,
  }));
}

async function agregarEvidencias(tdb, trilhaId, descritores, plano) {
  const { data: progressos } = await tdb.from('temporada_semana_progresso')
    .select('semana, tipo, reflexao, feedback')
    .eq('trilha_id', trilhaId).lte('semana', 13).order('semana');
  if (!progressos?.length) return '';

  const planoArr = Array.isArray(plano) ? plano : [];
  const descritorPorSem = Object.fromEntries(planoArr.map(s => [s.semana, s.descritor]));
  const descritoresCobertosPorSem = Object.fromEntries(planoArr.map(s => [s.semana, s.descritores_cobertos || []]));

  const linhasPorDescritor = Object.fromEntries(descritores.map(d => [d.descritor, []]));

  for (const p of progressos) {
    if (p.tipo === 'conteudo' && p.reflexao) {
      const desc = descritorPorSem[p.semana];
      if (desc && linhasPorDescritor[desc]) {
        const partes = [
          `Sem ${p.semana}`,
          p.reflexao.insight_principal && `insight: "${p.reflexao.insight_principal}"`,
          p.reflexao.desafio_realizado && `desafio: ${p.reflexao.desafio_realizado}`,
          p.reflexao.qualidade_reflexao && `qualidade: ${p.reflexao.qualidade_reflexao}`,
        ].filter(Boolean).join(' · ');
        linhasPorDescritor[desc].push(partes);
      }
    }
    if (p.tipo === 'aplicacao' && p.feedback) {
      const cobertos = descritoresCobertosPorSem[p.semana] || [];
      const avals = Array.isArray(p.feedback.avaliacao_por_descritor) ? p.feedback.avaliacao_por_descritor : [];
      const modo = p.feedback.modo || 'cenario';
      for (const desc of cobertos) {
        if (!linhasPorDescritor[desc]) continue;
        const aval = avals.find(a => a.descritor === desc);
        const partes = [
          `Sem ${p.semana} (${modo === 'pratica' ? 'missão real' : 'cenário escrito'})`,
          aval?.observacao && `obs: "${aval.observacao}"`,
          aval?.nota && `nota: ${aval.nota}`,
        ].filter(Boolean).join(' · ');
        if (partes) linhasPorDescritor[desc].push(partes);
      }
    }
    if (p.semana === 13 && p.reflexao?.evolucao_percebida) {
      for (const ev of p.reflexao.evolucao_percebida) {
        if (!linhasPorDescritor[ev.descritor]) continue;
        const partes = [
          `Sem 13 (auto-percepção)`,
          ev.antes && `antes: "${ev.antes}"`,
          ev.depois && `depois: "${ev.depois}"`,
          ev.evidencia && `evidência: "${ev.evidencia}"`,
          ev.nivel_percebido != null && `nível percebido: ${ev.nivel_percebido}`,
        ].filter(Boolean).join(' · ');
        linhasPorDescritor[ev.descritor].push(partes);
      }
    }
  }

  return descritores.map(d => {
    const linhas = linhasPorDescritor[d.descritor] || [];
    if (!linhas.length) return `### ${d.descritor}\n(sem evidência registrada)`;
    return `### ${d.descritor}\n- ${linhas.join('\n- ')}`;
  }).join('\n\n');
}
