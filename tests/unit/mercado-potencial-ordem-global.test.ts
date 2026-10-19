import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';
import { linhaDeEscola, linhaDeMunicipio, linhaDeRede } from '@/lib/mercado-potencial/linhas';
import {
  ORDENS, argsDasLinhas, contagemConfere, linhasDoRpc, normalizarOrdem, ordemConfere, ordenarLinhas,
} from '@/lib/mercado-potencial/ordem-global';
import { argsDoFiltro } from '@/lib/mercado-potencial/totais';

/**
 * Mercado Potencial: a tabela traz as N primeiras do FILTRO INTEIRO na ordem escolhida.
 *
 * Por quê: a action lia as N primeiras pela CHAVE e só então ordenava. Medido em 19/10/2026,
 * com 25.540 escolas e limite 1.000, a tabela "por score" eram as 1.000 de menor INEP. A ordem
 * agora vem do banco (`mercado_potencial_linhas`, mig 293), que espelha `ordenarLinhas` +
 * `calcularMercadoScores`. Provado contra o banco real em 19/10/2026: 19 combinações das 3
 * visões (score, nome com acento, empates de qt_escolas, INSE nulo, asc e desc, idade 24 e 29,
 * preços fora do padrão, Brasil inteiro) deram as MESMAS N chaves, na mesma ordem, que o sort
 * do TS sobre o filtro inteiro lido pelo PostgREST.
 *
 * Aqui: o contrato TS (parâmetros, formato, conferências), os dois caminhos da action (ordem do
 * banco e leitura por chave) e o guard que amarra a fórmula do TS à função SQL.
 */

const LINHAS = (n: number) => Array.from({ length: n }, (_, i) => ({
  municipio_ibge: String(3500000 + i).padStart(7, '0'), municipio: `Cidade ${i}`, uf: i % 3 ? 'SP' : 'MG', rede: i % 2 ? 'PRIVADA' : 'MUNICIPAL',
  codigo_inep: String(35000000 + i), nome: `Escola ${(i * 7919) % 1000}`, qt_escolas: 1 + (i % 3), qt_professores: 10 + ((i * 31) % 47),
  qt_doc_0_24: i % 2, qt_docs_0_24: i % 2, qt_docs_jovens: 2 + (i % 5), qt_docs_pos: (i * 13) % 9, qt_gestores: 3 + (i % 4),
  qt_coord_pedag: i % 3, qt_diretor_proxy: 1, inse_medio: i % 11 ? 1 + (i % 6) : null, inse_efetivo: i % 11 ? 1 + (i % 6) : null, inse_grupo: 4,
}));

const VISOES = [
  { nome: 'município', visao: 'municipio', tabela: 'diag_mv_mercado_municipio', linha: linhaDeMunicipio },
  { nome: 'rede', visao: 'rede', tabela: 'diag_mv_mercado_rede', linha: linhaDeRede },
  { nome: 'escola', visao: 'escola', tabela: 'diag_mv_mercado_escola', linha: linhaDeEscola },
] as const;

let banco: any[] = [];
let sb = criarSupabaseMock();
let rpcLinhas: (args: any) => any = () => ({ data: null, error: null });

function novoBanco(n: number, contagem?: () => number) {
  banco = LINHAS(n);
  sb = criarSupabaseMock({
    lista: (_t, _c, cadeia: Chamada[]) => {
      const r = cadeia.find((c) => c.metodo === 'range');
      const [de, ate] = r ? [r.args[0], r.args[1]] : [0, banco.length - 1];
      return banco.slice(de, Math.min(ate, de + 999, banco.length - 1) + 1);
    },
    contagem: contagem ?? (() => banco.length),
  });
  sb.client.rpc.mockImplementation(async (nome: string, args: any) => (nome === 'mercado_potencial_linhas' ? rpcLinhas(args) : { data: null, error: null }));
}

