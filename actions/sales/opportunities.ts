'use server';

// Portal do Representante — oportunidades (núcleo do CRM).
//
// Regras de canal:
//   • RC só enxerga/edita as PRÓPRIAS oportunidades (isolamento por representante_id).
//   • Registro formal validado → inicia proteção de 90 dias.
//   • Edição só enquanto aberta; fechamento via moveOpportunityStage.
//   • quality_score persiste a completude (base do pipeline qualificado).
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  requireRepresentativeAction,
  requireRepresentativeOrAdminAction,
  assertRepresentativeOwnership,
} from '@/lib/sales/permissions';
import { validateOpportunityInput, numOrNull } from '@/lib/sales/validation';
import { calculateQualityScore } from '@/lib/sales/quality-score';
import { computeProtectionWindow, computeProtectionStatus, protectionAlertLabel } from '@/lib/sales/protection';
import { groupByStage, oportunidadesSemProximaAcao, pipelinePonderado, pipelineQualificado, pipelineTotal, protecoesVencendo } from '@/lib/sales/kpis';
import { PIPELINE_STAGES, type PipelineStage } from '@/lib/sales/constants';
import type { SalesOpportunity } from '@/lib/sales/types';

const OPP_SELECT = `*,
  account:sales_accounts (id, legal_name, trade_name, segment, city, state),
  primary_contact:sales_contacts!sales_opportunities_primary_contact_id_fkey (id, name, role, email, phone)`;

/** Recalcula e persiste protection_status derivado (idempotente, barato). */
function withDerivedProtection(o: any): SalesOpportunity {
  const derived = computeProtectionStatus(o.protection_end_date, o.protection_status);
  return { ...o, protection_status: derived } as SalesOpportunity;
}

export async function listOpportunities(filters?: {
  representanteId?: string;   // só admin pode usar (RC é sempre o próprio)
  stage?: string;
  protectionStatus?: string;
  productInterest?: string;
  status?: string;
  search?: string;
}) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('sales_opportunities').select(OPP_SELECT).order('updated_at', { ascending: false });

  if (ctx.kind === 'representative') q = q.eq('representante_id', ctx.rep.id);
  else if (filters?.representanteId) q = q.eq('representante_id', filters.representanteId);

  if (filters?.stage) q = q.eq('stage', filters.stage);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.productInterest) q = q.eq('product_interest', filters.productInterest);
  if (filters?.search) q = q.ilike('opportunity_name', `%${filters.search}%`);

  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };

  let list = (data || []).map(withDerivedProtection);
  if (filters?.protectionStatus) list = list.filter((o) => o.protection_status === filters.protectionStatus);
  return { success: true as const, data: list };
}

export async function getOpportunity(opportunityId: string) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_opportunities').select(OPP_SELECT).eq('id', opportunityId).maybeSingle();
  if (error) return { success: false as const, error: error.message };
  if (!data) return { success: false as const, error: 'Oportunidade não encontrada' };
  if (ctx.kind === 'representative' && data.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: registro de outro representante' };
  }

  const [{ data: proposals }, { data: notes }] = await Promise.all([
    sb.from('sales_proposals').select('id, proposal_number, status, monthly_value, total_contract_value, estimated_total_commission, created_at').eq('opportunity_id', opportunityId).order('created_at', { ascending: false }),
    sb.from('sales_activity_notes').select('*').eq('opportunity_id', opportunityId).order('created_at', { ascending: false }),
  ]);

  return { success: true as const, data: withDerivedProtection(data), proposals: proposals || [], notes: notes || [] };
}

/** Score usa o cargo do contato principal — busca quando houver contato. */
async function scoreFor(sb: ReturnType<typeof createSupabaseAdmin>, row: Record<string, any>): Promise<number> {
  let contactRole: string | null = null;
  if (row.primary_contact_id) {
    const { data: c } = await sb.from('sales_contacts').select('role').eq('id', row.primary_contact_id).maybeSingle();
    contactRole = c?.role ?? null;
  }
  return calculateQualityScore({ ...row, primary_contact_role: contactRole });
}

