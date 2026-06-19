import { describe, it, expect } from 'vitest';
import { findCargoInTenant, listCargosInTenant, upsertCargoInTenant, deleteCargoInTenant } from '@/lib/repositories/cargos-empresa-repo';

function makeSb(returnData: any) {
  const eqCalls: [string, any][] = [];
  let insertArg: any = null;
  const qb: any = {
    select: () => qb,
    update: () => qb,
    delete: () => qb,
    insert: (v: any) => { insertArg = v; return qb; },
    eq: (col: string, val: any) => { eqCalls.push([col, val]); return qb; },
    order: () => qb,
    maybeSingle: async () => ({ data: returnData, error: null }),
    single: async () => ({ data: returnData, error: null }),
    then: (resolve: any) => resolve({ data: returnData, error: null }),
  };
  return { sb: { from: () => qb }, eqCalls, getInsert: () => insertArg };
}
const hasEq = (calls: [string, any][], col: string, val: any) => calls.some(([c, v]) => c === col && v === val);

describe('cargos-empresa-repo (tenant-safe)', () => {
  it('find embute empresa_id + id no WHERE', async () => {
    const { sb, eqCalls } = makeSb({ id: 'c1' });
    await findCargoInTenant(sb, 'emp-1', 'c1');
    expect(hasEq(eqCalls, 'empresa_id', 'emp-1')).toBe(true);
    expect(hasEq(eqCalls, 'id', 'c1')).toBe(true);
  });

  it('list filtra por empresa_id', async () => {
    const { sb, eqCalls } = makeSb([{ id: 'c1' }]);
    const r = await listCargosInTenant(sb, 'emp-1');
    expect(hasEq(eqCalls, 'empresa_id', 'emp-1')).toBe(true);
    expect(r).toEqual([{ id: 'c1' }]);
  });

  it('upsert COM id: update embute empresa_id no WHERE', async () => {
    const { sb, eqCalls } = makeSb({ id: 'c1' });
    await upsertCargoInTenant(sb, 'emp-1', { id: 'c1', nome: 'X' });
    expect(hasEq(eqCalls, 'empresa_id', 'emp-1')).toBe(true);
    expect(hasEq(eqCalls, 'id', 'c1')).toBe(true);
  });

  it('upsert SEM id: insert embute empresa_id (vence payload malicioso)', async () => {
    const { sb, getInsert } = makeSb({ id: 'novo' });
    await upsertCargoInTenant(sb, 'emp-1', { nome: 'X', empresa_id: 'malicioso' });
    expect(getInsert().empresa_id).toBe('emp-1');
  });

  it('upsert de id em OUTRO tenant → 0 linhas → null (S1 bloqueado)', async () => {
    const { sb } = makeSb(null);
    const r = await upsertCargoInTenant(sb, 'emp-1', { id: 'de-outro', nome: 'X' });
    expect(r).toBe(null);
  });

  it('delete embute empresa_id + id no WHERE', async () => {
    const { sb, eqCalls } = makeSb({ id: 'c1', nome: 'X' });
    await deleteCargoInTenant(sb, 'emp-1', 'c1');
    expect(hasEq(eqCalls, 'empresa_id', 'emp-1')).toBe(true);
    expect(hasEq(eqCalls, 'id', 'c1')).toBe(true);
  });
});
