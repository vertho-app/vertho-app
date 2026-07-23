import { describe, expect, it } from 'vitest';
import {
  computeDiscCompetenciesNatural,
  DISC_COMPETENCY_MODEL_VERSION,
} from '@/lib/disc-competencias';

describe('competências DISC natural-only', () => {
  it('mantém um identificador explícito de versão', () => {
    expect(DISC_COMPETENCY_MODEL_VERSION).toBe('disc-natural-v1');
  });

  it('produz a baseline determinística do modelo natural-only', () => {
    expect(computeDiscCompetenciesNatural({ D: 70, I: 50, S: 40, C: 40 })).toEqual({
      Ousadia: 67.3,
      Comando: 77.6,
      Objetividade: 67,
      Assertividade: 60.7,
      Persuasão: 55.5,
      Extroversão: 55,
      Entusiasmo: 54.4,
      Sociabilidade: 49.4,
      Empatia: 48.9,
      Paciência: 42,
      Persistência: 61.2,
      Planejamento: 46.1,
      Organização: 53.2,
      Detalhismo: 60.6,
      Prudência: 42.7,
      Concentração: 59.4,
    });
  });

  it('limita todas as competências à faixa de 0 a 100', () => {
    const values = Object.values(computeDiscCompetenciesNatural({ D: 200, I: 0, S: 0, C: 0 }));
    expect(values).toHaveLength(16);
    expect(values.every((value) => value >= 0 && value <= 100)).toBe(true);
  });
});
