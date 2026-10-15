// GPT pelo AWS Bedrock (14/10/2026), com `fetch` stubado. Nenhuma chamada de rede.
//
// Decisão do dono (13/10): o tráfego GPT sai pelo Bedrock, perfil `global.`, pago pelo
// crédito Activate; se o Bedrock recusar, a chamada é refeita UMA vez pela OpenAI direta e
// a troca vira linha em `degradacao_log`. O id do app (`gpt-5.6-terra`) não muda: só o
// transporte. Este arquivo prova as três peças e as bordas que já morderam esta base:
//
//   1. A ROTA nos três caminhos (`callAI`, `callAIChat`, Responses): URL, chave, id no corpo,
//      e o ledger gravando o id do app com o preço do Bedrock. Os gêmeos que divergem são a
//      classe de bug documentada em `actions/ai-client.ts`.
//   2. A RESERVA só quando o Bedrock RECUSA (401/403/429/5xx). 400 é erro do pedido e timeout
//      pode já ter sido cobrado: nenhum dos dois é refeito.
//   3. O GUARD: todo id `gpt-<número>` do código tem destino declarado (`GPT_VIA_BEDROCK` ou
//      `GPT_APOSENTADO`) e todo id mapeado tem preço. Id sem guard diverge calado.
//   4. (15/10/2026) O GPT APOSENTADO vira o substituto da família 5.6 antes de sair, e o check
//      em lote (`executarLoteSincrono`) vai pelo mesmo `callAI`, com concorrência limitada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), ledger: [] as any[], degradacoes: [] as any[] }));
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({ from: () => ({ insert: async (row: any) => { mocks.ledger.push(row); return {}; } }) }),
}));
vi.mock('@/lib/degradacao', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  registrarDegradacao: async (input: any) => { mocks.degradacoes.push(input); },
}));

import { callAI, callAIChat } from '@/actions/ai-client';
import { BEDROCK_CHAT_URL, BEDROCK_RESPONSES_URL, GPT_APOSENTADO, GPT_VIA_BEDROCK, gptAtual, rotaBedrockDoGpt } from '@/lib/ai-provedores';
import { executarLoteSincrono } from '@/lib/ai-batch';
import { modeloPaceCompativel } from '@/lib/simulador-vendas/modelos';
import { DEGRADACAO } from '@/lib/degradacao';
import { MODELS } from '@/lib/ia-cost-catalog';

const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES = 'https://api.openai.com/v1/responses';
const TERRA = 'gpt-5.6-terra';
const TERRA_BEDROCK = 'global.openai.gpt-5.6-terra';

const respostaChat = () => ({
  ok: true,
  status: 200,
  // Forma medida no Bedrock em 14/10: `prompt_tokens` inclui leitura E gravação de cache.
  json: async () => ({
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 } },
  }),
  text: async () => '',
});
const respostaResponses = () => ({
  ok: true,
  status: 200,
  json: async () => ({
    status: 'completed',
    output_text: '{"ok":true}',
    output: [],
    usage: { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } },
  }),
  text: async () => '',
});
const recusa = (status: number) => ({
  ok: false,
  status,
  text: async () => '{"error":{"message":"openai.gpt-5.6-terra is not available for this account"}}',
  body: { cancel: async () => undefined },
});

const chamadas = () => mocks.fetch.mock.calls.map(([url, init]: any[]) => ({
  url: String(url),
  auth: String(init?.headers?.Authorization ?? ''),
  body: JSON.parse(String(init?.body ?? '{}')),
}));

/** `semRetentativa` isola o transporte: sem retry nem fallback de provedor por cima. */
const SO_TRANSPORTE = { taskKey: 'ia3_check', locale: 'pt-BR' as const, semRetentativa: true, maxRetries: 0 };

