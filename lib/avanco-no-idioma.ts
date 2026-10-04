/**
 * O AVANÇO no idioma de quem lê (R-67, 04/10/2026).
 *
 * `formatarValorAvanco` (`lib/season-engine/convergencia.ts`) escreve `+0.3` e `0.0` com ponto
 * decimal, igual para todos. Em pt-BR, pt-PT e es-ES o separador é a vírgula (`+0,3`), e a tela
 * da pessoa já fazia isso à mão (`dec`, em `relatorio-temporada-concluida.tsx`). Aqui o separador
 * vem do `Intl` do idioma, e a regra do avanço (piso zero, uma casa, `+` só quando andou) é a
 * MESMA função: nenhuma conta nova.
 */
import { avancoExibido } from '@/lib/season-engine/convergencia';

const FORMATADORES = new Map<string, Intl.NumberFormat>();

function formatador(locale: string): Intl.NumberFormat {
  let f = FORMATADORES.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
    FORMATADORES.set(locale, f);
  }
  return f;
}

/** Um avanço JÁ calculado (piso zero) em texto no idioma: `+0,3` ou `0,0`; `null` se não há. */
export function formatarValorAvancoNoIdioma(avanco: number | null | undefined, locale: string): string | null {
  if (avanco == null || !Number.isFinite(avanco)) return null;
  return formatador(locale).format(Math.max(0, avanco));
}

/** O avanço entre duas notas, em texto no idioma. */
export function formatarAvancoNoIdioma(notaPre: unknown, notaPos: unknown, locale: string): string | null {
  return formatarValorAvancoNoIdioma(avancoExibido(notaPre, notaPos), locale);
}

/** Um número inteiro (contagem) no idioma, com separador de milhar. */
export function formatarInteiroNoIdioma(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
}

/** Um percentual (0 a 100) no idioma: `50%` em en-US, `50 %` em es-ES. Sem casa decimal. */
export function formatarPercentualNoIdioma(pct: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(pct / 100);
}
