import type { CopilotPlan, DiscoveryKey, LiveReading, PaceQuestion } from '@/lib/copiloto/types';
import { genericLiveQuestions } from '@/lib/copiloto/live-support';

const PHASE_ORDER = ['preparar', 'analisar', 'cocriar', 'engajar'] as const;

function normalize(value: string): string {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim();
}

function alreadyAsked(question: PaceQuestion, sellerUtterances: string[]): boolean {
  const target = new Set(normalize(question.text).split(' ').filter((word) => word.length > 4));
  if (!target.size) return false;
  return sellerUtterances.some((utterance) => {
    const spoken = new Set(normalize(utterance).split(' ').filter((word) => word.length > 4));
    let common = 0;
    for (const word of target) if (spoken.has(word)) common += 1;
    return common / target.size >= 0.6;
  });
}

function score(question: PaceQuestion, reading: LiveReading): number {
  const distance = PHASE_ORDER.indexOf(question.phase) - PHASE_ORDER.indexOf(reading.phase);
  if (distance > 1) return -1;
  let points = distance === 0 ? 10 : distance === 1 ? 2 : 1;
  const pendingIndex = reading.pending.findIndex((item) => item.key === question.discovery);
  if (pendingIndex >= 0) points += 8 - Math.min(pendingIndex, 6);
  if (reading.signal === 'sinal_de_compra' && question.phase === 'engajar') points += 12;
  if (reading.signal === 'objecao' && question.phase === 'cocriar') points += 6;
  return points;
}

export function selectImmediateQuestions(
  plan: CopilotPlan | null,
  reading: LiveReading,
  sellerUtterances: string[],
): Array<{ text: string; why: string }> {
  const usedDiscoveries = new Set<DiscoveryKey>();
  const selected = (plan?.questions || [])
    .filter((question) => !alreadyAsked(question, sellerUtterances))
    .map((question) => ({ question, points: score(question, reading) }))
    .filter((item) => item.points >= 0)
    .sort((a, b) => b.points - a.points)
    .filter(({ question }) => {
      if (!question.discovery) return true;
      if (usedDiscoveries.has(question.discovery)) return false;
      usedDiscoveries.add(question.discovery);
      return true;
    })
    .slice(0, 3)
    .map(({ question }) => ({ text: question.text, why: question.why }));

  if (selected.length === 3) return selected;
  const usedTexts = new Set(selected.map((item) => normalize(item.text)));
  const generic = genericLiveQuestions(reading.pending, 3)
    .filter((item) => !usedTexts.has(normalize(item.text)))
    .slice(0, 3 - selected.length);
  return [...selected, ...generic];
}
