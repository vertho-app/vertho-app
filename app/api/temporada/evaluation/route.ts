import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, callAIChat } from '@/actions/ai-client';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';
import { promptEvolutionQualitative, promptEvolutionQualitativeExtract, validateEvolutionExtract } from '@/lib/season-engine/prompts/evolution-qualitative';
import { promptEvolutionScenarioScore } from '@/lib/season-engine/prompts/evolution-scenario';
import { promptEvolutionScenarioCheck } from '@/lib/season-engine/prompts/evolution-scenario-check';
import { maskColaborador, maskTextPII, unmaskPII } from '@/lib/pii-masker';
import { gerarEvolutionReport } from '@/actions/evolution-report';

/**
 * POST /api/temporada/evaluation
 * Body: { trilhaId, semana: 13|14, message?, action: 'init'|'send'|'generate_report' }
 *
 * Semana 13: conversa qualitativa aberta (sem limite rígido, sugere 8 turns)
 * Semana 14: cenário → resposta → pontuação via IA
 * generate_report: consolida 13+14 em Evolution Report
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
      .select('id, colaborador_id, empresa_id, competencia_foco, temporada_plano, descritores_selecionados, data_inicio')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha' }, { status: 404 });

    // Valida colab: body (se veio) tem que bater com trilha + usuário com acesso.
    if (colabBody && colabBody !== trilha.colaborador_id) {
      return NextResponse.json({ error: 'colaboradorId não corresponde à trilha' }, { status: 403 });
    }
    const guard = await assertColabAccess(auth, trilha.colaborador_id);
    if (guard) return guard;

    if (action === 'generate_report') {
      const r = await gerarEvolutionReport(trilhaId);
      return NextResponse.json(r);
    }

    // Gate temporal + progressão (idem reflection)
    const { semanaLiberadaPorData, formatarLiberacao } = await import('@/lib/season-engine/week-gating');
    if (!semanaLiberadaPorData(trilha.data_inicio, semana)) {
      return NextResponse.json({
        error: `Semana ${semana} ainda bloqueada. Libera ${formatarLiberacao(trilha.data_inicio, semana)}.`,
      }, { status: 403 });
    }
    if (Number(semana) > 1) {
      const { data: prev } = await sb.from('temporada_semana_progresso')
        .select('status').eq('trilha_id', trilhaId).eq('semana', Number(semana) - 1).maybeSingle();
      if (prev?.status !== 'concluido') {
        return NextResponse.json({ error: `Conclua a semana ${Number(semana) - 1} antes.` }, { status: 403 });
      }
    }

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo, perfil_dominante').eq('id', trilha.colaborador_id).maybeSingle();
    const nome = (colab?.nome_completo || '').split(' ')[0] || 'você';
    const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];

    const { data: prog } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();
    const slotKey = semana == 14 ? 'feedback' : 'reflexao';
    const dados = prog?.[slotKey] || { transcript_completo: [] };
    const historico = Array.isArray(dados.transcript_completo) ? dados.transcript_completo : [];

    // Semana 13: conversa qualitativa
    if (Number(semana) === 13) {
      if (action === 'send' && message) {
        historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
      }
      const turnsIA = historico.filter(m => m.role === 'assistant').length;
      const TOTAL = 12;

      // Coleta insights das semanas 1-12 pra contextualizar
      const { data: outrasSem } = await sb.from('temporada_semana_progresso')
        .select('reflexao').eq('trilha_id', trilhaId).lte('semana', 12).not('reflexao', 'is', null);
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
        competencia: trilha.competencia_foco,
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
          let cleaned = r.trim();
          if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '');
          const parsed = validateEvolutionExtract(JSON.parse(cleaned), descritores);
          Object.assign(novoSlot, parsed);
        } catch (e) { console.error('[VERTHO] extract sem13:', e.message); }
      }

      await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished });

      // Ao finalizar a sem 13, dispara automaticamente a avaliação acumulada
      // (1ª IA + check por 2ª IA). Roda em background: não bloqueia a resposta
      // ao colab. Persiste em feedback.acumulado pra consumo pela sem 14.
      if (finished) {
        (async () => {
          try {
            const { gerarAvaliacaoAcumulada } = await import('@/actions/avaliacao-acumulada');
            await gerarAvaliacaoAcumulada(trilhaId);
          } catch (e) {
            console.error('[VERTHO] avaliação acumulada sem 13:', e?.message);
          }
        })();
      }

      if (finished && Number(semana) < 14) await liberarProxima(sb, trilhaId, 14);

      return NextResponse.json({ message: respostaIA, turnIA: proximoTurnIA, finished, history: historico });
    }

    // Semana 14: cenário B + 4 perguntas sequenciais (mesmo formato do mapeamento) → pontuação
    if (Number(semana) === 14) {
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
              error: `Cenário B não cadastrado para ${trilha.competencia_foco} + cargo ${colab?.cargo || 'todos'}.`,
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
      const descritoresComRegua = await enriquecerComReguaENotaPre(
        sb, trilha.empresa_id, trilha.colaborador_id, trilha.competencia_foco, descritores
      );

      // Carrega avaliação acumulada (se já calculada no fim da sem 13).
      // Prioridade pro scorer: nota_acumulada por descritor (estruturada).
      // Fallback: evidências textuais agregadas.
      const { data: prog13 } = await sb.from('temporada_semana_progresso')
        .select('feedback').eq('trilha_id', trilhaId).eq('semana', 13).maybeSingle();
      const acumuladoPrimaria = prog13?.feedback?.acumulado?.primaria || null;

      // Agrega evidências das 13 semanas anteriores (conteúdo + prática + sem 13)
      // pra triangulação. A nota_pos NUNCA sai só do cenário.
      const evidenciasAcumuladas = await agregarEvidencias13Semanas(sb, trilhaId, descritoresComRegua);

      // PII masking pra chamadas IA externas — substitui nome real + sanitiza
      // texto livre (emails/telefones/menções) antes de enviar.
      const { masked: colabMasked, map: piiMap } = maskColaborador(colab);
      const respostaMasked = maskTextPII(respostaAgregada, piiMap);
      const evidenciasMasked = maskTextPII(evidenciasAcumuladas, piiMap);

      const { system, user } = promptEvolutionScenarioScore({
        competencia: trilha.competencia_foco,
        descritores: descritoresComRegua,
        cenario, resposta: respostaMasked, nomeColab: colabMasked.nome,
        perfilDominante: colab?.perfil_dominante,
        evidenciasAcumuladas: evidenciasMasked,
        acumuladoPrimaria,
      });
      const r = await callAI(system, user, {}, 10000);
      let parsed: any = {};
      try { parsed = JSON.parse(r.replace(/```json\n?|```\n?/g, '').trim()); } catch (e) {
        console.error('[VERTHO] parse sem14:', e.message);
      }

      // Despersonaliza campos textuais do output (resumo_avaliacao e justificativas)
      if (parsed?.resumo_avaliacao) parsed.resumo_avaliacao = unmaskPII(parsed.resumo_avaliacao, piiMap);
      if (Array.isArray(parsed?.avaliacao_por_descritor)) {
        parsed.avaliacao_por_descritor = parsed.avaliacao_por_descritor.map((d: any) => ({
          ...d, justificativa: unmaskPII(d.justificativa, piiMap),
        }));
      }

      // Check por segunda IA — também com masking aplicado
      let auditoria = null;
      try {
        const { system: sCheck, user: uCheck } = promptEvolutionScenarioCheck({
          competencia: trilha.competencia_foco,
          descritores: descritoresComRegua,
          cenario, resposta: respostaMasked,
          avaliacaoPrimaria: parsed,
          evidenciasAcumuladas: evidenciasMasked,
        });
        const rCheck = await callAI(sCheck, uCheck, {}, 8000);
        auditoria = JSON.parse(rCheck.replace(/```json\n?|```\n?/g, '').trim());
        if (auditoria?.resumo_auditoria) auditoria.resumo_auditoria = unmaskPII(auditoria.resumo_auditoria, piiMap);
      } catch (e) {
        console.error('[VERTHO] check sem14:', e.message);
      }

      const novoSlot = {
        ...dados, ...parsed,
        auditoria, // { nota_auditoria, status, ajustes_sugeridos, alertas, resumo_auditoria }
        cenario, transcript_completo: historico, cenario_resposta: respostaAgregada,
      };
      await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished: true });

      // Gera Evolution Report automático
      const report = await gerarEvolutionReport(trilhaId);

      return NextResponse.json({
        finished: true,
        avaliacao: parsed,
        auditoria,
        evolution_report: report.evolution_report,
      });
    }

    return NextResponse.json({ error: 'Semana inválida pra /evaluation' }, { status: 400 });
  } catch (err) {
    console.error('[VERTHO] /evaluation:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

async function enriquecerComRegua(sb, empresaId, competencia, descritores) {
  // Tenta competencias (empresa), fallback competencias_base
  const nomesCurtos = descritores.map(d => d.descritor);
  let { data: rows } = await sb.from('competencias')
    .select('nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
    .eq('empresa_id', empresaId).eq('nome', competencia)
    .in('nome_curto', nomesCurtos);
  if (!rows || rows.length === 0) {
    const { data: base } = await sb.from('competencias_base')
      .select('nome_curto, n1_gap, n2_desenvolvimento, n3_meta, n4_referencia')
      .eq('nome', competencia).in('nome_curto', nomesCurtos);
    rows = base || [];
  }
  const mapa = Object.fromEntries((rows || []).map(r => [r.nome_curto, r]));
  return descritores.map(d => ({ ...d, ...(mapa[d.descritor] || {}) }));
}

/**
 * Como enriquecerComRegua, mas também sobrescreve nota_atual com a nota FRESH
 * de descriptor_assessments (em caso de remapeamento posterior à criação da trilha).
 * Se não houver registro fresh, mantém o snapshot (nota_atual original).
 */
