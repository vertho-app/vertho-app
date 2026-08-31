'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';
import { requireUserAction } from '@/lib/auth/action-context';
import {
  getPulseQuestions,
  PULSE_LEGACY_TEMPLATE_VERSION,
  PulseMoment,
  PulseQuestion,
} from '@/lib/pulse/template';
import {
  computeContextualDisc,
  hasRequiredAnswer,
  sanitizeContextualAnswer,
} from '@/lib/pulse/contextual-disc';
import { carregarPulsosPendentes } from '@/lib/home/loaders';
import { assertBlocoOnline } from '@/lib/blocos-offline';

interface StoredResponse {
  numeric_answer: number | null;
  text_answer: string | null;
  answer_json: unknown;
}

export interface AssignmentDetail {
  assignment: {
    id: string;
    empresa_id: string;
    ciclo_id: string;
    pulse_moment: PulseMoment;
    status: string;
    completed_at: string | null;
    due_date: string | null;
    template_version: string;
    contextual_disc: unknown;
  };
  ciclo: { nome: string; descricao: string | null };
  empresa: { nome: string };
  perguntas: PulseQuestion[];
  respostasExistentes: Record<string, StoredResponse>;
}

/**
 * Carrega assignment + perguntas + respostas já dadas (pra retomar).
 * Permissão: o próprio colaborador OU platform admin.
 */
export async function loadAssignment(assignmentId: string): Promise<
  { ok: true; data: AssignmentDetail } | { ok: false; error: string }
> {
  assertBlocoOnline('pulso');
  const ctx = await requireUserAction();
  const sb = createSupabaseAdmin();

  const { data: a } = await sb.from('pulse_assignments')
    .select('id, empresa_id, ciclo_id, colaborador_id, pulse_moment, status, completed_at, due_date, template_version, contextual_disc')
    .eq('id', assignmentId).single();
  if (!a) return { ok: false, error: 'Assignment não encontrado' };

  if (!ctx.isPlatformAdmin && ctx.colaborador?.id !== (a as any).colaborador_id) {
    return { ok: false, error: 'Sem acesso a este assignment' };
  }
  if ((a as any).status !== 'completed') {
    const closedReason = await validateAssignmentOpen(sb, a as any);
    if (closedReason) return { ok: false, error: closedReason };
  }

  const { data: ciclo } = await sb.from('pulse_ciclos')
    .select('nome, descricao').eq('id', (a as any).ciclo_id).single();
  const { data: empresa } = await sb.from('empresas')
    .select('nome').eq('id', (a as any).empresa_id).single();

  const { data: resps } = await sb.from('pulse_responses')
    .select('question_id, numeric_answer, text_answer, answer_json').eq('assignment_id', assignmentId);

  const respostasExistentes: Record<string, any> = {};
  for (const r of (resps || [])) {
    respostasExistentes[(r as any).question_id] = {
      numeric_answer: (r as any).numeric_answer,
      text_answer: (r as any).text_answer,
      answer_json: (r as any).answer_json,
    };
  }

  const templateVersion = (a as any).template_version || PULSE_LEGACY_TEMPLATE_VERSION;
  const perguntas = getPulseQuestions((a as any).pulse_moment, templateVersion);

  return {
    ok: true,
    data: {
      assignment: { ...(a as any), template_version: templateVersion },
      ciclo: { nome: (ciclo as any)?.nome || 'Pulso', descricao: (ciclo as any)?.descricao || null },
      empresa: { nome: (empresa as any)?.nome || '' },
      perguntas,
      respostasExistentes,
    },
  };
}

