import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseMock } from '../helpers/supabase-mock';
import { criarMockDeTabelas } from '../helpers/tabela-filtrada';

/**
 * EXTRAÇÃO DE MATERIAL → MÓDULO-BASE: o catálogo é por MATRIZ, não por nome (16/09/2026).
 *
 * O catálogo que a IA recebia agrupava as competências da empresa por NOME, ficava
 * com a 1ª linha e juntava os descritores de todos os cargos com aquele nome. Em
 * Ibipeba, "Autocuidado e resiliência emocional" existe em Coordenação (COO03) e
 * Gestão Escolar (DIR02) com descritores diferentes: o módulo ancorava num cargo
 * qualquer e o descritor podia sair da matriz do outro.
 *
 * A fixture põe Coordenação ANTES, como a ordem do banco: o catálogo por nome
 * ancoraria tudo em COO03 e casaria "Busca de apoio" (COO03) num módulo de DIR02.
 */

let sb: SupabaseMock;
let tabelas: Record<string, any[]> = {};
let respostaSegmentacao = '';
const promptsSegmentacao: string[] = [];

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (_system: string, user: string) => { promptsSegmentacao.push(user); return respostaSegmentacao; }),
}));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'claude-sonnet-5') }));
vi.mock('@/lib/modulo-base-autor', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/modulo-base-autor')>();
  return {
    ...mod,
    chamarIAComRetry: vi.fn(async () => ({
      conteudo_central: { ideia_principal: 'x', principios: [] },
      conteudo_aplicavel: {},
      guarda_corpos: {},
      adaptacao_por_formato: {},
    })),
  };
});
vi.mock('@/lib/modulo-base-auditor', () => ({
  carregarCompetenciaEmpresa: vi.fn(async (id: string) => tabelas.competencias.find((r) => r.id === id) ?? null),
  carregarCompetenciaBase: vi.fn(async () => null),
  auditarModulosCore: vi.fn(async () => ({ falhas: [] })),
}));
vi.mock('@/lib/admin-supabase', () => ({ requireAdminSupabase: vi.fn(async () => sb.client) }));
vi.mock('@/lib/auth/action-context', () => ({ requireAdminAction: vi.fn(async () => ({ email: 'admin@vertho.ai' })) }));
const disparos: any[] = [];
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger: vi.fn(async (...a: any[]) => { disparos.push(a); return { id: 'run-1' }; }) } }));
vi.mock('@/lib/trigger-region', () => ({ regionOpts: () => ({}) }));
vi.mock('@/lib/gemini-video', () => ({ extrairConteudoDeVideo: vi.fn() }));
vi.mock('@/lib/rag-ingest', () => ({ parseDocument: vi.fn() }));

import { montarCatalogoDaEmpresa, nomesAmbiguos } from '@/lib/matriz-por-cargo';
import { criarModulosDeTranscricao, segmentarEEstruturarExtracao } from '@/lib/modulos-base/pipeline';
import { submeterTextoBaseAsync } from '@/actions/extracao-video';

const COORD = 'Coordenação Pedagógica';
const GESTAO = 'Gestão Escolar';
const PROF = 'Professor(a) de Educação Infantil';
const AUX = 'Auxiliar de Desenvolvimento Infantil';
const AUTOCUIDADO = 'Autocuidado e resiliência emocional';
const REGULACAO = 'Regulação emocional';

const linha = (id: string, cargo: string, cod_comp: string, nome: string, cod_desc: string | null, nome_curto: string | null) => ({
  id, empresa_id: 'e1', cargo, cod_comp, nome, cod_desc, nome_curto, pilar: 'Bem-estar', descricao: `desc ${cod_comp}`,
  descritor_completo: nome_curto ? `${nome_curto} (longo)` : null,
});

