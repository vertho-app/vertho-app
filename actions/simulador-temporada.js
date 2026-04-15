'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, callAIChat } from './ai-client';
import {
  promptSimuladorColab,
  promptSimuladorCompromisso,
} from '@/lib/season-engine/prompts/simulador-temporada';
import { promptSocratic } from '@/lib/season-engine/prompts/socratic';
import { promptMissaoFeedback } from '@/lib/season-engine/prompts/missao-feedback';
import { promptEvolutionQualitative, promptEvolutionQualitativeExtract } from '@/lib/season-engine/prompts/evolution-qualitative';
import { getUserContext } from '@/lib/authz';

// Simulador usa Haiku pra ser rápido; mentor mantém default (Sonnet).
const SIM_MODEL = { model: 'claude-haiku-4-5-20251001' };

const MAX_TURNS = {
  socratic: 6,
  missao_feedback: 10,
  qualitativa: 12,
};

/**
 * Simula temporada completa pra 1 trilha. Percorre sems 1-13 exercitando
 * os prompts reais. Sem 14: só prepara cenário B (não envia resposta —
 * admin faz scoring manual).
 *
 * @param {string} email - email do admin (verificado como platform admin)
 * @param {Object} opts
 * @param {string} opts.trilhaId
 * @param {string} opts.perfilEvolucao - evolucao_confirmada|evolucao_parcial|estagnacao|regressao
 */
/**
 * Simula UMA semana só. Usado pelo cliente em loop pra evitar timeout do
 * server action (300s máx na Vercel). Retorna { ok, semana, tipo } ou { error }.
 *
 * @param {string} semanaKey - 'setup' | 'N' (1-14) | 'finalizar'
 *   - 'setup': nada (reservado)
 *   - 'N' numérica: processa aquela semana (conteúdo/aplicação/qualitativa/cenário)
 */
export async function simularUmaSemanaSimulacao(email, { trilhaId, semana, perfilEvolucao = 'evolucao_parcial' }) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const { data: trilha } = await sb.from('trilhas')
    .select('id, empresa_id, colaborador_id, competencia_foco, temporada_plano, descritores_selecionados')
    .eq('id', trilhaId).maybeSingle();
  if (!trilha) return { error: 'Trilha não encontrada' };

  const { data: colab } = await sb.from('colaboradores')
    .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();

  const plano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
  const s = plano.find(x => x.semana === Number(semana));
  if (!s) return { error: `Semana ${semana} não está no plano` };

  try {
    if (s.tipo === 'conteudo' && s.descritor) {
      await simularSocratico(sb, trilha, colab, s, perfilEvolucao);
      return { ok: true, semana: Number(semana), tipo: 'conteudo' };
    }
    if (s.tipo === 'aplicacao') {
      await simularMissaoPratica(sb, trilha, colab, s, perfilEvolucao);
      return { ok: true, semana: Number(semana), tipo: 'aplicacao' };
    }
    if (s.tipo === 'avaliacao' && Number(semana) === 13) {
      await simularQualitativa(sb, trilha, colab, s, perfilEvolucao);
      return { ok: true, semana: 13, tipo: 'qualitativa' };
    }
    if (s.tipo === 'avaliacao' && Number(semana) === 14) {
      const r = await simularSem14Ate(sb, trilha, colab, perfilEvolucao);
      return { ok: true, semana: 14, tipo: 'cenario_b', cenario_disponivel: r.cenarioOk };
    }
    return { ok: true, semana: Number(semana), tipo: 'skip', reason: 'sem ação definida' };
  } catch (err) {
    console.error(`[simular sem ${semana}]`, err);
    return { error: `Sem ${semana}: ${err?.message || 'erro'}` };
  }
}

