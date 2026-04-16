import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, callAIChat } from '@/actions/ai-client';
import { promptSocratic } from '@/lib/season-engine/prompts/socratic';
import { promptAnalytic } from '@/lib/season-engine/prompts/analytic';
import { promptMissaoFeedback } from '@/lib/season-engine/prompts/missao-feedback';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';

async function extrairDadosEstruturados(historico, tipoConversa, semanaPlan) {
  const transcript = historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
  // missao_feedback usa a mesma estrutura do analytic (avaliação por descritor).
  const estiloAnalytic = tipoConversa === 'analytic' || tipoConversa === 'missao_feedback';

  if (!estiloAnalytic) {
    const system = 'Você é um extrator de dados estruturados. Analise a conversa e retorne APENAS um JSON válido, sem markdown, sem backticks.';
    const user = `CONVERSA:\n${transcript}\n\nExtraia:\n{\n  "desafio_realizado": "sim" | "parcial" | "nao",\n  "relato_resumo": "1 frase resumindo o que aconteceu",\n  "insight_principal": "1 frase com o principal aprendizado",\n  "compromisso_proxima": "1 frase com o compromisso para a próxima semana",\n  "qualidade_reflexao": "alta" | "media" | "baixa"\n}\n\nRegras:\n- desafio_realizado: "sim" se executou, "parcial" se tentou, "nao" se não tentou\n- qualidade_reflexao: alta=reflexão profunda, media=superficial, baixa=respostas genéricas/curtas\n- Baseie-se APENAS na conversa`;
    const resp = await callAI(system, user, {}, 2000);
    return JSON.parse(resp.replace(/```json\n?|```\n?/g, '').trim());
  }

  // analytic ou missao_feedback: extrai avaliação por descritor
  const system = 'Você é um extrator de dados estruturados. Retorne APENAS JSON válido, sem markdown.';
  const descritores = semanaPlan.descritores_cobertos || [];
  const user = `CONVERSA DE FEEDBACK:\n${transcript}\n\nExtraia:\n{\n  "avaliacao_por_descritor": [\n${descritores.map(d => `    { "descritor": "${d}", "nota": 1.0-4.0, "observacao": "1 frase" }`).join(',\n')}\n  ],\n  "sintese_bloco": "1 frase sobre o progresso geral do bloco"\n}`;
  const resp = await callAI(system, user, {}, 3000);
  return JSON.parse(resp.replace(/```json\n?|```\n?/g, '').trim());
}

const MAX_TURNS_SOCRATIC = 12; // 6 IA + 6 colab — evidências de 1 descritor
const MAX_TURNS_ANALYTIC = 20; // 10 IA + 10 colab — cenário escrito, 3 descritores
const MAX_TURNS_MISSAO_FEEDBACK = 20; // 10 IA + 10 colab — relato de missão prática, 3 descritores

/**
 * POST /api/temporada/reflection
 * Body: { trilhaId, semana, message?, action: 'send' | 'init' }
 *
 * - 'init': inicia conversa, IA fala primeiro
 * - 'send': colab respondeu, IA processa e retorna próximo turn
 *
 * Retorna: { message, turnIA, finished, history }
 */
