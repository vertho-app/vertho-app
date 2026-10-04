import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Onda E (04/10/2026): "Regerar semana" (admin) reescreve o desafio, a missão e o cenário da semana, e esses
 * textos são lidos pela PESSOA dona da trilha. O `callAI` recebe o idioma dela como opção EXPLÍCITA:
 * `colaboradores.locale`, senão `empresas.default_locale`, senão pt-BR. Sem a opção o idioma era o do cookie de
 * quem clicou em "regerar" (a operação da Vertho, em pt-BR), e a pessoa de outro idioma recebia a semana nova no
 * idioma errado.
 */

const h = vi.hoisted(() => ({ state: {} as any, chamadas: [] as any[][] }));

vi.mock('@/lib/auth/protected-action', () => ({
  DomainError: class DomainError extends Error {
    codigo?: string;
    constructor(m: string, c?: string) { super(m); this.codigo = c; }
  },
  protectedAction: (_perm: any, schema: any, fn: any) => async (raw: any) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { success: false, error: 'Dados inválidos', code: 'VALIDATION' };
    try {
      return { success: true, data: await fn({ email: 'admin@test.com' }, parsed.data) };
    } catch (e: any) {
      return { success: false, error: String(e?.message ?? e) };
    }
  },
}));
vi.mock('@/lib/auth/action-context', () => ({
  requireAdminAction: async () => ({}),
  requireUserAction: async () => ({}),
  getAuthenticatedEmailFromAction: async () => null,
  assertTenantAccessAction: async () => {},
}));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => h.state.sb }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => h.state.sb }));
vi.mock('@/lib/repositories/trilhas-repo', () => ({
  findTrilhaComTenant: async () => h.state.trilha,
  updateTrilhaInTenant: async () => ({ id: 't1' }),
  updateSemanaProgressoInTenant: async () => 1,
}));
vi.mock('@/actions/ai-client', () => ({
  callAI: async (...args: any[]) => { h.chamadas.push(args); return 'Texto novo gerado pela IA.'; },
}));
vi.mock('@/lib/audit', () => ({ logAdminAction: async () => {} }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: async () => null, canViewColabJourney: async () => false }));

const POOL = [
  { id: 'cA', titulo: 'Conteúdo A', formato: 'texto', competencia: 'Autocuidado', descritor: 'D1', cargo: 'Professor', ativo: true, versao: 1, taxa_conclusao: 0.5 },
];

function sbMock() {
  const tabelas: Record<string, any> = {
    colaboradores: { single: { cargo: 'Professor', empresa_id: 'e1', locale: h.state.localePessoa ?? null } },
    empresas: { single: { segmento: 'Educação básica', default_locale: h.state.localeEmpresa ?? null } },
    micro_conteudos: { list: POOL },
    temporada_semana_progresso: { single: null },
  };
  const mk = (tabela: string) => {
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => { if (c === 'competencia') q._comp = v; return q; },
      is: () => q,
      or: () => q,
      maybeSingle: async () => ({ data: tabelas[tabela]?.single ?? null, error: null }),
      then: (resolve: any) => {
        const list = q._comp ? (tabelas[tabela]?.list ?? []).filter((x: any) => x.competencia === q._comp) : (tabelas[tabela]?.list ?? []);
        resolve({ data: list, error: null });
      },
    };
    return q;
  };
  // `rpc`, `auth` e `storage`: o `tenantDb` (usado para ler o idioma da pessoa) os expõe do client.
  return { from: mk, rpc: async () => ({ data: null, error: null }), auth: {}, storage: {} };
}

/** A semana 1 é de conteúdo (o desafio) e a 4 é de aplicação (a missão e o cenário), como no programa regular. */
function trilha() {
  return {
    id: 't1', colaborador_id: 'c1', empresa_id: 'e1', programa_modo: 'regular',
    competencia_foco: 'Autocuidado', competencias_foco: ['Autocuidado'],
    descritores_selecionados: [{ descritor: 'D1', competencia: 'Autocuidado' }, { descritor: 'D2', competencia: 'Autocuidado' }],
    temporada_plano: [
      {
        semana: 1, tipo: 'conteudo', competencia: 'Autocuidado', descritor: 'D1', descritores_cobertos: ['D1'], nivel_atual: 2,
        conteudo: { core_id: 'cA', core_titulo: 'Conteúdo A', core_url: null, formato_core: 'texto', core_reuso: false, formatos_disponiveis: { texto: { id: 'cA' } }, fallback_gerado: false, desafio_texto: 'VELHO' },
        status: 'disponivel',
      },
      { semana: 4, tipo: 'aplicacao', competencia: 'Autocuidado', descritores_cobertos: ['D1', 'D2'], status: 'disponivel' },
    ],
  };
}

const novo = (extra: any = {}) => {
  h.chamadas = [];
  h.state = { ...extra };
  h.state.trilha = trilha();
  h.state.sb = sbMock();
};

beforeEach(() => novo());

describe('regerarSemana: o texto novo sai no idioma da pessoa dona da trilha', () => {
  it('semana de conteúdo: o desafio recebe o idioma da pessoa', async () => {
    novo({ localePessoa: 'en-US', localeEmpresa: 'es-ES' });
    const { regerarSemana } = await import('@/actions/temporadas');
    const res: any = await regerarSemana({ trilhaId: 't1', semana: 1 });
    expect(res.success, res.error).toBe(true);
    expect(h.chamadas).toHaveLength(1);
    expect(h.chamadas[0][4]).toEqual({ locale: 'en-US' });
  });

  it('semana de aplicação: a missão e o cenário recebem o idioma da pessoa', async () => {
    novo({ localePessoa: 'es-ES' });
    const { regerarSemana } = await import('@/actions/temporadas');
    const res: any = await regerarSemana({ trilhaId: 't1', semana: 4 });
    expect(res.success, res.error).toBe(true);
    expect(h.chamadas).toHaveLength(2);
    for (const args of h.chamadas) expect(args[4]).toEqual({ locale: 'es-ES' });
  });

  it('pessoa sem idioma: o da empresa; sem idioma nenhum, pt-BR explícito', async () => {
    novo({ localeEmpresa: 'pt-PT' });
    const { regerarSemana } = await import('@/actions/temporadas');
    await regerarSemana({ trilhaId: 't1', semana: 1 });
    expect(h.chamadas[0][4]).toEqual({ locale: 'pt-PT' });

    novo();
    await regerarSemana({ trilhaId: 't1', semana: 1 });
    expect(h.chamadas[0][4]).toEqual({ locale: 'pt-BR' });
  });
});
