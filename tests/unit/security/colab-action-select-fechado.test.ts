/**
 * Análise de segurança de 05/10/2026: `getColabByEmail(select)` é um export de
 * `'use server'`, ou seja, um endpoint, e repassava o `select` do CLIENTE ao
 * PostgREST com service-role. Qualquer colaborador logado pedia
 * `id,empresas(colaboradores(*))` e lia a base inteira do tenant (todas as
 * colunas, inclusive DISC e telefone). O id da action está no chunk de
 * /dashboard/assessment/chat, que todo colaborador carrega.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const findColabByEmail = vi.fn(async (_email: string, _select?: string) => ({ id: 'c1' }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: (e: string, s?: string) => findColabByEmail(e, s) }));
vi.mock('@/lib/auth/action-context', () => ({ getAuthenticatedEmailFromAction: async () => 'ana@escola.br' }));

const { getColabByEmail } = await import('@/app/dashboard/colab-action');

beforeEach(() => findColabByEmail.mockClear());

const pedido = async (select?: unknown) => {
  findColabByEmail.mockClear();
  await getColabByEmail(select as string | undefined);
  return findColabByEmail.mock.calls[0][1];
};

describe('getColabByEmail: o select do cliente não chega ao banco', () => {
  it('🔴 embed de relação some: a base do tenant não sai por aqui', async () => {
    expect(await pedido('id, empresas(colaboradores(*))')).toBe('id');
  });

  it('🔴 `*` não passa, nem sozinho nem junto de coluna válida', async () => {
    expect(await pedido('*')).toBeUndefined();
    expect(await pedido('id, *')).toBe('id');
  });

  it('🔴 coluna fora da lista não passa (telefone, DISC, relatório)', async () => {
    expect(await pedido('id, telefone, d_natural, report_texts, gestor_email')).toBe('id');
  });

  it('alias, cast e hint de relação não casam com nome simples', async () => {
    expect(await pedido('x:id, id::text, empresa_id!inner')).toBeUndefined();
  });

  it('os dois chamadores reais continuam recebendo exatamente o que pedem', async () => {
    expect(await pedido('id, nome_completo, empresa_id')).toBe('id, nome_completo, empresa_id');
    expect(await pedido('id, nome_completo')).toBe('id, nome_completo');
  });

  it('sem argumento (ou argumento que não é texto) cai no select padrão do servidor', async () => {
    expect(await pedido(undefined)).toBeUndefined();
    expect(await pedido({ x: 1 })).toBeUndefined();
  });

  it('coluna repetida sai uma vez só', async () => {
    expect(await pedido('id, id, role')).toBe('id, role');
  });
});
