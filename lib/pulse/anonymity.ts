/**
 * Guard de anonimato do Pulso de Desenvolvimento.
 *
 * Regra-chave: nenhum recorte agregado com menos de N respondentes
 * pode ser exibido para gestor/RH (N = 7 por spec, fixo).
 *
 * Esta lib é a fonte única da verdade. Toda action que retorna agregados
 * pra UI passa por aqui.
 */

export const PULSE_MIN_N = 7;

export const ANONYMITY_MESSAGE =
  'Dados não exibidos para preservar anonimato. Este recorte não atingiu o mínimo de participantes.';

export interface MaskedAggregate {
  visible: false;
  reason: 'n_too_low';
  respondent_count: number;
  threshold: number;
}

export interface VisibleAggregate<T> {
  visible: true;
  data: T;
  respondent_count: number;
}

export type GuardedAggregate<T> = VisibleAggregate<T> | MaskedAggregate;

export function enforceMinN<T>(
  data: T,
  respondentCount: number,
  threshold = PULSE_MIN_N,
): GuardedAggregate<T> {
  if (respondentCount < threshold) {
    return { visible: false, reason: 'n_too_low', respondent_count: respondentCount, threshold };
  }
  return { visible: true, data, respondent_count: respondentCount };
}

/**
 * Aplica o guard a uma lista de agregados, removendo os que não passam
 * (em vez de mascarar — pra grupos múltiplos onde só interessa mostrar
 * o que pode ser mostrado).
 */
export function filterVisibleGroups<T extends { respondent_count: number }>(
  list: T[],
  threshold = PULSE_MIN_N,
): { visible: T[]; hidden: number } {
  const visible = list.filter(x => x.respondent_count >= threshold);
  return { visible, hidden: list.length - visible.length };
}

/**
 * Classificação cualitativa do índice agregado. Linguagem de desenvolvimento,
 * não punitiva — usada em rótulos e leituras automáticas.
 */
export function classifyScore(score: number): {
  band: 'favoravel' | 'parcial' | 'instavel' | 'bloqueador';
  label: string;
  color: 'green' | 'cyan' | 'amber' | 'red';
} {
  if (score >= 4.2) return { band: 'favoravel', label: 'Ambiente favorável', color: 'green' };
  if (score >= 3.5) return { band: 'parcial', label: 'Parcialmente favorável', color: 'cyan' };
  if (score >= 2.8) return { band: 'instavel', label: 'Requer atenção', color: 'amber' };
  return { band: 'bloqueador', label: 'Sinais de bloqueio', color: 'red' };
}
