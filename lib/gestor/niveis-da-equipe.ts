/**
 * O nível que a linha de um liderado mostra na "Equipe em trilha" da home do
 * gestor (R-18, 04/10/2026), no lugar da diferença crua entre as médias.
 *
 * Uma jornada de uma competência vira "N2 → N3" quando o nível subiu e só "N3"
 * quando manteve; a trilha DUO traz duas competências e sai uma por vez, separadas
 * por " · ". Sem nível, sem texto: o gestor não lê "N1" por dado faltando.
 *
 * Pura, para a tela e o teste lerem a MESMA função.
 */
export interface NivelDaCompetencia {
  competencia?: string | null;
  nivelInicial: number | null;
  nivelFinal: number | null;
}

export function textoDosNiveis(niveis: NivelDaCompetencia[] | null | undefined): string {
  return (Array.isArray(niveis) ? niveis : [])
    .filter((n) => Number.isInteger(n?.nivelFinal))
    .map((n) => (Number.isInteger(n.nivelInicial) && (n.nivelFinal as number) > (n.nivelInicial as number)
      ? `N${n.nivelInicial} \u2192 N${n.nivelFinal}`
      : `N${n.nivelFinal}`))
    .join(' \u00b7 ');
}
