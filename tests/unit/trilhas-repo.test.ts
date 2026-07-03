import { describe, it, expect } from 'vitest';
import { findTrilhaComTenant, updateTrilhaInTenant, updateSemanaProgressoInTenant } from '@/lib/repositories/trilhas-repo';

/**
 * A disciplina do repo é o TESTE: toda mutação embute empresa_id no WHERE.
 * Mock chainable que registra os filtros aplicados.
 */
function sbMock(resultado: any) {
  const filtros: Record<string, any> = {};
  const q: any = {
    eq: (col: string, val: any) => { filtros[col] = val; return q; },
    select: () => q,
    update: (campos: any) => { q._campos = campos; return q; },
    maybeSingle: async () => ({ data: resultado, error: null }),
    then: (resolve: any) => resolve({ data: resultado, error: null }),
  };
  return { from: (tabela: string) => { q._tabela = tabela; return q; }, _q: q, _filtros: filtros };
}

describe('trilhas-repo (tenant-safe)', () => {
  it('findTrilhaComTenant: descoberta root por id (sem tenant, documentada)', async () => {
    const sb = sbMock({ id: 't1', empresa_id: 'e1', status: 'ativa' });
    const t = await findTrilhaComTenant(sb, 't1');
    expect(t.empresa_id).toBe('e1');
    expect(sb._filtros).toEqual({ id: 't1' });
  });

  it('updateTrilhaInTenant: WHERE embute id + empresa_id', async () => {
    const sb = sbMock({ id: 't1', status: 'pausada' });
    const r = await updateTrilhaInTenant(sb, 'e1', 't1', { status: 'pausada' });
    expect(r.status).toBe('pausada');
    expect(sb._filtros).toEqual({ id: 't1', empresa_id: 'e1' });
    expect(sb._q._campos).toEqual({ status: 'pausada' });
  });

  it('updateTrilhaInTenant: id de OUTRO tenant → 0 linhas → null', async () => {
    const sb = sbMock(null);
    const r = await updateTrilhaInTenant(sb, 'e2', 't1', { status: 'arquivada' });
    expect(r).toBeNull();
  });

  it('updateSemanaProgressoInTenant: WHERE embute trilha + empresa + semana; devolve contagem', async () => {
    const sb = sbMock([{ id: 'p1' }]);
    const n = await updateSemanaProgressoInTenant(sb, 'e1', 't1', 5, { status: 'pendente' });
    expect(n).toBe(1);
    expect(sb._filtros).toEqual({ trilha_id: 't1', empresa_id: 'e1', semana: 5 });
  });

  it('erro do banco vira throw (nunca sucesso silencioso)', async () => {
    const q: any = {
      eq: () => q, select: () => q, update: () => q,
      maybeSingle: async () => ({ data: null, error: { message: 'boom' } }),
    };
    const sb = { from: () => q };
    await expect(updateTrilhaInTenant(sb, 'e1', 't1', {})).rejects.toThrow('boom');
  });
});
