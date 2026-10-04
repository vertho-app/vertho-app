import { describe, it, expect } from 'vitest';
import {
  PROGRAMA_REGULAR,
  PROGRAMA_REGULAR_DUO,
  PROGRAMA_JORNADA,
  PROGRAMA_PILOTO,
  PROGRAMA_ONBOARDING,
  getProgramaConfig,
  descritoresCobertosNaMissao,
  ehSemanaDeMapeamento,
  semanasDeMapeamentoDoPrograma,
} from '@/lib/season-engine/programa-config';
import {
  selectDescriptors,
  selectDescriptorsMulti,
  selectDescriptorsDuo,
  descritoresEsperadosNoOnboarding,
  type AssessmentPorCompetencia,
} from '@/lib/season-engine/select-descriptors';

/**
 * Estrutura do template Onboarding. O brief desenhava 10 semanas com uma semana 1
 * de calibragem que nunca teve implementação (R-20); em 04/10/2026 o dono decidiu
 * 10 semanas de conteúdo e 12 no total, com o Mapeamento na 1 e o Encerramento na 12:
 *   12 sem · 5 comps x 2 sem · 2 conteúdos por semana · sem missão · cenário B sem 12
 *   · acumulada sem 11 · nível-meta 2.
 *
 * Estes testes pegam regressão se alguém mexer nos números sem querer.
 */
