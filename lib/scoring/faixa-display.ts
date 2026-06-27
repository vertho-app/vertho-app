/**
 * Formatação da faixa EXIBIDA conforme a direção do traço (Tarefa A).
 *
 * O motor (`traitFit`) credita pleno de `lo` p/ cima em `floor` (ignora `hi`) e de
 * `hi` p/ baixo em `ceiling` (ignora `lo`). Imprimir "[lo, hi]" cru nesses casos
 * MENTE sobre o teto/piso: um traço "mais é melhor" mostrando "41–80" faz o leitor
 * perguntar "se mais é melhor, por que para em 80?". Aqui a exibição passa a refletir
 * o que o motor de fato pontua. Sem símbolos (≥/≤) — a subset Inter dos PDFs não
 * cobre; usamos "41+" e "até 60".
 */
export function formatFaixaPorDirecao(min: number, max: number, direcao?: string): string {
  if (direcao === 'floor') return `${min}+`;
  if (direcao === 'ceiling') return `até ${max}`;
  return `${min} - ${max}`;
}
