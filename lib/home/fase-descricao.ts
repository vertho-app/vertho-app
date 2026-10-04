/**
 * Qual texto descreve a fase da jornada em que a pessoa está, na home (R-27,
 * revisão de 02/10/2026).
 *
 * As cinco fases são as mesmas de `phaseLabels` e de `carregarDashboardData`:
 * 1 Perfil, 2 Avaliação, 3 PDI, 4 Temporada, 5 Reavaliação. Os textos da home
 * estavam deslocados uma posição desde que o Perfil entrou como fase 1 (a
 * descrição da Avaliação ficava na fase 1, a da Temporada na do PDI), e a da
 * Temporada dizia "14 semanas" para todos.
 *
 * Mora aqui, e não dentro da página, para ser testada sem montar a tela. A chave
 * devolvida é de `DashboardHome.phaseDescriptions`.
 */

export type ChaveDescricaoFase =
  | '1' | '2' | '3' | '4' | '5'
  | 'profileWaiting'   // fase 1 com o perfil ainda não liberado pelo RH
  | 'trailBuilding'    // fase 4 sem trilha montada: não há total de semanas a dizer
  | 'fallback';

export function descricaoDaFase(args: {
  /** Número da fase (1 a 5), de `kpis.fase.numero`. */
  faseNum: number;
  /** O perfil comportamental ainda não foi liberado para a pessoa. */
  perfilBloqueado: boolean;
  /** Semanas do programa DESTA pessoa (`duracaoDaTrilha`); `null` sem trilha. */
  semanasDaTemporada: number | null | undefined;
}): { chave: ChaveDescricaoFase; weeks?: number } {
  const { faseNum, perfilBloqueado, semanasDaTemporada } = args;
  if (faseNum === 1) return { chave: perfilBloqueado ? 'profileWaiting' : '1' };
  if (faseNum === 2) return { chave: '2' };
  if (faseNum === 3) return { chave: '3' };
  if (faseNum === 4) {
    return semanasDaTemporada && semanasDaTemporada > 0
      ? { chave: '4', weeks: semanasDaTemporada }
      : { chave: 'trailBuilding' };
  }
  if (faseNum === 5) return { chave: '5' };
  return { chave: 'fallback' };
}
