import { NextResponse, after } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, callAIChat } from '@/actions/ai-client';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';
import { promptEvolutionQualitative, promptEvolutionQualitativeExtract, validateEvolutionExtract } from '@/lib/season-engine/prompts/evolution-qualitative';
import { pontuarFechamento } from '@/lib/season-engine/fechamento-scorer';
import { agregarEvidenciasAteAcumulada, normalizarAcumuladoPrimaria } from '@/lib/season-engine/evidencias-fechamento';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { parseJsonIA } from '@/lib/ai-json';
import { gerarEvolutionReport } from '@/actions/evolution-report';
import { checarGatesSemana, resolverConfigDaTrilha } from '@/lib/season-engine/trilha-runtime';
import { enriquecerComRegua, sobreporNotaFresh } from '@/lib/season-engine/regua';

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
    if (!trilhaId || !semana) return NextResponse.json({ error: 'trilhaId+semana' }, { status: 400 });

    const sb = createSupabaseAdmin();
    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, competencias_foco, temporada_plano, descritores_selecionados, data_inicio, programa_modo')
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
      // internal=true: a sessão é do COLAB (assertColabAccess já validou o
      // dono da trilha acima) — sem o flag morria em FORBIDDEN silencioso.
      const r = await gerarEvolutionReport(trilhaId, true);
      return NextResponse.json(r);
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
      const TOTAL = 12;

      // Coleta insights das semanas anteriores à acumulada pra contextualizar
      const { data: outrasSem } = await sb.from('temporada_semana_progresso')
        .select('reflexao').eq('trilha_id', trilhaId).lt('semana', semAcumulada).not('reflexao', 'is', null);
      const insightsAnteriores = (outrasSem || []).map(s => s.reflexao?.insight_principal).filter(Boolean);

      const proximoTurnIA = turnsIA + 1;
      // PII masking — sem 13 qualitativa
      const { masked: colabMaskedQ, map: piiMapQ } = maskColaborador(colab);
      const insightsAnterioresMask = (insightsAnteriores || []).map(i => maskTextPII(i, piiMapQ));
      const historicoMaskQ = historico.map(m => ({ ...m, content: maskTextPII(m.content, piiMapQ) }));

      const { system } = promptEvolutionQualitative({
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
      let respostaIA = (await callAIChat(system, messages, {}, 4000)).trim();
      // Despersonaliza output antes de persistir
      respostaIA = unmaskPII(respostaIA, piiMapQ);
      historico.push({ role: 'assistant', content: respostaIA, timestamp: new Date().toISOString(), turn: proximoTurnIA });

      const finished = proximoTurnIA >= TOTAL;
      const novoSlot = { ...dados, transcript_completo: historico };
      if (finished) {
        // Extrai dados estruturados
        try {
          const transcript = historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
          const { system: s2, user: u2 } = promptEvolutionQualitativeExtract({ descritores, transcript });
          const r = await callAI(s2, u2, {}, 8000);
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
            const { gerarAvaliacaoAcumulada } = await import('@/actions/avaliacao-acumulada');
            // internal=true: o usuário da sessão é o COLAB (não admin) — sem
            // o flag o trigger morria em FORBIDDEN silencioso.
            await gerarAvaliacaoAcumulada(trilhaId, true);
          } catch (e) {
            console.error('[VERTHO] avaliação acumulada sem 13:', e?.message);
          }
        });
      }

      if (finished && Number(semana) < semCenarioB) await liberarProxima(sb, trilhaId, semCenarioB);

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

      if (action === 'init') {
        let cenario = dados.cenario;
        let perguntas = dados.perguntas;
        let cenario_b_id = dados.cenario_b_id || null;

        if (!cenario || !perguntas) {
          const { data: cenB } = await sb.from('banco_cenarios')
            .select('id, titulo, descricao, alternativas')
            .eq('empresa_id', trilha.empresa_id)
            .eq('cargo', colab?.cargo || 'todos')
            .eq('tipo_cenario', 'cenario_b')
            .limit(1).maybeSingle();

          if (!cenB?.descricao) {
            return NextResponse.json({
              error: `Cenário B não cadastrado para ${competenciasLabel} + cargo ${colab?.cargo || 'todos'}.`,
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

      // action === 'send': colab respondeu. Pode ser pergunta 1-3 (faz próxima) ou pergunta 4 (scorer).
      if (!message) return NextResponse.json({ error: 'message obrigatório' }, { status: 400 });
      const cenario = dados.cenario;
      const perguntas = dados.perguntas || [];
      if (!cenario || !perguntas.length) return NextResponse.json({ error: 'cenário não iniciado — chame action=init primeiro' }, { status: 400 });

      historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

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

      // Colab respondeu à última pergunta → scorer
      // Monta "resposta" como concatenação das 4 respostas rotuladas por dimensão
      const respostasUser = historico.filter(m => m.role === 'user');
      const respostaAgregada = perguntas.map((p, i) =>
        `[${p.dimensao}] ${p.texto}\n→ ${respostasUser[i]?.content || '(sem resposta)'}`
      ).join('\n\n');

      // Enriquece descritores com a régua de maturidade (n1-n4) + nota_pre FRESH
      // de descriptor_assessments (não do snapshot JSONB, que pode estar desatualizado).
      const enriquecidos = await enriquecerComRegua({
        db: sb, sbGlobal: sb, empresaId: trilha.empresa_id,
        competencia: trilha.competencia_foco, descritores,
      });
      const descritoresComRegua = await sobreporNotaFresh(sb, trilha.colaborador_id, trilha.competencia_foco, enriquecidos);

      // Carrega avaliação acumulada (se já calculada no fim da semana da acumulada).
      // Prioridade pro scorer: nota_acumulada por descritor (estruturada).
      // Fallback: evidências textuais agregadas.
      const { data: progAcum } = await sb.from('temporada_semana_progresso')
        .select('feedback').eq('trilha_id', trilhaId).eq('semana', semAcumulada).maybeSingle();
      const acumuladoPrimaria = normalizarAcumuladoPrimaria(progAcum?.feedback?.acumulado);

      // Agrega evidências de TODAS as semanas até a acumulada (conteúdo + prática
      // + sem acumulada) pra triangulação. A nota_pos NUNCA sai só do cenário.
      // Piloto: a reflexão da semana evidencia os 2 descritores da semana.
      const evidenciasAcumuladas = await agregarEvidenciasAteAcumulada(sb, trilhaId, descritoresComRegua, semAcumulada, programaConfig.modo === 'piloto');

      // PII masking pra chamadas IA externas — substitui nome real + sanitiza
      // texto livre (emails/telefones/menções) antes de enviar.
      const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
      const respostaMasked = maskTextPII(respostaAgregada, piiMap);
      const evidenciasMasked = maskTextPII(evidenciasAcumuladas, piiMap);

      // Scorer + trava + check — NÚCLEO compartilhado com a auditoria-sem14
      // (lib/season-engine/fechamento-scorer). Inputs mascarados; unmask abaixo.
      const resultadoScorer = await pontuarFechamento({
        competencia: competenciasLabel,
        descritores: descritoresComRegua,
        cenario,
        resposta: respostaMasked,
        nomeColab: colabMasked.nome,
        perfilDominante: colab?.perfil_dominante,
        evidenciasAcumuladas: evidenciasMasked,
        acumuladoPrimaria,
        config: programaConfig,
      });
      if (resultadoScorer.meta.warnings.length) {
        console.warn('[VERTHO] fechamento warnings:', resultadoScorer.meta.warnings.join(' | '));
      }
      // Guard: parse vazio ou narrativa piloto inválida → NÃO finaliza. Erro
      // recuperável — a última resposta não foi persistida, reenviar reprocessa.
      if (!resultadoScorer.ok) {
        return NextResponse.json({
          error: 'A avaliação automática falhou ao processar sua resposta. Nada foi perdido — envie a última resposta novamente para reprocessar.',
        }, { status: 502 });
      }
      const parsed = resultadoScorer.parsed;
      const auditoria = resultadoScorer.auditoria;

      // Despersonaliza campos textuais do output (primária)
      if (parsed?.resumo_avaliacao?.mensagem_geral) parsed.resumo_avaliacao.mensagem_geral = unmaskPII(parsed.resumo_avaliacao.mensagem_geral, piiMap);
      if (Array.isArray(parsed?.avaliacao_por_descritor)) {
        parsed.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => ({
          ...d, justificativa: unmaskPII(d.justificativa, piiMap),
        }));
      }

      if (auditoria?.resumo_auditoria) auditoria.resumo_auditoria = unmaskPII(auditoria.resumo_auditoria, piiMap);

      const novoSlot = {
        ...dados, ...parsed,
        auditoria, // { nota_auditoria, status, ajustes_sugeridos, alertas, resumo_auditoria }
        cenario, transcript_completo: historico, cenario_resposta: respostaAgregada,
      };
      await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished: true });

      // Gera Evolution Report automático (internal: sessão é do colab)
      const report = await gerarEvolutionReport(trilhaId, true);

      return NextResponse.json({
        finished: true,
        avaliacao: parsed,
        auditoria,
        evolution_report: report.evolution_report,
      });
    }

    return NextResponse.json({ error: `Semana ${semana} inválida pra /evaluation — esperado ${semAcumulada} ou ${semCenarioB}` }, { status: 400 });
  } catch (err) {
    console.error('[VERTHO] /evaluation:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}




async function upsertProg(sb, { prog, trilhaId, semana, tipo, empresaId, colaboradorId, slotKey, novoSlot, finished }) {
  const payload = {
    trilha_id: trilhaId, empresa_id: empresaId, colaborador_id: colaboradorId,
    semana: Number(semana), tipo, status: finished ? 'concluido' : 'em_andamento',
    [slotKey]: novoSlot,
    ...(finished ? { concluido_em: new Date().toISOString() } : { iniciado_em: prog?.iniciado_em || new Date().toISOString() }),
  };
  if (prog) await sb.from('temporada_semana_progresso').update(payload).eq('id', prog.id);
  else await sb.from('temporada_semana_progresso').insert(payload);
}

async function liberarProxima(sb, trilhaId, proxima) {
  await sb.from('temporada_semana_progresso')
    .update({ status: 'em_andamento' })
    .eq('trilha_id', trilhaId).eq('semana', proxima).eq('status', 'pendente');
}