export async function simularTemporadaCompleta(email, { trilhaId, perfilEvolucao = 'evolucao_parcial' }) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();
  const { data: trilha } = await sb.from('trilhas')
    .select('id, empresa_id, colaborador_id, competencia_foco, temporada_plano, descritores_selecionados')
    .eq('id', trilhaId).maybeSingle();
  if (!trilha) return { error: 'Trilha não encontrada' };

  const { data: colab } = await sb.from('colaboradores')
    .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();
  const nome = (colab?.nome_completo || '').split(' ')[0] || 'Colab';

  const plano = Array.isArray(trilha.temporada_plano) ? trilha.temporada_plano : [];
  if (!plano.length) return { error: 'Trilha sem temporada_plano' };

  const steps = [];

  try {
    for (const s of plano) {
      const semana = s.semana;
      if (semana > 13) break; // sem 14 tratada depois

      if (s.tipo === 'conteudo' && s.descritor) {
        await simularSocratico(sb, trilha, colab, s, perfilEvolucao);
        steps.push({ semana, tipo: 'conteudo', ok: true });
      } else if (s.tipo === 'aplicacao') {
        await simularMissaoPratica(sb, trilha, colab, s, perfilEvolucao);
        steps.push({ semana, tipo: 'aplicacao_pratica', ok: true });
      } else if (s.tipo === 'avaliacao' && semana === 13) {
        await simularQualitativa(sb, trilha, colab, s, perfilEvolucao);
        steps.push({ semana: 13, tipo: 'qualitativa', ok: true });
      }
    }

    // Sem 14: inicia cenário B + gera resposta simulada (NÃO finaliza — admin scoring manual)
    const sem14 = await simularSem14Ate(sb, trilha, colab, perfilEvolucao);
    steps.push({ semana: 14, tipo: 'cenario_b_resposta_gerada', ok: true, cenario_disponivel: sem14.cenarioOk });

    return { ok: true, steps, colab: colab?.nome_completo, perfilEvolucao };
  } catch (err) {
    console.error('[simularTemporadaCompleta]', err);
    return { error: err?.message || 'Erro na simulação', steps };
  }
}

// ── SEM DE CONTEÚDO (socrático 6 turnos) ──
async function simularSocratico(sb, trilha, colab, s, perfilEvolucao) {
  const nome = (colab?.nome_completo || '').split(' ')[0];
  const desafio = s.conteudo?.desafio_texto || '';
  let historico = [];
  const maxIA = MAX_TURNS.socratic;

  // marca conteudo_consumido
  await upsertProgresso(sb, trilha, s.semana, {
    tipo: 'conteudo',
    status: 'em_andamento',
    conteudo_consumido: true,
    iniciado_em: new Date().toISOString(),
  });

  for (let turnIA = 1; turnIA <= maxIA; turnIA++) {
    // IA fala (mentor)
    const { system, messages } = promptSocratic({
      nomeColab: nome,
      cargo: colab?.cargo,
      perfilDominante: colab?.perfil_dominante,
      competencia: trilha.competencia_foco,
      descritor: s.descritor,
      desafio,
      historico,
      turnIA,
    });
    const mensagensPayload = messages.length ? messages : [{ role: 'user', content: '[INICIE]' }];
    const respIA = (await callAIChat(system, mensagensPayload, {}, 500)).trim();
    historico.push({ role: 'assistant', content: respIA, timestamp: new Date().toISOString(), turn: turnIA });

    if (turnIA >= maxIA) break;

    // Colab fala (simulador)
    const userTurn = turnIA;
    const simP = promptSimuladorColab({
      perfilEvolucao, semana: s.semana, tipoChat: 'socratic',
      competencia: trilha.competencia_foco, descritor: s.descritor,
      desafio, historico, turnUser: userTurn, cargo: colab?.cargo,
    });
    const respColab = (await callAI(simP.system, simP.user, SIM_MODEL, 300)).trim();
    historico.push({ role: 'user', content: respColab, timestamp: new Date().toISOString() });
  }

  // Extração + fechamento (mesmo fluxo do endpoint real)
  let extracao = {};
  try {
    const transcript = historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
    const sys = 'Você é um extrator. Retorne APENAS JSON válido.';
    const usr = `CONVERSA:\n${transcript}\n\nExtraia:\n{\n  "desafio_realizado": "sim|parcial|nao",\n  "relato_resumo": "1 frase",\n  "insight_principal": "1 frase",\n  "compromisso_proxima": "1 frase",\n  "qualidade_reflexao": "alta|media|baixa"\n}`;
    const r = await callAI(sys, usr, {}, 400);
    extracao = JSON.parse(r.replace(/```json\n?|```\n?/g, '').trim());
  } catch (e) { console.warn('[sim extract]', e.message); }

  await upsertProgresso(sb, trilha, s.semana, {
    tipo: 'conteudo',
    status: 'concluido',
    conteudo_consumido: true,
    reflexao: { ...extracao, transcript_completo: historico },
    concluido_em: new Date().toISOString(),
  });

  // Libera próxima
  await sb.from('temporada_semana_progresso')
    .update({ status: 'em_andamento' })
    .eq('trilha_id', trilha.id).eq('semana', s.semana + 1).eq('status', 'pendente');
}

