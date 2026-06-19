import { describe, it, expect } from 'vitest';
import { findColaboradorInTenant, updateColaboradorInTenant, deleteColaboradorInTenant, emailExistsInTenant, createColaboradorInTenant } from '@/lib/repositories/colaboradores-repo';

// Mock do supabase admin client que registra TODA chamada .eq(col, val) + o insert.
function makeSb(returnData: any) {
  const eqCalls: [string, any][] = [];
  let insertArg: any = null;
  const qb: any = {
    select: () => qb,
    update: () => qb,
    delete: () => qb,
    insert: (v: any) => { insertArg = v; return qb; },
    eq: (col: string, val: any) => { eqCalls.push([col, val]); return qb; },
    maybeSingle: async () => ({ data: returnData, error: null }),
    single: async () => ({ data: returnData, error: null }),
  };
  return { sb: { from: () => qb }, eqCalls, getInsert: () => insertArg };
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

  it('emailExists checa email DENTRO do tenant (true/false)', async () => {
    const achou = makeSb({ id: 'id-1' });
    expect(await emailExistsInTenant(achou.sb, 'emp-1', 'a@b.com')).toBe(true);
    expect(hasEq(achou.eqCalls, 'empresa_id', 'emp-1')).toBe(true);
    expect(hasEq(achou.eqCalls, 'email', 'a@b.com')).toBe(true);

    const naoAchou = makeSb(null);
    expect(await emailExistsInTenant(naoAchou.sb, 'emp-1', 'x@y.com')).toBe(false);
  });

  it('create EMBUTE empresa_id no insert (e sobrescreve o que vier em dados)', async () => {
    const { sb, getInsert } = makeSb({ id: 'novo-1' });
    const r = await createColaboradorInTenant(sb, 'emp-1', { email: 'a@b.com', empresa_id: 'tenant-malicioso' });
    expect(r).toEqual({ id: 'novo-1' });
    expect(getInsert().empresa_id).toBe('emp-1'); // contexto vence o payload
  });
});
