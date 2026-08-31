import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as string[],
  audits: [] as Array<Record<string, any>>,
  presentationResult: null as any,
  prospectResult: null as any,
  prospectArgs: [] as any[],
  cleanupResult: { expiredRemoved: 0, activeCount: 0, nextExpiry: null } as any,
  resetDemo: vi.fn(async () => ({ ok: true, counts: { colaboradores: 30 } })),
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
  resetDemoTenant: h.resetDemo,
  prepararAcessosDemo: vi.fn(),
  gerarMagicLinksDemo: vi.fn(),
  prepararAcessosApresentacaoDemo: async () => {
    h.calls.push('presentation');
    return h.presentationResult;
  },
}));

vi.mock('@/lib/demo/presentation', () => ({
  DEMO_PRESENTATION_TENANT_SLUG: 'acme-demo',
  demoPresentationAuthUrl: (roleKey: string, ticket: string) => `https://${roleKey}-demo.vertho.ai/auth/apresentacao?ticket=${ticket}`,
}));

vi.mock('@/lib/demo/presentation-ticket', () => ({
  issueDemoPresentationTicket: () => 'tracked-ticket',
}));

vi.mock('@/lib/demo/acme-prospect-experience', () => ({
  createAcmeProspectLifecycle: () => ({
    sessionId: '1234567890abcdef1234',
    expiresAt: '2026-09-02T07:00:00.000Z',
  }),
  prepareAcmeProspectExperience: async (...args: any[]) => {
    h.calls.push('prospect');
    h.prospectArgs = args;
    return h.prospectResult;
  },
}));

vi.mock('@/lib/demo/acme-prospect-tracking', () => ({
  cleanupExpiredAcmeProspects: async () => h.cleanupResult,
  listAcmeProspectProgress: vi.fn(),
}));

import { prepararExperienciaProspectAcme, resetarDemo } from '@/actions/demo';

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
    h.prospectArgs = [];
    h.cleanupResult = { expiredRemoved: 0, activeCount: 0, nextExpiry: null };
    h.resetDemo.mockClear();
    h.presentationResult = { ok: true, acessos: views };
    h.prospectResult = {
      ok: true,
      access: {
        sessionId: 'session-1',
        nome: 'Marina Souza',
        empresa: 'Empresa Horizonte',
        cargo: 'Representante Comercial',
        expiresAt: '2026-09-02T07:00:00.000Z',
        url: 'https://acme-demo.vertho.ai/auth/callback?token_hash=secret',
      },
    };
  });

  it('prepara as três visões antes do acesso individual e devolve o fluxo completo', async () => {
    const result = await prepararExperienciaProspectAcme(validInput);

    expect(result).toMatchObject({ success: true });
    expect((result as any).visoes.map((view: any) => ({ ...view, url: views.find((raw) => raw.roleKey === view.roleKey)?.url }))).toEqual(views);
    expect(h.calls).toEqual(['gate', 'presentation', 'prospect', 'audit']);
    expect(h.audits[0]?.detalhes?.visoes).toEqual(['usuario', 'gestor', 'rh']);
    expect(JSON.stringify(h.audits)).not.toContain('token_hash');
    expect(h.prospectArgs[1]).toEqual({
      sessionId: '1234567890abcdef1234',
      expiresAt: '2026-09-02T07:00:00.000Z',
    });
    expect(h.prospectArgs[2]).toBe('admin@vertho.ai');
    expect((result as any).visoes.every((view: any) => view.url.includes('tracked-ticket'))).toBe(true);
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

  it('adia o reset do ACME enquanto houver convidado dentro de D+2', async () => {
    h.cleanupResult = {
      expiredRemoved: 1,
      activeCount: 2,
      nextExpiry: '2026-09-03T07:00:00.000Z',
    };

    const result = await resetarDemo('acme-demo');

    expect(result).toEqual({
      success: true,
      skipped: true,
      activeGuests: 2,
      nextExpiry: '2026-09-03T07:00:00.000Z',
    });
    expect(h.resetDemo).not.toHaveBeenCalled();
    expect(h.audits[0]).toMatchObject({ resultado: 'parcial', detalhes: { skipped: true } });
  });

  it('reseta o ACME quando a limpeza não encontra convidados ativos', async () => {
    const result = await resetarDemo('acme-demo');

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(h.resetDemo).toHaveBeenCalledWith('acme-demo');
  });
});
