import { NextResponse, after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, callAIChat } from '@/actions/ai-client';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';
import { promptEvolutionQualitative, promptEvolutionQualitativeExtract, validateEvolutionExtract } from '@/lib/season-engine/prompts/evolution-qualitative';
import { reservarFinalizacao, finalizarFechamentoCore } from '@/lib/season-engine/fechamento-core';
import { estadoDoFechamento, resumoDaAvaliacao, respostasDoCenario } from '@/lib/season-engine/estado-fechamento';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { parseJsonIA } from '@/lib/ai-json';
import { gerarEvolutionReportCore } from '@/lib/season-engine/evolution-report-core';
import { gravarProgressoSemana, liberarProximaSemana } from '@/lib/season-engine/progresso-semana';
import { checarGatesSemana, gateAcumuladaPiloto, resolverConfigDaTrilha, qualitativaDoPlano } from '@/lib/season-engine/trilha-runtime';
import { TURNOS_IA_AVALIACAO_QUALITATIVA } from '@/lib/season-engine/week-gating';
import { pareceFechamento, reforcoDeFechamento, registrarConversaSemFechamento, fechamentoSeguro } from '@/lib/season-engine/fechamento-conversa';
import { escolherCenarioB } from '@/lib/season-engine/cenario-b';
import { abrirArguicao, turnoArguicao, extrairEvidenciasArguicao, type ArguicaoContexto, type ArguicaoEstado } from '@/lib/season-engine/arguicao';
import { PROGRESSO } from '@/lib/status';
import { comContexto } from '@/lib/execucao-contexto';

// O turno final da arguição (turno + extração) e a pontuação em `after()`
// (scorer + check 2ª IA + Evolution Report) dividem esta função. Fluid até 300s.
export const maxDuration = 300;

/**
 * Até quando, contado do início do request, a pontuação disparada em `after()`
 * pode rodar. 15 s abaixo do `maxDuration`: gravar a nota e o relatório também
 * precisam caber. `pontuarFechamento` distribui o que sobra entre scorer e check.
 */
const PRAZO_FECHAMENTO_MS = 285_000;

/**
 * POST /api/temporada/evaluation
 * Body: { trilhaId, semana, message?, action: 'init'|'send'|'generate_report' }
 *
 * Semana da acumulada (regular=13): conversa qualitativa aberta (12 turns).
 * Semana do cenário B (regular=14): cenário → 4 perguntas → pontuação via IA.
 * generate_report: consolida ambas em Evolution Report.
 *
 * Quais semanas correspondem a quê vem de `empresas.sys_config` via
 * `getProgramaConfig` — em Modo Onboarding a acumulada é embutida nas
 * missões e o cenário B fica na sem 10.
 */
/** Monta o contexto da arguição a partir do estado do fechamento na rota:
 *  agrega as 4 respostas do cenário como a "tese" a ser defendida. */
function montarCtxArguicao(opts: {
  cenario: string; perguntas: any[]; historico: any[];
  colab: any; competenciasLabel: string; descritores: any[]; isPiloto: boolean;
}): ArguicaoContexto {
  const respostasUser = opts.historico.filter((m: any) => m.role === 'user');
  const respostaCenario = opts.perguntas.map((p: any, i: number) =>
    `[${p.dimensao}] ${p.texto}\n\u2192 ${respostasUser[i]?.content || '(sem resposta)'}`
  ).join('\n\n');
  return {
    nomeColab: (opts.colab?.nome_completo || '').split(' ')[0] || 'voc\u00ea',
    cargo: opts.colab?.cargo,
    competencia: opts.competenciasLabel,
    perfilDominante: opts.colab?.perfil_dominante,
    cenario: opts.cenario,
    respostaCenario,
    descritores: opts.descritores,
    isPiloto: opts.isPiloto,
  };
}

