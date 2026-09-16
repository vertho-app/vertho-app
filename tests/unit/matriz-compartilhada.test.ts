import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseMock } from '../helpers/supabase-mock';
import { criarMockDeTabelas } from '../helpers/tabela-filtrada';

/**
 * A MESMA MATRIZ EM VÁRIOS CARGOS — régua, definição e módulo-base (16/09/2026).
 *
 * Decisão do dono: o MÓDULO-BASE é feito uma vez por matriz e serve a todas as
 * cópias idênticas; o conteúdo que a pessoa recebe segue por cargo. E o que já
 * estava no ar em Ibipeba: "Autocuidado e resiliência emocional" existe em
 * Coordenação (COO03) e em Gestão Escolar (DIR02), com 5 descritores de mesmo nome
 * e 0 réguas iguais. A régua do fechamento lia "a última linha" — a coordenadora
 * recebia a de Gestão Escolar em 5 de 6 descritores —, e as trilhas que guardam o
 * descritor com código (`COO03_D1 — …`) não achavam régua nenhuma.
 *
 * A fixture põe as linhas de Coordenação ANTES (como a ordem física do banco):
 * "última linha vence" daria DIR02 à Coordenação, e é isso que os testes pegam.
 */

let sb: SupabaseMock;
let tabelas: Record<string, any[]> = {};

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => sb.client }));
vi.mock('@/lib/embeddings', () => ({ embedQuery: vi.fn(async () => null) }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => ''), callAIChat: vi.fn(async () => '') }));
vi.mock('@/lib/ai-tasks', () => ({ getModelForTask: vi.fn(async () => 'claude-sonnet-5'), DEFAULT_TASK_MODELS: {} }));
vi.mock('@/lib/degradacao', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/degradacao')>();
  return { ...mod, registrarDegradacao: vi.fn(async () => {}) };
});

import {
  assinaturaDaMatriz, idsDasCopiasEquivalentes, escolherLinhaDaRegua, escolherCopiaDaMatriz, caberNoLimite,
} from '@/lib/matriz-por-cargo';
import { enriquecerComRegua } from '@/lib/season-engine/regua';
import { carregarConhecimentoDescritor } from '@/lib/competencia-conhecimento';
import { resolverModuloBaseParaConteudo } from '@/lib/season-engine/modulo-base-integration';
import {
  resolverDescritores, montarReqsManuscrito, moduloJaExiste, chaveModulo, persistirModuloDeManuscrito,
} from '@/lib/manuscrito-modulos';
import { montarUserPrompt } from '@/lib/modulo-base-autor';
import { registrarDegradacao, DEGRADACAO } from '@/lib/degradacao';

const registrarSpy = vi.mocked(registrarDegradacao);

const COORD = 'Coordenação Pedagógica';
const GESTAO = 'Gestão Escolar';
const PROF = 'Professor(a) de Educação Infantil';
const AUX = 'Auxiliar de Desenvolvimento Infantil';
const AUTOCUIDADO = 'Autocuidado e resiliência emocional';

/** Linha de descritor com régua e definição que carregam o próprio código (a origem aparece no texto). */
function descritor(empresa_id: string, cargo: string, cod_desc: string, nome_curto: string, nome = AUTOCUIDADO, sufixoRegua = cod_desc) {
  return {
    id: `${cargo}:${cod_desc}`, empresa_id, cargo, cod_comp: cod_desc.split('_')[0], nome, cod_desc, nome_curto,
    descritor_completo: `definição ${sufixoRegua}`,
    n1_gap: `n1 ${sufixoRegua}`, n2_desenvolvimento: `n2 ${sufixoRegua}`, n3_meta: `n3 ${sufixoRegua}`, n4_referencia: `n4 ${sufixoRegua}`,
  };
}

/** O caso de Ibipeba: mesmos nomes, réguas diferentes, Coordenação primeiro. */
const IBIPEBA = () => [
  descritor('e1', COORD, 'COO03_D1', 'Consciência de limites'),
  descritor('e1', COORD, 'COO03_D6', 'Busca de apoio'),
  descritor('e1', GESTAO, 'DIR02_D1', 'Consciência de limites'),
  descritor('e1', GESTAO, 'DIR02_D6', 'Busca de apoio e rede'),
];

beforeEach(() => {
  tabelas = { competencias: IBIPEBA(), competencias_base: [], modulos_base_conteudo: [], micro_conteudos: [] };
  sb = criarMockDeTabelas(() => tabelas);
  registrarSpy.mockClear();
});