export async function createOpportunity(input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const v = validateOpportunityInput(input);
  if (!v.valid) return { success: false as const, error: 'Preencha os campos obrigatórios', fieldErrors: v.errors };

  const sb = createSupabaseAdmin();

  // Conta e contato precisam ser do próprio RC (anti-IDOR).
  const { data: account } = await sb.from('sales_accounts').select('id, representante_id').eq('id', input.account_id).maybeSingle();
  if (!account) return { success: false as const, error: 'Conta não encontrada' };
  assertRepresentativeOwnership(ctx, account.representante_id);
  const { data: contact } = await sb.from('sales_contacts').select('id, representante_id, account_id').eq('id', input.primary_contact_id).maybeSingle();
  if (!contact || contact.account_id !== input.account_id) return { success: false as const, error: 'Contato inválido para esta conta' };
  assertRepresentativeOwnership(ctx, contact.representante_id);

  const protection = computeProtectionWindow(new Date());
  const row = {
    representante_id: ctx.rep.id,
    account_id: input.account_id,
    primary_contact_id: input.primary_contact_id,
    opportunity_name: String(input.opportunity_name).trim(),
    origin: input.origin || null,
    product_interest: input.product_interest || null,
    identified_need: input.identified_need?.trim() || null,
    stage: input.stage as PipelineStage,
    estimated_value: numOrNull(input.estimated_value),
    estimated_close_date: input.estimated_close_date || null,
    next_action: input.next_action?.trim() || null,
    next_action_date: input.next_action_date || null,
    interaction_evidence: input.interaction_evidence?.trim() || null,
    protection_start_date: protection.start,
    protection_end_date: protection.end,
    protection_status: 'active' as const,
    probability: numOrNull(input.probability),
    competitors: input.competitors?.trim() || null,
    objections: input.objections?.trim() || null,
    status: 'open' as const,
  };
  const quality_score = await scoreFor(sb, row);

  const { data, error } = await sb.from('sales_opportunities').insert({ ...row, quality_score }).select('id').single();
  if (error) return { success: false as const, error: error.message };

  await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, opportunity_id: data.id, account_id: input.account_id,
    note: `Oportunidade registrada — proteção comercial até ${protection.end}.`,
    created_by_email: ctx.email,
  });

  return { success: true as const, id: data.id };
}

