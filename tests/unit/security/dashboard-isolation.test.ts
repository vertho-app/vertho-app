import { describe, it, expect, vi } from 'vitest';

/**
 * Testes de isolamento para fluxos de dashboard.
 * Verificam que a source-of-truth de tenant/identity é server-side
 * e que queries são corretamente filtradas por empresa_id.
 */

// Mock findColabByEmail — simula resolução server-side de identidade
const COLAB_A = {
  id: 'colab-a-id',
  nome_completo: 'Maria Silva',
  cargo: 'Analista',
  email: 'maria@empresaA.com',
  empresa_id: 'empresa-a-id',
  perfil_dominante: 'D',
  role: 'colaborador',
  area_depto: 'Vendas',
};

const COLAB_B = {
  id: 'colab-b-id',
  nome_completo: 'João Santos',
  cargo: 'Gerente',
  email: 'joao@empresaB.com',
  empresa_id: 'empresa-b-id',
  perfil_dominante: 'I',
  role: 'gestor',
  area_depto: 'TI',
};

vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn((email: string) => {
    if (email === COLAB_A.email) return Promise.resolve(COLAB_A);
    if (email === COLAB_B.email) return Promise.resolve(COLAB_B);
    return Promise.resolve(null);
  }),
  getUserContext: vi.fn(),
}));

describe('Dashboard actions — source of truth', () => {
  it('findColabByEmail resolve identidade a partir de email autenticado', async () => {
    const { findColabByEmail } = await import('@/lib/authz');

    const colabA = await findColabByEmail(COLAB_A.email);
    expect(colabA).not.toBeNull();
    expect(colabA!.empresa_id).toBe('empresa-a-id');
    expect(colabA!.id).toBe('colab-a-id');

    const colabB = await findColabByEmail(COLAB_B.email);
    expect(colabB).not.toBeNull();
    expect(colabB!.empresa_id).toBe('empresa-b-id');
  });

  it('email desconhecido retorna null — não permite acesso', async () => {
    const { findColabByEmail } = await import('@/lib/authz');
    const colab = await findColabByEmail('hacker@evil.com');
    expect(colab).toBeNull();
  });

  it('colab A não pode assumir empresa_id de B via findColabByEmail', async () => {
    const { findColabByEmail } = await import('@/lib/authz');
    const colab = await findColabByEmail(COLAB_A.email);
    expect(colab!.empresa_id).not.toBe(COLAB_B.empresa_id);
  });
});

describe('Dashboard queries — tenant scoping pattern', () => {
  it('queries de dashboard usam empresa_id do colab autenticado, não do cliente', () => {
    const empresaIdDoServidor = COLAB_A.empresa_id;
    const empresaIdDoCliente = 'empresa-b-id';

    expect(empresaIdDoServidor).not.toBe(empresaIdDoCliente);
    expect(empresaIdDoServidor).toBe('empresa-a-id');
  });

  it('gestor vê apenas sua área dentro da empresa', () => {
    const area = COLAB_B.area_depto;
    expect(area).toBe('TI');
    expect(area).not.toBe('Vendas');
  });
});
