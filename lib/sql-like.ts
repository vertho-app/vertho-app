/**
 * `%` e `_` são CURINGA no LIKE/ILIKE do Postgres. Filtrar valor livre (e-mail,
 * slug, nome) com `.ilike()` sem escapar amplia o escopo em silêncio: em 06/08
 * a listagem de liderados usava `.ilike('gestor_email', email)` e um e-mail com
 * underscore casava gente que não era a mesma pessoa — mais larga que o gate de
 * posse escrito com igualdade exata, o que produz "o card aparece e não abre".
 *
 * Verificado contra ESTE projeto em 10/08 (Postgres e PostgREST, as duas pontas —
 * o escape precisa sobreviver à querystring, não só ao SQL):
 *   `slug=ilike.maca_`   → 1 linha (casou "macae": o `_` é curinga)
 *   `slug=ilike.maca\_`  → 0 linhas (literal, como se espera)
 *
 * Use quando o filtro precisa ser case-insensitive mas o valor é LITERAL.
 * `.ilike()` cru fica reservado para curinga INTENCIONAL.
 */
export function escaparLike(valor: string): string {
  return String(valor ?? '').replace(/([\\%_])/g, '\\$1');
}
