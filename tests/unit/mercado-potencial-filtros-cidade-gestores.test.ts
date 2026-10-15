import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import {
  GESTORES_NA_ESCOLA, MAX_CIDADES_BUSCA, corteDeMinimo, orDeCidades, termosDeCidade,
} from '@/lib/mercado-potencial/filtros';

/**
 * Mercado Potencial: busca por VÁRIAS cidades e mínimo de gestores.
 *
 * Como no mínimo de professores (`mercado-potencial-professores-min.test.ts`), o
 * mock prova a PERGUNTA feita ao banco, não as linhas. O `.or()` com aspas foi
 * medido contra o PostgREST real em 15/10/2026 (7 linhas para "campinas, salvador",
 * igual ao SQL; `_` e `%` literais; ponto, parêntese e aspa sem erro).
 */
const LINHA = {
  municipio_ibge: '3509502', municipio: 'Campinas', uf: 'SP', rede: 'PRIVADA',
  codigo_inep: '35000001', nome: 'Colégio A', qt_escolas: 1, qt_professores: 15,
  qt_doc_0_24: 1, qt_docs_0_24: 1, qt_docs_jovens: 2, qt_docs_pos: 12, qt_gestores: 3,
  qt_coord_pedag: 1, qt_diretor_proxy: 1, inse_medio: 5, inse_efetivo: 5, inse_grupo: 5,
};

let sb = criarSupabaseMock({ lista: () => [LINHA] });

vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));

import { loadMercadoMunicipios, loadMercadoRedes, loadMercadoEscolas } from '@/app/admin/vertho/mercado-potencial/actions';

const VISOES = [
  { nome: 'município', tabela: 'diag_mv_mercado_municipio', carregar: loadMercadoMunicipios, colunaGestores: 'qt_gestores', diretor: 0 },
  { nome: 'rede', tabela: 'diag_mv_mercado_rede', carregar: loadMercadoRedes, colunaGestores: 'qt_gestores', diretor: 0 },
  { nome: 'escola', tabela: 'diag_mv_mercado_escola', carregar: loadMercadoEscolas, colunaGestores: 'qt_coord_pedag', diretor: 1 },
] as const;

const doTabela = (tabela: string, metodo: string) => sb.chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo);

beforeEach(() => {
  sb = criarSupabaseMock({ lista: () => [LINHA] });
});

describe('termosDeCidade / orDeCidades / corteDeMinimo', () => {
  it('separa por vírgula ou ponto e vírgula, sem vazios nem repetidos', () => {
    expect(termosDeCidade('campinas, salvador')).toEqual(['campinas', 'salvador']);
    expect(termosDeCidade(' Campinas ;; salvador , CAMPINAS ,')).toEqual(['Campinas', 'salvador']);
    expect(termosDeCidade('  ')).toEqual([]);
    expect(termosDeCidade(undefined)).toEqual([]);
    expect(termosDeCidade(',,;')).toEqual([]);
  });

  it(`corta em ${MAX_CIDADES_BUSCA} cidades`, () => {
    const muitas = Array.from({ length: MAX_CIDADES_BUSCA + 20 }, (_, i) => `cidade${i}`).join(',');
    expect(termosDeCidade(muitas)).toHaveLength(MAX_CIDADES_BUSCA);
  });

  it('o or põe cada valor entre aspas e escapa curinga, barra e aspa', () => {
    expect(orDeCidades(['campinas', 'salvador'])).toBe('municipio.ilike."%campinas%",municipio.ilike."%salvador%"');
    // `_` e `%` literais (escaparLike) e depois a barra dobrada para a string entre aspas
    expect(orDeCidades(['cam_inas'])).toBe('municipio.ilike."%cam\\\\_inas%"');
    expect(orDeCidades(['100%'])).toBe('municipio.ilike."%100\\\\%%"');
    // sintaxe do `or` dentro do nome não escapa das aspas
    expect(orDeCidades(['Sta. Maria', 'x(y)', 'a"b'])).toBe(
      'municipio.ilike."%Sta. Maria%",municipio.ilike."%x(y)%",municipio.ilike."%a\\"b%"',
    );
  });

  it('corteDeMinimo: só número finito > 0, fração sobe, teto contra estouro de int', () => {
    for (const ruim of [undefined, null, 0, -5, NaN, Infinity, -Infinity, 'abc', '']) {
      expect(corteDeMinimo(ruim), String(ruim)).toBeNull();
    }
    expect(corteDeMinimo(50)).toBe(50);
    expect(corteDeMinimo('50')).toBe(50);
    expect(corteDeMinimo(12.1)).toBe(13);
    expect(corteDeMinimo(1e308)).toBe(1_000_000_000);
  });
});

