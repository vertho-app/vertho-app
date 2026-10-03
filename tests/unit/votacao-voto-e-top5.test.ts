import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * R-83 (revisão de 02/10/2026): na votação,
 *  · `salvarVoto` aceitava qualquer lista de 5 nomes: com a votação fechada,
 *    fora da cédula da pessoa e com repetição (um nome em duas posições soma
 *    pontos duas vezes no ranking);
 *  · `aprovarTop5Votacao` respondia "aprovada" quando o nome do cargo (vindo do
 *    agrupamento das PESSOAS) não casava o cadastro: o update não tocava linha
 *    nenhuma e o Top 5 não era gravado.
 * "Não gravou" se prova por `sb.escritas`, não pela mensagem.
 */

const CEDULA = ['Comunicação', 'Didática', 'Gestão de Sala', 'Interação com as Famílias', 'Planejamento', 'Avaliação'];
const estado = { votacaoAtiva: true, updateNaoCasa: false, cadastro: [{ id: 'cg-1', nome: 'Coordenação Pedagógica' }] as any[] };

const sb = criarSupabaseMock({
  resolver: (tabela) => (tabela === 'empresas' ? { sys_config: { votacao_ativa: estado.votacaoAtiva } } : null),
  lista: (tabela) => {
    if (tabela === 'top10_cargos') return CEDULA.map((nome) => ({ cargo: 'Professor(a)', competencia: { nome, cod_comp: null, descricao: null, pilar: null } }));
    if (tabela === 'cargos_empresa') return estado.cadastro.map((c) => ({ nome: c.nome }));
    return [];
  },
  // O update devolve as linhas que o `.eq('nome', …)` casaria no cadastro.
  escrita: (tabela, op, _payload, cadeia) => {
    if (tabela !== 'cargos_empresa' || op !== 'update') return null;
    if (estado.updateNaoCasa) return [];
    const nome = cadeia.find((c) => c.metodo === 'eq' && c.args[0] === 'nome')?.args[1];
    return estado.cadastro.filter((c) => c.nome === nome).map((c) => ({ id: c.id }));
  },
});

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('next/headers', () => ({ headers: async () => new Map() }));
vi.mock('@/lib/authz', () => ({
  findColabByEmail: vi.fn(async () => ({ id: 'colab-1', nome_completo: 'Ana', cargo: 'Professor(a)', empresa_id: 'emp' })),
}));
vi.mock('@/lib/auth/action-context', () => ({
  getAuthenticatedEmailFromAction: vi.fn(async () => 'ana@escola.com'),
  requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })),
}));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(), requireEmpresaSupabase: vi.fn() }));
vi.mock('@/lib/home/loaders', () => ({ carregarVotacaoStatus: vi.fn() }));
vi.mock('@/lib/sys-config-escrita', () => ({ gravarSysConfig: vi.fn() }));

import { salvarVoto, loadCompetenciasParaVotar, aprovarTop5Votacao } from '@/actions/votacao';

const votos = () => sb.escritas.filter((e) => e.tabela === 'votacao_competencias');
const top5Gravados = () => sb.escritas.filter((e) => e.tabela === 'cargos_empresa');

beforeEach(() => {
  sb.reset();
  estado.votacaoAtiva = true;
  estado.updateNaoCasa = false;
  estado.cadastro = [{ id: 'cg-1', nome: 'Coordenação Pedagógica' }];
});

describe('salvarVoto: a mesma porta da tela', () => {
  it('voto válido: 5 nomes da cédula, sem repetição, é gravado na ordem', async () => {
    const r: any = await salvarVoto(CEDULA.slice(0, 5));
    expect(r.success).toBe(true);
    expect(votos()).toHaveLength(1);
    expect(votos()[0].payload.competencias_escolhidas).toEqual(CEDULA.slice(0, 5));
  });

  it('votação fechada: recusa com código e NÃO grava', async () => {
    estado.votacaoAtiva = false;
    const r: any = await salvarVoto(CEDULA.slice(0, 5));
    expect(r).toMatchObject({ code: 'VOTACAO_FECHADA' });
    expect(votos()).toHaveLength(0);
  });

  it('nome fora da cédula da pessoa: recusa e NÃO grava', async () => {
    const r: any = await salvarVoto([...CEDULA.slice(0, 4), 'Competência inventada']);
    expect(r).toMatchObject({ code: 'VOTO_FORA_DA_CEDULA' });
    expect(votos()).toHaveLength(0);
  });

  it('repetição (o mesmo nome em duas posições): recusa e NÃO grava', async () => {
    const r: any = await salvarVoto([CEDULA[0], CEDULA[1], CEDULA[2], CEDULA[3], CEDULA[0]]);
    expect(r).toMatchObject({ code: 'VOTO_REPETIDO' });
    expect(votos()).toHaveLength(0);
  });

  it('falha ao ler a empresa não vira "votação fechada": diz que falhou e NÃO grava', async () => {
    sb.falharEm({ tabela: 'empresas', op: 'select', mensagem: 'timeout' });
    const r: any = await salvarVoto(CEDULA.slice(0, 5));
    expect(r).toMatchObject({ code: 'VOTACAO_INDISPONIVEL' });
    expect(votos()).toHaveLength(0);
  });

  it('a tela recebe a mesma recusa (votação fechada) da mesma fonte', async () => {
    estado.votacaoAtiva = false;
    expect(await loadCompetenciasParaVotar()).toMatchObject({ code: 'VOTACAO_FECHADA' });
  });
});

describe('aprovarTop5Votacao: falha alto quando não grava', () => {
  const TOP = CEDULA.slice(0, 5);

  it('nome do cargo com caixa e acento diferentes do cadastro: grava no cadastro certo', async () => {
    const r: any = await aprovarTop5Votacao('emp', 'coordenacao pedagogica', TOP);
    expect(r.success).toBe(true);
    expect(top5Gravados()).toHaveLength(1);
    expect(r.message).toContain('Coordenação Pedagógica');
  });

  it('cargo sem cadastro: success false e NADA gravado (antes: "aprovada")', async () => {
    const r: any = await aprovarTop5Votacao('emp', 'Cargo que não existe', TOP);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/não está cadastrado/);
    expect(top5Gravados()).toHaveLength(0);
  });

  it('dois cadastros que normalizam igual: ambíguo, success false e NADA gravado', async () => {
    estado.cadastro = [{ id: 'a', nome: 'Professor' }, { id: 'b', nome: 'professor ' }];
    const r: any = await aprovarTop5Votacao('emp', 'PROFESSOR', TOP);
    expect(r.success).toBe(false);
    expect(top5Gravados()).toHaveLength(0);
  });

  it('update que não casa linha nenhuma (cadastro sumiu entre a leitura e a escrita) é falha, não sucesso', async () => {
    estado.updateNaoCasa = true;
    const r: any = await aprovarTop5Votacao('emp', 'Coordenação Pedagógica', TOP);
    expect(top5Gravados()).toHaveLength(1); // o update foi tentado
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Nenhum cargo .* foi atualizado/);
  });
});
