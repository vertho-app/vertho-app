import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { colunasDoCargo, liderancaDaPlanilha } from '@/lib/cargos-import';

/**
 * IMPORT DE CARGOS (25/09/2026).
 *
 * A tela do import sempre anunciou "eh_lideranca: sim / não (default: sim)", e o
 * formulário do cargo e /admin/cargos tratam o vazio como líder
 * (`eh_lideranca !== false`). O import gravava vazio, e "Sim" com maiúscula, como
 * NÃO; e o fit tira o bloco de liderança do cargo não-líder (actions/fit-v2.ts).
 * Junto, o modelo novo passa a usar títulos em português claro.
 */

const EMPRESA = 'emp-1';
let existentes: any[] = [];

const sb = criarSupabaseMock({
  lista: (tabela: string) => (tabela === 'cargos_empresa' ? existentes : []),
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => sb.client,
  requireEmpresaSupabase: async () => sb.client,
  requireLinhaSupabase: async () => ({ sb: sb.client, linha: { empresa_id: EMPRESA } }),
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireUserAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true, role: null }),
  requireAdminAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true }),
  requirePermissionAction: async () => ({ email: 'admin@vertho.ai', empresaId: EMPRESA, isPlatformAdmin: true }),
  assertTenantAccessAction: async () => undefined,
  getAuthenticatedEmailFromAction: async () => 'admin@vertho.ai',
}));

const { importarCargosLote } = await import('@/app/admin/empresas/gerenciar/actions');

beforeEach(() => {
  sb.reset();
  existentes = [];
});

describe('liderancaDaPlanilha', () => {
  it('em branco é SIM (o que a tela anuncia e o formulário faz)', () => {
    for (const v of ['', '   ', undefined, null]) expect(liderancaDaPlanilha(v)).toBe(true);
  });

  it('sim em qualquer caixa é SIM ("Sim" virava NÃO)', () => {
    for (const v of ['sim', 'Sim', 'SIM', 's', 'x', true]) expect(liderancaDaPlanilha(v)).toBe(true);
  });

  it('não em qualquer caixa, com ou sem acento, é NÃO', () => {
    for (const v of ['não', 'Não', 'NÃO', 'nao', 'n', 'N', 'false', '0', false]) expect(liderancaDaPlanilha(v)).toBe(false);
  });
});

describe('colunasDoCargo', () => {
  it('títulos do modelo viram as colunas do banco (o parser entrega o título em minúsculas, com acento)', () => {
    const [l] = colunasDoCargo([{
      'cargo': 'Gerente', 'área': 'Comercial', 'descrição': 'D', 'principais entregas': 'E', 'stakeholders': 'S',
      'decisões recorrentes': 'DR', 'tensões comuns': 'T', 'contexto cultural': 'C', 'cargo de liderança?': 'sim',
    }]);
    expect(l).toEqual({
      nome: 'Gerente', area_depto: 'Comercial', descricao: 'D', principais_entregas: 'E', stakeholders: 'S',
      decisoes_recorrentes: 'DR', tensoes_comuns: 'T', contexto_cultural: 'C', eh_lideranca: 'sim',
    });
  });

  it('os títulos antigos continuam valendo (planilha já feita não quebra)', () => {
    const [l] = colunasDoCargo([{
      nome: 'G', area: 'A', entregas: 'E', decisoes: 'DR', tensoes: 'T', contexto: 'C', lideranca: 'não',
    }]);
    expect(l).toEqual({
      nome: 'G', area_depto: 'A', principais_entregas: 'E', decisoes_recorrentes: 'DR', tensoes_comuns: 'T',
      contexto_cultural: 'C', eh_lideranca: 'não',
    });
    const [canonica] = colunasDoCargo([{ nome: 'G', area_depto: 'A', principais_entregas: 'E', eh_lideranca: 'sim' }]);
    expect(canonica).toEqual({ nome: 'G', area_depto: 'A', principais_entregas: 'E', eh_lideranca: 'sim' });
  });

  it('com "nome" e "cargo" na mesma planilha, vale o preenchido', () => {
    expect(colunasDoCargo([{ nome: '', cargo: 'Gerente' }])[0].nome).toBe('Gerente');
  });
});

describe('importarCargosLote', () => {
  it('grava a liderança como a planilha diz: vazio e "Sim" são SIM, "Não" é NÃO', async () => {
    const r = await importarCargosLote(EMPRESA, [
      { nome: 'Vazio', eh_lideranca: '' },
      { nome: 'Maiúscula', eh_lideranca: 'Sim' },
      { nome: 'Não líder', eh_lideranca: 'Não' },
    ]);
    expect(r.success).toBe(true);
    const insert = sb.escritas.find((e) => e.tabela === 'cargos_empresa' && e.op === 'insert')!;
    expect(insert.payload.map((c: any) => [c.nome, c.eh_lideranca])).toEqual([
      ['Vazio', true], ['Maiúscula', true], ['Não líder', false],
    ]);
  });
});
