/**
 * Golden dos prompts do fechamento (18/09/2026).
 *
 * A redação final passou a reescrever o texto da pessoa quando o código muda a
 * nota depois dele. Para isso, as regras da devolutiva saíram do prompt do
 * scorer para `regrasDaDevolutiva`, e o auditor ganhou uma seção sobre o ajuste
 * da arguição. Este teste prova as duas coisas que NÃO podem mudar:
 *
 *   · o prompt do scorer (o que decide a nota) é byte a byte o de antes;
 *   · o prompt do auditor, quando NÃO houve arguição, é byte a byte o de antes.
 *
 * O JSON foi gerado com o código de `92c7f0ae`, antes da mudança.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/ai-client', () => ({ callAI: vi.fn() }));

import golden from './golden-prompts-fechamento.json';
import { CASOS_SCORER, CASOS_CHECK } from './fixtures-golden-fechamento';
import { promptEvolutionScenarioScore } from '@/lib/season-engine/prompts/evolution-scenario';
import { promptEvolutionScenarioCheck } from '@/lib/season-engine/prompts/evolution-scenario-check';

describe('golden do scorer do fechamento', () => {
  it.each(CASOS_SCORER.map((c) => [c.nome, c] as const))('%s: system e user idênticos', (_nome, caso) => {
    const atual = promptEvolutionScenarioScore(caso.params as any);
    const esperado = (golden.scorer as Record<string, { system: string; user: string }>)[caso.nome];
    expect(esperado, `caso ${caso.nome} fora do golden`).toBeDefined();
    expect(atual.system).toBe(esperado.system);
    expect(atual.user).toBe(esperado.user);
  });
});

describe('golden do auditor do fechamento sem arguição', () => {
  it.each(CASOS_CHECK.map((c) => [c.nome, c] as const))('%s: system e user idênticos', (_nome, caso) => {
    const atual = promptEvolutionScenarioCheck(caso.params as any);
    const esperado = (golden.check as Record<string, { system: string; user: string }>)[caso.nome];
    expect(esperado, `caso ${caso.nome} fora do golden`).toBeDefined();
    expect(atual.system).toBe(esperado.system);
    expect(atual.user).toBe(esperado.user);
  });
});
