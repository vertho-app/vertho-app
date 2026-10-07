import { describe, it, expect, beforeEach, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Andamento da base: o agrupamento por cargo não pode conter a equipe Vertho.
 *
 * Medido 06/10/2026 na 4Life: a tela somava 27 pessoas e 3 eram contas
 * `@vertho.ai`. Os NÚMEROS saem de `carregarPanoramaRH` (que corta a equipe por
 * id); este teste protege o outro lado: os `colaboradorIds` que o agrupamento
 * entrega a ele, e que um cargo só com equipe não vire grupo de 0 pessoas.
 */

const sb = criarSupabaseMock({
  lista: (tabela) => {
    if (tabela === 'empresas') return [{ id: 'emp-1', nome: '4Life Educação', is_demo: false }];
    if (tabela === 'colaboradores') {
      return [
        { id: 'a', cargo: 'Professor(a)', role: 'colaborador', email: 'ana@gmail.com' },
        { id: 'b', cargo: 'Professor(a)', role: 'colaborador', email: 'bia@hotmail.com' },
        // Equipe no MESMO cargo dos reais e num cargo só dela.
        { id: 'c', cargo: 'Professor(a)', role: 'colaborador', email: 'rodrigo@vertho.ai' },
        { id: 'd', cargo: 'Coordenação', role: 'colaborador', email: 'simone@VERTHO.AI' },
        // Persona de demo não é equipe.
        { id: 'e', cargo: 'Coordenação', role: 'colaborador', email: 'carla.demo@vertho.ai' },
      ];
    }
    return [];
  },
});

const chamadasPanorama: Array<{ empresaId: string; ids: string[] | null; turma: string | null }> = [];

// Turmas do tenant (ativas E encerradas) e o escopo de leitura de cada uma; os testes de "por turma" trocam.
let TURMAS: any[] = [];
let ESCOPOS: Record<string, string[]> = {};

vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: async () => sb.client }));
vi.mock('@/lib/turmas/escopo-leitura', () => ({
  listarTurmasParaFiltro: async () => TURMAS,
  resolverEscopoDeLeitura: async (_sb: unknown, _empresaId: string, turmaId: string) => ({
    turmaId, turmaNome: turmaId, turmaStatus: 'x', colaboradorIds: ESCOPOS[turmaId] || [], participacaoPorColab: new Map(),
  }),
}));
vi.mock('@/lib/home/loaders', () => ({
  carregarPanoramaRH: async (empresaId: string, opts: { colaboradorIds?: string[] | null; escopoTurma?: { turmaId: string } | null } = {}) => {
    const ids = opts.colaboradorIds ?? null;
    chamadasPanorama.push({ empresaId, ids, turma: opts.escopoTurma?.turmaId ?? null });
    return {
      pessoas: ids ? ids.length : 3,
      comPerfil: 0,
      comMapeamento: 0,
      progressoMapeamento: [],
      emJornada: 0,
      indisponivel: false,
    };
  },
}));
import { carregarAndamentoEmpresas } from '@/lib/admin/andamento-empresas';

describe('andamento da base: equipe Vertho fora do agrupamento', () => {
  beforeEach(() => { sb.reset(); chamadasPanorama.length = 0; TURMAS = []; ESCOPOS = {}; });

  it('por cargo, o grupo recebe só os ids de quem NÃO é da equipe', async () => {
    const [empresa] = await carregarAndamentoEmpresas('cargo');
    const porRotulo = new Map(empresa.grupos.map((g) => [g.rotulo, g.pessoas]));
    expect(porRotulo.get('Professor(a)')).toBe(2);
    const idsDosGrupos = chamadasPanorama.filter((c) => c.ids).flatMap((c) => c.ids as string[]).sort();
    expect(idsDosGrupos).toEqual(['a', 'b', 'e']);
    expect(idsDosGrupos).not.toContain('c');
    expect(idsDosGrupos).not.toContain('d');
  });

  it('cargo que só tinha equipe não vira grupo de 0 pessoas, e a persona .demo@ conta', async () => {
    const [empresa] = await carregarAndamentoEmpresas('cargo');
    // 'Coordenação' tem a equipe (d) e uma persona demo (e): sobra 1, não 0.
    expect(empresa.grupos.find((g) => g.rotulo === 'Coordenação')?.pessoas).toBe(1);
    expect(empresa.grupos.every((g) => g.pessoas > 0)).toBe(true);
  });
});

describe('andamento da base: recorte por TURMA (07/10/2026)', () => {
  beforeEach(() => {
    sb.reset(); chamadasPanorama.length = 0;
    // Ibipeba em miniatura: a Turma 1 passou todo mundo para a Temporada 2 (0 ativos, 2 encerrados).
    TURMAS = [
      { id: 'T1', nome: 'Turma 1', status: 'em_jornada', ativos: 0, encerrados: 2, encerrada: false },
      { id: 'T2', nome: 'Temporada 2', status: 'diagnostico', ativos: 2, encerrados: 0, encerrada: false },
    ];
    // O escopo inclui a conta da equipe (c) de propósito: ela tem que ficar de fora do grupo.
    ESCOPOS = { T1: ['a', 'b', 'c'], T2: ['a', 'b', 'c'] };
  });

  it('a turma que passou todo mundo adiante continua como grupo "(encerrada)", com os números do período', async () => {
    const [empresa] = await carregarAndamentoEmpresas('turma');
    const porRotulo = new Map(empresa.grupos.map((g) => [g.rotulo, g.pessoas]));
    expect(porRotulo.get('Turma 1 (encerrada)')).toBe(2);
    expect(porRotulo.get('Temporada 2')).toBe(2);
    expect(porRotulo.has('Turma 1')).toBe(false);
  });

  it('cada grupo chama o panorama com o escopo da PRÓPRIA turma (a nova não herda a jornada da antiga)', async () => {
    await carregarAndamentoEmpresas('turma');
    const turmasChamadas = chamadasPanorama.filter((c) => c.ids && c.turma).map((c) => c.turma).sort();
    expect(turmasChamadas).toEqual(['T1', 'T2']);
    // O grupo "Sem turma" (a persona demo, que não está em nenhuma) não carrega escopo de turma.
    expect(chamadasPanorama.filter((c) => c.ids && !c.turma)).toHaveLength(1);
  });

  it('a equipe Vertho continua fora do grupo da turma', async () => {
    await carregarAndamentoEmpresas('turma');
    const ids = chamadasPanorama.filter((c) => c.ids).flatMap((c) => c.ids as string[]);
    expect(ids).not.toContain('c');
  });

  it('quem não está em nenhuma turma vai para "Sem turma"', async () => {
    ESCOPOS = { T1: ['a'], T2: ['a'] };
    const [empresa] = await carregarAndamentoEmpresas('turma');
    const semTurma = empresa.grupos.find((g) => g.rotulo === 'Sem turma');
    // b (real) e e (persona demo): c e d são da equipe e não entram em grupo nenhum.
    expect(semTurma?.pessoas).toBe(2);
  });
});
