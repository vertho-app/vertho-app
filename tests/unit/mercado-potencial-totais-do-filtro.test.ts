import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock, type Chamada } from '../helpers/supabase-mock';
import { municipiosDasRegioes } from '@/lib/mercado-potencial/filtros';
import { argsDoFiltro, consolidarTotais, somasDoRpc, type SomasDoFiltro } from '@/lib/mercado-potencial/totais';
import { REGIOES_METROPOLITANAS } from '@/lib/mercado-potencial/regioes-metropolitanas';
import { calcularMercadoScores } from '@/lib/mercado-potencial/scoring';

/**
 * Mercado Potencial: os cartões somam o FILTRO INTEIRO, não as linhas da tabela.
 *
 * Por quê: a tela somava no navegador as linhas que vieram. Na visão Escola o padrão é
 * 1.000 linhas; medido em 19/10/2026, o print do dono mostrava "1.000 de 25.540" com os
 * cartões somando só as 1.000. Agora a soma é do banco (RPC `mercado_potencial_totais`,
 * mig 292) e só aparece se o número de linhas somadas for o MESMO que a tabela contou.
 */

const LINHAS = (n: number) => Array.from({ length: n }, (_, i) => ({
  municipio_ibge: String(3500000 + i).padStart(7, '0'), municipio: `Cidade ${i}`, uf: 'SP', rede: i % 2 ? 'PRIVADA' : 'MUNICIPAL',
  codigo_inep: String(35000000 + i), nome: `Escola ${i}`, qt_escolas: 1 + (i % 3), qt_professores: 10 + (i % 7),
  qt_doc_0_24: i % 2, qt_docs_0_24: i % 2, qt_docs_jovens: 2 + (i % 4), qt_docs_pos: 3, qt_gestores: 3 + (i % 2),
  qt_coord_pedag: i % 3, qt_diretor_proxy: 1, inse_medio: 1 + (i % 6), inse_efetivo: 1 + (i % 6), inse_grupo: 4,
}));

let banco: any[] = [];
let sb = criarSupabaseMock();

function novoBanco(n: number, rpc?: (args: any) => any) {
  banco = LINHAS(n);
  sb = criarSupabaseMock({
    lista: (_t, _c, cadeia: Chamada[]) => {
      const r = cadeia.find((c) => c.metodo === 'range');
      const [de, ate] = r ? [r.args[0], r.args[1]] : [0, banco.length - 1];
      return banco.slice(de, Math.min(ate, de + 999, banco.length - 1) + 1);
    },
    contagem: () => banco.length,
  });
  // Só o RPC dos totais responde aqui; o das linhas ordenadas (mig 293) devolve nada e a
  // action lê em páginas pela chave (o caminho dele tem teste próprio).
  if (rpc) sb.client.rpc.mockImplementation(async (nome: string, args: any) => (nome === 'mercado_potencial_totais' ? rpc(args) : { data: null, error: null }));
}

/** O que o banco somaria para o filtro, linha a linha (as linhas do banco fingido não são filtradas). */
function somasDe(linhas: any[], visao: 'municipio' | 'rede' | 'escola'): SomasDoFiltro {
  const s = { linhas: linhas.length, qt_escolas: 0, qt_professores: 0, qt_docs_jovens: 0, qt_docs_0_24: 0, qt_gestores: 0 };
  for (const l of linhas) {
    s.qt_escolas += visao === 'escola' ? 1 : l.qt_escolas;
    s.qt_professores += l.qt_professores;
    s.qt_docs_jovens += l.qt_docs_jovens;
    s.qt_docs_0_24 += visao === 'escola' ? l.qt_doc_0_24 : l.qt_docs_0_24;
    s.qt_gestores += visao === 'escola' ? l.qt_coord_pedag + l.qt_diretor_proxy : l.qt_gestores;
  }
  return s;
}

vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));

import { loadMercadoMunicipios, loadMercadoRedes, loadMercadoEscolas } from '@/app/admin/vertho/mercado-potencial/actions';

