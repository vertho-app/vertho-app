import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';

/**
 * POST /api/temporada/missao
 * Body: { trilhaId, semana, modo: 'pratica'|'cenario', compromisso? }
 *
 * Para semanas 4/8/12: registra se o colab vai fazer a Missão Prática
 * (relatar evidência real) ou cair no fallback de Cenário Escrito.
 * Se modo='pratica', exige compromisso (texto curto: qual situação vai usar).
 * Grava em temporada_semana_progresso.feedback.{modo,compromisso}.
 */
export async function POST(request) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof Response) return auth;

    const body = await request.json();
    const { trilhaId, semana, modo, compromisso, colaboradorId: colabBody } = body;
    if (!trilhaId || !semana || !modo) {
      return NextResponse.json({ error: 'trilhaId+semana+modo obrigatórios' }, { status: 400 });
    }
    if (!['pratica', 'cenario'].includes(modo)) {
      return NextResponse.json({ error: "modo deve ser 'pratica' ou 'cenario'" }, { status: 400 });
    }
    if (modo === 'pratica' && !(compromisso || '').trim()) {
      return NextResponse.json({ error: 'Compromisso obrigatório no modo prática' }, { status: 400 });
    }

    const sb = createSupabaseAdmin();

    const { data: trilha } = await sb.from('trilhas')
      .select('id, empresa_id, colaborador_id, temporada_plano, data_inicio')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return NextResponse.json({ error: 'trilha não encontrada' }, { status: 404 });

    // Se body trouxe colaboradorId, precisa bater com o dono da trilha.
    if (colabBody && colabBody !== trilha.colaborador_id) {
      return NextResponse.json({ error: 'colaboradorId não corresponde à trilha' }, { status: 403 });
    }
    // Usuário precisa ter acesso ao colab da trilha (próprio, gestor/rh mesma empresa, ou admin).
    const guard = await assertColabAccess(auth, trilha.colaborador_id);
    if (guard) return guard;

    const semanaPlan = (trilha.temporada_plano || []).find(s => s.semana === Number(semana));
    if (!semanaPlan) return NextResponse.json({ error: 'semana fora do plano' }, { status: 400 });
    if (semanaPlan.tipo !== 'aplicacao') {
      return NextResponse.json({ error: 'Missão só se aplica a semanas 4/8/12' }, { status: 400 });
    }

    // Gates temporais + progressão idênticos a reflection
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

    const { data: prog } = await sb.from('temporada_semana_progresso')
      .select('*').eq('trilha_id', trilhaId).eq('semana', semana).maybeSingle();

    const existente = prog?.feedback || { transcript_completo: [] };
    const temChat = Array.isArray(existente.transcript_completo) && existente.transcript_completo.length > 0;
    // Permite trocar de modo enquanto o chat de feedback ainda não começou.
    // Depois que o relato inicia, trocar apagaria conversa — bloqueia.
    if (existente.modo && existente.modo !== modo && temChat) {
      return NextResponse.json({ error: `Modo '${existente.modo}' já tem conversa iniciada — não pode alternar.` }, { status: 409 });
    }

    const novoFeedback = {
      ...existente,
      modo,
      ...(modo === 'pratica' ? { compromisso: compromisso.trim() } : {}),
    };

    const payload = {
      trilha_id: trilhaId,
      empresa_id: trilha.empresa_id,
      colaborador_id: trilha.colaborador_id,
      semana: Number(semana),
      tipo: 'aplicacao',
      status: 'em_andamento',
      feedback: novoFeedback,
      iniciado_em: prog?.iniciado_em || new Date().toISOString(),
    };

    if (prog) {
      await sb.from('temporada_semana_progresso').update(payload).eq('id', prog.id);
    } else {
      await sb.from('temporada_semana_progresso').insert(payload);
    }

    return NextResponse.json({ ok: true, modo, compromisso: novoFeedback.compromisso });
  } catch (err) {
    console.error('[missao]', err);
    return NextResponse.json({ error: err?.message || 'Erro' }, { status: 500 });
  }
}
