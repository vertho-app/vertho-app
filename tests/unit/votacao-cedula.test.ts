import { describe, it, expect, vi, beforeEach } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { montarCedula } from '@/lib/votacao/cedula';

/**
 * Cédula da votação = Top 10 do cargo (decisão do dono, 25/09/2026).
 *
 * Os dados imitam a 4Life no dia da decisão: a Top 10 do Professor(a) vem na
 * ORDEM DA IA (Ação Pedagógica em 1º), o Auxiliar tem matriz e não tem Top 10,
 * e a matriz tem uma linha por DESCRITOR (6 por competência).
 */

const PROF = 'Professor(a) de Educação Infantil';
const AUX = 'Auxiliar de Desenvolvimento Infantil';

const comp = (cod: string, nome: string) => ({ nome, cod_comp: cod, descricao: `Descrição de ${nome}`, pilar: null });

// Top 10 do Professor na ordem em que a IA1 gravou (posição 1..10).
const TOP10_PROF_ORDEM_DA_IA = [
  comp('COO01', 'Ação Pedagógica'),
  comp('PRO06', 'Conhecimento do estudante e aprendizagem'),
  comp('PRO04', 'Condução de Grupos e Gestão de Sala'),
  comp('DIR11', 'Planejamento e Organização'),
  comp('DIR05', 'Comunicação'),
  comp('DIR08', 'Diversidade Inclusiva'),
  comp('PRO03', 'Interação com as Famílias'),
  comp('PRO05', 'Adaptação, Criatividade e Inovação'),
  comp('DIR04', 'Identidade Humana'),
  comp('DIR06', 'Gerenciamento de Conflitos'),
];
const TOP10_LINHAS = [
  ...TOP10_PROF_ORDEM_DA_IA.map((c) => ({ cargo: PROF, competencia: c })),
  // Top 10 de OUTRO cargo na mesma empresa: não pode vazar para a cédula do Professor.
  { cargo: 'Coordenação Pedagógica', competencia: comp('DIR09', 'Gerenciamento de Equipe') },
];

// Matriz: 16 competências do Professor e do Auxiliar, 6 linhas (descritores) cada.
const NOMES_MATRIZ = [
  ...TOP10_PROF_ORDEM_DA_IA,
  comp('DIR01', 'Autocuidado'), comp('DIR03', 'Aprendizado Contínuo'), comp('DIR12', 'Fluência Digital'),
  comp('DIR13', 'Consciência Organizacional e Jurídica'), comp('PRO01', 'Entusiasmo e Energia'),
  comp('PRO02', 'Trabalho em Equipe e Cooperação'),
];
const linhasDaMatriz = (cargo: string) =>
  NOMES_MATRIZ.flatMap((c) => Array.from({ length: 6 }, (_, i) => ({ ...c, cargo, cod_desc: `${c.cod_comp}-D0${i + 1}` })));
const MATRIZ = [...linhasDaMatriz(PROF), ...linhasDaMatriz(AUX)];

const ordemAlfabetica = (nomes: string[]) => [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));

describe('montarCedula (regra pura)', () => {
  it('cargo com Top 10: a cédula são as 10 da Top 10, em ordem alfabética e não na ordem da IA', () => {
    const c = montarCedula({ cargo: PROF, top10: TOP10_LINHAS, matriz: MATRIZ });
    expect(c.fonte).toBe('top10');
    const nomes = c.competencias.map((x) => x.nome);
    expect(nomes).toEqual(ordemAlfabetica(TOP10_PROF_ORDEM_DA_IA.map((x) => x.nome)));
    expect(nomes[0]).toBe('Ação Pedagógica'); // coincide no 1º; o resto prova a ordem:
    expect(nomes[1]).toBe('Adaptação, Criatividade e Inovação'); // era a 8ª da IA
    expect(nomes).not.toContain('Gerenciamento de Equipe'); // Top 10 de outro cargo
    expect(nomes).not.toContain('Autocuidado'); // está na matriz, fora da Top 10
  });

  it('cargo sem Top 10: cai na matriz inteira do cargo, uma entrada por competência', () => {
    const c = montarCedula({ cargo: AUX, top10: TOP10_LINHAS, matriz: MATRIZ });
    expect(c.fonte).toBe('matriz');
    expect(c.competencias).toHaveLength(16); // 96 linhas de descritor viram 16
    expect(c.competencias.map((x) => x.nome)).toEqual(ordemAlfabetica(NOMES_MATRIZ.map((x) => x.nome)));
  });

  it('nome do cargo da pessoa sem acento e em minúsculas casa com a Top 10', () => {
    const c = montarCedula({ cargo: '  professor(a) de educacao infantil ', top10: TOP10_LINHAS, matriz: [] });
    expect(c.fonte).toBe('top10');
    expect(c.competencias).toHaveLength(10);
  });

  it('competência repetida na Top 10 aparece uma vez; linha sem competência é ignorada', () => {
    const c = montarCedula({
      cargo: PROF,
      top10: [
        { cargo: PROF, competencia: comp('DIR05', 'Comunicação') },
        { cargo: PROF, competencia: comp('DIR05', 'Comunicação') },
        { cargo: PROF, competencia: null },
      ],
      matriz: MATRIZ,
    });
    expect(c.fonte).toBe('top10');
    expect(c.competencias.map((x) => x.nome)).toEqual(['Comunicação']);
  });

  it('pessoa sem cargo não recebe a matriz de ninguém', () => {
    expect(montarCedula({ cargo: null, top10: TOP10_LINHAS, matriz: MATRIZ }).competencias).toEqual([]);
  });
});

