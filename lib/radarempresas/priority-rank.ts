/**
 * `priority_rank` — o percentil que decide quem é "top 10%" do Radar.
 *
 * ── 🔴 B7 (auditoria de 22/08): score idêntico dava rank diferente ─────────
 *
 * O cálculo era:
 *
 *     elegiveis.sort((a, b) => a.score - b.score);
 *     elegiveis.forEach((e, idx) => rank(e.id, (idx / (ne - 1)) * 100));
 *
 * O `sort` do JS é **estável** (ES2019), então empates preservam a ordem em que
 * a varredura os entregou — e a varredura paginava com `.range()` **sem
 * `.order()`**, onde a ordem entre páginas não é garantida por nada. O percentil
 * transformava essa ordem arbitrária em nota de corte.
 *
 * `Medido em 24/08` (74.285 elegíveis gravados):
 *  · o score de corte é **69,4**, e há **237 estabelecimentos empatados nele**:
 *    185 entraram como priorizados e 52 idênticos ficaram de fora, sem nenhum
 *    critério separando os dois grupos;
 *  · e o problema é muito maior que o corte — há só **461 scores distintos** para
 *    74.285 linhas, então **74.264 (99,97%) empatam com alguém**. O maior bloco
 *    tem **23.131 linhas no MESMO score**, espalhadas por ~31 pontos de percentil
 *    pela ordem de varredura. Dentro de um bloco, o `priority_rank` não media
 *    nada: era ruído com cara de posição.
 *
 * A correção é a definição de percentil que a estatística já usa: **mesmo valor,
 * mesmo rank**. Todo o bloco de empate recebe um número só, e o corte passa a
 * incluir ou excluir o bloco inteiro — nunca parti-lo.
 *
 * ⚠️ **De que lado do corte o bloco fica é decisão, e ela está tomada aqui:**
 * o rank do bloco é o do seu ÚLTIMO elemento (`CUME_DIST`), não o do primeiro
 * (`PERCENT_RANK`). As duas foram medidas contra o dado real:
 *
 *   | régua                          | priorizados | efeito |
 *   |--------------------------------|-------------|--------|
 *   | hoje (bloco partido ao meio)   | 7.466       | 185 dentro, 52 idênticos fora |
 *   | topo do bloco (**escolhida**)  | 7.518       | +52, ninguém sai |
 *   | base do bloco (`PERCENT_RANK`) | 7.281       | −185 |
 *
 * A base é a convenção mais comum, mas tiraria 185 empresas de uma lista que
 * alimenta o funil comercial — empresas possivelmente já em prospecção. Num
 * funil, o falso positivo custa uma abordagem a mais; o falso negativo é uma
 * empresa boa que ninguém trabalha. Entre encolher e crescer 0,7%, cresce.
 */

export interface ElegivelParaRank {
  id: string;
  score: number;
}

/**
 * Percentil 0–100 (uma casa decimal) por id. Empates recebem o MESMO valor.
 *
 * Com um único elegível não existe percentil — devolve 50, que é o neutro que o
 * cálculo anterior já usava (mudar isso mexeria no corte sem motivo).
 */
export function calcularPriorityRank(elegiveis: ElegivelParaRank[]): Map<string, number> {
  const rankById = new Map<string, number>();
  const total = elegiveis.length;
  if (total === 0) return rankById;
  if (total === 1) {
    rankById.set(elegiveis[0].id, 50);
    return rankById;
  }

  // Ordenação por VALOR. A ordem entre empatados deixou de importar — é
  // justamente isso que o bug era —, mas a varredura também passou a paginar
  // com `.order()`, para que duas execuções vejam as mesmas linhas.
  const ordenados = [...elegiveis].sort((a, b) => a.score - b.score);

  let i = 0;
  while (i < total) {
    // Fim do bloco de empate: último índice com este mesmo score.
    let fim = i;
    while (fim + 1 < total && ordenados[fim + 1].score === ordenados[i].score) fim++;

    // O bloco inteiro recebe o percentil do TOPO (ver a tabela no cabeçalho).
    const rank = Math.round((fim / (total - 1)) * 1000) / 10;
    for (let k = i; k <= fim; k++) rankById.set(ordenados[k].id, rank);

    i = fim + 1;
  }
  return rankById;
}