describe('critério de "mesma matriz"', () => {
  it('assinatura: cópias idênticas empatam (caixa e acento não contam); descritor diferente separa', () => {
    const prof = [descritor('e1', PROF, 'TCH12_D1', 'Regulação sob pressão'), descritor('e1', PROF, 'TCH12_D2', 'Busca de apoio')];
    const aux = [descritor('e1', AUX, 'TCH12_D2', 'busca de apoio'), descritor('e1', AUX, 'TCH12_D1', 'Regulacao sob pressao')];
    const outra = [descritor('e1', COORD, 'TCH12_D1', 'Regulação sob pressão'), descritor('e1', COORD, 'TCH12_D2', 'Outro descritor')];
    expect(assinaturaDaMatriz(prof)).toBe(assinaturaDaMatriz(aux));
    expect(assinaturaDaMatriz(prof)).not.toBe(assinaturaDaMatriz(outra));
  });

  it('cópias equivalentes: a cópia idêntica de outro cargo entra; o mesmo NOME com matriz diferente não', () => {
    const linhas = [
      { id: 'p1', cargo: PROF, cod_comp: 'TCH12', cod_desc: 'TCH12_D1', nome_curto: 'A' },
      { id: 'a1', cargo: AUX, cod_comp: 'TCH12', cod_desc: 'TCH12_D1', nome_curto: 'A' },
      { id: 'c1', cargo: COORD, cod_comp: 'COO03', cod_desc: 'COO03_D1', nome_curto: 'A' },
    ];
    expect(idsDasCopiasEquivalentes(linhas, AUX).sort()).toEqual(['a1', 'p1']);
    expect(idsDasCopiasEquivalentes(linhas, COORD)).toEqual(['c1']);
    expect(idsDasCopiasEquivalentes(linhas, 'Cargo sem matriz')).toEqual([]);
  });

  it('escolha da linha: código no texto > cargo > réguas idênticas > nada (ambígua)', () => {
    const linhas = IBIPEBA().filter((l) => l.nome_curto === 'Consciência de limites');
    expect(escolherLinhaDaRegua(linhas, { descritor: 'COO03_D1 — Consciência de limites' }).linha?.cod_desc).toBe('COO03_D1');
    expect(escolherLinhaDaRegua(linhas, { cargo: GESTAO, descritor: 'Consciência de limites' }).linha?.cod_desc).toBe('DIR02_D1');
    expect(escolherLinhaDaRegua(linhas, { descritor: 'Consciência de limites' })).toEqual({ linha: null, motivo: 'ambigua' });
    const identicas = [descritor('e1', PROF, 'TCH12_D1', 'X', 'Y', 'igual'), descritor('e1', AUX, 'TCH12_D1', 'X', 'Y', 'igual')];
    expect(escolherLinhaDaRegua(identicas, { cargo: 'Recreacionista' }).linha).not.toBeNull();
    expect(escolherLinhaDaRegua([], {})).toEqual({ linha: null, motivo: 'sem-linha' });
  });

  it('o código casa por TOKEN: COO03_D1 não casa dentro de COO03_D10', () => {
    const linhas = [descritor('e1', COORD, 'COO03_D1', 'X'), descritor('e1', GESTAO, 'DIR02_D1', 'X')];
    expect(escolherLinhaDaRegua(linhas, { descritor: 'COO03_D10 — X' }).motivo).toBe('ambigua');
  });

  it('cópia para gravar: idênticas → 1º cargo em ordem alfabética, com os ids equivalentes', () => {
    const linhas = [descritor('e1', PROF, 'TCH12_D1', 'A', 'N', 'igual'), descritor('e1', AUX, 'TCH12_D1', 'A', 'N', 'igual')];
    const r = escolherCopiaDaMatriz(linhas);
    if ('erro' in r) throw new Error(r.erro);
    expect(r.linhas.map((l) => l.cargo)).toEqual([AUX]);
    expect(r.cargos).toEqual([AUX, PROF]);
    expect(r.idsPorDescritor.get('TCH12_D1')?.sort()).toEqual([`${AUX}:TCH12_D1`, `${PROF}:TCH12_D1`]);
  });

  it('cópia para gravar: mesmo código com descritores diferentes → erro com os cargos; com cargo → a dele', () => {
    const linhas = [descritor('e1', PROF, 'TCH12_D1', 'A'), descritor('e1', COORD, 'TCH12_D1', 'Outro')];
    const semCargo = escolherCopiaDaMatriz(linhas);
    expect(semCargo).toMatchObject({ cargosDisponiveis: [COORD, PROF] });
    expect('erro' in semCargo && semCargo.erro).toMatch(/descritores diferentes.*Escolha o cargo/);
    const comCargo = escolherCopiaDaMatriz(linhas, PROF);
    if ('erro' in comCargo) throw new Error(comCargo.erro);
    expect(comCargo.linhas.map((l) => l.cargo)).toEqual([PROF]);
    expect('erro' in escolherCopiaDaMatriz(linhas, 'Inexistente')).toBe(true);
  });

  it('rótulo de cargos cabe no limite sem partir nome de cargo', () => {
    const tres = `${PROF} · ${AUX} · Recreacionista`;
    expect(tres.length).toBeGreaterThan(80);
    expect(caberNoLimite(tres, 80)).toBe(`${PROF} · ${AUX}`);
    expect(caberNoLimite(PROF, 80)).toBe(PROF);
    expect(caberNoLimite('x'.repeat(90), 80)).toHaveLength(80);
  });
});

