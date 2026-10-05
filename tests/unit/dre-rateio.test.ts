/**
 * DRE: o rateio do custo MENSAL pelas semanas (mig 280).
 *
 * O que estes testes existem para impedir, em ordem de dano:
 *
 * 1. **A soma das semanas não bater com o mês.** Fatura de R$ 1.800 que vira
 *    R$ 1.799,99 ou R$ 1.800,01 na DRE é o erro que faz alguém desconfiar da tela
 *    inteira. O arredondamento é sobre o ACUMULADO de dias, não por semana.
 * 2. **Semana que cruza dois meses ficar com o mês errado.** A semana de 28/09
 *    tem 3 dias de setembro e 4 de outubro: recebe uma fatia de cada.
 * 3. **O rateio depender da janela exibida.** A fatia de uma semana é a mesma
 *    quer a tela mostre 4 semanas, quer 52.
 */

import { describe, expect, it } from 'vitest';
import { somar } from '@/lib/dre/dinheiro';
import {
  alocarLancamento,
  chaveDeOrdem,
  diasNoMes,
  ehPrimeiroDiaDoMes,
  primeiroDiaDoMes,
  ratearMes,
  rotuloMes,
  rotuloMesLongo,
  rotuloPeriodoDoLancamento,
  semanasDoMes,
  somarMesesAoMes,
} from '@/lib/dre/rateio';

const valores = (mes: string, v: number) => ratearMes(v, mes).map((p) => p.valorBrl);

