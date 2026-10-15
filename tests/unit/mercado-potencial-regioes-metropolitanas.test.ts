import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { criarSupabaseMock } from '../helpers/supabase-mock';
import { municipiosDasRegioes } from '@/lib/mercado-potencial/filtros';
import { REGIOES_METROPOLITANAS } from '@/lib/mercado-potencial/regioes-metropolitanas';

/**
 * Mercado Potencial: filtro por região metropolitana (RM e RIDE).
 *
 * A composição é do IBGE e vive num módulo GERADO (`scripts/atualizar-regioes-metropolitanas.mjs`).
 * Medido em 15/10/2026 contra o banco: os 1.432 códigos distintos existem em
 * `diag_mv_mercado_municipio` (0 faltando), `.in('municipio_ibge', …)` filtra as três
 * visões e aguenta a lista inteira (14 KB de URL), e `.in('municipio_ibge', [])`
 * devolve 0 linhas sem erro. O mock abaixo prova a PERGUNTA feita ao banco.
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

const porNome = (nome: string) => {
  const r = REGIOES_METROPOLITANAS.find((x) => x.nome === nome);
  if (!r) throw new Error(`região não encontrada: ${nome}`);
  return r;
};
const doMunicipio = (tabela: string) => sb.chamadas.filter((c) => c.tabela === tabela && c.metodo === 'in' && c.args[0] === 'municipio_ibge');

beforeEach(() => {
  sb = criarSupabaseMock({ lista: () => [LINHA] });
});

describe('composição das regiões metropolitanas (módulo gerado do IBGE)', () => {
  it('tem as RMs e as 3 RIDEs, com id e nome únicos para a tela', () => {
    expect(REGIOES_METROPOLITANAS.length).toBeGreaterThanOrEqual(80);
    expect(REGIOES_METROPOLITANAS.filter((r) => r.tipo === 'RIDE')).toHaveLength(3);
    const ids = REGIOES_METROPOLITANAS.map((r) => r.id);
    const nomes = REGIOES_METROPOLITANAS.map((r) => r.nome);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('todo município tem 7 dígitos (o `municipio_ibge` das visões), sem grupo vazio nem repetição dentro do grupo', () => {
    for (const r of REGIOES_METROPOLITANAS) {
      expect(r.municipios.length, r.nome).toBeGreaterThan(0);
      expect(new Set(r.municipios).size, `${r.nome} repete município`).toBe(r.municipios.length);
      for (const m of r.municipios) expect(m, `${r.nome}: ${m}`).toMatch(/^\d{7}$/);
    }
  });

  it('âncoras conhecidas: Campinas, Salvador, São Paulo, Jundiaí e o DF', () => {
    const campinas = porNome('Campinas (SP)');
    expect(campinas.municipios).toHaveLength(20);
    expect(campinas.municipios).toContain('3509502'); // Campinas
    expect(campinas.municipios).toContain('3552403'); // Sumaré
    expect(campinas.municipios).not.toContain('3525904'); // Jundiaí tem RM própria

    expect(porNome('Jundiaí (SP)').municipios).toContain('3525904');
    expect(porNome('Salvador (BA)').municipios).toContain('2927408');

    const sp = porNome('São Paulo (SP)');
    expect(sp.municipios).toContain('3550308'); // São Paulo
    expect(sp.municipios).toContain('3518800'); // Guarulhos

    expect(porNome('RIDE Distrito Federal e Entorno (DF/GO/MG)').municipios).toContain('5300108'); // Brasília
  });
});

describe('municipiosDasRegioes', () => {
  it('sem região pedida não filtra (null), e lista inválida também não', () => {
    for (const v of [undefined, null, [], 'abc', 5, {}]) expect(municipiosDasRegioes(v), JSON.stringify(v)).toBeNull();
  });

  it('uma região devolve os municípios dela; duas, a união sem repetir', () => {
    const campinas = porNome('Campinas (SP)');
    const salvador = porNome('Salvador (BA)');
    expect(municipiosDasRegioes([campinas.id])).toEqual([...campinas.municipios]);
    const uniao = municipiosDasRegioes([campinas.id, salvador.id, campinas.id])!;
    expect(uniao).toHaveLength(campinas.municipios.length + salvador.municipios.length);
    expect(new Set(uniao).size).toBe(uniao.length);
  });

  it('id desconhecido é ignorado; só desconhecidos dão lista vazia (nenhuma linha), nunca "tudo"', () => {
    const jundiai = porNome('Jundiaí (SP)');
    expect(municipiosDasRegioes(['nao-existe', jundiai.id])).toEqual([...jundiai.municipios]);
    expect(municipiosDasRegioes(['nao-existe', 42, null])).toEqual([]);
  });
});

describe('Mercado Potencial: região metropolitana nas três visões', () => {
  for (const v of VISOES) {
    it(`${v.nome}: in(municipio_ibge) com a união das regiões, antes do limit`, async () => {
      const campinas = porNome('Campinas (SP)');
      const salvador = porNome('Salvador (BA)');
      const r: any = await v.carregar({ regioesMetropolitanas: [campinas.id, salvador.id] });
      expect(r.error).toBeUndefined();
      const chamadas = doMunicipio(v.tabela);
      expect(chamadas).toHaveLength(1);
      expect(chamadas[0].args[1]).toEqual(municipiosDasRegioes([campinas.id, salvador.id]));
      const cadeia = sb.chamadas.filter((c) => c.tabela === v.tabela).map((c) => c.metodo);
      expect(cadeia.indexOf('in'), 'a região tem de entrar antes do limit').toBeLessThan(cadeia.indexOf('limit'));
    });

    it(`${v.nome}: sem região não manda nada; região inexistente manda lista vazia`, async () => {
      for (const regioesMetropolitanas of [undefined, []] as any[]) {
        sb.reset();
        await v.carregar({ regioesMetropolitanas });
        expect(doMunicipio(v.tabela), JSON.stringify(regioesMetropolitanas)).toHaveLength(0);
      }
      sb.reset();
      await v.carregar({ regioesMetropolitanas: ['nao-existe'] });
      expect(doMunicipio(v.tabela).map((c) => c.args[1])).toEqual([[]]);
    });
  }

  it('soma com UF, cidade e mínimos (AND), cada filtro no seu campo', async () => {
    const t = 'diag_mv_mercado_escola';
    await loadMercadoEscolas({
      regioesMetropolitanas: [porNome('Campinas (SP)').id], uf: ['SP'],
      municipioBusca: 'campinas, sumaré', professoresMin: 10, gestoresMin: 3,
    });
    expect(sb.usou(t, 'in', 'municipio_ibge')).toBe(true);
    expect(sb.usou(t, 'in', 'uf')).toBe(true);
    expect(sb.usou(t, 'or')).toBe(true);
    expect(sb.usou(t, 'gte', 'qt_professores')).toBe(true);
    expect(sb.usou(t, 'gte', 'qt_coord_pedag')).toBe(true);
  });
});

describe('Mercado Potencial: a tela oferece as regiões', () => {
  const tela = readFileSync(join(process.cwd(), 'app/admin/vertho/mercado-potencial/page.tsx'), 'utf8');

  it('manda regioesMetropolitanas na consulta e usa o seletor com a lista do módulo', () => {
    expect(tela).toMatch(/regioesMetropolitanas:\s*regioes\.length/);
    expect(tela).toContain('<RegiaoDropdown');
    expect(tela).toContain("from '@/lib/mercado-potencial/regioes-metropolitanas'");
  });
});