describe('Onboarding — programa-config', () => {
  describe('PROGRAMA_REGULAR (single — escape hatch regular_single)', () => {
    it('tem 14 semanas com missões 4/8/12 e avaliação 13/14', () => {
      expect(PROGRAMA_REGULAR.semanas).toBe(14);
      expect(PROGRAMA_REGULAR.semanasMissao).toEqual([4, 8, 12]);
      expect(PROGRAMA_REGULAR.semanasAvaliacao).toEqual([13, 14]);
      expect(PROGRAMA_REGULAR.semanaCenarioB).toBe(14);
      expect(PROGRAMA_REGULAR.semanaAcumulada).toBe(13);
    });
    it('aloca 1 competência aprofundada com nível-meta 3', () => {
      expect(PROGRAMA_REGULAR.numCompetencias).toBe(1);
      expect(PROGRAMA_REGULAR.nivelMetaAlvo).toBe(3);
    });
    it('tem 9 slots de conteúdo distribuídos em blocos de 3', () => {
      expect(PROGRAMA_REGULAR.slotsConteudo).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11]);
    });
    it('blocosCobertos cumulativos: 3 → 6 → todos', () => {
      expect(PROGRAMA_REGULAR.blocosCobertos).toEqual({ 4: 3, 8: 6, 12: -1 });
    });
    it('NÃO tem mapping multi-competência (single)', () => {
      expect(PROGRAMA_REGULAR.semanaParaCompetenciaIdx).toBeUndefined();
      expect(PROGRAMA_REGULAR.competenciasNaMissao).toBeUndefined();
    });
  });

  describe('PROGRAMA_REGULAR_DUO (default GLOBAL)', () => {
    it('mantém o esqueleto Regular: 14 sem, missões 4/8/12, avaliação 13/14', () => {
      expect(PROGRAMA_REGULAR_DUO.semanas).toBe(14);
      expect(PROGRAMA_REGULAR_DUO.semanasMissao).toEqual([4, 8, 12]);
      expect(PROGRAMA_REGULAR_DUO.semanasAvaliacao).toEqual([13, 14]);
      expect(PROGRAMA_REGULAR_DUO.semanaCenarioB).toBe(14);
      expect(PROGRAMA_REGULAR_DUO.semanaAcumulada).toBe(13);
      expect(PROGRAMA_REGULAR_DUO.slotsConteudo).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11]);
    });
    it('aloca 2 competências mantendo nível-meta 3 (profundidade Regular)', () => {
      expect(PROGRAMA_REGULAR_DUO.numCompetencias).toBe(2);
      expect(PROGRAMA_REGULAR_DUO.nivelMetaAlvo).toBe(3);
      expect(PROGRAMA_REGULAR_DUO.modo).toBe('regular');
    });
    it('todas as missões são integradoras das 2 comps (-1 = todas)', () => {
      expect(PROGRAMA_REGULAR_DUO.competenciasNaMissao).toEqual({ 4: [-1], 8: [-1], 12: [-1] });
    });
    it('NÃO usa semanaParaCompetenciaIdx (a comp vem do descritor)', () => {
      expect(PROGRAMA_REGULAR_DUO.semanaParaCompetenciaIdx).toBeUndefined();
    });
  });

  describe('PROGRAMA_ONBOARDING (12 semanas, decisão do dono de 04/10/2026)', () => {
    it('tem 12 semanas: 10 de conteúdo, o Mapeamento na 1 e o Encerramento na 12', () => {
      expect(PROGRAMA_ONBOARDING.semanas).toBe(12);
      expect(PROGRAMA_ONBOARDING.semanasMapeamento).toEqual([1]);
      expect(PROGRAMA_ONBOARDING.slotsConteudo).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(PROGRAMA_ONBOARDING.semanasAvaliacao).toEqual([12]);
      expect(PROGRAMA_ONBOARDING.semanaCenarioB).toBe(12);
    });
    it('sem semana dedicada de missão: o modelo da Jornada (um desafio por semana)', () => {
      expect(PROGRAMA_ONBOARDING.semanasMissao).toEqual([]);
      expect(PROGRAMA_ONBOARDING.blocosCobertos).toEqual({});
      expect(PROGRAMA_ONBOARDING.complexidadeMap).toEqual({});
      expect(PROGRAMA_ONBOARDING.competenciasNaMissao).toBeUndefined();
      expect(PROGRAMA_ONBOARDING.desafioUnicoPorCompetencia).toBe(true);
    });
    it('2 conteúdos por semana, como a Jornada', () => {
      expect(PROGRAMA_ONBOARDING.conteudosPorSemana).toBe(2);
    });
    it('acumulada na sem 11, a última de conteúdo (a penúltima, como a Jornada)', () => {
      expect(PROGRAMA_ONBOARDING.semanaAcumulada).toBe(11);
      expect(PROGRAMA_ONBOARDING.semanaAcumulada).toBe(Math.max(...PROGRAMA_ONBOARDING.slotsConteudo));
      expect(PROGRAMA_ONBOARDING.semanaAcumulada).toBe(PROGRAMA_ONBOARDING.semanaCenarioB - 1);
    });
    it('aloca 5 competências com nível-meta 2 (o scorer segue na régua absoluta)', () => {
      expect(PROGRAMA_ONBOARDING.numCompetencias).toBe(5);
      expect(PROGRAMA_ONBOARDING.nivelMetaAlvo).toBe(2);
    });
    it('2 semanas por competência, na ordem do Top 5', () => {
      expect(PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx).toEqual({ 2: 0, 3: 0, 4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3, 10: 4, 11: 4 });
      // Cada slot de conteúdo tem uma competência, e só eles.
      expect(Object.keys(PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!).map(Number).sort((a, b) => a - b))
        .toEqual([...PROGRAMA_ONBOARDING.slotsConteudo].sort((a, b) => a - b));
      // Cada uma das 5 competências ocupa exatamente 2 semanas.
      const porComp = Object.values(PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!).reduce<Record<number, number>>((acc, i) => ({ ...acc, [i]: (acc[i] || 0) + 1 }), {});
      expect(porComp).toEqual({ 0: 2, 1: 2, 2: 2, 3: 2, 4: 2 });
    });
    it('toda semana de 1 a 12 tem um papel: nenhum buraco como o da calibragem (R-20)', () => {
      const papeis = [
        ...(PROGRAMA_ONBOARDING.semanasMapeamento ?? []),
        ...PROGRAMA_ONBOARDING.slotsConteudo,
        ...PROGRAMA_ONBOARDING.semanasMissao,
        ...PROGRAMA_ONBOARDING.semanasAvaliacao,
      ].sort((a, b) => a - b);
      expect(papeis).toEqual(Array.from({ length: PROGRAMA_ONBOARDING.semanas }, (_, i) => i + 1));
    });
    it('sem checkpoint do gestor: eram as semanas das missões (3 e 6), que não existem mais', () => {
      expect(PROGRAMA_ONBOARDING.semanasCheckpoint).toEqual([]);
    });
    it('o calendário não espelha semana nenhuma (o recuo mora no data_inicio da trilha)', () => {
      expect(PROGRAMA_ONBOARDING.semanaEspelhoCalendario).toBeUndefined();
    });
    it('nenhum outro modo tem semana de mapeamento', () => {
      for (const cfg of [PROGRAMA_REGULAR, PROGRAMA_REGULAR_DUO, PROGRAMA_JORNADA, PROGRAMA_PILOTO]) {
        expect(cfg.semanasMapeamento).toBeUndefined();
        expect(semanasDeMapeamentoDoPrograma(cfg)).toBe(0);
        expect(ehSemanaDeMapeamento(cfg, 1)).toBe(false);
      }
      expect(semanasDeMapeamentoDoPrograma(PROGRAMA_ONBOARDING)).toBe(1);
      expect(ehSemanaDeMapeamento(PROGRAMA_ONBOARDING, 1)).toBe(true);
      expect(ehSemanaDeMapeamento(PROGRAMA_ONBOARDING, 2)).toBe(false);
    });
  });

  describe('getProgramaConfig(sys_config)', () => {
    it('padrão (sys_config null/vazio) → JORNADA de 7 semanas, 1 comp (desde 03/10/2026)', () => {
      expect(getProgramaConfig(null).semanas).toBe(7);
      expect(getProgramaConfig(undefined).semanas).toBe(7);
      expect(getProgramaConfig({}).numCompetencias).toBe(1);
      expect(getProgramaConfig({}).modo).toBe('regular');
    });
    it('programa_modo desconhecido → Jornada (o padrão, não mais o DUO)', () => {
      const c = getProgramaConfig({ programa_modo: 'xyz' as any });
      expect(c.numCompetencias).toBe(1);
      expect(c.semanas).toBe(7);
    });
    it('programa_modo="regular_single" → REGULAR single (escape hatch)', () => {
      const c = getProgramaConfig({ programa_modo: 'regular_single' });
      expect(c.numCompetencias).toBe(1);
      expect(c.semanas).toBe(14);
      expect(c.semanaParaCompetenciaIdx).toBeUndefined();
    });
    it('programa_modo="onboarding" → ONBOARDING', () => {
      const c = getProgramaConfig({ programa_modo: 'onboarding' });
      expect(c.modo).toBe('onboarding');
      expect(c.semanas).toBe(12);
      expect(c.numCompetencias).toBe(5);
    });
  });

  describe('descritoresCobertosNaMissao', () => {
    const ds = [
      { descritor: 'D1' }, { descritor: 'D2' }, { descritor: 'D3' },
      { descritor: 'D4' }, { descritor: 'D5' }, { descritor: 'D6' },
      { descritor: 'D7' }, { descritor: 'D8' }, { descritor: 'D9' },
    ];
    it('regular sem 4 → 3 primeiros', () => {
      expect(descritoresCobertosNaMissao(ds, 4, PROGRAMA_REGULAR).map(d => d.descritor))
        .toEqual(['D1', 'D2', 'D3']);
    });
    it('regular sem 8 → 6 primeiros', () => {
      expect(descritoresCobertosNaMissao(ds, 8, PROGRAMA_REGULAR).map(d => d.descritor))
        .toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    });
    it('regular sem 12 → todos (-1)', () => {
      expect(descritoresCobertosNaMissao(ds, 12, PROGRAMA_REGULAR)).toHaveLength(9);
    });
    it('semana fora de blocosCobertos → array vazio', () => {
      expect(descritoresCobertosNaMissao(ds, 5, PROGRAMA_REGULAR)).toHaveLength(0);
    });
  });
});

