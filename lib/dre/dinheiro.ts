/**
 * Dinheiro da DRE em centavos inteiros.
 *
 * Somar `number` em ponto flutuante acumula erro de centavo (0,1 + 0,2 não é
 * 0,3), e numa DRE o erro aparece onde dói: a soma das parcelas diferente do
 * valor do contrato, ou a margem de uma semana com R$ 0,01 a mais. Toda soma e
 * toda divisão de valor passa por aqui.
 */

/** R$ → centavos inteiros. Entrada não finita vira 0 (nunca NaN na soma). */
export function paraCentavos(valor: number): number {
  return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
}

/** Centavos → R$ com 2 casas. */
export function deCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

/** Arredonda a centavo. */
export function arredondar2(valor: number): number {
  return deCentavos(paraCentavos(valor));
}

/** Arredonda horas a 2 casas, a precisão da coluna (`numeric(7,2)`). */
export function arredondarHoras(horas: number): number {
  return Number.isFinite(horas) ? Math.round(horas * 100) / 100 : 0;
}

/**
 * `horas × custo/hora` em R$, arredondado a centavo, em ARITMÉTICA INTEIRA.
 *
 * O banco confere `valor_brl = round(horas * custo_hora_brl, 2)` em `numeric`
 * (exato, meio para cima). Em ponto flutuante, `0,15 × 3,30` dá 0,49499999… e
 * arredonda para 0,49, enquanto o banco dá 0,50, e o lançamento seria recusado
 * pela constraint. Aqui as horas viram centésimos e o custo vira centavos
 * (inteiros), o produto é exato, e a divisão por 100 só deixa resto .5 quando o
 * resto é exatamente meio centavo, que o `Math.round` leva para cima como o banco.
 */
export function valorDasHoras(horas: number, custoHoraBrl: number): number {
  const centesimosDeHora = Math.round(horas * 100);
  const centavosPorHora = Math.round(custoHoraBrl * 100);
  return deCentavos(Math.round((centesimosDeHora * centavosPorHora) / 100));
}

/** Soma em centavos e devolve em R$: sem a deriva do ponto flutuante. */
export function somar(valores: readonly number[]): number {
  let total = 0;
  for (const v of valores) total += paraCentavos(v);
  return deCentavos(total);
}
