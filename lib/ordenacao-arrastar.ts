/**
 * Onde cai o item que está sendo ARRASTADO numa lista vertical ordenável.
 *
 * Pura de propósito (sem DOM): a tela mede o ponto médio vertical de cada linha e passa
 * aqui junto com a posição do ponteiro; o resultado é a ordem nova. Assim o gesto
 * (mouse e toque) é testável sem navegador.
 *
 * Regra: o item arrastado fica depois de TODAS as outras linhas cujo ponto médio está
 * acima do ponteiro. Conta só as OUTRAS: quando o arrastado cruza uma linha, ela se
 * desloca meia altura para o outro lado do ponteiro, mas continua do mesmo lado em que
 * a contagem a colocou — por isso a lista não oscila.
 */
export function ordemAoArrastar(
  ordem: readonly string[],
  arrastado: string,
  ponteiroY: number,
  pontoMedio: Record<string, number>,
): string[] {
  if (!ordem.includes(arrastado)) return [...ordem];
  const outros = ordem.filter((id) => id !== arrastado);
  const k = outros.filter((id) => {
    const m = pontoMedio[id];
    return typeof m === 'number' && m < ponteiroY;
  }).length;
  return [...outros.slice(0, k), arrastado, ...outros.slice(k)];
}
