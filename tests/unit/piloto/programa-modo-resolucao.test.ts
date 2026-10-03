import { describe, it, expect } from 'vitest';
import {
  getProgramaConfigByModo,
  getProgramaConfig,
  getProgramaConfigDaTrilha,
  resolverModoColab,
  PROGRAMA_JORNADA,
  PROGRAMA_REGULAR_DUO,
} from '@/lib/season-engine/programa-config';

/**
 * Mig 154 — programa por COLABORADOR (geração) + carimbo na TRILHA (runtime).
 * Precedência de geração: colaborador → empresa → Jornada (padrão desde
 * 03/10/2026; antes era o DUO).
 * Runtime: carimbo da trilha → (legado) sys_config da empresa.
 */
describe('getProgramaConfigByModo (rótulo → template)', () => {
  it('mapeia os 4 rótulos persistíveis', () => {
    expect(getProgramaConfigByModo('piloto').modo).toBe('piloto');
    expect(getProgramaConfigByModo('onboarding').modo).toBe('onboarding');
    expect(getProgramaConfigByModo('regular_single').numCompetencias).toBe(1);
    expect(getProgramaConfigByModo('regular_duo').numCompetencias).toBe(2);
  });
  it('desconhecido/ausente → Jornada (o padrão desde 03/10/2026)', () => {
    expect(getProgramaConfigByModo(null)).toBe(PROGRAMA_JORNADA);
    expect(getProgramaConfigByModo(undefined)).toBe(PROGRAMA_JORNADA);
    expect(getProgramaConfigByModo('xyz')).toBe(PROGRAMA_JORNADA);
  });
  it("'regular' (grafia antiga) e 'regular_duo' seguem no DUO: trilha e registro gravados não mudam", () => {
    expect(getProgramaConfigByModo('regular')).toBe(PROGRAMA_REGULAR_DUO);
    expect(getProgramaConfigByModo('regular_duo')).toBe(PROGRAMA_REGULAR_DUO);
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

  it('nada definido → jornada (empresa NOVA nasce na Jornada, 03/10/2026)', () => {
    expect(resolverModoColab(null, null)).toBe('jornada');
    expect(resolverModoColab({}, {})).toBe('jornada');
  });

  it("'regular' legado da empresa normaliza pra regular_duo; desconhecido vai pro padrão", () => {
    expect(resolverModoColab(null, { programa_modo: 'regular' })).toBe('regular_duo');
    expect(resolverModoColab({ programa_modo: 'xyz' }, null)).toBe('jornada');
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
    // O padrão NOVO (Jornada) não alcança a trilha sem carimbo: ela nasceu no
    // DUO de 14 semanas e o plano dela tem 14 entradas (as 11 do banco, 03/10).
    expect(getProgramaConfigDaTrilha(null, null)).toBe(PROGRAMA_REGULAR_DUO);
    expect(getProgramaConfigDaTrilha({ programa_modo: null }, {})).toBe(PROGRAMA_REGULAR_DUO);
    expect(getProgramaConfigDaTrilha({ programa_modo: null }, { programa_modo: 'regular' })).toBe(PROGRAMA_REGULAR_DUO);
  });
});
