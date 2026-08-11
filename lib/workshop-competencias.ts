/**
 * Lista de competências que a curadoria (workshop / Top 5) oferece por cargo.
 *
 * Fonte ÚNICA das duas telas que fazem a seleção — `/admin/cargos` e
 * `/admin/empresas/[id]/fase1?tab=top5`. Elas divergiam: a primeira já somava
 * as competências VOTADAS fora da Top 10, a segunda listava só a Top 10.
 *
 * A Top 10 é o ranking da IA1, não o catálogo do cargo: competência que existe
 * no cargo mas não entrou no ranking nem passou por votação ficava INALCANÇÁVEL
 * na curadoria, e a única saída era inflar a Top 10. Foi o caso de "Autocuidado
 * e bem-estar profissional" (TCH12) no Professor(a) de Macaé — a competência
 * foco do piloto. Quem lê o resultado é `top5_workshop`, que a fila da IA3 e o
 * mapeamento de competências consomem direto; a Top 10 nunca foi filtro deles
 * (ver `listarFilaIA3` em actions/fase1.ts).
 */

/** Régua de igualdade entre nomes de competência (mesma de relatorio-individual-prompt e blueprint/core). */
export function normalizarComp(s: unknown): string {
  return (s || '').toString().trim().toLowerCase();
}

export interface FontesWorkshop {
  /** Ranking da IA1 (top10_cargos), na ordem. */
  top10?: string[];
  /** Escolhidas na votação (votacao_competencias.competencias_escolhidas). */
  votadas?: string[];
  /** Catálogo de competências do cargo (tabela `competencias`). */
  catalogo?: string[];
  /** Já salvas em top5_workshop — precisam continuar visíveis e marcadas. */
  selecionadas?: string[];
}

export interface ListaWorkshop {
  /** Votadas que não estão na Top 10. */
  votadasExtra: string[];
  /** Do catálogo do cargo, fora da Top 10 e da votação. */
  catalogoExtra: string[];
  /** União ordenada: Top 10 → votadas → catálogo → já selecionadas. */
  workshop: string[];
}

/**
 * União das fontes, sem repetição. O dedup é por nome NORMALIZADO porque a
 * votação guarda o texto digitado: "Gestão de Sala " e "Gestão de sala" são a
 * mesma competência e apareceriam duas vezes na lista. O texto EXIBIDO é o da
 * primeira fonte que trouxe o nome — é ele que vai para `top5_workshop`.
 */
export function montarListaWorkshop(fontes: FontesWorkshop): ListaWorkshop {
  const vistos = new Set<string>();
  const inedita = (v: string) => {
    const k = normalizarComp(v);
    if (!k || vistos.has(k)) return false;
    vistos.add(k);
    return true;
  };

  const base = (fontes.top10 || []).filter(inedita);
  const votadasExtra = [...(fontes.votadas || [])].sort().filter(inedita);
  const catalogoExtra = [...(fontes.catalogo || [])].filter(inedita);
  const selecionadasExtra = [...(fontes.selecionadas || [])].filter(inedita);

  return {
    votadasExtra,
    catalogoExtra,
    workshop: [...base, ...votadasExtra, ...catalogoExtra, ...selecionadasExtra],
  };
}