const VISOES = [
  { nome: 'município', visao: 'municipio', tabela: 'diag_mv_mercado_municipio', carregar: loadMercadoMunicipios },
  { nome: 'rede', visao: 'rede', tabela: 'diag_mv_mercado_rede', carregar: loadMercadoRedes },
  { nome: 'escola', visao: 'escola', tabela: 'diag_mv_mercado_escola', carregar: loadMercadoEscolas },
] as const;

beforeEach(() => novoBanco(0));

describe('consolidarTotais: a linha SOMADA pela fórmula dá o mesmo que somar linha a linha', () => {
  for (const visao of ['municipio', 'rede', 'escola'] as const) {
    for (const filtros of [{}, { precoProf: 300, precoGestor: 500, idadeOnboarding: 29 }, { precoProf: 120, precoGestor: 80, idadeOnboarding: 24 }]) {
      it(`${visao} com ${JSON.stringify(filtros)}`, () => {
        const linhas = LINHAS(57).map((l) => visao === 'escola'
          ? { ...l, qt_docs_0_24: l.qt_doc_0_24, qt_gestores: l.qt_coord_pedag + l.qt_diretor_proxy }
          : l);
        const porLinha = linhas.map((l) => calcularMercadoScores(l, filtros));
        const soma = (k: 'tam_mensal_mentor_ia' | 'tam_mensal_onboarding' | 'qt_professores_onboarding' | 'qt_professores_total') =>
          porLinha.reduce((a, s) => a + s[k], 0);
        const t = consolidarTotais(somasDe(LINHAS(57), visao), 57, filtros)!;
        expect(t).not.toBeNull();
        expect(t.linhas).toBe(57);
        expect(t.tam_mensal_mentor_ia).toBeCloseTo(soma('tam_mensal_mentor_ia'), 6);
        expect(t.tam_mensal_onboarding).toBeCloseTo(soma('tam_mensal_onboarding'), 6);
        expect(t.qt_professores_onboarding).toBe(soma('qt_professores_onboarding'));
        expect(t.qt_professores_total).toBe(soma('qt_professores_total'));
      });
    }
  }

  it('sem somas, sem contagem da tabela, ou contagem diferente: null (a tela volta à soma parcial avisada)', () => {
    const s = somasDe(LINHAS(10), 'escola');
    expect(consolidarTotais(null, 10, {})).toBeNull();
    expect(consolidarTotais(s, null, {})).toBeNull();
    expect(consolidarTotais(s, undefined, {})).toBeNull();
    expect(consolidarTotais(s, 11, {})).toBeNull();
    expect(consolidarTotais(s, 10, {})).not.toBeNull();
  });
});

describe('somasDoRpc', () => {
  it('lê a primeira linha e aceita número em texto (bigint do PostgREST)', () => {
    const linha = { linhas: '3', qt_escolas: 3, qt_professores: '40', qt_docs_jovens: 5, qt_docs_0_24: 1, qt_gestores: 6 };
    expect(somasDoRpc([linha])).toEqual({ linhas: 3, qt_escolas: 3, qt_professores: 40, qt_docs_jovens: 5, qt_docs_0_24: 1, qt_gestores: 6 });
    expect(somasDoRpc(linha)?.linhas).toBe(3);
  });

  it('fora do formato vira null, nunca zero', () => {
    expect(somasDoRpc(null)).toBeNull();
    expect(somasDoRpc([])).toBeNull();
    expect(somasDoRpc([{ linhas: 3 }])).toBeNull();
    expect(somasDoRpc([{ linhas: 3, qt_escolas: 3, qt_professores: 'x', qt_docs_jovens: 5, qt_docs_0_24: 1, qt_gestores: 6 }])).toBeNull();
    expect(somasDoRpc([{ linhas: 3, qt_escolas: null, qt_professores: 1, qt_docs_jovens: 5, qt_docs_0_24: 1, qt_gestores: 6 }])).toBeNull();
  });
});

