import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, callAIChat } from '@/actions/ai-client';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';
import { promptSocratic } from '@/lib/season-engine/prompts/socratic';
import { promptAnalytic } from '@/lib/season-engine/prompts/analytic';
import { promptMissaoFeedback } from '@/lib/season-engine/prompts/missao-feedback';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { retrieveContext, formatGroundingBlock } from '@/lib/rag';
import { getProgramaConfig } from '@/lib/season-engine/programa-config';

function parseExtracaoResponse(raw: string): any {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
  return JSON.parse(cleaned);
}

function validateExtracaoSocratic(parsed: any): any {
  const validos = ['sim', 'parcial', 'nao'];
  // DUO: avalia por competência + deriva o overall (pior status p/ retrocompat).
  if (Array.isArray(parsed.desafios_realizados) && parsed.desafios_realizados.length) {
    parsed.desafios_realizados = parsed.desafios_realizados
      .filter((d: any) => d && d.competencia)
      .map((d: any) => ({ competencia: String(d.competencia), status: validos.includes(d.status) ? d.status : 'parcial' }));
    const ordem = { nao: 0, parcial: 1, sim: 2 } as Record<string, number>;
    const pior = parsed.desafios_realizados.reduce((acc: string, d: any) => (ordem[d.status] < ordem[acc] ? d.status : acc), 'sim');
    parsed.desafio_realizado = parsed.desafios_realizados.length ? pior : (parsed.desafio_realizado || 'parcial');
  }
  if (!validos.includes(parsed.desafio_realizado)) parsed.desafio_realizado = 'parcial';
  const qualidades = ['alta', 'media', 'baixa'];
  if (!qualidades.includes(parsed.qualidade_reflexao)) parsed.qualidade_reflexao = 'media';
  if (!parsed.relato_resumo || typeof parsed.relato_resumo !== 'string') parsed.relato_resumo = '';
  if (!parsed.insight_principal || typeof parsed.insight_principal !== 'string') parsed.insight_principal = '';
  if (!parsed.compromisso_proxima || typeof parsed.compromisso_proxima !== 'string') parsed.compromisso_proxima = '';
  if (parsed.citacao_chave !== null && typeof parsed.citacao_chave !== 'string') parsed.citacao_chave = null;
  if (!parsed.sinais_extraidos || typeof parsed.sinais_extraidos !== 'object') {
    parsed.sinais_extraidos = { exemplo_concreto: false, autopercepcao: false, compromisso_especifico: false, conexao_com_pratica: false };
  }
  if (parsed.sinais_extraidos.conexao_com_pratica === undefined) parsed.sinais_extraidos.conexao_com_pratica = false;
  if (!Array.isArray(parsed.limites_da_conversa)) parsed.limites_da_conversa = [];
  return parsed;
}

function validateExtracaoAnalytic(parsed: any, descritores: string[]): any {
  if (!Array.isArray(parsed.avaliacao_por_descritor)) parsed.avaliacao_por_descritor = [];
  parsed.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => {
    const nota = typeof d.nota === 'number' ? Math.max(1, Math.min(4, Math.round(d.nota * 10) / 10)) : 2.0;
    const forcas = ['fraca', 'moderada', 'forte'];
    return {
      descritor: d.descritor || '',
      nota,
      forca_evidencia: forcas.includes(d.forca_evidencia) ? d.forca_evidencia : 'fraca',
      observacao: d.observacao || '',
      trecho_sustentador: d.trecho_sustentador || '',
      limite: d.limite || '',
    };
  });
  if (!parsed.sintese_bloco || typeof parsed.sintese_bloco !== 'string') parsed.sintese_bloco = '';
  if (!Array.isArray(parsed.alertas_metodologicos)) parsed.alertas_metodologicos = [];
  return parsed;
}

const EXTRATOR_CORE_SYSTEM = `Você é um extrator de dados estruturados da Vertho.

ATENÇÃO:
Você NÃO está avaliando formalmente.
Você NÃO está aconselhando.
Você NÃO está completando lacunas.
Você NÃO está escrevendo feedback bonito.
Você está EXTRAINDO o que a conversa realmente sustenta.

PRINCÍPIOS INEGOCIÁVEIS:
1. Extraia somente o que foi efetivamente dito ou claramente sustentado.
2. Não invente comportamento, avanço, execução ou insight.
3. Diferencie fala articulada de evidência concreta — fala bonita não é prova.
4. Exemplo concreto com ação e consequência vale mais do que opinião ou intenção.
5. Se faltar base, reduza confiança ou força da evidência em vez de inventar.
6. Intenção declarada sem execução relatada = evidência fraca.
7. Autocrítica verbal sem mudança prática = sinal, não prova.
8. Toda leitura relevante deve ter trecho ou paráfrase de sustentação.
9. Se um descritor não tiver base suficiente na conversa, isso deve ser explicitado.
10. O output deve ser útil para a etapa seguinte (merge, avaliação, fusão, relatório).

FORÇA DA EVIDÊNCIA:
- fraca: abstrata, genérica, teórica, sem ação observável
- moderada: concreta mas incompleta, sem consequência clara ou sem repetição
- forte: concreta + coerente + com ação, critério e/ou consequência percebida

RETORNE APENAS JSON VÁLIDO, sem markdown, sem backticks, sem texto antes ou depois.`;