describe('Mercado Potencial: cidades (uma ou várias)', () => {
  for (const v of VISOES) {
    it(`${v.nome}: uma cidade segue como ilike simples`, async () => {
      await v.carregar({ municipioBusca: 'campinas' });
      expect(doTabela(v.tabela, 'ilike').map((c) => c.args)).toEqual([['municipio', '%campinas%']]);
      expect(doTabela(v.tabela, 'or')).toHaveLength(0);
    });

    it(`${v.nome}: várias cidades viram UM or, antes do range`, async () => {
      const r: any = await v.carregar({ municipioBusca: 'campinas, salvador' });
      expect(r.error).toBeUndefined();
      expect(doTabela(v.tabela, 'or').map((c) => c.args)).toEqual([['municipio.ilike."%campinas%",municipio.ilike."%salvador%"']]);
      expect(doTabela(v.tabela, 'ilike')).toHaveLength(0);
      const cadeia = sb.chamadas.filter((c) => c.tabela === v.tabela).map((c) => c.metodo);
      expect(cadeia.indexOf('or'), 'a busca tem de entrar antes do range').toBeLessThan(cadeia.indexOf('range'));
    });

    it(`${v.nome}: busca vazia ou só separadores não filtra`, async () => {
      for (const municipioBusca of ['', '   ', ',', ' , ;']) {
        sb.reset();
        await v.carregar({ municipioBusca });
        expect(doTabela(v.tabela, 'ilike'), JSON.stringify(municipioBusca)).toHaveLength(0);
        expect(doTabela(v.tabela, 'or'), JSON.stringify(municipioBusca)).toHaveLength(0);
      }
    });
  }
});

describe('Mercado Potencial: mínimo de gestores', () => {
  for (const v of VISOES) {
    it(`${v.nome}: gte em ${v.colunaGestores}, antes do range`, async () => {
      const r: any = await v.carregar({ gestoresMin: 10 });
      expect(r.error).toBeUndefined();
      const gte = doTabela(v.tabela, 'gte').filter((c) => c.args[0] === v.colunaGestores);
      expect(gte.map((c) => c.args)).toEqual([[v.colunaGestores, 10 - v.diretor]]);
      const cadeia = sb.chamadas.filter((c) => c.tabela === v.tabela).map((c) => c.metodo);
      expect(cadeia.indexOf('gte'), 'o mínimo tem de entrar antes do range').toBeLessThan(cadeia.indexOf('range'));
    });

    it(`${v.nome}: sem filtro (ausente, 0, negativo ou inválido) não manda nada`, async () => {
      for (const gestoresMin of [undefined, null, 0, -3, NaN, Infinity, 'abc'] as any[]) {
        sb.reset();
        const r: any = await v.carregar({ gestoresMin });
        expect(r.error, String(gestoresMin)).toBeUndefined();
        expect(doTabela(v.tabela, 'gte').filter((c) => c.args[0] === v.colunaGestores), String(gestoresMin)).toHaveLength(0);
      }
    });
  }

  it('escola: gestores = coordenadores + 1 (diretor proxy), então >= 1 vira coord >= 0 e >= 5 vira coord >= 4', async () => {
    await loadMercadoEscolas({ gestoresMin: 1 });
    expect(doTabela('diag_mv_mercado_escola', 'gte').filter((c) => c.args[0] === 'qt_coord_pedag')[0].args).toEqual(['qt_coord_pedag', 0]);
    sb.reset();
    await loadMercadoEscolas({ gestoresMin: 5 });
    expect(doTabela('diag_mv_mercado_escola', 'gte').filter((c) => c.args[0] === 'qt_coord_pedag')[0].args).toEqual(['qt_coord_pedag', 4]);
  });

  it('os filtros se somam: professores, gestores e cidades juntos', async () => {
    await loadMercadoEscolas({ professoresMin: 20, gestoresMin: 6, municipioBusca: 'campinas, salvador', uf: ['SP', 'BA'] });
    const t = 'diag_mv_mercado_escola';
    expect(sb.usou(t, 'gte', 'qt_professores')).toBe(true);
    expect(sb.usou(t, 'gte', 'qt_coord_pedag')).toBe(true);
    expect(sb.usou(t, 'or')).toBe(true);
    expect(sb.usou(t, 'in', 'uf')).toBe(true);
  });
});

/**
 * A conta da escola só vale enquanto o diretor proxy for a constante 1 em toda
 * linha da MV. Se alguém trocar o `1 AS qt_diretor_proxy` da função de refresh
 * por outra coisa, o filtro de gestores passa a errar sem aviso: este guard
 * obriga a rever `GESTORES_NA_ESCOLA` junto.
 */
describe('Mercado Potencial: a constante do diretor proxy que o filtro de gestores assume', () => {
  const pasta = join(process.cwd(), 'migrations');
  const achados = readdirSync(pasta)
    .filter((f) => f.endsWith('.sql'))
    .flatMap((f) => {
      const texto = readFileSync(join(pasta, f), 'utf8');
      return [...texto.matchAll(/^\s*([^\s,]+)\s+AS\s+qt_diretor_proxy\b/gim)].map((m) => ({ f, expr: m[1] }));
    });

  it('existe ao menos uma definição (o guard não está olhando para o vazio)', () => {
    expect(achados.length).toBeGreaterThan(0);
  });

  it('toda definição de qt_diretor_proxy é a constante 1', () => {
    expect(achados.filter((a) => a.expr !== String(GESTORES_NA_ESCOLA.diretorProxy))).toEqual([]);
  });
});

describe('Mercado Potencial: a tela usa os dois filtros', () => {
  const tela = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/page.tsx'), 'utf8');

  it('manda gestoresMin na consulta e tem o campo', () => {
    expect(tela).toMatch(/gestoresMin:\s*gestMinDebounced/);
    expect(tela).toContain("t('inputs.managersMin')");
  });

  it('diz que a cidade aceita várias, separadas por vírgula', () => {
    expect(tela).toContain("t('inputs.cityHint')");
  });
});