// ── SEM DE APLICAÇÃO — modo PRÁTICA (10 turnos) ──
async function simularMissaoPratica(sb, trilha, colab, s, perfilEvolucao) {
  const nome = (colab?.nome_completo || '').split(' ')[0];
  const cobertos = s.descritores_cobertos || [];
  const missaoTexto = s.missao?.texto || '';

  // 1. gera compromisso via simulador
  const cmp = promptSimuladorCompromisso({
    perfilEvolucao, competencia: trilha.competencia_foco,
    descritoresCobertos: cobertos, cargo: colab?.cargo, missao: missaoTexto,
  });
  const compromisso = (await callAI(cmp.system, cmp.user, SIM_MODEL, 150)).trim();

  // 2. set modo=pratica
  await upsertProgresso(sb, trilha, s.semana, {
    tipo: 'aplicacao',
    status: 'em_andamento',
    feedback: { modo: 'pratica', compromisso, transcript_completo: [] },
    iniciado_em: new Date().toISOString(),
  });

  // 3. chat 10 turnos IA
  let historico = [];
  const maxIA = MAX_TURNS.missao_feedback;

  // Colab inicia com um relato inicial (user message antes do turn 1 da IA)
  const simInit = promptSimuladorColab({
    perfilEvolucao, semana: s.semana, tipoChat: 'missao_feedback',
    competencia: trilha.competencia_foco, descritor: cobertos.join(', '),
    missao: missaoTexto, historico: [], turnUser: 1, cargo: colab?.cargo,
  });
  const relatoInicial = (await callAI(simInit.system, simInit.user, SIM_MODEL, 400)).trim();
  historico.push({ role: 'user', content: relatoInicial, timestamp: new Date().toISOString() });

  for (let turnIA = 1; turnIA <= maxIA; turnIA++) {
    const { system, messages } = promptMissaoFeedback({
      nomeColab: nome, cargo: colab?.cargo,
      competencia: trilha.competencia_foco,
      descritoresCobertos: cobertos,
      missao: missaoTexto, compromisso,
      historico, turnIA,
    });
    const respIA = (await callAIChat(system, messages, {}, 500)).trim();
    historico.push({ role: 'assistant', content: respIA, timestamp: new Date().toISOString(), turn: turnIA });

    if (turnIA >= maxIA) break;

    // Colab responde
    const turnUser = turnIA + 1;
    const simP = promptSimuladorColab({
      perfilEvolucao, semana: s.semana, tipoChat: 'missao_feedback',
      competencia: trilha.competencia_foco, descritor: cobertos.join(', '),
      missao: missaoTexto, historico, turnUser, cargo: colab?.cargo,
    });
    const respColab = (await callAI(simP.system, simP.user, SIM_MODEL, 300)).trim();
    historico.push({ role: 'user', content: respColab, timestamp: new Date().toISOString() });
  }

  // Extração estruturada (avaliacao_por_descritor)
  let extracao = {};
  try {
    const transcript = historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
    const sys = 'Você é um extrator de dados. Retorne APENAS JSON.';
    const usr = `CONVERSA:\n${transcript}\n\nExtraia:\n{\n  "avaliacao_por_descritor": [\n${cobertos.map(d => `    { "descritor": "${d}", "nota": 1.0-4.0, "observacao": "1 frase" }`).join(',\n')}\n  ],\n  "sintese_bloco": "1 frase"\n}`;
    const r = await callAI(sys, usr, {}, 500);
    extracao = JSON.parse(r.replace(/```json\n?|```\n?/g, '').trim());
  } catch (e) { console.warn('[sim extract aplicacao]', e.message); }

  await upsertProgresso(sb, trilha, s.semana, {
    tipo: 'aplicacao',
    status: 'concluido',
    feedback: { modo: 'pratica', compromisso, ...extracao, transcript_completo: historico },
    concluido_em: new Date().toISOString(),
  });
  await sb.from('temporada_semana_progresso')
    .update({ status: 'em_andamento' })
    .eq('trilha_id', trilha.id).eq('semana', s.semana + 1).eq('status', 'pendente');
}

