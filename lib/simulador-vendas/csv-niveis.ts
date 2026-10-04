import { nivelDaNotaPace } from '@/lib/simulador-vendas/nota';

/**
 * Os seis resultados PACE de uma linha do CSV do histórico, em NÍVEL (R-35,
 * 04/10/2026). O CSV que o RH e o gestor baixam saía com PL, P, A, C, E e Média em
 * nota decimal, contra a decisão do dono de que ninguém do cliente vê nota: a
 * exportação "com nível" é a mesma decisão da tela.
 *
 * Ordem fixa do cabeçalho: PL, P, A, C, E, geral. Vazio é "sem evidência" (nota 0 ou
 * ausente), nunca "1": um participante sem plano não aparece como N1.
 */
export interface LinhaPaceCsv {
  PL: number | null;
  P: number | null;
  A: number | null;
  C: number | null;
  E: number | null;
  Media: number | null;
}

export function niveisParaCsv(r: LinhaPaceCsv): Array<number | ''> {
  return [r.PL, r.P, r.A, r.C, r.E, r.Media].map((nota) => nivelDaNotaPace(nota) ?? '');
}