export async function POST(request) {
  try {
    const { trilhaId, semana, message, action = 'send' } = await request.json();
    if (!trilhaId || !semana) return NextResponse.json({ error: 'trilhaId+semana obrigatórios' }, { status: 400 });

    const sb = createSupabaseAdmin();

    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, competencia_foco, temporada_plano, data_inicio')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha não encontrada' }, { status: 404 });

    // Gate temporal: semana só libera na segunda às 03:00 BRT correspondente.
    const { semanaLiberadaPorData, formatarLiberacao } = await import('@/lib/season-engine/week-gating');
    if (!semanaLiberadaPorData(trilha.data_inicio, semana)) {
      return NextResponse.json({
        error: `Semana ${semana} ainda bloqueada. Libera ${formatarLiberacao(trilha.data_inicio, semana)}.`,
      }, { status: 403 });
    }
    // Gate de progressão: anterior precisa estar concluída.
    if (Number(semana) > 1) {
      const { data: prev } = await sb.from('temporada_semana_progresso')
        .select('status').eq('trilha_id', trilhaId).eq('semana', Number(semana) - 1).maybeSingle();
      if (prev?.status !== 'concluido') {
        return NextResponse.json({ error: `Conclua a semana ${Number(semana) - 1} antes.` }, { status: 403 });
      }
    }

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();
    if (!colab) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });

    const semanaPlan = (trilha.temporada_plano || []).find(s => s.semana === Number(semana));
    if (!semanaPlan) return NextResponse.json({ error: 'semana fora do plano' }, { status: 400 });

    // Carrega progresso antes pra decidir qual prompt usar em aplicação.
    const { data: prog } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();

    // Em sems 4/8/12: se modo='pratica', usa prompt de feedback da Missão
    // Prática (ancora no relato real). Senão (modo='cenario' ou não definido),
    // usa o analytic clássico sobre cenário escrito.
    const modoAplicacao = prog?.feedback?.modo;
    let tipoConversa;
    if (semanaPlan.tipo === 'aplicacao') {
      tipoConversa = modoAplicacao === 'pratica' ? 'missao_feedback' : 'analytic';
    } else {
      tipoConversa = 'socratic';
    }
    const maxTurns = tipoConversa === 'analytic'
      ? MAX_TURNS_ANALYTIC
      : tipoConversa === 'missao_feedback'
        ? MAX_TURNS_MISSAO_FEEDBACK
        : MAX_TURNS_SOCRATIC;

    const slot = semanaPlan.tipo === 'aplicacao' ? 'feedback' : 'reflexao';
    const dados = prog?.[slot] || { transcript_completo: [] };
    const historico = Array.isArray(dados.transcript_completo) ? dados.transcript_completo : [];

    // Append user message se action=send e tem message
    if (action === 'send' && message) {
      historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    }

    // Conta turns da IA já realizados
    const turnsIA = historico.filter(m => m.role === 'assistant').length;
    if (turnsIA >= maxTurns / 2) {
      // Já encerrou
      return NextResponse.json({ finished: true, history: historico, message: null });
    }

    const proximoTurnIA = turnsIA + 1;

    // PII masking: substitui nome real por alias + sanitiza PII no histórico
    // antes de enviar pra IA externa. Map preserva relação pra despersonalizar output.
    const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
    const historicoMasked = historico.map(m => ({
      ...m,
      content: maskTextPII(m.content, piiMap),
    }));

    // Monta prompt
    let promptData;
    if (tipoConversa === 'socratic') {
      promptData = promptSocratic({
        nomeColab: colabMasked.nome,
        cargo: colab.cargo,
        perfilDominante: colab.perfil_dominante,
        competencia: trilha.competencia_foco,
        descritor: semanaPlan.descritor,
        desafio: semanaPlan.conteudo?.desafio_texto || '',
        historico: historicoMasked,
        turnIA: proximoTurnIA,
      });
    } else if (tipoConversa === 'missao_feedback') {
      promptData = promptMissaoFeedback({
        nomeColab: colabMasked.nome,
        cargo: colab.cargo,
        competencia: trilha.competencia_foco,
        descritoresCobertos: semanaPlan.descritores_cobertos || [],
        missao: semanaPlan.missao?.texto || '',
        compromisso: maskTextPII(prog?.feedback?.compromisso || '', piiMap),
        historico: historicoMasked,
        turnIA: proximoTurnIA,
      });
    } else {
      promptData = promptAnalytic({
        nomeColab: colabMasked.nome,
        cargo: colab.cargo,
        competencia: trilha.competencia_foco,
        descritoresCobertos: semanaPlan.descritores_cobertos || [],
        cenario: semanaPlan.cenario?.texto || '',
        historico: historicoMasked,
        turnIA: proximoTurnIA,
      });
    }

    let respostaIA;
    try {
      respostaIA = await callAIChat(promptData.system, promptData.messages, {}, 2000);
      respostaIA = (respostaIA || '').trim();
    } catch (err) {
      console.error('[reflection] callAIChat:', err);
      return NextResponse.json({ error: 'Erro na IA' }, { status: 500 });
    }

    // Despersonaliza resposta antes de persistir/exibir
    respostaIA = unmaskPII(respostaIA, piiMap);

    historico.push({ role: 'assistant', content: respostaIA, timestamp: new Date().toISOString(), turn: proximoTurnIA });

    const totalTurnsIA = proximoTurnIA;
    const finished = totalTurnsIA >= maxTurns / 2;

    // Persiste
    const novoSlotData = { ...dados, transcript_completo: historico };
    if (finished) {
      // Extração estruturada via IA (substitui regex)
      try {
        const extracao = await extrairDadosEstruturados(historico, tipoConversa, semanaPlan);
        Object.assign(novoSlotData, extracao);
      } catch (err) {
        console.error('[VERTHO] extração JSON falhou:', err.message);
      }
    }

    const upsertPayload = {
      trilha_id: trilhaId,
      empresa_id: prog?.empresa_id || (await sb.from('trilhas').select('empresa_id').eq('id', trilhaId).maybeSingle()).data?.empresa_id,
      colaborador_id: trilha.colaborador_id,
      semana: Number(semana),
      tipo: semanaPlan.tipo,
      status: finished ? 'concluido' : 'em_andamento',
      [slot]: novoSlotData,
      ...(finished ? { concluido_em: new Date().toISOString() } : { iniciado_em: prog?.iniciado_em || new Date().toISOString() }),
    };

    if (prog) {
      await sb.from('temporada_semana_progresso').update(upsertPayload).eq('id', prog.id);
    } else {
      await sb.from('temporada_semana_progresso').insert(upsertPayload);
    }

    // Se concluiu, libera próxima semana (status pendente → em_andamento na UI fica visível)
    if (finished && Number(semana) < 14) {
      const proxima = Number(semana) + 1;
      await sb.from('temporada_semana_progresso')
        .update({ status: 'em_andamento' })
        .eq('trilha_id', trilhaId).eq('semana', proxima).eq('status', 'pendente');
    }

    return NextResponse.json({
      message: respostaIA,
      turnIA: proximoTurnIA,
      finished,
      history: historico,
    });
  } catch (err) {
    console.error('[reflection]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