async function enriquecerComReguaENotaPre(sb, empresaId, colaboradorId, competencia, descritores) {
  const base = await enriquecerComRegua(sb, empresaId, competencia, descritores);
  const nomes = base.map(d => d.descritor);
  const { data: assessments } = await sb.from('descriptor_assessments')
    .select('descritor, nota')
    .eq('colaborador_id', colaboradorId)
    .eq('competencia', competencia)
    .in('descritor', nomes);
  const mapaNota = Object.fromEntries((assessments || []).map(a => [a.descritor, Number(a.nota)]));
  return base.map(d => ({
    ...d,
    nota_atual: mapaNota[d.descritor] != null ? mapaNota[d.descritor] : d.nota_atual,
  }));
}

/**
 * Agrega evidências qualitativas das 13 semanas anteriores numa string
 * estruturada por descritor. A semana 14 NUNCA avalia só pelo cenário —
 * triangula com o histórico completo da temporada.
 */
async function agregarEvidencias13Semanas(sb, trilhaId, descritoresComRegua) {
  const { data: progressos } = await sb.from('temporada_semana_progresso')
    .select('semana, tipo, descritor, reflexao, feedback, tira_duvidas')
    .eq('trilha_id', trilhaId).lte('semana', 13).order('semana');
  if (!progressos?.length) return '';

  // Mapa de temporada_plano pra saber qual descritor cada semana trabalhou
  const { data: trilhaPlan } = await sb.from('trilhas')
    .select('temporada_plano').eq('id', trilhaId).maybeSingle();
  const plano = Array.isArray(trilhaPlan?.temporada_plano) ? trilhaPlan.temporada_plano : [];
  const descritorPorSem = Object.fromEntries(plano.map(s => [s.semana, s.descritor]));
  const descritoresCobertosPorSem = Object.fromEntries(plano.map(s => [s.semana, s.descritores_cobertos || []]));

  const linhasPorDescritor = {};
  for (const d of descritoresComRegua) linhasPorDescritor[d.descritor] = [];

  for (const p of progressos) {
    // Conteúdo (sems 1-12 exceto 4/8/12): reflexão socrática
    if (p.tipo === 'conteudo' && p.reflexao) {
      const desc = descritorPorSem[p.semana];
      if (desc && linhasPorDescritor[desc]) {
        const partes = [
          `Sem ${p.semana} (conteúdo/reflexão)`,
          p.reflexao.insight_principal && `insight: "${p.reflexao.insight_principal}"`,
          p.reflexao.desafio_realizado && `desafio: ${p.reflexao.desafio_realizado}`,
          p.reflexao.qualidade_reflexao && `qualidade: ${p.reflexao.qualidade_reflexao}`,
        ].filter(Boolean).join(' · ');
        linhasPorDescritor[desc].push(partes);
      }
    }
    // Prática (sems 4/8/12): feedback analítico ou missão
    if (p.tipo === 'aplicacao' && p.feedback) {
      const cobertos = descritoresCobertosPorSem[p.semana] || [];
      const avals = Array.isArray(p.feedback.avaliacao_por_descritor) ? p.feedback.avaliacao_por_descritor : [];
      const modo = p.feedback.modo || 'cenario';
      const compromisso = p.feedback.compromisso;
      for (const desc of cobertos) {
        if (!linhasPorDescritor[desc]) continue;
        const aval = avals.find(a => a.descritor === desc);
        const partes = [
          `Sem ${p.semana} (prática${modo === 'pratica' ? ' — missão real' : ' — cenário escrito'})`,
          modo === 'pratica' && compromisso && `compromisso: "${compromisso}"`,
          aval?.observacao && `avaliação: "${aval.observacao}"`,
          aval?.nota && `nota: ${aval.nota}`,
        ].filter(Boolean).join(' · ');
        if (partes) linhasPorDescritor[desc].push(partes);
      }
    }
    // Sem 13: evolução percebida
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

  const blocos = descritoresComRegua.map(d => {
    const linhas = linhasPorDescritor[d.descritor] || [];
    if (!linhas.length) return `### ${d.descritor}\n(sem evidência registrada nas 13 semanas)`;
    return `### ${d.descritor}\n- ${linhas.join('\n- ')}`;
  });
  return blocos.join('\n\n');
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
