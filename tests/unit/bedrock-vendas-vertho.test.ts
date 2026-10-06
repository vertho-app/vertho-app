import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  reserve: vi.fn(),
  ledger: vi.fn(async (..._args: unknown[]) => true),
}));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    eval = mocks.reserve;
  },
}));
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: mocks.ledger }));
vi.mock('@/lib/degradacao', () => ({
  DEGRADACAO: { MODELO_NAO_DECLARADO: 'modelo_nao_declarado' },
  registrarDegradacao: vi.fn(),
}));
import { callAI, callAIChat } from '@/actions/ai-client';
import {
  modeloPermitidoNaTarefa,
  modelosPermitidosNaTarefa,
} from '@/lib/ai-tasks';
import { BEDROCK_KIMI_K3_MODEL } from '@/lib/ai-provedores';
import { reservarChamadaBedrock } from '@/lib/bedrock-piloto';
import { VERTHO_TREINO_EMPRESA_ID } from '@/lib/simulador-vendas/vertho';

const structuredOutput = {
  name: 'pace_cliente',
  schema: {
    type: 'object',
    properties: { fala: { type: 'string', minLength: 1, maxLength: 400 } },
    required: ['fala'],
    additionalProperties: false,
  },
};
const options = {
  taskKey: 'sim_vendas_cliente',
  empresaId: VERTHO_TREINO_EMPRESA_ID,
  locale: 'pt-BR' as const,
  structuredOutput,
};
const request = (task = 'sim_vendas_cliente') => ({
  model: BEDROCK_KIMI_K3_MODEL,
  max_completion_tokens: task === 'sim_vendas_criador' ? 8000 : 2500,
  reasoning_effort: 'low',
  response_format: {
    type: 'json_schema',
    json_schema: { ...structuredOutput, strict: true },
  },
});