describe('argsDoFiltro', () => {
  it('sem filtro, nada filtra', () => {
    expect(argsDoFiltro('escola', {})).toEqual({
      p_visao: 'escola', p_ufs: null, p_municipios_ibge: null, p_inse_min: null, p_inse_max: null,
      p_professores_min: null, p_gestores_coluna_min: null, p_cidades: null, p_redes: null,
    });
  });

  it('região que não existe vira lista VAZIA (nenhuma linha), não "sem filtro"', () => {
    expect(argsDoFiltro('rede', { regioesMetropolitanas: ['nao-existe'] }).p_municipios_ibge).toEqual([]);
    expect(argsDoFiltro('rede', { regioesMetropolitanas: [] }).p_municipios_ibge).toBeNull();
  });

  it('gestores: na escola desconta o diretor proxy (coord >= N - 1); nas MVs, não', () => {
    expect(argsDoFiltro('escola', { gestoresMin: 6 }).p_gestores_coluna_min).toBe(5);
    expect(argsDoFiltro('rede', { gestoresMin: 6 }).p_gestores_coluna_min).toBe(6);
    expect(argsDoFiltro('municipio', { gestoresMin: 0 }).p_gestores_coluna_min).toBeNull();
  });

  it('redes não valem na visão município (a lista também ignora)', () => {
    expect(argsDoFiltro('municipio', { redes: ['PRIVADA'] }).p_redes).toBeNull();
    expect(argsDoFiltro('escola', { redes: ['PRIVADA'] }).p_redes).toEqual(['PRIVADA']);
  });

  it('cidade: padrão ILIKE com % e _ escapados, um por cidade', () => {
    expect(argsDoFiltro('escola', { municipioBusca: 'campinas, sta_maria' }).p_cidades).toEqual(['%campinas%', '%sta\\_maria%']);
  });
});

describe('paridade: o RPC recebe o MESMO filtro que a tabela aplicou', () => {
  const regiao = REGIOES_METROPOLITANAS[0];
  const FILTROS = {
    uf: ['SP', 'BA'], regioesMetropolitanas: [regiao.id], redes: ['PRIVADA'], municipioBusca: 'campinas',
    inseMin: 2, inseMax: 5, professoresMin: 12.5, gestoresMin: 6,
  };
  const colunaInse = { municipio: 'inse_medio', rede: 'inse_medio', escola: 'inse_efetivo' } as const;
  const colunaGestores = { municipio: 'qt_gestores', rede: 'qt_gestores', escola: 'qt_coord_pedag' } as const;

  for (const v of VISOES) {
    it(`${v.nome}`, async () => {
      let recebido: any = null;
      novoBanco(5, (args) => { recebido = args; return { data: null, error: null }; });
      await v.carregar(FILTROS);
      const elos = sb.chamadas.filter((c) => c.tabela === v.tabela);
      const primeiro = (metodo: string, coluna: string) => elos.find((c) => c.metodo === metodo && c.args[0] === coluna)?.args[1] ?? null;

      expect(sb.client.rpc).toHaveBeenCalledWith('mercado_potencial_totais', expect.anything());
      expect(recebido.p_visao).toBe(v.visao);
      expect(recebido.p_ufs).toEqual(primeiro('in', 'uf'));
      expect(recebido.p_municipios_ibge).toEqual(primeiro('in', 'municipio_ibge'));
      expect(recebido.p_municipios_ibge).toEqual(municipiosDasRegioes([regiao.id]));
      expect(recebido.p_inse_min).toBe(primeiro('gte', colunaInse[v.visao]));
      expect(recebido.p_inse_max).toBe(primeiro('lte', colunaInse[v.visao]));
      expect(recebido.p_professores_min).toBe(primeiro('gte', 'qt_professores'));
      expect(recebido.p_gestores_coluna_min).toBe(primeiro('gte', colunaGestores[v.visao]));
      expect(recebido.p_cidades).toEqual([primeiro('ilike', 'municipio')]);
      expect(recebido.p_redes).toEqual(primeiro('in', 'rede'));
    });
  }
});

