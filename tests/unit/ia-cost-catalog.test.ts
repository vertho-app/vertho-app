import { describe, expect, it } from 'vitest';
import {
  MODELS,
  OPENAI_WEB_SEARCH_USD_PER_CALL,
  calcCost,
  costFromTokens,
  custoEstimadoPorTask,
  openAIWebSearchToolCost,
} from '@/lib/ia-cost-catalog';

describe('catálogo de preços de IA', () => {
  it('mantém os preços oficiais vigentes revisados em 10/09/2026', () => {
    expect(MODELS['gemini-3.6-flash']).toMatchObject({ inUsd: 0.75, outUsd: 3.75 });
    expect(MODELS['gpt-5.6-luna']).toMatchObject({ inUsd: 0.2, outUsd: 1.2 });
    expect(MODELS['gpt-5.6-sol']).toMatchObject({ inUsd: 4, outUsd: 20 });
    expect(MODELS['gpt-5.6-terra']).toMatchObject({ inUsd: 2, outUsd: 12 });
    expect(MODELS['gpt-5.5']).toMatchObject({ inUsd: 5, outUsd: 30 });
    expect(MODELS['gpt-5.4-mini']).toMatchObject({ inUsd: 0.75, outUsd: 4.5 });
    expect(MODELS['gpt-5.1']).toMatchObject({ inUsd: 1.25, outUsd: 10 });
    expect(MODELS['claude-opus-5']).toMatchObject({ inUsd: 5, outUsd: 25 });
    expect(MODELS['claude-sonnet-5']).toMatchObject({ inUsd: 2, outUsd: 10 });
    expect(MODELS['claude-sonnet-4-6']).toMatchObject({ inUsd: 3, outUsd: 15 });
    expect(MODELS['muse-spark-1.2']).toMatchObject({ inUsd: 1.25, cacheReadUsd: 0.15, outUsd: 4.25 });
    expect(MODELS['qwen3.8-max']).toMatchObject({ inUsd: 2, cacheReadUsd: 0.25, outUsd: 6 });
    expect(MODELS['kimi-k3']).toMatchObject({ inUsd: 3, cacheReadUsd: 0.30, outUsd: 15 });
    expect(MODELS['grok-4.6']).toMatchObject({ inUsd: 2, cacheReadUsd: 0.50, outUsd: 6 });
    expect(MODELS['voyage-3-large']).toMatchObject({ inUsd: 0.18, outUsd: 0 });
  });

  it('usa preço de cache por provedor e a faixa longa do Grok', () => {
    expect(costFromTokens('muse-spark-1.2', {
      inTokens: 1_000_000,
      cacheRead: 1_000_000,
      outTokens: 1_000_000,
    })).toBeCloseTo(1.25 + 0.15 + 4.25, 10);

    expect(costFromTokens('qwen3.8-max', {
      inTokens: 0,
      cacheRead: 1_000_000,
      outTokens: 0,
    })).toBeCloseTo(0.25, 10);

    expect(costFromTokens('grok-4.6', {
      inTokens: 199_999,
      cacheRead: 0,
      outTokens: 10_000,
    })).toBeCloseTo((199_999 * 2 + 10_000 * 6) / 1_000_000, 10);

    expect(costFromTokens('grok-4.6', {
      inTokens: 150_000,
      cacheRead: 50_000,
      outTokens: 10_000,
    })).toBeCloseTo((150_000 * 4 + 50_000 * 1 + 10_000 * 12) / 1_000_000, 10);
  });

  it('cobra somente as buscas web realmente executadas', () => {
    expect(OPENAI_WEB_SEARCH_USD_PER_CALL).toBe(0.01);
    expect(openAIWebSearchToolCost(null)).toBe(0);
    expect(openAIWebSearchToolCost([
      { type: 'message' },
      { type: 'web_search_call' },
      { type: 'web_search_call' },
    ])).toBe(0.02);

    const pesquisa = custoEstimadoPorTask('copiloto_pesquisa_empresa', 'gpt-5.5');
    expect(pesquisa).not.toBeNull();
    expect(pesquisa).toBeGreaterThan(OPENAI_WEB_SEARCH_USD_PER_CALL);
  });

  it('inclui cache observado no custo estimado e no volume de tokens', () => {
    const call = {
      inTokens: 1_000,
      outTokens: 2_000,
      cacheReadTokens: 300,
      cacheWriteTokens: 400,
      exec: 2,
    };
    const custo = calcCost(call, 'claude-sonnet-5', 1);

    expect(custo).not.toBeNull();
    expect(custo?.inTokens).toBe(3_400);
    expect(custo?.outTokens).toBe(4_000);
    expect(custo?.usd).toBeCloseTo(
      ((2_000 * 2) + (4_000 * 10) + (600 * 2 * 0.1) + (800 * 2 * 1.25)) / 1_000_000,
      10,
    );
  });
});