/** O que o SQL devolveria: as N primeiras do banco inteiro na ordem do TS (provado igual no banco real). */
function comoOSql(v: typeof VISOES[number], filtros: any, limite: number) {
  const ordem = normalizarOrdem(filtros);
  const porId = new Map(banco.map((r) => [v.linha(r, filtros).id, r]));
  const ordenadas = ordenarLinhas(banco.map((r) => v.linha(r, filtros)), ordem).slice(0, limite);
  return { data: { total: banco.length, linhas: ordenadas.map((l) => porId.get(l.id)) }, error: null };
}

vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));

import { loadMercadoEscolas, loadMercadoMunicipios, loadMercadoRedes } from '@/app/admin/vertho/mercado-potencial/actions';

const CARREGAR = { municipio: loadMercadoMunicipios, rede: loadMercadoRedes, escola: loadMercadoEscolas } as const;
const ranges = (tabela: string) => sb.chamadas.filter((c) => c.tabela === tabela && c.metodo === 'range');

beforeEach(() => {
  rpcLinhas = () => ({ data: null, error: null });
  novoBanco(0);
});

describe('normalizarOrdem', () => {
  it('só as colunas da tela; qualquer outra vira score, e a direção padrão é desc', () => {
    expect(normalizarOrdem({})).toEqual({ orderBy: 'score_completo', orderDir: 'desc' });
    expect(normalizarOrdem({ orderBy: 'nome', orderDir: 'asc' })).toEqual({ orderBy: 'nome', orderDir: 'asc' });
    for (const ruim of ['score_base', 'id', 'codigo_inep; drop', 42, null]) {
      expect(normalizarOrdem({ orderBy: ruim }).orderBy, String(ruim)).toBe('score_completo');
    }
    expect(normalizarOrdem({ orderDir: 'ASC' }).orderDir).toBe('desc');
  });

  it('a lista é a dos cabeçalhos ordenáveis da página', () => {
    const tela = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/page.tsx'), 'utf8');
    const colunas = [...tela.matchAll(/<Th [^>]*coluna="(\w+)"/g)].map((m) => m[1]);
    expect([...new Set(colunas)].sort()).toEqual([...ORDENS].sort());
  });
});

