/**
 * O NÍVEL MAIS FREQUENTE de um conjunto de pessoas (R-32, 04/10/2026).
 *
 * Decisão do dono (decisão 1 da revisão de 02/10): ninguém do cliente vê nota
 * decimal nem média. As telas do RH e do gestor mostravam "2,3 / 4" e "Nível
 * médio 2,34" por competência e por comportamento: a média de níveis inteiros é
 * um número que nenhuma pessoa tem, e que convida a comparar cargos por uma
 * casa decimal. Quando o conjunto precisa de UM resumo, o que cabe é o nível
 * em que mais gente está, e ele sai da MESMA distribuição que a tela já
 * desenha ao lado (as barras de N1 a N4).
 *
 * EMPATE vai para o nível MENOR: é a leitura prudente para quem decide onde
 * investir, e dá sempre a mesma resposta para a mesma distribuição (sem
 * depender da ordem em que o array chegou).
 *
 * `null` quando ninguém está em nível nenhum: ausência não é N1.
 */
export interface PesoDeNivel {
  level: number;
  /** Quantas pessoas, ou o percentual: só a proporção entre os níveis importa. */
  peso: number;
}

export function nivelMaisFrequente(distribuicao: PesoDeNivel[] | null | undefined): 1 | 2 | 3 | 4 | null {
  let melhor: 1 | 2 | 3 | 4 | null = null;
  let maior = 0;
  const ordenada = [...(Array.isArray(distribuicao) ? distribuicao : [])]
    .filter((d) => Number.isInteger(d?.level) && d.level >= 1 && d.level <= 4 && Number.isFinite(d.peso) && d.peso > 0)
    .sort((a, b) => a.level - b.level);
  for (const d of ordenada) {
    if (d.peso > maior) {
      maior = d.peso;
      melhor = d.level as 1 | 2 | 3 | 4;
    }
  }
  return melhor;
}
