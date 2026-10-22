import { describe, it, expect } from 'vitest';
import { DIA_PAGAMENTO_COMISSAO, dataPrevistaPagamentoComissao, eventosDoPlano, planoDeComissao } from '@/lib/sales/commissions';
import { commissionRatesFor } from '@/lib/sales/constants';

/**
 * Contrato de representação v5, cláusula 11.2: a comissão é paga até o dia 15
 * do mês seguinte à liquidação pelo cliente. (De 19/10 a 21/10/2026 o portal
 * usava o dia 10, decisão anterior ao contrato; antes de 19/10, o dia 1.)
 */
describe('data prevista de pagamento da comissão', () => {
  it('é o dia 15 do mês seguinte à competência', () => {
    expect(DIA_PAGAMENTO_COMISSAO).toBe(15);
    expect(dataPrevistaPagamentoComissao(new Date('2026-10-19T12:00:00Z'))).toBe('2026-11-15');
    expect(dataPrevistaPagamentoComissao(new Date('2026-10-01T00:00:00Z'))).toBe('2026-11-15');
  });

  it('vira o ano em dezembro', () => {
    expect(dataPrevistaPagamentoComissao(new Date('2026-12-15T00:00:00Z'))).toBe('2027-01-15');
  });

  it('com ajuda de custo: cada parcela, desde a 1ª, tem a sua data no dia 15 do mês seguinte', () => {
    const plano = planoDeComissao(3000, 3, commissionRatesFor('com_ajuda'));
    const eventos = eventosDoPlano(plano, '2026-11-20');
    expect(eventos.map((e) => [e.type, e.reference_month, e.expected_payment_date])).toEqual([
      ['recorrente', '2026-11-01', '2026-12-15'],
      ['recorrente', '2026-12-01', '2027-01-15'],
      ['recorrente', '2027-01-01', '2027-02-15'],
    ]);
  });

  it('sem ajuda de custo: a aquisição vai com o 1º pagamento e as parcelas começam na 2ª', () => {
    const plano = planoDeComissao(3000, 3, commissionRatesFor('sem_ajuda'));
    const eventos = eventosDoPlano(plano, '2026-11-20');
    expect(eventos.map((e) => [e.type, e.reference_month, e.expected_payment_date])).toEqual([
      ['aquisicao', '2026-11-01', '2026-12-15'],
      ['recorrente', '2026-12-01', '2027-01-15'],
      ['recorrente', '2027-01-01', '2027-02-15'],
    ]);
  });
});
