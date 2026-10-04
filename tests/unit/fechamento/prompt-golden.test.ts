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
 *
 * 🔴 ATUALIZADO em 04/10/2026 (R-37), de propósito: o golden do SCORER foi gerado
 * de novo porque o prompt mudou em três linhas, todas sobre o TEXTO que a pessoa
 * lê, nenhuma sobre como a nota é decidida. O `user` de cada caso e o golden do
 * auditor seguem byte a byte os de 92c7f0ae (conferido com um diff do JSON antigo
 * contra o novo: só o `system` dos 5 casos do scorer mudou, 1 linha trocada e 2
 * acrescentadas, iguais nos 5). Qualquer outra mudança no prompt do scorer volta
 * a quebrar este teste, que é o que ele existe para fazer.
 *
 * 🔴 ATUALIZADO de novo em 04/10/2026 (R-57): o golden do SCORER foi gerado outra
 * vez porque `regrasDaDevolutiva` ganhou UM parágrafo no fim, a regra de pontuação
 * ("não use travessão"). Conferido com um diff: em cada um dos 5 casos o `system`
 * novo é o antigo mais esse parágrafo, uma vez, e nada mais; o `user` e o golden do
 * auditor seguem byte a byte. A nota não depende dessa linha: ela fala só do texto
 * que a pessoa lê.
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

/**
 * O que mudou no prompt do scorer em 04/10/2026 (R-37), linha a linha. O princípio 3
 * dizia "Regressão é possível" e a devolutiva só tinha as proibições de falar em
 * "regressão" e em nota no piloto: a palavra e o número vazavam para o texto que a
 * pessoa lê. A semântica da NOTA não mudou ("a nota final pode ficar igual ou abaixo
 * da inicial" diz o mesmo que "regressão é possível").
 */
describe('R-37: o texto da pessoa tem as proibições do fecho em todos os modos', () => {
  it.each(CASOS_SCORER.map((c) => [c.nome, c] as const))('%s', (_nome, caso) => {
    const { system } = promptEvolutionScenarioScore(caso.params as any);
    expect(system).not.toContain('Regressão é possível');
    expect(system).toContain('3. A nota final pode ficar igual ou abaixo da nota inicial; não force evolução.');
    expect(system).toContain('PROIBIDO em qualquer texto que COLAB_A1B2 lê: "regressão", "regrediu", "queda", "caiu", "piora", "retrocesso"');
    expect(system).toContain('PROIBIDO escrever número de nota (como 2,3 ou 3.0), média, "X de 4", porcentagem ou "N1" a "N4"');
    // as proibições ficam no bloco da devolutiva, antes do fecho
    expect(system.indexOf('PROIBIDO em qualquer texto')).toBeGreaterThan(system.indexOf('DEVOLUTIVA (resumo_avaliacao):'));
    expect(system.indexOf('PROIBIDO em qualquer texto')).toBeLessThan(system.indexOf('FECHO (mensagem_final)'));
  });
});

/**
 * R-57: a devolutiva do scorer proíbe travessão, como a redação final já proibia. O
 * parágrafo mora em `regrasDaDevolutiva` (fonte única dos dois escritores) e não tem
 * o caractere que proíbe.
 */
describe('R-57: a regra de pontuação da devolutiva', () => {
  const REGRA = 'PONTUAÇÃO (devolutiva, fecho e próximos passos): não use travessão. Use vírgula, dois pontos ou ponto final.';

  it.each(CASOS_SCORER.map((c) => [c.nome, c] as const))('%s: o system do scorer leva a regra uma vez, no fim do bloco da devolutiva', (_nome, caso) => {
    const { system } = promptEvolutionScenarioScore(caso.params as any);
    expect(system.split(REGRA)).toHaveLength(2);
    expect(system.indexOf(REGRA)).toBeGreaterThan(system.indexOf('PRÓXIMOS PASSOS (proximos_passos):'));
  });

  it('a regra não traz o caractere que proíbe', () => {
    expect(REGRA).not.toMatch(/[\u2013\u2014\u2015]/);
  });
});
