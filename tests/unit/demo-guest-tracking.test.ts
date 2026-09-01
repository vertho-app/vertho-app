import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * O acompanhamento comercial nasceu lendo SÓ `demo_prospect_sessions` e SÓ o
 * ACME. Em 01/09/2026 dois convidados reais não apareciam na tela: o Alpheu
 * (semeado no `gruposinal`, tenant que o painel nem consultava) e um cadastro
 * manual no próprio ACME. Estes testes fixam as duas régu­as que faltavam:
 * quem conta como convidado, e que o tenant é parâmetro.
 */

const passaporte = {
  session_id: 'aaaaaaaaaaaaaaaaaaaa',
  colaborador_id: 'colab-passaporte',
  auth_email: 'convidado.acme.aaaaaaaaaaaaaaaaaaaa@vertho.ai',
  prospect_name: 'Catarina',
  prospect_company: 'Vitoriano & Cavalcante Ltda',
  cargo: 'Gerente Comercial',
  created_at: '2026-09-01T13:16:01.000Z',
  expires_at: '2026-09-03T07:00:00.000Z',
  personal_accessed_at: '2026-09-01T13:17:43.000Z',
  disc_completed_at: '2026-09-01T13:19:07.000Z',
  colaborador_accessed_at: null,
  gestor_accessed_at: null,
  rh_accessed_at: null,
  access_closed_at: null,
};

const COLABORADORES_ACME = [
  // o convidado do passaporte, que já vem pela tabela de sessões
  {
    id: 'colab-passaporte',
    nome_completo: 'Catarina',
    email: 'convidado.acme.aaaaaaaaaaaaaaaaaaaa@vertho.ai',
    cargo: 'Gerente Comercial',
    created_at: '2026-09-01T13:16:01.000Z',
    mapeamento_em: '2026-09-01T13:19:07.000Z',
  },
  // cadastro manual: é este que sumia da tela
  {
    id: 'colab-cadastro',
    nome_completo: 'Pedro L G Cardoso',
    email: 'PLGcardoso@gmail.com',
    cargo: 'Analista Financeiro',
    created_at: '2026-09-01T11:18:34.000Z',
    mapeamento_em: null,
  },
  // elenco fixo do seed: é cenário do ambiente, não gente acompanhada
  {
    id: 'colab-persona',
    nome_completo: 'Bruna Costa',
    email: 'bruna.demo@vertho.ai',
    cargo: 'Representante Comercial',
    created_at: '2026-09-01T07:01:13.000Z',
    mapeamento_em: '2026-09-01T07:01:13.000Z',
  },
  // conta da equipe da Vertho dentro do tenant de demo
  {
    id: 'colab-staff',
    nome_completo: 'Rodrigo',
    email: 'rodrigo@vertho.ai',
    cargo: 'Sócio',
    created_at: '2026-08-20T09:00:00.000Z',
    mapeamento_em: null,
  },
];

const COLABORADORES_SINAL = [
  {
    id: 'colab-alpheu',
    nome_completo: 'Alpheu',
    email: 'alpheu.sousa@gruposinal.com',
    cargo: 'Representante Comercial',
    created_at: '2026-08-31T11:59:26.000Z',
    mapeamento_em: null,
  },
  {
    id: 'colab-helena',
    nome_completo: 'Helena Duarte',
    email: 'helena.demo@vertho.ai',
    cargo: 'Gerente de Recursos Humanos',
    created_at: '2026-08-31T11:59:26.000Z',
    mapeamento_em: null,
  },
];

const cenario = {
  slug: 'acme-demo',
  isDemo: true as boolean,
  sessoes: [passaporte] as any[],
  colaboradores: COLABORADORES_ACME as any[],
};

const sb = criarSupabaseMock({
  resolver: (table) => (table === 'empresas' ? { id: `${cenario.slug}-id`, is_demo: cenario.isDemo } : null),
  lista: (table) => {
    if (table === 'demo_prospect_sessions') return cenario.sessoes;
    if (table === 'colaboradores') return cenario.colaboradores;
    return [];
  },
});

const rpc = vi.fn(async (_fn: string, args: any) => ({
  data: (args?.p_emails || [])
    .filter((email: string) => email === 'plgcardoso@gmail.com')
    .map((email: string) => ({ email, last_sign_in_at: '2026-09-01T15:00:00.000Z', auth_created_at: null })),
  error: null,
}));
sb.client.rpc = rpc;

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenant: vi.fn(async (slug: string) => ({ id: `${slug}-id`, slug })),
}));

