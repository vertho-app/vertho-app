import { describe, it, expect } from 'vitest';
import { DIA_PAGAMENTO_COMISSAO, dataPrevistaPagamentoComissao, expandRecurringMonthly } from '@/lib/sales/commissions';

/**
 * Regra do canal (dono, 08/10/2026): a comissão é paga até o dia 10 do mês
 * seguinte ao pagamento do cliente. Até 19/10 a previsão saía no dia 1, e o
 * extrato do RC mostrava uma data que o financeiro nunca cumpriria.
 */
describe('data prevista de pagamento da comissão', () => {
  it('é o dia 10 do mês seguinte à competência', () => {
    expect(DIA_PAGAMENTO_COMISSAO).toBe(10);
    expect(dataPrevistaPagamentoComissao(new Date('2026-10-19T12:00:00Z'))).toBe('2026-11-10');
    expect(dataPrevistaPagamentoComissao(new Date('2026-10-01T00:00:00Z'))).toBe('2026-11-10');
  });

  it('vira o ano em dezembro', () => {
    expect(dataPrevistaPagamentoComissao(new Date('2026-12-15T00:00:00Z'))).toBe('2027-01-10');
  });

  it('cada parcela do recorrente tem a sua data no dia 10 do mês seguinte', () => {
    const eventos = expandRecurringMonthly(1000, 3, '2026-11-20');
    expect(eventos.map((e) => [e.reference_month, e.expected_payment_date])).toEqual([
      ['2026-11-01', '2026-12-10'],
      ['2026-12-01', '2027-01-10'],
      ['2027-01-01', '2027-02-10'],
    ]);
  });
});
