import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * O PLANO de um Onboarding inteiro, montado pelo `buildSeason` de verdade
 * (Supabase e IA mockados).
 *
 * R-20 (04/10/2026): o desenho antigo tinha uma semana 1 de "calibragem" que
 * nunca teve implementação. O `buildSeason` classifica por exclusão, então ela
 * nascia como semana de CONTEÚDO sem descritor e sem conteúdo: sem nada para
 * abrir, o botão de Evidências ficava desabilitado, a semana nunca concluía e o
 * gate sequencial trancava as semanas seguintes para sempre.
 *
 * Decisão do dono (04/10/2026): 10 semanas de conteúdo, 12 no total. A semana 1 é
 * o MAPEAMENTO (um tipo declarado, que nasce concluído), as semanas 2 a 11 são 5
 * competências de 2 semanas cada (2 conteúdos por semana, no modelo da Jornada,
 * sem missão) e a 12 é o Encerramento. Este teste olha o plano que sai do motor,
 * não só as constantes da config: é o que a pessoa recebe.
 */

const COMPETENCIAS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];
const SIGLAS = ['A', 'B', 'C', 'D', 'E'];

// 4 descritores por competência (2 por semana x 2 semanas), notas distintas, e um
// conteúdo por descritor (o mock não filtra por competência: a seleção casa pelo
// descritor, que aqui é único no programa inteiro).
const NOTAS = [1.2, 1.5, 1.8, 2.1];
const ASSESSMENTS_DE = (i: number) => NOTAS.map((nota, n) => ({ descritor: `${SIGLAS[i]}${n + 1}`, nota: nota + i * 0.05 }));
const MICRO_CONTEUDOS = COMPETENCIAS.flatMap((comp, i) => ASSESSMENTS_DE(i).map((a) => ({
  id: `c-${a.descritor}`, titulo: `Vídeo ${a.descritor}`, formato: 'video', competencia: comp, descritor: a.descritor, ativo: true, url: `u-${a.descritor}`,
})));

/** O `lte('nivel_min', x)` de cada busca de conteúdo: `x` é o nível que o motor mirou. */
const niveisBuscados: number[] = [];

function chainable(result: any[]) {
  const q: any = {};
  const self = () => q;
  for (const m of ['select', 'eq', 'gte', 'or', 'is', 'in', 'not', 'order', 'limit']) q[m] = vi.fn(self);
  q.lte = vi.fn((coluna: string, valor: number) => { if (coluna === 'nivel_min') niveisBuscados.push(valor); return q; });
  q.maybeSingle = vi.fn(async () => ({ data: null }));
  q.then = (resolve: any) => resolve({ data: result });
  return q;
}

const mockSb = { from: vi.fn((table: string) => chainable(table === 'micro_conteudos' ? MICRO_CONTEUDOS : [])) };
const callAI = vi.hoisted(() => vi.fn(async () => '{}'));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mockSb }));
vi.mock('@/actions/ai-client', () => ({ callAI }));

import { buildSeason } from '@/lib/season-engine/build-season';
import { PROGRAMA_ONBOARDING, PROGRAMA_JORNADA } from '@/lib/season-engine/programa-config';
import { selectDescriptors, selectDescriptorsMulti, type AssessmentPorCompetencia } from '@/lib/season-engine/select-descriptors';

const ASSESSMENTS: AssessmentPorCompetencia[] = COMPETENCIAS.map((competencia, i) => ({ competencia, assessment: ASSESSMENTS_DE(i) }));

function selecionados(nivelMeta = PROGRAMA_ONBOARDING.nivelMetaAlvo) {
  return selectDescriptorsMulti(ASSESSMENTS, PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!, nivelMeta, PROGRAMA_ONBOARDING.conteudosPorSemana);
}

async function planoDoOnboarding() {
  const semanas = await buildSeason({
    descritoresSelecionados: selecionados(),
    competencia: COMPETENCIAS[0],
    competencias: COMPETENCIAS,
    cargo: 'Professor',
    programaConfig: PROGRAMA_ONBOARDING,
  });
  return semanas as any[];
}

beforeEach(() => callAI.mockClear());

describe('nível-meta 2 no plano do Onboarding (R-100)', () => {
  it('o conteúdo mira o meio entre a nota e o N2, e o alvo gravado no plano é 2', async () => {
    niveisBuscados.length = 0;
    const plano = await planoDoOnboarding();
    // (nota + 2) / 2 para cada entrega, na ordem das semanas. Com a meta 3 seria (nota + 3) / 2.
    const esperados = selecionados().map((d) => (d.nota_atual + 2) / 2);
    expect(niveisBuscados).toHaveLength(20);
    expect(niveisBuscados).toEqual(esperados.map((n) => expect.closeTo(n, 5)));
    expect(plano.filter((s) => s.tipo === 'conteudo').map((s) => s.nivel_alvo)).toEqual(Array(10).fill(2));
  });

  it('a Jornada segue na meta 3: o mesmo motor, outro alvo, byte a byte como antes', async () => {
    niveisBuscados.length = 0;
    const assessment = ASSESSMENTS_DE(0);
    const plano = (await buildSeason({
      descritoresSelecionados: selectDescriptors(assessment, [1, 2]),
      competencia: COMPETENCIAS[0],
      cargo: 'Professor',
      programaConfig: { ...PROGRAMA_JORNADA, conteudosPorSemana: 1, semanas: 2, slotsConteudo: [1, 2], semanasAvaliacao: [], desafioUnicoPorCompetencia: false },
    })) as any[];
    expect(niveisBuscados[0]).toBeCloseTo((assessment[0].nota + 3) / 2, 5);
    expect(plano[0].nivel_alvo).toBe(3);
  });
});

