// Cálculo de comissão do canal — NUNCA dentro de componentes React.
//
// Política vigente (COMMISSION_RATES):
//   • Aquisição: 9% do valor total do contrato inicial
//   • Recorrente: 12% da receita de assinatura durante a vigência inicial
//   • Renovação/manutenção: 6% após a vigência inicial
//   • Expansão/upsell: 9% do incremental + 12% recorrente do incremental
//
// MVP 1 = ESTIMATIVA a partir da proposta. Pontos de extensão (MVP 2) marcados
// abaixo: forecast, accrued, paid, chargeback, renovação e expansão viram
// eventos em sales_commission_events.
import { COMMISSION_RATES } from './constants';

export type ProposalFinancialInput = {
  monthly_value: number | null | undefined;
  contract_duration_months: number | null | undefined;
  discount_requested?: number | null; // % já refletido no monthly_value informado
};

export type ProposalFinancials = {
  total_contract_value: number;
  estimated_acquisition_commission: number;
  estimated_recurring_commission: number;
  estimated_total_commission: number;
  margin_alert: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Deriva os valores financeiros da proposta a partir de mensalidade × vigência.
 * `margin_alert` liga quando o desconto solicitado passa de 15% (sinaliza
 * aprovação com atenção à margem; a política em si é decidida pela Vertho).
 */
export function calculateProposalFinancials(input: ProposalFinancialInput): ProposalFinancials {
  const monthly = Math.max(0, Number(input.monthly_value) || 0);
  const months = Number(input.contract_duration_months) || 0;
  const total = round2(monthly * months);

  const acquisition = round2(total * COMMISSION_RATES.acquisition);
  const recurring = round2(monthly * months * COMMISSION_RATES.recurring);

  return {
    total_contract_value: total,
    estimated_acquisition_commission: acquisition,
    estimated_recurring_commission: recurring,
    estimated_total_commission: round2(acquisition + recurring),
    margin_alert: (Number(input.discount_requested) || 0) > 15,
  };
}

// ── Pontos de extensão (MVP 2+) ─────────────────────────────────────────────
// Cada função abaixo materializa um EVENTO de comissão (sales_commission_events),
// mantendo a estimativa da proposta intocada como referência.

export type CommissionEventDraft = {
  type: 'aquisicao' | 'recorrente' | 'renovacao' | 'expansao' | 'chargeback';
  status: 'potencial' | 'forecast' | 'accrued' | 'paid' | 'cancelled';
  base_value: number;
  percent: number;
  amount: number;
  reference_month?: string;
};

/** Aquisição: evento único sobre o valor total do contrato inicial. */
export function draftAcquisitionEvent(totalContractValue: number, status: CommissionEventDraft['status'] = 'potencial'): CommissionEventDraft {
  const base = Math.max(0, totalContractValue);
  return { type: 'aquisicao', status, base_value: base, percent: COMMISSION_RATES.acquisition * 100, amount: round2(base * COMMISSION_RATES.acquisition) };
}

/** Recorrente: um evento por competência (mês) sobre a receita RECEBIDA. */
export function draftRecurringEvent(receivedMonthlyRevenue: number, referenceMonth: string, status: CommissionEventDraft['status'] = 'forecast'): CommissionEventDraft {
  const base = Math.max(0, receivedMonthlyRevenue);
  return { type: 'recorrente', status, base_value: base, percent: COMMISSION_RATES.recurring * 100, amount: round2(base * COMMISSION_RATES.recurring), reference_month: referenceMonth };
}

/** Renovação (pós-vigência inicial): 6% da receita recebida. */
export function draftRenewalEvent(receivedMonthlyRevenue: number, referenceMonth: string, status: CommissionEventDraft['status'] = 'forecast'): CommissionEventDraft {
  const base = Math.max(0, receivedMonthlyRevenue);
  return { type: 'renovacao', status, base_value: base, percent: COMMISSION_RATES.renewal * 100, amount: round2(base * COMMISSION_RATES.renewal), reference_month: referenceMonth };
}

/** Expansão: 9% do valor incremental contratado (o recorrente incremental usa draftRecurringEvent). */
export function draftExpansionEvent(incrementalContractValue: number, status: CommissionEventDraft['status'] = 'potencial'): CommissionEventDraft {
  const base = Math.max(0, incrementalContractValue);
  return { type: 'expansao', status, base_value: base, percent: COMMISSION_RATES.expansion * 100, amount: round2(base * COMMISSION_RATES.expansion) };
}

/** Estorno/compensação (chargeback): valor negativo compensa eventos futuros. */
export function draftChargebackEvent(amount: number, notes?: string): CommissionEventDraft & { notes?: string } {
  return { type: 'chargeback', status: 'accrued', base_value: Math.abs(amount), percent: 0, amount: -Math.abs(round2(amount)), ...(notes ? { notes } : {}) };
}

/**
 * Expande a comissão recorrente da vigência inicial em UM evento por competência
 * (mês) — granularidade que o financeiro precisa para reconhecer/pagar mês a mês.
 * Cada mês: 12% da mensalidade recebida, status 'forecast', reference_month no
 * 1º dia e expected_payment_date ~30 dias depois (política simples do MVP).
 */
export function expandRecurringMonthly(
  monthlyValue: number,
  months: number,
  startDate: Date | string,
): Array<CommissionEventDraft & { reference_month: string; expected_payment_date: string }> {
  const monthly = Math.max(0, Number(monthlyValue) || 0);
  const n = Math.max(0, Number(months) || 0);
  const start = typeof startDate === 'string' ? new Date(`${startDate.slice(0, 10)}T00:00:00Z`) : startDate;
  const events: Array<CommissionEventDraft & { reference_month: string; expected_payment_date: string }> = [];
  const amount = round2(monthly * COMMISSION_RATES.recurring);
  for (let i = 0; i < n; i++) {
    const ref = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const pay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i + 1, 1)); // ~mês seguinte
    events.push({
      type: 'recorrente', status: 'forecast',
      base_value: monthly, percent: COMMISSION_RATES.recurring * 100, amount,
      reference_month: ref.toISOString().slice(0, 10),
      expected_payment_date: pay.toISOString().slice(0, 10),
    });
  }
  return events;
}
