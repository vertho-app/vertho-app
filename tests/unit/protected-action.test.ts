import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: (...a: any[]) => requireAdminMock(...a) }));

import { protectedAction, DomainError } from '@/lib/auth/protected-action';

const ctx = { email: 'a@b.com', isPlatformAdmin: true } as any;
const Schema = z.object({ nome: z.string().min(1) });

describe('protectedAction', () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    requireAdminMock.mockResolvedValue(ctx);
  });

  it('valida auth + input e chama fn com (ctx, input)', async () => {
    const fn = vi.fn(async (_c: any, i: any) => ({ ok: i.nome }));
    const r = await protectedAction('companies.manage', Schema, fn)({ nome: 'X' });
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ ok: 'X' });
    expect(fn).toHaveBeenCalledWith(ctx, { nome: 'X' });
    expect(requireAdminMock).toHaveBeenCalledWith('companies.manage');
  });

  it('auth negada → success:false code FORBIDDEN e fn não roda', async () => {
    requireAdminMock.mockRejectedValue(new Error('FORBIDDEN: apenas platform admin'));
    const fn = vi.fn();
    const r = await protectedAction('companies.manage', Schema, fn)({ nome: 'X' });
    expect(r.success).toBe(false);
    expect(r.code).toBe('FORBIDDEN');
    expect(fn).not.toHaveBeenCalled();
  });

  it('input inválido → VALIDATION e fn não roda', async () => {
    const fn = vi.fn();
    const r = await protectedAction('companies.manage', Schema, fn)({ nome: '' });
    expect(r.success).toBe(false);
    expect(r.code).toBe('VALIDATION');
    expect(fn).not.toHaveBeenCalled();
  });

  it('erro do fn vira {success:false} sem vazar prefixo', async () => {
    const fn = vi.fn(async () => { throw new Error('FORBIDDEN: sem acesso a esta empresa'); });
    const r = await protectedAction('companies.manage', Schema, fn)({ nome: 'X' });
    expect(r.success).toBe(false);
    expect(r.code).toBe('FORBIDDEN');
    expect(r.error).toBe('sem acesso a esta empresa');
  });

  it('DomainError transporta `codigo` de domínio no ActionResult', async () => {
    const fn = vi.fn(async () => { throw new DomainError('Colaborador sem avaliação', 'sem_assessment'); });
    const r = await protectedAction('companies.manage', Schema, fn)({ nome: 'X' });
    expect(r.success).toBe(false);
    expect(r.error).toBe('Colaborador sem avaliação');
    expect(r.codigo).toBe('sem_assessment');
  });

  it('Error comum NÃO carrega codigo (só DomainError)', async () => {
    const fn = vi.fn(async () => { throw new Error('boom'); });
    const r = await protectedAction('companies.manage', Schema, fn)({ nome: 'X' });
    expect(r.success).toBe(false);
    expect(r.codigo).toBeUndefined();
  });
});
