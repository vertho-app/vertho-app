/**
 * Títulos de coluna das planilhas de import em português claro → coluna do banco.
 * Fonte única para os imports que aceitam título "de gente" (matriz de
 * competências, cargos). O parser (lib/parse-spreadsheet.ts) só põe o título em
 * minúsculas; aqui ele perde também acento e pontuação, então "Decisões
 * recorrentes", "decisoes_recorrentes" e "DECISÕES-RECORRENTES" são o mesmo.
 * Roda no navegador: não importa nada de servidor.
 */

/** Texto sem acento, sem caixa e com qualquer pontuação virando um espaço. */
export const chaveSemAcento = (s: unknown): string =>
  String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Troca cada título conhecido (chave do `mapa`, já em `chaveSemAcento`) pela
 * coluna do banco; título desconhecido fica como veio. Com dois títulos para a
 * mesma coluna na planilha, vale o preenchido.
 */
export function traduzirTitulos(
  linhas: Record<string, string>[], mapa: Record<string, string>,
): Record<string, string>[] {
  return linhas.map((linha) => {
    const saida: Record<string, string> = {};
    for (const [titulo, valor] of Object.entries(linha)) {
      const coluna = mapa[chaveSemAcento(titulo)] ?? titulo;
      if (!String(saida[coluna] ?? '').trim()) saida[coluna] = valor;
    }
    return saida;
  });
}
