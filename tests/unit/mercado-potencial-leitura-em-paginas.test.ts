import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';
import { limiteDaConsulta, resumoDaLeitura } from '@/lib/mercado-potencial/filtros';

/**
 * Mercado Potencial: as três consultas leem em PÁGINAS ordenadas pela chave, até o
 * limite pedido, e devolvem o total que existe no banco.
 *
 * Por quê: o PostgREST corta cada consulta em 1.000 linhas sem avisar, mesmo com
 * `.limit(6000)`. Medido em 15/10/2026: a aba Município sem filtro mostrava "Linhas
 * 1.000" de 5.571 (os cartões somavam só essas), e as 2 RMs de Campinas e Salvador
 * têm 4.632 escolas contra 1.000 na tela. Validado contra o banco real: município
 * 5.571 de 5.571, escola das 2 RMs 4.632 de 4.632, chaves únicas e em ordem.
 *
 * O banco fingido aqui respeita o `range` e o `count`, e cada pedido fica registrado:
 * o teste prova QUAIS intervalos foram pedidos, com que ordem, e onde o count foi pedido.
 */
const LINHAS = (n: number) => Array.from({ length: n }, (_, i) => ({
  municipio_ibge: String(3500000 + i).padStart(7, '0'), municipio: `Cidade ${i}`, uf: 'SP', rede: i % 2 ? 'PRIVADA' : 'MUNICIPAL',
  codigo_inep: String(35000000 + i), nome: `Escola ${i}`, qt_escolas: 1, qt_professores: 10 + (i % 7),
  qt_doc_0_24: 1, qt_docs_0_24: 1, qt_docs_jovens: 2, qt_docs_pos: 3, qt_gestores: 3,
  qt_coord_pedag: 1, qt_diretor_proxy: 1, inse_medio: 4, inse_efetivo: 4, inse_grupo: 4,
}));

let banco: any[] = [];
let sb = criarSupabaseMock();

const intervalo = (cadeia: Chamada[]): [number, number] => {
  const r = cadeia.find((c) => c.metodo === 'range');
  return r ? [r.args[0], r.args[1]] : [0, banco.length - 1];
};

function novoBanco(n: number) {
  banco = LINHAS(n);
  sb = criarSupabaseMock({
    lista: (_t, _c, cadeia) => { const [de, ate] = intervalo(cadeia); return banco.slice(de, Math.min(ate, de + 999, banco.length - 1) + 1); },
    contagem: () => banco.length,
  });
}

vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));

import { loadMercadoMunicipios, loadMercadoRedes, loadMercadoEscolas } from '@/app/admin/vertho/mercado-potencial/actions';

const VISOES = [
  { nome: 'município', tabela: 'diag_mv_mercado_municipio', carregar: loadMercadoMunicipios, padrao: 6000, teto: 10000, ordem: ['municipio_ibge'] },
  { nome: 'rede', tabela: 'diag_mv_mercado_rede', carregar: loadMercadoRedes, padrao: 8000, teto: 25000, ordem: ['municipio_ibge', 'rede'] },
  { nome: 'escola', tabela: 'diag_mv_mercado_escola', carregar: loadMercadoEscolas, padrao: 1000, teto: 10000, ordem: ['codigo_inep'] },
] as const;

const daTabela = (tabela: string) => sb.chamadas.filter((c) => c.tabela === tabela);
const ranges = (tabela: string) => daTabela(tabela).filter((c) => c.metodo === 'range').map((c) => [c.args[0], c.args[1]]);

beforeEach(() => novoBanco(0));

