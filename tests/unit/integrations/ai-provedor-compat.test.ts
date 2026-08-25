// Contrato do roteamento dos provedores OpenAI-compatible (Kimi/Moonshot e
// Grok/xAI) no wrapper de IA, com `fetch` stubado. Nenhuma chamada de rede.
//
// POR QUE ESTE ARQUIVO EXISTE (24/08/2026): a resolução de base+chave vivia
// DUPLICADA em `callOpenAI` e `callOpenAIChat` — quatro ternários `isKimi`
// entre os dois. Ao ligar o Grok, somar um terceiro ternário nos dois lugares
// era o padrão clássico dos gêmeos que divergem: quem esquecesse um deles teria
// o modelo funcionando em `callAI` e falhando em `callAIChat` — e `callAIChat`
// é justamente o caminho do chat, ou seja, do Modo Cena.
//
// O terceiro `it` guarda o campo que ninguém olha: `ia_usage_log.provider`.
// Resolvido em separado da chave, o Grok entraria no ledger como 'openai', e o
// painel de custo somaria xAI dentro da OpenAI sem nada acusando na tela.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  chamadas: [] as Array<{ url: string; auth: string; body: any }>,
  ledger: [] as any[],
}));

vi.stubGlobal('fetch', async (url: any, init: any) => {
  mocks.chamadas.push({
    url: String(url),
    auth: String(init?.headers?.Authorization ?? ''),
    body: JSON.parse(String(init?.body ?? '{}')),
  });
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    text: async () => '',
  } as any;
});

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({ insert: async (row: any) => { mocks.ledger.push(row); return {}; } }),
  }),
}));

import { callAI, callAIChat } from '@/actions/ai-client';

const ultima = () => mocks.chamadas[mocks.chamadas.length - 1];

describe('ai-client · provedores OpenAI-compatible', () => {
  beforeEach(() => {
    mocks.chamadas = [];
    mocks.ledger = [];
    process.env.OPENAI_API_KEY = 'sk-openai-teste';
    process.env.KIMI_API_KEY = 'sk-kimi-teste';
    process.env.XAI_API_KEY = 'xai-teste';
  });

  it('grok vai para a base da xAI com a chave da xAI — em callAI', async () => {
    await callAI('SYS', 'USER', { model: 'grok-4.6' }, 512);
    expect(ultima().url).toBe('https://api.x.ai/v1/chat/completions');
    expect(ultima().auth).toBe('Bearer xai-teste');
  });

  it('grok vai para a base da xAI TAMBÉM em callAIChat — é o caminho do chat', async () => {
    await callAIChat('SYS', [{ role: 'user', content: 'oi' }], { model: 'grok-4.6' }, 512);
    expect(
      ultima().url,
      'gêmeo esquecido: o modelo funcionaria em callAI e morreria no chat',
    ).toBe('https://api.x.ai/v1/chat/completions');
    expect(ultima().auth).toBe('Bearer xai-teste');
  });

  it('kimi continua na Moonshot e gpt continua na OpenAI', async () => {
    await callAI('SYS', 'USER', { model: 'kimi-k3' }, 512);
    expect(ultima().url).toBe('https://api.moonshot.ai/v1/chat/completions');
    expect(ultima().auth).toBe('Bearer sk-kimi-teste');

    await callAI('SYS', 'USER', { model: 'gpt-5.6-terra' }, 512);
    expect(ultima().url).toBe('https://api.openai.com/v1/chat/completions');
    expect(ultima().auth).toBe('Bearer sk-openai-teste');
  });

  it('o ledger registra provider "xai", não "openai"', async () => {
    await callAI('SYS', 'USER', { model: 'grok-4.6' }, 512);
    const linha = mocks.ledger[mocks.ledger.length - 1];
    expect(
      linha?.provider,
      'sem isto o painel de custo soma xAI dentro da OpenAI, em silêncio',
    ).toBe('xai');
  });

  /**
   * 🔴 INVERTIDO EM 25/08/2026. Este teste dizia "grok manda max_tokens (não
   * max_completion_tokens, que é dos gpt-5/o-series)" — uma afirmação sobre a
   * SPEC da OpenAI, não sobre o que os provedores fazem.
   *
   * `Medido:` mandando teto 100 e lendo `completion_tokens` na API real:
   *   qwen3.8-max     · max_tokens → **1.675** 🔴  · max_completion_tokens → 102 ✅
   *   muse-spark-1.2  · 100 ✅                      · 100 ✅
   *   kimi-k3         · 100 ✅                      · 100 ✅
   *   grok-4.6        · 100 ✅                      · 100 ✅
   *
   * O Qwen IGNORA `max_tokens`: 16× o teto pedido. Enquanto a regra era uma
   * LISTA DE PREFIXOS (`gpt-5|o1|o3|o4`), todo provedor novo entrava por fora
   * dela e rodava sem teto efetivo — foi o que aconteceu: no piloto de cenários,
   * 10 de 10 chamadas do Qwen passaram dos 6.144 que o código achava impor.
   *
   * A regra passou a ser única (todo OpenAI-compatible manda o campo novo)
   * justamente para não haver lista que alguém esqueça de atualizar. O Grok
   * honra os dois, então mudá-lo é neutro — e o que se ganha é a ausência da
   * lista, que era a fonte do bug.
   */
  it('todo OpenAI-compatible manda max_completion_tokens — sem lista de prefixos', async () => {
    for (const modelo of ['grok-4.6', 'kimi-k3', 'gpt-5.6-terra']) {
      await callAI('SYS', 'USER', { model: modelo }, 777);
      expect(ultima().body.max_completion_tokens, `${modelo} ficou no campo legado`).toBe(777);
      expect(ultima().body.max_tokens, `${modelo} mandou os dois campos`).toBeUndefined();
    }
  });

  it('chave ausente falha com o nome da variável que falta', async () => {
    delete process.env.XAI_API_KEY;
    await expect(callAI('SYS', 'USER', { model: 'grok-4.6' }, 512)).rejects.toThrow(/XAI_API_KEY/);
  });
});
