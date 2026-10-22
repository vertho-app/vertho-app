// Cálculo de comissão do canal — NUNCA dentro de componentes React.
//
// Régua: o contrato de representação comercial v5 (cláusulas 10ª e 11ª, Anexo
// II). As taxas dependem do MODELO de remuneração do RC
// (`commissionRatesFor(model)`, em constants.ts) e de a proposta ser de cliente
// da carteira (50% dos percentuais, 10.6). `planoDeComissao` é a fonte ÚNICA:
// a estimativa gravada na proposta, o resumo que o RC vê enquanto digita e os
// eventos lançados no aceite saem dela, então a soma dos eventos é sempre a
// estimativa.
import {
  ACQUISITION_CAP_MONTHS, CARTEIRA_FACTOR, COMMISSION_RATES, type CommissionRates,
} from './constants';

export type ProposalFinancialInput = {
  monthly_value: number | null | undefined;      // mensalidade de tabela (bruta)
  contract_duration_months: number | null | undefined;
  discount_requested?: number | null;            // % de desconto aplicado ao total
};

export type ProposalFinancials = {
  contract_value_gross: number;      // mensal × vigência (antes do desconto)
  discount_amount: number;           // valor do desconto em R$
  total_contract_value: number;      // VALOR FINAL (após o desconto)
  estimated_acquisition_commission: number;
  estimated_recurring_commission: number;
  estimated_total_commission: number;
  margin_alert: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Percentual em pontos (0.04 → 4), sem o ruído do ponto flutuante (0.05 × 100). */
const emPontos = (fracao: number) => Math.round(fracao * 10000) / 100;

/**
 * Comissão de UMA proposta segundo o contrato.
 *
 * - Aquisição (só no modelo sem ajuda): percentual sobre o Valor Total do
 *   Contrato, limitado à soma das parcelas dos primeiros 12 meses (10.3a).
 * - Parcelas: percentual sobre cada parcela, a partir da 2ª no modelo sem ajuda
 *   (a 1ª dispara a aquisição, 10.3b) e desde a 1ª no modelo com ajuda (10.4).
 * - Carteira: os dois percentuais caem à metade (10.6), mesma mecânica.
 *
 * As parcelas são a vigência em meses, cada uma valendo total ÷ vigência.
 */
export type PlanoComissao = {
  carteira: boolean;
  parcelas: number;
  valorParcela: number;
  aquisicao: { percent: number; base: number; valor: number; limitadaA12Meses: boolean };
  sobreParcelas: {
    percent: number;
    primeira: number;
    quantidade: number;
    valorPorParcela: number;
    base: number;
    valor: number;
  };
  total: number;
};

export function planoDeComissao(
  totalContrato: number,
  meses: number | null | undefined,
  rates: CommissionRates = COMMISSION_RATES,
  carteira = false,
): PlanoComissao {
  const total = Math.max(0, Number(totalContrato) || 0);
  const n = Math.max(0, Math.floor(Number(meses) || 0));
  const fator = carteira ? CARTEIRA_FACTOR : 1;
  const pctAquisicao = rates.acquisition * fator;
  const pctParcela = rates.recurring * fator;
  const valorParcela = n > 0 ? total / n : 0;

  const limitada = n > ACQUISITION_CAP_MONTHS;
  const baseAquisicao = limitada ? round2(valorParcela * ACQUISITION_CAP_MONTHS) : total;
  const aquisicao = round2(baseAquisicao * pctAquisicao);

  const primeira = rates.firstCommissionedInstallment;
  const quantidade = Math.max(0, n - (primeira - 1));
  const valorPorParcela = round2(valorParcela * pctParcela);
  const sobreParcelas = round2(valorPorParcela * quantidade);

  return {
    carteira,
    parcelas: n,
    valorParcela: round2(valorParcela),
    aquisicao: { percent: emPontos(pctAquisicao), base: baseAquisicao, valor: aquisicao, limitadaA12Meses: limitada },
    sobreParcelas: {
      percent: emPontos(pctParcela),
      primeira,
      quantidade,
      valorPorParcela,
      base: round2(valorParcela * quantidade),
      valor: sobreParcelas,
    },
    total: round2(aquisicao + sobreParcelas),
  };
}

/**
 * Deriva os valores financeiros da proposta a partir de mensalidade × vigência.
 * `margin_alert` liga quando o desconto solicitado passa de 15% (sinaliza
 * aprovação com atenção à margem; a política em si é decidida pela Vertho).
 */
export function calculateProposalFinancials(
  input: ProposalFinancialInput,
  rates: CommissionRates = COMMISSION_RATES,
  carteira = false,
): ProposalFinancials {
  const monthly = Math.max(0, Number(input.monthly_value) || 0);
  const months = Number(input.contract_duration_months) || 0;
  const discount = Math.min(100, Math.max(0, Number(input.discount_requested) || 0));

  const gross = round2(monthly * months);
  const total = round2(gross * (1 - discount / 100)); // valor final (após desconto)

  // Comissões incidem sobre o valor final do contrato (10.2: já deduzidos os descontos).
  const plano = planoDeComissao(total, months, rates, carteira);

  return {
    contract_value_gross: gross,
    discount_amount: round2(gross - total),
    total_contract_value: total,
    estimated_acquisition_commission: plano.aquisicao.valor,
    estimated_recurring_commission: plano.sobreParcelas.valor,
    estimated_total_commission: plano.total,
    margin_alert: discount > 15,
  };
}

// ── Eventos (sales_commission_events) ───────────────────────────────────────

export type CommissionEventDraft = {
  type: 'aquisicao' | 'recorrente' | 'renovacao' | 'expansao' | 'chargeback';
  status: 'potencial' | 'forecast' | 'accrued' | 'paid' | 'cancelled';
  base_value: number;
  percent: number;
  amount: number;
  reference_month?: string;
  notes?: string;
};

/** Estorno/compensação (chargeback): valor negativo compensa eventos futuros (11.4). */
export function draftChargebackEvent(amount: number, notes?: string): CommissionEventDraft & { notes?: string } {
  return { type: 'chargeback', status: 'accrued', base_value: Math.abs(amount), percent: 0, amount: -Math.abs(round2(amount)), ...(notes ? { notes } : {}) };
}

/** Dia do mês em que a comissão é paga: até o dia 15 do mês seguinte ao pagamento do cliente (contrato, 11.2). */
export const DIA_PAGAMENTO_COMISSAO = 15;

/**
 * Data prevista de pagamento da comissão de uma competência: dia 15 do mês
 * SEGUINTE ao pagamento do cliente (11.2). Na previsão (`forecast`) o pagamento
 * do cliente é suposto dentro do próprio mês da competência; a data real só
 * existe quando o financeiro marca o evento como pago.
 */
export function dataPrevistaPagamentoComissao(competencia: Date): string {
  return new Date(Date.UTC(competencia.getUTCFullYear(), competencia.getUTCMonth() + 1, DIA_PAGAMENTO_COMISSAO))
    .toISOString().slice(0, 10);
}

const NOTA_CARTEIRA = 'Cliente da carteira (cláusula 10.6): 50% dos percentuais do modelo.';

/**
 * Eventos previstos (`forecast`) que o aceite lança, um por fato que gera
 * comissão: a aquisição, ligada ao 1º pagamento, e uma linha por parcela
 * comissionada, na competência do mês em que a parcela vence. A parcela k
 * (1 = a do mês do aceite) cai em início + (k − 1) meses. O direito nasce com o
 * pagamento do cliente (11.1): o financeiro passa cada evento para "a receber"
 * quando a parcela é paga.
 */
export function eventosDoPlano(
  plano: PlanoComissao,
  inicio: Date | string,
): Array<CommissionEventDraft & { reference_month: string; expected_payment_date: string }> {
  const start = typeof inicio === 'string' ? new Date(`${inicio.slice(0, 10)}T00:00:00Z`) : inicio;
  const competencia = (k: number) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + k - 1, 1));
  const notas = plano.carteira ? { notes: NOTA_CARTEIRA } : {};
  const eventos: Array<CommissionEventDraft & { reference_month: string; expected_payment_date: string }> = [];

  if (plano.aquisicao.valor > 0) {
    const ref = competencia(1);
    eventos.push({
      type: 'aquisicao', status: 'forecast',
      base_value: plano.aquisicao.base, percent: plano.aquisicao.percent, amount: plano.aquisicao.valor,
      reference_month: ref.toISOString().slice(0, 10),
      expected_payment_date: dataPrevistaPagamentoComissao(ref),
      ...notas,
    });
  }

  const p = plano.sobreParcelas;
  if (p.valorPorParcela > 0) {
    for (let k = p.primeira; k <= plano.parcelas; k++) {
      const ref = competencia(k);
      eventos.push({
        type: 'recorrente', status: 'forecast',
        base_value: plano.valorParcela, percent: p.percent, amount: p.valorPorParcela,
        reference_month: ref.toISOString().slice(0, 10),
        expected_payment_date: dataPrevistaPagamentoComissao(ref),
        ...notas,
      });
    }
  }
  return eventos;
}
