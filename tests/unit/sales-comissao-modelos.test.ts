/**
 * Modelo de remuneração por RC (mig 295, decisão do dono em 08/10 e 19/10/2026).
 *
 * Sem ajuda de custo: aquisição 9% + recorrente 12%, renovação 6%, expansão 9% + 12%.
 * Com ajuda de custo: recorrente 10% ao mês, SEM aquisição, renovação 5%, expansão
 * 10% ao mês do incremental. Até 19/10 o portal usava 9% + 12% para todo RC, e o
 * RC com ajuda de custo veria (e o ledger lançaria) uma aquisição que ele não tem.
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
  draftAcquisitionEvent,
  expandRecurringMonthly,
} from '@/lib/sales/commissions';

let sb: SupabaseMock = criarSupabaseMock();
let modelo: string = 'sem_ajuda';

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/sales/permissions', () => ({
  requireRepresentativeAction: vi.fn(async () => ({
    email: 'rc@teste.vertho',
    rep: { id: 'rc-1', status: 'active', compensation_model: modelo },
  })),
  requireRepresentativeOrAdminAction: vi.fn(),
  requireCommercialAdminAction: vi.fn(),
  assertRepresentativeOwnership: vi.fn(),
}));
vi.mock('@/lib/authz', () => ({ isPlatformAdmin: vi.fn(async () => false) }));

import { markProposalAccepted } from '@/actions/sales/proposals';

describe('taxas por modelo', () => {
  it('com ajuda de custo: sem aquisição, 10% ao mês, renovação 5%, expansão só recorrente', () => {
    expect(commissionRatesFor('com_ajuda')).toEqual({ acquisition: 0, recurring: 0.10, renewal: 0.05, expansion: 0 });
  });

  it('sem ajuda de custo é o padrão, inclusive para valor ausente ou desconhecido', () => {
    expect(commissionRatesFor('sem_ajuda')).toEqual({ acquisition: 0.09, recurring: 0.12, renewal: 0.06, expansion: 0.09 });
    expect(commissionRatesFor(null)).toBe(COMMISSION_RATES);
    expect(commissionRatesFor('outro')).toBe(COMMISSION_RATES);
  });

  it('a CHECK da mig 295 aceita exatamente os modelos do código', () => {
    const sql = readFileSync('migrations/295-rc-modelo-remuneracao.sql', 'utf8');
    const lista = /CHECK \(compensation_model IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? '';
    const noSql = lista.split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
    expect(noSql.sort()).toEqual([...COMPENSATION_MODELS].sort());
  });
});

describe('estimativa da proposta', () => {
  const input = { monthly_value: 2000, contract_duration_months: 24, discount_requested: 0 };

  it('sem ajuda: 9% + 12% do valor final (48.000)', () => {
    const fin = calculateProposalFinancials(input, commissionRatesFor('sem_ajuda'));
    expect([fin.estimated_acquisition_commission, fin.estimated_recurring_commission, fin.estimated_total_commission])
      .toEqual([4320, 5760, 10080]);
  });

  it('com ajuda: aquisição zero e 10% do valor final', () => {
    const fin = calculateProposalFinancials(input, commissionRatesFor('com_ajuda'));
    expect([fin.estimated_acquisition_commission, fin.estimated_recurring_commission, fin.estimated_total_commission])
      .toEqual([0, 4800, 4800]);
  });

  it('eventos mensais e de aquisição usam as taxas recebidas', () => {
    const com = commissionRatesFor('com_ajuda');
    expect(expandRecurringMonthly(1000, 2, '2026-11-01', com).map((e) => [e.percent, e.amount])).toEqual([[10, 100], [10, 100]]);
    expect(draftAcquisitionEvent(48000, 'forecast', com).amount).toBe(0);
  });
});

describe('aceite da proposta grava os eventos no modelo do RC', () => {
  const proposta = {
    id: 'prop-1', representante_id: 'rc-1', status: 'sent_to_client',
    opportunity_id: null, account_id: null,
    total_contract_value: 24000, contract_duration_months: 12, monthly_value: 2000,
  };

  beforeEach(() => {
    sb = criarSupabaseMock({ resolver: (tabela) => (tabela === 'sales_proposals' ? proposta : null) });
  });

  const eventos = () => sb.escritas
    .filter((e) => e.tabela === 'sales_commission_events' && e.op === 'insert')
    .flatMap((e) => (Array.isArray(e.payload) ? e.payload : [e.payload]));

  it('com ajuda de custo: nenhum evento de aquisição e 12 mensais de 10%', async () => {
    modelo = 'com_ajuda';
    expect((await markProposalAccepted('prop-1')).success).toBe(true);
    const ev = eventos();
    expect(ev.filter((e) => e.type === 'aquisicao')).toHaveLength(0);
    const mensais = ev.filter((e) => e.type === 'recorrente');
    expect(mensais).toHaveLength(12);
    expect(mensais.every((e) => e.percent === 10 && e.amount === 200)).toBe(true);
  });

  it('falha ao gravar os eventos volta como erro, e não como sucesso', async () => {
    modelo = 'com_ajuda';
    sb.falharEm({ tabela: 'sales_commission_events', op: 'insert', mensagem: 'timeout no pool' });
    const r = await markProposalAccepted('prop-1');
    expect(r.success).toBe(false);
    expect((r as { error?: string }).error).toMatch(/previsão de comissão não foi gravada/);
  });

  it('sem ajuda de custo: aquisição de 9% e mensais de 12%', async () => {
    modelo = 'sem_ajuda';
    expect((await markProposalAccepted('prop-1')).success).toBe(true);
    const ev = eventos();
    expect(ev.filter((e) => e.type === 'aquisicao').map((e) => e.amount)).toEqual([2160]);
    expect(ev.filter((e) => e.type === 'recorrente').every((e) => e.percent === 12 && e.amount === 240)).toBe(true);
  });
});
