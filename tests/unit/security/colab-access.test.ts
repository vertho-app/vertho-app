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

import { assertColabAccess } from '@/lib/auth/request-context';
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

describe('assertColabAccess', () => {
  it('platform admin -> null (qualquer colab)', async () => {
    const auth = mockAuth({ isPlatformAdmin: true });
    expect(await assertColabAccess(auth, 'c999')).toBeNull();
  });

  it('proprio colaborador -> null', async () => {
    const auth = mockAuth();
    expect(await assertColabAccess(auth, 'c1')).toBeNull();
  });

  it('RH mesma empresa -> null', async () => {
    const auth = mockAuth({ role: 'rh' });
    expect(await assertColabAccess(auth, 'c2')).toBeNull();
  });

  it('gestor mesma empresa + mesma area -> null', async () => {
    const auth = mockAuth({ role: 'gestor' });
    // Mock returns area_depto: 'TI', gestor has area_depto: 'TI'
    expect(await assertColabAccess(auth, 'c2')).toBeNull();
  });

  it('gestor mesma empresa + area diferente -> 403', async () => {
    const auth = mockAuth({
      role: 'gestor',
      colaborador: {
        id: 'c1',
        email: 'test@test.com',
        empresa_id: 'e1',
        nome_completo: 'Test',
        area_depto: 'Vendas', // diferente de 'TI' que o mock retorna
        role: 'gestor',
      },
    });
    const res = await assertColabAccess(auth, 'c2');
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
    const res = await assertColabAccess(auth, 'c2');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('colaborador tentando acessar outro -> 403', async () => {
    const auth = mockAuth({ role: 'colaborador' });
    const res = await assertColabAccess(auth, 'c2');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('empresa diferente -> 403', async () => {
    const auth = mockAuth({
      role: 'rh',
      empresaId: 'e999', // diferente de 'e1' que o mock retorna
    });
    const res = await assertColabAccess(auth, 'c2');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });
});
