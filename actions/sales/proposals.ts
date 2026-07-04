'use server';

// Portal do Representante — propostas com aprovação interna Vertho.
//
// Máquina de estados:
//   draft → submitted_for_approval → approved → sent_to_client → accepted
//                    ↘ changes_requested → (RC edita) → submitted_for_approval
//                    ↘ rejected                       accepted/sent → lost
//
// Regras: RC cria/edita rascunho e submete; NUNCA aprova a própria proposta.
// Só admin (sales_channel.manage) aprova/recusa/pede ajustes. Financeiro é
// SEMPRE recalculado no server (lib/sales/commissions) — nunca confiamos no valor do client.
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  requireRepresentativeAction,
  requireRepresentativeOrAdminAction,
  requireCommercialAdminAction,
  assertRepresentativeOwnership,
} from '@/lib/sales/permissions';
import { validateProposalDraft, validateProposalForSubmission, numOrNull } from '@/lib/sales/validation';
import { calculateProposalFinancials, draftAcquisitionEvent, draftRecurringEvent } from '@/lib/sales/commissions';
import type { SalesProposal } from '@/lib/sales/types';

const PROPOSAL_SELECT = `*,
  account:sales_accounts (id, legal_name, trade_name),
  opportunity:sales_opportunities (id, opportunity_name, stage)`;

const RC_EDITABLE_STATUSES = ['draft', 'changes_requested'];

function proposalPatchFromInput(input: Record<string, any>): Record<string, any> {
  const patch: Record<string, any> = {
    customer_type: input.customer_type || null,
    number_of_users: numOrNull(input.number_of_users),
    number_of_roles_mapped: numOrNull(input.number_of_roles_mapped),
    product_package: input.product_package || null,
    contract_duration_months: numOrNull(input.contract_duration_months),
    discount_requested: numOrNull(input.discount_requested),
    payment_terms: input.payment_terms?.trim() || null,
    included_scope: input.included_scope?.trim() || null,
    commercial_notes: input.commercial_notes?.trim() || null,
    monthly_value: numOrNull(input.monthly_value),
  };
  // Financeiro derivado no server — fonte única.
  const fin = calculateProposalFinancials({
    monthly_value: patch.monthly_value,
    contract_duration_months: patch.contract_duration_months,
    discount_requested: patch.discount_requested,
  });
  return { ...patch, ...fin };
}

export async function listProposals(filters?: { status?: string; representanteId?: string }) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('sales_proposals').select(PROPOSAL_SELECT).order('created_at', { ascending: false });
  if (ctx.kind === 'representative') q = q.eq('representante_id', ctx.rep.id);
  else if (filters?.representanteId) q = q.eq('representante_id', filters.representanteId);
  if (filters?.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesProposal[] };
}

export async function getProposal(proposalId: string) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_proposals').select(PROPOSAL_SELECT).eq('id', proposalId).maybeSingle();
  if (error) return { success: false as const, error: error.message };
  if (!data) return { success: false as const, error: 'Proposta não encontrada' };
  if (ctx.kind === 'representative' && data.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: proposta de outro representante' };
  }
  // Comentários internos só para admin.
  let comments: any[] = [];
  if (ctx.kind === 'admin') {
    const { data: c } = await sb.from('sales_admin_comments').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false });
    comments = c || [];
  }
  return { success: true as const, data: data as SalesProposal, comments };
}

export async function createProposalDraft(input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const v = validateProposalDraft(input);
  if (!v.valid) return { success: false as const, error: 'Dados inválidos', fieldErrors: v.errors };

  const sb = createSupabaseAdmin();
  const { data: opp } = await sb.from('sales_opportunities')
    .select('id, representante_id, account_id, status').eq('id', input.opportunity_id).maybeSingle();
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, opp.representante_id);
  if (opp.status !== 'open') return { success: false as const, error: 'Oportunidade fechada não recebe novas propostas' };

  const { data: num, error: numErr } = await sb.rpc('sales_next_proposal_number');
  if (numErr) return { success: false as const, error: `Falha ao gerar número: ${numErr.message}` };

  const { data, error } = await sb.from('sales_proposals').insert({
    representante_id: ctx.rep.id,
    opportunity_id: opp.id,
    account_id: opp.account_id,
    proposal_number: num as string,
    status: 'draft',
    ...proposalPatchFromInput(input),
  }).select('id').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, id: data.id };
}

export async function updateProposalDraft(proposalId: string, input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_proposals').select('id, representante_id, status').eq('id', proposalId).maybeSingle();
  if (!existing) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, existing.representante_id);
  if (!RC_EDITABLE_STATUSES.includes(existing.status)) {
    return { success: false as const, error: 'Proposta só pode ser editada em rascunho ou com ajustes solicitados' };
  }
  const v = validateProposalDraft({ ...input, opportunity_id: 'ok' });
  if (!v.valid) return { success: false as const, error: 'Dados inválidos', fieldErrors: v.errors };

  const { error } = await sb.from('sales_proposals')
    .update({ ...proposalPatchFromInput(input), updated_at: new Date().toISOString() })
    .eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function submitProposalForApproval(proposalId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('*').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (!RC_EDITABLE_STATUSES.includes(p.status)) return { success: false as const, error: 'Proposta não está em estado submetível' };

  const v = validateProposalForSubmission(p);
  if (!v.valid) return { success: false as const, error: 'Complete a proposta antes de submeter', fieldErrors: v.errors };

  const { error } = await sb.from('sales_proposals')
    .update({ status: 'submitted_for_approval', rejection_reason: null, updated_at: new Date().toISOString() })
    .eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };

  // Reflete no funil: proposta em aprovação interna.
  if (p.opportunity_id) {
    await sb.from('sales_opportunities')
      .update({ stage: 'aguardando_aceite_vertho', updated_at: new Date().toISOString() })
      .eq('id', p.opportunity_id).eq('status', 'open');
  }
  return { success: true as const };
}

