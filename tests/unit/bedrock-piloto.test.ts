import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ eval: vi.fn(), fetch: vi.fn(), ledger: [] as any[] }));
vi.mock('@upstash/redis', () => ({ Redis: class { eval = mocks.eval; } }));
vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => ({ from: () => ({ insert: async (row: any) => { mocks.ledger.push(row); return {}; } }) }) }));
import { callAI, callAIChat } from '@/actions/ai-client';
import { BEDROCK_KIMI_K3_MODEL, modeloTemRota } from '@/lib/ai-provedores';
import { familiaDoModelo, modeloPermitidoNaTarefa } from '@/lib/ai-tasks';
import { BEDROCK_PILOTO_CONTADOR, modeloDoPilotoBedrock } from '@/lib/bedrock-piloto';

describe('piloto editorial do Bedrock', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'bedrock-teste');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-teste');
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 20 } } }) });
    mocks.eval.mockReset().mockResolvedValue(1);
    mocks.ledger = [];
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('liga apenas com credencial e respeita a régua de privacidade existente', () => {
    expect(modeloDoPilotoBedrock()).toBe(BEDROCK_KIMI_K3_MODEL);
    expect(modeloTemRota(BEDROCK_KIMI_K3_MODEL)).toBe(true);
    expect(familiaDoModelo(BEDROCK_KIMI_K3_MODEL)).toBe('moonshot');
    expect(modeloPermitidoNaTarefa(BEDROCK_KIMI_K3_MODEL, 'conteudo_tags')).toBe(true);
    expect(modeloPermitidoNaTarefa(BEDROCK_KIMI_K3_MODEL, 'ia4_avaliacao')).toBe(false);
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', '');
    expect(modeloDoPilotoBedrock()).toBeNull();
  });

  it.each(['single', 'chat'])('%s: reserva antes de enviar, usa AWS e registra custo separado', async (tipo) => {
    mocks.fetch.mockImplementation(async () => {
      expect(mocks.eval).toHaveBeenCalledTimes(1);
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 20 } } }) };
    });
    const options = { taskKey: 'conteudo_tags', locale: 'pt-BR' as const, reasoningEffort: 'high' as const };
    if (tipo === 'single') await callAI('SYS', 'USER', { model: BEDROCK_KIMI_K3_MODEL }, 6000, options);
    else await callAIChat('SYS', [{ role: 'user', content: 'USER' }], { model: BEDROCK_KIMI_K3_MODEL }, 6000, options);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toBe('https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer bedrock-teste');
    expect(JSON.parse(init.body)).toMatchObject({ model: BEDROCK_KIMI_K3_MODEL, max_completion_tokens: 6000, reasoning_effort: 'low' });
    expect(mocks.eval.mock.calls[0].slice(1)).toEqual([[BEDROCK_PILOTO_CONTADOR], [50]]);
    expect(mocks.ledger[0]).toMatchObject({ provider: 'bedrock', feature: 'conteudo_tags', input_tokens: 80, output_tokens: 50, cache_read_tokens: 20 });
    expect(mocks.ledger[0].cost_usd).toBeCloseTo(0.000996);
  });

  it.each(['orcamento', 'redis', 'sem-redis', 'entrada', 'saida', 'tarefa'])('%s: bloqueia antes de enviar', async (motivo) => {
    if (motivo === 'orcamento') mocks.eval.mockResolvedValue(0);
    if (motivo === 'redis') mocks.eval.mockRejectedValue(new Error('indisponível'));
    if (motivo === 'sem-redis') vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    await expect(callAI('SYS', motivo === 'entrada' ? 'á'.repeat(25000) : 'USER', { model: BEDROCK_KIMI_K3_MODEL }, motivo === 'saida' ? 6001 : 6000, {
      taskKey: motivo === 'tarefa' ? 'conteudo_expansao_pdf' : 'conteudo_tags', locale: 'pt-BR',
    })).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('erro 503 não repete nem troca para outra conta', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, text: async () => 'indisponível' });
    await expect(callAI('SYS', 'USER', { model: BEDROCK_KIMI_K3_MODEL }, 6000, { taskKey: 'conteudo_tags', locale: 'pt-BR' })).rejects.toThrow('503');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.eval).toHaveBeenCalledTimes(1);
  });
});
