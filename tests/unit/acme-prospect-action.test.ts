import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as string[],
  audits: [] as Array<Record<string, any>>,
  presentationResult: null as any,
  prospectResult: null as any,
}));

vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: async () => {
    h.calls.push('gate');
    return { email: 'admin@vertho.ai' };
  },
}));

vi.mock('@/lib/audit', () => ({
  logAdminAction: async (entry: Record<string, any>) => {
    h.calls.push('audit');
    h.audits.push(entry);
  },
}));

vi.mock('@/lib/demo/reset-acme-demo', () => ({
  resetDemoTenant: vi.fn(),
  prepararAcessosDemo: vi.fn(),
  gerarMagicLinksDemo: vi.fn(),
  prepararAcessosApresentacaoDemo: async () => {
    h.calls.push('presentation');
    return h.presentationResult;
  },
}));

vi.mock('@/lib/demo/presentation', () => ({
  DEMO_PRESENTATION_TENANT_SLUG: 'acme-demo',
}));

vi.mock('@/lib/demo/acme-prospect-experience', () => ({
  prepareAcmeProspectExperience: async () => {
    h.calls.push('prospect');
    return h.prospectResult;
  },
  removeAcmeProspectAuthUsers: vi.fn(),
}));

import { prepararExperienciaProspectAcme } from '@/actions/demo';

const validInput = {
  nome: 'Marina Souza',
  empresa: 'Empresa Horizonte',
  roleKey: 'representante-comercial' as const,
};

const views = [
  { roleKey: 'usuario', visao: 'Usuário', nome: 'Bruna', email: 'bruna.demo@vertho.ai', url: 'https://usuario-demo.vertho.ai/auth', directUrl: 'https://usuario-demo.vertho.ai/dashboard' },
  { roleKey: 'gestor', visao: 'Gestor', nome: 'Carla', email: 'carla.demo@vertho.ai', url: 'https://gestor-demo.vertho.ai/auth', directUrl: 'https://gestor-demo.vertho.ai/dashboard/gestor' },
  { roleKey: 'rh', visao: 'RH', nome: 'Helena', email: 'helena.demo@vertho.ai', url: 'https://rh-demo.vertho.ai/auth', directUrl: 'https://rh-demo.vertho.ai/dashboard' },
];

describe('action do roteiro de experiência ACME', () => {
  beforeEach(() => {
    h.calls = [];
    h.audits = [];
    h.presentationResult = { ok: true, acessos: views };
    h.prospectResult = {
      ok: true,
      access: {
        sessionId: 'session-1',
        nome: 'Marina Souza',
        empresa: 'Empresa Horizonte',
        cargo: 'Representante Comercial',
        expiresAt: '2026-09-01T07:00:00.000Z',
        url: 'https://acme-demo.vertho.ai/auth/callback?token_hash=secret',
      },
    };
  });

  it('prepara as três visões antes do acesso individual e devolve o fluxo completo', async () => {
    const result = await prepararExperienciaProspectAcme(validInput);

    expect(result).toMatchObject({ success: true, visoes: views });
    expect(h.calls).toEqual(['gate', 'presentation', 'prospect', 'audit']);
    expect(h.audits[0]?.detalhes?.visoes).toEqual(['usuario', 'gestor', 'rh']);
    expect(JSON.stringify(h.audits)).not.toContain('token_hash');
  });

  it('rejeita entrada inválida antes de preparar sessões ou criar convidado', async () => {
    const result = await prepararExperienciaProspectAcme({ ...validInput, roleKey: 'admin' as any });

    expect(result.success).toBe(false);
    expect(h.calls).toEqual(['gate', 'audit']);
  });

  it('não cria convidado quando as visões demonstrativas não ficam prontas', async () => {
    h.presentationResult = { ok: true, acessos: views.slice(0, 2) };

    const result = await prepararExperienciaProspectAcme(validInput);

    expect(result).toEqual({
      success: false,
      error: 'As três visões da experiência não foram preparadas: rh.',
    });
    expect(h.calls).toEqual(['gate', 'presentation', 'audit']);
  });
});