describe('GPT pelo AWS Bedrock · rota', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'chave-aws');
    vi.stubEnv('OPENAI_API_KEY', 'chave-openai');
    vi.stubEnv('OPENAI_VIA_BEDROCK', '');
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockReset().mockImplementation(async () => respostaChat());
    mocks.ledger = [];
    mocks.degradacoes = [];
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it.each(['single', 'chat'])('%s: vai ao Bedrock com o id global e a chave da AWS; o ledger grava o id do app e o preço do Bedrock', async (tipo) => {
    if (tipo === 'single') await callAI('SYS', 'USER', { model: TERRA }, 7000, SO_TRANSPORTE);
    else await callAIChat('SYS', [{ role: 'user', content: 'USER' }], { model: TERRA }, 7000, SO_TRANSPORTE);
    const [c] = chamadas();
    expect(chamadas()).toHaveLength(1);
    expect(c.url).toBe(BEDROCK_CHAT_URL);
    expect(c.auth).toBe('Bearer chave-aws');
    expect(c.body).toMatchObject({ model: TERRA_BEDROCK, max_completion_tokens: 7000 });
    // `service_tier` é do Kimi; o GPT recebe o corpo que a OpenAI receberia.
    expect(c.body).not.toHaveProperty('service_tier');
    expect(mocks.ledger[0]).toMatchObject({ provider: 'bedrock', model: TERRA, input_tokens: 50, output_tokens: 50, cache_read_tokens: 20, cache_write_tokens: 30 });
    // Global CRIS do Terra (model card, 14/10): 2,00 entrada · 2,50 gravação · 0,20 leitura · 12,00 saída.
    expect(mocks.ledger[0].cost_usd).toBeCloseTo((50 * 2 + 30 * 2.5 + 20 * 0.2 + 50 * 12) / 1e6, 10);
    expect(mocks.degradacoes).toEqual([]);
  });

  it('o preço sai da tabela do BEDROCK: acima de 272 mil tokens de entrada vale a faixa longa do model card', async () => {
    // No preço curto o Global CRIS é igual ao da OpenAI direta, então só a faixa longa
    // distingue as duas tabelas (a da OpenAI no catálogo não tem faixa longa).
    mocks.fetch.mockReset().mockImplementation(async () => ({
      ...respostaChat(),
      json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 300_000, completion_tokens: 1_000 } }),
    }));
    await callAI('SYS', 'USER', { model: TERRA }, 7000, SO_TRANSPORTE);
    expect(mocks.ledger[0]).toMatchObject({ provider: 'bedrock', model: TERRA, input_tokens: 300_000 });
    expect(mocks.ledger[0].cost_usd).toBeCloseTo((300_000 * 4 + 1_000 * 18) / 1e6, 10);
  });

  it('schema estrito vai ORIGINAL (o transformador do Claude é só do Kimi)', async () => {
    const schema = { type: 'object', additionalProperties: false, required: ['nota'], properties: { nota: { type: 'integer', minimum: 0, maximum: 100 } } };
    await callAI('SYS', 'USER', { model: TERRA }, 2000, { ...SO_TRANSPORTE, structuredOutput: { name: 'check', schema } });
    expect(chamadas()[0].body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'check', schema, strict: true } });
  });

  it.each([401, 403, 429, 500, 503])('Bedrock recusa com %s: refaz UMA vez pela OpenAI e registra a troca', async (status) => {
    mocks.fetch.mockReset()
      .mockImplementationOnce(async () => recusa(status))
      .mockImplementationOnce(async () => respostaChat());
    await expect(callAI('SYS', 'USER', { model: TERRA }, 7000, SO_TRANSPORTE)).resolves.toBe('ok');
    const [primeira, segunda] = chamadas();
    expect(chamadas()).toHaveLength(2);
    expect(primeira.url).toBe(BEDROCK_CHAT_URL);
    expect(segunda).toMatchObject({ url: OPENAI_CHAT, auth: 'Bearer chave-openai', body: { model: TERRA } });
    expect(mocks.degradacoes).toHaveLength(1);
    expect(mocks.degradacoes[0]).toMatchObject({
      fluxo: 'ia', tipo: DEGRADACAO.GPT_BEDROCK_PARA_OPENAI, chave: `${TERRA}:http-${status}`,
      detalhe: { modelo: TERRA, motivo: `http-${status}`, taskKey: 'ia3_check' },
    });
    expect(mocks.degradacoes[0].detalhe.erro).toContain('not available for this account');
    expect(mocks.ledger[0]).toMatchObject({ provider: 'openai', model: TERRA });
  });

  it('400 é erro do PEDIDO, não da conta: não vai para a reserva', async () => {
    mocks.fetch.mockReset().mockImplementation(async () => ({ ...recusa(400), text: async () => 'Unsupported value' }));
    await expect(callAI('SYS', 'USER', { model: TERRA }, 7000, SO_TRANSPORTE)).rejects.toThrow(/bedrock 400/);
    expect(chamadas()).toHaveLength(1);
    expect(mocks.degradacoes).toEqual([]);
  });

  it('timeout não vai para a reserva: a chamada pode já ter sido cobrada', async () => {
    mocks.fetch.mockReset().mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }));
    await expect(callAI('SYS', 'USER', { model: TERRA }, 7000, SO_TRANSPORTE)).rejects.toThrow(/timeout/);
    expect(chamadas()).toHaveLength(1);
    expect(mocks.degradacoes).toEqual([]);
  });

  it('sem a chave do Bedrock NESTE ambiente (o Trigger.dev, por exemplo): OpenAI direta, com a troca registrada', async () => {
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', '');
    await callAI('SYS', 'USER', { model: TERRA }, 7000, SO_TRANSPORTE);
    expect(chamadas().map((c) => c.url)).toEqual([OPENAI_CHAT]);
    expect(mocks.degradacoes).toHaveLength(1);
    expect(mocks.degradacoes[0]).toMatchObject({ chave: `${TERRA}:sem-chave-bedrock`, tipo: DEGRADACAO.GPT_BEDROCK_PARA_OPENAI });
  });

  it('sem a chave da OpenAI aqui: Bedrock sem reserva, e a recusa chega como erro', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    mocks.fetch.mockReset().mockImplementation(async () => recusa(503));
    await expect(callAI('SYS', 'USER', { model: TERRA }, 7000, SO_TRANSPORTE)).rejects.toThrow(/bedrock 503/);
    expect(chamadas()).toHaveLength(1);
  });

  it('OPENAI_VIA_BEDROCK=off desliga a rota inteira, sem degradação', async () => {
    vi.stubEnv('OPENAI_VIA_BEDROCK', 'off');
    await callAIChat('SYS', [{ role: 'user', content: 'USER' }], { model: TERRA }, 7000, SO_TRANSPORTE);
    expect(chamadas()).toEqual([expect.objectContaining({ url: OPENAI_CHAT, body: expect.objectContaining({ model: TERRA }) })]);
    expect(mocks.degradacoes).toEqual([]);
  });

  it.each(['minimal', 'max'] as const)("esforço '%s' (fora dos níveis medidos no Bedrock) fica na OpenAI", async (esforco) => {
    // Lista de PERMISSÃO: um 400 do Bedrock não vai para a reserva, então nível não medido não sai por lá.
    await callAI('SYS', 'USER', { model: TERRA }, 7000, { ...SO_TRANSPORTE, reasoningEffort: esforco });
    expect(chamadas().map((c) => c.url)).toEqual([OPENAI_CHAT]);
    expect(mocks.degradacoes).toEqual([]);
  });

  it('os níveis medidos (e a ausência de esforço) saem pelo Bedrock', () => {
    for (const esforco of [undefined, null, 'none', 'low', 'medium', 'high', 'xhigh']) {
      expect(rotaBedrockDoGpt(TERRA, esforco), String(esforco)).toBe(TERRA_BEDROCK);
    }
  });

  it.each([
    ['gpt-5.4-2026-03-05', 'gpt-5.6-terra'],
    ['gpt-5.4', 'gpt-5.6-terra'],
    ['gpt-5.5', 'gpt-5.6-sol'],
    ['gpt-5.4-mini', 'gpt-5.6-luna'],
    ['gpt-5.4-mini-2026-03-17', 'gpt-5.6-luna'],
    ['gpt-5.1', 'gpt-5.6-luna'],
  ])('GPT aposentado %s sai como %s pelo Bedrock, e o ledger grava o substituto (15/10)', async (antigo, novo) => {
    await callAI('SYS', 'USER', { model: antigo }, 7000, SO_TRANSPORTE);
    expect(chamadas()).toEqual([expect.objectContaining({ url: BEDROCK_CHAT_URL, body: expect.objectContaining({ model: `global.openai.${novo}` }) })]);
    expect(mocks.ledger[0]).toMatchObject({ provider: 'bedrock', model: novo });
    expect(mocks.degradacoes).toEqual([]);
  });

  it('o gêmeo callAIChat troca o aposentado do mesmo jeito', async () => {
    await callAIChat('SYS', [{ role: 'user', content: 'USER' }], { model: 'gpt-5.4-2026-03-05' }, 7000, SO_TRANSPORTE);
    expect(chamadas()).toEqual([expect.objectContaining({ url: BEDROCK_CHAT_URL, body: expect.objectContaining({ model: TERRA_BEDROCK }) })]);
    expect(mocks.ledger[0]).toMatchObject({ provider: 'bedrock', model: TERRA });
  });

  it('structuredOutput com id aposentado NÃO é recusado como troca da régua de privacidade', async () => {
    const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };
    await expect(callAI('SYS', 'USER', { model: 'gpt-5.4-mini' }, 2000, { ...SO_TRANSPORTE, structuredOutput: { name: 'x', schema } })).resolves.toBe('ok');
    expect(chamadas()[0].body.model).toBe('global.openai.gpt-5.6-luna');
  });

  it('simulador: a sessão congelada no GPT antigo segue compatível, pelo substituto', () => {
    for (const antigo of ['gpt-5.4-2026-03-05', 'gpt-5.4-mini', 'gpt-5.4-mini-2026-03-17']) expect(modeloPaceCompativel(antigo), antigo).toBe(true);
    expect(modeloPaceCompativel('gpt-5.6-terra')).toBe(true);
    expect(modeloPaceCompativel('gpt-5.6-luna')).toBe(true);
    expect(gptAtual('claude-sonnet-5-5')).toBe('claude-sonnet-5-5');
  });

  it('Responses (simuladores): Bedrock com o id global; na recusa, OpenAI SEM guardar o corpo do erro', async () => {
    const opcoes = { ...SO_TRANSPORTE, responses: { format: { name: 'pace', strict: true, schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } } } } };
    mocks.fetch.mockReset().mockImplementation(async () => respostaResponses());
    await callAI('SYS', 'USER', { model: TERRA }, 4000, opcoes);
    expect(chamadas()[0]).toMatchObject({ url: BEDROCK_RESPONSES_URL, auth: 'Bearer chave-aws', body: { model: TERRA_BEDROCK, store: false } });
    expect(mocks.ledger[0]).toMatchObject({ provider: 'bedrock', model: TERRA });

    mocks.fetch.mockReset()
      .mockImplementationOnce(async () => recusa(403))
      .mockImplementationOnce(async () => respostaResponses());
    await callAI('SYS', 'USER', { model: TERRA }, 4000, opcoes);
    expect(chamadas().map((c) => c.url)).toEqual([BEDROCK_RESPONSES_URL, OPENAI_RESPONSES]);
    expect(mocks.degradacoes.at(-1)).toMatchObject({ chave: `${TERRA}:http-403` });
    expect(mocks.degradacoes.at(-1).detalhe).not.toHaveProperty('erro');
  });
});

