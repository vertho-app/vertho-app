// Cálculo de comissão do canal — NUNCA dentro de componentes React.
//
// Régua: o contrato de representação comercial v6 (cláusulas 10ª e 11ª, Anexo
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
  type: 'aquisicao' | 'recorrente' | 'renovacao' | 'expansao' | 'chargeback' | 'indicacao';
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
 * Como o cliente paga (contrato v6, 10.2 e 10.3), informado pela vertho.ai na
 * aprovação da proposta (`sales_proposals.payment_count` e
 * `first_payment_offset_months`, mig 298). Sem nada, um pagamento por mês de
 * vigência, o primeiro no mês do aceite.
 */
export type CronogramaPagamento = {
  /** Quantos pagamentos o cliente faz (1 = à vista); null = um por mês de vigência. */
  pagamentos?: number | null;
  /** Meses entre o aceite e o 1º pagamento (o prazo do cliente). */
  primeiroEmMeses?: number | null;
};

export type PagamentoDoCliente = {
  numero: number;
  /** Meses depois do aceite em que o pagamento cai. */
  mes: number;
  /** Parcelas Mensais Equivalentes que ele cobre (1 = a primeira), inclusive. */
  pmeDe: number;
  pmeAte: number;
};

/**
 * Os pagamentos do cliente e as Parcelas Mensais Equivalentes que cada um cobre.
 * Pagamentos iguais, cada um adiantado do período que cobre: 12 meses em 4
 * pagamentos caem nos meses 0, 3, 6 e 9 e cobrem 1-3, 4-6, 7-9 e 10-12.
 */
export function pagamentosDoCronograma(parcelas: number, cronograma: CronogramaPagamento = {}): PagamentoDoCliente[] {
  const n = Math.max(0, Math.floor(Number(parcelas) || 0));
  if (!n) return [];
  const k = Math.min(n, Math.max(1, Math.floor(Number(cronograma.pagamentos) || n)));
  const atraso = Math.min(24, Math.max(0, Math.floor(Number(cronograma.primeiroEmMeses) || 0)));
  return Array.from({ length: k }, (_, i) => {
    const pmeDe = Math.floor((i * n) / k) + 1;
    return { numero: i + 1, mes: atraso + pmeDe - 1, pmeDe, pmeAte: Math.floor(((i + 1) * n) / k) };
  });
}

/**
 * Eventos previstos (`forecast`) que o aceite lança, um por fato que gera
 * comissão: a aquisição, com o 1º pagamento, e uma linha por PAGAMENTO do
 * cliente com a comissão das Parcelas Mensais Equivalentes que ele cobre (10.3:
 * a parcela conta quando é coberta por um pagamento). Sem cronograma, um
 * pagamento por mês: a parcela k (1 = a do mês do aceite) cai em início + (k − 1)
 * meses, e cada linha é uma parcela. O direito nasce com o pagamento do cliente
 * (11.1): o financeiro passa cada evento para "a receber" quando ele é pago.
 * Os valores não mudam com o cronograma, só a data: a soma é sempre o plano.
 */
export function eventosDoPlano(
  plano: PlanoComissao,
  inicio: Date | string,
  cronograma: CronogramaPagamento = {},
): Array<CommissionEventDraft & { reference_month: string; expected_payment_date: string }> {
  const start = typeof inicio === 'string' ? new Date(`${inicio.slice(0, 10)}T00:00:00Z`) : inicio;
  const competencia = (mes: number) => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + mes, 1));
  const pagamentos = pagamentosDoCronograma(plano.parcelas, cronograma);
  const agrupado = pagamentos.length > 0 && pagamentos.length < plano.parcelas;
  const eventos: Array<CommissionEventDraft & { reference_month: string; expected_payment_date: string }> = [];
  if (!pagamentos.length) return eventos;

  const notasDe = (extra?: string) => {
    const partes = [extra, plano.carteira ? NOTA_CARTEIRA : null].filter(Boolean);
    return partes.length ? { notes: partes.join(' ') } : {};
  };

  if (plano.aquisicao.valor > 0) {
    const ref = competencia(pagamentos[0].mes);
    eventos.push({
      type: 'aquisicao', status: 'forecast',
      base_value: plano.aquisicao.base, percent: plano.aquisicao.percent, amount: plano.aquisicao.valor,
      reference_month: ref.toISOString().slice(0, 10),
      expected_payment_date: dataPrevistaPagamentoComissao(ref),
      ...notasDe(agrupado ? `Com o 1º de ${pagamentos.length} pagamentos do cliente.` : undefined),
    });
  }

  const p = plano.sobreParcelas;
  if (p.valorPorParcela > 0) {
    for (const pg of pagamentos) {
      const cobertas = Math.max(0, pg.pmeAte - Math.max(pg.pmeDe, p.primeira) + 1);
      if (!cobertas) continue;
      const ref = competencia(pg.mes);
      eventos.push({
        type: 'recorrente', status: 'forecast',
        base_value: round2(plano.valorParcela * cobertas), percent: p.percent, amount: round2(p.valorPorParcela * cobertas),
        reference_month: ref.toISOString().slice(0, 10),
        expected_payment_date: dataPrevistaPagamentoComissao(ref),
        ...notasDe(agrupado
          ? `Pagamento ${pg.numero} de ${pagamentos.length}: ${cobertas === 1 ? 'parcela mensal equivalente' : `${cobertas} parcelas mensais equivalentes`} (cláusula 10.3).`
          : undefined),
      });
    }
  }
  return eventos;
}