describe('plano do Onboarding de 12 semanas', () => {
  it('tem 12 semanas: mapeamento, 10 de conteúdo e a avaliação final', async () => {
    const plano = await planoDoOnboarding();
    expect(plano).toHaveLength(12);
    expect(plano.map((s) => s.tipo)).toEqual([
      'mapeamento', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'conteudo', 'avaliacao',
    ]);
    expect(plano.map((s) => s.semana)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('a semana 1 é o Mapeamento: um tipo próprio, sem conteúdo, sem descritor e sem IA', async () => {
    const plano = await planoDoOnboarding();
    const s1 = plano[0];
    expect(s1.tipo).toBe('mapeamento');
    expect(s1.descritor).toBeNull();
    expect(s1.descritores_cobertos).toEqual([]);
    expect(s1.competencias_cobertas).toEqual(COMPETENCIAS);
    expect(s1.conteudo).toBeUndefined();
    expect(s1.conteudos_dia).toBeUndefined();
    expect(s1.status).toBe('disponivel');
    // Nenhuma chamada de IA em todo o build: sem missão, sem desafio por IA, sem cenário.
    expect(callAI).not.toHaveBeenCalled();
  });

  it('nenhuma semana de conteúdo nasce vazia: 2 conteúdos, 2 descritores, cada um com o seu conteúdo', async () => {
    const plano = await planoDoOnboarding();
    const conteudos = plano.filter((s) => s.tipo === 'conteudo');
    expect(conteudos).toHaveLength(10);
    for (const s of conteudos) {
      expect(s.conteudos_dia, `semana ${s.semana}`).toHaveLength(2);
      expect(s.descritores_cobertos, `semana ${s.semana}`).toHaveLength(2);
      expect(new Set(s.descritores_cobertos).size, `semana ${s.semana}: descritores distintos`).toBe(2);
      for (const e of s.conteudos_dia) {
        expect(e.conteudo?.core_id, `semana ${s.semana}`).toBeTruthy();
        expect(e.conteudo?.fallback_gerado, `semana ${s.semana}`).toBe(false);
      }
    }
  });

  it('cada competência ocupa 2 semanas seguidas, na ordem do Top 5, com os de maior gap primeiro', async () => {
    const plano = await planoDoOnboarding();
    const porSemana = Object.fromEntries(plano.filter((s) => s.tipo === 'conteudo').map((s) => [s.semana, s.competencia]));
    expect(porSemana).toEqual({
      2: 'Comp A', 3: 'Comp A', 4: 'Comp B', 5: 'Comp B', 6: 'Comp C', 7: 'Comp C', 8: 'Comp D', 9: 'Comp D', 10: 'Comp E', 11: 'Comp E',
    });
    // Os conteúdos da semana são da competência DELA (e não da âncora, a 1ª da trilha).
    for (const s of plano.filter((p) => p.tipo === 'conteudo')) {
      for (const e of s.conteudos_dia) expect(e.competencia).toBe(s.competencia);
    }
    expect(plano[1].descritores_cobertos).toEqual(['A1', 'A2']); // notas 1.2 e 1.5
    expect(plano[2].descritores_cobertos).toEqual(['A3', 'A4']);
  });

  it('o mesmo conteúdo nunca aparece duas vezes no programa', async () => {
    const plano = await planoDoOnboarding();
    const cores = plano.filter((s) => s.tipo === 'conteudo').flatMap((s) => s.conteudos_dia.map((e: any) => e.conteudo.core_id));
    expect(cores).toHaveLength(20);
    expect(new Set(cores).size).toBe(20);
  });

  it('não há semana de missão nem de aplicação: a tarefa é o desafio da semana', async () => {
    const plano = await planoDoOnboarding();
    expect(plano.some((s) => s.tipo === 'aplicacao')).toBe(false);
    expect(plano.some((s) => s.missao || s.cenario)).toBe(false);
  });

  it('a avaliação final (semana 12) cobre os 20 descritores do programa', async () => {
    const plano = await planoDoOnboarding();
    const final = plano[11];
    expect(final.tipo).toBe('avaliacao');
    expect(final.semana).toBe(12);
    expect(final.descritores_cobertos).toHaveLength(20);
    expect(final.status).toBe('bloqueada');
  });

  it('só a semana 1 nasce disponível; as demais, bloqueadas até a progressão', async () => {
    const plano = await planoDoOnboarding();
    expect(plano.filter((s) => s.status === 'disponivel').map((s) => s.semana)).toEqual([1]);
  });

  it('outros modos NÃO ganham semana de mapeamento (a Jornada segue com 7 semanas de 1 a 7)', async () => {
    const plano = (await buildSeason({
      descritoresSelecionados: selectDescriptors(ASSESSMENTS_DE(0), [1, 2]),
      competencia: COMPETENCIAS[0],
      cargo: 'Professor',
      programaConfig: { ...PROGRAMA_JORNADA, conteudosPorSemana: 1, semanas: 3, slotsConteudo: [1, 2], semanasAvaliacao: [3], desafioUnicoPorCompetencia: false },
    })) as any[];
    expect(plano.map((s) => s.tipo)).toEqual(['conteudo', 'conteudo', 'avaliacao']);
  });
});