import { listDemoGuestProgress } from '@/lib/demo/acme-prospect-tracking';

describe('acompanhamento dos convidados de um tenant de demonstração', () => {
  beforeEach(() => {
    sb.reset();
    rpc.mockClear();
    cenario.slug = 'acme-demo';
    cenario.isDemo = true;
    cenario.sessoes = [passaporte];
    cenario.colaboradores = COLABORADORES_ACME;
  });

  it('lista o passaporte e o cadastro manual, sem o elenco fixo nem a conta de staff', async () => {
    const lista = await listDemoGuestProgress('acme-demo', sb.client);

    expect(lista.map((item) => item.nome)).toEqual(['Catarina', 'Pedro L G Cardoso']);
    expect(lista[0]).toMatchObject({
      origem: 'passaporte',
      contexto: 'Vitoriano & Cavalcante Ltda',
      expiresAt: '2026-09-03T07:00:00.000Z',
    });
    expect(lista[1]).toMatchObject({
      origem: 'cadastro',
      contexto: 'plgcardoso@gmail.com',
      cargo: 'Analista Financeiro',
      expiresAt: null,
      personalAccessedAt: '2026-09-01T15:00:00.000Z',
      discCompletedAt: null,
    });
    expect(sb.chamadas).toContainEqual(
      expect.objectContaining({ tabela: 'colaboradores', metodo: 'eq', args: ['empresa_id', 'acme-demo-id'] }),
    );
  });

  it('não duplica o convidado do passaporte que também é colaborador', async () => {
    const lista = await listDemoGuestProgress('acme-demo', sb.client);

    const catarinas = lista.filter((item) => item.nome === 'Catarina');
    expect(catarinas).toHaveLength(1);
    expect(catarinas[0].origem).toBe('passaporte');
    // o e-mail técnico do passaporte nunca vai para a RPC: quem o carimba é o app
    expect(rpc).toHaveBeenCalledWith('demo_guest_auth_activity', {
      p_emails: ['plgcardoso@gmail.com'],
    });
  });

  it('mostra o convidado cujo passaporte perdeu a linha de acompanhamento', async () => {
    cenario.sessoes = [];

    const lista = await listDemoGuestProgress('acme-demo', sb.client);

    expect(lista.map((item) => item.nome)).toEqual(['Catarina', 'Pedro L G Cardoso']);
    expect(lista[0]).toMatchObject({ origem: 'cadastro', contexto: passaporte.auth_email });
  });

  it('acompanha o tenant pedido, e não sempre o ACME', async () => {
    cenario.slug = 'gruposinal';
    cenario.colaboradores = COLABORADORES_SINAL;

    const lista = await listDemoGuestProgress('gruposinal', sb.client);

    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      nome: 'Alpheu',
      origem: 'cadastro',
      contexto: 'alpheu.sousa@gruposinal.com',
    });
    // fora do ACME não existe passaporte: consultar a tabela seria ruído
    expect(sb.chamadas.some((c) => c.tabela === 'demo_prospect_sessions')).toBe(false);
    // e a PERGUNTA tem que citar o tenant pedido — sem isto o teste mediria só
    // o cenário que ele mesmo montou, e um slug fixo no código passaria verde
    expect(sb.chamadas).toContainEqual(
      expect.objectContaining({ tabela: 'empresas', metodo: 'eq', args: ['slug', 'gruposinal'] }),
    );
    expect(sb.chamadas).toContainEqual(
      expect.objectContaining({ tabela: 'colaboradores', metodo: 'eq', args: ['empresa_id', 'gruposinal-id'] }),
    );
  });

  it('falha alto quando o acesso do convidado não pode ser lido', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'function does not exist' } } as any);

    await expect(listDemoGuestProgress('acme-demo', sb.client))
      .rejects.toThrow(/carregar acessos dos convidados/);
  });

  it('recusa tenant que não está marcado como demonstração', async () => {
    cenario.isDemo = false;

    await expect(listDemoGuestProgress('macae', sb.client))
      .rejects.toThrow(/não está marcado como demonstração/);
  });
});
