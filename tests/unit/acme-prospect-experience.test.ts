import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { isDemoPersonaEmail, isInternalEmail } from '@/lib/internal-emails';

let isDemo = true;
const sb = criarSupabaseMock({
  resolver: (table) => table === 'empresas' ? { id: 'acme-id', is_demo: isDemo } : null,
});

const createUser = vi.fn(async () => ({
  data: { user: { id: 'auth-guest-1' } },
  error: null,
}));
const generateLink = vi.fn(async () => ({
  data: { properties: { hashed_token: 'guest-token-hash' } },
  error: null,
}));
const deleteUser = vi.fn(async () => ({ data: {}, error: null }));
const listUsers = vi.fn(async () => ({ data: { users: [] }, error: null }));

sb.client.auth = { admin: { createUser, generateLink, deleteUser, listUsers } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async () => ({ id: 'acme-id', nome: 'ACME Demo', slug: 'acme-demo', ui_config: {} })),
}));

import {
  createAcmeProspectLifecycle,
  prepareAcmeProspectExperience,
} from '@/lib/demo/acme-prospect-experience';
import {
  isAcmeProspectAuthUser,
  readAcmeProspectAuthContext,
} from '@/lib/demo/acme-prospect-tracking';
import {
  acmeProspectExpiresAt,
  buildAcmeProspectShareText,
  getAcmeProspectExperienceSteps,
  validateAcmeProspectExperienceInput,
} from '@/lib/demo/acme-prospect-config';

const validInput = {
  nome: 'Marina Souza',
  empresa: 'Empresa Horizonte',
  roleKey: 'representante-comercial' as const,
};