async function extrairDadosEstruturados(historico, tipoConversa, semanaPlan) {
  const transcript = historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
  const estiloAnalytic = tipoConversa === 'analytic' || tipoConversa === 'missao_feedback';

  if (!estiloAnalytic) {
    // DUO: a semana tem N desafios (um por competência) → avalia cada um.
    // Dedupe por Set: no DUO as comps são distintas (identidade); no PILOTO as
    // 2 entregas são da MESMA comp → vira single desafio_realizado (correto).
    const compsDuo: string[] = [...new Set<string>(
      Array.isArray(semanaPlan?.conteudos_dia)
        ? semanaPlan.conteudos_dia.map((e: any) => e.competencia).filter(Boolean)
        : [],
    )];
    const isDuo = compsDuo.length > 1;
    const desafioField = isDuo
      ? `"desafios_realizados": [${compsDuo.map((c) => `{"competencia": "${c}", "status": "sim|parcial|nao"}`).join(', ')}],`
      : `"desafio_realizado": "sim|parcial|nao",`;
    const user = `MODO: socratic — conversa semanal de reflexão${isDuo ? ` (${compsDuo.length} desafios, um por competência)` : ''}
Foco: reflexão, insight, compromisso e qualidade da reflexão.

CONVERSA:
${transcript}

EXTRAIA com base EXCLUSIVA na conversa:
{
  ${desafioField}
  "relato_resumo": "síntese curta e fiel do que o colaborador relatou",
  "insight_principal": "principal percepção emergente — só se apareceu de fato",
  "compromisso_proxima": "compromisso plausível assumido — só se foi dito",
  "qualidade_reflexao": "alta|media|baixa",
  "citacao_chave": "trecho curto mais relevante da fala do colaborador, ou null se nada relevante",
  "sinais_extraidos": {
    "exemplo_concreto": true,
    "autopercepcao": true,
    "compromisso_especifico": true,
    "conexao_com_pratica": true
  },
  "limites_da_conversa": ["limite 1 se houver"]
}

REGRAS:
- ${isDuo ? 'desafios_realizados: avalie CADA competência SEPARADAMENTE (um status por competência), pelo que a pessoa relatou de cada foco' : 'desafio_realizado'}: "sim" se executou e relatou, "parcial" se tentou mas incompleto, "nao" se não tentou
- qualidade_reflexao: alta = reflexão profunda com exemplo concreto e insight genuíno; media = reflexão superficial sem detalhe prático; baixa = respostas genéricas ou monossilábicas
- citacao_chave: trecho curto que melhor sustenta a leitura de qualidade — se a conversa for muito rasa, use null
- sinais_extraidos: marque true somente se apareceu de forma concreta
- conexao_com_pratica: true se o colaborador conectou o conteúdo a algo do trabalho real
- NÃO complete lacunas com "bom senso"
- NÃO infle qualidade_reflexao`;
    const resp = await callAI(EXTRATOR_CORE_SYSTEM, user, {}, 2000);
    return validateExtracaoSocratic(parseExtracaoResponse(resp));
  }

  const descritores = semanaPlan.descritores_cobertos || [];
  const modoLabel = tipoConversa === 'missao_feedback' ? 'missao_feedback (evidência prática real)' : 'analytic (resposta a cenário escrito)';
  const user = `MODO: ${modoLabel}
Foco: leitura analítica por descritor com nota prudente e força de evidência.

CONVERSA:
${transcript}

DESCRITORES A AVALIAR: ${descritores.join(', ')}

EXTRAIA o JSON abaixo, preenchendo com base EXCLUSIVA na conversa:
{
  "avaliacao_por_descritor": [
${descritores.map(d => `    {
      "descritor": "${d}",
      "nota": 1.0-4.0,
      "forca_evidencia": "fraca|moderada|forte",
      "observacao": "síntese curta e fiel",
      "trecho_sustentador": "trecho curto ou paráfrase fiel do que sustenta a nota",
      "limite": "o que faltou para sustentar melhor"
    }`).join(',\n')}
  ],
  "sintese_bloco": "síntese curta e útil do progresso geral",
  "alertas_metodologicos": ["alerta se houver"]
}

REGRAS:
- nota entre 1.0 e 4.0 — não infle sem sustentação
- forca_evidencia: "forte" = ação concreta + consequência percebida; "moderada" = relato com algum detalhe; "fraca" = menção vaga ou ausente
- trecho_sustentador: cite ou parafraseie trecho literal da conversa
- limite: explicite o que faltou — se não faltou nada, pode ficar vazio
- alertas_metodologicos: liste se houver risco de viés, falta de base ou inflação
- NÃO preencha todos os descritores como se todos tivessem aparecido bem
- NÃO transforme intenção em evidência de execução`;
  const resp = await callAI(EXTRATOR_CORE_SYSTEM, user, {}, 3000);
  return validateExtracaoAnalytic(parseExtracaoResponse(resp), descritores);
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
    const csrf = csrfCheck(request);
    if (csrf) return csrf;

    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const limited = aiLimiter.check(request, auth.email);
    if (limited) return limited;

    const body = await request.json();
    const { trilhaId, semana, message, action = 'send', colaboradorId: colabBody } = body;
    if (!trilhaId || !semana) return NextResponse.json({ error: 'trilhaId+semana obrigatórios' }, { status: 400 });

    const sb = createSupabaseAdmin();

    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, competencias_foco, descritores_selecionados, temporada_plano, data_inicio')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha não encontrada' }, { status: 404 });

    // Se body trouxe colaboradorId, tem que bater com o dono da trilha.
    if (colabBody && colabBody !== trilha.colaborador_id) {
      return NextResponse.json({ error: 'colaboradorId não corresponde à trilha' }, { status: 403 });
    }
    const guard = await assertColabAccess(auth, trilha.colaborador_id);
    if (guard) return guard;

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
    const competenciaSemana = resolveCompetenciaSemana(trilha, semanaPlan);

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

    // RAG/grounding: query usa o tema da semana (descritor + competência) +
    // últimas mensagens do colab pra captar contexto da conversa atual.
    let groundingBlock = '';
    try {
      const queryParts = [
        competenciaSemana.label,
        semanaPlan.descritor || (semanaPlan.descritores_cobertos || []).join(' '),
        ...historico.filter(m => m.role === 'user').slice(-2).map(m => maskTextPII(m.content, piiMap).slice(0, 200)),
      ].filter(Boolean);
      const chunks = await retrieveContext(trilha.empresa_id, queryParts.join(' '), 4);
      groundingBlock = formatGroundingBlock(chunks);
    } catch (err) {
      console.warn('[reflection] retrieveContext:', err?.message);
    }

    // DESAFIO da semana: PREFERE o do KIT (por DISC do colab); fallback ao plano
    // (buildSeason). Fase 3 — a cobrança socrática passa a cobrar o desafio do kit.
    const discColab = String(colab.perfil_dominante || '').trim().charAt(0).toUpperCase();
    const { resolverDesafioDoKit } = await import('@/lib/season-engine/kit/desafio-semana');
    let desafiosLista: { competencia: string; desafio_texto: string }[];
    if (Array.isArray(semanaPlan.conteudos_dia) && semanaPlan.conteudos_dia.length > 0) {
      desafiosLista = await Promise.all(semanaPlan.conteudos_dia.map(async (e: any) => {
        const k = await resolverDesafioDoKit(sb, { empresaId: trilha.empresa_id, competencia: e.competencia, descritor: e.descritor, disc: discColab }).catch(() => null);
        return { competencia: e.competencia || competenciaSemana.label, desafio_texto: k?.desafio_texto || e.conteudo?.desafio_texto || '' };
      }));
    } else {
      const k = await resolverDesafioDoKit(sb, { empresaId: trilha.empresa_id, competencia: competenciaSemana.label, descritor: semanaPlan.descritor, disc: discColab }).catch(() => null);
      desafiosLista = [{ competencia: competenciaSemana.label, desafio_texto: k?.desafio_texto || semanaPlan.conteudo?.desafio_texto || '' }];
    }
    desafiosLista = desafiosLista.filter((d) => d.desafio_texto);
    const desafioTexto = desafiosLista.map((d) => d.desafio_texto).join('\n');

    // Monta prompt
    let promptData;
    if (tipoConversa === 'socratic') {
      promptData = promptSocratic({
        nomeColab: colabMasked.nome,
        cargo: colab.cargo,
        perfilDominante: colab.perfil_dominante,
        competencia: competenciaSemana.label,
        descritor: semanaPlan.descritor,
        desafio: desafioTexto,
        desafios: desafiosLista,
        historico: historicoMasked,
        turnIA: proximoTurnIA,
        groundingContext: groundingBlock,
      });
    } else if (tipoConversa === 'missao_feedback') {
      promptData = promptMissaoFeedback({
        nomeColab: colabMasked.nome,
        cargo: colab.cargo,
        competencia: competenciaSemana.label,
        descritoresCobertos: semanaPlan.descritores_cobertos || [],
        missao: semanaPlan.missao?.texto || '',
        compromisso: maskTextPII(prog?.feedback?.compromisso || '', piiMap),
        historico: historicoMasked,
        turnIA: proximoTurnIA,
        groundingContext: groundingBlock,
      });
    } else {
      promptData = promptAnalytic({
        nomeColab: colabMasked.nome,
        cargo: colab.cargo,
        competencia: competenciaSemana.label,
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

    // Resolve programaConfig pra parametrizar transição + auto-trigger Onboarding
    const { data: empConf } = await sb.from('empresas')
      .select('sys_config').eq('id', trilha.empresa_id).maybeSingle();
    const programaConfig = getProgramaConfig(empConf?.sys_config);

    // Se concluiu, libera próxima semana (status pendente → em_andamento na UI fica visível)
    if (finished && Number(semana) < programaConfig.semanas) {
      const proxima = Number(semana) + 1;
      await sb.from('temporada_semana_progresso')
        .update({ status: 'em_andamento' })
        .eq('trilha_id', trilhaId).eq('semana', proxima).eq('status', 'pendente');
    }

    // Modo Piloto: ao concluir a ÚLTIMA semana de conteúdo (sem 2), dispara a
    // avaliação acumulada single-comp em background (mesmo padrão do trigger
    // da sem 13 no regular). Persiste em sem 2.feedback.acumulado — insumo de
    // triangulação do scorer no fechamento (sem 3). Não bloqueia a resposta.
    if (
      finished &&
      programaConfig.modo === 'piloto' &&
      semanaPlan.tipo === 'conteudo' &&
      Number(semana) === programaConfig.semanaAcumulada
    ) {
      (async () => {
        try {
          const { gerarAvaliacaoAcumulada } = await import('@/actions/avaliacao-acumulada');
          await gerarAvaliacaoAcumulada(trilhaId);
        } catch (e: any) {
          console.error('[piloto acumulada sem 2]', e?.message);
        }
      })();
    }

    // Modo Onboarding: ao concluir missão integradora (4/7/9), dispara acumulada
    // parcial em background — agrega evidências das comps cobertas até aqui.
    if (
      finished &&
      programaConfig.modo === 'onboarding' &&
      semanaPlan.tipo === 'aplicacao' &&
      programaConfig.semanasMissao.includes(Number(semana)) &&
      programaConfig.competenciasNaMissao
    ) {
      const idxs = programaConfig.competenciasNaMissao[Number(semana)] || [];
      const { data: trilhaComp } = await sb.from('trilhas')
        .select('competencias_foco').eq('id', trilhaId).maybeSingle();
      const compsTrilha: string[] = Array.isArray(trilhaComp?.competencias_foco) ? trilhaComp!.competencias_foco : [];
      const compsCobertas = idxs.includes(-1)
        ? compsTrilha
        : idxs.map(i => compsTrilha[i]).filter(Boolean);
      if (compsCobertas.length) {
        (async () => {
          try {
            const { gerarAvaliacaoAcumuladaParcial } = await import('@/actions/avaliacao-acumulada');
            await gerarAvaliacaoAcumuladaParcial(trilhaId, compsCobertas, Number(semana), true);
          } catch (e: any) {
            console.error('[onboarding acumulada parcial]', e?.message);
          }
        })();

        // Push pro tutor — só sems 4 e 7 (brief seção 3.4; sem 9 é final).
        (async () => {
          try {
            const { notifyTutorMissaoConcluida } = await import('@/lib/notify-tutor');
            await notifyTutorMissaoConcluida({
              trilhaId,
              semana: Number(semana),
              competenciasIntegradas: compsCobertas,
            });
          } catch (e: any) {
            console.error('[onboarding notify tutor]', e?.message);
          }
        })();
      }
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

function resolveCompetenciaSemana(trilha: any, semanaPlan: any): { label: string; competencias: string[] } {
  const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
  const byDesc = new Map<string, string>(
    descritores
      .map((d: any) => [String(d.descritor), String(d.competencia || '')] as [string, string])
      .filter(([, c]) => !!c),
  );
  const comps = new Set<string>();
  if (semanaPlan.competencia) comps.add(semanaPlan.competencia);
  if (semanaPlan.descritor && byDesc.get(semanaPlan.descritor)) comps.add(byDesc.get(semanaPlan.descritor)!);
  for (const desc of semanaPlan.descritores_cobertos || []) {
    const comp = byDesc.get(desc);
    if (comp) comps.add(comp);
  }
  if (Array.isArray(semanaPlan.competencias_cobertas)) {
    for (const comp of semanaPlan.competencias_cobertas) if (comp) comps.add(comp);
  }
  if (!comps.size) comps.add(trilha.competencia_foco);
  const competencias = Array.from(comps);
  return { competencias, label: competencias.join(' + ') };
}
