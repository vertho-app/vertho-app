import type { CopilotPlan } from '@/lib/copiloto/types';

/**
 * O recorte do plano que a tela manda para `/api/copiloto/live`, a cada turno.
 *
 * Vive fora da tela de propósito. Em 02/09/2026 o servidor foi ensinado a usar
 * rotas de objeção, aritmética, hipóteses e a implicação de cada fato — e a tela
 * seguiu mandando cinco chaves sem nada disso. Quatro blocos do prompt ao vivo
 * ficaram mortos por dias enquanto a suíte estava verde, porque o teste da rota
 * montava o plano à mão. Com o recorte num módulo, o teste passa a olhar o objeto
 * que a tela REALMENTE envia, e o contrato deixa de ter dois donos.
 *
 * Quem lê cada campo, em `app/api/copiloto/live/route.ts`:
 * `questions`, `play`, `gaps`, `objections` (fallback), `objectionRoutes`,
 * `valueMath` (só em cocriar/engajar), `hypotheses`, `facts[].relevance`.
 */
export type LivePlanPayload = {
  questions: CopilotPlan['questions'];
  objections: CopilotPlan['objections'];
  play: CopilotPlan['play'];
  gaps: CopilotPlan['gaps'];
  facts: Array<{ title: string; fact: string; relevance: string; publishedAt: string | null }>;
  objectionRoutes: NonNullable<CopilotPlan['objectionRoutes']>;
  valueMath: NonNullable<CopilotPlan['valueMath']>;
  hypotheses: CopilotPlan['hypotheses'];
};

/** As chaves que a rota lê. O teste confere que nenhuma delas volta a sumir. */
export const LIVE_PLAN_KEYS: ReadonlyArray<keyof LivePlanPayload> = [
  'questions', 'objections', 'play', 'gaps', 'facts', 'objectionRoutes', 'valueMath', 'hypotheses',
];

export function buildLivePlan(plan: CopilotPlan | null): LivePlanPayload | null {
  if (!plan) return null;
  return {
    questions: plan.questions,
    objections: plan.objections,
    play: plan.play,
    gaps: plan.gaps,
    // Só os três primeiros fatos chegam ao ao vivo, e `relevance` vai junto: é a
    // implicação que transforma a observação em frase falável.
    facts: plan.facts.slice(0, 3).map((fact) => ({
      title: fact.title, fact: fact.fact, relevance: fact.relevance, publishedAt: fact.publishedAt,
    })),
    objectionRoutes: plan.objectionRoutes ?? [],
    valueMath: plan.valueMath ?? [],
    hypotheses: plan.hypotheses.slice(0, 3),
  };
}