const FIXTURE = () => [
  // Ibipeba: mesmo nome, matrizes diferentes — Coordenação primeiro.
  linha('coo-comp', COORD, 'COO03', AUTOCUIDADO, null, null),
  linha('coo-d1', COORD, 'COO03', AUTOCUIDADO, 'COO03_D1', 'Consciência de limites'),
  linha('coo-d6', COORD, 'COO03', AUTOCUIDADO, 'COO03_D6', 'Busca de apoio'),
  linha('dir-comp', GESTAO, 'DIR02', AUTOCUIDADO, null, null),
  linha('dir-d1', GESTAO, 'DIR02', AUTOCUIDADO, 'DIR02_D1', 'Consciência de limites'),
  linha('dir-d6', GESTAO, 'DIR02', AUTOCUIDADO, 'DIR02_D6', 'Busca de apoio e rede'),
  // 4Life: a mesma matriz em dois cargos — Professor primeiro.
  linha('prof-comp', PROF, 'TCH12', REGULACAO, null, null),
  linha('prof-d1', PROF, 'TCH12', REGULACAO, 'TCH12_D1', 'Regulação sob pressão'),
  linha('aux-comp', AUX, 'TCH12', REGULACAO, null, null),
  linha('aux-d1', AUX, 'TCH12', REGULACAO, 'TCH12_D1', 'Regulação sob pressão'),
  // Nome único, fora de qualquer escopo direcionado aos outros.
  linha('com-comp', COORD, 'COO05', 'Comunicação', null, null),
  linha('com-d1', COORD, 'COO05', 'Comunicação', 'COO05_D1', 'Escuta ativa'),
];

const secao = (id: string, nome: string, descritor: string) => `===SECAO===
competencia_base_id: ${id}
competencia_nome: ${nome}
descritor: ${descritor}
nivel_entrada: N1
nivel_destino: N2
titulo: Seção
finalidade: Teste
---TEXTO---
${'Texto do material sobre pedir ajuda e montar rede de apoio na escola. '.repeat(8)}
===FIM===`;

const MATERIAL = 'Material sobre autocuidado, pedir ajuda e rede de apoio na rotina escolar. '.repeat(20);

beforeEach(() => {
  tabelas = { competencias: FIXTURE(), modulos_base_conteudo: [] };
  sb = criarMockDeTabelas(() => tabelas);
  respostaSegmentacao = '';
  promptsSegmentacao.length = 0;
  process.env.EXTRACAO_AUTO_AUDITAR = '0';
});

describe('catálogo da empresa por matriz', () => {
  it('mesmo nome com descritores diferentes → 2 entradas, cada uma só com os seus descritores e o cargo no rótulo', () => {
    const { entradas, nomeParaId } = montarCatalogoDaEmpresa(FIXTURE());
    const auto = entradas.filter((e) => e.nome === AUTOCUIDADO);
    expect(auto.map((e) => e.id).sort()).toEqual(['coo-comp', 'dir-comp']);
    const coo = auto.find((e) => e.id === 'coo-comp')!;
    const dir = auto.find((e) => e.id === 'dir-comp')!;
    expect(coo.descritores.map((d) => d.nome_curto)).toEqual(['Consciência de limites', 'Busca de apoio']);
    expect(dir.descritores.map((d) => d.nome_curto)).toEqual(['Consciência de limites', 'Busca de apoio e rede']);
    expect(coo.rotulo).toBe(`${AUTOCUIDADO} (${COORD})`);
    expect(nomeParaId.has(AUTOCUIDADO.toLowerCase())).toBe(false); // nome ambíguo não se resolve por nome
  });

  it('cópias idênticas → 1 entrada com os 2 cargos, ancorada no 1º em ordem alfabética', () => {
    const { entradas, nomeParaId } = montarCatalogoDaEmpresa(FIXTURE());
    const reg = entradas.filter((e) => e.nome === REGULACAO);
    expect(reg).toHaveLength(1);
    expect(reg[0].id).toBe('aux-comp');
    expect(reg[0].cargos).toEqual([AUX, PROF]);
    expect(reg[0].rotulo).toBe(REGULACAO);
    expect(nomeParaId.get(REGULACAO.toLowerCase())).toBe('aux-comp');
  });

  it('com cargo → só as matrizes dele (e o nome volta a ser único)', () => {
    const { entradas, nomeParaId } = montarCatalogoDaEmpresa(FIXTURE(), { cargo: COORD });
    expect(entradas.map((e) => e.id).sort()).toEqual(['com-comp', 'coo-comp']); // nada de Gestão Escolar nem do TCH12
    expect(entradas.find((e) => e.id === 'coo-comp')?.rotulo).toBe(AUTOCUIDADO);
    expect(nomeParaId.get(AUTOCUIDADO.toLowerCase())).toBe('coo-comp');
  });

  it('nomesAmbiguos lista o nome com os cargos das matrizes', () => {
    const ambiguos = nomesAmbiguos(montarCatalogoDaEmpresa(FIXTURE()).entradas);
    expect([...ambiguos]).toEqual([[AUTOCUIDADO, [COORD, GESTAO]]]);
  });
});

