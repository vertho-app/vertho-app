import { describe, it, expect } from 'vitest';
import { assertTenantAccess, assertColabAccess } from '@/lib/auth/request-context';
import type { AuthenticatedContext } from '@/lib/auth/request-context';

const tenantA = {
  id: 'empresa-a-uuid',
  colabId: 'colab-a-uuid',
  email: 'maria@empresaA.com',
  area: 'Vendas',
};
const tenantB = {
  id: 'empresa-b-uuid',
  colabId: 'colab-b-uuid',
  email: 'joao@empresaB.com',
  area: 'TI',
};

function mockAuth(tenant: typeof tenantA, role = 'colaborador', isPlatformAdmin = false): AuthenticatedContext {
  return {
    email: tenant.email,
    colaborador: {
      id: tenant.colabId,
      email: tenant.email,
      empresa_id: tenant.id,
      nome_completo: tenant.email.split('@')[0],
      area_depto: tenant.area,
      role,
    },
    role,
    empresaId: tenant.id,
    isPlatformAdmin,
  } as AuthenticatedContext;
}

describe('Isolamento cross-tenant', () => {
  describe('assertTenantAccess — tenant A não acessa tenant B', () => {
    it('colab empresa A tenta acessar dados empresa B → 403', () => {
      const auth = mockAuth(tenantA);
      const res = assertTenantAccess(auth, tenantB.id);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    it('colab empresa B tenta acessar dados empresa A → 403', () => {
      const auth = mockAuth(tenantB);
      const res = assertTenantAccess(auth, tenantA.id);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    it('gestor empresa A tenta acessar dados empresa B → 403', () => {
      const auth = mockAuth(tenantA, 'gestor');
      const res = assertTenantAccess(auth, tenantB.id);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    it('RH empresa A tenta acessar dados empresa B → 403', () => {
      const auth = mockAuth(tenantA, 'rh');
      const res = assertTenantAccess(auth, tenantB.id);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });
  });

  describe('assertTenantAccess — acesso legítimo permitido', () => {
    it('colab acessa própria empresa → null (permitido)', () => {
      const auth = mockAuth(tenantA);
      expect(assertTenantAccess(auth, tenantA.id)).toBeNull();
    });

    it('gestor acessa própria empresa → null (permitido)', () => {
      const auth = mockAuth(tenantA, 'gestor');
      expect(assertTenantAccess(auth, tenantA.id)).toBeNull();
    });

    it('platform admin acessa qualquer empresa → null (bypass)', () => {
      const auth = mockAuth(tenantA, 'colaborador', true);
      expect(assertTenantAccess(auth, tenantB.id)).toBeNull();
    });
  });

  describe('assertColabAccess — colab A não acessa colab B de outra empresa', () => {
    it('colab empresa A tenta acessar colab empresa B → 403', async () => {
      const auth = mockAuth(tenantA);
      const res = await assertColabAccess(auth, tenantB.colabId);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    it('colab acessa a si mesmo → null (permitido)', async () => {
      const auth = mockAuth(tenantA);
      const res = await assertColabAccess(auth, tenantA.colabId);
      expect(res).toBeNull();
    });
  });
});
