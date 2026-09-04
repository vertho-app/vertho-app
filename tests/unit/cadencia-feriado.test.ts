import { describe, it, expect } from 'vitest';
import {
  diasDaSemanaComFeriado, ehFeriadoNacional,
  FERIADOS_NACIONAIS, ULTIMO_ANO_CONFERIDO,
} from '@/lib/fase4/feriados';

/**
 * A cadência não envia em feriado nacional — ela anda um dia.
 *
 * O caso que motivou (04/09/2026): **07/09 cai numa segunda**. A pílula da
 * segunda vai para terça e a de terça para quarta; a evidência de quinta fica.
 *
 * 🔑 POR QUE NÃO FOI UMA EDIÇÃO DO `sys_config`. Dava para trocar os dias dos
 * três tenants e reverter na semana seguinte — e "reverter na semana seguinte"
 * é exatamente o que esta base já viu falhar (os crons do CONARH seguiram
 * armados duas semanas após a feira). Cadência deslocada que ninguém reverte não
 * tem sintoma: as mensagens continuam saindo, só que no dia errado, para sempre.
 *
 * A régua olha o calendário e desloca só na semana do feriado. Sem estado.
 */

/** Segunda 07/09/2026 é feriado; a semana dela vai de dom 06 a sáb 12. */
const SEG_07_09 = { hojeUTC: '2026-09-07', dow: 1 };
/** Semana seguinte, sem feriado nenhum: nada pode se mover. */
const SEG_14_09 = { hojeUTC: '2026-09-14', dow: 1 };

const PADRAO = { diaP1: 1, diaP2: 2, diaEv: 4 };

describe('a lista de feriados', () => {
  it('conhece o 7 de setembro de 2026', () => {
    expect(ehFeriadoNacional('2026-09-07')).toBe(true);
  });

  it('não confunde dia normal com feriado', () => {
    expect(ehFeriadoNacional('2026-09-08')).toBe(false);
    expect(ehFeriadoNacional('2026-09-14')).toBe(false);
  });

  it('🔴 avisa ANTES de a lista expirar — datas móveis precisam de conferência anual', () => {
    /**
     * Carnaval, Sexta-feira Santa e Corpus Christi dependem da Páscoa. A lista
     * só tem os FIXOS de 2027; as móveis entram quando alguém conferir.
     *
     * Este caso fica vermelho a partir de 01/10 do último ano conferido, o que
     * dá três meses de antecedência. Como o cron sazonal, o conserto é atualizar
     * a lista — nunca mexer no teste. É a única asserção daqui que depende do
     * relógio, e isso é deliberado.
     */
    const hoje = new Date();
    const limite = new Date(Date.UTC(ULTIMO_ANO_CONFERIDO, 9, 1)); // 01/10
    if (hoje >= limite) {
      throw new Error(
        `A lista de feriados foi conferida até ${ULTIMO_ANO_CONFERIDO}. ` +
        `Confira a Páscoa de ${ULTIMO_ANO_CONFERIDO + 1}, acrescente Carnaval, ` +
        `Sexta-feira Santa e Corpus Christi em lib/fase4/feriados.ts e suba ` +
        `ULTIMO_ANO_CONFERIDO.`,
      );
    }
    expect(FERIADOS_NACIONAIS.some(d => d.startsWith(String(ULTIMO_ANO_CONFERIDO + 1)))).toBe(true);
  });
});

describe('deslocamento na semana do feriado', () => {
  it('🔴 o caso pedido: segunda→terça, terça→quarta, quinta fica', () => {
    const r = diasDaSemanaComFeriado(PADRAO, SEG_07_09.hojeUTC, SEG_07_09.dow);
    expect(r.diaP1).toBe(2); // terça
    expect(r.diaP2).toBe(3); // quarta
    expect(r.diaEv).toBe(4); // quinta, intacta
    expect(r.deslocou).toEqual(['p1 1→2', 'p2 2→3']);
  });

  it('a 2ª pílula anda por COLISÃO, não só por feriado', () => {
    // 08/09 (terça) não é feriado. Ela se move porque a p1 caiu em cima dela —
    // sem isso, a pessoa receberia os dois conteúdos no mesmo dia.
    expect(ehFeriadoNacional('2026-09-08')).toBe(false);
    expect(diasDaSemanaComFeriado(PADRAO, SEG_07_09.hojeUTC, SEG_07_09.dow).diaP2).toBe(3);
  });

  it('semana SEM feriado não move nada — o caso comum', () => {
    const r = diasDaSemanaComFeriado(PADRAO, SEG_14_09.hojeUTC, SEG_14_09.dow);
    expect(r).toMatchObject({ diaP1: 1, diaP2: 2, diaEv: 4 });
    expect(r.deslocou).toEqual([]);
  });

  it('funciona a partir de QUALQUER dia da semana — o cron roda todo dia', () => {
    // Quarta 09/09 tem que enxergar o mesmo feriado da segunda daquela semana,
    // senão a p2 deslocada nunca sairia (o cron de quarta não a reconheceria).
    const daQuarta = diasDaSemanaComFeriado(PADRAO, '2026-09-09', 3);
    expect(daQuarta).toMatchObject({ diaP1: 2, diaP2: 3, diaEv: 4 });
    const daQuinta = diasDaSemanaComFeriado(PADRAO, '2026-09-10', 4);
    expect(daQuinta).toMatchObject({ diaP1: 2, diaP2: 3, diaEv: 4 });
  });

  it('🔴 nunca atropela a evidência: CANCELA em vez de empurrar por cima', () => {
    /**
     * O caso precisa ter COLISÃO de verdade, senão não prova nada. A 1ª versão
     * deste teste usava p1=1 → 2 com a evidência na 4: sobrava folga, e a
     * mutação que remove o guard `novo < diaEv` passou VERDE.
     *
     * Aqui a evidência está na TERÇA e o feriado na segunda: deslocar a p1
     * a jogaria exatamente em cima do dia que avança o calendário do programa.
     * Perder a pílula da semana é recuperável — a pessoa segue na mesma semana;
     * embaralhar a evidência mexe no relógio de todo mundo.
     */
    const colide = { diaP1: 1, diaP2: 5, diaEv: 2 };
    const r = diasDaSemanaComFeriado(colide, '2026-09-07', 1); // segunda, Independência
    expect(r.diaP1).toBe(-1); // cancelada, não empurrada para a terça
    expect(r.diaEv).toBe(2);  // intacta, sempre
    expect(r.deslocou.join(' ')).toContain('cancelada');
  });

  it('a evidência NUNCA se move, nem quando ela mesma cai em feriado', () => {
    // 07/09 é segunda. Com a evidência configurada para segunda, ela fica —
    // o pedido foi explícito: "os envios de quinta permanecem".
    const r = diasDaSemanaComFeriado({ diaP1: 3, diaP2: 5, diaEv: 1 }, '2026-09-07', 1);
    expect(r.diaEv).toBe(1);
  });

  it('feriado que não é dia de envio não muda nada', () => {
    // 25/12/2026 é uma sexta — nenhum dos três papéis cai nela.
    const r = diasDaSemanaComFeriado(PADRAO, '2026-12-25', 5);
    expect(r.deslocou).toEqual([]);
  });
});