describe('Onboarding — selectDescriptorsMulti (4 descritores distintos por competência)', () => {
  // 6 descritores por competência, notas de 1.0 a 2.5: a seleção pega os 4 de MAIOR gap.
  const comp = (nome: string, sigla: string, notas: number[]): AssessmentPorCompetencia => ({
    competencia: nome,
    assessment: notas.map((nota, i) => ({ descritor: `${sigla}-${i + 1}`, nota })),
  });
  const competenciasOrdenadas: AssessmentPorCompetencia[] = [
    comp('Gestão de Sala', 'GS', [2.5, 1.0, 2.0, 1.5, 2.2, 1.8]),
    comp('Planejamento de Aula', 'PA', [1.5, 2.0, 1.2, 2.4, 1.9, 2.1]),
    comp('Avaliação', 'AV', [1.9, 1.1, 1.3, 1.7, 2.3, 2.0]),
    comp('Comunicação', 'CM', [2.3, 2.1, 1.4, 1.6, 1.0, 2.5]),
    comp('Postura', 'PR', [2.7, 2.6, 2.4, 2.2, 2.0, 1.0]),
  ];
  const idx = PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!;
  const sel = () => selectDescriptorsMulti(competenciasOrdenadas, idx, PROGRAMA_ONBOARDING.nivelMetaAlvo, PROGRAMA_ONBOARDING.conteudosPorSemana);

  it('aloca 4 descritores por competência (20 no total), 2 em cada uma das 2 semanas dela', () => {
    const r = sel();
    expect(r).toHaveLength(20);
    r.forEach((d) => {
      expect(d.semanas_alocadas).toBe(1);
      expect(d.semanas_ids).toHaveLength(1);
    });
    // As 10 semanas de conteúdo, 2 descritores em cada.
    const porSemana = r.reduce<Record<number, number>>((acc, d) => ({ ...acc, [d.semanas_ids[0]]: (acc[d.semanas_ids[0]] || 0) + 1 }), {});
    expect(porSemana).toEqual({ 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2, 11: 2 });
  });

  it('a semana 1 (mapeamento) nunca recebe descritor', () => {
    expect(sel().some((d) => d.semanas_ids.includes(1) || d.semanas_ids.includes(12))).toBe(false);
  });

  it('a primeira semana de cada competência leva os de MAIOR gap (nota mais baixa), a segunda os seguintes', () => {
    const r = sel();
    const da = (semana: number) => r.filter((d) => d.semanas_ids[0] === semana).map((d) => d.descritor);
    // Gestão de Sala: notas 1.0 (GS-2), 1.5 (GS-4), 1.8 (GS-6), 2.0 (GS-3); sobram GS-5 (2.2) e GS-1 (2.5).
    expect(da(2)).toEqual(['GS-2', 'GS-4']);
    expect(da(3)).toEqual(['GS-6', 'GS-3']);
    // Postura: 1.0 (PR-6), 2.0 (PR-5), 2.2 (PR-4), 2.4 (PR-3).
    expect(da(10)).toEqual(['PR-6', 'PR-5']);
    expect(da(11)).toEqual(['PR-4', 'PR-3']);
  });

  it('nenhum descritor se repete dentro da competência', () => {
    const r = sel();
    for (const c of competenciasOrdenadas) {
      const nomes = r.filter((d) => d.competencia === c.competencia).map((d) => d.descritor);
      expect(new Set(nomes).size).toBe(nomes.length);
      expect(nomes).toHaveLength(4);
    }
  });

  it('o gap é medido contra o nível-meta (2): nota 1.0 → gap 1, nota 2.0 → gap 0, nunca negativo', () => {
    const r = sel();
    expect(r.find((d) => d.descritor === 'GS-2')!.gap).toBeCloseTo(1.0, 5);
    expect(r.find((d) => d.descritor === 'GS-3')!.gap).toBe(0);
    expect(r.every((d) => d.gap >= 0)).toBe(true);
  });

  it('preenche `competencia` em cada SelectedDescriptor, na ordem do Top 5', () => {
    const r = sel();
    expect(r[0].competencia).toBe('Gestão de Sala');
    expect(r[r.length - 1].competencia).toBe('Postura');
  });

  it('competência com MENOS descritores que as vagas: devolve só os que existem (quem chama valida por presença)', () => {
    const curta: AssessmentPorCompetencia[] = [
      ...competenciasOrdenadas.slice(0, 4),
      { competencia: 'Postura', assessment: [{ descritor: 'PR-1', nota: 1.5 }, { descritor: 'PR-2', nota: 2.0 }, { descritor: 'PR-3', nota: 2.2 }] },
    ];
    const r = selectDescriptorsMulti(curta, idx, 2, 2);
    expect(r.filter((d) => d.competencia === 'Postura')).toHaveLength(3);
    expect(r).toHaveLength(19);
    const esperados = descritoresEsperadosNoOnboarding(idx, 2);
    expect([...esperados.values()]).toEqual([4, 4, 4, 4, 4]);
  });

  it('competência sem assessment simplesmente não aparece', () => {
    const semAssessment: AssessmentPorCompetencia[] = [
      ...competenciasOrdenadas.slice(0, 4),
      { competencia: 'Vazia', assessment: [] },
    ];
    const r = selectDescriptorsMulti(semAssessment, idx, 2, 2);
    expect(r).toHaveLength(16); // as 4 primeiras, 4 descritores cada
    expect(r.find(d => d.competencia === 'Vazia')).toBeUndefined();
  });

  it('descritor repetido no assessment conta uma vez só', () => {
    const duplicado: AssessmentPorCompetencia[] = [
      { competencia: 'A', assessment: [{ descritor: 'X', nota: 1 }, { descritor: 'X', nota: 1.2 }, { descritor: 'Y', nota: 1.5 }] },
    ];
    const r = selectDescriptorsMulti(duplicado, { 2: 0 }, 2, 2);
    expect(r.map((d) => d.descritor)).toEqual(['X', 'Y']);
  });

  it('o comportamento de uma semana por competência e um descritor por semana segue como era (padrões)', () => {
    const umPorComp = selectDescriptorsMulti(competenciasOrdenadas, { 1: 0, 2: 1, 4: 2, 5: 3, 7: 4 });
    expect(umPorComp).toHaveLength(5);
    expect(umPorComp.map((d) => d.descritor)).toEqual(['GS-2', 'PA-3', 'AV-2', 'CM-5', 'PR-6']);
    expect(umPorComp.flatMap((d) => d.semanas_ids).sort((a, b) => a - b)).toEqual([1, 2, 4, 5, 7]);
    // nivelMeta padrão 3: nota 1.0 → gap 2
    expect(umPorComp[0].gap).toBeCloseTo(2.0, 5);
  });

  it('regular vs onboarding: regular usa selectDescriptors (slots contíguos)', () => {
    const r = selectDescriptors([
      { descritor: 'X1', nota: 1.5 },
      { descritor: 'X2', nota: 2.0 },
    ], PROGRAMA_REGULAR.slotsConteudo);
    // X1 tem gap profundo (< 2.0) → 2 semanas; X2 → 1 semana.
    const x1 = r.find(d => d.descritor === 'X1')!;
    expect(x1.semanas_alocadas).toBeGreaterThanOrEqual(2);
    // Slots contíguos: X1 deve ocupar sems 1+2 ou similar no mesmo bloco.
    expect(x1.semanas_ids[0]).toBe(1);
  });
});

