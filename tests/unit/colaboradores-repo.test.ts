import { describe, it, expect } from 'vitest';
import { findColaboradorInTenant, updateColaboradorInTenant, deleteColaboradorInTenant } from '@/lib/repositories/colaboradores-repo';

// Mock do supabase admin client que registra TODA chamada .eq(col, val).
function makeSb(returnData: any) {
  const eqCalls: [string, any][] = [];
  const qb: any = {
    select: () => qb,
    update: () => qb,
    delete: () => qb,
    eq: (col: string, val: any) => { eqCalls.push([col, val]); return qb; },
    maybeSingle: async () => ({ data: returnData, error: null }),
  };
  return { sb: { from: () => qb }, eqCalls };
}
const hasEq = (calls: [string, any][], col: string, val: any) => calls.some(([c, v]) => c === col && v === val);

describe('colaboradores-repo (tenant-safe)', () => {
  it('find embute empresa_id + id no WHERE', async () => {
    const { sb, eqCalls } = makeSb({ id: 'id-1' });
    const r = await findColaboradorInTenant(sb, 'emp-1', 'id-1');
    expect(hasEq(eqCalls, 'empresa_id', 'emp-1')).toBe(true);
    expect(hasEq(eqCalls, 'id', 'id-1')).toBe(true);
    expect(r).toEqual({ id: 'id-1' });
  });

  it('update SEMPRE embute empresa_id no WHERE (não toca outro tenant)', async () => {
    const { sb, eqCalls } = makeSb({ id: 'id-1' });
    await updateColaboradorInTenant(sb, 'emp-1', 'id-1', { nome_completo: 'X' });
    expect(hasEq(eqCalls, 'empresa_id', 'emp-1')).toBe(true);
    expect(hasEq(eqCalls, 'id', 'id-1')).toBe(true);
  });

  it('delete SEMPRE embute empresa_id no WHERE', async () => {
    const { sb, eqCalls } = makeSb({ id: 'id-1', nome_completo: 'X' });
    await deleteColaboradorInTenant(sb, 'emp-1', 'id-1');
    expect(hasEq(eqCalls, 'empresa_id', 'emp-1')).toBe(true);
    expect(hasEq(eqCalls, 'id', 'id-1')).toBe(true);
  });

  it('update de id em OUTRO tenant → 0 linhas → null (S1 estruturalmente bloqueado)', async () => {
    const { sb } = makeSb(null);
    const r = await updateColaboradorInTenant(sb, 'emp-1', 'id-de-outro-tenant', { nome_completo: 'X' });
    expect(r).toBe(null);
  });
});
