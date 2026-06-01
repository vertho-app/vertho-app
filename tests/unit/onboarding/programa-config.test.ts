import { describe, it, expect } from 'vitest';
import {
  PROGRAMA_REGULAR,
  PROGRAMA_REGULAR_DUO,
  PROGRAMA_ONBOARDING,
  getProgramaConfig,
  descritoresCobertosNaMissao,
} from '@/lib/season-engine/programa-config';
import {
  selectDescriptors,
  selectDescriptorsMulti,
  selectDescriptorsDuo,
  type AssessmentPorCompetencia,
} from '@/lib/season-engine/select-descriptors';

/**
 * Estrutura do template Onboarding deve casar com o brief seção 3.2:
 *   10 sem · 5 comps · missões 4/7/9 · cenário B sem 10 · nível-meta 2.
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

  describe('PROGRAMA_ONBOARDING', () => {
    it('tem 10 semanas com missões 4/7/9 e cenário B sem 10', () => {
      expect(PROGRAMA_ONBOARDING.semanas).toBe(10);
      expect(PROGRAMA_ONBOARDING.semanasMissao).toEqual([4, 7, 9]);
      expect(PROGRAMA_ONBOARDING.semanasAvaliacao).toEqual([10]);
      expect(PROGRAMA_ONBOARDING.semanaCenarioB).toBe(10);
    });
    it('acumulada na sem 9 (embutida na última missão integradora)', () => {
      expect(PROGRAMA_ONBOARDING.semanaAcumulada).toBe(9);
    });
    it('aloca 5 competências em espiral com nível-meta 2', () => {
      expect(PROGRAMA_ONBOARDING.numCompetencias).toBe(5);
      expect(PROGRAMA_ONBOARDING.nivelMetaAlvo).toBe(2);
    });
    it('tem 5 slots de fundamento [2,3,5,6,8] — sem 1 é calibragem', () => {
      expect(PROGRAMA_ONBOARDING.slotsConteudo).toEqual([2, 3, 5, 6, 8]);
      expect(PROGRAMA_ONBOARDING.slotsConteudo).not.toContain(1);
    });
    it('semanaParaCompetenciaIdx mapeia cada slot a uma competência', () => {
      expect(PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx).toEqual({ 2: 0, 3: 1, 5: 2, 6: 3, 8: 4 });
    });
    it('competenciasNaMissao crescente: 2 → 4 → todas', () => {
      expect(PROGRAMA_ONBOARDING.competenciasNaMissao).toEqual({
        4: [0, 1],
        7: [0, 1, 2, 3],
        9: [-1],
      });
    });
  });

  describe('getProgramaConfig(sys_config)', () => {
    it('default GLOBAL (sys_config null/vazio) → REGULAR DUO (2 comps)', () => {
      expect(getProgramaConfig(null).numCompetencias).toBe(2);
      expect(getProgramaConfig(undefined).numCompetencias).toBe(2);
      expect(getProgramaConfig({}).numCompetencias).toBe(2);
      expect(getProgramaConfig({}).modo).toBe('regular');
    });
    it('programa_modo ausente/desconhecido → DUO (fail-safe pro novo default)', () => {
      const c = getProgramaConfig({ programa_modo: 'xyz' as any });
      expect(c.numCompetencias).toBe(2);
      expect(c.semanas).toBe(14);
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
      expect(c.semanas).toBe(10);
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

describe('Onboarding — selectDescriptorsMulti', () => {
  const competenciasOrdenadas: AssessmentPorCompetencia[] = [
    {
      competencia: 'Gestão de Sala',
      assessment: [
        { descritor: 'GS-1', nota: 1.8 },
        { descritor: 'GS-2', nota: 2.5 },
      ],
    },
    {
      competencia: 'Planejamento de Aula',
      assessment: [
        { descritor: 'PA-1', nota: 2.0 },
        { descritor: 'PA-2', nota: 1.5 },
      ],
    },
    { competencia: 'Avaliação', assessment: [{ descritor: 'AV-1', nota: 1.9 }] },
    { competencia: 'Comunicação', assessment: [{ descritor: 'CM-1', nota: 2.3 }] },
    { competencia: 'Postura', assessment: [{ descritor: 'PR-1', nota: 2.7 }] },
  ];

  it('aloca 1 descritor por competência nos slots [2,3,5,6,8]', () => {
    const r = selectDescriptorsMulti(competenciasOrdenadas, PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!);
    expect(r).toHaveLength(5);
    // Cada item tem semanas_alocadas=1 e 1 slot
    r.forEach(d => {
      expect(d.semanas_alocadas).toBe(1);
      expect(d.semanas_ids).toHaveLength(1);
    });
    // Slots cobertos = [2,3,5,6,8]
    expect(r.flatMap(d => d.semanas_ids).sort((a, b) => a - b)).toEqual([2, 3, 5, 6, 8]);
  });

  it('escolhe descritor de MAIOR gap (nota mais baixa) por competência', () => {
    const r = selectDescriptorsMulti(competenciasOrdenadas, PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!);
    const sem2 = r.find(d => d.semanas_ids.includes(2))!;
    const sem3 = r.find(d => d.semanas_ids.includes(3))!;
    expect(sem2.descritor).toBe('GS-1'); // 1.8 < 2.5
    expect(sem3.descritor).toBe('PA-2'); // 1.5 < 2.0
  });

  it('preenche `competencia` em cada SelectedDescriptor', () => {
    const r = selectDescriptorsMulti(competenciasOrdenadas, PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!);
    expect(r[0].competencia).toBe('Gestão de Sala');
    expect(r[4].competencia).toBe('Postura');
  });

  it('competência sem assessment não é pulada se array vazio: simplesmente não aparece', () => {
    const semAssessment: AssessmentPorCompetencia[] = [
      ...competenciasOrdenadas.slice(0, 4),
      { competencia: 'Vazia', assessment: [] },
    ];
    const r = selectDescriptorsMulti(semAssessment, PROGRAMA_ONBOARDING.semanaParaCompetenciaIdx!);
    expect(r).toHaveLength(4); // só 4 (a 5ª pulada)
    expect(r.find(d => d.competencia === 'Vazia')).toBeUndefined();
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
