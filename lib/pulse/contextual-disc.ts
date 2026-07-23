import type { DiscFactor, PulseQuestion } from './template';

export interface DiscRankingAnswer {
  kind: 'ranking';
  orderedOptionKeys: string[];
}

export interface DiscPairAnswer {
  kind: 'pair';
  selectedOptionKey: string;
  selectedFactor: DiscFactor;
}

export type ContextualDiscAnswer = DiscRankingAnswer | DiscPairAnswer;

export interface ContextualDiscResult {
  version: 'pulse-contextual-disc-v1';
  scores: Record<DiscFactor, number>;
  rawScores: Record<DiscFactor, number>;
  answeredQuestions: number;
}

const FACTORS: DiscFactor[] = ['D', 'I', 'S', 'C'];
const RANK_WEIGHTS = [10, 6, 3, 1];

export function sanitizeContextualAnswer(
  question: PulseQuestion,
  value: unknown,
): ContextualDiscAnswer | null {
  const options = question.disc_options || [];
  if (!value || typeof value !== 'object' || options.length === 0) return null;

  if (question.question_type === 'disc_ranking') {
    const orderedOptionKeys = (value as { orderedOptionKeys?: unknown }).orderedOptionKeys;
    if (!Array.isArray(orderedOptionKeys) || orderedOptionKeys.some(key => typeof key !== 'string')) {
      return null;
    }
    const expected = options.map(option => option.key).sort();
    const received = [...orderedOptionKeys].sort();
    if (
      received.length !== expected.length
      || new Set(received).size !== received.length
      || received.some((key, index) => key !== expected[index])
    ) {
      return null;
    }
    return { kind: 'ranking', orderedOptionKeys: [...orderedOptionKeys] };
  }

  if (question.question_type === 'disc_pair') {
    const selectedOptionKey = (value as { selectedOptionKey?: unknown }).selectedOptionKey;
    if (typeof selectedOptionKey !== 'string') return null;
    const selected = options.find(option => option.key === selectedOptionKey);
    if (!selected) return null;
    return {
      kind: 'pair',
      selectedOptionKey,
      selectedFactor: selected.factor,
    };
  }

  return null;
}

export function hasRequiredAnswer(
  question: PulseQuestion,
  response?: {
    numeric_answer?: number | null;
    text_answer?: string | null;
    answer_json?: unknown;
  },
): boolean {
  if (!response) return false;
  if (question.question_type === 'likert_1_5') return response.numeric_answer != null;
  if (question.question_type === 'open_text') return Boolean(response.text_answer?.trim());
  return sanitizeContextualAnswer(question, response.answer_json) != null;
}

export function computeContextualDisc(
  questions: PulseQuestion[],
  responses: Record<string, { answer_json?: unknown }>,
): ContextualDiscResult | null {
  const contextualQuestions = questions.filter(
    question => question.question_type === 'disc_ranking' || question.question_type === 'disc_pair',
  );
  if (contextualQuestions.length === 0) return null;

  const rawScores: Record<DiscFactor, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const question of contextualQuestions) {
    const answer = sanitizeContextualAnswer(question, responses[question.id]?.answer_json);
    if (!answer) return null;

    if (answer.kind === 'ranking') {
      answer.orderedOptionKeys.forEach((key, index) => {
        const factor = question.disc_options?.find(option => option.key === key)?.factor;
        if (factor) rawScores[factor] += RANK_WEIGHTS[index] || 0;
      });
    } else {
      rawScores[answer.selectedFactor] += 1;
    }
  }

  const total = FACTORS.reduce((sum, factor) => sum + rawScores[factor], 0);
  const scores: Record<DiscFactor, number> = { D: 50, I: 50, S: 50, C: 50 };
  if (total > 0) {
    for (const factor of FACTORS) {
      scores[factor] = Math.round(rawScores[factor] * 200 / total);
    }
    const roundedTotal = FACTORS.reduce((sum, factor) => sum + scores[factor], 0);
    if (roundedTotal !== 200) {
      const dominant = [...FACTORS].sort((a, b) => scores[b] - scores[a])[0];
      scores[dominant] += 200 - roundedTotal;
    }
  }

  return {
    version: 'pulse-contextual-disc-v1',
    scores,
    rawScores,
    answeredQuestions: contextualQuestions.length,
  };
}
