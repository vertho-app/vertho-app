/**
 * A-7 da revisão de 27/09/2026: orçamento do avaliador do atendimento.
 *
 * Tetos: 1ª tentativa `min(180 s, restante)`, 2ª com o que sobra de 270 s; a rota
 * tem 300 s e a lease, 330 s. Medido em produção: avaliações aceitas levam de 104
 * a 117 s. Dois defeitos:
 *  1. se a 1ª morria no teto, a 2ª recebia 90 s (o mínimo era 60 s): paga e quase
 *     certamente perdida, e a pessoa esperava 270 s para receber erro;
 *  2. `maxRetries: 0` do gerador valia só para o SDK. O `withAIRetry` do wrapper
 *     repetia 429/503/529 até 4 vezes com o teto cheio e depois trocava de
 *     provedor: um 529 tardio passava dos 300 s.
 * Relógio falso no núcleo; SDK falso no wrapper (nenhuma chamada real).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({ create: 0, erro: null as any }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => {
        sdk.create++;
        if (sdk.erro) throw sdk.erro;
        return { content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' };
      },
    };
  },
}));
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: vi.fn() }));
vi.mock('@/lib/supabase', async () => {
  const { criarSupabaseMock } = await import('../helpers/supabase-mock');
  const sb = criarSupabaseMock();
  return { createSupabaseAdmin: () => sb.client };
});

import { callAIChat } from '@/actions/ai-client';
import { encerrar, MINIMO_TENTATIVA_MS, ORCAMENTO_AVALIADOR_MS } from '@/lib/recepcao/core';
import { catalogoLimites } from '@/lib/recepcao/catalogo-limites';
import { aplicarMatrizAtendimento } from '@/lib/recepcao/matriz-avaliacao';
import { abrirSessao } from '@/lib/recepcao/core';

const ROTA_MS = 300_000;
function sessao() {
  const s = abrirSessao(aplicarMatrizAtendimento(structuredClone(catalogoLimites[0])), 0);
  s.historico.push({ id: 'm1', role: 'user', content: 'Olá' }, { id: 'm2', role: 'assistant', content: 'Oi' });
  s.respostas = 1;
  return s;
}
/** Gerador falso: a 1ª chamada gasta `primeira` ms, as seguintes gastam o teto inteiro. */
async function medir(primeira: (teto: number) => number, falhaDeFormato = false) {
  let agora = 0;
  const tetos: number[] = [];
  const gerar = vi.fn(async (a: any) => {
    tetos.push(a.timeoutMs);
    agora += tetos.length === 1 ? primeira(a.timeoutMs) : a.timeoutMs;
    if (falhaDeFormato && tetos.length === 1) return '{"dimensoes":[]}';
    throw new Error('AI chat call failed (claude-sonnet-4-6): Request was aborted.');
  });
  await expect(encerrar(sessao(), gerar as any, async () => {}, () => agora)).rejects.toThrow();
  return { tetos, total: agora };
}

describe('A-7: orçamento do avaliador no núcleo', () => {
  it('a 1ª morre no teto: não há 2ª tentativa (era de 90 s)', async () => {
    expect(MINIMO_TENTATIVA_MS).toBeGreaterThanOrEqual(120_000);
    const { tetos, total } = await medir((teto) => teto);
    expect(tetos).toEqual([180_000]);
    expect(total).toBeLessThanOrEqual(ROTA_MS);
  });

  it('a 1ª é recusada aos 110 s: a 2ª recebe 160 s e o total cabe na rota', async () => {
    const { tetos, total } = await medir(() => 110_000, true);
    expect(tetos).toEqual([180_000, 160_000]);
    expect(total).toBe(270_000);
  });

  it('para qualquer duração da 1ª: nenhuma 2ª abaixo de 120 s, nenhum total acima de 300 s', async () => {
    for (const gasto of [5_000, 30_000, 60_000, 100_000, 140_000, 150_000, 151_000, 160_000, 179_000, 180_000]) {
      const { tetos, total } = await medir(() => gasto);
      // 120 s literal, não a constante: a régua é a avaliação aceita mais lenta medida (117 s).
      if (tetos.length > 1) expect(tetos[1], `1ª gastou ${gasto}`).toBeGreaterThanOrEqual(120_000);
      expect(total, `1ª gastou ${gasto}`).toBeLessThanOrEqual(Math.min(ROTA_MS, ORCAMENTO_AVALIADOR_MS));
    }
  });
});

describe('A-7: o wrapper não repete o avaliador por conta própria', () => {
  const sobrecarga = () => Object.assign(new Error('overloaded_error: Overloaded'), { status: 529 });
  const chamar = (opcoes: Record<string, unknown>) =>
    callAIChat('Avalie.', [{ role: 'user', content: '[]' }], { model: 'claude-sonnet-4-6' }, 100, {
      locale: 'pt-BR',
      taskKey: 'recepcao_avaliacao',
      maxRetries: 0,
      ...opcoes,
    });
  let fetchs: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    sdk.create = 0;
    sdk.erro = sobrecarga();
    vi.stubEnv('ANTHROPIC_API_KEY', 'teste');
    vi.stubEnv('OPENAI_API_KEY', 'teste');
    fetchs = vi.fn(async () => { throw new Error('Rede não permitida neste teste'); });
    vi.stubGlobal('fetch', fetchs);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('com `semRetentativa`: um 529 sai na hora, sem repetir nem trocar de provedor', async () => {
    await expect(chamar({ semRetentativa: true })).rejects.toThrow(/overloaded/i);
    expect(sdk.create).toBe(1);
    expect(fetchs).not.toHaveBeenCalled();
  });

  it('sem a opção, os outros chamadores seguem com o retry e o fallback de sempre', async () => {
    vi.useFakeTimers();
    const resultado = chamar({}).catch((e) => e);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await resultado).toBeInstanceOf(Error);
    expect(sdk.create).toBe(5); // 1 + 4 retries do withAIRetry
    expect(fetchs).toHaveBeenCalled(); // fallback de provedor tentou sair
  });
});

describe('A-7: o gerador liga a opção só no avaliador', () => {
  it('avaliador com `semRetentativa`; a pessoa simulada sem', async () => {
    vi.resetModules();
    const chat = vi.fn(async () => { throw new Error('sem IA no teste'); });
    vi.doMock('@/actions/ai-client', () => ({ callAIChat: chat }));
    vi.doMock('@/lib/ai-tasks', () => ({ getModelForTask: async () => 'claude-sonnet-4-6' }));
    const { geradorRecepcao } = await import('@/lib/recepcao/gerador');
    const g = geradorRecepcao('empresa', null);
    const base = { system: 's', messages: [{ role: 'user' as const, content: 'x' }] };
    await expect(g.gerar({ ...base, etapa: 'avaliador', escala: 'n4', timeoutMs: 180_000 })).rejects.toThrow();
    await expect(g.gerar({ ...base, etapa: 'paciente' })).rejects.toThrow();
    const opcoes = chat.mock.calls.map((c: any[]) => c[4]);
    expect(opcoes[0]).toMatchObject({ taskKey: 'recepcao_avaliacao', semRetentativa: true, maxRetries: 0, timeoutMs: 180_000 });
    expect(opcoes[1]).toMatchObject({ taskKey: 'recepcao_paciente' });
    expect(opcoes[1].semRetentativa).toBeUndefined();
    vi.doUnmock('@/actions/ai-client');
    vi.doUnmock('@/lib/ai-tasks');
  });
});