describe('régua do fechamento/acumulada (enriquecerComRegua)', () => {
  const regua = (descritores: any[], extra: Record<string, unknown> = {}) =>
    enriquecerComRegua({ db: sb.client, sbGlobal: sb.client, empresaId: 'e1', competencia: AUTOCUIDADO, descritores, ...extra });

  it('coordenadora recebe a régua de COORDENAÇÃO, não a última linha lida (Gestão Escolar)', async () => {
    const [d] = await regua([{ descritor: 'Consciência de limites' }], { cargo: COORD });
    expect(d.n3_meta).toBe('n3 COO03_D1');
  });

  it('Gestão Escolar recebe a de Gestão Escolar', async () => {
    const [d] = await regua([{ descritor: 'Consciência de limites' }], { cargo: GESTAO });
    expect(d.n3_meta).toBe('n3 DIR02_D1');
  });

  it('descritor gravado com código casa (antes não achava régua nenhuma)', async () => {
    const [d] = await regua([{ descritor: 'COO03_D1 — Consciência de limites' }], { cargo: COORD });
    expect(d.n3_meta).toBe('n3 COO03_D1');
    expect(d.descritor).toBe('COO03_D1 — Consciência de limites'); // o rótulo da trilha não muda
  });

  it('mesmo sem cargo, o código no descritor decide', async () => {
    const [d] = await regua([{ descritor: 'DIR02_D1 — Consciência de limites' }]);
    expect(d.n3_meta).toBe('n3 DIR02_D1');
  });

  it('ambígua sem cargo → sem régua E registrada (não sorteia)', async () => {
    const [d] = await regua([{ descritor: 'Consciência de limites' }], {
      degradacao: { fluxo: 'trilha', chave: 'tr-1', empresaId: 'e1', colaboradorId: 'c-1' },
    });
    expect(d.n3_meta).toBeUndefined();
    expect(registrarSpy).toHaveBeenCalledWith(expect.objectContaining({
      fluxo: 'trilha', tipo: DEGRADACAO.REGUA_AUSENTE, chave: 'tr-1', severidade: 'aviso',
      detalhe: expect.objectContaining({ ausentes: [expect.objectContaining({ motivo: 'ambigua' })] }),
    }));
  });

  it('com régua para todos, não registra nada', async () => {
    await regua([{ descritor: 'Busca de apoio' }], { cargo: COORD, degradacao: { fluxo: 'trilha', chave: 'tr-1' } });
    expect(registrarSpy).not.toHaveBeenCalled();
  });

  it('nenhum descritor casa na empresa → catálogo global, também normalizado', async () => {
    tabelas.competencias_base = [{ ...descritor('x', 'todos', 'GLB_D1', 'Escuta ativa', 'Comunicação'), empresa_id: undefined }];
    const [d] = await enriquecerComRegua({
      db: sb.client, sbGlobal: sb.client, empresaId: 'e1', competencia: 'Comunicação', descritores: [{ descritor: 'GLB_D1 — Escuta ativa' }],
    });
    expect(d.n3_meta).toBe('n3 GLB_D1');
  });

  it('erro de leitura LANÇA — régua vazia viraria nota contra escala genérica', async () => {
    sb.falharEm({ tabela: 'competencias', op: 'select', mensagem: 'timeout no pool' });
    await expect(regua([{ descritor: 'Busca de apoio' }], { cargo: COORD })).rejects.toThrow(/timeout no pool/);
  });

  it('o objeto devolvido não ganha cargo/cod_desc (vai para prompt e para o slot gravado)', async () => {
    const [d] = await regua([{ descritor: 'Busca de apoio' }], { cargo: COORD });
    expect(Object.keys(d).sort()).toEqual(['descritor', 'n1_gap', 'n2_desenvolvimento', 'n3_meta', 'n4_referencia', 'nome_curto']);
  });
});