describe('ordenarLinhas (o sort da tela)', () => {
  it('nulo vale -Infinity: por último no desc, primeiro no asc', () => {
    const r2 = [{ id: 'a', inse_medio: 2 }, { id: 'b', inse_medio: null }, { id: 'c', inse_medio: 5 }];
    expect(ordenarLinhas([...r2], { orderBy: 'inse_medio', orderDir: 'desc' }).map((r) => r.id)).toEqual(['c', 'a', 'b']);
    expect(ordenarLinhas([...r2], { orderBy: 'inse_medio', orderDir: 'asc' }).map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('empate fica na ordem de chegada (a da chave), nos dois sentidos', () => {
    const r = [{ id: '1', qt_escolas: 1 }, { id: '2', qt_escolas: 1 }, { id: '3', qt_escolas: 1 }];
    expect(ordenarLinhas([...r], { orderBy: 'qt_escolas', orderDir: 'desc' }).map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(ordenarLinhas([...r], { orderBy: 'qt_escolas', orderDir: 'asc' }).map((x) => x.id)).toEqual(['1', '2', '3']);
  });
});

describe('argsDasLinhas', () => {
  it('o filtro é o mesmo dos totais; preço e idade padrão saem do scoring', () => {
    const filtros = { uf: ['SP'], gestoresMin: 6, municipioBusca: 'campinas' };
    const a = argsDasLinhas('escola', filtros, normalizarOrdem({}), 1000);
    expect(a).toEqual({
      ...argsDoFiltro('escola', filtros),
      p_preco_prof: 100, p_preco_gestor: 100, p_idade: 29, p_ordem: 'score_completo', p_desc: true, p_limite: 1000,
    });
  });

  it('preço, idade e ordem pedidos passam como vieram', () => {
    const a = argsDasLinhas('rede', { precoProf: 99.9, precoGestor: 250, idadeOnboarding: 24 }, { orderBy: 'nome', orderDir: 'asc' }, 25000);
    expect(a).toMatchObject({ p_preco_prof: 99.9, p_preco_gestor: 250, p_idade: 24, p_ordem: 'nome', p_desc: false, p_limite: 25000 });
  });
});

describe('linhasDoRpc / contagemConfere / ordemConfere', () => {
  it('só aceita { total inteiro >= linhas, linhas: [] }', () => {
    expect(linhasDoRpc({ total: 3, linhas: [{}, {}] })).toEqual({ total: 3, linhas: [{}, {}] });
    expect(linhasDoRpc({ total: '3', linhas: [] })?.total).toBe(3);
    for (const ruim of [null, [], 'x', { total: 1 }, { linhas: [] }, { total: 1, linhas: [{}, {}] }, { total: 1.5, linhas: [] }]) {
      expect(linhasDoRpc(ruim), JSON.stringify(ruim)).toBeNull();
    }
  });

  it('contagem: só confere com o mesmo número e sem erro', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(contagemConfere('escola', 10, 10)).toBe(true);
    expect(contagemConfere('escola', 10, 11)).toBe(false);
    expect(contagemConfere('escola', 10, null)).toBe(false);
    expect(contagemConfere('escola', 10, 10, 'timeout')).toBe(false);
    erro.mockRestore();
  });

  it('ordem: aceita a ordem certa (com folga de arredondamento) e acusa a errada', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    const desc = { orderBy: 'score_completo', orderDir: 'desc' } as const;
    expect(ordemConfere([{ score_completo: 3 }, { score_completo: 3 }, { score_completo: 1 }, { score_completo: null }], desc, 'escola')).toBe(true);
    expect(ordemConfere([{ score_completo: 1 }, { score_completo: 1 + 1e-12 }], desc, 'escola')).toBe(true);
    expect(ordemConfere([{ score_completo: 1 }, { score_completo: 2 }], desc, 'escola')).toBe(false);
    expect(ordemConfere([{ score_completo: null }, { score_completo: 2 }], desc, 'escola')).toBe(false);
    const asc = { orderBy: 'inse_medio', orderDir: 'asc' } as const;
    expect(ordemConfere([{ inse_medio: null }, { inse_medio: 1 }, { inse_medio: 4 }], asc, 'escola')).toBe(true);
    expect(ordemConfere([{ inse_medio: 1 }, { inse_medio: null }], asc, 'escola')).toBe(false);
    const nome = { orderBy: 'nome', orderDir: 'asc' } as const;
    expect(ordemConfere([{ nome: 'Ábaco' }, { nome: 'abc' }], nome, 'escola')).toBe(false);   // 'Á' (U+00C1) > 'a'
    expect(ordemConfere([{ nome: 'abc' }, { nome: 'Ábaco' }], nome, 'escola')).toBe(true);
    erro.mockRestore();
  });
});

describe('action: a tabela vem do banco, ordenada sobre o filtro inteiro', () => {
  for (const v of VISOES) {
    it(`${v.nome}: N primeiras do filtro inteiro, sem ler em páginas, e ordemGlobal`, async () => {
      novoBanco(2500);
      const filtros = { limit: 1000, orderBy: 'tam_mensal_mentor_ia', orderDir: 'desc', precoProf: 300, precoGestor: 500 } as const;
      let recebido: any = null;
      rpcLinhas = (args) => { recebido = args; return comoOSql(v, filtros, args.p_limite); };
      const r: any = await CARREGAR[v.visao](filtros);
      expect(r.error).toBeUndefined();
      expect(recebido).toMatchObject({ p_visao: v.visao, p_ordem: 'tam_mensal_mentor_ia', p_desc: true, p_limite: 1000, p_preco_prof: 300, p_preco_gestor: 500, p_idade: 29 });
      expect(ranges(v.tabela)).toEqual([]);                         // nada de leitura por chave
      expect(r.rows).toHaveLength(1000);
      expect(r.totalNoBanco).toBe(2500);
      expect(r.truncado).toBe(true);
      expect(r.ordemGlobal).toBe(true);
      // As 1.000 são as de maior TAM do banco INTEIRO, não as 1.000 primeiras pela chave
      const todas = banco.map((x) => v.linha(x, filtros).tam_mensal_mentor_ia).sort((a, b) => b - a);
      expect(r.rows.map((x: any) => x.tam_mensal_mentor_ia)).toEqual(todas.slice(0, 1000));
      const primeirasPorChave = banco.slice(0, 1000).map((x) => v.linha(x, filtros).tam_mensal_mentor_ia).sort((a, b) => b - a);
      expect(r.rows.map((x: any) => x.tam_mensal_mentor_ia)).not.toEqual(primeirasPorChave);
    });

    it(`${v.nome}: contagem diferente da do PostgREST descarta a ordem do banco e avisa`, async () => {
      novoBanco(2500, () => 2499);
      rpcLinhas = (args) => comoOSql(v, {}, args.p_limite);
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
      const r: any = await CARREGAR[v.visao]({ limit: 1000 });
      expect(ranges(v.tabela).length).toBeGreaterThan(0);          // caiu na leitura por chave
      expect(r.truncado).toBe(true);
      expect(r.ordemGlobal).toBe(false);
      expect(erro.mock.calls.some((c) => String(c[0]).includes('contagem diverge'))).toBe(true);
      erro.mockRestore();
    });

    it(`${v.nome}: RPC com erro cai na leitura por chave; sem corte, a ordem ainda é global`, async () => {
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
      novoBanco(30);
      rpcLinhas = () => ({ data: null, error: { message: 'function does not exist' } });
      const r: any = await CARREGAR[v.visao]({});
      expect(r.rows).toHaveLength(30);
      expect(r.truncado).toBe(false);
      expect(r.ordemGlobal).toBe(true);
      novoBanco(1500);
      rpcLinhas = () => ({ data: null, error: { message: 'timeout' } });
      const r2: any = await CARREGAR[v.visao]({ limit: 1000 });
      expect(r2.truncado).toBe(true);
      expect(r2.ordemGlobal).toBe(false);
      erro.mockRestore();
    });

    it(`${v.nome}: ordem do banco que não bate com o TS vira ordemGlobal false, e a tela ainda sai ordenada`, async () => {
      novoBanco(300);
      rpcLinhas = (args) => {
        const certo = comoOSql(v, {}, args.p_limite);
        return { data: { ...certo.data, linhas: [...certo.data.linhas].reverse() }, error: null };
      };
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
      const r: any = await CARREGAR[v.visao]({ limit: 100 });
      expect(r.ordemGlobal).toBe(false);
      const scores = r.rows.map((x: any) => x.score_completo ?? -Infinity);
      expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
      expect(erro.mock.calls.some((c) => String(c[0]).includes('diverge do TS'))).toBe(true);
      erro.mockRestore();
    });
  }

  it('limite e ordem da exportação chegam ao banco (as 10.000 primeiras do filtro inteiro)', async () => {
    novoBanco(50);
    let recebido: any = null;
    rpcLinhas = (args) => { recebido = args; return comoOSql(VISOES[2], { orderBy: 'nome', orderDir: 'asc' }, args.p_limite); };
    await loadMercadoEscolas({ limit: 10000, orderBy: 'nome', orderDir: 'asc' }, { totais: false });
    expect(recebido).toMatchObject({ p_limite: 10000, p_ordem: 'nome', p_desc: false });
  });
});

/**
 * A fórmula do score e a montagem das linhas estão ESPELHADAS em SQL
 * (`mercado_potencial_base` + `mercado_potencial_linhas`, mig 293), que escolhe as N linhas
 * da tabela. Se um destes arquivos mudar, a ordem do banco pode deixar de ser a do TS sem
 * que nada quebre (a conferência em execução só pega o que chega à tela).
 *
 * Ao cair aqui: reveja a função SQL numa migration nova, rode a conferência contra o banco
 * real (as N chaves do SQL = as N primeiras do sort do TS sobre o filtro inteiro, nas 3
 * visões) e só então atualize as impressões digitais.
 */
describe('guard: a fórmula do TS e a ordem em SQL mudam juntas', () => {
  const digital = (arquivo: string) => createHash('sha256')
    .update(readFileSync(join(process.cwd(), arquivo), 'utf8').replace(/\r\n/g, '\n'))
    .digest('hex').slice(0, 16);

  it('scoring.ts e linhas.ts são os que a mig 293 espelha', () => {
    expect(digital('lib/mercado-potencial/scoring.ts'), 'scoring.ts mudou: reveja mercado_potencial_linhas (mig 293)').toBe('63111ed0d0a5a8d5');
    expect(digital('lib/mercado-potencial/linhas.ts'), 'linhas.ts mudou: reveja mercado_potencial_base (mig 293)').toBe('5df0478833450c96');
  });

  const sql = readFileSync(join(process.cwd(), 'migrations/293-mercado-potencial-ordem-global.sql'), 'utf8');

  it('a função SQL aceita exatamente as colunas que o TS normaliza', () => {
    const lista = sql.match(/p_ordem NOT IN \(([^)]*)\)/)![1];
    const doSql = [...lista.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(doSql.sort()).toEqual([...ORDENS].sort());
  });

  it('nome da Rede, texto por ponto de código e nulo nas pontas certas, como no TS', () => {
    expect(sql).toContain("r.municipio || ' — ' || r.rede");
    expect(linhaDeRede({ municipio: 'X', rede: 'Y' }, {}).nome).toBe('X — Y');
    expect(sql).toMatch(/COLLATE "C" DESC NULLS LAST/);
    expect(sql).toMatch(/COLLATE "C" ASC NULLS FIRST/);
    expect(sql).toMatch(/k_num END\) DESC NULLS LAST/);
    expect(sql).toMatch(/k_num END\) ASC NULLS FIRST/);
  });

  it('as três funções novas só para service_role', () => {
    for (const fn of ['mercado_potencial_base', 'mercado_potencial_totais', 'mercado_potencial_linhas']) {
      for (const papel of ['PUBLIC', 'anon', 'authenticated']) {
        expect(sql, `${fn} ${papel}`).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM ${papel};`));
      }
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`));
    }
  });
});

