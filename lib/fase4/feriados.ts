/**
 * Feriados nacionais e o deslocamento da cadência semanal.
 *
 * 🔴 POR QUE ISTO É CÓDIGO, E NÃO UMA EDIÇÃO DO `sys_config` (04/09/2026).
 *
 * O pedido foi pontual: 07/09 cai numa segunda, então a pílula da segunda vai
 * para terça e a de terça para quarta, com a quinta intacta. Dava para fazer
 * editando `sys_config.cadencia` dos tenants e revertendo depois — e é
 * exatamente esse "revertendo depois" que esta base já viu falhar: o cron do
 * CONARH seguiu armado duas semanas após a feira porque desligar não era tarefa
 * de ninguém.
 *
 * Uma cadência deslocada que ninguém reverte tem o pior sintoma possível: NÃO
 * HÁ sintoma. As mensagens continuam saindo, só que no dia errado, para sempre.
 * Aqui não há estado para reverter — a régua olha o calendário e desloca só na
 * semana do feriado.
 *
 * O QUE ELA FAZ, exatamente o que foi pedido:
 *   · o dia da 1ª pílula cai em feriado → anda +1;
 *   · se a 2ª pílula colidir com o novo dia da 1ª, ela anda +1 também (senão as
 *     duas cairiam juntas e a pessoa receberia dois conteúdos no mesmo dia);
 *   · a evidência NÃO se move. Ela é o fim da semana e o que avança o
 *     calendário; deslocá-la mexeria no relógio do programa.
 *
 * ⚠️ Só desloca para DENTRO da mesma semana. Se o feriado empurrar um papel para
 * cima do dia da evidência, ele é cancelado naquela semana em vez de atropelá-la
 * — perder uma pílula é recuperável (a pessoa segue na mesma semana), embaralhar
 * a evidência não.
 */

/**
 * Feriados NACIONAIS, em `YYYY-MM-DD`. Só os nacionais: feriado municipal varia
 * por tenant e entraria como configuração, não como constante.
 *
 * ⚠️ As datas MÓVEIS (Carnaval, Sexta-feira Santa, Corpus Christi) dependem da
 * Páscoa e precisam ser conferidas a cada ano — por isso `ULTIMO_ANO_CONFERIDO`
 * abaixo, com um teste que avisa antes de a lista expirar. Lista vencida
 * silenciosamente é o mesmo defeito que ela existe para evitar.
 */
export const FERIADOS_NACIONAIS: readonly string[] = [
  // 2026 — Páscoa em 05/04, conferido em 04/09/2026
  '2026-01-01', // Confraternização Universal
  '2026-02-16', // Carnaval (segunda)
  '2026-02-17', // Carnaval (terça)
  '2026-04-03', // Sexta-feira Santa
  '2026-04-21', // Tiradentes
  '2026-05-01', // Dia do Trabalho
  '2026-06-04', // Corpus Christi
  '2026-09-07', // Independência  ← o que motivou esta régua
  '2026-10-12', // Nossa Senhora Aparecida
  '2026-11-02', // Finados
  '2026-11-15', // Proclamação da República
  '2026-11-20', // Consciência Negra
  '2026-12-25', // Natal
  // 2027 — só os FIXOS. As móveis entram quando alguém conferir a Páscoa (28/03/2027).
  '2027-01-01',
  '2027-04-21',
  '2027-05-01',
  '2027-09-07',
  '2027-10-12',
  '2027-11-02',
  '2027-11-15',
  '2027-11-20',
  '2027-12-25',
] as const;

/** Até quando a lista foi conferida, inclusive as datas móveis. */
export const ULTIMO_ANO_CONFERIDO = 2026;

/** `YYYY-MM-DD` do dia da semana `dow` (0=dom..6=sáb) na semana de `hojeUTC`. */
function dataDoDiaNaSemana(hojeUTC: string, dowHoje: number, dow: number): string {
  const [y, m, d] = hojeUTC.slice(0, 10).split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const alvo = new Date(base + (dow - dowHoje) * 86_400_000);
  return alvo.toISOString().slice(0, 10);
}

export function ehFeriadoNacional(dataISO: string): boolean {
  return FERIADOS_NACIONAIS.includes(dataISO.slice(0, 10));
}

export interface DiasCadencia {
  diaP1: number;
  diaP2: number;
  diaEv: number;
}

/**
 * Os dias da cadência DESTA semana, já deslocados se um feriado nacional cair em
 * cima. Devolve os mesmos números em toda semana sem feriado.
 *
 * `dowHoje` é `new Date().getUTCDay()`, o mesmo índice que a config usa.
 */
export function diasDaSemanaComFeriado(
  dias: DiasCadencia,
  hojeUTC: string,
  dowHoje: number,
): DiasCadencia & { deslocou: string[] } {
  const deslocou: string[] = [];
  const feriado = (dow: number) => ehFeriadoNacional(dataDoDiaNaSemana(hojeUTC, dowHoje, dow));

  let { diaP1, diaP2 } = dias;
  const { diaEv } = dias;

  if (feriado(diaP1)) {
    const novo = diaP1 + 1;
    // Nunca atropela a evidência: melhor perder a pílula da semana do que
    // embaralhar o dia que avança o calendário do programa.
    if (novo < diaEv) { deslocou.push(`p1 ${diaP1}→${novo}`); diaP1 = novo; }
    else { deslocou.push(`p1 ${diaP1} cancelada (deslocaria sobre a evidência)`); diaP1 = -1; }
  }

  // A 2ª pílula anda por DOIS motivos: cair em feriado, ou colidir com o novo
  // dia da 1ª. O segundo é o caso de 07/09 — a p1 vai para terça, que é
  // justamente o dia da p2.
  if (diaP2 === diaP1 || feriado(diaP2)) {
    const novo = diaP2 + 1;
    if (novo < diaEv) { deslocou.push(`p2 ${diaP2}→${novo}`); diaP2 = novo; }
    else { deslocou.push(`p2 ${diaP2} cancelada (deslocaria sobre a evidência)`); diaP2 = -1; }
  }

  return { diaP1, diaP2, diaEv, deslocou };
}
