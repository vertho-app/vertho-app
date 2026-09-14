/** Escapa separador/aspas e neutraliza fórmulas, inclusive após espaços invisíveis. */
export function celulaCsv(valor: unknown): string {
  const texto = String(valor ?? '');
  const perigoso = /^[\s\uFEFF]*[=+@\-]/.test(texto) || /^[\t\r\n]/.test(texto);
  return `"${perigoso ? "'" : ''}${texto.replace(/"/g, '""')}"`;
}
export function montarCsv(linhas: unknown[][]): string {
  return linhas.map((row) => row.map(celulaCsv).join(';')).join('\r\n');
}
