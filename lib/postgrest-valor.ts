/**
 * Valor de TEXTO LIVRE dentro de um filtro `.or()`/`.and()` do PostgREST.
 *
 * O supabase-js monta esses filtros por concatenação, e vírgula, parêntese e
 * ponto fazem parte da SINTAXE do filtro: um e-mail como `a@b.cc,id.not.is.null`
 * virava uma condição OR a mais e devolvia todas as linhas do escopo (análise de
 * 05/10/2026, `buildRelatorioIndividualPrompt`). A forma documentada de passar um
 * valor com caracteres reservados é entre aspas duplas, com `\` e `"` escapados.
 *
 * Use só para texto que não é UUID, número nem enumeração controlada. Para o
 * curinga do LIKE/ILIKE o escape é outro: `escaparLike` em `@/lib/sql-like`.
 */
export function valorDeFiltro(valor: string): string {
  return `"${String(valor).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
