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

/** Um id "simples": letras, números, `_` e `-`. UUID passa; vírgula, ponto, parêntese e aspas (a sintaxe do filtro) não. */
const ID_SIMPLES = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `empresa_id.eq.<id>,empresa_id.is.null`: "as linhas da empresa E as globais", o filtro mais repetido
 * desta base (20 cópias à mão em 05/10/2026). O id vinha interpolado cru, e em cinco desses pontos
 * ele nasce num parâmetro de Server Action ou de rota: o gate de tenant da frente compara igualdade
 * exata, o que segura quem não é platform admin, mas um filtro montado por concatenação é a classe
 * `.or('a.eq.' + x)` que `valorDeFiltro` existe para fechar. Aqui o id só entra se for simples; qualquer
 * outra coisa vira `empresa_id.is.null` (só as globais, que todo mundo já lê), nunca um filtro a mais.
 * `coluna` é constante do código, nunca dado de usuário.
 */
export function empresaOuGlobal(empresaId: string | null | undefined, coluna = 'empresa_id'): string {
  const id = String(empresaId ?? '');
  return ID_SIMPLES.test(id) ? `${coluna}.eq.${id},${coluna}.is.null` : `${coluna}.is.null`;
}