// ── SEM 13 QUALITATIVA (12 turnos) ──
async function simularQualitativa(sb, trilha, colab, s, perfilEvolucao) {
  const nome = (colab?.nome_completo || '').split(' ')[0];
  const descritoresArr = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];

  // Coleta insights anteriores (das sems 1-12 já simuladas)
  const { data: outrasSem } = await sb.from('temporada_semana_progresso')
    .select('reflexao').eq('trilha_id', trilha.id).lte('semana', 12).not('reflexao', 'is', null);
  const insightsAnteriores = (outrasSem || []).map(x => x.reflexao?.insight_principal).filter(Boolean);

  let historico = [];
  const maxIA = MAX_TURNS.qualitativa;

  for (let turnIA = 1; turnIA <= maxIA; turnIA++) {
    const { system } = promptEvolutionQualitative({
      nomeColab: nome, cargo: colab?.cargo,
      perfilDominante: colab?.perfil_dominante,
      competencia: trilha.competencia_foco,
      descritores: descritoresArr, insightsAnteriores,
      turnIA, totalTurns: maxIA,
    });
    const messages = historico.map(m => ({ role: m.role, content: m.content }));
    if (turnIA === 1 && !messages.length) messages.push({ role: 'user', content: '[INICIE]' });
    const respIA = (await callAIChat(system, messages, {}, 600)).trim();
    historico.push({ role: 'assistant', content: respIA, timestamp: new Date().toISOString(), turn: turnIA });

    if (turnIA >= maxIA) break;

    const simP = promptSimuladorColab({
      perfilEvolucao, semana: 13, tipoChat: 'qualitativa_fechamento',
      competencia: trilha.competencia_foco, descritor: descritoresArr.map(d => d.descritor).join(', '),
      historico, turnUser: turnIA, cargo: colab?.cargo,
    });
    const respColab = (await callAI(simP.system, simP.user, SIM_MODEL, 400)).trim();
    historico.push({ role: 'user', content: respColab, timestamp: new Date().toISOString() });
  }

  // Extração qualitativa
  let extracao = {};
  try {
    const transcript = historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
    const { system: s2, user: u2 } = promptEvolutionQualitativeExtract({ descritores: descritoresArr, transcript });
    const r = await callAI(s2, u2, {}, 1200);
    extracao = JSON.parse(r.replace(/```json\n?|```\n?/g, '').trim());
  } catch (e) { console.warn('[sim extract qualitativa]', e.message); }

  await upsertProgresso(sb, trilha, 13, {
    tipo: 'avaliacao',
    status: 'concluido',
    reflexao: { ...extracao, transcript_completo: historico },
    concluido_em: new Date().toISOString(),
  });
  await sb.from('temporada_semana_progresso')
    .update({ status: 'em_andamento' })
    .eq('trilha_id', trilha.id).eq('semana', 14).eq('status', 'pendente');

  // Dispara avaliação acumulada (mesmo hook do endpoint real)
  try {
    const { gerarAvaliacaoAcumulada } = await import('@/actions/avaliacao-acumulada');
    await gerarAvaliacaoAcumulada(trilha.id);
  } catch (e) { console.warn('[sim acumulada]', e.message); }
}

// ── SEM 14: prepara cenário B e gera resposta simulada (SEM scoring) ──
async function simularSem14Ate(sb, trilha, colab, perfilEvolucao) {
  const nome = (colab?.nome_completo || '').split(' ')[0];
  // Busca cenário B do banco_cenarios
  const { data: cenB } = await sb.from('banco_cenarios')
    .select('id, titulo, descricao')
    .eq('empresa_id', trilha.empresa_id)
    .eq('cargo', colab?.cargo || 'todos')
    .eq('tipo_cenario', 'cenario_b')
    .limit(1).maybeSingle();

  if (!cenB?.descricao) {
    // Não há cenário B — registra estado e retorna
    await upsertProgresso(sb, trilha, 14, {
      tipo: 'avaliacao',
      status: 'em_andamento',
      feedback: { erro: 'Cenário B não cadastrado no banco_cenarios.', transcript_completo: [] },
      iniciado_em: new Date().toISOString(),
    });
    return { cenarioOk: false };
  }

  const cenario = `## ${cenB.titulo || 'Cenário final'}\n\n${cenB.descricao}`;

  // Gera resposta simulada (longa — é avaliação final)
  const descritoresArr = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  const simP = promptSimuladorColab({
    perfilEvolucao, semana: 14, tipoChat: 'cenario_final',
    competencia: trilha.competencia_foco,
    descritor: descritoresArr.map(d => d.descritor).join(', '),
    cenario, historico: [], turnUser: 1, cargo: colab?.cargo,
  });
  const resposta = (await callAI(simP.system, simP.user, SIM_MODEL, 800)).trim();

  await upsertProgresso(sb, trilha, 14, {
    tipo: 'avaliacao',
    status: 'em_andamento',
    feedback: {
      cenario, cenario_b_id: cenB.id,
      cenario_resposta: resposta,
      transcript_completo: [{ role: 'user', content: resposta, timestamp: new Date().toISOString() }],
      _simulado: true, _aguardando_scoring: true,
    },
    iniciado_em: new Date().toISOString(),
  });

  return { cenarioOk: true };
}

// ── Helper: upsert do progresso com os campos necessários ──
async function upsertProgresso(sb, trilha, semana, patch) {
  const { data: prog } = await sb.from('temporada_semana_progresso')
    .select('id').eq('trilha_id', trilha.id).eq('semana', semana).maybeSingle();

  const payload = {
    trilha_id: trilha.id,
    empresa_id: trilha.empresa_id,
    colaborador_id: trilha.colaborador_id,
    semana,
    ...patch,
  };

  if (prog) await sb.from('temporada_semana_progresso').update(payload).eq('id', prog.id);
  else await sb.from('temporada_semana_progresso').insert(payload);
}
