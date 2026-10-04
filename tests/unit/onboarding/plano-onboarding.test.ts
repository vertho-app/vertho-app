import { describe, it, expect, vi } from 'vitest';

/**
 * O PLANO de um Onboarding inteiro, montado pelo `buildSeason` de verdade
 * (Supabase e IA mockados).
 *
 * R-20 (04/10/2026): o desenho antigo tinha uma semana 1 de "calibragem" que
 * nunca teve implementação. O `buildSeason` classifica por exclusão, então ela
 * nascia como semana de CONTEÚDO sem descritor e sem conteúdo: sem nada para
 * abrir, o botão de Evidências ficava desabilitado, a semana nunca concluía e o
 * gate sequencial trancava as semanas seguintes para sempre. O programa agora
 * começa no fundamento. Este teste olha o plano que sai do motor, não só as
 * constantes da config: é o que a pessoa recebe.
 */

const COMPETENCIAS = ['Comp A', 'Comp B', 'Comp C', 'Comp D', 'Comp E'];

// Um conteúdo por descritor (o mock não filtra por competência: a seleção casa
// pelo descritor, que aqui é único por competência).
const MICRO_CONTEUDOS = COMPETENCIAS.map((comp, i) => ({
  id: `c${i}`, titulo: `Vídeo ${comp}`, formato: 'video', competencia: comp, descritor: `D${i}`, ativo: true, url: `u${i}`,
}));

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

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => mockSb }));
vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn(async () => '{}') }));

import { buildSeason } from '@/lib/season-engine/build-season';
import { PROGRAMA_ONBOARDING, PROGRAMA_JORNADA } from '@/lib/season-engine/programa-config';
import { selectDescriptorsMulti, type AssessmentPorCompetencia } from '@/lib/season-engine/select-descriptors';

const ASSESSMENTS: AssessmentPorCompetencia[] = COMPETENCIAS.map((competencia, i) => ({
  competencia, assessment: [{ descritor: `D${i}`, nota: 1.5 + i * 0.2 }],
}));

async function planoDoOnboarding() {
  const descritores = selectDescriptorsMulti(ASSESSMENTS, PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!);
  const semanas = await buildSeason({
    descritoresSelecionados: descritores,
    competencia: COMPETENCIAS[0],
    competencias: COMPETENCIAS,
    cargo: 'Professor',
    programaConfig: PROGRAMA_ONBOARDING,
  });
  return semanas as any[];
}

describe('nível-meta 2 no plano do Onboarding (R-100)', () => {
  it('o conteúdo mira o meio entre a nota e o N2, e o alvo gravado no plano é 2', async () => {
    niveisBuscados.length = 0;
    const plano = await planoDoOnboarding();
    // Nota 1,5 (D0), 1,7 (D1)...: (nota + 2) / 2. Com a meta 3 seria (nota + 3) / 2.
    expect(niveisBuscados.slice(0, 5)).toEqual([1.75, 1.85, 1.95, 2.05, 2.15].map((n) => expect.closeTo(n, 5)));
    expect(plano.filter((s) => s.tipo === 'conteudo').map((s) => s.nivel_alvo)).toEqual([2, 2, 2, 2, 2]);
  });

  it('a Jornada segue na meta 3: o mesmo motor, outro alvo, byte a byte como antes', async () => {
    niveisBuscados.length = 0;
    const descritores = selectDescriptorsMulti(ASSESSMENTS, PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!, 3);
    const plano = (await buildSeason({
      descritoresSelecionados: descritores.map((d) => ({ ...d, semanas_ids: d.semanas_ids })),
      competencia: COMPETENCIAS[0],
      cargo: 'Professor',
      programaConfig: { ...PROGRAMA_JORNADA, conteudosPorSemana: 1, semanas: 2, slotsConteudo: [1, 2], semanasAvaliacao: [], desafioUnicoPorCompetencia: false },
    })) as any[];
    expect(niveisBuscados[0]).toBeCloseTo((1.5 + 3) / 2, 5);
    expect(plano[0].nivel_alvo).toBe(3);
  });
});

describe('plano do Onboarding (R-20)', () => {
  it('tem 9 semanas, e a primeira já é fundamento COM conteúdo para abrir', async () => {
    const plano = await planoDoOnboarding();
    expect(plano).toHaveLength(9);
    const s1 = plano[0];
    expect(s1.semana).toBe(1);
    expect(s1.tipo).toBe('conteudo');
    expect(s1.descritor).toBe('D0');
    expect(s1.competencia).toBe('Comp A');
    expect(s1.conteudo?.core_id).toBe('c0');
    expect(s1.status).toBe('disponivel');
  });

  it('nenhuma semana de conteúdo nasce vazia (sem descritor ou sem conteúdo)', async () => {
    const plano = await planoDoOnboarding();
    const vazias = plano.filter((s) => s.tipo === 'conteudo' && (!s.descritor || !s.conteudo));
    expect(vazias.map((s) => s.semana)).toEqual([]);
  });

  it('cada fundamento é de uma competência, na ordem do Top 5', async () => {
    const plano = await planoDoOnboarding();
    const porSemana = Object.fromEntries(plano.filter((s) => s.tipo === 'conteudo').map((s) => [s.semana, s.competencia]));
    expect(porSemana).toEqual({ 1: 'Comp A', 2: 'Comp B', 4: 'Comp C', 5: 'Comp D', 7: 'Comp E' });
  });

  it('missões integradoras em 3, 6 e 8; avaliação final na 9', async () => {
    const plano = await planoDoOnboarding();
    expect(plano.map((s) => s.tipo)).toEqual([
      'conteudo', 'conteudo', 'aplicacao', 'conteudo', 'conteudo', 'aplicacao', 'conteudo', 'aplicacao', 'avaliacao',
    ]);
    expect(plano[8].descritores_cobertos).toEqual(['D0', 'D1', 'D2', 'D3', 'D4']);
  });

  it('a missão só cobra o que já foi entregue: 1+2, depois 3+4, e a última cumulativa', async () => {
    const plano = await planoDoOnboarding();
    const cobertas = (n: number) => plano.find((s) => s.semana === n).competencias_cobertas;
    expect(cobertas(3)).toEqual(['Comp A', 'Comp B']);
    expect(cobertas(6)).toEqual(['Comp C', 'Comp D']);
    expect(cobertas(8)).toEqual(COMPETENCIAS);
  });
});
