/**
 * Versões do cenário A numa CÉLULA (competência × cargo × PPP): qual é a mais nova e quais
 * já foram substituídas. Régua ÚNICA da regeneração (servidor) e da tela da Fase 1.
 *
 * Plano de cenários de 11/10/2026, Fase 0: regenerar um A já respondido cria uma LINHA NOVA
 * na mesma célula, e a respondida fica intacta (`aplicarCandidataIA3`). Conferido em
 * 13/10/2026: "Revisar todos", "Regerar selecionados" e o botão "Regenerar" agem pelo id da
 * linha, e a respondida continua na lista com a nota antiga. Sem esta régua, cada clique nela
 * criaria mais uma linha, a trava "nunca piora" compararia a candidata com a versão ANTIGA, e
 * "Revisar todos" repetido faria a célula crescer sem limite. Só a mais nova se regenera.
 *
 * "Mais nova" é por `created_at`, a mesma ordem em que o assessment escolhe o que servir
 * (`escolherCenarioDaCompetencia`, entre os aptos). O Cenário B fica de fora: tem tela
 * própria (Fase 5), que confere se ele já foi servido no fechamento.
 *
 * Puro (sem imports): roda no servidor e na tela.
 */

export interface LinhaDaCelula {
  id: string;
  competencia_id?: string | null;
  cargo?: string | null;
  ppp_escola_id?: string | null;
  tipo_cenario?: string | null;
  created_at?: string | null;
}

export function ehCenarioB(c: { tipo_cenario?: string | null } | null | undefined): boolean {
  return c?.tipo_cenario === 'cenario_b';
}

/** A célula do A: competência, cargo e PPP (sem PPP = rede). */
export function chaveDaCelulaA(c: LinhaDaCelula): string {
  return `${c.competencia_id ?? ''}::${c.cargo ?? ''}::${c.ppp_escola_id || 'rede'}`;
}

function instante(c: LinhaDaCelula): number {
  return Date.parse(String(c?.created_at ?? ''));
}

/**
 * A linha MAIS NOVA da mesma célula que veio depois de `cen`, ou `null` quando `cen` é a
 * mais nova. Sem data legível não há ordem para afirmar: devolve `null`.
 */
export function versaoMaisNovaQue<T extends LinhaDaCelula>(cen: LinhaDaCelula, linhas: T[]): T | null {
  if (!cen || ehCenarioB(cen)) return null;
  const t0 = instante(cen);
  if (!Number.isFinite(t0)) return null;
  const chave = chaveDaCelulaA(cen);
  let maisNova: T | null = null;
  for (const l of linhas || []) {
    if (!l || l.id === cen.id || ehCenarioB(l) || chaveDaCelulaA(l) !== chave) continue;
    const t = instante(l);
    if (!(t > t0)) continue;
    if (!maisNova || t > instante(maisNova)) maisNova = l;
  }
  return maisNova;
}

/** Ids das linhas A que têm versão mais nova na mesma célula (a tela marca e tira das filas de regeneração). */
export function idsSubstituidos(linhas: LinhaDaCelula[]): Set<string> {
  const ids = new Set<string>();
  for (const l of linhas || []) {
    if (l && versaoMaisNovaQue(l, linhas)) ids.add(l.id);
  }
  return ids;
}
