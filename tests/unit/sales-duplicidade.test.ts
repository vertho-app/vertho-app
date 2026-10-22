/**
 * A mesma instituição registrada por mais de um RC (P3, decisão do dono de
 * 21/10/2026: só o aviso, sem bloquear). Regra do canal (08/10): vale o primeiro
 * registro válido e a vertho.ai decide.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type SupabaseMock } from '../helpers/supabase-mock';
import {
  coincidenciasDeOutrosRcs,
  gruposEmMaisDeUmRc,
  mesmaInstituicao,
  normalizarCnpj,
  normalizarNomeConta,
  type ContaComparavel,
} from '@/lib/sales/duplicidade';

const conta = (p: Partial<ContaComparavel>): ContaComparavel => ({
  id: p.id ?? Math.random().toString(36).slice(2),
  representante_id: p.representante_id ?? 'rc-a',
  legal_name: p.legal_name ?? null,
  trade_name: p.trade_name ?? null,
  cnpj: p.cnpj ?? null,
  city: p.city ?? null,
  created_at: p.created_at ?? null,
});

describe('comparação de instituições', () => {
  it('normaliza acento, caixa e pontuação', () => {
    expect(normalizarNomeConta('Colégio São José Ltda.')).toBe('colegio sao jose ltda');
    expect(normalizarCnpj('12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizarCnpj('123')).toBeNull();
  });

  it('com CNPJ nas duas, só o CNPJ decide (unidades de uma rede têm o mesmo nome)', () => {
    const a = conta({ legal_name: 'Colégio Aurora', cnpj: '12.345.678/0001-90' });
    expect(mesmaInstituicao(a, conta({ legal_name: 'Outro nome', cnpj: '12345678000190' }))).toBe(true);
    expect(mesmaInstituicao(a, conta({ legal_name: 'Colégio Aurora', cnpj: '12345678000270' }))).toBe(false);
  });

  it('sem CNPJ: mesmo nome e mesma cidade; cidade diferente não é a mesma', () => {
    const a = conta({ legal_name: 'Colégio Aurora', city: 'Campinas' });
    expect(mesmaInstituicao(a, conta({ trade_name: 'COLEGIO AURORA', city: 'campinas' }))).toBe(true);
    expect(mesmaInstituicao(a, conta({ legal_name: 'Colégio Aurora', city: 'Sorocaba' }))).toBe(false);
    expect(mesmaInstituicao(a, conta({ legal_name: 'Colégio Aurora' }))).toBe(true);
  });

  it('nome curto demais não serve para casar', () => {
    expect(mesmaInstituicao(conta({ legal_name: 'Escola' }), conta({ legal_name: 'Escola' }))).toBe(false);
    expect(mesmaInstituicao(conta({ legal_name: 'Colégio' }), conta({ legal_name: 'Colégio' }))).toBe(false);
  });

  it('coincidência só conta com OUTRO RC', () => {
    const nova = conta({ id: 'n', representante_id: 'rc-a', legal_name: 'Colégio Aurora' });
    const minha = conta({ id: 'm', representante_id: 'rc-a', legal_name: 'Colégio Aurora' });
    const deOutro = conta({ id: 'o', representante_id: 'rc-b', legal_name: 'Colégio Aurora' });
    expect(coincidenciasDeOutrosRcs(nova, [minha, deOutro]).map((c) => c.id)).toEqual(['o']);
  });

  it('grupos só com mais de um RC, em ordem de cadastro', () => {
    const grupos = gruposEmMaisDeUmRc([
      conta({ id: '2', representante_id: 'rc-b', legal_name: 'Colégio Aurora', created_at: '2026-10-21' }),
      conta({ id: '1', representante_id: 'rc-a', legal_name: 'Colégio Aurora', created_at: '2026-10-20' }),
      conta({ id: '3', representante_id: 'rc-a', legal_name: 'Escola Horizonte Azul', created_at: '2026-10-20' }),
      conta({ id: '4', representante_id: 'rc-a', legal_name: 'Escola Horizonte Azul', created_at: '2026-10-21' }),
    ]);
    expect(grupos.map((g) => g.map((c) => c.id))).toEqual([['1', '2']]);
  });
});

let sb: SupabaseMock = criarSupabaseMock();
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/sales/permissions', () => ({
  requireRepresentativeAction: vi.fn(async () => ({ email: 'rc@teste.vertho', rep: { id: 'rc-a', status: 'active' } })),
  requireRepresentativeOrAdminAction: vi.fn(),
  requireCommercialAdminAction: vi.fn(),
  assertRepresentativeOwnership: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));

import { createSalesAccount } from '@/actions/sales/accounts';

describe('createSalesAccount avisa e não bloqueia', () => {
  const nova = { id: 'nova', representante_id: 'rc-a', legal_name: 'Colégio Aurora', trade_name: null, cnpj: null, city: 'Campinas' };

  beforeEach(() => {
    sb = criarSupabaseMock({
      escritaUnica: () => nova,
      lista: (tabela) => (tabela === 'sales_accounts'
        ? [{ id: 'x', representante_id: 'rc-b', legal_name: 'Colégio Aurora', trade_name: null, cnpj: null, city: 'Campinas' }]
        : []),
    } as any);
  });

  it('cria a conta e devolve o aviso, sem citar o outro RC', async () => {
    const r = await createSalesAccount({ legal_name: 'Colégio Aurora', city: 'Campinas' });
    expect(r.success).toBe(true);
    expect((r as any).aviso).toMatch(/já está registrada por outro representante/);
    expect(sb.escritas.some((e) => e.tabela === 'sales_accounts' && e.op === 'insert')).toBe(true);
  });

  it('falha na conferência vira aviso de que não deu para conferir, não "sem conflito"', async () => {
    sb.falharEm({ tabela: 'sales_accounts', op: 'select', mensagem: 'timeout no pool' });
    const r = await createSalesAccount({ legal_name: 'Colégio Aurora', city: 'Campinas' });
    expect(r.success).toBe(true);
    expect((r as any).aviso).toMatch(/não foi possível conferir/);
  });
});
