import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  stream: vi.fn(),
  ledger: vi.fn(async (..._args: any[]) => true),
  reserve: vi.fn(async (..._args: any[]) => 1),
}));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mocks.create, stream: mocks.stream };
  },
}));
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: mocks.ledger }));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    eval = mocks.reserve;
  },
}));
import { callAI, callAIChat } from '@/actions/ai-client';
vi.mock('@/lib/degradacao', () => ({
  DEGRADACAO: { MODELO_NAO_DECLARADO: 'modelo_nao_declarado' },
  registrarDegradacao: vi.fn(),
}));
import { schemaEstruturadoClaude } from '@/lib/ai-structured-output';
import {
  BEDROCK_CANARIO_CONTADOR,
  BEDROCK_PILOTO_CONTADOR,
} from '@/lib/bedrock-piloto';

const schema = {
  type: 'object',
  properties: { fala: { type: 'string', minLength: 1 } },
  required: ['fala'],
  additionalProperties: false,
};
const options = {
  taskKey: 'sim_vendas_cliente',
  locale: 'pt-BR' as const,
  structuredOutput: { name: 'pace_cliente', schema },
  reasoningEffort: 'low' as const,
};
const gemini = (finishReason = 'STOP') => ({
  candidates: [
    { finishReason, content: { parts: [{ text: '{"fala":"Olá"}' }] } },
  ],
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 20,
    thoughtsTokenCount: 5,
  },
});
const aws = (finish_reason = 'stop') => ({
  choices: [{ finish_reason, message: { content: '{"fala":"Olá"}' } }],
  usage: {
    prompt_tokens: 100,
    completion_tokens: 20,
    prompt_tokens_details: { cached_tokens: 30, cache_write_tokens: 50 },
  },
});

