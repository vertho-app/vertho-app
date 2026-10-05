/**
 * DRE: leitura do dinheiro digitado em pt-BR.
 *
 * O erro que este teste existe para impedir: "1.500" lido como 1,5. Numa tela
 * que lança recebimento e custo, uma parcela de R$ 1.500 virar R$ 1,50 não dá
 * erro nenhum, e o caixa daquela semana fica errado por três dígitos.
 */

import { describe, expect, it } from 'vitest';
import { lerNumeroBR, paraCampoBR } from '@/lib/dre/entrada';

describe('lerNumeroBR', () => {
  it('🔴 ponto com três dígitos depois é MILHAR (1.500 = mil e quinhentos), não decimal', () => {
    expect(lerNumeroBR('1.500')).toBe(1500);
    expect(lerNumeroBR('12.345')).toBe(12345);
    expect(lerNumeroBR('1.234.567')).toBe(1234567);
  });

  it('vírgula é decimal, e o ponto antes dela é milhar', () => {
    expect(lerNumeroBR('1.500,50')).toBe(1500.5);
    expect(lerNumeroBR('1500,5')).toBe(1500.5);
    expect(lerNumeroBR('0,15')).toBe(0.15);
    expect(lerNumeroBR('3,30')).toBe(3.3);
    expect(lerNumeroBR('1.234.567,89')).toBe(1234567.89);
    expect(lerNumeroBR(',5')).toBe(0.5);
  });

  it('ponto com 1 ou 2 casas e sem vírgula é decimal (colar de planilha em inglês)', () => {
    expect(lerNumeroBR('1.5')).toBe(1.5);
    // zero à esquerda não forma milhar: "0.500" é meio, não quinhentos
    expect(lerNumeroBR('0.500')).toBe(0.5);
    expect(lerNumeroBR('1500.50')).toBe(1500.5);
    expect(lerNumeroBR('1500')).toBe(1500);
  });

  it('aceita R$, espaços e sinal', () => {
    expect(lerNumeroBR('R$ 2.000,00')).toBe(2000);
    expect(lerNumeroBR('  750 ')).toBe(750);
    expect(lerNumeroBR('-10,5')).toBe(-10.5);
  });

  it('🔴 o que não é número claro devolve null (nunca NaN, nunca um chute)', () => {
    for (const lixo of ['', '   ', 'abc', '1,2,3', '1..5', '1.5.5', '12a', '--1', '1.50,0', ',', '.', null, undefined]) {
      expect(lerNumeroBR(lixo as any), String(lixo)).toBeNull();
    }
  });
});

describe('paraCampoBR', () => {
  it('formata com vírgula e sem milhar; vazio para o que não é número', () => {
    expect(paraCampoBR(1500.5)).toBe('1500,50');
    expect(paraCampoBR(500, 2)).toBe('500,00');
    expect(paraCampoBR(5.2092, 4)).toBe('5,2092');
    expect(paraCampoBR(null)).toBe('');
    expect(paraCampoBR(NaN)).toBe('');
  });

  it('ida e volta: o que o campo mostra, a leitura devolve igual', () => {
    for (const v of [0.15, 3.3, 1234.56, 5_569_000.17, 750]) {
      expect(lerNumeroBR(paraCampoBR(v))).toBe(v);
    }
  });
});
