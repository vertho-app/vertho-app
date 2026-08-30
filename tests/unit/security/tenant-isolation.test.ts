import { describe, it, expect, vi } from 'vitest';

// A linha do colaborador ALVO, controlada por caso. `vi.hoisted` porque a
// factory do `vi.mock` sobe para o topo do módulo e não enxerga `const` normal.
const mocks = vi.hoisted(() => ({ colabAlvo: null as { empresa_id: string; area_depto: string } | null }));

// Mock Supabase ANTES do import, mesmo padrão de `colab-access.test.ts`.
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.colabAlvo }) }),
      }),
    }),
  }),
}));

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

  /**
   * Os dois casos acima NÃO alcançam a comparação de tenant, e por sete meses
   * deram cobertura aparente a este arquivo.
   *
   * `assertColabAccess` só consulta o banco e compara `data.empresa_id !==
   * auth.empresaId` dentro do ramo `role === 'rh' || role === 'gestor'`. O
   * `mockAuth` daqui tem `role = 'colaborador'` por default, então o primeiro
   * caso sai no `return 403` final (papel sem regra própria) e o segundo, no
   * `auth.colaborador?.id === colabId`. Auditoria de 30/08: desliguei a
   * comparação de tenant em `request-context.ts:171`, que é a violação literal
   * do nome deste describe, e os 9 casos ficaram VERDES.
   *
   * Quem de fato segurava a classe eram `colab-access.test.ts` e
   * `conteudo-personalizado-posse.test.ts`, dois arquivos de fora. O risco não
   * era um buraco aberto; era alguém ler "Isolamento cross-tenant" e concluir
   * que este caso estava coberto aqui.
   *
   * O controle positivo no fim não é decoração: sem ele, um erro no mock faria
   * os dois casos de 403 passarem pelo motivo errado (qualquer falha vira 403),
   * que é a mesma armadilha de origem, só que um nível adiante.
   */
  describe('assertColabAccess — o ramo que REALMENTE compara tenant (rh/gestor)', () => {
    it('RH da empresa A NÃO acessa colab da empresa B → 403', async () => {
      mocks.colabAlvo = { empresa_id: tenantB.id, area_depto: tenantB.area };
      const auth = mockAuth(tenantA, 'rh');
      const res = await assertColabAccess(auth, tenantB.colabId);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    // ⚠️ A área do alvo é a DO GESTOR de propósito. Com a área divergente, o
    // caso ficaria verde pela checagem de `area_depto`, que vem DEPOIS da
    // comparação de tenant, e o teste passaria sem exercitar o tenant. Medido
    // ao mutar: com `area_depto: tenantB.area` este caso sobrevivia à
    // desativação da comparação de tenant. Mesma área isola a variável, e o
    // único motivo possível de 403 passa a ser a empresa.
    it('gestor da empresa A NÃO acessa colab da empresa B, MESMA área → 403', async () => {
      mocks.colabAlvo = { empresa_id: tenantB.id, area_depto: tenantA.area };
      const auth = mockAuth(tenantA, 'gestor');
      const res = await assertColabAccess(auth, tenantB.colabId);
      expect(res).not.toBeNull();
      expect(res!.status).toBe(403);
    });

    it('RH da empresa A acessa colab da PRÓPRIA empresa → null (prova que o caminho chega na comparação)', async () => {
      mocks.colabAlvo = { empresa_id: tenantA.id, area_depto: tenantA.area };
      const auth = mockAuth(tenantA, 'rh');
      const res = await assertColabAccess(auth, 'outro-colab-da-empresa-a');
      expect(res).toBeNull();
    });
  });
});