describe('experiência temporária de prospect no ACME', () => {
  beforeEach(() => {
    isDemo = true;
    sb.reset();
    vi.clearAllMocks();
    createUser.mockResolvedValue({ data: { user: { id: 'auth-guest-1' } }, error: null });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: 'guest-token-hash' } },
      error: null,
    });
    deleteUser.mockResolvedValue({ data: {}, error: null });
    listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  });

  it('cria participante tenant-scoped, identidade Auth interna e link no host ACME', async () => {
    const result = await prepareAcmeProspectExperience(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.access).toMatchObject({
      nome: 'Marina Souza',
      empresa: 'Empresa Horizonte',
      cargo: 'Representante Comercial',
    });
    // 🔴 O link do convidado NÃO pode apontar para o callback: ele trafega por
    // WhatsApp, e o robô de preview consumiria o token de uso único antes do
    // clique (medido 01/09: login carimbado 12s após a criação, e o clique de
    // verdade caindo em "link is invalid or has expired").
    const acesso = new URL(result.access.url);
    expect(acesso.hostname).toBe('acme-demo.vertho.ai');
    expect(acesso.pathname).toBe('/entrar');
    expect(acesso.pathname).not.toBe('/auth/callback');
    expect(acesso.searchParams.get('t')).toBe('acme-demo~guest-token-hash');
    // e o token não pode viajar solto num parâmetro que o callback aceite
    expect(acesso.searchParams.get('token_hash')).toBeNull();
    // sem `ir=1`: é ele que autoriza o consumo, e quem o adiciona é o JS da
    // tela de despacho, não o link que sai daqui
    expect(acesso.searchParams.get('ir')).toBeNull();

    const insert = sb.escritas.find((write) => write.tabela === 'colaboradores' && write.op === 'insert');
    expect(insert?.payload.empresa_id).toBe('acme-id');
    expect(insert?.payload.nome_completo).toBe('Marina Souza');
    expect(insert?.payload.role).toBe('colaborador');
    expect(insert?.payload.email).toMatch(/^convidado\.acme\.[a-f0-9]{20}@vertho\.ai$/);
    expect(isInternalEmail(insert?.payload.email)).toBe(true);
    expect(isDemoPersonaEmail(insert?.payload.email)).toBe(false);

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: insert?.payload.email,
      email_confirm: true,
      user_metadata: expect.objectContaining({
        vertho_demo_access: 'acme-prospect-experience-v1',
        vertho_demo_tenant: 'acme-demo',
        vertho_demo_session_id: expect.stringMatching(/^[a-f0-9]{20}$/),
      }),
    }));
    expect(generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: insert?.payload.email,
      options: { redirectTo: 'https://acme-demo.vertho.ai/dashboard' },
    });

    const tracking = sb.escritas.find((write) => write.tabela === 'demo_prospect_sessions' && write.op === 'insert');
    expect(tracking?.payload).toMatchObject({
      empresa_id: 'acme-id',
      colaborador_id: insert?.payload.id,
      prospect_name: 'Marina Souza',
      prospect_company: 'Empresa Horizonte',
      expires_at: result.access.expiresAt,
    });
  });

  it('falha fechado antes de qualquer escrita quando o alvo não é tenant demo', async () => {
    isDemo = false;
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});

    const result = await prepareAcmeProspectExperience(validInput);

    expect(result.ok).toBe(false);
    expect(sb.escritas).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('trata erro retornado pelo Supabase e não cria identidade Auth', async () => {
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'pool indisponível' });
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});

    const result = await prepareAcmeProspectExperience(validInput);

    expect(result).toEqual({ ok: false, error: 'carregar ACME Demo: pool indisponível' });
    expect(sb.escritas).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('desfaz colaborador e Auth se a geração do link falhar', async () => {
    generateLink.mockResolvedValueOnce({ data: null as any, error: { message: 'OTP indisponível' } as any });
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});

    const result = await prepareAcmeProspectExperience(validInput);

    expect(result.ok).toBe(false);
    expect(sb.escritas.some((write) => write.tabela === 'colaboradores' && write.op === 'delete')).toBe(true);
    expect(deleteUser).toHaveBeenCalledWith('auth-guest-1');
  });

  it('desfaz o colaborador mesmo quando o SDK de Auth lança', async () => {
    createUser.mockRejectedValueOnce(new Error('conexão interrompida'));
    vi.spyOn(console, 'error').mockImplementationOnce(() => {});

    const result = await prepareAcmeProspectExperience(validInput);

    expect(result).toEqual({ ok: false, error: 'conexão interrompida' });
    expect(sb.escritas.some((write) => write.tabela === 'colaboradores' && write.op === 'delete')).toBe(true);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe('contratos puros da experiência ACME', () => {
  it('normaliza copy humana e rejeita papel não allowlistado', () => {
    expect(validateAcmeProspectExperienceInput({
      nome: '  Marina\n  Souza ',
      empresa: ' Empresa   Horizonte ',
      roleKey: 'analista-financeiro',
    })).toEqual({
      ok: true,
      value: { nome: 'Marina Souza', empresa: 'Empresa Horizonte', roleKey: 'analista-financeiro' },
    });
    expect(validateAcmeProspectExperienceInput({
      ...validInput,
      roleKey: 'admin',
    })).toEqual({ ok: false, error: 'Escolha um papel demonstrativo válido.' });
  });

  it('calcula 04h BRT de D+2 pela data civil brasileira, inclusive à noite', () => {
    expect(acmeProspectExpiresAt(new Date('2026-08-31T06:30:00.000Z'))).toBe('2026-09-02T07:00:00.000Z');
    expect(acmeProspectExpiresAt(new Date('2026-08-31T12:00:00.000Z'))).toBe('2026-09-02T07:00:00.000Z');
    expect(acmeProspectExpiresAt(new Date('2026-09-01T02:30:00.000Z'))).toBe('2026-09-02T07:00:00.000Z');
  });

  it('gera ciclo com id opaco e a expiração D+2', () => {
    const lifecycle = createAcmeProspectLifecycle(new Date('2026-08-31T15:00:00.000Z'));
    expect(lifecycle.sessionId).toMatch(/^[a-f0-9]{20}$/);
    expect(lifecycle.expiresAt).toBe('2026-09-02T07:00:00.000Z');
  });

  it('monta o roteiro compartilhável nas quatro perspectivas e na ordem correta', () => {
    const access = {
      sessionId: 'session-1',
      nome: 'Marina Souza',
      empresa: 'Empresa Horizonte',
      cargo: 'Representante Comercial',
      expiresAt: '2026-09-02T07:00:00.000Z',
      url: 'https://acme-demo.vertho.ai/acesso-pessoal',
      views: [
        { roleKey: 'rh' as const, url: 'https://rh-demo.vertho.ai/acesso-rh' },
        { roleKey: 'usuario' as const, url: 'https://usuario-demo.vertho.ai/acesso-colaborador' },
        { roleKey: 'gestor' as const, url: 'https://gestor-demo.vertho.ai/acesso-gestor' },
      ],
    };

    const steps = getAcmeProspectExperienceSteps(access);
    expect(steps.map((step) => step.title)).toEqual([
      'Comece como você',
      'Veja como colaborador',
      'Veja como gestor',
      'Veja como RH',
    ]);
    expect(steps.map((step) => step.url)).toEqual([
      access.url,
      access.views[1].url,
      access.views[2].url,
      access.views[0].url,
    ]);

    const text = buildAcmeProspectShareText(access);
    expect(text).toContain('01/04 — Comece como você');
    expect(text).toContain('02/04 — Veja como colaborador');
    expect(text).toContain('03/04 — Veja como gestor');
    expect(text).toContain('04/04 — Veja como RH');
    expect(text.match(/https:\/\//g)).toHaveLength(4);
    // A etapa 01 precisa dizer POR QUE seguir: quem responde e para ali nunca
    // volta, e a avaliação que dispara no envio fica pronta para ninguém.
    expect(text).toContain('O resultado fica pronto enquanto você avança pelas próximas etapas.');
    // e sem prazo em número: a duração muda com modelo e fila, e minuto
    // prometido em texto que sai para o cliente vira dívida
    expect(text).not.toMatch(/\d+\s*(minuto|min|segundo)/i);
    expect(text).toContain('Os quatro acessos ficam disponíveis até 02/09, 04:00');
    expect(text).toContain('O link da etapa 01 é individual e funciona uma única vez');
  });

  it('não oferece envio por e-mail e mantém o texto completo copiável na interface', () => {
    const source = readFileSync('app/admin/demo/page.tsx', 'utf8');
    expect(source).not.toContain('mailto:');
    expect(source).not.toContain('type="email"');
    expect(source).not.toContain('E-mail para compartilhar');
    expect(source).toContain('Copiar texto completo');
  });

  it('reconhece somente Auth do fluxo e aplica a expiração do metadado', () => {
    const matching = {
      id: 'guest-1',
      email: 'convidado.acme.1234567890abcdef1234@vertho.ai',
      user_metadata: {
        vertho_demo_access: 'acme-prospect-experience-v1',
        expires_at: '2026-09-02T07:00:00.000Z',
      },
    };
    expect(isAcmeProspectAuthUser(matching)).toBe(true);
    expect(isAcmeProspectAuthUser({
      ...matching,
      user_metadata: { vertho_demo_access: 'outro-fluxo' },
    })).toBe(false);
    expect(isAcmeProspectAuthUser({ ...matching, email: 'bruna.demo@vertho.ai' })).toBe(false);
    expect(readAcmeProspectAuthContext(matching, new Date('2026-09-02T06:59:59.000Z'))).toMatchObject({
      sessionId: '1234567890abcdef1234',
      expired: false,
    });
    expect(readAcmeProspectAuthContext(matching, new Date('2026-09-02T07:00:00.000Z'))?.expired).toBe(true);
  });
});