describe('extração direcionada (criarModulosDeTranscricao)', () => {
  it('competência de nome ambíguo sem cargo → ERRO pedindo o cargo, sem gastar IA (e não "material não aderente")', async () => {
    const r = await criarModulosDeTranscricao({ transcricao: MATERIAL, empresaId: 'e1', direcionamento: { competencia: AUTOCUIDADO } });
    expect(r.error).toMatch(/existe em mais de um cargo.*Coordenação Pedagógica, Gestão Escolar.*Escolha o cargo/);
    expect(r.semAderencia).toBeUndefined();
    expect(promptsSegmentacao).toHaveLength(0);
  });

  it('com o cargo, a IA recebe só a matriz dele', async () => {
    const r = await criarModulosDeTranscricao({ transcricao: MATERIAL, empresaId: 'e1', direcionamento: { competencia: AUTOCUIDADO, cargo: COORD } });
    expect(promptsSegmentacao.length).toBeGreaterThan(0);
    expect(promptsSegmentacao[0]).toContain('coo-comp');
    expect(promptsSegmentacao[0]).not.toContain('dir-comp');
    expect(promptsSegmentacao[0]).not.toContain('Busca de apoio e rede');
    expect(promptsSegmentacao[0]).toContain(`- Cargo: ${COORD}`);
    expect(r.semAderencia).toBe(true); // a IA mocada não devolveu seção: aí sim é "não aderente"
  });

  it('cargo sem competências na empresa → erro de configuração, sem IA', async () => {
    const r = await criarModulosDeTranscricao({ transcricao: MATERIAL, empresaId: 'e1', direcionamento: { cargo: 'Recreacionista' } });
    expect(r.error).toMatch(/Recreacionista.*não tem competências/);
    expect(r.semAderencia).toBeUndefined();
    expect(promptsSegmentacao).toHaveLength(0);
  });

  it('direcionamento inexistente também é erro (antes virava "material não aderente")', async () => {
    const r = await criarModulosDeTranscricao({ transcricao: MATERIAL, empresaId: 'e1', direcionamento: { competencia: 'Não existe' } });
    expect(r.error).toMatch(/não encontrado no catálogo da empresa/);
    expect(r.semAderencia).toBeUndefined();
  });
});

