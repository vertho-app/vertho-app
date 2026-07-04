'use server';

// Portal do Representante — visão de comissões do RC.
//
// MVP: a tabela do dashboard mistura ESTIMATIVAS (derivadas das propostas
// vivas) com EVENTOS reais de sales_commission_events. Dedup por
// (proposal_id, tipo): quando existe evento, ele vence a estimativa.
import { createSupabaseAdmin } from '@/lib/supabase';
import {
  requireRepresentativeAction,
  requireRepresentativeOrAdminAction,
} from '@/lib/sales/permissions';
import { COMMISSION_RATES, COMMISSION_STATUS_LABELS, COMMISSION_TYPE_LABELS } from '@/lib/sales/constants';
import type { SalesCommissionEvent, SalesProposal } from '@/lib/sales/types';

export type CommissionRow = {
  cliente: string;
  tipo: string;      // rótulo comercial (Aquisição, Recorrente, ...)
  base: number | null;
  percent: number | null; // em % (9, 12, ...)
  status: string;    // Potencial | Prevista | A receber | Paga
  valor: number;
  previsao: string | null; // previsão de pagamento (null no MVP p/ estimativas)
};

type AccountJoin = { legal_name: string | null; trade_name: string | null } | null;
const clienteDe = (account: AccountJoin) => account?.trade_name || account?.legal_name || '—';

/** Tabela de comissões do dashboard do RC (estimativas + eventos, deduplicado). */
export async function getCommissionSummary() {
  const ctx = await requireRepresentativeAction();
  const sb = createSupabaseAdmin();

  const [{ data: proposals, error: propErr }, { data: events, error: evErr }] = await Promise.all([
    sb.from('sales_proposals')
      .select('*, account:sales_accounts (legal_name, trade_name)')
      .eq('representante_id', ctx.rep.id)
      .not('status', 'in', '(lost,rejected)')
      .order('created_at', { ascending: false }),
    sb.from('sales_commission_events')
      .select('*, account:sales_accounts (legal_name, trade_name)')
      .eq('representante_id', ctx.rep.id)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false }),
  ]);
  if (propErr) return { success: false as const, error: propErr.message };
  if (evErr) return { success: false as const, error: evErr.message };

  const rows: CommissionRow[] = [];

  // Eventos existentes por (proposal_id, tipo) — vencem a estimativa da proposta.
  const eventKeys = new Set(
    ((events || []) as SalesCommissionEvent[])
      .filter((e) => e.proposal_id)
      .map((e) => `${e.proposal_id}:${e.type}`),
  );

  // (a) Estimativas das propostas vivas: aquisição 9% + recorrente 12%.
  for (const p of (proposals || []) as (SalesProposal & { account: AccountJoin })[]) {
    const cliente = clienteDe(p.account);
    const status = p.status === 'accepted' ? 'Prevista' : 'Potencial';
    if (!eventKeys.has(`${p.id}:aquisicao`)) {
      rows.push({
        cliente,
        tipo: COMMISSION_TYPE_LABELS.aquisicao,
        base: p.total_contract_value != null ? Number(p.total_contract_value) : null,
        percent: COMMISSION_RATES.acquisition * 100,
        status,
        valor: Number(p.estimated_acquisition_commission) || 0,
        previsao: null, // MVP: sem previsão de pagamento para estimativas
      });
    }
    if (!eventKeys.has(`${p.id}:recorrente`)) {
      rows.push({
        cliente,
        tipo: COMMISSION_TYPE_LABELS.recorrente,
        base: p.total_contract_value != null ? Number(p.total_contract_value) : null,
        percent: COMMISSION_RATES.recurring * 100,
        status,
        valor: Number(p.estimated_recurring_commission) || 0,
        previsao: null,
      });
    }
  }

  // (b) Eventos reais (mais "reais" que a estimativa — entram todos).
  for (const e of (events || []) as (SalesCommissionEvent & { account: AccountJoin })[]) {
    rows.push({
      cliente: clienteDe(e.account),
      tipo: COMMISSION_TYPE_LABELS[e.type] || e.type,
      base: e.base_value != null ? Number(e.base_value) : null,
      percent: e.percent != null ? Number(e.percent) : null,
      status: COMMISSION_STATUS_LABELS[e.status] || e.status,
      valor: Number(e.amount) || 0,
      previsao: e.expected_payment_date,
    });
  }

  const totals = {
    potencial: rows.filter((r) => r.status === 'Potencial').reduce((s, r) => s + r.valor, 0),
    prevista: rows.filter((r) => r.status === 'Prevista').reduce((s, r) => s + r.valor, 0),
  };

  return { success: true as const, rows, totals };
}

export async function listCommissionEvents(filters?: { status?: string }) {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();
  let q = sb.from('sales_commission_events')
    .select('*, account:sales_accounts (legal_name, trade_name)')
    .order('created_at', { ascending: false });
  if (ctx.kind === 'representative') q = q.eq('representante_id', ctx.rep.id);
  if (filters?.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesCommissionEvent[] };
}
