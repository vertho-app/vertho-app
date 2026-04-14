import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI, callAIChat } from '@/actions/ai-client';
import { promptEvolutionQualitative, promptEvolutionQualitativeExtract } from '@/lib/season-engine/prompts/evolution-qualitative';
import { promptEvolutionScenarioGen, promptEvolutionScenarioScore } from '@/lib/season-engine/prompts/evolution-scenario';
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
    const { trilhaId, semana, message, action = 'send' } = await request.json();
    if (!trilhaId || !semana) return NextResponse.json({ error: 'trilhaId+semana' }, { status: 400 });

    if (action === 'generate_report') {
      const r = await gerarEvolutionReport(trilhaId);
      return NextResponse.json(r);
    }

    const sb = createSupabaseAdmin();
    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, empresa_id, competencia_foco, temporada_plano, descritores_selecionados')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha' }, { status: 404 });

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo').eq('id', trilha.colaborador_id).maybeSingle();
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
      const TOTAL = 8;

      // Coleta insights das semanas 1-12 pra contextualizar
      const { data: outrasSem } = await sb.from('temporada_semana_progresso')
        .select('reflexao').eq('trilha_id', trilhaId).lte('semana', 12).not('reflexao', 'is', null);
      const insightsAnteriores = (outrasSem || []).map(s => s.reflexao?.insight_principal).filter(Boolean);

      const proximoTurnIA = turnsIA + 1;
      const { system } = promptEvolutionQualitative({
        nomeColab: nome, cargo: colab?.cargo, competencia: trilha.competencia_foco,
        descritores, insightsAnteriores, turnIA: proximoTurnIA, totalTurns: TOTAL,
      });
      const messages = historico.map(m => ({ role: m.role, content: m.content }));
      if (proximoTurnIA === 1 && messages.length === 0) {
        messages.push({ role: 'user', content: '[INICIE A CONVERSA conforme o TURN 1]' });
      }
      const respostaIA = (await callAIChat(system, messages, {}, 600)).trim();
      historico.push({ role: 'assistant', content: respostaIA, timestamp: new Date().toISOString(), turn: proximoTurnIA });

      const finished = proximoTurnIA >= TOTAL;
      const novoSlot = { ...dados, transcript_completo: historico };
      if (finished) {
        // Extrai dados estruturados
        try {
          const transcript = historico.map(m => `${m.role === 'user' ? 'COLAB' : 'IA'}: ${m.content}`).join('\n\n');
          const { system: s2, user: u2 } = promptEvolutionQualitativeExtract({ descritores, transcript });
          const r = await callAI(s2, u2, {}, 1000);
          const parsed = JSON.parse(r.replace(/```json\n?|```\n?/g, '').trim());
          Object.assign(novoSlot, parsed);
        } catch (e) { console.error('[VERTHO] extract sem13:', e.message); }
      }

      await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished });
      if (finished && Number(semana) < 14) await liberarProxima(sb, trilhaId, 14);

      return NextResponse.json({ message: respostaIA, turnIA: proximoTurnIA, finished, history: historico });
    }

    // Semana 14: cenário + resposta + pontuação
    if (Number(semana) === 14) {
      if (action === 'init') {
        // Gera cenário se não existe
        let cenario = dados.cenario;
        if (!cenario) {
          const { system, user } = promptEvolutionScenarioGen({
            competencia: trilha.competencia_foco, descritores,
            cargo: colab?.cargo, contexto: 'corporativo',
          });
          cenario = (await callAI(system, user, {}, 1200)).trim();
        }
        const novoSlot = { ...dados, cenario, transcript_completo: historico };
        await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished: false });
        return NextResponse.json({ cenario, finished: false });
      }

      // action === 'send': colab enviou a resposta → pontua
      if (!message) return NextResponse.json({ error: 'message obrigatório' }, { status: 400 });
      const cenario = dados.cenario;
      if (!cenario) return NextResponse.json({ error: 'cenário não iniciado' }, { status: 400 });

      historico.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

      const { system, user } = promptEvolutionScenarioScore({
        competencia: trilha.competencia_foco, descritores, cenario, resposta: message, nomeColab: nome,
      });
      const r = await callAI(system, user, {}, 1500);
      let parsed = {};
      try { parsed = JSON.parse(r.replace(/```json\n?|```\n?/g, '').trim()); } catch (e) {
        console.error('[VERTHO] parse sem14:', e.message);
      }

      const novoSlot = { ...dados, ...parsed, cenario, transcript_completo: historico, cenario_resposta: message };
      await upsertProg(sb, { prog, trilhaId, semana, tipo: 'avaliacao', empresaId: trilha.empresa_id, colaboradorId: trilha.colaborador_id, slotKey, novoSlot, finished: true });

      // Gera Evolution Report automático
      const report = await gerarEvolutionReport(trilhaId);

      return NextResponse.json({
        finished: true,
        avaliacao: parsed,
        evolution_report: report.evolution_report,
      });
    }

    return NextResponse.json({ error: 'Semana inválida pra /evaluation' }, { status: 400 });
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
