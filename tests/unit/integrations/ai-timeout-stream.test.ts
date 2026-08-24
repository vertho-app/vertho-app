import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C1 da auditoria 22/08 — o timeout de IA não valia no ramo de STREAMING.
 *
 * `new Anthropic({ timeout })` limita o FETCH. E o fetch de um stream resolve
 * quando chegam os HEADERS: o corpo é consumido depois, num `for await`, sem
 * relógio nenhum. O ramo `maxTokens > 8192` é justamente o das gerações caras —
 * blueprint, módulo-base, IA4 —, então o único caminho sem deadline era o que
 * mais precisava de um.
 *
 * 🔑 O dado que fecha o argumento (`Medido em 24/08`, 30 dias de `ia_usage_log`):
 * três features têm p95 ACIMA do teto nominal de 120 s — `modulo_base_autor`
 * 227 s, `blueprint_gerar` 164 s (máx 277 s), `ia4_avaliacao` 156 s — e
 * registram 100% de sucesso. Se o relógio estivesse valendo, elas teriam
 * falhado. E o p95 é de SOBREVIVENTES: a tabela tem 3632 linhas 'ok' e nenhuma
 * de erro, porque a chamada que morre não chega a registrar.
 *
 * Aqui o stream PENDURA de propósito, e o teste exige que o abort chegue nele.
 */

/** O que o SDK recebeu em `messages.stream(params, opts)`. */
let recebido: { params: any; opts: any } | null = null;
/** Resolve quando o consumo do stream é interrompido. */
let abortou = false;

class StreamPendurado {
  constructor(private signal?: AbortSignal) {}
  async *[Symbol.asyncIterator]() {
    yield { type: 'message_start', message: { usage: { input_tokens: 10 } } };
    // Pendura: só sai quando o signal aborta — é o corpo do stream chegando
    // devagar, que é o caso real (a resposta longa vem em pedaços).
    await new Promise<void>((resolve, reject) => {
      if (!this.signal) return; // sem signal, pendura para SEMPRE (é o bug)
      this.signal.addEventListener('abort', () => {
        abortou = true;
        reject(new Error('Request was aborted.'));
      });
    });
  }
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      stream: (params: any, opts: any) => {
        recebido = { params, opts };
        return new StreamPendurado(opts?.signal);
      },
      create: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: {} }),
    };
  },
}));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }) }));
vi.mock('@/lib/ai-ledger', () => ({ registrarUsoIA: vi.fn() }));

beforeEach(() => { recebido = null; abortou = false; });

describe('C1 — o ramo de streaming tem deadline de verdade', () => {
  it('🔴 o AbortSignal é PASSADO ao messages.stream, não só armado', async () => {
    const { callAI } = await import('@/actions/ai-client');
    // 9000 > 8192 → cai no ramo de stream. Timeout curto para o teste não esperar.
    const p = callAI('sys', 'user', { model: 'claude-sonnet-4-6' } as any, 9000, { timeoutMs: 50 } as any)
      .catch((e: any) => e);
    const r = await p;

    expect(recebido, 'messages.stream não foi chamado — o teste não exercitou o ramo de stream').toBeTruthy();
    expect(recebido!.opts?.signal, 'stream chamado SEM signal: o deadline não alcança o corpo').toBeTruthy();
    expect(abortou, 'o signal não abortou o consumo do stream').toBe(true);
    expect(String(r)).toMatch(/abort/i);
  });

  it('o relógio não fica pendurado quando o stream termina normalmente', async () => {
    // Se o `clearTimeout` não rodasse no `finally`, o processo do vitest seguraria
    // um timer por chamada — e em lote isso é um vazamento por resposta gerada.
    const antes = process.getActiveResourcesInfo?.().filter((r) => r === 'Timeout').length ?? 0;
    const { callAI } = await import('@/actions/ai-client');
    await callAI('sys', 'user', { model: 'claude-sonnet-4-6' } as any, 1000, {} as any).catch(() => null);
    const depois = process.getActiveResourcesInfo?.().filter((r) => r === 'Timeout').length ?? 0;
    expect(depois).toBeLessThanOrEqual(antes + 1);
  });
});
