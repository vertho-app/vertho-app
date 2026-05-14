'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { requireUserAction } from '@/lib/auth/action-context';
import { getPulseQuestions, PulseMoment, PulseQuestion } from '@/lib/pulse/template';

export interface AssignmentDetail {
  assignment: {
    id: string;
    empresa_id: string;
    ciclo_id: string;
    pulse_moment: PulseMoment;
    status: string;
    completed_at: string | null;
  };
  ciclo: { nome: string; descricao: string | null };
  empresa: { nome: string };
  perguntas: PulseQuestion[];
  respostasExistentes: Record<string, { numeric_answer: number | null; text_answer: string | null }>;
}

/**
 * Carrega assignment + perguntas + respostas já dadas (pra retomar).
 * Permissão: o próprio colaborador OU platform admin.
 */
export async function loadAssignment(assignmentId: string): Promise<
  { ok: true; data: AssignmentDetail } | { ok: false; error: string }
> {
  const ctx = await requireUserAction();
  const sb = createSupabaseAdmin();

  const { data: a } = await sb.from('pulse_assignments')
    .select('id, empresa_id, ciclo_id, colaborador_id, pulse_moment, status, completed_at')
    .eq('id', assignmentId).single();
  if (!a) return { ok: false, error: 'Assignment não encontrado' };

  if (!ctx.isPlatformAdmin && ctx.colaborador?.id !== (a as any).colaborador_id) {
    return { ok: false, error: 'Sem acesso a este assignment' };
  }

  const { data: ciclo } = await sb.from('pulse_ciclos')
    .select('nome, descricao').eq('id', (a as any).ciclo_id).single();
  const { data: empresa } = await sb.from('empresas')
    .select('nome').eq('id', (a as any).empresa_id).single();

  const { data: resps } = await sb.from('pulse_responses')
    .select('question_id, numeric_answer, text_answer').eq('assignment_id', assignmentId);

  const respostasExistentes: Record<string, any> = {};
  for (const r of (resps || [])) {
    respostasExistentes[(r as any).question_id] = {
      numeric_answer: (r as any).numeric_answer,
      text_answer: (r as any).text_answer,
    };
  }

  const perguntas = getPulseQuestions((a as any).pulse_moment);

  return {
    ok: true,
    data: {
      assignment: a as any,
      ciclo: { nome: (ciclo as any)?.nome || 'Pulso', descricao: (ciclo as any)?.descricao || null },
      empresa: { nome: (empresa as any)?.nome || '' },
      perguntas,
      respostasExistentes,
    },
  };
}

/**
 * Salva (upsert) uma resposta a uma pergunta.
 * Marca o assignment como 'started' se ainda estiver 'pending'.
 */
export async function saveResponse(
  assignmentId: string,
  questionId: string,
  value: { numeric?: number | null; text?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireUserAction();
  const sb = createSupabaseAdmin();

  const { data: a } = await sb.from('pulse_assignments')
    .select('id, empresa_id, ciclo_id, colaborador_id, pulse_moment, status').eq('id', assignmentId).single();
  if (!a) return { ok: false, error: 'Assignment não encontrado' };
  if (!ctx.isPlatformAdmin && ctx.colaborador?.id !== (a as any).colaborador_id) {
    return { ok: false, error: 'Sem acesso' };
  }
  if ((a as any).status === 'completed') return { ok: false, error: 'Pulso já finalizado' };

  const perguntas = getPulseQuestions((a as any).pulse_moment);
  const pergunta = perguntas.find(p => p.id === questionId);
  if (!pergunta) return { ok: false, error: 'Pergunta inválida' };

  // Validação Likert
  if (pergunta.question_type === 'likert_1_5') {
    if (value.numeric == null || value.numeric < 1 || value.numeric > 5) {
      return { ok: false, error: 'Valor Likert deve estar entre 1 e 5' };
    }
  }

  const tdb = tenantDb((a as any).empresa_id);
  const { error } = await tdb.from('pulse_responses').upsert({
    ciclo_id: (a as any).ciclo_id,
    assignment_id: assignmentId,
    colaborador_id: (a as any).colaborador_id,
    pulse_moment: (a as any).pulse_moment,
    question_id: questionId,
    dimension_key: pergunta.dimension_key,
    numeric_answer: pergunta.question_type === 'likert_1_5' ? value.numeric : null,
    text_answer: pergunta.question_type === 'open_text' ? (value.text || null) : null,
    updated_at: new Date().toISOString(),
  } as any, { onConflict: 'assignment_id,question_id' });
  if (error) return { ok: false, error: error.message };

  // Marca como started se ainda pending
  if ((a as any).status === 'pending') {
    await sb.from('pulse_assignments')
      .update({ status: 'started', started_at: new Date().toISOString() })
      .eq('id', assignmentId);
  }

  return { ok: true };
}

/**
 * Marca o assignment como completed. Exige todas as Likert preenchidas
 * (a aberta é opcional).
 */
export async function finishAssignment(
  assignmentId: string,
): Promise<{ ok: true } | { ok: false; error: string; faltam?: string[] }> {
  const ctx = await requireUserAction();
  const sb = createSupabaseAdmin();

  const { data: a } = await sb.from('pulse_assignments')
    .select('id, empresa_id, colaborador_id, pulse_moment, status').eq('id', assignmentId).single();
  if (!a) return { ok: false, error: 'Assignment não encontrado' };
  if (!ctx.isPlatformAdmin && ctx.colaborador?.id !== (a as any).colaborador_id) {
    return { ok: false, error: 'Sem acesso' };
  }

  const perguntas = getPulseQuestions((a as any).pulse_moment);
  const obrigatorias = perguntas.filter(p => p.is_required).map(p => p.id);

  const { data: resps } = await sb.from('pulse_responses')
    .select('question_id, numeric_answer').eq('assignment_id', assignmentId);
  const respondidas = new Set(
    (resps || []).filter((r: any) => r.numeric_answer != null).map((r: any) => r.question_id),
  );
  const faltam = obrigatorias.filter(id => !respondidas.has(id));
  if (faltam.length) return { ok: false, error: 'Há perguntas obrigatórias sem resposta', faltam };

  const { error } = await sb.from('pulse_assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', assignmentId);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * Lista os assignments pendentes do colaborador autenticado (pra mostrar
 * call-to-action no dashboard).
 */
export async function loadMeusPulsosPendentes() {
  const ctx = await requireUserAction();
  if (!ctx.colaborador?.id) return [];
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('pulse_assignments')
    .select('id, pulse_moment, status, due_date, ciclo_id')
    .eq('colaborador_id', ctx.colaborador.id)
    .in('status', ['pending', 'started'])
    .order('due_date', { ascending: true, nullsFirst: false });
  return data || [];
}
