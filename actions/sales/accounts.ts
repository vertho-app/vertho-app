'use server';

// Portal do Representante — contas (empresas do relacionamento comercial do RC).
//
// Regras de canal:
//   • RC só enxerga/edita as PRÓPRIAS contas (isolamento por representante_id).
//   • Admin comercial enxerga tudo em leitura (pode filtrar por representante).
//   • Carteira = contas cliente-ativo + fase de comissão derivada da vigência.
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  requireRepresentativeAction,
  requireRepresentativeOrAdminAction,
  assertRepresentativeOwnership,
} from '@/lib/sales/permissions';
import { numOrNull } from '@/lib/sales/validation';
import type { SalesAccount, SalesProposal } from '@/lib/sales/types';

const ACCOUNT_STATUSES = ['prospect', 'active_client', 'inactive', 'lost'] as const;
const CHURN_RISKS = ['baixo', 'medio', 'alto'] as const;

export async function listSalesAccounts(filters?: {
  status?: string;
  search?: string;
  representanteId?: string; // só admin pode usar (RC é sempre o próprio)
}) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('sales_accounts').select('*').order('legal_name');

  if (ctx.kind === 'representative') q = q.eq('representante_id', ctx.rep.id);
  else if (filters?.representanteId) q = q.eq('representante_id', filters.representanteId);

  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.search) {
    const term = filters.search.trim().replace(/[%_,()]/g, ' ');
    if (term) q = q.or(`legal_name.ilike.%${term}%,trade_name.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesAccount[] };
}

export async function getSalesAccount(accountId: string) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_accounts').select('*').eq('id', accountId).maybeSingle();
  if (error) return { success: false as const, error: error.message };
  if (!data) return { success: false as const, error: 'Conta não encontrada' };
  if (ctx.kind === 'representative' && data.representante_id !== ctx.rep.id) {
    return { success: false as const, error: 'FORBIDDEN: conta de outro representante' };
  }

  const [{ data: contacts }, { data: opportunities }] = await Promise.all([
    sb.from('sales_contacts').select('*').eq('account_id', accountId).order('is_primary', { ascending: false }).order('name'),
    sb.from('sales_opportunities').select('id, opportunity_name, stage, status, estimated_value').eq('account_id', accountId).order('updated_at', { ascending: false }),
  ]);

  return {
    success: true as const,
    data: data as SalesAccount,
    contacts: contacts || [],
    opportunities: opportunities || [],
  };
}

/** Campos editáveis da conta (validação compartilhada create/update). */
function accountPatchFromInput(input: Record<string, any>): { patch: Record<string, any> } | { error: string } {
  const patch: Record<string, any> = {};
  const textFields = ['trade_name', 'cnpj', 'segment', 'city', 'state', 'notes'];
  for (const k of textFields) if (k in input) patch[k] = typeof input[k] === 'string' ? (input[k].trim() || null) : input[k] ?? null;
  for (const k of ['number_of_employees', 'number_of_units']) {
    if (k in input) {
      const n = numOrNull(input[k]);
      if (n != null && n < 0) return { error: 'Números não podem ser negativos' };
      patch[k] = n;
    }
  }
  return { patch };
}

export async function createSalesAccount(input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const legalName = String(input.legal_name || '').trim();
  if (!legalName) return { success: false as const, error: 'Razão social (legal_name) é obrigatória' };

  const parsed = accountPatchFromInput(input);
  if ('error' in parsed) return { success: false as const, error: parsed.error };

  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_accounts').insert({
    representante_id: ctx.rep.id,
    legal_name: legalName,
    status: 'prospect',
    ...parsed.patch,
  }).select('*').single();
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: data as SalesAccount };
}

export async function updateSalesAccount(accountId: string, input: Record<string, any>) {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();
  const { data: existing } = await sb.from('sales_accounts').select('id, representante_id').eq('id', accountId).maybeSingle();
  if (!existing) return { success: false as const, error: 'Conta não encontrada' };
  assertRepresentativeOwnership(ctx, existing.representante_id);

  const parsed = accountPatchFromInput(input);
  if ('error' in parsed) return { success: false as const, error: parsed.error };
  const patch = parsed.patch;

  if ('legal_name' in input) {
    const legalName = String(input.legal_name || '').trim();
    if (!legalName) return { success: false as const, error: 'Razão social (legal_name) é obrigatória' };
    patch.legal_name = legalName;
  }
  if ('status' in input) {
    if (!ACCOUNT_STATUSES.includes(input.status)) return { success: false as const, error: 'Status de conta inválido' };
    patch.status = input.status;
  }
  if ('churn_risk' in input) {
    if (input.churn_risk != null && !CHURN_RISKS.includes(input.churn_risk)) {
      return { success: false as const, error: 'Risco de churn inválido (baixo | medio | alto)' };
    }
    patch.churn_risk = input.churn_risk ?? null;
  }
  if ('renewal_date' in input) patch.renewal_date = input.renewal_date || null;

  patch.updated_at = new Date().toISOString();
  const { error } = await sb.from('sales_accounts').update(patch).eq('id', accountId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export type PortfolioRow = {
  account: SalesAccount;
  product_package: string | null;
  monthly_value: number | null;
  contract_duration_months: number | null;
  contract_start_date: string | null;
  renewal_date: string | null;
  /** 12% durante a vigência inicial; 6% após (manutenção/renovação). */
  commission_phase: 'recorrente_12' | 'renovacao_6';
  churn_risk: SalesAccount['churn_risk'];
};

/** Carteira do RC: clientes ativos + dados da proposta aceita mais recente. */
export async function getPortfolio() {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();

  const [{ data: accounts, error: accErr }, { data: proposals, error: propErr }] = await Promise.all([
    sb.from('sales_accounts').select('*').eq('representante_id', ctx.rep.id).eq('status', 'active_client').order('legal_name'),
    sb.from('sales_proposals').select('*').eq('representante_id', ctx.rep.id).eq('status', 'accepted').order('created_at', { ascending: false }),
  ]);
  if (accErr) return { success: false as const, error: accErr.message };
  if (propErr) return { success: false as const, error: propErr.message };

  // Join manual: proposta aceita mais recente por conta (lista já ordenada desc).
  const latestByAccount = new Map<string, SalesProposal>();
  for (const p of (proposals || []) as SalesProposal[]) {
    if (p.account_id && !latestByAccount.has(p.account_id)) latestByAccount.set(p.account_id, p);
  }

  const today = new Date();
  const rows: PortfolioRow[] = ((accounts || []) as SalesAccount[]).map((account) => {
    const proposal = latestByAccount.get(account.id) ?? null;
    const startDate = account.contract_start_date;
    const months = proposal?.contract_duration_months != null ? Number(proposal.contract_duration_months) : null;

    // Fase de comissão: 12% enquanto hoje < início + vigência; depois 6%.
    let phase: PortfolioRow['commission_phase'] = 'recorrente_12';
    if (startDate && months) {
      const end = new Date(`${startDate.slice(0, 10)}T00:00:00Z`);
      end.setUTCMonth(end.getUTCMonth() + months);
      if (today.getTime() >= end.getTime()) phase = 'renovacao_6';
    }

    return {
      account,
      product_package: proposal?.product_package ?? null,
      monthly_value: proposal?.monthly_value ?? null,
      contract_duration_months: months,
      contract_start_date: startDate,
      renewal_date: account.renewal_date,
      commission_phase: phase,
      churn_risk: account.churn_risk,
    };
  });

  return { success: true as const, rows };
}