describe('definição do descritor para o Tira-Dúvidas', () => {
  it('código no descritor → a definição daquela linha', async () => {
    const c = await carregarConhecimentoDescritor(sb.client, 'e1', 'COO03_D1 — Consciência de limites', AUTOCUIDADO);
    expect(c?.descritor_completo).toBe('definição COO03_D1');
  });

  it('nome limpo + cargo → a do cargo', async () => {
    const c = await carregarConhecimentoDescritor(sb.client, 'e1', 'Consciência de limites', AUTOCUIDADO, GESTAO);
    expect(c?.descritor_completo).toBe('definição DIR02_D1');
  });

  it('nome limpo sem cargo, definições diferentes → nenhuma (o .limit(1) de antes sorteava)', async () => {
    expect(await carregarConhecimentoDescritor(sb.client, 'e1', 'Consciência de limites', AUTOCUIDADO)).toBeNull();
  });
});

describe('módulo-base por matriz (resolverModuloBaseParaConteudo)', () => {
  /** Mesma matriz em Professor e Auxiliar; Coordenação com o MESMO nome e outra matriz. */
  function cenario() {
    tabelas.competencias = [
      descritor('e1', PROF, 'TCH12_D1', 'Consciência de limites', 'Autocuidado', 'tch'),
      descritor('e1', AUX, 'TCH12_D1', 'Consciência de limites', 'Autocuidado', 'tch'),
      descritor('e1', COORD, 'COO03_D1', 'Consciência de limites', 'Autocuidado', 'coo'),
    ];
    const modulo = (id: string, competencia_id: string, extra: Record<string, unknown> = {}) => ({
      id, competencia_id, competencia_base_id: null, empresa_id: 'e1', status: 'publicado', locale: 'pt-BR',
      nivel_entrada: 'N1', nivel_destino: 'N2', descritor: 'Consciência de limites', titulo: id, auditoria_ia: { nota: 6 }, ...extra,
    });
    tabelas.modulos_base_conteudo = [
      modulo('mb-matriz-tch', `${PROF}:TCH12_D1`),
      // Mais forte em tudo — se o id da Coordenação vazar para o pool, ele VENCE.
      modulo('mb-coordenacao', `${COORD}:COO03_D1`, { preferido: true, auditoria_ia: { nota: 10 } }),
    ];
  }
  const resolver = (cargo?: string) => resolverModuloBaseParaConteudo(sb.client, { competenciaNome: 'Autocuidado', nivelMin: 1.5, cargo, empresaId: 'e1' });

  it('Auxiliar recebe o módulo feito na cópia do Professor (mesma matriz)', async () => {
    cenario();
    expect((await resolver(AUX))?.modulo.id).toBe('mb-matriz-tch');
  });

  it('a Coordenação, de nome igual e matriz diferente, não recebe o módulo do TCH — nem o TCH o dela', async () => {
    cenario();
    expect((await resolver(COORD))?.modulo.id).toBe('mb-coordenacao');
    expect((await resolver(PROF))?.modulo.id).toBe('mb-matriz-tch');
  });

  it('cargo sem cópia da matriz não recebe módulo de outro cargo', async () => {
    cenario();
    expect(await resolver('Recreacionista')).toBeNull();
  });

  it("sem cargo ou 'todos': comportamento de antes (todos os ids do nome)", async () => {
    cenario();
    expect((await resolver())?.modulo.id).toBe('mb-coordenacao');
    expect((await resolver('todos'))?.modulo.id).toBe('mb-coordenacao');
  });
});

