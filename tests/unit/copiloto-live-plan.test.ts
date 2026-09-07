import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { buildLivePlan, LIVE_PLAN_KEYS } from '@/lib/copiloto/live-plan';
import type { CopilotPlan } from '@/lib/copiloto/types';

const plano = {
  companyIdentified: 'Grupo Sinal', companySummary: '', valueSummary: '',
  facts: [
    { title: 'F1', fact: 'fato um', relevance: 'por que importa um', sourceUrl: null, publishedAt: '2026-03' },
    { title: 'F2', fact: 'fato dois', relevance: 'por que importa dois', sourceUrl: null, publishedAt: null },
    { title: 'F3', fact: 'fato três', relevance: '', sourceUrl: null, publishedAt: null },
    { title: 'F4', fact: 'fato quatro', relevance: 'não chega', sourceUrl: null, publishedAt: null },
  ],
  trends: [], hypotheses: [
    { hypothesis: 'H1', basis: '', howToTest: 't1' },
    { hypothesis: 'H2', basis: '', howToTest: 't2' },
    { hypothesis: 'H3', basis: '', howToTest: 't3' },
    { hypothesis: 'H4', basis: '', howToTest: 't4' },
  ],
  objectives: { primary: '', fallback: '' }, roiMetrics: [], strategicQuestions: [],
  questions: [{ phase: 'analisar', discovery: 'impacto', text: 'q', why: 'w' }],
  objections: [{ objection: 'o', question: 'q' }],
  risks: [], gaps: ['criterio'],
  objectionRoutes: [{ symptom: 's', seat: 'RH', cause: '', acknowledge: '', explore: 'e', evidence: '', alternative: '', advance: '' }],
  valueMath: [{ name: 'n', formula: 'f', known: [], open: [] }],
  sources: [], researchedAt: '2026-09-07',
} as unknown as CopilotPlan;

describe('buildLivePlan: o que a tela manda ao apoio ao vivo', () => {
  it('leva rotas de objeção, aritmética e hipóteses, que ficaram para trás de 02/09 a 07/09', () => {
    const payload = buildLivePlan(plano)!;
    expect(payload.objectionRoutes).toHaveLength(1);
    expect(payload.valueMath).toHaveLength(1);
    expect(payload.hypotheses.map((h) => h.hypothesis)).toEqual(['H1', 'H2', 'H3']);
  });

  it('cada fato vai com a implicação, que é o que vira frase falável', () => {
    const payload = buildLivePlan(plano)!;
    expect(payload.facts).toHaveLength(3);
    expect(payload.facts[0]).toEqual({ title: 'F1', fact: 'fato um', relevance: 'por que importa um', publishedAt: '2026-03' });
  });

  it('plano legado sem os blocos novos não quebra o envio', () => {
    const legado = { ...plano, objectionRoutes: undefined, valueMath: undefined } as CopilotPlan;
    const payload = buildLivePlan(legado)!;
    expect(payload.objectionRoutes).toEqual([]);
    expect(payload.valueMath).toEqual([]);
  });

  it('sem plano, sem payload', () => {
    expect(buildLivePlan(null)).toBeNull();
  });

  /**
   * O contrato tem dois lados e este teste segura os dois: toda chave que a rota
   * lê do `plan` precisa estar no que a tela envia. É a asserção que faltava em
   * 02/09, quando o teste da rota montava o plano à mão e provava só que o
   * servidor sabia usar o campo.
   */
  it('toda chave que a rota ao vivo lê do plano está no payload', () => {
    const rota = readFileSync('app/api/copiloto/live/route.ts', 'utf-8');
    const lidas = [...rota.matchAll(/plan\??\.([a-zA-Z]+)/g)].map((m) => m[1]);
    const unicas = [...new Set(lidas)].filter((k) => k !== 'play');
    expect(unicas.length).toBeGreaterThan(3);
    for (const chave of unicas) {
      expect(LIVE_PLAN_KEYS, `a rota lê plan.${chave} e a tela não envia`).toContain(chave);
    }
    // E a tela usa o módulo, não um objeto montado à mão.
    const tela = readFileSync('app/copiloto/copilot-client.tsx', 'utf-8');
    expect(tela).toContain('buildLivePlan(planRef.current)');
  });
});
