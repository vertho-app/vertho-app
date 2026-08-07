// Contrato do collector de Batch API (lib/ai-batch.ts) quanto ao LEDGER.
//
// Testa o REPASSE de `options` (taskKey/empresaId/source) do call-site até o
// `callAI`, com o SDK da Anthropic stubado. Nenhuma chamada de rede.
//
// Por que este arquivo existe — o guard que já havia (`ledger-taskkey-geradores`)
// lê o CALL-SITE por regex e passava verde, enquanto o wrapper descartava a
// etiqueta no meio do caminho: o tipo `AIRun` declarava 5 parâmetros e a
// implementação de `run` só desestruturava 4, e `syncFallback` chamava o
// `callAI` sem o 5º argumento. Resultado medido no `ia_usage_log`: as chamadas
// de `conteudo_gerar`/`kit_desafio` gravavam `feature='untagged'` sempre que o
// lote degradava para síncrono — ou seja, exatamente nos dias caros, que são os
// que a gente quer explicar. Guard que lê o emissor não prova o que o receptor
// faz; este lê o receptor.
//
// Invariantes (cada `it` abaixo prova uma):
//   1. Modelo não-Claude desvia p/ síncrono PRESERVANDO options.
//   2. Batch que falha cai no síncrono PRESERVANDO options.
//   3. O fallback síncrono se identifica no ledger como `source='batch-sync'`,
//      pra que lote degradado (preço cheio) não se confunda com síncrono por opção.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  chamadas: [] as Array<{ system: string; maxTokens: number; options: any }>,
}));

vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async (system: string, _user: string, _cfg: any, maxTokens: number, options?: any) => {
    mocks.chamadas.push({ system, maxTokens, options });
    return 'resposta-sincrona';
  }),
}));

// SDK stubado: `create` lança → doFlush cai no catch → syncFallback.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { batches: { create: async () => { throw new Error('batch indisponível (stub)'); } } };
  },
}));

import { createAIBatchCollector } from '@/lib/ai-batch';

const OPTS = { taskKey: 'kit_desafio', empresaId: 'emp-1', colaboradorId: 'colab-1' };

describe('ai-batch · repasse de options até o ledger', () => {
  beforeEach(() => { mocks.chamadas = []; });

  it('desvio p/ modelo não-Claude preserva o taskKey', async () => {
    const { run } = createAIBatchCollector('claude-sonnet-4-6');
    await run('SYS', 'USER', { model: 'gpt-5.6-luna' }, 1234, OPTS);

    expect(mocks.chamadas).toHaveLength(1);
    expect(mocks.chamadas[0].options?.taskKey).toBe('kit_desafio');
    expect(mocks.chamadas[0].options?.empresaId).toBe('emp-1');
  });

  it('batch que falha cai no síncrono preservando o taskKey', async () => {
    const { run } = createAIBatchCollector('claude-sonnet-4-6', { windowMs: 1 });
    const texto = await run('SYS', 'USER', { model: 'claude-sonnet-4-6' }, 4096, OPTS);

    expect(texto).toBe('resposta-sincrona');
    expect(mocks.chamadas).toHaveLength(1);
    expect(
      mocks.chamadas[0].options?.taskKey,
      'lote degradado gravaria untagged — o custo do dia caro fica sem dono',
    ).toBe('kit_desafio');
    expect(mocks.chamadas[0].options?.colaboradorId).toBe('colab-1');
  });

  it('o fallback síncrono se identifica como batch-sync no ledger', async () => {
    const { run } = createAIBatchCollector('claude-sonnet-4-6', { windowMs: 1 });
    await run('SYS', 'USER', { model: 'claude-sonnet-4-6' }, 4096, OPTS);

    expect(mocks.chamadas[0].options?.source).toBe('batch-sync');
  });
});
