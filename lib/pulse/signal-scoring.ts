/**
 * Normalização de sinais comportamentais pra escala 1-5 (compatível com
 * a escala declarada do Pulso) e mapeamento de cada sinal pras dimensões
 * do Pulso de Desenvolvimento.
 *
 * Os thresholds aqui são chutes iniciais — durante a fase de "calibrating"
 * eles serão ajustados em função de pilotos reais.
 */

import type { DimensionKey } from './template';

export type SignalKey =
  | 'engagement_ia'         // freq de uso da MentorIA/BETO no intervalo
  | 'response_depth'        // profundidade média das respostas (length)
  | 'completion_rate'       // % de tarefas/missões completadas
  | 'pulse_completion';     // % de assignments de pulso completados

export interface SignalScore {
  signal: SignalKey;
  raw: number;              // valor bruto (count, %, length médio)
  score: number;            // normalizado 1-5
  n: number;                // amostra (colabs únicos contemplados no agregado)
  dimensions: DimensionKey[]; // dimensões do pulso que esse sinal informa
}

// ─── Mapeamento sinal → dimensões do Pulso ───────────────────────────────
export const SIGNAL_DIMENSIONS: Record<SignalKey, DimensionKey[]> = {
  engagement_ia:    ['seguranca_aprender', 'lideranca'],
  response_depth:   ['aplicacao_pratica'],
  completion_rate:  ['clareza', 'condicoes'],
  pulse_completion: ['clareza'],
};

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  engagement_ia:    'Engajamento com a MentorIA',
  response_depth:   'Profundidade nas respostas',
  completion_rate:  'Completude de atividades',
  pulse_completion: 'Conclusão do Pulso',
};

// ─── Normalizadores ──────────────────────────────────────────────────────

/**
 * count IA por colab por semana → 1-5
 * 0/sem = 1, 1-2 = 2, 3-5 = 3, 6-9 = 4, 10+ = 5
 */
export function scoreEngagement(avgInteractionsPerWeek: number): number {
  if (avgInteractionsPerWeek <= 0) return 1;
  if (avgInteractionsPerWeek < 3) return 2;
  if (avgInteractionsPerWeek < 6) return 3;
  if (avgInteractionsPerWeek < 10) return 4;
  return 5;
}

/**
 * avg(length de resposta livre) → 1-5
 * <30 chars = 1, 30-80 = 2, 80-200 = 3, 200-400 = 4, 400+ = 5
 */
export function scoreResponseDepth(avgLength: number): number {
  if (avgLength <= 0) return 1;
  if (avgLength < 30) return 1;
  if (avgLength < 80) return 2;
  if (avgLength < 200) return 3;
  if (avgLength < 400) return 4;
  return 5;
}

/**
 * % completo → 1-5
 * <25%=1, 25-50%=2, 50-70%=3, 70-90%=4, 90%+=5
 */
export function scoreRate(pct: number): number {
  if (pct < 25) return 1;
  if (pct < 50) return 2;
  if (pct < 70) return 3;
  if (pct < 90) return 4;
  return 5;
}

export function classifySignal(score: number): {
  label: 'baixo' | 'medio' | 'alto';
  color: 'red' | 'amber' | 'cyan' | 'green';
} {
  if (score <= 2) return { label: 'baixo', color: 'red' };
  if (score <= 3) return { label: 'medio', color: 'amber' };
  if (score <= 4) return { label: 'alto', color: 'cyan' };
  return { label: 'alto', color: 'green' };
}
