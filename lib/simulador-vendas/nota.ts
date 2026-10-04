import { nivelDaNotaOuNull } from '@/lib/nivel-da-nota-ou-nulo';
import type { Nivel } from '@/lib/nivel-regua';

/** Zero é calculado normalmente, mas a interface o representa como ausência de evidência. */
export function formatarNotaPace(
  valor: number | null | undefined,
  locale: string,
) {
  return valor == null || valor === 0
    ? '\u2014'
    : valor.toLocaleString(locale, { maximumFractionDigits: 2 });
}

/**
 * O NÍVEL (N1 a N4) de uma nota PACE, para tudo que o cliente lê (R-35, 04/10/2026).
 * A decisão do dono é que ninguém do cliente vê nota decimal: a tela da devolutiva
 * mostrava "Média 2,5 / 4", o histórico "Nota PACE 2,5" e o CSV, PL, P, A, C, E e
 * Média com casas decimais. `formatarNotaPace` fica só para o admin da Vertho.
 *
 * Zero e ausência são "sem evidência", como em `formatarNotaPace`: devolvem `null`,
 * e a tela mostra o traço em vez de "Nível 1".
 */
export function nivelDaNotaPace(valor: number | null | undefined): Nivel | null {
  return valor == null || valor === 0 ? null : nivelDaNotaOuNull(valor);
}