describe('Regular DUO — selectDescriptorsDuo', () => {
  const assessmentA = [
    { descritor: 'A1', nota: 1.5 }, // gap profundo → 2 semanas
    { descritor: 'A2', nota: 2.5 }, // gap raso → 1 semana
  ];
  const assessmentB = [{ descritor: 'B1', nota: 2.8 }];

  it('aloca as duas competências nos mesmos slots de conteúdo para entrega paralela', () => {
    const r = selectDescriptorsDuo('Comp A', assessmentA, 'Comp B', assessmentB);
    const semA = r.filter(d => d.competencia === 'Comp A').flatMap(d => d.semanas_ids);
    const semB = r.filter(d => d.competencia === 'Comp B').flatMap(d => d.semanas_ids);
    const slots = [1, 2, 3, 5, 6, 7, 9, 10, 11];
    expect(new Set(semA)).toEqual(new Set(slots));
    expect(new Set(semB)).toEqual(new Set(slots));
  });

  it('preenche .competencia em todos os descritores', () => {
    const r = selectDescriptorsDuo('Comp A', assessmentA, 'Comp B', assessmentB);
    expect(r.length).toBe(3); // A1, A2, B1 — com semanas extras como reforço
    expect(r.every(d => d.competencia === 'Comp A' || d.competencia === 'Comp B')).toBe(true);
  });

  it('mantém profundidade Regular: gap < 2.0 vira 2+ semanas contíguas', () => {
    const r = selectDescriptorsDuo('Comp A', assessmentA, 'Comp B', assessmentB);
    const a1 = r.find(d => d.descritor === 'A1')!;
    expect(a1.semanas_alocadas).toBeGreaterThanOrEqual(2);
    expect(a1.semanas_ids.slice(0, 2)).toEqual([1, 2]); // contíguo no bloco 1
  });

  it('reforço acontece dentro de cada competência até preencher todos os slots', () => {
    const aRaso = [{ descritor: 'A1', nota: 2.9 }];
    const bFundo = [{ descritor: 'B1', nota: 1.0 }, { descritor: 'B2', nota: 1.2 }];
    const r = selectDescriptorsDuo('Comp A', aRaso, 'Comp B', bFundo);
    const semA = r.filter(d => d.competencia === 'Comp A').flatMap(d => d.semanas_ids);
    const semB = r.filter(d => d.competencia === 'Comp B').flatMap(d => d.semanas_ids);
    const slots = [1, 2, 3, 5, 6, 7, 9, 10, 11];
    expect(new Set(semA)).toEqual(new Set(slots));
    expect(new Set(semB)).toEqual(new Set(slots));
  });

  it('assessment de B vazio → só descritores de A (guard de geração trata o resto)', () => {
    const r = selectDescriptorsDuo('Comp A', assessmentA, 'Comp B', []);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every(d => d.competencia === 'Comp A')).toBe(true);
  });
});
