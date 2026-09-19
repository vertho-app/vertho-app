import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';
import type { CodigoCompetencia } from './matriz';

export const ORDEM_COMPETENCIAS: readonly CodigoCompetencia[] = ['PL', 'P', 'A', 'C', 'E'];
export type NotasPorCompetencia = Partial<Record<CodigoCompetencia, number | null>>;

export interface EvolucaoCompetencia {
  codigo: CodigoCompetencia;
  /** Maior nível alcançado nos treinos com devolutiva liberada. */
  nivelAlcancado: Nivel | null;
  primeiroNivel: Nivel | null;
  subiu: boolean;
  /** Treinos em que a competência teve nível. */
  treinos: number;
}

/**
 * Evolução por competência nos treinos concluídos, só com AVANÇO (regra do
 * produto para evolução): o maior nível alcançado e se ele passou do primeiro
 * nível registrado. Um treino pior depois de um melhor não aparece como queda;
 * cada simulação tem cliente e dificuldade diferentes.
 * `treinos` chega na ordem do histórico (mais recente primeiro).
 */
export function evolucaoPorCompetencia(
  treinos: ReadonlyArray<{ competencias?: NotasPorCompetencia | null }>,
): EvolucaoCompetencia[] {
  const cronologica = [...treinos].reverse();
  return ORDEM_COMPETENCIAS.map((codigo) => {
    const niveis = cronologica
      .map((t) => t.competencias?.[codigo])
      .filter((n): n is number => typeof n === 'number')
      .map((n) => nivelDaNota(n));
    const primeiroNivel = niveis[0] ?? null;
    const nivelAlcancado = niveis.length ? (Math.max(...niveis) as Nivel) : null;
    return {
      codigo,
      nivelAlcancado,
      primeiroNivel,
      subiu: primeiroNivel !== null && nivelAlcancado !== null && nivelAlcancado > primeiroNivel,
      treinos: niveis.length,
    };
  });
}

/** Quantos treinos já têm níveis por competência (a evolução aparece a partir de 2). */
export const treinosComNiveis = (treinos: ReadonlyArray<{ competencias?: NotasPorCompetencia | null }>) =>
  treinos.filter((t) => t.competencias && ORDEM_COMPETENCIAS.some((c) => typeof t.competencias![c] === 'number')).length;