describe('GPT pelo AWS Bedrock · guard de destino e preço', () => {
  const RAIZ = join(__dirname, '..', '..', '..');
  const DIRS = ['actions', 'lib', 'app', 'trigger', 'components'];
  const arquivos = (dir: string): string[] => {
    let saida: string[] = [];
    let nomes: string[] = [];
    try { nomes = readdirSync(dir); } catch { return saida; }
    for (const nome of nomes) {
      if (nome === 'node_modules' || nome.startsWith('.')) continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) saida = saida.concat(arquivos(caminho));
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(nome)) saida.push(caminho);
    }
    return saida;
  };

  it('todo id `gpt-<número>` em string do código tem destino declarado', () => {
    const semDestino: string[] = [];
    let achados = 0;
    for (const dir of DIRS) {
      for (const arquivo of arquivos(join(RAIZ, dir))) {
        for (const m of readFileSync(arquivo, 'utf8').matchAll(/['"](gpt-\d[\w.-]*)['"]/g)) {
          achados++;
          const id = m[1];
          const declarado = Object.prototype.hasOwnProperty.call(GPT_VIA_BEDROCK, id)
            || Object.prototype.hasOwnProperty.call(GPT_APOSENTADO, id);
          if (!declarado) semDestino.push(`${relative(RAIZ, arquivo)}: ${id}`);
        }
      }
    }
    // Denominador: um guard que não acha nada passa por construção.
    expect(achados).toBeGreaterThan(20);
    expect(semDestino, 'GPT novo no código: ponha em GPT_VIA_BEDROCK (com preço) ou em GPT_APOSENTADO (com o substituto)').toEqual([]);
  });

  it('as duas listas não se sobrepõem; todo id mapeado é o global do mesmo modelo, com preço; todo substituto sai pelo Bedrock', () => {
    for (const id of Object.keys(GPT_APOSENTADO)) expect(GPT_VIA_BEDROCK, id).not.toHaveProperty(id);
    for (const [id, idBedrock] of Object.entries(GPT_VIA_BEDROCK)) {
      expect(idBedrock).toBe(`global.openai.${id}`);
      expect(MODELS, `${idBedrock} sem preço: o ledger nasceria com cost_usd nulo`).toHaveProperty(idBedrock);
    }
    for (const [antigo, novo] of Object.entries(GPT_APOSENTADO)) expect(GPT_VIA_BEDROCK, `${antigo} → ${novo}`).toHaveProperty(novo);
  });

  it('nenhum arquivo de produção volta ao lote da OpenAI (15/10/2026)', () => {
    const achados: string[] = [];
    for (const dir of DIRS) {
      for (const arquivo of arquivos(join(RAIZ, dir))) {
        if (/api\.openai\.com\/v1\/(batches|files)|\/v1\/batches/.test(readFileSync(arquivo, 'utf8'))) achados.push(relative(RAIZ, arquivo));
      }
    }
    expect(achados, 'o check GPT em lote é síncrono pelo Bedrock (`executarLoteSincrono`)').toEqual([]);
  });
});

