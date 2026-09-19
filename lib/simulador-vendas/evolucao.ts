import {
  evolucaoPorCompetencia as evolucaoComum,
  type EvolucaoCompetencia as EvolucaoComum,
} from '@/lib/simuladores/evolucao';
import type { CodigoCompetencia } from './matriz';

export const ORDEM_COMPETENCIAS: readonly CodigoCompetencia[] = ['PL', 'P', 'A', 'C', 'E'];
export type NotasPorCompetencia = Partial<Record<CodigoCompetencia, number | null>>;
export type EvolucaoCompetencia = EvolucaoComum<CodigoCompetencia>;

/**
 * Evolução por competência nos treinos concluídos, só com AVANÇO. A régua é a
 * do núcleo comum (`lib/simuladores/evolucao.ts`), a mesma do atendimento; aqui
 * ficam só as competências PACE. `treinos` chega na ordem do histórico (mais
 * recente primeiro).
 */
export function evolucaoPorCompetencia(
  treinos: ReadonlyArray<{ competencias?: NotasPorCompetencia | null }>,
): EvolucaoCompetencia[] {
  return evolucaoComum(treinos, ORDEM_COMPETENCIAS);
}

/** Quantos treinos já têm níveis por competência (a evolução aparece a partir de 2). */
export const treinosComNiveis = (treinos: ReadonlyArray<{ competencias?: NotasPorCompetencia | null }>) =>
  treinos.filter((t) => t.competencias && ORDEM_COMPETENCIAS.some((c) => typeof t.competencias![c] === 'number')).length;
