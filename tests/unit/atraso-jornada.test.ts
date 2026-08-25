import { describe, it, expect } from 'vitest';
import { semanaDaPessoa, semanaDoCalendario, estaAtrasada } from '@/lib/season-engine/atraso';

/**
 * "Em dia ou atrasada?" — a régua que separa estar NUMA trilha de estar andando
 * nela. `Medido em 25/08 no tenant macae`: das 38 trilhas ativas, 8 em dia e 30
 * atrasadas, todas na semana 2 do calendário sem ter concluído a 1. O KPI
 * "38 em andamento" lia como saúde.
 *
 * ⚠️ Todo caso passa `agora` EXPLÍCITO e longe das 06:00 UTC. A semana libera
 * nesse horário, então um teste que monta a data com o relógio da máquina
 * inverte sozinho entre 00:00 e 06:00 UTC — a armadilha que já derrubou a suíte
 * em 06/08, verde às 19h e vermelha às 22h sem commit no meio.
 */

const INICIO = '2026-08-03'; // segunda; libera 03/08 06:00 UTC
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);

describe('semana da pessoa', () => {
  it('é a próxima depois das concluídas', () => {
    expect(semanaDaPessoa(0, 14)).toBe(1);
    expect(semanaDaPessoa(2, 14)).toBe(3);
  });

  it('não passa do total do programa DELA (jornada 7, piloto 3)', () => {
    expect(semanaDaPessoa(7, 7)).toBe(7);
    expect(semanaDaPessoa(9, 3)).toBe(3);
  });
});

describe('semana do calendário', () => {
  it('conta a partir da liberação da semana 1', () => {
    expect(semanaDoCalendario(INICIO, 14, meioDia('2026-08-03'))).toBe(1);
    expect(semanaDoCalendario(INICIO, 14, meioDia('2026-08-09'))).toBe(1);
    expect(semanaDoCalendario(INICIO, 14, meioDia('2026-08-10'))).toBe(2);
    expect(semanaDoCalendario(INICIO, 14, meioDia('2026-09-07'))).toBe(6);
  });

  it('respeita o teto do programa — jornada de 7 não chega na 9', () => {
    expect(semanaDoCalendario(INICIO, 7, meioDia('2026-10-05'))).toBe(7);
  });

  it('sem data de início não há calendário', () => {
    expect(semanaDoCalendario(null, 14, meioDia('2026-09-07'))).toBeNull();
  });
});

describe('está atrasada?', () => {
  const args = (concluidas: number, dia: string) => ({
    dataInicio: INICIO, totalSemanas: 14, semanasConcluidas: concluidas, agora: meioDia(dia),
  });

  it('concluiu a semana que o calendário deixou para trás → em dia', () => {
    // Calendário na 2; concluiu a 1 → está trabalhando a 2. Em dia.
    expect(estaAtrasada(args(1, '2026-08-10'))).toBe(false);
  });

  it('não concluiu nada com o calendário na 2 → atrasada', () => {
    // É o caso dos 30 de Macaé.
    expect(estaAtrasada(args(0, '2026-08-10'))).toBe(true);
  });

  it('quem está adiantado nunca é atrasado', () => {
    expect(estaAtrasada(args(5, '2026-08-10'))).toBe(false);
  });

  it('na primeira semana ninguém está atrasado', () => {
    expect(estaAtrasada(args(0, '2026-08-04'))).toBe(false);
  });

  it('sem data de início devolve null — "não sei" não vira acusação', () => {
    expect(estaAtrasada({ dataInicio: null, totalSemanas: 14, semanasConcluidas: 0, agora: meioDia('2026-09-07') }))
      .toBeNull();
  });
});