describe('lote síncrono do GPT (executarLoteSincrono, 15/10/2026)', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_BEARER_TOKEN_BEDROCK', 'chave-aws');
    vi.stubEnv('OPENAI_API_KEY', 'chave-openai');
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.ledger = [];
    mocks.degradacoes = [];
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('respeita a concorrência, devolve por customId e deixa FORA do mapa o que falhou', async () => {
    let emVoo = 0, pico = 0;
    mocks.fetch.mockReset().mockImplementation(async (_url: string, init: any) => {
      emVoo++; pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
      const corpo = JSON.parse(String(init.body));
      if (corpo.messages[1].content === 'FALHA') return { ...recusa(400), text: async () => 'pedido inválido' };
      return respostaChat();
    });
    const reqs = Array.from({ length: 9 }, (_, i) => ({ customId: `k${i}`, system: 'SYS', user: i === 4 ? 'FALHA' : `U${i}`, model: TERRA, maxTokens: 4096 }));
    const saida = await executarLoteSincrono(reqs, { ledger: { feature: 'ia3_check', empresaId: 'emp-1' }, concorrencia: 3 });
    expect(pico).toBeLessThanOrEqual(3);
    expect(pico).toBeGreaterThan(1);
    expect(saida.has('k4')).toBe(false);
    expect([...saida.keys()].sort()).toEqual(['k0', 'k1', 'k2', 'k3', 'k5', 'k6', 'k7', 'k8']);
    // Cada item vai pelo Bedrock e grava no ledger com a etiqueta e a empresa do lote.
    expect(new Set(chamadas().map((c) => c.url))).toEqual(new Set([BEDROCK_CHAT_URL]));
    expect(mocks.ledger).toHaveLength(8);
    for (const linha of mocks.ledger) expect(linha).toMatchObject({ feature: 'ia3_check', empresa_id: 'emp-1', provider: 'bedrock', model: TERRA });
  });
});