function isPastDue(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

function expectedOpenStatus(moment: PulseMoment): string {
  return moment === 'T0' ? 't0_aberto' : 't2_aberto';
}

async function validateAssignmentOpen(sb: any, assignment: any): Promise<string | null> {
  if (assignment.status === 'completed') return 'Pulso já finalizado';
  if (assignment.status === 'expired') return 'Pulso expirado';
  if (isPastDue(assignment.due_date)) {
    await sb.from('pulse_assignments').update({ status: 'expired' }).eq('id', assignment.id);
    return 'Pulso expirado';
  }
  const { data: ciclo } = await sb.from('pulse_ciclos')
    .select('status')
    .eq('id', assignment.ciclo_id)
    .maybeSingle();
  if (!ciclo || (ciclo as any).status !== expectedOpenStatus(assignment.pulse_moment)) {
    return 'Pulso fechado';
  }
  return null;
}

/**
 * Salva (upsert) uma resposta a uma pergunta.
 * Marca o assignment como 'started' se ainda estiver 'pending'.
 */
export async function saveResponse(
  assignmentId: string,
  questionId: string,
  value: { numeric?: number | null; text?: string | null; json?: unknown },
): Promise<{ ok: true } | { ok: false; error: string }> {
  assertBlocoOnline('pulso');
  const ctx = await requireUserAction();
  const sb = createSupabaseAdmin();

  const { data: a } = await sb.from('pulse_assignments')
    .select('id, empresa_id, ciclo_id, colaborador_id, pulse_moment, status, due_date, template_version').eq('id', assignmentId).single();
  if (!a) return { ok: false, error: 'Assignment não encontrado' };
  if (!ctx.isPlatformAdmin && ctx.colaborador?.id !== (a as any).colaborador_id) {
    return { ok: false, error: 'Sem acesso' };
  }
  const closedReason = await validateAssignmentOpen(sb, a as any);
  if (closedReason) return { ok: false, error: closedReason };

  const perguntas = getPulseQuestions(
    (a as any).pulse_moment,
    (a as any).template_version || PULSE_LEGACY_TEMPLATE_VERSION,
  );
  const pergunta = perguntas.find(p => p.id === questionId);
  if (!pergunta) return { ok: false, error: 'Pergunta inválida' };

  // Validação Likert
  if (pergunta.question_type === 'likert_1_5') {
    if (value.numeric == null || value.numeric < 1 || value.numeric > 5) {
      return { ok: false, error: 'Valor Likert deve estar entre 1 e 5' };
    }
  }
  const contextualAnswer = (
    pergunta.question_type === 'disc_ranking' || pergunta.question_type === 'disc_pair'
  )
    ? sanitizeContextualAnswer(pergunta, value.json)
    : null;
  if (
    (pergunta.question_type === 'disc_ranking' || pergunta.question_type === 'disc_pair')
    && !contextualAnswer
  ) {
    return { ok: false, error: 'Resposta contextual inválida' };
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
    answer_json: contextualAnswer,
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
  assertBlocoOnline('pulso');
  const ctx = await requireUserAction();
  const sb = createSupabaseAdmin();

  const { data: a } = await sb.from('pulse_assignments')
    .select('id, empresa_id, ciclo_id, colaborador_id, pulse_moment, status, due_date, template_version').eq('id', assignmentId).single();
  if (!a) return { ok: false, error: 'Assignment não encontrado' };
  if (!ctx.isPlatformAdmin && ctx.colaborador?.id !== (a as any).colaborador_id) {
    return { ok: false, error: 'Sem acesso' };
  }
  const closedReason = await validateAssignmentOpen(sb, a as any);
  if (closedReason) return { ok: false, error: closedReason };

  const templateVersion = (a as any).template_version || PULSE_LEGACY_TEMPLATE_VERSION;
  const perguntas = getPulseQuestions((a as any).pulse_moment, templateVersion);
  const obrigatorias = perguntas.filter(p => p.is_required);

  const { data: resps } = await sb.from('pulse_responses')
    .select('question_id, numeric_answer, text_answer, answer_json').eq('assignment_id', assignmentId);
  const responsesByQuestion: Record<string, StoredResponse> = {};
  for (const response of (resps || []) as any[]) {
    responsesByQuestion[response.question_id] = {
      numeric_answer: response.numeric_answer,
      text_answer: response.text_answer,
      answer_json: response.answer_json,
    };
  }
  const faltam = obrigatorias
    .filter(question => !hasRequiredAnswer(question, responsesByQuestion[question.id]))
    .map(question => question.id);
  if (faltam.length) return { ok: false, error: 'Há perguntas obrigatórias sem resposta', faltam };

  const completedAt = new Date().toISOString();
  const contextualDisc = computeContextualDisc(perguntas, responsesByQuestion);
  const { error } = await sb.from('pulse_assignments')
    .update({
      status: 'completed',
      completed_at: completedAt,
      contextual_disc: contextualDisc
        ? { ...contextualDisc, templateVersion, completedAt }
        : null,
    })
    .eq('id', assignmentId);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/**
 * Lista os assignments pendentes do colaborador autenticado (pra mostrar
 * call-to-action no dashboard).
 */
export async function loadMeusPulsosPendentes() {
  assertBlocoOnline('pulso');
  const ctx = await requireUserAction();
  if (!ctx.colaborador?.id) return [];
  return carregarPulsosPendentes(ctx.colaborador.id);
}
