import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { bancoEmMemoria, type Tabelas } from '../helpers/tabelas-em-memoria';

/**
 * "Este cenário já foi respondido?" (plano de cenários de 11/10/2026, Fase 0). É a régua
 * que decide se uma regeneração reescreve no lugar (A sem uso), vira versão nova (A
 * respondido) ou é recusada (B já servido). Falha de leitura nunca vira "sem uso".
 */

const h = vi.hoisted(() => ({ sb: null as any, callAI: vi.fn() }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => h.sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => h.sb.client),
  requireEmpresaSupabase: vi.fn(async () => h.sb.client),
}));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({})) }));
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => h.callAI(...a) }));
vi.mock('@/actions/utils', () => ({ extractJSON: async (s: string) => JSON.parse(s) }));

import { usoDoCenarioA, usoDoCenarioB } from '@/lib/cenario-uso';
import { regenerarCenarioB } from '@/actions/fase5/cenarios-b';

describe('usoDoCenarioA', () => {
  it('soma respostas e conversas do assessment, perguntando pelo cenário', async () => {
    const sb = criarSupabaseMock({ contagem: (tabela) => (tabela === 'respostas' ? 2 : tabela === 'sessoes_avaliacao' ? 1 : 0) });
    expect(await usoDoCenarioA(sb.client, 'cen-1')).toEqual({ total: 3, detalhe: { respostas: 2, sessoes_avaliacao: 1 } });
    expect(sb.chamadas.filter((c) => c.metodo === 'eq').map((c) => [c.tabela, ...c.args])).toEqual([
      ['respostas', 'cenario_id', 'cen-1'], ['sessoes_avaliacao', 'cenario_id', 'cen-1'],
    ]);
  });

  it('erro em qualquer leitura volta { erro } com o nome da tabela', async () => {
    const sb = criarSupabaseMock({ contagem: () => 0 });
    sb.falharEm({ tabela: 'sessoes_avaliacao', mensagem: 'timeout' });
    expect(await usoDoCenarioA(sb.client, 'cen-1')).toEqual({ erro: 'sessoes_avaliacao: timeout' });
  });

  it('contagem que não veio (null) é erro, nunca zero', async () => {
    const sb = criarSupabaseMock({ contagem: (tabela) => (tabela === 'respostas' ? null : 0) });
    expect(await usoDoCenarioA(sb.client, 'cen-1')).toEqual({ erro: 'respostas: contagem não veio' });
  });
});

describe('usoDoCenarioB', () => {
  it('conta o fechamento da Jornada, o do Onboarding e a reavaliação, cada um com a pergunta certa', async () => {
    const sb = criarSupabaseMock({
      contagem: (tabela, cadeia) => {
        if (tabela === 'reavaliacao_sessoes') return 1;
        if (cadeia.some((c) => c.metodo === 'contains')) return 2;
        if (cadeia.some((c) => c.metodo === 'eq' && c.args[0] === 'feedback->>cenario_b_id')) return 3;
        return 0;
      },
    });
    expect(await usoDoCenarioB(sb.client, 'b-1')).toEqual({
      total: 6, detalhe: { fechamento_jornada: 3, fechamento_onboarding: 2, reavaliacao_sessoes: 1 },
    });
    expect(sb.chamadas.find((c) => c.metodo === 'contains')!.args).toEqual(['feedback', { cenarios: [{ cenario_b_id: 'b-1' }] }]);
    expect(sb.usou('reavaliacao_sessoes', 'eq', 'cenario_b_id')).toBe(true);
  });

  it('erro na reavaliação: { erro }, não "nunca servido"', async () => {
    const sb = criarSupabaseMock({ contagem: () => 0 });
    sb.falharEm({ tabela: 'reavaliacao_sessoes', mensagem: 'pool esgotado' });
    expect(await usoDoCenarioB(sb.client, 'b-1')).toEqual({ erro: 'reavaliacao_sessoes: pool esgotado' });
  });
});

describe('regenerarCenarioB: B já servido fica como está', () => {
  let tabelas: Tabelas;
  beforeEach(() => {
    h.callAI.mockReset();
    tabelas = {
      banco_cenarios: [{
        id: 'b-1', empresa_id: 'emp', tipo_cenario: 'cenario_b', competencia_id: 'c-1', cargo: 'Caixa',
        titulo: 'B', descricao: 'Texto do B', alternativas: { p1: 'a', p2: 'b', p3: 'c', p4: 'd' }, nota_check: 70,
      }],
      temporada_semana_progresso: [],
      reavaliacao_sessoes: [],
    };
    h.sb = bancoEmMemoria(tabelas);
  });

  it('servido num fechamento: recusa com o motivo, sem IA e sem escrita (o índice único não deixa existir 2º B)', async () => {
    tabelas.temporada_semana_progresso.push({ id: 'p-1', empresa_id: 'emp', feedback: { cenario_b_id: 'b-1' } });
    const r: any = await regenerarCenarioB('b-1');
    expect(r).toMatchObject({ success: false, servido: true });
    expect(r.error).toMatch(/já servido/);
    expect(h.callAI).not.toHaveBeenCalled();
    expect(h.sb.escritas).toHaveLength(0);
  });

  it('usado numa reavaliação: também recusa', async () => {
    tabelas.reavaliacao_sessoes.push({ id: 'rv-1', empresa_id: 'emp', cenario_b_id: 'b-1' });
    const r: any = await regenerarCenarioB('b-1');
    expect(r).toMatchObject({ success: false, servido: true });
    expect(h.callAI).not.toHaveBeenCalled();
  });

  it('falha ao conferir o uso: recusa sem gastar IA (falha de leitura não vira "ninguém respondeu")', async () => {
    h.sb.falharEm({ tabela: 'reavaliacao_sessoes', mensagem: 'timeout' });
    const r: any = await regenerarCenarioB('b-1');
    expect(r.success).toBe(false);
    expect(r.servido).toBeUndefined();
    expect(r.error).toMatch(/Nada foi alterado/);
    expect(h.callAI).not.toHaveBeenCalled();
    expect(h.sb.escritas).toHaveLength(0);
  });
});
