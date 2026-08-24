// C7 (auditoria 22/08) — a etiqueta do ledger no caminho de SUCESSO.
//
// 🔴 Por que este arquivo existe além do `ai-batch-taskkey`: aquele stuba o SDK
// para LANÇAR, então os três casos dele provam só o fallback síncrono. O caminho
// que efetivamente roda — o batch que dá certo, que é o default e o barato —
// nunca foi exercitado, e era justamente onde a etiqueta se perdia.
//
// `Medido antes do fix:` 232 chamadas / US$ 5,65 gravadas com `feature='batch'`,
// e 6 das 8 linhas de `ia_batches` com `feature`/`empresa_id` nulos.
//
// 🔑 E `'batch'` é PIOR que `untagged`: parece etiqueta, então não entra na
// métrica de untagged — a lacuna se esconde dentro do número que está verde.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  /** Linhas que o ledger recebeu (`ia_usage_log`). */
  ledger: [] as any[],
  /** Linhas de rastro (`ia_batches`). */
  batches: [] as any[],
  /** Opções passadas ao `create` do batch. */
  criados: [] as any[],
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: (tabela: string) => ({
      insert: async (linhas: any) => {
        const arr = Array.isArray(linhas) ? linhas : [linhas];
        if (tabela === 'ia_usage_log') mocks.ledger.push(...arr);
        if (tabela === 'ia_batches') mocks.batches.push(...arr);
        return { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

vi.mock('@/actions/ai-client', () => ({
  callAI: vi.fn(async () => 'resposta-sincrona'),
}));

/** SDK que SUCEDE: cria, termina e devolve um resultado com usage. */
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      batches: {
        create: async (params: any) => { mocks.criados.push(params); return { id: 'msgbatch_teste' }; },
        retrieve: async () => ({
          processing_status: 'ended',
          request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
        }),
        results: async function* () {
          // Ecoa o custom_id REALMENTE submetido: o collector gera o dele
          // próprio, e um id fixo faria o resultado não casar — caindo no
          // fallback síncrono e medindo o caminho errado.
          const ultimo = mocks.criados[mocks.criados.length - 1];
          const customId = ultimo?.requests?.[0]?.custom_id ?? 'req-0';
          yield {
            custom_id: customId,
            result: {
              type: 'succeeded',
              message: {
                model: 'claude-sonnet-4-6',
                content: [{ type: 'text', text: 'saida-do-lote' }],
                usage: { input_tokens: 100, output_tokens: 50 },
              },
            },
          };
        },
      },
    };
  },
}));

import { createAIBatchCollector, submitClaudeBatch } from '@/lib/ai-batch';

beforeEach(() => { mocks.ledger = []; mocks.batches = []; mocks.criados = []; });

describe('C7 · o batch que SUCEDE leva a etiqueta do call-site', () => {
  it('🔴 submitClaudeBatch com ledger grava a feature do call-site, não "batch"', async () => {
    const out = await submitClaudeBatch(
      [{ customId: 'req-0', system: 'S', user: 'U', model: 'claude-sonnet-4-6', maxTokens: 4096 }],
      { pollMs: 1, ledger: { feature: 'blueprint_gerar', empresaId: 'emp-1' } },
    );

    expect(out.get('req-0')).toBe('saida-do-lote');
    expect(mocks.ledger).toHaveLength(1);
    expect(mocks.ledger[0].feature).toBe('blueprint_gerar');
    expect(mocks.ledger[0].empresa_id).toBe('emp-1');
    expect(mocks.ledger[0].source).toBe('batch');
  });

  it('o rastro em ia_batches nasce COM etiqueta (6 das 8 linhas históricas tinham null)', async () => {
    await submitClaudeBatch(
      [{ customId: 'req-0', system: 'S', user: 'U', model: 'claude-sonnet-4-6', maxTokens: 4096 }],
      { pollMs: 1, ledger: { feature: 'ia2_gabarito', empresaId: 'emp-2' } },
    );

    expect(mocks.batches).toHaveLength(1);
    expect(mocks.batches[0].feature).toBe('ia2_gabarito');
    expect(mocks.batches[0].empresa_id).toBe('emp-2');
  });

  it('sem ledger, o default continua sendo "batch" — é o estado que o C7 corrigiu nos call-sites', async () => {
    await submitClaudeBatch(
      [{ customId: 'req-0', system: 'S', user: 'U', model: 'claude-sonnet-4-6', maxTokens: 4096 }],
      { pollMs: 1 },
    );
    // O default do MÓDULO segue 'batch' de propósito: quem tem de saber a fase é
    // o call-site. O guard (`ledger-taskkey-geradores`) é que exige o repasse.
    expect(mocks.ledger[0].feature).toBe('batch');
  });

  it('o collector repassa o ledger para o caminho de lote', async () => {
    const { run } = createAIBatchCollector('claude-sonnet-4-6', {
      windowMs: 1,
      ledger: { feature: 'kit_semanal', empresaId: 'emp-3' },
    });
    const texto = await run('SYS', 'USER', { model: 'claude-sonnet-4-6' }, 4096, { taskKey: 'kit_desafio' });

    expect(texto).toBe('saida-do-lote');
    expect(mocks.ledger[0].feature, 'o collector engolia a etiqueta e gravava "batch"').toBe('kit_semanal');
  });
});
