import { describe, it, expect, vi } from 'vitest';

// Mock Supabase ANTES do import
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { empresa_id: 'e1', area_depto: 'TI' } }),
        }),
      }),
    }),
    auth: { getUser: async () => ({ data: null, error: 'mocked' }) },
  }),
}));

import { assertEmailAccess } from '@/lib/auth/request-context';
import type { AuthenticatedContext } from '@/lib/auth/request-context';

const mockAuth = (overrides: Record<string, any> = {}): AuthenticatedContext => ({
  email: 'test@test.com',
  colaborador: {
    id: 'c1',
    email: 'test@test.com',
    empresa_id: 'e1',
    nome_completo: 'Test',
    area_depto: 'TI',
    role: 'colaborador',
  },
  role: 'colaborador',
  empresaId: 'e1',
  isPlatformAdmin: false,
  ...overrides,
} as AuthenticatedContext);

describe('assertEmailAccess', () => {
  it('platform admin -> null (qualquer email)', async () => {
    const auth = mockAuth({ isPlatformAdmin: true });
    expect(await assertEmailAccess(auth, 'anyone@company.com')).toBeNull();
  });

  it('proprio email -> null', async () => {
    const auth = mockAuth();
    expect(await assertEmailAccess(auth, 'test@test.com')).toBeNull();
  });

  it('RH mesma empresa -> null', async () => {
    const auth = mockAuth({ role: 'rh' });
    expect(await assertEmailAccess(auth, 'outro@test.com')).toBeNull();
  });

  it('gestor mesma empresa + mesma area -> null', async () => {
    const auth = mockAuth({ role: 'gestor' });
    expect(await assertEmailAccess(auth, 'outro@test.com')).toBeNull();
  });

  it('gestor mesma empresa + area diferente -> 403', async () => {
    const auth = mockAuth({
      role: 'gestor',
      colaborador: {
        id: 'c1',
        email: 'test@test.com',
        empresa_id: 'e1',
        nome_completo: 'Test',
        area_depto: 'Vendas',
        role: 'gestor',
      },
    });
    const res = await assertEmailAccess(auth, 'outro@test.com');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('gestor sem area_depto -> 403 (fail closed)', async () => {
    const auth = mockAuth({
      role: 'gestor',
      colaborador: {
        id: 'c1',
        email: 'test@test.com',
        empresa_id: 'e1',
        nome_completo: 'Test',
        area_depto: null,
        role: 'gestor',
      },
    });
    const res = await assertEmailAccess(auth, 'outro@test.com');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('colaborador tentando acessar outro email -> 403', async () => {
    const auth = mockAuth({ role: 'colaborador' });
    const res = await assertEmailAccess(auth, 'outro@test.com');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('empresa diferente -> 403', async () => {
    const auth = mockAuth({
      role: 'rh',
      empresaId: 'e999',
    });
    const res = await assertEmailAccess(auth, 'outro@test.com');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});
