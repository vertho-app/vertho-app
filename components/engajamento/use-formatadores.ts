'use client';

import { useFormatter } from 'next-intl';

/**
 * Números e percentuais do Engajamento pelo `Intl` do idioma de quem lê (R-67):
 * separador de milhar, espaço antes do `%` (es-ES) e vírgula decimal saem
 * certos sem string fixa. O percentual do roll-up é inteiro (0 a 100), e o
 * `Intl` espera a fração.
 */
export function useFormatadores() {
  const format = useFormatter();
  return {
    num: (valor: number) => format.number(valor),
    pct: (valorInteiro: number) => format.number(valorInteiro / 100, { style: 'percent' }),
  };
}
