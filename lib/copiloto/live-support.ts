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

export function knownReturnCoverage(plan: Partial<CopilotPlan> | null | undefined): DiscoveryKey[] {
  if (plan?.play?.kind !== 'retorno' || !Array.isArray(plan.gaps)) return [];
  const pending = new Set(plan.gaps.filter((key): key is DiscoveryKey =>
    DISCOVERY_CHECKLIST.some((item) => item.key === key)));
  return DISCOVERY_CHECKLIST.map((item) => item.key).filter((key) => !pending.has(key));
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
  const coveredSet = new Set([...covered, ...knownReturnCoverage(plan)]);
  const pending = DISCOVERY_CHECKLIST.filter((item) => !coveredSet.has(item.key));
  const currentIndex = PACE_PHASES.indexOf(currentPhase);
  const selected: Array<{ text: string; why: string }> = [];
  const usedDiscoveries = new Set<DiscoveryKey>();
  const usedTexts = new Set<string>();

  for (const item of Array.isArray(plan?.play?.mustAsk) ? plan.play.mustAsk : []) {
    if (item.discovery && coveredSet.has(item.discovery)) continue;
    const normalized = safeText(item.text, 180).toLocaleLowerCase('pt-BR');
    if (!normalized || usedTexts.has(normalized) || (item.discovery && usedDiscoveries.has(item.discovery))) continue;
    selected.push({ text: safeText(item.text, 180), why: `Play · ouça: ${safeText(item.green, 80)}` });
    usedTexts.add(normalized);
    if (item.discovery) usedDiscoveries.add(item.discovery);
    if (selected.length === 3) break;
  }

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
    .filter((question) => question.text && question.score > 0
      && (!question.discovery || !coveredSet.has(question.discovery)))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const candidate of candidates) {
    if (selected.length === 3) break;
    if (candidate.discovery && usedDiscoveries.has(candidate.discovery)) continue;
    if (usedTexts.has(candidate.text.toLocaleLowerCase('pt-BR'))) continue;
    selected.push({ text: candidate.text, why: candidate.why || 'Banco PACE preparado' });
    usedTexts.add(candidate.text.toLocaleLowerCase('pt-BR'));
    if (candidate.discovery) usedDiscoveries.add(candidate.discovery);
  }

  if (currentPhase === 'engajar' && selected.length < 3 && safeText(plan?.play?.closeWith, 700)) {
    selected.push({ text: safeText(plan?.play?.closeWith, 180), why: 'Fechamento preparado no Play' });
  }
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
    alert: plan?.play
      ? 'A leitura por IA não respondeu nesta atualização; mantendo as perguntas do Play local.'
      : 'A leitura por IA não respondeu nesta atualização; mantendo o banco PACE local.',
    focus: selected.length
      ? 'Continue ouvindo e use uma destas perguntas para aprofundar.'
      : 'Continue ouvindo e deixe o cliente desenvolver o raciocínio.',
    questions: selected,
  };
}
