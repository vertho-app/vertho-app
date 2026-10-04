import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-101 (2): a prontidão do piloto ("pode liberar?") tem de olhar o que a
 * GERAÇÃO olha.
 *
 * Duas lacunas, as duas medidas no código de 02/10/2026:
 *  - ela decidia "quem resolveria para piloto/personalizado" pelo override da
 *    pessoa e pela empresa, e ignorava a turma, que a geração respeita. Com a
 *    turma no Personalizado e a empresa na Jornada, o painel dizia "nenhum
 *    colaborador" para uma safra que a geração trataria como Personalizado;
 *  - ela contava conteúdo SEM os filtros da geração: contava o conteúdo de kit
 *    (é de UM DISC e só sai pelo overlay) e o de OUTRO cargo (competência é
 *    única por cargo), e dizia "pronto" onde a semana nasceria com fallback.
 *
 * Validado por mutação (ver o relatório): voltar a `resolverModoColab` derruba
 * o caso da turma; tirar o filtro de cargo derruba o caso "conteúdo de outro cargo".
 */

let sbRaw = criarSupabaseMock();
let tdb = criarSupabaseMock();

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
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => sbRaw.client,
  requireEmpresaSupabase: async () => sbRaw.client,
}));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => tdb.client }));
vi.mock('@/lib/authz', () => ({ findColabByEmail: async () => null, canViewColabJourney: async () => false }));
vi.mock('@/lib/repositories/trilhas-repo', () => ({
  findTrilhaComTenant: async () => null,
  updateTrilhaInTenant: async () => null,
  updateSemanaProgressoInTenant: async () => 0,
}));

import { verificarProntidaoPiloto } from '@/actions/temporadas';

let empresaSysConfig: any;
let colabs: any[];
let membros: any[];
let turmas: any[];
let conteudos: any[];

const D = (n: number, nota = 1.8) => ({ colaborador_id: 'c1', competencia: 'Liderança', descritor: `D${n}`, nota });

function montar() {
  sbRaw = criarSupabaseMock({
    resolver: (tabela) => (tabela === 'empresas' ? { sys_config: empresaSysConfig } : null),
    lista: (tabela) => {
      if (tabela === 'turma_membros') return membros;
      if (tabela === 'turmas') return turmas;
      if (tabela === 'micro_conteudos') return conteudos;
      return [];
    },
  });
  tdb = criarSupabaseMock({
    lista: (tabela) => {
      if (tabela === 'colaboradores') return colabs;
      if (tabela === 'trilhas') return [{ colaborador_id: 'c1', competencia_foco: 'Liderança', criado_em: '2026-10-01' }];
      if (tabela === 'cargos_empresa') return [{ nome: 'Coordenador', competencia_foco: 'Liderança' }];
      if (tabela === 'descriptor_assessments') return [D(1), D(2), D(3)];
      if (tabela === 'banco_cenarios') return [{ cargo: 'Coordenador' }];
      return [];
    },
  });
}

beforeEach(() => {
  empresaSysConfig = { programa_modo: 'jornada', programa_custom: { semanas: 3, numCompetencias: 1, fechamento: false } };
  colabs = [{ id: 'c1', nome_completo: 'Ana', cargo: 'Coordenador', programa_modo: null }];
  membros = [];
  turmas = [];
  conteudos = [
    { descritor: 'D1', formato: 'texto', cargo: 'Coordenador' },
    { descritor: 'D2', formato: 'video', cargo: null },
    { descritor: 'D3', formato: 'texto', cargo: 'todos' },
  ];
  montar();
});

describe('prontidão: quem a geração trataria como Personalizado, turma inclusive', () => {
  it('🔴 a turma no Personalizado entra na prontidão, mesmo com a empresa na Jornada', async () => {
    membros = [{ colaborador_id: 'c1', turma_id: 't1', config_override: {} }];
    turmas = [{ id: 't1', sys_config: { programa_modo: 'custom' } }];
    montar();
    const r: any = await verificarProntidaoPiloto({ empresaId: 'emp-1' });
    expect(r.success).toBe(true);
    expect(r.data.total).toBe(1);
    expect(r.data.resultados[0]).toMatchObject({ colaborador: 'Ana', modo: 'custom', pronto: true });
  });

  it('sem turma, a empresa na Jornada não tem ninguém para verificar (o aviso diz o porquê)', async () => {
    const r: any = await verificarProntidaoPiloto({ empresaId: 'emp-1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Nenhum colaborador resolveria/);
    expect(r.error).toMatch(/de turma/);
  });

  it('o override da pessoa vale quando a turma não define o formato (a precedência da geração)', async () => {
    colabs = [{ id: 'c1', nome_completo: 'Ana', cargo: 'Coordenador', programa_modo: 'custom' }];
    membros = [{ colaborador_id: 'c1', turma_id: 't1', config_override: {} }];
    turmas = [{ id: 't1', sys_config: { cadencia: { fase4_dia_pilula: 3 } } }];
    montar();
    const r: any = await verificarProntidaoPiloto({ empresaId: 'emp-1' });
    expect(r.success).toBe(true);
    expect(r.data.resultados[0].modo).toBe('custom');
  });

  it('🔴 falha ao ler as turmas FALHA a prontidão (não cai na config da empresa em silêncio)', async () => {
    sbRaw.falharEm({ tabela: 'turma_membros', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await verificarProntidaoPiloto({ empresaId: 'emp-1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/participações/);
  });
});

describe('prontidão: conteúdo pelos MESMOS filtros da geração', () => {
  const customNaTurma = () => {
    membros = [{ colaborador_id: 'c1', turma_id: 't1', config_override: {} }];
    turmas = [{ id: 't1', sys_config: { programa_modo: 'custom' } }];
  };

  it('pergunta só por conteúdo ativo e FORA de kit (kit_id e disc nulos), como `montarSemanaConteudo`', async () => {
    customNaTurma();
    montar();
    await verificarProntidaoPiloto({ empresaId: 'emp-1' });
    expect(sbRaw.usou('micro_conteudos', 'eq', 'ativo')).toBe(true);
    expect(sbRaw.usou('micro_conteudos', 'is', 'kit_id')).toBe(true);
    expect(sbRaw.usou('micro_conteudos', 'is', 'disc')).toBe(true);
  });

  it('🔴 conteúdo de OUTRO cargo não conta: sem conteúdo servível, é bloqueador, não "pronto"', async () => {
    customNaTurma();
    conteudos = [
      { descritor: 'D1', formato: 'texto', cargo: 'Diretor' },
      { descritor: 'D2', formato: 'video', cargo: 'Diretor' },
      { descritor: 'D3', formato: 'texto', cargo: 'Diretor' },
    ];
    montar();
    const r: any = await verificarProntidaoPiloto({ empresaId: 'emp-1' });
    expect(r.success).toBe(true);
    const ana = r.data.resultados[0];
    expect(ana.pronto).toBe(false);
    expect(ana.bloqueadores.join(' ')).toMatch(/SEM formato-core/);
  });

  it('conteúdo do cargo da pessoa, ou genérico (sem cargo / "todos"), conta', async () => {
    customNaTurma();
    montar();
    const r: any = await verificarProntidaoPiloto({ empresaId: 'emp-1' });
    expect(r.data.resultados[0].pronto).toBe(true);
  });

  it('falha ao ler os conteúdos NÃO vira "pool vazio": a prontidão falha em vez de bloquear por engano', async () => {
    customNaTurma();
    montar();
    sbRaw.falharEm({ tabela: 'micro_conteudos', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await verificarProntidaoPiloto({ empresaId: 'emp-1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Falha ao ler os conteúdos/);
  });
});