describe('JSON nativo no wrapper de IA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const name of [
      'GEMINI_API_KEY',
      'ANTHROPIC_API_KEY',
      'AWS_BEARER_TOKEN_BEDROCK',
      'UPSTASH_REDIS_REST_TOKEN',
    ])
      vi.stubEnv(name, 'chave-ficticia');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
    mocks.create.mockResolvedValue({
      content: [{ type: 'text', text: '{"fala":"Olá"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it.each(['single', 'chat'])(
    'Gemini %s mantém prompt e schema sem alterar o caminho legado',
    async (kind) => {
      const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
        Response.json(gemini()),
      );
      vi.stubGlobal('fetch', fetch);
      if (kind === 'single')
        await callAI(
          'REGRAS CONGELADAS',
          'DADOS',
          { model: 'gemini-3.8-flash' },
          2500,
          options,
        );
      else
        await callAIChat(
          'REGRAS CONGELADAS',
          [{ role: 'user', content: 'DADOS' }],
          { model: 'gemini-3.8-flash' },
          2500,
          options,
        );
      const body = JSON.parse(String(fetch.mock.calls[0][1].body));
      expect(body.systemInstruction.parts[0].text).toBe('REGRAS CONGELADAS');
      expect(body.generationConfig.responseJsonSchema).toEqual(schema);
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.generationConfig).not.toHaveProperty('responseSchema');
      expect(mocks.ledger.mock.calls[0][0]).toMatchObject({
        provider: 'gemini',
        output_tokens: 25,
      });
    },
  );
  it.each(['single', 'chat'])(
    'Claude %s preserva esforço, transforma limites e registra custo',
    async (kind) => {
      if (kind === 'single')
        await callAI(
          'REGRAS',
          'DADOS',
          { model: 'claude-sonnet-5-5' },
          2500,
          options,
        );
      else
        await callAIChat(
          'REGRAS',
          [{ role: 'user', content: 'DADOS' }],
          { model: 'claude-opus-5-5' },
          2500,
          options,
        );
      const body = mocks.create.mock.calls[0][0];
      expect(body.system).toBe('REGRAS');
      expect(body.output_config.effort).toBe('low');
      expect(body.output_config.format.type).toBe('json_schema');
      expect(body.output_config.format.schema.properties.fala).toEqual({
        type: 'string',
        description: 'Restrições: minLength: 1.',
      });
      expect(schema.properties.fala.minLength).toBe(1);
      expect(mocks.ledger.mock.calls[0][0].provider).toBe('anthropic');
    },
  );
  it('o schema preserva nomes de campos que parecem palavras do JSON Schema', () => {
    expect(
      schemaEstruturadoClaude({
        type: 'object',
        properties: { minimum: { type: 'number', minimum: 1 } },
      }),
    ).toEqual({
      type: 'object',
      properties: {
        minimum: { type: 'number', description: 'Restrições: minimum: 1.' },
      },
    });
  });
  it.each(['single', 'chat'])(
    'Bedrock %s usa canário estrito e orçamento separado',
    async (kind) => {
      const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
        Response.json(aws()),
      );
      vi.stubGlobal('fetch', fetch);
      const opts = { ...options, taskKey: 'canario_contrato' };
      if (kind === 'single')
        await callAI(
          'REGRAS',
          'DADOS',
          { model: 'global.moonshotai.kimi-k3' },
          2500,
          opts,
        );
      else
        await callAIChat(
          'REGRAS',
          [{ role: 'user', content: 'DADOS' }],
          { model: 'global.moonshotai.kimi-k3' },
          2500,
          opts,
        );
      const body = JSON.parse(String(fetch.mock.calls[0][1].body));
      expect(fetch.mock.calls[0][0]).toContain(
        'bedrock-runtime.us-east-1.amazonaws.com',
      );
      expect(body.response_format.json_schema).toEqual({
        ...options.structuredOutput,
        strict: true,
      });
      expect(mocks.reserve.mock.calls[0][1]).toEqual([
        BEDROCK_CANARIO_CONTADOR,
      ]);
      expect(mocks.reserve.mock.calls[0][1]).not.toEqual([
        BEDROCK_PILOTO_CONTADOR,
      ]);
      expect(mocks.ledger.mock.calls[0][0]).toMatchObject({
        provider: 'bedrock',
        input_tokens: 20,
        cache_read_tokens: 30,
        cache_write_tokens: 50,
      });
    },
  );
  it.each(['gemini', 'claude', 'bedrock'])(
    '%s recusa truncagem depois de registrar custo',
    async (provider) => {
      mocks.create.mockResolvedValue({
        content: [{ type: 'text', text: '{}' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 100, output_tokens: 20 },
      });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, _init: RequestInit) =>
          Response.json(
            provider === 'gemini' ? gemini('MAX_TOKENS') : aws('length'),
          ),
        ),
      );
      await expect(
        callAI(
          'REGRAS',
          'DADOS',
          {
            model:
              provider === 'gemini'
                ? 'gemini-3.8-flash'
                : provider === 'claude'
                  ? 'claude-opus-5-5'
                  : 'global.moonshotai.kimi-k3',
          },
          2500,
          {
            ...options,
            taskKey:
              provider === 'bedrock' ? 'canario_contrato' : options.taskKey,
          },
        ),
      ).rejects.toThrow('incompleta');
      expect(mocks.ledger.mock.calls[0][0].status).toBe('truncado');
    },
  );
  it('não troca Gemini de geração nem repete uma falha paga', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      callAI('REGRAS', 'DADOS', { model: 'gemini-3.8-flash' }, 2500, options),
    ).rejects.toThrow('503');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('limite ou indisponibilidade do orçamento Bedrock impede o envio', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mocks.reserve.mockResolvedValueOnce(0);
    await expect(
      callAI('REGRAS', 'DADOS', { model: 'global.moonshotai.kimi-k3' }, 2500, {
        ...options,
        taskKey: 'canario_contrato',
      }),
    ).rejects.toThrow('20 chamadas');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['single', 'chat'])(
    'Claude streaming %s exige fim completo e registra uso',
    async (kind) => {
      for (const stopReason of [
        'end_turn',
        'max_tokens',
        'refusal',
        undefined,
      ]) {
        mocks.stream.mockImplementationOnce(async function* () {
          yield {
            type: 'message_start',
            message: { usage: { input_tokens: 100 } },
          };
          yield {
            type: 'content_block_delta',
            delta: { text: '{"fala":"Olá"}' },
          };
          yield {
            type: 'message_delta',
            delta: { stop_reason: stopReason },
            usage: { output_tokens: 20 },
          };
        });
        const call =
          kind === 'single'
            ? callAI(
                'REGRAS',
                'DADOS',
                { model: 'claude-opus-5-5' },
                16000,
                options,
              )
            : callAIChat(
                'REGRAS',
                [{ role: 'user', content: 'DADOS' }],
                { model: 'claude-opus-5-5' },
                16000,
                options,
              );
        if (stopReason === 'end_turn')
          await expect(call).resolves.toBe('{"fala":"Olá"}');
        else await expect(call).rejects.toThrow('incompleta');
        expect(mocks.ledger.mock.lastCall?.[0]).toMatchObject({
          input_tokens: 100,
          output_tokens: 20,
          status: stopReason === 'max_tokens' ? 'truncado' : 'ok',
        });
      }
    },
  );
  it.each(['single', 'chat'])(
    'Gemini %s envia apenas um formato de schema',
    async (kind) => {
      const fetch = vi.fn(async (_url: string, _init: RequestInit) =>
        Response.json(gemini()),
      );
      vi.stubGlobal('fetch', fetch);
      const opts = { ...options, geminiResponseSchema: { type: 'OBJECT' } };
      if (kind === 'single')
        await callAI(
          'REGRAS',
          'DADOS',
          { model: 'gemini-3.8-flash' },
          2500,
          opts,
        );
      else
        await callAIChat(
          'REGRAS',
          [{ role: 'user', content: 'DADOS' }],
          { model: 'gemini-3.8-flash' },
          2500,
          opts,
        );
      expect(
        JSON.parse(String(fetch.mock.calls[0][1].body)).generationConfig,
      ).not.toHaveProperty('responseSchema');
    },
  );
  it.each(['single', 'chat'])(
    'recusa Bedrock %s para sessão real sem trocar modelo ou enviar pedido',
    async (kind) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const call =
          kind === 'single'
            ? callAI(
                'REGRAS',
                'DADOS',
                { model: 'global.moonshotai.kimi-k3' },
                2500,
                options,
              )
            : callAIChat(
                'REGRAS',
                [{ role: 'user', content: 'DADOS' }],
                { model: 'global.moonshotai.kimi-k3' },
                2500,
                options,
              );
        await expect(call).rejects.toThrow('privacidade');
        expect(fetch).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.reserve).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );
});
