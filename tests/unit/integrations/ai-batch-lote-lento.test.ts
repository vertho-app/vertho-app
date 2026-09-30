// Lote lento e rede instável não podem fazer pagar o mesmo item duas vezes.
//
// `Medido em 30/09/2026` (roteiro do vídeo em lote, 2 itens): o computador
// suspendeu no meio da espera, a 1ª consulta depois de acordar falhou por DNS, e o
// collector abandonou o lote. Os 2 roteiros saíram pelo síncrono (US$ 0,23 + 0,29)
// e o lote seguia na Anthropic, para ser cobrado também. E, independente disso, a
// fila de lotes estava lenta: 78-128 min, contra o máximo de 12 min da amostra
// de setembro. Com um orçamento de 20 min, o lote estouraria de qualquer jeito.
//
// Duas travas, cada uma com o seu caso aqui:
//   1. consulta que falha é repetida por até `toleranciaFalhaMs` antes de desistir;
//   2. com `cancelarNoTimeout` (o collector), o lote que estoura o orçamento é
//      CANCELADO, o que já saiu é aproveitado, e só o resto vai ao síncrono.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  ledger: [] as any[],
  fechos: [] as any[],
  criados: [] as any[],
  /** Roteiro das consultas: cada item é um status ou um Error a lançar; o último se repete. */
  consultas: [] as Array<string | Error>,
  cancelados: 0,
  /** custom_ids que o lote devolve como `succeeded` (default: todos). */
  prontos: null as string[] | null,
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: (tabela: string) => ({
      insert: async (linhas: any) => {
        const arr = Array.isArray(linhas) ? linhas : [linhas];
        if (tabela === 'ia_usage_log') mocks.ledger.push(...arr);
        return { error: null };
      },
      update: (patch: any) => ({ eq: async () => { if (tabela === 'ia_batches') mocks.fechos.push(patch); return { error: null }; } }),
    }),
  }),
}));

const callAI = vi.fn(async (..._a: any[]) => 'resposta-sincrona');
vi.mock('@/actions/ai-client', () => ({ callAI: (...a: any[]) => (callAI as any)(...a) }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      batches: {
        create: async (params: any) => { mocks.criados.push(params); return { id: 'msgbatch_lento' }; },
        retrieve: async () => {
          // Depois do cancelamento, o batch encerra (é o que a Anthropic faz em segundos).
          const proximo = mocks.cancelados > 0 ? 'ended' : (mocks.consultas.length > 1 ? mocks.consultas.shift()! : mocks.consultas[0]);
          if (proximo instanceof Error) throw proximo;
          return { processing_status: proximo, request_counts: {} };
        },
        cancel: async () => { mocks.cancelados++; return { processing_status: 'canceling' }; },
        results: async function* () {
          const ids: string[] = (mocks.criados.at(-1)?.requests || []).map((r: any) => r.custom_id);
          for (const id of ids) {
            if (mocks.prontos && !mocks.prontos.includes(id)) continue;
            yield { custom_id: id, result: { type: 'succeeded', message: { model: 'claude-opus-5', content: [{ type: 'text', text: `lote:${id}` }], usage: { input_tokens: 10, output_tokens: 5 } } } };
          }
        },
      },
    };
  },
}));

import { createAIBatchCollector, submitClaudeBatch } from '@/lib/ai-batch';

const REQ = (id: string) => ({ customId: id, system: 'S', user: 'U', model: 'claude-opus-5', maxTokens: 100 });
const erroDns = () => Object.assign(new Error('Connection error.'), { cause: { code: 'ENOTFOUND' } });

beforeEach(() => {
  mocks.ledger = []; mocks.fechos = []; mocks.criados = [];
  mocks.consultas = []; mocks.cancelados = 0; mocks.prontos = null;
  callAI.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('consulta que falha', () => {
  it('é repetida: o computador acorda, a rede volta e o lote é colhido (nada síncrono)', async () => {
    mocks.consultas = [erroDns(), erroDns(), 'ended'];
    const out = await submitClaudeBatch([REQ('a')], { pollMs: 1, toleranciaFalhaMs: 1000 });
    expect(out.get('a')).toBe('lote:a');
    expect(mocks.fechos.at(-1).status).toBe('concluido');
  });

  it('falhas seguidas além da tolerância: desiste (e o collector cai no síncrono)', async () => {
    mocks.consultas = [erroDns()];
    await expect(submitClaudeBatch([REQ('a')], { pollMs: 1, toleranciaFalhaMs: 20 })).rejects.toThrow(/Connection error/);
  });
});

describe('lote que estoura o orçamento', () => {
  it('com cancelarNoTimeout: cancela, aproveita o que já saiu e fecha o rastro como erro', async () => {
    mocks.consultas = ['in_progress'];
    mocks.prontos = ['a'];
    const out = await submitClaudeBatch([REQ('a'), REQ('b')], { pollMs: 1, budgetMs: 5, cancelarNoTimeout: true });

    expect(mocks.cancelados).toBe(1);
    expect([...out.keys()]).toEqual(['a']);
    const fecho = mocks.fechos.at(-1);
    expect(fecho.status).toBe('erro');
    expect(fecho.erro).toMatch(/cancelado ao estourar o orçamento.*1 item/);
    // O que saiu do lote entra no ledger a preço de lote.
    expect(mocks.ledger.map((l) => l.source)).toEqual(['batch']);
  });

  it('sem a opção, lança como sempre e NÃO cancela (o rastro fica recuperável)', async () => {
    mocks.consultas = ['in_progress'];
    await expect(submitClaudeBatch([REQ('a')], { pollMs: 1, budgetMs: 5 })).rejects.toThrow(/excedeu/);
    expect(mocks.cancelados).toBe(0);
  });

  it('collector: o item pronto vem do lote e SÓ o que faltou vai ao síncrono', async () => {
    mocks.consultas = ['in_progress'];
    mocks.prontos = ['r0'];
    const { run } = createAIBatchCollector('claude-opus-5', { windowMs: 1, budgetMs: 5, pollMs: 1, ledger: { feature: 'conteudo_video', empresaId: 'emp-1' } });
    const [a, b] = await Promise.all([
      run('S', 'U1', { model: 'claude-opus-5' }, 100, { taskKey: 'conteudo_video', empresaId: 'emp-1' }),
      run('S', 'U2', { model: 'claude-opus-5' }, 100, { taskKey: 'conteudo_video', empresaId: 'emp-1' }),
    ]);

    expect(mocks.cancelados).toBe(1);
    expect(a).toBe('lote:r0');
    expect(b).toBe('resposta-sincrona');
    expect(callAI).toHaveBeenCalledTimes(1);
    expect((callAI.mock.calls[0] as any[])[4].source).toBe('batch-sync');
  });
});
