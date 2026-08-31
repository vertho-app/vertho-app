import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  isAcmeProspectAuthUser,
  prepareAcmeProspectExperience,
  removeAcmeProspectAuthUsers,
} from '@/lib/demo/acme-prospect-experience';
import {
  nextAcmeDemoResetAt,
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
    expect(new URL(result.access.url).hostname).toBe('acme-demo.vertho.ai');
    expect(new URL(result.access.url).pathname).toBe('/auth/callback');
    expect(new URL(result.access.url).searchParams.get('token_hash')).toBe('guest-token-hash');

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
      }),
    }));
    expect(generateLink).toHaveBeenCalledWith({
      type: 'magiclink',
      email: insert?.payload.email,
      options: { redirectTo: 'https://acme-demo.vertho.ai/dashboard' },
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

  it('calcula a próxima fronteira real do reset diário às 07:00 UTC', () => {
    expect(nextAcmeDemoResetAt(new Date('2026-08-31T06:30:00.000Z'))).toBe('2026-08-31T07:00:00.000Z');
    expect(nextAcmeDemoResetAt(new Date('2026-08-31T12:00:00.000Z'))).toBe('2026-09-01T07:00:00.000Z');
  });

  it('limpa somente usuários Auth com prefixo e marcador do fluxo', async () => {
    deleteUser.mockClear();
    const matching = {
      id: 'guest-1',
      email: 'convidado.acme.1234567890abcdef1234@vertho.ai',
      user_metadata: { vertho_demo_access: 'acme-prospect-experience-v1' },
    };
    listUsers.mockResolvedValueOnce({
      data: {
        users: [
          matching,
          { ...matching, id: 'wrong-marker', user_metadata: { vertho_demo_access: 'outro-fluxo' } },
          { ...matching, id: 'wrong-email', email: 'bruna.demo@vertho.ai' },
        ],
      },
      error: null,
    });

    expect(isAcmeProspectAuthUser(matching)).toBe(true);
    const removed = await removeAcmeProspectAuthUsers(sb.client);

    expect(removed).toBe(1);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith('guest-1');
  });
});
