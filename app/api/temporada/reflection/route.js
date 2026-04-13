import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAIChat } from '@/actions/ai-client';
import { promptSocratic } from '@/lib/season-engine/prompts/socratic';
import { promptAnalytic } from '@/lib/season-engine/prompts/analytic';

const MAX_TURNS_SOCRATIC = 10; // 5 IA + 5 colab
const MAX_TURNS_ANALYTIC = 8;  // 4 IA + 4 colab

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
      .select('id, colaborador_id, competencia_foco, temporada_plano')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha não encontrada' }, { status: 404 });

    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo, cargo').eq('id', trilha.colaborador_id).maybeSingle();
    if (!colab) return NextResponse.json({ error: 'colab não encontrado' }, { status: 404 });

    const semanaPlan = (trilha.temporada_plano || []).find(s => s.semana === Number(semana));
    if (!semanaPlan) return NextResponse.json({ error: 'semana fora do plano' }, { status: 400 });

    const tipoConversa = semanaPlan.tipo === 'aplicacao' ? 'analytic' : 'socratic';
    const maxTurns = tipoConversa === 'analytic' ? MAX_TURNS_ANALYTIC : MAX_TURNS_SOCRATIC;

    // Carrega progresso existente da semana
    const { data: prog } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();

    const slot = tipoConversa === 'analytic' ? 'feedback' : 'reflexao';
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

    // Monta prompt
    let promptData;
    if (tipoConversa === 'socratic') {
      promptData = promptSocratic({
        nomeColab: (colab.nome_completo || '').split(' ')[0],
        cargo: colab.cargo,
        competencia: trilha.competencia_foco,
        descritor: semanaPlan.descritor,
        desafio: semanaPlan.conteudo?.desafio_texto || '',
        historico,
        turnIA: proximoTurnIA,
      });
    } else {
      promptData = promptAnalytic({
        nomeColab: (colab.nome_completo || '').split(' ')[0],
        cargo: colab.cargo,
        competencia: trilha.competencia_foco,
        descritoresCobertos: semanaPlan.descritores_cobertos || [],
        cenario: semanaPlan.cenario?.texto || '',
        historico,
        turnIA: proximoTurnIA,
      });
    }

    let respostaIA;
    try {
      respostaIA = await callAIChat(promptData.system, promptData.messages, {}, 600);
      respostaIA = (respostaIA || '').trim();
    } catch (err) {
      console.error('[reflection] callAIChat:', err);
      return NextResponse.json({ error: 'Erro na IA' }, { status: 500 });
    }

    historico.push({ role: 'assistant', content: respostaIA, timestamp: new Date().toISOString(), turn: proximoTurnIA });

    const totalTurnsIA = proximoTurnIA;
    const finished = totalTurnsIA >= maxTurns / 2;

    // Persiste
    const novoSlotData = { ...dados, transcript_completo: historico };
    if (finished && tipoConversa === 'socratic') {
      // Tenta extrair desafio_realizado / insight / compromisso da última msg
      const ultima = respostaIA;
      novoSlotData.desafio_realizado = /n[ãa]o\s*real|n[ãa]o feito/i.test(ultima) ? 'nao' :
                                       /parcial/i.test(ultima) ? 'parcial' : 'sim';
      novoSlotData.insight_principal = (ultima.match(/📝[^\n]*Insight[^:]*:\s*([^\n]+)/i)?.[1] || '').trim();
      novoSlotData.compromisso_proxima = (ultima.match(/🎯[^\n]*Compromisso[^:]*:\s*([^\n]+)/i)?.[1] || '').trim();
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