export async function POST(request) {
  // Declara o orcamento de tempo para o ledger (mig 230): sem isto toda
  // chamada de IA daqui entra como runtime "desconhecido" e a pergunta
  // "estamos perto do timeout?" fica sem denominador.
  return comContexto({ runtime: 'rota', orcamentoMs: 300 * 1000, onde: 'api/temporada/evaluation' }, async () => {
  const inicioMs = Date.now();
  try {
    const csrf = csrfCheck(request);
    if (csrf) return csrf;

    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const limited = await aiLimiter.check(request, auth.email);
    if (limited) return limited;

    const body = await request.json();
    const { trilhaId, semana, message, action = 'send', colaboradorId: colabBody, aiConfig = {} } = body;
    if (!trilhaId || !semana) return NextResponse.json({ error: 'trilhaId+semana' }, { status: 400 });

    const sb = createSupabaseAdmin();
    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados, data_inicio, programa_modo, programa_config')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha' }, { status: 404 });

    // Config pela FONTE ÚNICA (carimbo da trilha, mig 154 → fallback sys_config)
    const programaConfig = await resolverConfigDaTrilha(sb, trilha);
    const semAcumulada = programaConfig.semanaAcumulada;     // regular = 13
    const semCenarioB = programaConfig.semanaCenarioB;       // regular = 14

    // Valida colab: body (se veio) tem que bater com trilha + usuário com acesso.
    if (colabBody && colabBody !== trilha.colaborador_id) {
      return NextResponse.json({ error: 'colaboradorId não corresponde à trilha' }, { status: 403 });
    }
    const guard = await assertColabAccess(auth, trilha.colaborador_id);
    if (guard) return guard;

    if (action === 'generate_report') {
      // Núcleo headless: a sessão é do COLAB (assertColabAccess já validou o dono
      // da trilha acima) — passa o tenant da SESSÃO (B5), sem endpoint gatado.
      const r = await gerarEvolutionReportCore(trilhaId, { empresaId: auth.empresaId });
      return NextResponse.json(r);
    }

    // Polling do piloto: o client consulta o status da acumulada (disparada em
    // Trigger.dev no fim da sem 2) enquanto mostra "preparando avaliação…".
    if (action === 'status') {
      const { data: acumRow } = await sb.from('temporada_semana_progresso')
        .select('acumulada_status, acumulada_erro')
        .eq('trilha_id', trilhaId).eq('semana', semAcumulada).maybeSingle();
      return NextResponse.json({
        acumulada_status: acumRow?.acumulada_status ?? null,
        acumulada_erro: acumRow?.acumulada_erro ?? null,
      });
    }

    // Gates (temporal com espelho do plano + progressão) — fonte única em
    // trilha-runtime. No piloto o fechamento (sem 3) herda o calendário da
    // sem 2 (calendario_semana no snapshot); o gate real é a progressão.
    const gate = await checarGatesSemana(sb, trilha, semana);
    if (gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();
    const nome = (colab?.nome_completo || '').split(' ')[0] || 'você';
    const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];
    const competenciasLabel = Array.isArray((trilha as any).competencias_foco) && (trilha as any).competencias_foco.length > 1
      ? (trilha as any).competencias_foco.join(' + ')
      : trilha.competencia_foco;

    const { data: prog } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();
    const slotKey = Number(semana) === semCenarioB ? 'feedback' : 'reflexao';
    const dados = prog?.[slotKey] || { transcript_completo: [] };
    const historico = Array.isArray(dados.transcript_completo) ? dados.transcript_completo : [];

    // Semana da acumulada (regular=13): conversa qualitativa.
    // Piloto NÃO tem esta etapa: semanaAcumulada=2 é só o ENDEREÇO de
    // persistência do acumulado (roda em background ao concluir a sem 2,
    // via /reflection) — a sem 2 é de conteúdo, nunca conversa qualitativa.
    if (Number(semana) === semAcumulada && programaConfig.modo !== 'piloto') {
      if (action === 'send' && message) {
        historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      }
      const turnsIA = historico.filter(m => m.role === 'assistant').length;
      // Régua única (week-gating): a tela da semana usa o MESMO número para
      // dizer quantas respostas faltam para a semana 13 concluir.
      // Do PLANO primeiro, depois da config: a qualitativa custa 12 turnos no
      // formato de 14 semanas, e num encerramento curto isso vira pedágio na
      // frente do Cenário B. O plano vem antes porque é o que as TELAS leem
      // (elas não recebem a ProgramaConfig) — mesma régua nas duas pontas, via
      // `qualitativaDoPlano`. Ausente nos dois → 12, comportamento de sempre.
      const TOTAL = qualitativaDoPlano(trilha.temporada_plano)?.turnos
        ?? programaConfig.turnosQualitativa
        ?? TURNOS_IA_AVALIACAO_QUALITATIVA;

      // Coleta insights das semanas anteriores à acumulada pra contextualizar
      const { data: outrasSem } = await sb.from('temporada_semana_progresso')
        .select('reflexao').eq('trilha_id', trilhaId).lt('semana', semAcumulada).not('reflexao', 'is', null);
      const insightsAnteriores = (outrasSem || []).map(s => s.reflexao?.insight_principal).filter(Boolean);

      const proximoTurnIA = turnsIA + 1;
      // PII masking — sem 13 qualitativa
      const { masked: colabMaskedQ, map: piiMapQ } = maskColaborador(colab);
      const insightsAnterioresMask = (insightsAnteriores || []).map(i => maskTextPII(i, piiMapQ));
      const historicoMaskQ = historico.map(m => ({ ...m, content: maskTextPII(m.content, piiMapQ) }));

      const { system, systemSuffix, fechamentoSuffix } = promptEvolutionQualitative({
        nomeColab: colabMaskedQ.nome,
        cargo: colab?.cargo,
        perfilDominante: colab?.perfil_dominante,
        competencia: competenciasLabel,
        descritores,
        insightsAnteriores: insightsAnterioresMask,
        turnIA: proximoTurnIA, totalTurns: TOTAL,
      });
      const messages = historicoMaskQ.map(m => ({ role: m.role, content: m.content }));
      if (proximoTurnIA === 1 && messages.length === 0) {
        messages.push({ role: 'user', content: '[INICIE A CONVERSA conforme o TURN 1]' });
      }
      let respostaIA = (await callAIChat(system, messages, {}, 4000, { taskKey: 'sem13_qualitativa', systemSuffix, empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id })).trim();

      const finished = proximoTurnIA >= TOTAL;

      /**
       * REDE DE SEGURANÇA DO FECHAMENTO — a gêmea de `reflection/route.ts`.
       * `finished` é contagem, e contagem não olha o que a IA escreveu: se o
       * turno 12 saiu como pergunta, a tela dá a conversa por concluída em cima
       * de uma pergunta sem resposta possível.
       *
       * `marcadores: false` porque o fechamento desta conversa é em PROSA
       * (síntese + frase final, sem bullets) — aqui a régua é só não terminar
       * perguntando.
       */
      if (finished && !pareceFechamento(respostaIA, { marcadores: false })) {
        try {
          const forcado = (await callAIChat(system, messages, {}, 4000, {
            taskKey: 'sem13_qualitativa',
            empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id,
            systemSuffix: fechamentoSuffix ? reforcoDeFechamento(fechamentoSuffix) : systemSuffix,
          })).trim();
          if (forcado && pareceFechamento(forcado, { marcadores: false })) respostaIA = forcado;
        } catch (err: any) {
          console.warn('[evaluation] fechamento forçado falhou:', err?.message);
        }
        if (!pareceFechamento(respostaIA, { marcadores: false })) {
          respostaIA = fechamentoSeguro(false);
          after(() => registrarConversaSemFechamento(sb, {
            empresaId: trilha.empresa_id,
            colaboradorId: trilha.colaborador_id,
            semana: Number(semana),
            tipoConversa: 'sem13_qualitativa',
            tentativas: 2,
            fechamentoSeguro: true,
          }));
        }
      }

      // Despersonaliza output antes de persistir
      respostaIA = unmaskPII(respostaIA, piiMapQ);
      historico.push({ role: 'assistant', content: respostaIA, timestamp: new Date().toISOString(), turn: proximoTurnIA });
      const novoSlot = { ...dados, transcript_completo: historico };
      if (finished) {
        // Extrai dados estruturados
        try {
          const transcript = historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
          const { system: s2, user: u2 } = promptEvolutionQualitativeExtract({ descritores, transcript });
          const r = await callAI(s2, u2, {}, 8000, {
            taskKey: 'temporada_extracao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id,
          });
          const parsed = validateEvolutionExtract(parseJsonIA(r), descritores);
          Object.assign(novoSlot, parsed);
        } catch (e) { console.error('[VERTHO] extract sem13:', e.message); }
      }

      await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished });

      // Ao finalizar a sem 13, dispara automaticamente a avaliação acumulada
      // (1ª IA + check por 2ª IA). Roda em background: não bloqueia a resposta
      // ao colab. Persiste em feedback.acumulado pra consumo pela sem 14.
      if (finished) {
        // after(): fire-and-forget solto MORRE quando a lambda congela após
        // o response — after() mantém a função viva até o trabalho terminar.
        after(async () => {
          try {
            // Núcleo headless (sem endpoint): o usuário da sessão é o COLAB
            // (não admin) — a action gatada morreria em FORBIDDEN silencioso.
            const { gerarAvaliacaoAcumuladaCore } = await import('@/lib/season-engine/avaliacao-acumulada-core');
            await gerarAvaliacaoAcumuladaCore(trilhaId, { empresaId: auth.empresaId });
          } catch (e) {
            console.error('[VERTHO] avaliação acumulada sem 13:', e?.message);
          }
        });
      }

      if (finished && Number(semana) < semCenarioB) await liberarProxima(sb, trilhaId, semCenarioB, trilha.empresa_id);

      return NextResponse.json({ message: respostaIA, turnIA: proximoTurnIA, finished, history: historico });
    }

    // Semana do cenário B (regular=14): cenário + 4 perguntas → pontuação
    if (Number(semana) === semCenarioB) {
      const DIMENSOES = [
        { key: 'p1', label: 'SITUAÇÃO' },
        { key: 'p2', label: 'AÇÃO' },
        { key: 'p3', label: 'RACIOCÍNIO' },
        { key: 'p4', label: 'AUTOSSENSIBILIDADE' },
      ];

      // PII masking compartilhado por arguição (chat) e scorer (pontuação).
      const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
      const piiArg = { map: piiMap, nomeMasked: colabMasked?.nome };

      /**
       * Dispara a pontuação do fechamento FORA do request.
       *
       * 🔴 Até 16/09/2026 a nota saía aqui dentro, no mesmo request da última
       * fala da arguição, e o scorer abortava no teto de 120 s do `callAI`
       * (medido: a única execução que passou levou 119.748 ms). Agora a reserva
       * é síncrona e a pontuação roda em `after()`: a resposta volta em
       * segundos, e fechar o celular não perde a nota. A tela acompanha por
       * `fechamento_status`.
       *
       * O núcleo é o mesmo do script de resgate (`fechamento-core`), então o
       * caminho que roda em produção é o que os testes exercitam.
       */
      const dispararFinalizacao = async () => {
        const reserva = await reservarFinalizacao(trilhaId, { empresaId: trilha.empresa_id });
        // `in`, não `.ok`: com `strict: false` a união por booleano não estreita.
        if (!('token' in reserva)) {
          return { estado: reserva.estado, erro: reserva.erro ?? null, avaliacao: reserva.avaliacao ?? null };
        }
        const token = reserva.token;
        after(async () => {
          const r = await finalizarFechamentoCore(trilhaId, {
            empresaId: trilha.empresa_id, token, prazoMs: inicioMs + PRAZO_FECHAMENTO_MS,
          });
          if ('erro' in r) console.error('[VERTHO] fechamento sem nota:', trilhaId, r.erro);
        });
        return { estado: 'processando' as const, erro: null, avaliacao: null };
      };

      // Acompanhamento da pontuação (tela em polling). Só leitura.
      if (action === 'fechamento_status') {
        const leitura = estadoDoFechamento(prog, { arguicaoAtiva: !!programaConfig.arguicao?.ativa }, Date.now());
        return NextResponse.json({
          ...leitura,
          avaliacao: leitura.estado === 'avaliado' ? resumoDaAvaliacao(dados) : null,
        });
      }

      // Retomada: a pessoa já respondeu tudo e a nota não saiu (ou nunca foi pedida).
      if (action === 'finalizar') {
        const r = await dispararFinalizacao();
        if (r.estado === 'processando') return NextResponse.json({ estado: 'processando' }, { status: 202 });
        if (r.estado === 'avaliado') return NextResponse.json({ estado: 'avaliado', avaliacao: r.avaliacao });
        return NextResponse.json({ estado: r.estado, error: r.erro || `fechamento não pode ser pontuado agora (${r.estado})` }, { status: 409 });
      }

      if (action === 'init') {
        // Gate do piloto: o fechamento só abre quando a avaliação acumulada
        // (disparada no fim da sem 2, em Trigger.dev) terminou — evita o scorer
        // rodar sem triangulação (B2).
        if (programaConfig.modo === 'piloto') {
          const { data: acumRow } = await sb.from('temporada_semana_progresso')
            .select('acumulada_status, acumulada_started_at')
            .eq('trilha_id', trilhaId).eq('semana', semAcumulada).maybeSingle();
          const gate = gateAcumuladaPiloto(acumRow, Date.now());
          if (!gate.pronto) {
            if (gate.redisparar) {
              // Self-heal: NÃO re-dispara a Trigger — se ela FALHOU no runtime
              // (ex.: env faltando), re-disparar falharia de novo e prenderia o
              // colab. Roda a acumulada INLINE (after) no ambiente da Vercel, que
              // tem env conhecido. Cobre task perdida/travada E falha de runtime.
              const claimStamp = new Date().toISOString();
              await sb.from('temporada_semana_progresso')
                .update({ acumulada_status: 'processing', acumulada_erro: null, acumulada_started_at: claimStamp })
                .eq('trilha_id', trilhaId).eq('semana', semAcumulada).eq('empresa_id', trilha.empresa_id);
              after(async () => {
                try {
                  // N2 (fail-safe): se já concluiu (Trigger/outra req) ou se outra
                  // requisição re-claimou DEPOIS de mim, não recomputa (evita
                  // double-run). Errar aqui só faz rodar 2x — nunca prende.
                  const { data: cur } = await sb.from('temporada_semana_progresso')
                    .select('acumulada_status, acumulada_started_at')
                    .eq('trilha_id', trilhaId).eq('semana', semAcumulada).maybeSingle();
                  if (cur?.acumulada_status === 'done') return;
                  if (cur?.acumulada_started_at && cur.acumulada_started_at > claimStamp) return;
                  const { gerarAvaliacaoAcumuladaCore } = await import('@/lib/season-engine/avaliacao-acumulada-core');
                  await gerarAvaliacaoAcumuladaCore(trilhaId, { empresaId: auth.empresaId });
                  await sb.from('temporada_semana_progresso')
                    .update({ acumulada_status: 'done', acumulada_erro: null })
                    .eq('trilha_id', trilhaId).eq('semana', semAcumulada).eq('empresa_id', trilha.empresa_id);
                } catch (e2: any) {
                  await sb.from('temporada_semana_progresso')
                    .update({ acumulada_status: 'error', acumulada_erro: String(e2?.message || e2).slice(0, 500) })
                    .eq('trilha_id', trilhaId).eq('semana', semAcumulada).eq('empresa_id', trilha.empresa_id);
                }
              });
            }
            return NextResponse.json({
              processando: true,
              message: 'Estamos preparando sua avaliação com base em toda a sua jornada. Isso leva alguns instantes…',
            }, { status: 202 });
          }
        }
        let cenario = dados.cenario;
        let perguntas = dados.perguntas;
        let cenario_b_id = dados.cenario_b_id || null;

        if (!cenario || !perguntas) {
          const cargoColab = colab?.cargo || 'todos';
          // O B tem que ser da competência da trilha (lib/season-engine/cenario-b.ts).
          // Uma vez servido, fica gravado no slot abaixo: retomar usa o mesmo.
          const competenciasDaTrilha = Array.isArray((trilha as any).competencias_foco) && (trilha as any).competencias_foco.length
            ? (trilha as any).competencias_foco
            : [trilha.competencia_foco];
          const escolha = await escolherCenarioB(sb, trilha.empresa_id, cargoColab, competenciasDaTrilha, {
            colaboradorId: trilha.colaborador_id, trilhaId,
          });
          const cenB = escolha.cenario;

          if (!cenB?.descricao) {
            return NextResponse.json({
              error: escolha.motivo === 'sem-competencia-na-trilha'
                ? 'A trilha não tem competência definida, então não há como escolher o Cenário B.'
                : `Cenário B não cadastrado para ${competenciasLabel} + cargo ${cargoColab}.`,
            }, { status: 424 });
          }
          cenario = `## ${cenB.titulo || 'Cenário final'}\n\n${cenB.descricao}`;
          cenario_b_id = cenB.id;
          const alt = cenB.alternativas || {};
          perguntas = DIMENSOES.map(d => ({ dimensao: d.label, texto: alt[d.key] || '' })).filter(p => p.texto);
          if (perguntas.length === 0) {
            return NextResponse.json({
              error: 'Cenário B encontrado mas sem perguntas (alternativas.p1..p4 ausentes). Regere o cenário B.',
            }, { status: 424 });
          }
        }

        // Apresenta a 1ª pergunta (cenário já está no card acima — não duplica).
        // Sem IA no meio: perguntas são estáticas vindas do banco.
        if (historico.length === 0) {
          const primeira = perguntas[0];
          const abertura = `**${primeira?.dimensao || 'SITUAÇÃO'}**\n\n${primeira?.texto || ''}`;
          historico.push({ role: 'assistant', content: abertura, timestamp: new Date().toISOString(), turn: 1, dimensao: primeira?.dimensao });
        }

        const novoSlot = { ...dados, cenario, cenario_b_id, perguntas, transcript_completo: historico };
        await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished: false });
        return NextResponse.json({ cenario, cenario_b_id, perguntas, history: historico, finished: false });
      }

      // action === 'arguir': turno da ARGUIÇÃO (defesa oral) — só quando ligada.
      // Conduz a conversa (Fase A), persiste em feedback.arguicao e, ao ENCERRAR,
      // dispara o scorer (Fase C) já com a fusão da defesa oral (Fase B). Gate
      // off (default) = branch nunca entra.
      if (action === 'arguir') {
        if (!programaConfig.arguicao?.ativa) return NextResponse.json({ error: 'arguição desativada' }, { status: 400 });
        if (!message) return NextResponse.json({ error: 'message obrigatório' }, { status: 400 });
        const estadoArg = dados.arguicao as ArguicaoEstado | undefined;
        if (!estadoArg || estadoArg.concluida) return NextResponse.json({ error: 'arguição não está em andamento' }, { status: 400 });
        const ctxArg = montarCtxArguicao({ cenario: dados.cenario, perguntas: dados.perguntas || [], historico, colab, competenciasLabel, descritores, isPiloto: programaConfig.modo === 'piloto' });
        const { estado, reply, concluida } = await turnoArguicao(ctxArg, estadoArg, message, programaConfig.arguicao.maxTurnos, aiConfig, piiArg);
        const arguicao: any = estado;
        if (concluida) arguicao.extracao = await extrairEvidenciasArguicao(ctxArg, estado, aiConfig, piiArg);
        const novoSlot = { ...dados, arguicao };
        await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished: false });
        // AMARRAÇÃO (Fase C): ao encerrar a defesa oral, a pontuação é DISPARADA
        // (em after(), com a extração da arguição fundida no scorer). O fecho da
        // IA (reply) volta já; a nota chega pelo `fechamento_status`.
        if (concluida) {
          const r = await dispararFinalizacao();
          return NextResponse.json({
            arguicaoConcluida: true, message: reply, turno: estado.turno,
            finalizando: r.estado === 'processando', fechamento: r.estado,
          });
        }
        return NextResponse.json({ arguindo: true, arguicaoConcluida: false, message: reply, turno: estado.turno, finished: false });
      }

      // action === 'send': colab respondeu. Pode ser pergunta 1-3 (faz próxima) ou pergunta 4 (scorer).
      if (!message) return NextResponse.json({ error: 'message obrigatório' }, { status: 400 });
      const cenario = dados.cenario;
      const perguntas = dados.perguntas || [];
      if (!cenario || !perguntas.length) return NextResponse.json({ error: 'cenário não iniciado — chame action=init primeiro' }, { status: 400 });

      /**
       * 🔴 RESPOSTAS COMPLETAS NÃO RECEBEM MAIS FALA. Antes, quem reabria a tela
       * sem nota caía no formulário e reenviava as 4 respostas: cada `send`
       * empurrava uma fala nova (um caso real ficou com 5) e rodava o scorer outra vez,
       * até 4 pontuações pagas por clique. Com tudo respondido, só resta abrir a
       * arguição que falta ou pedir a pontuação (`finalizar`).
       */
      if (respostasDoCenario(dados) >= perguntas.length) {
        if (!(programaConfig.arguicao?.ativa && !dados.arguicao)) {
          const leitura = estadoDoFechamento(prog, { arguicaoAtiva: !!programaConfig.arguicao?.ativa }, Date.now());
          return NextResponse.json({ error: 'As respostas do cenário já foram registradas.', fechamento: leitura.estado }, { status: 409 });
        }
      } else {
        historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      }

      const respostasColab = historico.filter(m => m.role === 'user').length; // 1..4

      // Se ainda há pergunta a fazer: mostra próxima pergunta (sem IA, texto estático)
      if (respostasColab < perguntas.length) {
        const proxima = perguntas[respostasColab];
        const msgIA = `**${proxima.dimensao}**\n\n${proxima.texto}`;
        historico.push({ role: 'assistant', content: msgIA, timestamp: new Date().toISOString(), turn: respostasColab + 1, dimensao: proxima.dimensao });
        const novoSlot = { ...dados, transcript_completo: historico, cenario, perguntas };
        await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished: false });
        return NextResponse.json({ message: msgIA, history: historico, finished: false, dimensao: proxima.dimensao });
      }

      // Respondeu à última pergunta. Se a ARGUIÇÃO está ligada, abre a defesa
      // oral ANTES de pontuar (Fase A: só a conversa; a fusão é Fase B). Gate
      // off (default) → cai direto no scorer, fechamento atual byte-igual.
      if (programaConfig.arguicao?.ativa && !dados.arguicao) {
        const ctxArg = montarCtxArguicao({ cenario, perguntas, historico, colab, competenciasLabel, descritores, isPiloto: programaConfig.modo === 'piloto' });
        const { estado, reply } = await abrirArguicao(ctxArg, programaConfig.arguicao.maxTurnos, aiConfig, piiArg);
        const novoSlot = { ...dados, transcript_completo: historico, cenario, perguntas, arguicao: estado };
        await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished: false });
        return NextResponse.json({ arguindo: true, arguicaoConcluida: false, message: reply, turno: 1, finished: false });
      }

      // Última resposta com a arguição desligada: grava a resposta e dispara a
      // pontuação pelo MESMO caminho da arguição (um só lugar pontua).
      const novoSlotFinal = { ...dados, transcript_completo: historico, cenario, perguntas };
      await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot: novoSlotFinal, finished: false });
      const r = await dispararFinalizacao();
      return NextResponse.json({ finalizando: r.estado === 'processando', fechamento: r.estado, finished: false });
    }

    return NextResponse.json({ error: `Semana ${semana} inválida pra /evaluation — esperado ${semAcumulada} ou ${semCenarioB}` }, { status: 400 });
  } catch (err) {
    console.error('[VERTHO] /evaluation:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
  });
}




/**
 * Delega para `lib/season-engine/progresso-semana`, que LANÇA quando a gravação
 * falha (F10). Antes o `{ error }` do supabase-js era ignorado aqui: a rota
 * respondia 200, a UI marcava a semana como concluída e a próxima destravava —
 * com o slot desta vazio. O helper é compartilhado com a rota gêmea da
 * reflection, que fazia o mesmo em outro formato.
 */
async function upsertProg(sb, { prog, trilhaId, semana, tipo, empresaId, colaboradorId, slotKey, novoSlot, finished }) {
  const payload = {
    trilha_id: trilhaId, empresa_id: empresaId, colaborador_id: colaboradorId,
    semana: Number(semana), tipo, status: finished ? PROGRESSO.CONCLUIDO : PROGRESSO.EM_ANDAMENTO,
    [slotKey]: novoSlot,
    ...(finished ? { concluido_em: new Date().toISOString() } : { iniciado_em: prog?.iniciado_em || new Date().toISOString() }),
  };
  await gravarProgressoSemana(sb, payload, prog?.id);
}

async function liberarProxima(sb, trilhaId, proxima, empresaId) {
  await liberarProximaSemana(sb, trilhaId, proxima, empresaId);
}