describe('Mercado Potencial: leitura em páginas', () => {
  for (const v of VISOES) {
    it(`${v.nome}: passa de 1.000 linhas (era o corte do PostgREST), em páginas e sem faltar linha`, async () => {
      novoBanco(2500);
      const r: any = await v.carregar({ limit: 3000 });
      expect(r.error).toBeUndefined();
      expect(r.rows).toHaveLength(2500);
      expect(new Set(r.rows.map((x: any) => x.id)).size).toBe(2500);
      expect(ranges(v.tabela)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
      expect(r.totalNoBanco).toBe(2500);
      expect(r.truncado).toBe(false);
    });

    it(`${v.nome}: cada página vai ordenada pela chave ANTES do range, e o count só na primeira`, async () => {
      novoBanco(2500);
      await v.carregar({ limit: 3000 });
      const cadeia = daTabela(v.tabela);
      const ordem = cadeia.filter((c) => c.metodo === 'order').map((c) => c.args[0]);
      expect(ordem).toEqual(Array(3).fill(v.ordem).flat());
      // por pedido: select -> filtros -> order(s) -> range
      const metodos = cadeia.map((c) => c.metodo);
      for (let i = 0, ult = -1; i < metodos.length; i++) {
        if (metodos[i] !== 'range') continue;
        const ordemAntes = metodos.slice(ult + 1, i).includes('order');
        expect(ordemAntes, `range na posição ${i} sem order antes`).toBe(true);
        ult = i;
      }
      const counts = cadeia.filter((c) => c.metodo === 'select').map((c) => c.args[1]?.count ?? null);
      expect(counts).toEqual(['exact', null, null]);
    });

    it(`${v.nome}: limite menor que o que existe CORTA e diz quanto havia (${v.padrao} é o padrão)`, async () => {
      novoBanco(4632);
      const r: any = await v.carregar({ limit: 1000 });
      expect(r.rows).toHaveLength(1000);
      expect(r.totalNoBanco).toBe(4632);
      expect(r.truncado).toBe(true);
      expect(ranges(v.tabela)).toEqual([[0, 999]]);
    });

    it(`${v.nome}: sem limit usa o padrão da visão; limit inválido também`, async () => {
      novoBanco(10);
      for (const limit of [undefined, 0, -5, NaN, 'abc'] as any[]) {
        sb.reset();
        await v.carregar({ limit });
        expect(ranges(v.tabela), String(limit)).toEqual([[0, Math.min(v.padrao, 999)]]);
      }
    });

    it(`${v.nome}: limit acima do teto da visão é cortado no teto (${v.teto})`, async () => {
      novoBanco(v.teto + 500);
      const r: any = await v.carregar({ limit: 999999 });
      expect(r.rows).toHaveLength(v.teto);
      expect(ranges(v.tabela).at(-1)).toEqual([v.teto - 1000, v.teto - 1]);
      expect(r.truncado).toBe(true);
    });

    it(`${v.nome}: banco vazio devolve zero linhas, sem erro e sem aviso de corte`, async () => {
      novoBanco(0);
      const r: any = await v.carregar({});
      expect(r.error).toBeUndefined();
      expect(r.rows).toEqual([]);
      expect(r.totalNoBanco).toBe(0);
      expect(r.truncado).toBe(false);
    });
  }

  it('a ordenação pelo score continua sendo feita sobre TODAS as linhas lidas', async () => {
    novoBanco(1500);
    const r: any = await loadMercadoEscolas({ limit: 1500 });
    const scores = r.rows.map((x: any) => x.score_completo);
    expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
  });
});

describe('limiteDaConsulta / resumoDaLeitura', () => {
  it('limite: pedido válido vale, inválido cai no padrão, e nunca passa do teto', () => {
    expect(limiteDaConsulta(3000, 1000, 10000)).toBe(3000);
    expect(limiteDaConsulta(undefined, 1000, 10000)).toBe(1000);
    for (const ruim of [0, -1, NaN, Infinity, 'abc', null]) expect(limiteDaConsulta(ruim, 1000, 10000), String(ruim)).toBe(1000);
    expect(limiteDaConsulta(99999, 1000, 10000)).toBe(10000);
    expect(limiteDaConsulta(1500.2, 1000, 10000)).toBe(1501);
  });

  it('com total, o corte é total > lidas; sem total, adivinha pelo teto ter sido atingido', () => {
    expect(resumoDaLeitura(1000, 4632, 1000)).toEqual({ total: 1000, totalNoBanco: 4632, truncado: true });
    expect(resumoDaLeitura(4632, 4632, 10000)).toEqual({ total: 4632, totalNoBanco: 4632, truncado: false });
    expect(resumoDaLeitura(1000, null, 1000)).toEqual({ total: 1000, totalNoBanco: null, truncado: true });
    expect(resumoDaLeitura(300, null, 1000)).toEqual({ total: 300, totalNoBanco: null, truncado: false });
    expect(resumoDaLeitura(0, 0, 1000).truncado).toBe(false);
  });
});

describe('Mercado Potencial: a tela mostra o corte e ignora resposta antiga', () => {
  const tela = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/page.tsx'), 'utf8');

  it('o aviso vem do servidor (truncado, com mostradas e total), não de comparar com o limite digitado', () => {
    expect(tela).toContain('leitura.truncado');
    expect(tela).toMatch(/t\('limitReached', \{ shown:[^}]*total:/);
    expect(tela).not.toMatch(/rows\.length >= limiteEfetivo/);
  });

  it('só o pedido mais recente atualiza a tela', () => {
    expect(tela).toMatch(/const meu = \+\+pedido\.current/);
    expect(tela).toMatch(/if \(meu !== pedido\.current\) return;/);
  });
});
