import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as string[],
  audits: [] as Array<Record<string, any>>,
  presentationResult: null as any,
  prospectResult: null as any,
  prospectArgs: [] as any[],
  ticketArgs: [] as Array<Record<string, any>>,
  salas: [] as string[],
  cleanupResult: { expiredRemoved: 0, activeCount: 0, nextExpiry: null } as any,
  cleanupSlugs: [] as string[],
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
  isDemoPresentationTenant: (slug: unknown) => h.salas.includes(String(slug)),
  // O HOST carrega o ambiente — é o que a rota compara contra o ticket. O mock
  // precisa refletir isso, senão host e ticket nunca divergem aqui e o teste
  // não consegue enxergar o defeito que existe justamente entre os dois.
  demoPresentationAuthUrl: (roleKey: string, ticket: string, _root: unknown, tenantSlug = 'acme-demo') =>
    `https://${roleKey}-${tenantSlug}.vertho.ai/auth/apresentacao?ticket=${ticket}`,
}));

vi.mock('@/lib/demo/presentation-ticket', () => ({
  // O ticket ASSINA o ambiente. Devolvê-lo no valor torna visível, no teste, de
  // que sala o passe diz ser.
  issueDemoPresentationTicket: (now: unknown, options: unknown, tenantSlug?: string) => {
    h.ticketArgs.push({ now, options, tenantSlug });
    return `tracked-ticket:${tenantSlug ?? 'DEFAULT'}`;
  },
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
  cleanupExpiredDemoProspects: async (slug: string) => {
    h.cleanupSlugs.push(slug);
    return h.cleanupResult;
  },
  listAcmeProspectProgress: vi.fn(),
}));

const convite = vi.hoisted(() => ({
  resultado: null as any,
  chamadas: [] as Array<[string, string]>,
}));
vi.mock('@/lib/demo/degustacao-convite', () => ({
  prepararConviteGuiado: async (slug: string, sessionId: string) => {
    h.calls.push('convite');
    convite.chamadas.push([slug, sessionId]);
    return convite.resultado;
  },
}));

import { gerarConviteDegustacao, prepararExperienciaProspectAcme, resetarDemo } from '@/actions/demo';

