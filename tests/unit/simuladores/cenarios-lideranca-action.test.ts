import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VARIANTES } from '@/lib/simuladores/lideranca/matriz-global';

/**
 * A action que diz quais cenários faltam para a matriz. O que se prova aqui:
 * ela recorta a fila pelos cargos-ÂNCORA (senão ofereceria gerar cenário do
 * mapeamento do cargo, que é outro produto e outro custo de IA), conta só o que
 * falta, e erro de leitura não vira "nenhum cenário falta" — que seria o pior
 * retorno possível, porque some com o motivo de o trilho não abrir.
 */
const gate = vi.fn(async () => ({}));
const fila = { valor: null as any };

vi.mock('@/lib/admin-supabase', () => ({
  requireEmpresaSupabase: (...args: any[]) => gate(...(args as [])),
  requireAdminSupabase: vi.fn(),
}));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: vi.fn(async () => 'admin@vertho.ai') }));
vi.mock('@/lib/audit', () => ({ logAdminAction: vi.fn() }));
vi.mock('@/lib/authz', () => ({ getUserContext: vi.fn() }));
vi.mock('@/lib/turmas/contexto', () => ({ listarTurmasDoTenant: vi.fn(async () => []), carregarParticipacaoAtiva: vi.fn() }));
vi.mock('@/lib/simuladores/acesso', () => ({ acessoSimuladoresDoColaborador: vi.fn(async () => ({ lideranca: true })) }));
vi.mock('@/actions/fase1', () => ({ listarFilaIA3: vi.fn(async () => fila.valor) }));

import { listarCenariosLiderancaAdmin } from '@/actions/prontidao-lideranca';

const item = (cargo: string, nome: string, jaGerado = false) =>
  ({ cargo, nome, competencia_id: `c-${nome}`, ppp_escola_id: null, jaGerado });

describe('listarCenariosLiderancaAdmin', () => {
  beforeEach(() => { gate.mockClear(); });

  it('recorta pelos cargos-âncora e conta só o que falta', async () => {
    fila.valor = {
      success: true,
      data: [
        item(VARIANTES.lider, 'Análise e Diagnóstico de Situações'),
        item(VARIANTES.lider, 'Desenvolvimento de Pessoas', true),
        item(VARIANTES.futuro, 'Análise e Diagnóstico de Situações'),
        // Do mapeamento do CARGO: outro produto, outro custo. Não entra.
        item('Coordenador de Operações', 'Priorização e Gestão da Rotina Operacional'),
      ],
    };
    const r: any = await listarCenariosLiderancaAdmin('emp-A');
    expect(gate).toHaveBeenCalledWith('emp-A', 'program.configure', 'listarCenariosLiderancaAdmin');
    expect(r.success).toBe(true);
    expect(r.total).toBe(3);
    expect(r.faltam).toBe(2);
    expect(r.itens.map((i: any) => i.cargo)).toEqual([VARIANTES.lider, VARIANTES.futuro]);
    expect(r.itens.some((i: any) => i.cargo === 'Coordenador de Operações')).toBe(false);
  });

  /**
   * `listarFilaIA3` devolve a fila em `data`. Ler `fila` daria `[]` e a tela
   * diria "os cenários estão gerados" com zero cenário no banco.
   */
  it('lê a fila da chave certa: nenhum item some em silêncio', async () => {
    fila.valor = { success: true, data: [item(VARIANTES.lider, 'X')] };
    const r: any = await listarCenariosLiderancaAdmin('emp-A');
    expect(r.total).toBe(1);
    expect(r.faltam).toBe(1);
  });

  it('erro da fila NÃO vira "nenhum cenário falta"', async () => {
    fila.valor = { success: false, error: 'Nenhuma competência aprovada (Top 5) encontrada.' };
    const r: any = await listarCenariosLiderancaAdmin('emp-A');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Top 5/);
    expect(r.faltam).toBeUndefined();
  });

  it('tudo gerado devolve faltam 0, sem itens', async () => {
    fila.valor = { success: true, data: [item(VARIANTES.lider, 'X', true), item(VARIANTES.futuro, 'X', true)] };
    const r: any = await listarCenariosLiderancaAdmin('emp-A');
    expect(r).toMatchObject({ success: true, total: 2, faltam: 0 });
    expect(r.itens).toEqual([]);
  });
});
