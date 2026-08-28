import {
  DISCOVERY_CHECKLIST,
  PACE_PHASES,
  type CopilotPlan,
  type DiscoveryKey,
  type LiveReading,
  type PacePhase,
} from '@/lib/copiloto/types';

const GENERIC_QUESTION_TEXT: Record<DiscoveryKey, string> = {
  situacao_atual: 'Como esse processo funciona hoje, do início ao fim?',
  dor_principal: 'Qual parte disso mais incomoda ou limita o resultado?',
  impacto: 'Que impacto isso gera em tempo, custo ou desempenho?',
  tentativas: 'O que vocês já tentaram e o que aconteceu?',
  criterio: 'O que uma solução precisa entregar para fazer sentido?',
  decisor: 'Quem mais precisa participar dessa decisão?',
  orcamento: 'Existe uma faixa de investimento prevista para essa prioridade?',
  prazo: 'Em que prazo vocês gostariam de perceber uma mudança?',
};

function safeText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function genericLiveQuestions(
  pending: Array<{ key: DiscoveryKey; label: string }>,
  limit = 3,
): Array<{ text: string; why: string }> {
  return pending.slice(0, Math.max(0, limit)).map((item) => ({
    text: GENERIC_QUESTION_TEXT[item.key],
    why: item.label,
  }));
}

export function buildFallbackLiveReading(
  plan: Partial<CopilotPlan> | null | undefined,
  currentPhase: PacePhase,
  covered: DiscoveryKey[],
): LiveReading {
  const coveredSet = new Set(covered);
  const pending = DISCOVERY_CHECKLIST.filter((item) => !coveredSet.has(item.key));
  const currentIndex = PACE_PHASES.indexOf(currentPhase);
  const candidates = (Array.isArray(plan?.questions) ? plan.questions : [])
    .map((question, index) => {
      const phase = PACE_PHASES.includes(question?.phase as PacePhase) ? question.phase as PacePhase : currentPhase;
      const discovery = DISCOVERY_CHECKLIST.some((item) => item.key === question?.discovery)
        ? question.discovery as DiscoveryKey : null;
      const text = safeText(question?.text, 120);
      const why = safeText(question?.why, 100);
      const distance = PACE_PHASES.indexOf(phase) - currentIndex;
      const score = (distance === 0 ? 20 : distance === 1 ? 5 : distance < 0 ? 1 : 0)
        + (discovery && !coveredSet.has(discovery) ? 12 : 0);
      return { text, why, discovery, score, index };
    })
    .filter((question) => question.text && question.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const selected: Array<{ text: string; why: string }> = [];
  const usedDiscoveries = new Set<DiscoveryKey>();
  for (const candidate of candidates) {
    if (candidate.discovery && usedDiscoveries.has(candidate.discovery)) continue;
    selected.push({ text: candidate.text, why: candidate.why || 'Banco PACE preparado' });
    if (candidate.discovery) usedDiscoveries.add(candidate.discovery);
    if (selected.length === 3) break;
  }

  const usedTexts = new Set(selected.map((item) => item.text.toLocaleLowerCase('pt-BR')));
  for (const generic of genericLiveQuestions(pending, 3)) {
    if (selected.length === 3 || usedTexts.has(generic.text.toLocaleLowerCase('pt-BR'))) continue;
    selected.push(generic);
  }

  return {
    phase: currentPhase,
    covered: [...coveredSet],
    pending,
    signal: 'neutro',
    objection: null,
    alert: 'A leitura por IA não respondeu nesta atualização; mantendo o banco PACE local.',
    focus: selected.length
      ? 'Continue ouvindo e use uma destas perguntas para aprofundar.'
      : 'Continue ouvindo e deixe o cliente desenvolver o raciocínio.',
    questions: selected,
  };
}