describe('action do lembrete da degustação B', () => {
  beforeEach(() => {
    h.calls = [];
    h.audits = [];
    convite.chamadas = [];
    convite.resultado = {
      ok: true,
      url: 'https://acme-demo.vertho.ai/degustacao?passe=segredo.assinado',
      nome: 'Pedro Santos',
      convertido: true,
    };
  });

  it('gate primeiro; devolve o texto curto com o link; a auditoria NÃO leva a URL', async () => {
    const r: any = await gerarConviteDegustacao('acme-demo', 'aaaaaaaaaaaaaaaaaaaa');

    expect(h.calls).toEqual(['gate', 'convite', 'audit']);
    expect(r).toMatchObject({ success: true, convertidoParaB: true });
    expect(r.texto).toContain('Oi, Pedro!');
    expect(r.texto).toContain(r.url);
    expect(JSON.stringify(h.audits)).not.toContain('passe=');
    expect(h.audits[0]).toMatchObject({ acao: 'demo.prospect_invite_reminder', alvo: 'acme-demo' });
  });

  it('🔴 ambiente fora da allowlist (inclusive nome de protótipo) é recusado antes do núcleo', async () => {
    for (const slug of ['macae', 'constructor', '__proto__']) {
      const r: any = await gerarConviteDegustacao(slug as any, 'aaaaaaaaaaaaaaaaaaaa');
      expect(r.success).toBe(false);
    }
    expect(convite.chamadas).toHaveLength(0);
  });

  it('recusa do núcleo vira erro na tela e auditoria com resultado de erro', async () => {
    convite.resultado = { ok: false, error: 'Este acesso já venceu ou foi encerrado. Crie um roteiro novo.' };
    const r: any = await gerarConviteDegustacao('acme-demo', 'aaaaaaaaaaaaaaaaaaaa');
    expect(r).toEqual({ success: false, error: 'Este acesso já venceu ou foi encerrado. Crie um roteiro novo.' });
    expect(h.audits[0]).toMatchObject({ resultado: 'erro' });
  });
});

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
    h.ticketArgs = [];
    h.salas = ['acme-demo', 'escolas-acme', 'gruposinal'];
    h.cleanupResult = { expiredRemoved: 0, activeCount: 0, nextExpiry: null };
    h.cleanupSlugs = [];
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

  /**
   * 🔴 O ticket e o HOST têm que falar do mesmo ambiente.
   *
   * `/auth/apresentacao` compara os dois de propósito: a assinatura prova que o
   * passe é nosso, não que ele é DESTA sala. A URL já era montada com o `slug`
   * do roteiro e o ticket saía no DEFAULT — com um ambiente só, os dois
   * coincidiam por acidente; a partir do segundo, toda etapa 02–04 morria em
   * "apresentacao-invalida" na frente do prospect.
   *
   * `Medido 15/09/2026:` o primeiro roteiro do Grupo Sinal respondeu, em
   * produção, `307 → /login?error=apresentacao-invalida` nas três visões.
   */
  it('🔴 o ticket das etapas 02–04 é emitido para o ambiente do roteiro, não para o default', async () => {
    const result = await prepararExperienciaProspectAcme(validInput, 'gruposinal');

    expect(result).toMatchObject({ success: true });
    expect(h.ticketArgs.at(-1)?.tenantSlug).toBe('gruposinal');
    for (const view of (result as any).visoes) {
      // O host diz `-gruposinal`; o ticket precisa dizer o mesmo.
      expect(view.url).toContain('gruposinal.vertho.ai');
      expect(view.url).toContain('tracked-ticket:gruposinal');
    }
  });

  it('a auditoria do roteiro registra o ambiente REAL, não a constante do ACME', async () => {
    await prepararExperienciaProspectAcme(validInput, 'gruposinal');
    expect(h.audits.at(-1)?.alvo).toBe('gruposinal');
  });

  it('recusa ambiente que oferece degustação mas não tem sala, antes de criar convidado', async () => {
    // A allowlist de degustação e a de salas são listas diferentes: um ambiente
    // pode entrar numa antes da outra. `gruposinal` É um ambiente de degustação
    // válido aqui — o que falta é a SALA —, senão o teste passaria pelo guard
    // anterior e não provaria nada sobre este.
    h.salas = ['acme-demo'];

    const semSala = await prepararExperienciaProspectAcme(validInput, 'gruposinal');

    expect(semSala).toMatchObject({ success: false });
    expect((semSala as any).error).toContain('sala de apresentação');
    expect(h.calls).not.toContain('prospect');
    expect(h.calls).not.toContain('presentation');
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

  it('convidado ativo NÃO adia mais o reset — ele atravessa a recomposição', async () => {
    // O adiamento existia para o reset não apagar o trabalho de quem estava no
    // meio da experiência. Com o convidado preservado no wipe, adiar só deixaria
    // o ambiente sem estado-base por dias — com validade de 10, quase sempre.
    h.cleanupResult = {
      expiredRemoved: 1,
      retidosRemovidos: 0,
      activeCount: 2,
      nextExpiry: '2026-09-13T07:00:00.000Z',
    };

    const result = await resetarDemo('acme-demo');

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(h.resetDemo).toHaveBeenCalledWith('acme-demo');
    // a faxina continua rodando antes: ela é que revoga acesso vencido
    expect(h.cleanupSlugs).toEqual(['acme-demo']);
  });

  it('reseta o ACME quando a limpeza não encontra convidados ativos', async () => {
    const result = await resetarDemo('acme-demo');

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(h.resetDemo).toHaveBeenCalledWith('acme-demo');
    expect(h.cleanupSlugs).toEqual(['acme-demo']);
  });

  // O preflight lia o ACME fixo: resetar outro ambiente passava sem olhar
  // convidado nenhum, e um convidado ativo no ACME travava o reset do vizinho.
  it('confere os convidados DO ambiente que está sendo resetado, não os do ACME', async () => {
    const result = await resetarDemo('gruposinal');

    expect(result).toMatchObject({ success: true, skipped: false });
    expect(h.cleanupSlugs).toEqual(['gruposinal']);
    expect(h.resetDemo).toHaveBeenCalledWith('gruposinal');
  });

  it('a faxina roda no ambiente PEDIDO, e o reset acontece mesmo com convidado ativo', async () => {
    h.cleanupResult = { expiredRemoved: 0, retidosRemovidos: 0, activeCount: 1, nextExpiry: '2026-09-13T07:00:00.000Z' };

    const result = await resetarDemo('gruposinal');

    expect(result).toMatchObject({ success: true, skipped: false });
    // o alvo da faxina é o ambiente do botão, não o ACME por omissão
    expect(h.cleanupSlugs).toEqual(['gruposinal']);
    expect(h.resetDemo).toHaveBeenCalledWith('gruposinal');
  });
});
