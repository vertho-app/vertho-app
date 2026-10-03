import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bancoEmMemoria, type Tabelas } from '../helpers/tabelas-em-memoria';

/**
 * R-83 (revisão de 02/10/2026): a IA1 apagava o Top 10 do cargo ANTES de chamar
 * a IA e respondia "IA1 concluída" mesmo quando a IA falhava, devolvia JSON
 * inválido ou nada casava com a matriz. O cargo ficava sem Top 10 (e a cédula da
 * votação caía na matriz inteira) sem ninguém saber. Agora a seleção nova é
 * montada inteira antes; só então substitui. Banco em memória: a prova é o
 * conteúdo de `top10_cargos` depois da chamada.
 */

const NOMES = Array.from({ length: 12 }, (_, i) => `Competência ${i + 1}`);
let tabelas: Tabelas;
let sb: ReturnType<typeof bancoEmMemoria>;
const ia = { resposta: '' as string | Error };

function montar() {
  tabelas = {
    empresas: [{ id: 'emp', nome: 'Escola X', segmento: 'educacao', ppp_texto: null, sys_config: {} }],
    competencias: NOMES.map((nome, i) => ({ id: `c-${i + 1}`, empresa_id: 'emp', nome, descricao: null, cod_comp: `C${i + 1}`, pilar: null, cargo: 'Professor' })),
    cargos_empresa: [{ id: 'cg', empresa_id: 'emp', nome: 'Professor' }],
    top10_cargos: [
      { id: 't-old-1', empresa_id: 'emp', cargo: 'Professor', competencia_id: 'c-11', posicao: 1 },
      { id: 't-old-2', empresa_id: 'emp', cargo: 'Professor', competencia_id: 'c-12', posicao: 2 },
    ],
  };
  sb = bancoEmMemoria(tabelas);
}

vi.mock('@/lib/tenant-db', () => ({ tenantDb: () => sb.client }));
vi.mock('@/lib/admin-supabase', () => ({
  requireAdminSupabase: vi.fn(async () => sb.client),
  requireEmpresaSupabase: vi.fn(async () => sb.client),
  requireLinhaSupabase: vi.fn(),
}));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({})) }));
vi.mock('@/lib/ia2-gabarito', () => ({
  buscarContextoPPP: vi.fn(async () => ''),
  buscarValores: vi.fn(async () => []),
  carregarContextoIA2: vi.fn(), montarPromptIA2: vi.fn(), validarGabaritoIA2: vi.fn(),
  persistirGabaritoIA2: vi.fn(), gerarGabaritosIA2Core: vi.fn(),
}));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async () => {
    if (ia.resposta instanceof Error) throw ia.resposta;
    return ia.resposta;
  }),
}));

import { rodarIA1 } from '@/actions/fase1';

const selecao = (n: number) => JSON.stringify({
  top10: Array.from({ length: n }, (_, i) => ({ id: `C${i + 1}`, nome: NOMES[i], posicao: i + 1, confianca: 0.8 })),
});
const top10Atual = () => tabelas.top10_cargos.filter((t) => t.cargo === 'Professor').map((t) => t.competencia_id).sort();
const ANTIGO = ['c-11', 'c-12'];

beforeEach(() => {
  montar();
  ia.resposta = '';
});

describe('IA1: o Top 10 só é trocado quando há seleção nova', () => {
  it('seleção válida: substitui o Top 10 do cargo e responde sucesso', async () => {
    ia.resposta = selecao(10);
    const r: any = await rodarIA1('emp');
    expect(r.success).toBe(true);
    expect(top10Atual()).toEqual(NOMES.slice(0, 10).map((_, i) => `c-${i + 1}`).sort());
  });

  it('a IA lança: o Top 10 anterior fica, e a resposta é falha que nomeia o cargo', async () => {
    ia.resposta = new Error('provedor fora');
    const r: any = await rodarIA1('emp');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Professor: a IA falhou/);
    expect(top10Atual()).toEqual(ANTIGO);
  });

  it('JSON inválido: o Top 10 anterior fica, e a resposta é falha', async () => {
    ia.resposta = 'não é json';
    const r: any = await rodarIA1('emp');
    expect(r.success).toBe(false);
    expect(top10Atual()).toEqual(ANTIGO);
  });

  it('nada casa com a matriz do cargo: o Top 10 anterior fica, e a resposta é falha', async () => {
    ia.resposta = JSON.stringify({ top10: Array.from({ length: 8 }, (_, i) => ({ id: `X${i}`, nome: `Inexistente ${i}` })) });
    const r: any = await rodarIA1('emp');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/nenhuma competência da seleção casou/);
    expect(top10Atual()).toEqual(ANTIGO);
  });

  it('o insert da seleção nova falha: o Top 10 anterior é devolvido', async () => {
    ia.resposta = selecao(10);
    // Só a seleção NOVA falha (linhas sem id); a devolução das antigas (com id) passa.
    sb.falharEm({ tabela: 'top10_cargos', op: 'insert', mensagem: 'violação de unicidade', quando: (p) => Array.isArray(p) && !p[0]?.id });
    const r: any = await rodarIA1('emp');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/o Top 10 anterior foi restaurado/);
    expect(top10Atual()).toEqual(ANTIGO);
  });

  it('falha ao ler as competências não vira "nenhuma competência cadastrada"', async () => {
    sb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'pool esgotado' });
    const r: any = await rodarIA1('emp');
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/pool esgotado/);
    expect(top10Atual()).toEqual(ANTIGO);
  });
});
