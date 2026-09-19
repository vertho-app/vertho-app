/**
 * CSV dos três simuladores. Escapa separador e aspas e neutraliza fórmulas,
 * inclusive depois de espaços invisíveis (a célula que começa com `=`, `+`,
 * `@` ou `-` vira texto). Nasceu no vendas; atendimento e liderança exportam
 * pelo mesmo caminho.
 */
export function celulaCsv(valor: unknown): string {
  const texto = String(valor ?? '');
  const perigoso = /^[\s\uFEFF]*[=+@\-]/.test(texto) || /^[\t\r\n]/.test(texto);
  return `"${perigoso ? "'" : ''}${texto.replace(/"/g, '""')}"`;
}
export function montarCsv(linhas: unknown[][]): string {
  return linhas.map((row) => row.map(celulaCsv).join(';')).join('\r\n');
}
