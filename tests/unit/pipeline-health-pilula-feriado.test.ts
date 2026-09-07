import { describe, expect, it } from 'vitest';
import { pilulaDoDia, diaDaSemanaBRT } from '@/lib/pipeline-health/coleta';

/**
 * O dia que o health MEDE tem que ser o dia em que a entrega SAI.
 *
 * `trigger-diario-empresa` desloca a cadência quando um feriado nacional cai em
 * cima (`diasDaSemanaComFeriado`); `pilulaDoDia` não deslocava. Na semana do
 * feriado os dois gêmeos apontavam para dias diferentes, e o preflight ficava
 * cego dos dois lados.
 *
 * `Medido: 07/09/2026` (Independência, uma segunda). Ibipeba tem P1 na segunda e
 * P2 na terça: a P1 andou para terça e a P2, por colisão, para quarta. Na segunda
 * o health media uma entrega que não sairia; na terça concluía "não é dia de
 * pílula" no dia em que 36 pessoas receberiam. Nenhum alarme sobre a entrega real
 * nos dois dias.
 */

/** Cadência do Ibipeba: P1 segunda, P2 terça, evidência quinta. */
const IBIPEBA = { fase4_dia_pilula: 1, fase4_dia_pilula2: 2, fase4_dia_evidencia: 4 };
/** Cadência do Macaé: P1 terça, P2 quarta, evidência quinta. */
const MACAE = { fase4_dia_pilula: 2, fase4_dia_pilula2: 3, fase4_dia_evidencia: 4 };

/** Meio-dia UTC do dia pedido: longe das bordas de fuso dos dois lados. */
const emBRT = (iso: string) => new Date(`${iso}T12:00:00Z`);
const pilula = (cad: any, iso: string) => pilulaDoDia(cad, diaDaSemanaBRT(emBRT(iso)), emBRT(iso));

describe('pílula do dia com feriado nacional', () => {
  it('🔴 na semana do 07/09 a P1 do Ibipeba sai na TERÇA, não na segunda', () => {
    expect(pilula(IBIPEBA, '2026-09-07')).toBeNull();   // feriado: nada sai
    expect(pilula(IBIPEBA, '2026-09-08')).toBe(1);      // P1 deslocada
  });

  it('🔴 e a P2 anda junto, porque colidiria com a P1 deslocada', () => {
    // sem esta regra, terça teria as duas pílulas e quarta nenhuma
    expect(pilula(IBIPEBA, '2026-09-09')).toBe(2);
  });

  it('quem já roda ter/qua não se move: o feriado caiu fora dos dias dele', () => {
    expect(pilula(MACAE, '2026-09-08')).toBe(1);
    expect(pilula(MACAE, '2026-09-09')).toBe(2);
    expect(pilula(MACAE, '2026-09-07')).toBeNull();
  });

  it('semana sem feriado devolve exatamente os dias da config', () => {
    // 14/09 a 16/09 de 2026: segunda, terça e quarta comuns
    expect(pilula(IBIPEBA, '2026-09-14')).toBe(1);
    expect(pilula(IBIPEBA, '2026-09-15')).toBe(2);
    expect(pilula(IBIPEBA, '2026-09-16')).toBeNull();
  });

  it('dia fora da cadência continua sendo "nenhuma pílula"', () => {
    expect(pilula(IBIPEBA, '2026-09-10')).toBeNull(); // quinta é evidência
    expect(pilula(IBIPEBA, '2026-09-12')).toBeNull(); // sábado
  });

  it('🔴 às 22h do feriado o dia ainda é o feriado — a data vai em BRT, não em UTC', () => {
    // 08/09 01:00Z é 07/09 22:00 no fuso do envio. Com a data em UTC cru o
    // cálculo procuraria o feriado na terça, não acharia, e concluiria que a
    // segunda é dia de P1 — a fronteira que os casos de meio-dia não exercitam.
    const instante = new Date('2026-09-08T01:00:00Z');
    expect(diaDaSemanaBRT(instante)).toBe(1); // segunda, no fuso do envio
    expect(pilulaDoDia(IBIPEBA, diaDaSemanaBRT(instante), instante)).toBeNull();
  });

  it('a régua vale para o feriado de outra semana também, não é caso especial do 07/09', () => {
    // 12/10/2026 (Nossa Senhora Aparecida) é uma segunda-feira
    expect(pilula(IBIPEBA, '2026-10-12')).toBeNull();
    expect(pilula(IBIPEBA, '2026-10-13')).toBe(1);
    expect(pilula(IBIPEBA, '2026-10-14')).toBe(2);
  });
});
