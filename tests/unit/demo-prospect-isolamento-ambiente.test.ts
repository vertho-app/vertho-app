import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * A faxina de convidados apaga, como resíduo, todo usuário de Auth com o
 * marcador de degustação que NÃO tem sessão rastreada no tenant varrido.
 * Enquanto existiu um ambiente só, isso era seguro. Com dois, o marcador deixa
 * de bastar: ele é idêntico em todos, e `demo_prospect_sessions` é consultada
 * por `empresa_id` — então o convidado do vizinho aparece como órfão.
 *
 * Quem separa os ambientes é o PREFIXO do e-mail. O perigo mora no DEFAULT: com
 * o prefixo do ACME valendo para qualquer slug, a faxina do ambiente novo lista
 * as contas do ACME, não acha a sessão delas na própria casa e as remove no meio
 * da demo alheia. Este arquivo trava as duas pontas: prefixo próprio por
 * ambiente, e faxina sem alcance sobre a conta do vizinho.
 */

const acmeAtivo = {
  session_id: '33333333333333333333',
  colaborador_id: 'colab-acme',
  auth_email: 'convidado.acme.33333333333333333333@vertho.ai',
  prospect_name: 'Marina Souza',
  prospect_company: 'Empresa Horizonte',
  cargo: 'Representante Comercial',
  created_at: '2026-08-31T12:00:00.000Z',
  expires_at: '2026-09-03T07:00:00.000Z',
  personal_accessed_at: null,
  disc_completed_at: null,
  colaborador_accessed_at: null,
  gestor_accessed_at: null,
  rh_accessed_at: null,
  access_closed_at: null,
};

/** Tenant que a rodada está varrendo (o mock de `empresas` responde por ele). */
let tenantVarrido = { slug: 'acme-demo', id: 'acme-id' };
/** Sessões que existem NO tenant varrido. */
let sessoesDoTenant: any[] = [acmeAtivo];

const sb = criarSupabaseMock({
  resolver: (table) => (table === 'empresas' ? { id: tenantVarrido.id, is_demo: true } : null),
  lista: (table) => (table === 'demo_prospect_sessions' ? sessoesDoTenant : []),
});

const deleteUser = vi.fn(async () => ({ data: {}, error: null }));
/** O Auth é global: as contas dos DOIS ambientes vivem na mesma listagem. */
const listUsers = vi.fn(async () => ({
  data: {
    users: [
      {
        id: 'auth-acme',
        email: acmeAtivo.auth_email,
        user_metadata: {
          vertho_demo_access: 'acme-prospect-experience-v1',
          vertho_demo_session_id: acmeAtivo.session_id,
          expires_at: acmeAtivo.expires_at,
        },
      },
    ],
  },
  error: null,
}));

sb.client.auth = { admin: { listUsers, deleteUser } };

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => ({ id: tenantVarrido.id, slug })),
}));

import { cleanupExpiredDemoProspects } from '@/lib/demo/acme-prospect-tracking';
import {
  ACME_PROSPECT_AUTH_PREFIX,
  demoProspectAuthEmail,
  demoProspectAuthPrefix,
} from '@/lib/demo/acme-prospect-config';

describe('degustação: a faxina de um ambiente demo não alcança o convidado do outro', () => {
  beforeEach(() => {
    sb.reset();
    deleteUser.mockClear();
    listUsers.mockClear();
    tenantVarrido = { slug: 'acme-demo', id: 'acme-id' };
    sessoesDoTenant = [acmeAtivo];
  });

  it('dá prefixo próprio a um ambiente ainda não registrado, em vez de herdar o do ACME', () => {
    expect(demoProspectAuthPrefix('acme-demo')).toBe(ACME_PROSPECT_AUTH_PREFIX);
    expect(demoProspectAuthPrefix('escolas-acme')).not.toBe(ACME_PROSPECT_AUTH_PREFIX);
    expect(demoProspectAuthEmail('escolas-acme', '44444444444444444444'))
      .toBe('convidado.escolas-acme.44444444444444444444@vertho.ai');
  });

  it('varrer o ambiente NOVO não remove a conta viva do ACME', async () => {
    // O ambiente escolar ainda não tem convidado nenhum; o do ACME está ativo.
    tenantVarrido = { slug: 'escolas-acme', id: 'escolas-id' };
    sessoesDoTenant = [];

    const resultado = await cleanupExpiredDemoProspects(
      'escolas-acme',
      new Date('2026-09-02T07:00:00.000Z'),
      sb.client,
    );

    expect(resultado).toEqual({ expiredRemoved: 0, activeCount: 0, nextExpiry: null });
    // Sem o prefixo por ambiente, `auth-acme` entraria na varredura como órfão
    // (a sessão dele está no outro tenant) e seria apagado aqui.
    expect(deleteUser).not.toHaveBeenCalled();
    expect(sb.escritas).not.toContainEqual(expect.objectContaining({
      tabela: 'colaboradores',
      op: 'delete',
    }));
  });

  it('varrer o ACME continua fechando o convidado vencido da própria casa', async () => {
    const vencido = {
      ...acmeAtivo,
      session_id: '55555555555555555555',
      colaborador_id: 'colab-vencido',
      auth_email: 'convidado.acme.55555555555555555555@vertho.ai',
      expires_at: '2026-09-01T07:00:00.000Z',
    };
    sessoesDoTenant = [vencido];
    listUsers.mockResolvedValueOnce({
      data: {
        users: [{
          id: 'auth-vencido',
          email: vencido.auth_email,
          user_metadata: {
            vertho_demo_access: 'acme-prospect-experience-v1',
            vertho_demo_session_id: vencido.session_id,
            expires_at: vencido.expires_at,
          },
        }],
      },
      error: null,
    });

    const resultado = await cleanupExpiredDemoProspects(
      'acme-demo',
      new Date('2026-09-02T07:00:00.000Z'),
      sb.client,
    );

    expect(resultado.expiredRemoved).toBe(1);
    expect(resultado.activeCount).toBe(0);
    expect(deleteUser).toHaveBeenCalledWith('auth-vencido');
  });
});