// ── Ações do admin (aprovação interna) ──────────────────────────────────────

export async function approveProposal(proposalId: string) {
  const admin = await requireCommercialAdminAction();
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, status').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  if (p.status !== 'submitted_for_approval') return { success: false as const, error: 'Só propostas aguardando aprovação podem ser aprovadas' };
  const { error } = await sb.from('sales_proposals').update({
    status: 'approved', approved_by: admin.email, approved_at: new Date().toISOString(),
    rejection_reason: null, updated_at: new Date().toISOString(),
  }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function rejectProposal(proposalId: string, reason: string) {
  const admin = await requireCommercialAdminAction();
  if (!reason?.trim()) return { success: false as const, error: 'Informe o motivo da recusa' };
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, status').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  if (p.status !== 'submitted_for_approval') return { success: false as const, error: 'Só propostas aguardando aprovação podem ser recusadas' };
  const { error } = await sb.from('sales_proposals').update({
    status: 'rejected', rejection_reason: reason.trim(), approved_by: admin.email, updated_at: new Date().toISOString(),
  }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function requestProposalChanges(proposalId: string, comment: string) {
  const admin = await requireCommercialAdminAction();
  if (!comment?.trim()) return { success: false as const, error: 'Descreva os ajustes solicitados' };
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, status').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  if (p.status !== 'submitted_for_approval') return { success: false as const, error: 'Só propostas aguardando aprovação podem receber ajustes' };
  const { error } = await sb.from('sales_proposals').update({
    status: 'changes_requested', rejection_reason: comment.trim(), updated_at: new Date().toISOString(),
  }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  await sb.from('sales_admin_comments').insert({ proposal_id: proposalId, author_email: admin.email, comment: comment.trim() });
  return { success: true as const };
}

export async function addAdminComment(proposalId: string, comment: string) {
  const admin = await requireCommercialAdminAction();
  if (!comment?.trim()) return { success: false as const, error: 'Comentário vazio' };
  const sb = createSupabaseAdmin();
  const { error } = await sb.from('sales_admin_comments').insert({ proposal_id: proposalId, author_email: admin.email, comment: comment.trim() });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

// ── Pós-aprovação (RC) ──────────────────────────────────────────────────────

export async function markProposalSentToClient(proposalId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, representante_id, status, opportunity_id').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (p.status !== 'approved') return { success: false as const, error: 'Só propostas aprovadas pela Vertho podem ser enviadas ao cliente' };
  const { error } = await sb.from('sales_proposals').update({ status: 'sent_to_client', updated_at: new Date().toISOString() }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  if (p.opportunity_id) {
    await sb.from('sales_opportunities').update({ stage: 'contrato_enviado', updated_at: new Date().toISOString() })
      .eq('id', p.opportunity_id).eq('status', 'open');
  }
  return { success: true as const };
}

/**
 * Aceite do cliente: fecha a oportunidade como ganha, ativa a conta na carteira
 * e materializa os eventos de comissão estimada (hook do MVP 2 — status forecast).
 */
export async function markProposalAccepted(proposalId: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('*').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (p.status !== 'sent_to_client') return { success: false as const, error: 'Só propostas enviadas ao cliente podem ser marcadas como aceitas' };

  const { error } = await sb.from('sales_proposals').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };

  if (p.opportunity_id) {
    await sb.from('sales_opportunities').update({ stage: 'fechado_ganho', status: 'won', updated_at: new Date().toISOString() })
      .eq('id', p.opportunity_id).eq('status', 'open');
  }
  if (p.account_id) {
    const start = new Date();
    const renewal = new Date(start);
    renewal.setMonth(renewal.getMonth() + (Number(p.contract_duration_months) || 12));
    await sb.from('sales_accounts').update({
      status: 'active_client',
      contract_start_date: start.toISOString().slice(0, 10),
      renewal_date: renewal.toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    }).eq('id', p.account_id);
  }

  // Eventos de comissão (forecast) — aquisição única + recorrente da estimativa.
  const acq = draftAcquisitionEvent(Number(p.total_contract_value) || 0, 'forecast');
  const rec = draftRecurringEvent(Number(p.monthly_value) || 0, new Date().toISOString().slice(0, 8) + '01', 'forecast');
  await sb.from('sales_commission_events').insert([
    { representante_id: p.representante_id, proposal_id: p.id, account_id: p.account_id, ...acq },
    {
      representante_id: p.representante_id, proposal_id: p.id, account_id: p.account_id, ...rec,
      // total recorrente estimado da vigência (evento agregado; MVP 2 quebra por competência)
      amount: Number(p.estimated_recurring_commission) || rec.amount,
      base_value: (Number(p.monthly_value) || 0) * (Number(p.contract_duration_months) || 0),
      notes: `Recorrente estimado da vigência (${p.contract_duration_months} meses)`,
    },
  ]);

  return { success: true as const };
}

/** Proposta perdida (aceita/enviada que não evoluiu). */
export async function markProposalLost(proposalId: string, reason?: string) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: p } = await sb.from('sales_proposals').select('id, representante_id, status').eq('id', proposalId).maybeSingle();
  if (!p) return { success: false as const, error: 'Proposta não encontrada' };
  assertRepresentativeOwnership(ctx, p.representante_id);
  if (!['approved', 'sent_to_client'].includes(p.status)) return { success: false as const, error: 'Estado atual não permite marcar como perdida' };
  const { error } = await sb.from('sales_proposals').update({
    status: 'lost', rejection_reason: reason?.trim() || null, updated_at: new Date().toISOString(),
  }).eq('id', proposalId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}