describe('as três visões devolvem os cartões do filtro inteiro', () => {
  for (const v of VISOES) {
    it(`${v.nome}: tabela cortada em 1.000, cartões das 2.500`, async () => {
      novoBanco(2500, () => ({ data: [somasDe(banco, v.visao)], error: null }));
      const filtros = { limit: 1000, precoProf: 300, precoGestor: 500, idadeOnboarding: 29 };
      const r: any = await v.carregar(filtros);
      expect(r.rows).toHaveLength(1000);
      expect(r.truncado).toBe(true);
      expect(r.totais).not.toBeNull();
      expect(r.totais.linhas).toBe(2500);
      const somaDasMostradas = r.rows.reduce((a: number, x: any) => a + x.tam_mensal_mentor_ia, 0);
      const somaDeTodas = banco.map((l) => calcularMercadoScores(v.visao === 'escola'
        ? { ...l, qt_gestores: l.qt_coord_pedag + l.qt_diretor_proxy } : l, filtros))
        .reduce((a, s) => a + s.tam_mensal_mentor_ia, 0);
      expect(r.totais.tam_mensal_mentor_ia).toBeCloseTo(somaDeTodas, 6);
      expect(r.totais.tam_mensal_mentor_ia).toBeGreaterThan(somaDasMostradas);
    });

    it(`${v.nome}: soma de outro conjunto (contagem diferente) NÃO vira cartão`, async () => {
      novoBanco(2500, () => ({ data: [{ ...somasDe(banco, v.visao), linhas: 2499 }], error: null }));
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
      const r: any = await v.carregar({ limit: 1000 });
      expect(r.rows).toHaveLength(1000);
      expect(r.totais).toBeNull();
      expect(erro.mock.calls.some((c) => String(c[0]).includes('divergem'))).toBe(true);
      erro.mockRestore();
    });

    it(`${v.nome}: RPC com erro ou que lança não derruba a tabela`, async () => {
      const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
      novoBanco(30, () => ({ data: null, error: { message: 'function does not exist' } }));
      let r: any = await v.carregar({});
      expect(r.error).toBeUndefined();
      expect(r.rows).toHaveLength(30);
      expect(r.totais).toBeNull();
      novoBanco(30, () => { throw new Error('rede'); });
      r = await v.carregar({});
      expect(r.rows).toHaveLength(30);
      expect(r.totais).toBeNull();
      erro.mockRestore();
    });

    it(`${v.nome}: quem pede só as linhas (exportação, plano) não paga a soma`, async () => {
      novoBanco(30, () => ({ data: [somasDe(banco, v.visao)], error: null }));
      const r: any = await v.carregar({}, { totais: false });
      expect(sb.client.rpc).not.toHaveBeenCalledWith('mercado_potencial_totais', expect.anything());
      expect(r.totais).toBeNull();
      expect(r.rows).toHaveLength(30);
    });
  }
});

describe('a exportação e o plano do enriquecimento pulam a soma', () => {
  const fonte = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/actions.ts'), 'utf8');

  it('as duas leituras até o teto da exportação pedem { totais: false }', () => {
    const leituras = fonte.match(/\(\{ \.\.\.filtros, limit: LIMITE_EXPORTACAO \}[^)]*\)/g) ?? [];
    expect(leituras).toHaveLength(2);
    for (const l of leituras) expect(l).toContain('{ totais: false }');
  });
});

describe('a tela usa os cartões do servidor', () => {
  const tela = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/page.tsx'), 'utf8');

  it('guarda os totais do pedido e o cartão "Linhas" mostra o filtro inteiro, não rows.length', () => {
    expect(tela).toMatch(/setTotaisDoFiltro\(r\.totais \?\? null\)/);
    expect(tela).toMatch(/if \(totaisDoFiltro\) return totaisDoFiltro;/);
    expect(tela).toMatch(/t\('kpis\.rows'\)\} value=\{fmt\.int\(totais\.linhas, locale\)\}/);
  });

  it('o aviso de corte só diz "somam só as mostradas" quando os totais do filtro não vieram', () => {
    expect(tela).toMatch(/totaisDoFiltro\s*\?\s*t\('limitReachedFullTotals'/);
  });

  it('o texto novo existe nos 4 catálogos e não diz que soma só as mostradas', () => {
    for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
      const msgs = JSON.parse(readFileSync(join(process.cwd(), `messages/${loc}.json`), 'utf8'));
      const texto: string = msgs.AdminMarketPotential.limitReachedFullTotals;
      expect(texto, loc).toContain('{shown}');
      expect(texto, loc).toContain('{total}');
      expect(texto, loc).not.toBe(msgs.AdminMarketPotential.limitReached);
    }
  });
});
