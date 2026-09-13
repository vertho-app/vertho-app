import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: vi.fn(async () => true) }));
import { gravarLinhaLedger } from '@/lib/ia-ledger';
import { callAI, callAIChat } from '@/actions/ai-client';
const options = { taskKey: 'sim_vendas_cliente', empresaId: 'empresa-a', correlationId: 'tentativa-1', responses: { format: { name: 'teste', strict: true, schema: { type: 'object', properties: { fala: { type: 'string' } }, required: ['fala'], additionalProperties: false } } } };
const payload = () => ({ status: 'completed', model: 'gpt-5.4-2026-03-05', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"fala":"Olá"}' }] }], usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40 } } });
describe('PACE no wrapper único Responses', () => {
  beforeEach(() => { vi.stubEnv('OPENAI_API_KEY', 'chave-falsa-unit-test'); vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('preserva o prompt literal, usa schema estrito, não armazena no provedor e mede tokens sem duplicar cache', async () => {
    const fetch = vi.fn(async () => Response.json(payload())); vi.stubGlobal('fetch', fetch);
    expect(await callAI('', 'PROMPT ORIGINAL', { model: 'gpt-5.4-2026-03-05' }, 2500, options)).toBe('{"fala":"Olá"}');
    const [url, init] = (fetch.mock.calls[0] as unknown as [string, RequestInit]);
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init.body)); expect(body.input).toBe('PROMPT ORIGINAL'); expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true); expect(body.max_output_tokens).toBe(2500); expect(body).not.toHaveProperty('tools');
    expect(vi.mocked(gravarLinhaLedger).mock.calls[0][0]).toMatchObject({ feature: 'sim_vendas_cliente', empresa_id: 'empresa-a', correlation_id: 'tentativa-1', input_tokens: 60, output_tokens: 20, cache_read_tokens: 40 });
  });
  it('o caminho chat também passa por Responses', async () => {
    const fetch = vi.fn(async () => Response.json(payload())); vi.stubGlobal('fetch', fetch);
    await callAIChat('Regras', [{ role: 'user', content: 'Olá' }], { model: 'gpt-5.4-2026-03-05' }, 1000, options);
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.input).toEqual([{ role: 'system', content: 'Regras' }, { role: 'user', content: 'Olá' }]);
  });
  it('recusa truncagem após registrar o custo pago', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...payload(), status: 'incomplete' })));
    await expect(callAI('', 'Teste', { model: 'gpt-5.4-2026-03-05' }, 10, options)).rejects.toThrow('incompleta');
    expect(vi.mocked(gravarLinhaLedger).mock.calls[0][0].status).toBe('truncado');
  });
  it('não troca de modelo/provedor em 429 nem envia o prompt por outra API', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 429 })); vi.stubGlobal('fetch', fetch);
    await expect(callAI('', 'Teste', { model: 'gpt-5.4-2026-03-05' }, 1000, options)).rejects.toThrow('429');
    expect(fetch).toHaveBeenCalledTimes(1); expect(gravarLinhaLedger).not.toHaveBeenCalled();
  });
  it('configuração de outro provedor falha antes da chamada paga', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(callAI('', 'Teste', { model: 'claude-sonnet-4-6' }, 1000, options)).rejects.toThrow('OpenAI'); expect(fetch).not.toHaveBeenCalled();
  });
});
