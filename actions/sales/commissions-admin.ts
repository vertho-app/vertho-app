'use server';

// Portal do Representante — gestão financeira de comissões (admin/Vertho).
//
// Ciclo de vida do evento de comissão (sales_commission_events.status):
//   forecast (previsto) → accrued (a receber) → paid (pago)
//                       ↘ cancelled (proposta caiu / não devida)
//   chargeback = evento negativo (estorno de contrato cancelado/reembolsado)
//
// Só admin com sales_channel.manage muda status/paga/estorna. RC nunca paga a
// si mesmo nem muda o status (só emite NF numa comissão "a receber").
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireCommercialAdminAction } from '@/lib/sales/permissions';
import { draftChargebackEvent } from '@/lib/sales/commissions';
import type { SalesCommissionEvent } from '@/lib/sales/types';

const ADMIN_EVENT_SELECT = `*,
  account:sales_accounts (id, legal_name, trade_name),
  proposal:sales_proposals (id, proposal_number),
  representante:sales_representatives (id, name)`;

export async function getCommissionEventsAdmin(filters?: {
  representanteId?: string; status?: string; tipo?: string; mes?: string;
}) {
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();
  let q = sb.from('sales_commission_events').select(ADMIN_EVENT_SELECT)
    .order('reference_month', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });
  if (filters?.representanteId) q = q.eq('representante_id', filters.representanteId);
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.tipo) q = q.eq('type', filters.tipo);
  if (filters?.mes) q = q.eq('reference_month', filters.mes);
  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };
  return { success: true as const, data: (data || []) as SalesCommissionEvent[] };
}

/** Resumo por estágio (todo o canal) para o topo da tela financeira. */
export async function getCommissionAdminSummary() {
  await requireCommercialAdminAction(false);
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.from('sales_commission_events')
    .select('status, amount, invoice_issued_at');
  if (error) return { success: false as const, error: error.message };
  const ev = (data || []) as Pick<SalesCommissionEvent, 'status' | 'amount' | 'invoice_issued_at'>[];
  const sum = (pred: (e: typeof ev[number]) => boolean) => ev.filter(pred).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return {
    success: true as const,
    totals: {
      previsto: sum((e) => e.status === 'forecast' || e.status === 'potencial'),
      aReceber: sum((e) => e.status === 'accrued'),
      pago: sum((e) => e.status === 'paid'),
      comNotaPendente: ev.filter((e) => e.status === 'accrued' && !e.invoice_issued_at).length,
    },
  };
}

async function guardEvent(sb: ReturnType<typeof createSupabaseAdmin>, eventId: string) {
  const { data } = await sb.from('sales_commission_events').select('id, status, type').eq('id', eventId).maybeSingle();
  return data as { id: string; status: string; type: string } | null;
}

/** forecast → accrued (reconhece a comissão como devida / "a receber"). */
export async function marcarComissaoAReceber(eventId: string, expectedPaymentDate?: string) {
  await requireCommercialAdminAction();
  const sb = createSupabaseAdmin();
  const ev = await guardEvent(sb, eventId);
  if (!ev) return { success: false as const, error: 'Comissão não encontrada' };
  if (ev.status !== 'forecast' && ev.status !== 'potencial') {
    return { success: false as const, error: 'Só comissões previstas podem virar "a receber"' };
  }
  const patch: Record<string, any> = { status: 'accrued', updated_at: new Date().toISOString() };
  if (expectedPaymentDate) patch.expected_payment_date = expectedPaymentDate;
  const { error } = await sb.from('sales_commission_events').update(patch).eq('id', eventId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** accrued → paid (financeiro pagou). Carimba paid_at. */
export async function marcarComissaoPaga(eventId: string, paidAt?: string) {
  const admin = await requireCommercialAdminAction();
  const sb = createSupabaseAdmin();
  const ev = await guardEvent(sb, eventId);
  if (!ev) return { success: false as const, error: 'Comissão não encontrada' };
  if (ev.status !== 'accrued') return { success: false as const, error: 'Só comissões "a receber" podem ser pagas' };
  const when = paidAt ? new Date(`${paidAt}T12:00:00Z`).toISOString() : new Date().toISOString();
  const { error } = await sb.from('sales_commission_events')
    .update({ status: 'paid', paid_at: when, updated_at: new Date().toISOString() }).eq('id', eventId);
  if (error) return { success: false as const, error: error.message };
  console.log(`[commissions] ${eventId} paga por ${admin.email}`);
  return { success: true as const };
}

/** Cancela um evento previsto/a receber (proposta caiu, não é mais devida). */
export async function cancelarComissao(eventId: string, motivo?: string) {
  await requireCommercialAdminAction();
  const sb = createSupabaseAdmin();
  const ev = await guardEvent(sb, eventId);
  if (!ev) return { success: false as const, error: 'Comissão não encontrada' };
  if (ev.status === 'paid') return { success: false as const, error: 'Comissão já paga não pode ser cancelada (use estorno)' };
  const { error } = await sb.from('sales_commission_events')
    .update({ status: 'cancelled', notes: motivo?.trim() || null, updated_at: new Date().toISOString() }).eq('id', eventId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Registra um ESTORNO (chargeback) — valor negativo, ligado ao RC/conta. */
export async function registrarEstorno(input: { representanteId: string; accountId?: string | null; proposalId?: string | null; valor: number; motivo: string; }) {
  await requireCommercialAdminAction();
  const valor = Number(input.valor);
  if (!input.representanteId) return { success: false as const, error: 'Representante obrigatório' };
  if (!isFinite(valor) || valor <= 0) return { success: false as const, error: 'Valor do estorno deve ser positivo' };
  if (!input.motivo?.trim()) return { success: false as const, error: 'Informe o motivo do estorno' };
  const sb = createSupabaseAdmin();
  const draft = draftChargebackEvent(valor, input.motivo.trim());
  const { error } = await sb.from('sales_commission_events').insert({
    representante_id: input.representanteId,
    account_id: input.accountId || null,
    proposal_id: input.proposalId || null,
    ...draft,
  });
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Export financeiro (CSV) dos eventos filtrados. Gera string; a UI baixa. */
export async function exportComissoesCSV(filters?: { representanteId?: string; status?: string; mes?: string }) {
  const r = await getCommissionEventsAdmin(filters);
  if (!r.success) return r;
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['representante', 'cliente', 'proposta', 'tipo', 'status', 'competencia', 'base', 'percent', 'valor', 'previsao_pagamento', 'nota_fiscal', 'pago_em'];
  const lines = [header.join(';')];
  for (const e of r.data as any[]) {
    lines.push([
      e.representante?.name, e.account?.trade_name || e.account?.legal_name, e.proposal?.proposal_number,
      e.type, e.status, e.reference_month, e.base_value, e.percent, e.amount,
      e.expected_payment_date, e.invoice_number, e.paid_at ? String(e.paid_at).slice(0, 10) : '',
    ].map(esc).join(';'));
  }
  return { success: true as const, csv: lines.join('\n'), count: r.data.length };
}
