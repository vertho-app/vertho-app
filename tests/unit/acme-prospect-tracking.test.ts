import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

const expired = {
  session_id: '11111111111111111111',
  colaborador_id: 'colab-expired',
  auth_email: 'convidado.acme.11111111111111111111@vertho.ai',
  prospect_name: 'Marina Souza',
  prospect_company: 'Empresa Horizonte',
  cargo: 'Representante Comercial',
  created_at: '2026-08-31T12:00:00.000Z',
  expires_at: '2026-09-02T07:00:00.000Z',
  personal_accessed_at: '2026-08-31T13:00:00.000Z',
  disc_completed_at: null,
  colaborador_accessed_at: null,
  gestor_accessed_at: null,
  rh_accessed_at: null,
  access_closed_at: null,
};

const active = {
  ...expired,
  session_id: '22222222222222222222',
  colaborador_id: 'colab-active',
  auth_email: 'convidado.acme.22222222222222222222@vertho.ai',
  prospect_name: 'Caio Lima',
  expires_at: '2026-09-03T07:00:00.000Z',
};

/** Sessões fora da janela de retenção — o teste que precisa delas as preenche. */
let foraDaRetencao: Array<{ session_id: string; auth_email: string }> = [];

const sb = criarSupabaseMock({
  resolver: (table) => {
    if (table === 'empresas') return { id: 'acme-id', is_demo: true };
    if (table === 'colaboradores') {
      return { id: 'colab-expired', mapeamento_em: '2026-09-01T18:30:00.000Z' };
    }
    return null;
  },
  lista: (table, cols) => {
    if (table === 'demo_prospect_sessions') {
      // DUAS consultas batem nesta tabela e querem coisas diferentes: a faxina
      // do vencimento lê a sessão inteira, a da RETENÇÃO pede só o par
      // (session_id, auth_email). O mock não aplica filtros, então distinguir
      // pelas COLUNAS é o que impede a retenção de "ver" o vencido de agora e
      // apagar um colaborador que o teste afirma que fica.
      return cols === 'session_id,auth_email' ? foraDaRetencao : [expired, active];
    }
    if (table === 'colaboradores') {
      return [{ id: 'colab-expired', mapeamento_em: '2026-09-01T18:30:00.000Z' }];
    }
    return [];
  },
});

const deleteUser = vi.fn(async () => ({ data: {}, error: null }));
const listUsers = vi.fn(async () => ({
  data: {
    users: [expired, active].map((row, index) => ({
      id: `auth-${index + 1}`,
      email: row.auth_email,
      user_metadata: {
        vertho_demo_access: 'acme-prospect-experience-v1',
        vertho_demo_session_id: row.session_id,
        expires_at: row.expires_at,
      },
    })),
  },
  error: null,
}));

sb.client.auth = { admin: { listUsers, deleteUser } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async () => ({ id: 'acme-id', slug: 'acme-demo' })),
}));

import {
  cleanupExpiredAcmeProspects,
  listAcmeProspectProgress,
  recordAcmeProspectPersonalAccess,
} from '@/lib/demo/acme-prospect-tracking';

describe('acompanhamento dos prospects ACME', () => {
  beforeEach(() => {
    sb.reset();
    deleteUser.mockClear();
    listUsers.mockClear();
    foraDaRetencao = [];
  });

  it('fecha somente o vencido, preserva o DISC e mantém o ativo para bloquear o reset', async () => {
    const result = await cleanupExpiredAcmeProspects(
      new Date('2026-09-02T07:00:00.000Z'),
      sb.client,
    );

    expect(result).toMatchObject({
      expiredRemoved: 1,
      activeCount: 1,
      nextExpiry: '2026-09-03T07:00:00.000Z',
    });
    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(deleteUser).toHaveBeenCalledWith('auth-1');
    // 🔑 VENCER É PERDER O ACESSO, NÃO O TRABALHO (03/09/2026): a conta do Auth
    // sai — é ela que deixa a pessoa entrar —, mas o colaborador FICA, com o
    // DISC nas colunas dele. Antes, vencer apagava tudo e quem voltasse um dia
    // depois não encontrava "expirado", encontrava o nada. Quem apaga de vez é
    // a retenção, muito depois, e por `access_closed_at`.
    const apagouColaboradorNoVencimento = sb.escritas.some((escrita) => (
      escrita.tabela === 'colaboradores' && escrita.op === 'delete'
    ));
    expect(apagouColaboradorNoVencimento).toBe(false);
    expect(sb.escritas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions',
      op: 'update',
      payload: { disc_completed_at: '2026-09-01T18:30:00.000Z' },
    }));
    expect(sb.escritas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions',
      op: 'update',
      payload: { access_closed_at: '2026-09-02T07:00:00.000Z' },
    }));
  });

  it('a retenção apaga o convidado fechado há muito tempo — e só ele', async () => {
    foraDaRetencao = [{ session_id: '33333333333333333333', auth_email: 'convidado.acme.33333333333333333333@vertho.ai' }];

    const result = await cleanupExpiredAcmeProspects(
      new Date('2026-09-02T07:00:00.000Z'),
      sb.client,
    );

    expect(result.retidosRemovidos).toBe(1);
    const deletes = sb.escritas.filter((e) => e.tabela === 'colaboradores' && e.op === 'delete');
    // exatamente um: o que saiu da janela. O vencido de agora continua de pé.
    expect(deletes).toHaveLength(1);
  });

  it('lista o histórico em contrato camelCase e recupera o DISC já salvo', async () => {
    const result = await listAcmeProspectProgress(sb.client);

    expect(result[0]).toMatchObject({
      sessionId: expired.session_id,
      nome: 'Marina Souza',
      empresa: 'Empresa Horizonte',
      discCompletedAt: '2026-09-01T18:30:00.000Z',
    });
    expect(sb.usou('demo_prospect_sessions', 'order', 'created_at')).toBe(true);
    expect(sb.usou('demo_prospect_sessions', 'limit', 50)).toBe(true);
  });

  it('registra o primeiro acesso somente para um Auth válido e ainda no prazo', async () => {
    const recorded = await recordAcmeProspectPersonalAccess({
      email: active.auth_email,
      user_metadata: {
        vertho_demo_access: 'acme-prospect-experience-v1',
        vertho_demo_session_id: active.session_id,
        expires_at: '2999-09-03T07:00:00.000Z',
      },
    });

    expect(recorded).toBe(true);
    expect(sb.escritas).toContainEqual(expect.objectContaining({
      tabela: 'demo_prospect_sessions',
      op: 'update',
      payload: expect.objectContaining({ personal_accessed_at: expect.any(String) }),
    }));
  });
});
