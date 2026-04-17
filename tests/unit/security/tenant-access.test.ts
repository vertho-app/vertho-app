import { describe, it, expect } from 'vitest';
import { assertTenantAccess } from '@/lib/auth/request-context';
import type { AuthenticatedContext } from '@/lib/auth/request-context';

const mockAuth = (overrides: Partial<AuthenticatedContext> = {}): AuthenticatedContext => ({
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

describe('assertTenantAccess', () => {
  it('platform admin bypassa qualquer empresa -> null', () => {
    const auth = mockAuth({ isPlatformAdmin: true });
    expect(assertTenantAccess(auth, 'e999')).toBeNull();
  });

  it('colaborador da mesma empresa -> null', () => {
    const auth = mockAuth({ empresaId: 'e1' });
    expect(assertTenantAccess(auth, 'e1')).toBeNull();
  });

  it('colaborador de empresa diferente -> 403', () => {
    const auth = mockAuth({ empresaId: 'e1' });
    const res = assertTenantAccess(auth, 'e2');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it('empresaId null -> 400', () => {
    const auth = mockAuth();
    const res = assertTenantAccess(auth, null);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });
});
