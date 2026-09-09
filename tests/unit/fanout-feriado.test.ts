import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { diasDaSemanaComFeriado } from '@/lib/fase4/feriados';

/**
 * O fan-out do cron diário decide QUAIS empresas recebem task. Se ele comparar o
 * dia com a cadência CRUA, a empresa cuja cadência foi deslocada por feriado fica
 * de fora — e o worker, que sabe do deslocamento, nunca é chamado para corrigir.
 *
 * `Medido: 09/09/2026` — o feriado de 07/09 empurrou a P1 do Ibipeba de segunda
 * para terça e a P2 de terça para quarta. Na quarta o fan-out enfileirou **1 de
 * 12** empresas e as **36 pessoas do Ibipeba não receberam a P2**. O log da
 * execução diz "1/1 empresas enfileiradas", que parece perfeitamente saudável:
 * o denominador também encolhe, então nada acusa.
 *
 * Este teste trava a régua do filtro, que é a mesma do motor.
 */

/** Cadência do Ibipeba: P1 segunda, P2 terça, evidência quinta. */
const IBIPEBA = { diaP1: 1, diaP2: 2, diaEv: 4 };
/** Cadência do Macaé: P1 terça, P2 quarta, evidência quinta. */
const MACAE = { diaP1: 2, diaP2: 3, diaEv: 4 };

/** O predicado do fan-out, com a régua aplicada. */
const temEntrega = (cad: typeof IBIPEBA, hojeUTC: string, dow: number) => {
  const { diaP1, diaP2, diaEv } = diasDaSemanaComFeriado(cad, hojeUTC, dow);
  return dow === diaP1 || dow === diaP2 || dow === diaEv;
};

describe('fan-out do cron diário na semana de feriado', () => {
  it('🔴 quarta 09/09: o Ibipeba TEM entrega (a P2 andou da terça)', () => {
    expect(temEntrega(IBIPEBA, '2026-09-09', 3)).toBe(true);
  });

  it('🔴 terça 08/09: o Ibipeba TEM entrega (a P1 andou da segunda)', () => {
    expect(temEntrega(IBIPEBA, '2026-09-08', 2)).toBe(true);
  });

  it('segunda 07/09 (o próprio feriado): nada sai', () => {
    expect(temEntrega(IBIPEBA, '2026-09-07', 1)).toBe(false);
  });

  it('quem já roda ter/qua não se move, e a quinta continua sendo a evidência', () => {
    expect(temEntrega(MACAE, '2026-09-08', 2)).toBe(true);
    expect(temEntrega(MACAE, '2026-09-09', 3)).toBe(true);
    expect(temEntrega(MACAE, '2026-09-10', 4)).toBe(true);
  });

  it('semana sem feriado: os dias são exatamente os da config', () => {
    expect(temEntrega(IBIPEBA, '2026-09-14', 1)).toBe(true);   // segunda, P1
    expect(temEntrega(IBIPEBA, '2026-09-15', 2)).toBe(true);   // terça, P2
    expect(temEntrega(IBIPEBA, '2026-09-16', 3)).toBe(false);  // quarta, nada
    expect(temEntrega(IBIPEBA, '2026-09-17', 4)).toBe(true);   // quinta, evidência
  });

  it('a régua não inventa entrega em dia que nunca teve', () => {
    expect(temEntrega(IBIPEBA, '2026-09-11', 5)).toBe(false); // sexta
    expect(temEntrega(IBIPEBA, '2026-09-12', 6)).toBe(false); // sábado
  });

  /**
   * Os casos acima exercitam a RÉGUA. Este exercita o CALL-SITE: sem ele, mutar
   * o filtro do fan-out de volta para os dias crus deixava tudo verde — o teste
   * media a função certa no arquivo errado.
   */
  it('🔴 o filtro do fan-out aplica a régua, não os dias crus da config', () => {
    const fonte = readFileSync(join(process.cwd(), 'actions/cron-jobs.ts'), 'utf-8');
    const filtro = fonte.slice(fonte.indexOf('const doDia = '), fonte.indexOf('// FAN-OUT:'));
    expect(filtro.length).toBeGreaterThan(100);
    // Exige a CHAMADA, não a menção: o comentário acima do filtro cita a função
    // pelo nome, e um `toContain` casaria nele mesmo com a régua removida do
    // código — o mutante sobreviveu assim na primeira versão deste teste.
    expect(filtro).toMatch(/diasDaSemanaComFeriado\s*\(/);
    expect(filtro).toMatch(/hoje === diaP1/);
    // e os dias da config só entram COMO ARGUMENTO da régua, nunca direto na
    // comparação
    expect(filtro).not.toMatch(/const diaP1 = cadencia/);
  });
});