describe('o cargo atravessa a extração assíncrona (tabela extracoes_video)', () => {
  it('a action grava cargo_direcionador (aparado) junto com o direcionamento', async () => {
    // O insert faz `.select('id').maybeSingle()`: o banco devolve a linha com id,
    // o mock devolveria o payload sem id. Só esta tabela, só neste teste.
    const fromOriginal = sb.client.from;
    sb.client.from = (t: string) => {
      const b = fromOriginal(t);
      if (t !== 'extracoes_video') return b;
      const maybeSingleOriginal = b.maybeSingle;
      b.maybeSingle = async () => {
        const r = await maybeSingleOriginal();
        return r.data ? { data: { id: 'ext-novo', ...r.data }, error: null } : r;
      };
      return b;
    };
    const r = await submeterTextoBaseAsync('e1', {
      textoBase: MATERIAL, titulo: 'Material', direcionamento: { competencia: AUTOCUIDADO, cargo: `  ${COORD}  ` },
    });
    expect(r).toMatchObject({ success: true });
    const insert = sb.escritas.find((e) => e.tabela === 'extracoes_video' && e.op === 'insert')!;
    expect(insert.payload).toMatchObject({ competencia_direcionadora: AUTOCUIDADO, cargo_direcionador: COORD });
    expect(disparos.at(-1)?.[0]).toBe('estruturar-material');
  });

  it('segmentarEEstruturarExtracao lê o cargo gravado e o usa (sem ele, a mesma extração seria recusada)', async () => {
    const extracao = {
      id: 'ext-1', status: 'processing', modulo_base_ids: null, escopo_empresa_id: 'e1', url: 'material:x', transcricao: MATERIAL,
      pilar_direcionador: null, competencia_direcionadora: AUTOCUIDADO, competencia_base_id_direcionadora: null, cargo_direcionador: COORD,
    };
    tabelas.extracoes_video = [extracao];
    tabelas.empresas = [{ id: 'e1', default_locale: 'pt-BR' }];
    await segmentarEEstruturarExtracao('ext-1');
    expect(promptsSegmentacao.length).toBeGreaterThan(0);
    expect(promptsSegmentacao[0]).toContain('coo-comp');
    expect(promptsSegmentacao[0]).not.toContain('dir-comp');

    // Controle: a MESMA extração sem cargo é recusada antes da IA, com status de erro.
    promptsSegmentacao.length = 0;
    sb.reset();
    tabelas.extracoes_video = [{ ...extracao, cargo_direcionador: null }];
    const r = await segmentarEEstruturarExtracao('ext-1');
    expect(r.error).toMatch(/Escolha o cargo/);
    expect(promptsSegmentacao).toHaveLength(0);
    const update = sb.escritas.find((e) => e.tabela === 'extracoes_video' && e.op === 'update')!;
    expect(update.payload.status).toBe('error');
  });
});

describe('ancoragem do módulo extraído', () => {
  it('seção da matriz DIR02 com descritor de nome da COO03 → ancora em DIR02 com um descritor DA DIR02', async () => {
    respostaSegmentacao = secao('dir-comp', AUTOCUIDADO, 'Busca de apoio');
    await criarModulosDeTranscricao({ transcricao: MATERIAL, empresaId: 'e1' });
    const insert = sb.escritas.find((e) => e.tabela === 'modulos_base_conteudo' && e.op === 'insert');
    expect(insert?.payload.competencia_id).toBe('dir-comp');
    expect(insert?.payload.descritor).toBe('Busca de apoio e rede');
  });

  it('seção com id inválido não é resgatada pelo NOME de uma competência fora do escopo direcionado', async () => {
    // Direcionada para Regulação; a IA devolve id inválido com o nome "Comunicação"
    // (único no catálogo, mas FORA do escopo). O id resolvido por nome não é
    // re-checado depois — sem o recorte, o módulo ancoraria fora do escopo.
    respostaSegmentacao = secao('id-invalido', 'Comunicação', 'Escuta ativa');
    const r = await criarModulosDeTranscricao({ transcricao: MATERIAL, empresaId: 'e1', direcionamento: { competencia: REGULACAO } });
    expect(sb.escritas.some((e) => e.tabela === 'modulos_base_conteudo' && e.op === 'insert')).toBe(false);
    expect(r.semAderencia).toBe(true);
  });

  it('o catálogo enviado à IA mostra as duas matrizes separadas, cada uma com o cargo', async () => {
    await criarModulosDeTranscricao({ transcricao: MATERIAL, empresaId: 'e1' });
    expect(promptsSegmentacao[0]).toContain(`coo-comp :: ${AUTOCUIDADO} (${COORD})`);
    expect(promptsSegmentacao[0]).toContain(`dir-comp :: ${AUTOCUIDADO} (${GESTAO})`);
    expect(promptsSegmentacao[0].split(`:: ${REGULACAO}`).length - 1).toBe(1); // cópias idênticas: 1 entrada
  });
});