describe('Kimi Bedrock no treinamento comercial autorizado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'chave-ficticia');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockResolvedValue(
      Response.json({
        choices: [
          { finish_reason: 'stop', message: { content: '{"fala":"Olá"}' } },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['sim_vendas_criador', 'sim_vendas_cliente'])(
    'libera somente %s no tenant fixo e na rota AWS',
    (task) => {
      expect(
        modeloPermitidoNaTarefa(
          BEDROCK_KIMI_K3_MODEL,
          task,
          VERTHO_TREINO_EMPRESA_ID,
        ),
      ).toBe(true);
      for (const tenant of [undefined, null, '', 'outro-tenant'])
        expect(
          modeloPermitidoNaTarefa(BEDROCK_KIMI_K3_MODEL, task, tenant),
        ).toBe(false);
      expect(
        modeloPermitidoNaTarefa('kimi-k3', task, VERTHO_TREINO_EMPRESA_ID),
      ).toBe(false);
      expect(
        modeloPermitidoNaTarefa(
          `${BEDROCK_KIMI_K3_MODEL}-outro`,
          task,
          VERTHO_TREINO_EMPRESA_ID,
        ),
      ).toBe(false);
      expect(
        modelosPermitidosNaTarefa(task).some(
          (m) => m.id === BEDROCK_KIMI_K3_MODEL || m.id === 'kimi-k3',
        ),
      ).toBe(false);
    },
  );
  it.each([
    'ia4_avaliacao',
    'pdi',
    'sim_aluno',
    'sim_vendas_gerente',
    'sim_vendas_moderador',
    'sim_vendas_intencao',
    undefined,
    'constructor',
  ])('não amplia a permissão para %s', (task) => {
    expect(
      modeloPermitidoNaTarefa(
        BEDROCK_KIMI_K3_MODEL,
        task,
        VERTHO_TREINO_EMPRESA_ID,
      ),
    ).toBe(false);
  });
  it.each(['single', 'chat'])(
    '%s: usa AWS com JSON estrito e ledger sem consumir orçamento de piloto',
    async (kind) => {
      const opts = {
        ...options,
        reasoningEffort: 'high' as const,
        timeoutMs: 200000,
      };
      const text =
        kind === 'single'
          ? await callAI(
              'REGRAS',
              'DADOS',
              { model: BEDROCK_KIMI_K3_MODEL },
              2500,
              opts,
            )
          : await callAIChat(
              'REGRAS',
              [{ role: 'user', content: 'DADOS' }],
              { model: BEDROCK_KIMI_K3_MODEL },
              2500,
              opts,
            );
      expect(text).toBe('{"fala":"Olá"}');
      expect(mocks.reserve).not.toHaveBeenCalled();
      const [url, init] = mocks.fetch.mock.calls[0];
      expect(url).toBe(
        'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1/chat/completions',
      );
      expect(init.headers.Authorization).toBe('Bearer chave-ficticia');
      expect(JSON.parse(init.body)).toMatchObject({
        model: BEDROCK_KIMI_K3_MODEL,
        max_completion_tokens: 2500,
        reasoning_effort: 'low',
        service_tier: 'default',
        response_format: {
          type: 'json_schema',
          json_schema: {
            strict: true,
            schema: {
              properties: {
                fala: {
                  type: 'string',
                  description: 'Restrições: minLength: 1; maxLength: 400.',
                },
              },
            },
          },
        },
      });
      expect(mocks.ledger.mock.calls[0][0]).toMatchObject({
        provider: 'bedrock',
        feature: 'sim_vendas_cliente',
        empresa_id: VERTHO_TREINO_EMPRESA_ID,
      });
    },
  );
  it('criador aceita o teto de 8.000 tokens sem cotas de ensaio', async () => {
    await callAI('REGRAS', 'DADOS', { model: BEDROCK_KIMI_K3_MODEL }, 8000, {
      ...options,
      taskKey: 'sim_vendas_criador',
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it.each([
    'tenant',
    'tarefa',
    'saida-criador',
    'saida-cliente',
    'entrada',
    'sem-schema',
    'sem-strict',
    'esforco',
  ])('%s: bloqueia antes do provedor', async (motivo) => {
    const task =
      motivo === 'saida-criador'
        ? 'sim_vendas_criador'
        : motivo === 'tarefa'
          ? 'sim_vendas_gerente'
          : 'sim_vendas_cliente';
    const body = request(task);
    if (motivo === 'saida-criador' || motivo === 'saida-cliente')
      body.max_completion_tokens++;
    if (motivo === 'sem-schema') body.response_format.type = 'json_object';
    if (motivo === 'sem-strict')
      body.response_format.json_schema.strict = false;
    if (motivo === 'esforco') body.reasoning_effort = 'high';
    const serialized = JSON.stringify({
      ...body,
      messages: [{ content: motivo === 'entrada' ? 'á'.repeat(250000) : 'ok' }],
    });
    await expect(
      reservarChamadaBedrock(
        task,
        serialized,
        motivo === 'tenant' ? 'outro-tenant' : VERTHO_TREINO_EMPRESA_ID,
      ),
    ).rejects.toThrow();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it.each(['single', 'chat'])(
    '%s: falha 503 não repete nem troca o modelo congelado',
    async (kind) => {
      mocks.fetch.mockResolvedValue(
        new Response('indisponível', { status: 503 }),
      );
      const promise =
        kind === 'single'
          ? callAI(
              'REGRAS',
              'DADOS',
              { model: BEDROCK_KIMI_K3_MODEL },
              2500,
              options,
            )
          : callAIChat(
              'REGRAS',
              [{ role: 'user', content: 'DADOS' }],
              { model: BEDROCK_KIMI_K3_MODEL },
              2500,
              options,
            );
      await expect(promise).rejects.toThrow('503');
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(mocks.reserve).not.toHaveBeenCalled();
    },
  );
  it.each(['single', 'chat'])(
    '%s: outro tenant é recusado pelo wrapper antes de enviar',
    async (kind) => {
      const opts = { ...options, empresaId: 'outro-tenant' };
      const promise =
        kind === 'single'
          ? callAI(
              'REGRAS',
              'DADOS',
              { model: BEDROCK_KIMI_K3_MODEL },
              2500,
              opts,
            )
          : callAIChat(
              'REGRAS',
              [{ role: 'user', content: 'DADOS' }],
              { model: BEDROCK_KIMI_K3_MODEL },
              2500,
              opts,
            );
      await expect(promise).rejects.toThrow();
      expect(mocks.fetch).not.toHaveBeenCalled();
    },
  );
});
