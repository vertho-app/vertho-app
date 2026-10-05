/**
 * DRE: semanas em Brasília e dinheiro em centavos.
 *
 * O que estes testes existem para impedir, em ordem de dano:
 *
 * 1. **A semana errada.** O recebimento de domingo à noite cair na semana
 *    seguinte (ou o custo de IA de domingo 23h cair na semana que começa) não
 *    quebra nada: produz uma DRE completa com o resultado da semana errado.
 *    A DRE e o e-mail semanal de custo têm de cortar no MESMO instante.
 * 2. **O centavo.** `horas × custo/hora` em ponto flutuante dá 0,49 onde o banco
 *    (numeric, meio para cima) dá 0,50, e o lançamento seria recusado pela
 *    constraint `dre_lancamentos_horas_coerentes` só em certas combinações.
 */

import { describe, it, expect } from 'vitest';
import { janelaSemanaFechada } from '@/lib/custo-ia/relatorio-semanal';
import {
  dataBRT,
  ehDataISO,
  ehSegunda,
  janelaDaSemana,
  rotuloSemana,
  segundaDaSemana,
  semanaAtualBRT,
  semanaDaData,
  semanasEntre,
  somarDias,
  ultimaSemanaFechadaBRT,
  ultimasSemanas,
} from '@/lib/dre/semana';
import { arredondar2, arredondarHoras, deCentavos, paraCentavos, somar, valorDasHoras } from '@/lib/dre/dinheiro';

describe('semanas da DRE (segunda a domingo, Brasília)', () => {
  it('ehDataISO recusa data de calendário inexistente', () => {
    expect(ehDataISO('2026-10-05')).toBe(true);
    expect(ehDataISO('2026-02-30')).toBe(false);
    expect(ehDataISO('2026-13-01')).toBe(false);
    expect(ehDataISO('05/10/2026')).toBe(false);
    expect(ehDataISO(20261005)).toBe(false);
  });

  it('a segunda de qualquer dia da semana', () => {
    // 05/10/2026 é segunda-feira.
    expect(ehSegunda('2026-10-05')).toBe(true);
    for (const d of ['2026-10-05', '2026-10-07', '2026-10-11']) expect(segundaDaSemana(d)).toBe('2026-10-05');
    // domingo pertence à semana que TERMINA nele
    expect(segundaDaSemana('2026-10-04')).toBe('2026-09-28');
    expect(segundaDaSemana('2026-09-28')).toBe('2026-09-28');
  });

  it('domingo 23:59:59 BRT ainda é a semana que termina; segunda 00:00 BRT abre a seguinte', () => {
    // 04/10/2026 23:59:59 BRT = 05/10 02:59:59Z
    expect(semanaAtualBRT(new Date('2026-10-05T02:59:59Z'))).toBe('2026-09-28');
    // 05/10/2026 00:00:00 BRT = 05/10 03:00:00Z
    expect(semanaAtualBRT(new Date('2026-10-05T03:00:00Z'))).toBe('2026-10-05');
    // O shell do dono roda em UTC: 02:00Z de segunda ainda é DOMINGO em Brasília.
    expect(dataBRT(new Date('2026-10-05T02:00:00Z'))).toBe('2026-10-04');
  });

  it('o cron de segunda 04:30 BRT fecha a semana que acabou, não a que começou', () => {
    // 05/10/2026 04:30 BRT = 07:30Z
    expect(ultimaSemanaFechadaBRT(new Date('2026-10-05T07:30:00Z'))).toBe('2026-09-28');
  });

  it('a janela da DRE é IDÊNTICA à do e-mail semanal de custo (mesmo instante de corte)', () => {
    const agora = new Date('2026-10-05T07:00:00Z'); // cron do e-mail: segunda 04:00 BRT
    const email = janelaSemanaFechada(agora);
    const dre = janelaDaSemana(ultimaSemanaFechadaBRT(agora));
    expect(dre.ini.toISOString()).toBe(email.ini.toISOString());
    expect(dre.fim.toISOString()).toBe(email.fim.toISOString());
    // fim EXCLUSIVO: segunda 00:00 BRT
    expect(dre.fim.toISOString()).toBe('2026-10-05T03:00:00.000Z');
  });

  it('semanasEntre, ultimasSemanas e rótulo', () => {
    expect(semanasEntre('2026-09-14', '2026-10-05')).toEqual(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']);
    expect(ultimasSemanas('2026-10-05', 3)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
    expect(rotuloSemana('2026-09-28')).toBe('28/09 a 04/10');
    expect(semanaDaData('2026-10-04')).toBe('2026-09-28'); // recebimento de domingo
    expect(somarDias('2026-12-28', 7)).toBe('2027-01-04'); // virada de ano
  });
});

describe('dinheiro em centavos', () => {
  it('somar não acumula erro de ponto flutuante', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // o problema que a função existe para evitar
    expect(somar([0.1, 0.2])).toBe(0.3);
    expect(somar([])).toBe(0);
    expect(somar([1234.56, 0.44])).toBe(1235);
  });

  it('entrada não finita vira 0, nunca NaN na soma', () => {
    expect(paraCentavos(NaN)).toBe(0);
    expect(paraCentavos(Infinity)).toBe(0);
    expect(somar([10, NaN as unknown as number])).toBe(10);
    expect(deCentavos(12345)).toBe(123.45);
    expect(arredondar2(1.239)).toBe(1.24);
  });

  it('valorDasHoras bate com o round(numeric, 2) do banco nos casos de meio centavo', () => {
    // 0,15 h × R$ 3,30 = 0,495 → o banco arredonda para 0,50. Em float daria 0,49.
    expect(0.15 * 3.3).toBeLessThan(0.495);
    expect(valorDasHoras(0.15, 3.3)).toBe(0.5);
    // o caso de uso real: horas de gente a R$ 500/h
    expect(valorDasHoras(1.5, 500)).toBe(750);
    expect(valorDasHoras(0.25, 500)).toBe(125);
    expect(valorDasHoras(7.33, 500)).toBe(3665);
    // 0,35 h × R$ 333,33 = 116,6655 → 116,67
    expect(valorDasHoras(0.35, 333.33)).toBe(116.67);
    // custo/hora zero dá zero (a action recusa; a função não esconde)
    expect(valorDasHoras(2, 0)).toBe(0);
  });

  it('arredondarHoras guarda 2 casas, a precisão da coluna', () => {
    expect(arredondarHoras(1.234)).toBe(1.23);
    expect(arredondarHoras(1.2)).toBe(1.2);
    expect(arredondarHoras(NaN)).toBe(0);
  });
});
