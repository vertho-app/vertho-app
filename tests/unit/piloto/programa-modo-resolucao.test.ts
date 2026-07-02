import { describe, it, expect } from 'vitest';
import {
  getProgramaConfigByModo,
  getProgramaConfig,
  getProgramaConfigDaTrilha,
  resolverModoColab,
} from '@/lib/season-engine/programa-config';

/**
 * Mig 154 — programa por COLABORADOR (geração) + carimbo na TRILHA (runtime).
 * Precedência de geração: colaborador → empresa → DUO.
 * Runtime: carimbo da trilha → (legado) sys_config da empresa.
 */
describe('getProgramaConfigByModo (rótulo → template)', () => {
  it('mapeia os 4 rótulos persistíveis', () => {
    expect(getProgramaConfigByModo('piloto').modo).toBe('piloto');
    expect(getProgramaConfigByModo('onboarding').modo).toBe('onboarding');
    expect(getProgramaConfigByModo('regular_single').numCompetencias).toBe(1);
    expect(getProgramaConfigByModo('regular_duo').numCompetencias).toBe(2);
  });
  it('desconhecido/ausente → DUO (fail-safe do default global)', () => {
    expect(getProgramaConfigByModo(null).numCompetencias).toBe(2);
    expect(getProgramaConfigByModo(undefined).numCompetencias).toBe(2);
    expect(getProgramaConfigByModo('xyz').numCompetencias).toBe(2);
  });
  it('getProgramaConfig(sysConfig) delega pro mesmo mapeamento (sem drift)', () => {
    for (const modo of ['piloto', 'onboarding', 'regular_single', 'xyz', undefined] as any[]) {
      expect(getProgramaConfig({ programa_modo: modo })).toBe(getProgramaConfigByModo(modo));
    }
  });
});

describe('resolverModoColab (precedência de GERAÇÃO)', () => {
  const empresaPiloto = { programa_modo: 'piloto' };

  it('override do colaborador VENCE o default da empresa', () => {
    expect(resolverModoColab({ programa_modo: 'onboarding' }, empresaPiloto)).toBe('onboarding');
    expect(resolverModoColab({ programa_modo: 'piloto' }, { programa_modo: 'onboarding' })).toBe('piloto');
    expect(resolverModoColab({ programa_modo: 'regular_single' }, empresaPiloto)).toBe('regular_single');
  });

  it('colaborador null/ausente → herda da empresa', () => {
    expect(resolverModoColab({ programa_modo: null }, empresaPiloto)).toBe('piloto');
    expect(resolverModoColab({}, { programa_modo: 'onboarding' })).toBe('onboarding');
    expect(resolverModoColab(null, empresaPiloto)).toBe('piloto');
  });

  it('nada definido → regular_duo (default global)', () => {
    expect(resolverModoColab(null, null)).toBe('regular_duo');
    expect(resolverModoColab({}, {})).toBe('regular_duo');
  });

  it("'regular' legado da empresa normaliza pra regular_duo; desconhecido idem", () => {
    expect(resolverModoColab(null, { programa_modo: 'regular' })).toBe('regular_duo');
    expect(resolverModoColab({ programa_modo: 'xyz' }, null)).toBe('regular_duo');
  });
});

describe('getProgramaConfigDaTrilha (carimbo do RUNTIME)', () => {
  it('carimbo da trilha VENCE o sys_config vivo — trocar o modo da empresa não afeta trilha em andamento', () => {
    const cfg = getProgramaConfigDaTrilha({ programa_modo: 'piloto' }, { programa_modo: 'regular' });
    expect(cfg.modo).toBe('piloto');
    expect(cfg.semanaCenarioB).toBe(3);
  });
  it('trilha legada sem carimbo → fallback pro sys_config (comportamento pré-154)', () => {
    expect(getProgramaConfigDaTrilha({ programa_modo: null }, { programa_modo: 'onboarding' }).modo).toBe('onboarding');
    expect(getProgramaConfigDaTrilha(null, null).numCompetencias).toBe(2);
  });
});