describe('import de manuscrito com a matriz em vários cargos', () => {
  const parse = {
    cod_comp: 'TCH12', cargo: 'Professor', titulo: 'T', subtitulo: 'S', stats: {}, avisos: [], recursos: [],
    descritores: [{
      indice: 1, descritor: 'Consciência de limites',
      transicoes: [{ nivel_entrada: 'N1', nivel_destino: 'N2', microblocos: ['MB01'], textoFonte: 'fonte', chars: 5 }],
    }],
  } as any;
  const copia = (cargo: string, nome_curto = 'Consciência de limites') => descritor('e1', cargo, 'TCH12_D1', nome_curto, 'Autocuidado', 'tch');

  it('cópias idênticas: ancora numa só (ordem alfabética) e devolve os ids das duas', async () => {
    tabelas.competencias = [copia(PROF), copia(AUX)];
    const r = await resolverDescritores(sb.client, parse, 'e1');
    expect(r.error).toBeUndefined();
    expect(r.resolvidos).toHaveLength(1); // era "o manuscrito tem 1, TCH12 tem 2"
    expect(r.resolvidos![0].comp.cargo).toBe(AUX);
    expect(r.resolvidos![0].idsEquivalentes!.sort()).toEqual([`${AUX}:TCH12_D1`, `${PROF}:TCH12_D1`]);
    expect(r.resolvidos![0].cargosDaMatriz).toEqual([AUX, PROF]);
  });

  it('mesmo código com descritores diferentes: erro com os cargos, e o cargo escolhido resolve', async () => {
    tabelas.competencias = [copia(PROF), copia(COORD, 'Outro descritor')];
    const r = await resolverDescritores(sb.client, parse, 'e1');
    expect(r.error).toMatch(/Escolha o cargo/);
    expect(r.cargosDisponiveis).toEqual([COORD, PROF]);
    const escolhido = await resolverDescritores(sb.client, parse, 'e1', { cargo: PROF });
    expect(escolhido.resolvidos![0].comp.cargo).toBe(PROF);
    expect(escolhido.resolvidos![0].idsEquivalentes).toEqual([`${PROF}:TCH12_D1`]);
  });

  it('idempotência reconhece o módulo ancorado em QUALQUER cópia (a 1ª ou a última da lista)', () => {
    const ids = [`${AUX}:TCH12_D1`, `${PROF}:TCH12_D1`];
    // Um teste com o módulo só na última posição passava verde com `ids.slice(-1)` (medido por mutação).
    for (const ancorado of ids) {
      const existentes = new Set([chaveModulo(ancorado, 'N1', 'N2')]);
      expect(moduloJaExiste(existentes, ids, 'N1', 'N2')).toBe(true);
      expect(moduloJaExiste(existentes, ids, 'N2', 'N3')).toBe(false);
    }
    expect(moduloJaExiste(new Set([chaveModulo(ids[1], 'N1', 'N2')]), [ids[0]], 'N1', 'N2')).toBe(false);
  });

  it('a autoria nomeia os cargos da matriz; com um cargo só, o prompt é o de antes', async () => {
    tabelas.competencias = [copia(PROF), copia(AUX)];
    const compartilhada = await resolverDescritores(sb.client, parse, 'e1');
    const [req] = montarReqsManuscrito({ parse, resolvidos: compartilhada.resolvidos! });
    expect(req.contextoCargo).toBe(`${AUX} · ${PROF}`);
    expect(req.user).toContain(PROF);
    expect(req.user).toContain(AUX);

    tabelas.competencias = [copia(PROF)];
    const unica = await resolverDescritores(sb.client, parse, 'e1');
    const [reqUnica] = montarReqsManuscrito({ parse, resolvidos: unica.resolvidos! });
    const comp = unica.resolvidos![0].comp;
    expect(reqUnica.contextoCargo).toBe(PROF);
    expect(reqUnica.user).toBe(montarUserPrompt(comp, 'N1', 'N2', {
      docxTexto: 'fonte', termoCanonico: undefined, limiteFonte: 80000, contextoCargo: comp.cargo || undefined,
    }));
  });

  it('contexto_pedagogico respeita o CHECK de 80 caracteres sem partir nome de cargo', async () => {
    const r = await persistirModuloDeManuscrito(sb.client, {
      comp: copia(PROF) as any, empresaId: 'e1', nivel_entrada: 'N1', nivel_destino: 'N2', locale: 'pt-BR',
      descritor: 'Consciência de limites', corpo: { conteudo_central: {}, conteudo_aplicavel: {}, guarda_corpos: {}, adaptacao_por_formato: {} },
      codManuscrito: 'TCH12', microblocos: [], createdBy: 'teste', contextoCargo: `${PROF} · ${AUX} · Recreacionista`,
    });
    expect(r.error).toBeUndefined();
    const insert = sb.escritas.find((e) => e.tabela === 'modulos_base_conteudo' && e.op === 'insert')!;
    expect(insert.payload.contexto_pedagogico).toBe(`${PROF} · ${AUX}`);
    expect(insert.payload.contexto_pedagogico.length).toBeLessThanOrEqual(80);
  });
});
