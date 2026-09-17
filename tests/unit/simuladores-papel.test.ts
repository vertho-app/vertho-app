import { describe, expect, it } from 'vitest';
import { soAcompanhaSimuladores } from '@/lib/simuladores/papel';

/**
 * Gestor e RH ACOMPANHAM atendimento e vendas; quem atende e vende TREINA
 * (decisão do dono, 17/09/2026). A régua é uma só para menu, /api/me, gate das
 * páginas e contexto das APIs.
 */
describe('quem só acompanha os simuladores', () => {
  it('gestor e RH só acompanham', () => {
    expect(soAcompanhaSimuladores({ role: 'gestor' })).toBe(true);
    expect(soAcompanhaSimuladores({ role: 'rh' })).toBe(true);
  });

  it('colaborador e tutor seguem treinando', () => {
    expect(soAcompanhaSimuladores({ role: 'colaborador' })).toBe(false);
    expect(soAcompanhaSimuladores({ role: 'tutor' })).toBe(false);
  });

  it('quem administra a plataforma treina em qualquer papel: é o preview de quem configura', () => {
    expect(soAcompanhaSimuladores({ role: 'gestor', isPlatformAdmin: true })).toBe(false);
    expect(soAcompanhaSimuladores({ role: 'rh', isPlatformAdmin: true })).toBe(false);
  });

  it('sem papel ou sem pessoa não vira acompanhamento', () => {
    for (const pessoa of [null, undefined, {}, { role: null }, { role: '' }, { role: 'GESTOR' }, { role: 'constructor' }]) {
      expect(soAcompanhaSimuladores(pessoa as any)).toBe(false);
    }
  });
});