// ── A action que RODA: loadCompetenciasParaVotar e loadResultadosVotacao ────────

let cargoDaPessoa = PROF;
let votacaoAtiva = true;
let totalMatriz: number | null = MATRIZ.length;

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { sys_config: { votacao_ativa: votacaoAtiva } } : null),
  lista: (tabela) => {
    if (tabela === 'top10_cargos') return TOP10_LINHAS;
    if (tabela === 'competencias') return MATRIZ;
    if (tabela === 'colaboradores') {
      return [
        { id: 'p1', nome_completo: 'Ana Souza', cargo: PROF },
        { id: 'a1', nome_completo: 'Bia Lima', cargo: AUX },
      ];
    }
    return [];
  },
  contagem: (tabela) => (tabela === 'competencias' ? totalMatriz : null),
});

const registrarDegradacao = vi.fn(async () => {});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: async () => 'ana@escola.com',
  requireAdminAction: vi.fn(async () => ({})),
}));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: async () => ({ id: 'p1', nome_completo: 'Ana Souza', cargo: cargoDaPessoa, empresa_id: 'emp-4life' }),
}));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: async () => sb.client,
  requireEmpresaSupabase: async () => sb.client,
}));
vi.mock('@/lib/home/loaders', () => ({ carregarVotacaoStatus: vi.fn() }));
vi.mock('@/lib/degradacao', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/degradacao')>()),
  registrarDegradacao: (...args: any[]) => (registrarDegradacao as any)(...args),
}));

const { loadCompetenciasParaVotar, loadResultadosVotacao } = await import('@/actions/votacao');

beforeEach(() => {
  sb.reset();
  registrarDegradacao.mockClear();
  cargoDaPessoa = PROF;
  votacaoAtiva = true;
  totalMatriz = MATRIZ.length;
});

describe('loadCompetenciasParaVotar', () => {
  it('Professor(a): a cédula é a Top 10, sem ler a matriz', async () => {
    const r: any = await loadCompetenciasParaVotar();
    expect(r.error).toBeUndefined();
    expect(r.competencias.map((c: any) => c.nome)).toEqual(ordemAlfabetica(TOP10_PROF_ORDEM_DA_IA.map((x) => x.nome)));
    expect(sb.usou('top10_cargos', 'eq', 'empresa_id')).toBe(true);
    expect(sb.chamadas.some((c) => c.tabela === 'competencias')).toBe(false);
  });

  it('Auxiliar (sem Top 10): a cédula é a matriz inteira dele', async () => {
    cargoDaPessoa = AUX;
    const r: any = await loadCompetenciasParaVotar();
    expect(r.competencias).toHaveLength(16);
  });

  it('falha ao ler a Top 10 vira ERRO, nunca a matriz inteira', async () => {
    sb.falharEm({ tabela: 'top10_cargos', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await loadCompetenciasParaVotar();
    expect(r.error).toMatch(/Não foi possível carregar/);
    expect(r.competencias).toBeUndefined();
    expect(sb.chamadas.some((c) => c.tabela === 'competencias')).toBe(false);
  });

  it('matriz cortada pelo teto do PostgREST vira ERRO, nunca uma cédula menor', async () => {
    cargoDaPessoa = AUX;
    totalMatriz = MATRIZ.length + 500;
    const r: any = await loadCompetenciasParaVotar();
    expect(r.error).toMatch(/Não foi possível carregar/);
  });
});

describe('loadResultadosVotacao (aba Votação do admin)', () => {
  it('mostra a fonte da cédula de cada cargo', async () => {
    const r: any = await loadResultadosVotacao('emp-4life');
    expect(r.resultado[PROF].cedula).toEqual({ fonte: 'top10', total: 10 });
    expect(r.resultado[AUX].cedula).toEqual({ fonte: 'matriz', total: 16 });
  });

  it('votação aberta com cargo sem Top 10 registra a degradação, uma por cargo', async () => {
    await loadResultadosVotacao('emp-4life');
    expect(registrarDegradacao).toHaveBeenCalledTimes(1);
    expect((registrarDegradacao.mock.calls[0] as any[])[0]).toMatchObject({
      fluxo: 'votacao',
      tipo: 'cedula-sem-top10',
      chave: 'emp-4life:auxiliar de desenvolvimento infantil',
      empresaId: 'emp-4life',
    });
  });

  it('votação fechada não registra degradação (é configuração em andamento)', async () => {
    votacaoAtiva = false;
    await loadResultadosVotacao('emp-4life');
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });

  it('falha de leitura da Top 10: fonte desconhecida (null), nunca "sem Top 10"', async () => {
    sb.falharEm({ tabela: 'top10_cargos', op: 'select', mensagem: 'timeout no pool' });
    const r: any = await loadResultadosVotacao('emp-4life');
    expect(r.resultado[PROF].cedula).toBeNull();
    expect(r.resultado[AUX].cedula).toBeNull();
    expect(registrarDegradacao).not.toHaveBeenCalled();
  });
});
