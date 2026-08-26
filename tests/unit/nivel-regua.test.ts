import { describe, it, expect } from 'vitest';
import { nivelDaNota, nivelOuNull, rotuloNivel, TETO_N3 } from '@/lib/nivel-regua';

/**
 * A régua: N1 1,00–1,99 · N2 2,00–2,99 · N3 3,00–3,50 · N4 acima de 3,50.
 *
 * Os testes que importam são os de FRONTEIRA — foi exatamente numa delas (3,5)
 * que os nove call-sites com `Math.floor` divergiam do que a régua manda.
 */
describe('nivelDaNota — régua oficial nota→nível', () => {
  it('N1 vai de 1,00 a 1,99 (1,9 NÃO é N2 — não há arredondamento)', () => {
    expect(nivelDaNota(1)).toBe(1);
    expect(nivelDaNota(1.5)).toBe(1);
    expect(nivelDaNota(1.9)).toBe(1);
    expect(nivelDaNota(1.99)).toBe(1);
  });

  it('N2 abre em 2,00 e vai até 2,99', () => {
    expect(nivelDaNota(2)).toBe(2);
    expect(nivelDaNota(2.55)).toBe(2);
    expect(nivelDaNota(2.99)).toBe(2);
  });

  it('N3 vai de 3,00 até 3,50 INCLUSIVE', () => {
    expect(nivelDaNota(3)).toBe(3);
    expect(nivelDaNota(3.49)).toBe(3);
    expect(nivelDaNota(TETO_N3)).toBe(3); // 3,5 cravado ainda é N3
  });

  it('N4 é ACIMA de 3,50 — não exige 4,00 (a diferença do floor puro)', () => {
    expect(nivelDaNota(3.51)).toBe(4);
    expect(nivelDaNota(3.65)).toBe(4);
    expect(nivelDaNota(4)).toBe(4);
    // A prova de que não é floor: floor(3.65) seria 3.
    expect(Math.floor(3.65)).toBe(3);
    expect(nivelDaNota(3.65)).not.toBe(Math.floor(3.65));
  });

  it('grampeia fora da faixa e trata ausente como N1 (nunca promove por dado faltando)', () => {
    expect(nivelDaNota(0)).toBe(1);
    expect(nivelDaNota(-5)).toBe(1);
    expect(nivelDaNota(9)).toBe(4);
    expect(nivelDaNota(null)).toBe(1);
    expect(nivelDaNota(undefined)).toBe(1);
    expect(nivelDaNota(NaN)).toBe(1);
  });

  it('rotuloNivel formata como o produto mostra', () => {
    expect(rotuloNivel(1.9)).toBe('N1');
    expect(rotuloNivel(3.6)).toBe('N4');
  });

  it('nível já calculado só aceita os quatro degraus existentes', () => {
    expect([1, 2, 3, 4].map(nivelOuNull)).toEqual([1, 2, 3, 4]);
    expect(nivelOuNull(0)).toBeNull();
    expect(nivelOuNull(2.5)).toBeNull();
    expect(nivelOuNull(null)).toBeNull();
    expect(nivelOuNull('pendente')).toBeNull();
  });
});