export async function updateOpportunity(opportunityId: string, input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_opportunities').select('*').eq('id', opportunityId).maybeSingle();
  if (!existing) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, existing.representante_id);
  if (existing.status !== 'open') return { success: false as const, error: 'Oportunidade fechada não pode ser editada' };

  // Campos que o RC pode editar (proteção/status NÃO entram aqui).
  const patch: Record<string, any> = {};
  const editable = [
    'opportunity_name', 'origin', 'product_interest', 'identified_need', 'estimated_value',
    'estimated_close_date', 'next_action', 'next_action_date', 'interaction_evidence',
    'probability', 'competitors', 'objections', 'primary_contact_id',
  ];
  for (const k of editable) if (k in input) patch[k] = typeof input[k] === 'string' ? (input[k].trim() || null) : input[k];
  if ('estimated_value' in patch) {
    patch.estimated_value = numOrNull(patch.estimated_value);
    if (patch.estimated_value != null && patch.estimated_value < 0) return { success: false as const, error: 'Valor estimado não pode ser negativo' };
  }
  if ('probability' in patch) patch.probability = numOrNull(patch.probability);
  if (patch.primary_contact_id) {
    const { data: contact } = await sb.from('sales_contacts').select('representante_id, account_id').eq('id', patch.primary_contact_id).maybeSingle();
    if (!contact || contact.account_id !== existing.account_id) return { success: false as const, error: 'Contato inválido para esta conta' };
    assertRepresentativeOwnership(ctx, contact.representante_id);
  }

  const merged = { ...existing, ...patch };
  patch.quality_score = await scoreFor(sb, merged);
  patch.protection_status = computeProtectionStatus(existing.protection_end_date, existing.protection_status);
  patch.updated_at = new Date().toISOString();

  const { error } = await sb.from('sales_opportunities').update(patch).eq('id', opportunityId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Move de estágio; estágios terminais fecham a oportunidade. */
export async function moveOpportunityStage(opportunityId: string, stage: string, lossReason?: string) {
  const ctx = await requireRepresentativeAction();
  if (!PIPELINE_STAGES.includes(stage as PipelineStage)) return { success: false as const, error: 'Estágio inválido' };
  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_opportunities').select('id, representante_id, status, stage, account_id').eq('id', opportunityId).maybeSingle();
  if (!existing) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, existing.representante_id);
  if (existing.status !== 'open') return { success: false as const, error: 'Oportunidade fechada não pode mudar de estágio' };

  const patch: Record<string, any> = { stage, updated_at: new Date().toISOString() };
  if (stage === 'fechado_ganho') patch.status = 'won';
  if (stage === 'fechado_perdido') {
    if (!lossReason?.trim()) return { success: false as const, error: 'Informe o motivo da perda' };
    patch.status = 'lost';
    patch.loss_reason = lossReason.trim();
  }
  if (stage === 'sem_avanco_expirado') patch.status = 'expired';

  const { error } = await sb.from('sales_opportunities').update(patch).eq('id', opportunityId);
  if (error) return { success: false as const, error: error.message };

  // Conta vira cliente ativo no ganho.
  if (stage === 'fechado_ganho' && existing.account_id) {
    await sb.from('sales_accounts').update({ status: 'active_client', contract_start_date: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', existing.account_id);
  }
  await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, opportunity_id: opportunityId, account_id: existing.account_id,
    note: `Estágio: ${existing.stage} → ${stage}${lossReason ? ` (${lossReason.trim()})` : ''}`,
    created_by_email: ctx.email,
  });
  return { success: true as const };
}

export async function addActivityNote(opportunityId: string, note: string) {
  const ctx = await requireRepresentativeAction();
  const text = String(note || '').trim();
  if (!text) return { success: false as const, error: 'Nota vazia' };
  const sb = createSupabaseAdmin();
  const { data: opp } = await sb.from('sales_opportunities').select('representante_id, account_id').eq('id', opportunityId).maybeSingle();
  if (!opp) return { success: false as const, error: 'Oportunidade não encontrada' };
  assertRepresentativeOwnership(ctx, opp.representante_id);
  const { error } = await sb.from('sales_activity_notes').insert({
    representante_id: ctx.rep.id, opportunity_id: opportunityId, account_id: opp.account_id,
    note: text, created_by_email: ctx.email,
  });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Resumo do pipeline do RC (dashboard): KPIs + grupos por estágio. */
export async function getPipelineSummary() {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_opportunities').select(OPP_SELECT).eq('representante_id', ctx.rep.id);
  if (error) return { success: false as const, error: error.message };
  const opps = (data || []).map(withDerivedProtection);
  return {
    success: true as const,
    kpis: {
      pipelineTotal: pipelineTotal(opps),
      pipelineQualificado: pipelineQualificado(opps),
      pipelinePonderado: pipelinePonderado(opps),
    },
    stages: groupByStage(opps),
  };
}

/** Alertas de atenção imediata do RC (sem próxima ação, proteções vencendo). */
export async function getOpportunityAlerts() {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_opportunities').select(OPP_SELECT).eq('representante_id', ctx.rep.id).eq('status', 'open');
  if (error) return { success: false as const, error: error.message };
  const opps = (data || []).map(withDerivedProtection);
  return {
    success: true as const,
    semProximaAcao: oportunidadesSemProximaAcao(opps).map((o) => ({ id: o.id, nome: o.opportunity_name, conta: o.account?.trade_name || o.account?.legal_name || '' })),
    protecoesVencendo: protecoesVencendo(opps).map((o) => ({
      id: o.id, nome: o.opportunity_name, conta: o.account?.trade_name || o.account?.legal_name || '',
      alerta: protectionAlertLabel(o.protection_end_date), fim: o.protection_end_date,
    })),
  };
}
