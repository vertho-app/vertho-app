/**
 * Comissão do RC pelo contrato de representação v5 (22/10/2026), cláusula 10ª e
 * Anexo II, nos dois modelos (mig 295):
 *
 *   · sem ajuda de custo: aquisição de 8% sobre o Valor Total do Contrato,
 *     limitada às parcelas dos 12 primeiros meses, paga com o 1º pagamento
 *     (10.3a); 10% sobre cada parcela paga A PARTIR DA 2ª (10.3b);
 *   · com ajuda de custo: 10% sobre cada parcela paga, desde a 1ª, sem aquisição (10.4);
 *   · cliente da carteira: 50% dos percentuais, mesma mecânica (10.6);
 *   · vale o modelo gravado na proposta na aprovação, não o atual do RC (10.5).
 *
 * Até 21/10 o portal cobrava 8% sobre o contrato inteiro, 10% de TODAS as
 * parcelas, e lia o modelo do RC no dia do aceite.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import {
  COMMISSION_RATES,
  COMPENSATION_MODELS,
  commissionRatesFor,
} from '@/lib/sales/constants';
import {
  calculateProposalFinancials,
  eventosDoPlano,
  planoDeComissao,
} from '@/lib/sales/commissions';

let sb: SupabaseMock = criarSupabaseMock();
let modeloAtualDoRc: string = 'sem_ajuda';

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/sales/permissions', () => ({
  requireRepresentativeAction: vi.fn(async () => ({
    email: 'rc@teste.vertho',
    rep: { id: 'rc-1', status: 'active', compensation_model: modeloAtualDoRc },
  })),
  requireRepresentativeOrAdminAction: vi.fn(),
  requireCommercialAdminAction: vi.fn(),
  assertRepresentativeOwnership: vi.fn(),
}));
vi.mock('@/lib/authz', () => ({ isPlatformAdmin: vi.fn(async () => false) }));

import { markProposalAccepted } from '@/actions/sales/proposals';

describe('taxas por modelo', () => {
  it('com ajuda de custo: sem aquisição e 10% desde a 1ª parcela', () => {
    expect(commissionRatesFor('com_ajuda')).toEqual({ acquisition: 0, recurring: 0.10, firstCommissionedInstallment: 1 });
  });

  it('sem ajuda de custo é o padrão: 8% de aquisição e 10% a partir da 2ª parcela', () => {
    expect(commissionRatesFor('sem_ajuda')).toEqual({ acquisition: 0.08, recurring: 0.10, firstCommissionedInstallment: 2 });
    expect(commissionRatesFor(null)).toBe(COMMISSION_RATES);
    expect(commissionRatesFor('outro')).toBe(COMMISSION_RATES);
  });

  it('as CHECKs vigentes (mig 298, que redefine as das 295 e 296) aceitam exatamente os modelos do código', () => {
    const sql = readFileSync('migrations/298-rc-contrato-v6.sql', 'utf8');
    const daMig = (coluna: RegExp) => {
      const lista = coluna.exec(sql)?.[1] ?? '';
      return lista.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();
    };
    expect(daMig(/sales_representatives_compensation_model_check\s+CHECK \(compensation_model IN \(([^)]*)\)\)/))
      .toEqual([...COMPENSATION_MODELS].sort());
    expect(daMig(/sales_proposals_compensation_model_check\s+CHECK \(compensation_model IS NULL OR compensation_model IN \(([^)]*)\)\)/))
      .toEqual([...COMPENSATION_MODELS].sort());
  });

  it('indicação: 10% desde a 1ª parcela, sem aquisição', () => {
    expect(commissionRatesFor('indicacao')).toEqual({ acquisition: 0, recurring: 0.10, firstCommissionedInstallment: 1 });
  });
});

describe('estimativa da proposta (plano de comissão)', () => {
  const sem = commissionRatesFor('sem_ajuda');
  const com = commissionRatesFor('com_ajuda');
  const resumo = (total: number, meses: number, rates = sem, carteira = false) => {
    const p = planoDeComissao(total, meses, rates, carteira);
    return { aquisicao: p.aquisicao.valor, baseAquisicao: p.aquisicao.base, parcelas: p.sobreParcelas.quantidade, sobreParcelas: p.sobreParcelas.valor, total: p.total };
  };

  it('sem ajuda, 12 meses: 8% do contrato + 10% de 11 parcelas', () => {
    expect(resumo(24000, 12)).toEqual({ aquisicao: 1920, baseAquisicao: 24000, parcelas: 11, sobreParcelas: 2200, total: 4120 });
  });

  it('sem ajuda, 24 meses: a aquisição só vê os 12 primeiros meses', () => {
    expect(resumo(48000, 24)).toEqual({ aquisicao: 1920, baseAquisicao: 24000, parcelas: 23, sobreParcelas: 4600, total: 6520 });
  });

  it('sem ajuda, 13 meses: o teto entra no 13º mês', () => {
    expect(resumo(26000, 13)).toEqual({ aquisicao: 1920, baseAquisicao: 24000, parcelas: 12, sobreParcelas: 2400, total: 4320 });
  });

  it('sem ajuda, 6 meses: contrato curto não tem teto', () => {
    expect(resumo(12000, 6)).toEqual({ aquisicao: 960, baseAquisicao: 12000, parcelas: 5, sobreParcelas: 1000, total: 1960 });
  });

  it('com ajuda: aquisição zero e 10% de todas as parcelas', () => {
    expect(resumo(48000, 24, com)).toEqual({ aquisicao: 0, baseAquisicao: 24000, parcelas: 24, sobreParcelas: 4800, total: 4800 });
  });

  it('cliente da carteira paga 50% dos percentuais, com a mesma mecânica', () => {
    expect(resumo(24000, 12, sem, true)).toEqual({ aquisicao: 960, baseAquisicao: 24000, parcelas: 11, sobreParcelas: 1100, total: 2060 });
    expect(resumo(24000, 12, com, true)).toEqual({ aquisicao: 0, baseAquisicao: 24000, parcelas: 12, sobreParcelas: 1200, total: 1200 });
    const p = planoDeComissao(24000, 12, sem, true);
    expect([p.aquisicao.percent, p.sobreParcelas.percent]).toEqual([4, 5]);
  });

  it('a estimativa gravada na proposta é o próprio plano, depois do desconto', () => {
    const fin = calculateProposalFinancials({ monthly_value: 2500, contract_duration_months: 24, discount_requested: 20 }, sem);
    expect(fin.total_contract_value).toBe(48000);
    expect([fin.estimated_acquisition_commission, fin.estimated_recurring_commission, fin.estimated_total_commission])
      .toEqual([1920, 4600, 6520]);
  });

  it('a soma dos eventos lançados no aceite é sempre a estimativa', () => {
    for (const rates of [sem, com]) {
      for (const carteira of [false, true]) {
        for (const meses of [6, 7, 12, 13, 18, 24]) {
          for (const total of [12000, 31337.77, 48000.01]) {
            const plano = planoDeComissao(total, meses, rates, carteira);
            const soma = eventosDoPlano(plano, '2026-11-03').reduce((s, e) => s + e.amount, 0);
            expect(Math.round(soma * 100) / 100, `${rates.acquisition} ${carteira} ${meses} ${total}`).toBe(plano.total);
          }
        }
      }
    }
  });
});

describe('aceite: os eventos seguem as regras GRAVADAS na proposta', () => {
  const base = {
    id: 'prop-1', representante_id: 'rc-1', status: 'sent_to_client',
    opportunity_id: null, account_id: null,
    total_contract_value: 24000, contract_duration_months: 12, monthly_value: 2000,
  };
  let proposta: Record<string, any> = base;

  beforeEach(() => {
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_proposals' ? proposta : null),
      // o update condicional (status = sent_to_client) casou a linha
      escrita: (tabela, op) => (tabela === 'sales_proposals' && op === 'update' ? [{ id: 'prop-1' }] : null),
    });
  });

  const eventos = () => sb.escritas
    .filter((e) => e.tabela === 'sales_commission_events' && e.op === 'insert')
    .flatMap((e) => (Array.isArray(e.payload) ? e.payload : [e.payload]));

  it('proposta aprovada no modelo com ajuda: sem aquisição, 12 parcelas de 10%, mesmo com o RC hoje sem ajuda (10.5)', async () => {
    proposta = { ...base, compensation_model: 'com_ajuda', carteira: false };
    modeloAtualDoRc = 'sem_ajuda';
    expect((await markProposalAccepted('prop-1')).success).toBe(true);
    const ev = eventos();
    expect(ev.filter((e) => e.type === 'aquisicao')).toHaveLength(0);
    const parcelas = ev.filter((e) => e.type === 'recorrente');
    expect(parcelas).toHaveLength(12);
    expect(parcelas.every((e) => e.percent === 10 && e.amount === 200)).toBe(true);
  });

  it('sem ajuda: aquisição de 8% e 11 parcelas de 10%, a 1ª fica com a aquisição', async () => {
    proposta = { ...base, compensation_model: 'sem_ajuda', carteira: false };
    modeloAtualDoRc = 'com_ajuda';
    expect((await markProposalAccepted('prop-1')).success).toBe(true);
    const ev = eventos();
    expect(ev.filter((e) => e.type === 'aquisicao').map((e) => [e.base_value, e.percent, e.amount])).toEqual([[24000, 8, 1920]]);
    const parcelas = ev.filter((e) => e.type === 'recorrente');
    expect(parcelas).toHaveLength(11);
    expect(parcelas.every((e) => e.percent === 10 && e.amount === 200)).toBe(true);
  });

  it('cliente da carteira: 4% + 5%, com a nota da cláusula 10.6', async () => {
    proposta = { ...base, compensation_model: 'sem_ajuda', carteira: true };
    expect((await markProposalAccepted('prop-1')).success).toBe(true);
    const ev = eventos();
    expect(ev.find((e) => e.type === 'aquisicao')?.amount).toBe(960);
    expect(ev.filter((e) => e.type === 'recorrente').every((e) => e.percent === 5 && e.amount === 100)).toBe(true);
    expect(ev.every((e) => /10\.6/.test(e.notes ?? ''))).toBe(true);
  });

  it('proposta antiga sem modelo gravado usa o modelo atual do RC', async () => {
    proposta = { ...base, compensation_model: null, carteira: false };
    modeloAtualDoRc = 'com_ajuda';
    expect((await markProposalAccepted('prop-1')).success).toBe(true);
    expect(eventos().filter((e) => e.type === 'aquisicao')).toHaveLength(0);
  });

  it('falha ao gravar os eventos volta como erro, e não como sucesso', async () => {
    proposta = { ...base, compensation_model: 'com_ajuda', carteira: false };
    sb.falharEm({ tabela: 'sales_commission_events', op: 'insert', mensagem: 'timeout no pool' });
    const r = await markProposalAccepted('prop-1');
    expect(r.success).toBe(false);
    expect((r as { error?: string }).error).toMatch(/previsão de comissão não foi gravada/);
  });

  it('aceite repetido (o update não casa a linha) não lança a comissão de novo', async () => {
    proposta = { ...base, compensation_model: 'sem_ajuda', carteira: false };
    sb = criarSupabaseMock({
      resolver: (tabela) => (tabela === 'sales_proposals' ? proposta : null),
      escrita: () => [],
    });
    const r = await markProposalAccepted('prop-1');
    expect(r.success).toBe(false);
    expect(eventos()).toHaveLength(0);
  });
});
