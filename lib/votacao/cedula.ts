/**
 * Cédula da votação de competências: a lista em que cada pessoa escolhe as 5.
 *
 * Decisão do dono (25/09/2026): a cédula é a TOP 10 do cargo, não a matriz
 * inteira. A IA1 escolhe 10 com o contexto do cargo, o admin revisa na aba
 * Top 10, as pessoas priorizam 5 e o admin aprova a Top 5 na aba Votação. Até
 * então a cédula era a matriz inteira (16 competências no Professor(a) da
 * 4Life) e a Top 10 só aparecia na hora da aprovação.
 *
 * Cargo sem Top 10 cai na matriz inteira, que era o comportamento anterior:
 * cédula vazia travaria a pessoa sem saída. A aba Votação mostra a fonte de
 * cada cargo, e quem lê o resultado registra a degradação enquanto a votação
 * estiver aberta.
 *
 * Ordem ALFABÉTICA, nunca a posição da IA: a lista na ordem da IA puxaria o
 * voto para o ranking dela, e o que se quer medir é a prioridade de quem vota.
 */

export type FonteDaCedula = 'top10' | 'matriz';

export interface ItemDaCedula {
  nome: string;
  cod_comp: string | null;
  descricao: string | null;
  pilar: string | null;
}

export interface CompetenciaDaCedula {
  nome?: string | null;
  cod_comp?: string | null;
  descricao?: string | null;
  pilar?: string | null;
  cargo?: string | null;
}

export interface LinhaTop10DaCedula {
  cargo?: string | null;
  competencia?: CompetenciaDaCedula | null;
}

export interface Cedula {
  fonte: FonteDaCedula;
  competencias: ItemDaCedula[];
}

/**
 * Mesma régua de cargo que a cédula já usava: sem caixa, sem acento, sem espaço
 * nas pontas. "Coordenação Pedagógica" no cadastro e "coordenacao pedagogica"
 * na pessoa são o mesmo cargo.
 */
export function normalizarCargoDaCedula(cargo: string | null | undefined): string {
  return String(cargo || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}

/** A matriz tem uma linha por DESCRITOR: sem dedup, cada competência entraria 6 vezes. */
function deduplicar(linhas: Array<CompetenciaDaCedula | null | undefined>): ItemDaCedula[] {
  const porChave = new Map<string, ItemDaCedula>();
  for (const c of linhas) {
    const nome = String(c?.nome || '').trim();
    if (!c || !nome) continue;
    const chave = c.cod_comp || nome;
    if (porChave.has(chave)) continue;
    porChave.set(chave, {
      nome,
      cod_comp: c.cod_comp ?? null,
      descricao: c.descricao ?? null,
      pilar: c.pilar ?? null,
    });
  }
  return [...porChave.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Monta a cédula de UM cargo. `top10` e `matriz` podem vir da empresa inteira:
 * o filtro por cargo é feito aqui. Quem só precisa saber se há Top 10 pode
 * passar `matriz: []` e buscar a matriz apenas quando a fonte vier `matriz`.
 */
export function montarCedula(args: {
  cargo: string | null | undefined;
  top10: LinhaTop10DaCedula[] | null | undefined;
  matriz: CompetenciaDaCedula[] | null | undefined;
}): Cedula {
  const alvo = normalizarCargoDaCedula(args.cargo);
  if (!alvo) return { fonte: 'matriz', competencias: [] };

  const doTop10 = deduplicar(
    (args.top10 || [])
      .filter((t) => normalizarCargoDaCedula(t?.cargo) === alvo)
      .map((t) => t.competencia),
  );
  if (doTop10.length) return { fonte: 'top10', competencias: doTop10 };

  return {
    fonte: 'matriz',
    competencias: deduplicar((args.matriz || []).filter((c) => normalizarCargoDaCedula(c?.cargo) === alvo)),
  };
}
