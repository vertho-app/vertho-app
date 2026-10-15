import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock } from '../helpers/supabase-mock';

/**
 * Filtro "nº de professores (>=)" da tela Mercado Potencial.
 *
 * O que ele precisa garantir, e onde olha:
 *  - vai AO BANCO e ANTES do `range` da leitura em páginas (a ordem da cadeia é a prova): filtrar no JS
 *    depois da leitura aplicaria o mínimo só às N primeiras linhas;
 *  - vale nas 3 visões (município, rede, escola), todas com a coluna `qt_professores`;
 *  - a action é endpoint HTTP, então valor hostil (NaN, Infinity, negativo, texto)
 *    NÃO vira filtro nem derruba a consulta, e fração vira inteiro (`>= 12.5` num
 *    bigint daria 22P02: para inteiros, `>= 12.5` é `>= 13`);
 *  - a linha devolvida traz `qt_professores`, que é o que a coluna nova lê;
 *  - a tela manda o campo à action e tem a coluna.
 *
 * O mock NÃO filtra linhas: ele prova a PERGUNTA feita ao banco, não o resultado.
 * O resultado se mede contra o banco (ver o relato do commit).
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
  { nome: 'município', tabela: 'diag_mv_mercado_municipio', carregar: loadMercadoMunicipios },
  { nome: 'rede', tabela: 'diag_mv_mercado_rede', carregar: loadMercadoRedes },
  { nome: 'escola', tabela: 'diag_mv_mercado_escola', carregar: loadMercadoEscolas },
] as const;

const doMinimo = (tabela: string) =>
  sb.chamadas.filter((c) => c.tabela === tabela && c.metodo === 'gte' && c.args[0] === 'qt_professores');

beforeEach(() => {
  sb = criarSupabaseMock({ lista: () => [LINHA] });
});

describe('Mercado Potencial: filtro de nº mínimo de professores', () => {
  for (const v of VISOES) {
    it(`${v.nome}: manda gte em qt_professores ao banco, ANTES do limit`, async () => {
      const r: any = await v.carregar({ professoresMin: 50 });
      expect(r.error).toBeUndefined();
      expect(doMinimo(v.tabela)).toHaveLength(1);
      expect(doMinimo(v.tabela)[0].args).toEqual(['qt_professores', 50]);

      const cadeia = sb.chamadas.filter((c) => c.tabela === v.tabela).map((c) => c.metodo);
      expect(cadeia.indexOf('gte'), 'o mínimo tem de entrar antes do range').toBeLessThan(cadeia.indexOf('range'));
    });

    it(`${v.nome}: sem filtro (ausente, 0, negativo ou inválido) não manda nada`, async () => {
      for (const professoresMin of [undefined, null, 0, -5, NaN, Infinity, 'abc'] as any[]) {
        sb.reset();
        const r: any = await v.carregar({ professoresMin });
        expect(r.error, `professoresMin=${String(professoresMin)}`).toBeUndefined();
        expect(doMinimo(v.tabela), `professoresMin=${String(professoresMin)}`).toHaveLength(0);
      }
    });

    it(`${v.nome}: a linha devolvida traz qt_professores (o que a coluna lê)`, async () => {
      const r: any = await v.carregar({});
      expect(r.rows[0].qt_professores).toBe(15);
    });
  }

  it('fração vira inteiro para cima (a coluna é inteira)', async () => {
    await loadMercadoEscolas({ professoresMin: 12.5 });
    expect(doMinimo('diag_mv_mercado_escola')[0].args).toEqual(['qt_professores', 13]);
  });

  it('o mínimo de professores não substitui os outros filtros (INSE segue no ar)', async () => {
    await loadMercadoEscolas({ professoresMin: 20, inseMin: 4, uf: ['SP'], redes: ['PRIVADA'] });
    expect(sb.usou('diag_mv_mercado_escola', 'gte', 'inse_efetivo')).toBe(true);
    expect(sb.usou('diag_mv_mercado_escola', 'in', 'uf')).toBe(true);
    expect(sb.usou('diag_mv_mercado_escola', 'in', 'rede')).toBe(true);
    expect(doMinimo('diag_mv_mercado_escola')).toHaveLength(1);
  });
});

describe('Mercado Potencial: a tela usa o filtro e mostra a coluna', () => {
  const tela = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/page.tsx'), 'utf8');

  it('manda professoresMin na consulta', () => {
    expect(tela).toMatch(/professoresMin:\s*profsMinDebounced/);
  });

  it('tem o campo e a coluna ordenável por qt_professores', () => {
    expect(tela).toContain("t('inputs.teachersMin')");
    expect(tela).toMatch(/<Th label=\{t\('table\.teachersTotal'\)\} coluna="qt_professores"/);
    expect(tela).toMatch(/fmt\.int\(r\.qt_professores, locale\)/);
  });
});