describe('refresh das views só pelo servidor (mig 294)', () => {
  it('revoga de PUBLIC, anon e authenticated e mantém service_role', () => {
    const sql = readFileSync(join(process.cwd(), 'migrations/294-refresh-mercado-so-servidor.sql'), 'utf8');
    for (const papel of ['PUBLIC', 'anon', 'authenticated']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.refresh_mv_mercado_potencial() FROM ${papel};`);
    }
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.refresh_mv_mercado_potencial() TO service_role;');
  });
});

describe('a tela avisa quando a ordem não cobre o filtro inteiro', () => {
  const tela = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/page.tsx'), 'utf8');

  it('guarda ordemGlobal do servidor e mostra o aviso só quando ela é falsa', () => {
    expect(tela).toMatch(/ordemGlobal: r\.ordemGlobal !== false/);
    expect(tela).toMatch(/!leitura\.ordemGlobal && <> \{t\('partialOrder'/);
  });

  it('o texto existe nos 4 catálogos', () => {
    for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const msgs = JSON.parse(readFileSync(join(process.cwd(), `messages/${loc}.json`), 'utf8'));
      const texto: string = msgs.AdminMarketPotential.partialOrder;
      expect(texto, loc).toContain('{shown}');
      expect(texto, loc).toContain('{total}');
    }
  });
});