describe('ratearMes', () => {
  it('setembro/2026 (30 dias, começa numa terça): 6, 7, 7, 7 e 3 dias, proporcional ao dia', () => {
    const p = ratearMes(3000, '2026-09-01'); // R$ 100 por dia
    expect(p.map((x) => x.semana)).toEqual(['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
    expect(p.map((x) => x.dias)).toEqual([6, 7, 7, 7, 3]);
    expect(p.map((x) => x.valorBrl)).toEqual([600, 700, 700, 700, 300]);
  });

  it('outubro/2026 (31 dias): R$ 1.800 não divide exato, e a soma fecha em R$ 1.800,00', () => {
    const p = ratearMes(1800, '2026-10-01');
    expect(p.map((x) => x.dias)).toEqual([4, 7, 7, 7, 6]);
    expect(p.map((x) => x.valorBrl)).toEqual([232.26, 406.45, 406.45, 406.45, 348.39]);
    expect(somar(p.map((x) => x.valorBrl))).toBe(1800);
  });

  it('fevereiro de 2027 começa numa segunda e tem 28 dias: 4 semanas EXATAMENTE iguais', () => {
    expect(valores('2027-02-01', 2800)).toEqual([700, 700, 700, 700]);
  });

  it('fevereiro bissexto (2028, 29 dias): a última semana tem só 2 dias', () => {
    const p = ratearMes(2900, '2028-02-01');
    expect(p.map((x) => x.dias)).toEqual([6, 7, 7, 7, 2]);
    expect(p[4].valorBrl).toBe(200);
    expect(somar(p.map((x) => x.valorBrl))).toBe(2900);
  });

  it('🔴 a soma das semanas é SEMPRE o valor do mês: varredura de 36 meses × valores com centavo', () => {
    for (let i = 0; i < 36; i++) {
      const mes = somarMesesAoMes('2026-01-01', i);
      for (const v of [0.01, 0.07, 1, 99.99, 1234.56, 1800, 5_569_000.17, 999_999_999.99]) {
        const p = ratearMes(v, mes);
        expect(somar(p.map((x) => x.valorBrl)), `${mes} ${v}`).toBe(v);
        expect(p.every((x) => x.valorBrl >= 0), `${mes} ${v}: fatia negativa`).toBe(true);
        expect(p.reduce((s, x) => s + x.dias, 0), `${mes}: os dias somam o mês`).toBe(diasNoMes(mes));
      }
    }
  });

  it('valor zero reparte zero (a prévia da tela usa isto sem valor digitado)', () => {
    const p = ratearMes(0, '2026-09-01');
    expect(p.map((x) => x.valorBrl)).toEqual([0, 0, 0, 0, 0]);
    expect(p.map((x) => x.dias)).toEqual([6, 7, 7, 7, 3]);
  });

  it('as semanas do mês não dependem de valor nenhum', () => {
    expect(semanasDoMes('2026-10-01')).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  });

  it('só aceita o dia 1: qualquer outra data é recusada, não arredondada para o mês', () => {
    expect(() => ratearMes(100, '2026-09-15')).toThrow(/dia 1/);
    expect(() => ratearMes(100, '2026-02-30')).toThrow();
    expect(() => ratearMes(100, 'setembro')).toThrow();
  });
});

describe('um mês é um mês: calendário e rótulos', () => {
  it('ehPrimeiroDiaDoMes e primeiroDiaDoMes', () => {
    expect(ehPrimeiroDiaDoMes('2026-09-01')).toBe(true);
    expect(ehPrimeiroDiaDoMes('2026-09-02')).toBe(false);
    expect(ehPrimeiroDiaDoMes('2026-02-01')).toBe(true);
    expect(ehPrimeiroDiaDoMes('2026-13-01')).toBe(false);
    expect(ehPrimeiroDiaDoMes(null)).toBe(false);
    expect(primeiroDiaDoMes('2026-09-17')).toBe('2026-09-01');
  });

  it('diasNoMes: 28, 29 (bissexto) e 31', () => {
    expect(diasNoMes('2026-02-01')).toBe(28);
    expect(diasNoMes('2028-02-01')).toBe(29);
    expect(diasNoMes('2026-12-01')).toBe(31);
    expect(diasNoMes('2026-04-01')).toBe(30);
  });

  it('somarMesesAoMes atravessa o ano nos dois sentidos', () => {
    expect(somarMesesAoMes('2026-01-01', -1)).toBe('2025-12-01');
    expect(somarMesesAoMes('2026-11-01', 3)).toBe('2027-02-01');
    expect(somarMesesAoMes('2026-10-01', 0)).toBe('2026-10-01');
  });

  it('rótulos em português', () => {
    expect(rotuloMes('2026-09-01')).toBe('set/2026');
    expect(rotuloMes('2027-03-01')).toBe('mar/2027');
    expect(rotuloMesLongo('2026-03-01')).toBe('março de 2026');
  });
});

describe('alocarLancamento: semanal e mensal pela mesma porta', () => {
  it('semanal cai inteiro na semana dele', () => {
    expect(alocarLancamento({ periodicidade: 'semanal', semanaInicio: '2026-09-28', mesCompetencia: null, valorBrl: 123.45 })).toEqual([
      { semana: '2026-09-28', valorBrl: 123.45 },
    ]);
  });

  it('mensal é rateado, e o resultado é o mesmo de ratearMes (sem a coluna de dias)', () => {
    const a = alocarLancamento({ periodicidade: 'mensal', semanaInicio: null, mesCompetencia: '2026-09-01', valorBrl: 3000 });
    expect(a).toEqual([
      { semana: '2026-08-31', valorBrl: 600 },
      { semana: '2026-09-07', valorBrl: 700 },
      { semana: '2026-09-14', valorBrl: 700 },
      { semana: '2026-09-21', valorBrl: 700 },
      { semana: '2026-09-28', valorBrl: 300 },
    ]);
  });

  it('🔴 estado impossível (mensal sem mês, semanal sem semana, mês fora do dia 1) não aloca nada e não quebra', () => {
    expect(alocarLancamento({ periodicidade: 'mensal', semanaInicio: null, mesCompetencia: null, valorBrl: 100 })).toEqual([]);
    expect(alocarLancamento({ periodicidade: 'mensal', semanaInicio: null, mesCompetencia: '2026-09-15', valorBrl: 100 })).toEqual([]);
    expect(alocarLancamento({ periodicidade: 'semanal', semanaInicio: null, mesCompetencia: null, valorBrl: 100 })).toEqual([]);
  });

  it('o período por extenso e a chave de ordenação', () => {
    expect(rotuloPeriodoDoLancamento({ periodicidade: 'mensal', semanaInicio: null, mesCompetencia: '2026-09-01' })).toBe('set/2026');
    expect(rotuloPeriodoDoLancamento({ periodicidade: 'semanal', semanaInicio: '2026-09-28', mesCompetencia: null })).toBe('semana de 28/09 a 04/10');
    expect(chaveDeOrdem({ semanaInicio: '2026-09-28', mesCompetencia: null })).toBe('2026-09-28');
    expect(chaveDeOrdem({ semanaInicio: null, mesCompetencia: '2026-10-01' })).toBe('2026-10-01');
  });
});
