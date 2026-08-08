// Contrato do wrapper de IA (actions/ai-client.ts) quanto a THINKING e EFFORT
// no ramo Anthropic, com o SDK stubado. Nenhuma chamada de rede.
//
// Por que este arquivo existe — medido em 07/08 rodando o comparativo de PDI:
// `claude-opus-5` devolveu 400 "thinking.type.enabled is not supported for this
// model. Use thinking.type.adaptive and output_config.effort". O wrapper mandava
// o formato ANTIGO para todo modelo Claude, e nenhum caller de produção usa
// `options.thinking` hoje — então o bug ficou latente, esperando alguém escolher
// um modelo da geração 5 no picker do admin (que já os oferece).
//
// O segundo achado é mais traiçoeiro que um 400: `reasoningEffort` era IGNORADO
// no ramo Claude. Pedir "opus-5 em high" rodava o modelo em esforço PADRÃO e
// devolvia um resultado com o rótulo `high` — comparação silenciosamente errada.
// Depois de ligar `output_config.effort`, o mesmo prompt no mesmo sonnet-5 passou
// de 6.959 para 9.766 tokens de saída: o parâmetro tem efeito medido, não é enfeite.
//
// Invariantes (cada `it` abaixo prova uma):
//   1. Geração 5 / 4.7+ recebe `thinking:{type:'adaptive'}` e NUNCA budget_tokens.
//   2. Geração 4.6 e anteriores seguem no formato antigo (enabled + budget_tokens).
//   3. `reasoningEffort` vira `output_config.effort` nos modelos que o aceitam.
//   4. Sem `thinking` nem `reasoningEffort`, o corpo não ganha nenhum dos dois.
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ params: [] as any[] }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (params: any) => {
        mocks.params.push(params);
        return { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
      stream: async (params: any) => { mocks.params.push(params); throw new Error('stream nao usado neste teste'); },
    };
  },
}));

vi.mock('@/lib/supabase', () => ({ createSupabaseAdmin: () => ({ from: () => ({ insert: async () => ({}) }) }) }));

import { callAI } from '@/actions/ai-client';

const ultimo = () => mocks.params[mocks.params.length - 1];

describe('ai-client · thinking e effort por geração de modelo Claude', () => {
  beforeEach(() => { mocks.params = []; });

  it('geração 5 recebe thinking adaptive, sem budget_tokens', async () => {
    await callAI('SYS', 'USER', { model: 'claude-opus-5' }, 4096, { thinking: true });
    expect(ultimo().thinking).toEqual({ type: 'adaptive' });
    expect(
      ultimo().thinking?.budget_tokens,
      'budget_tokens na geração 5 devolve 400 — o modelo nem roda',
    ).toBeUndefined();
  });

  it('geração 4.6 mantém o formato antigo (enabled + budget_tokens)', async () => {
    await callAI('SYS', 'USER', { model: 'claude-sonnet-4-6' }, 4096, { thinking: true });
    expect(ultimo().thinking?.type).toBe('enabled');
    expect(ultimo().thinking?.budget_tokens).toBeGreaterThan(0);
  });

  it('reasoningEffort vira output_config.effort na geração 5', async () => {
    await callAI('SYS', 'USER', { model: 'claude-sonnet-5' }, 4096, { reasoningEffort: 'high' });
    expect(
      ultimo().output_config,
      'sem isto, "sonnet-5 em high" roda em esforço padrão com o rótulo high',
    ).toEqual({ effort: 'high' });
  });

  it('sem thinking nem effort, o corpo não ganha nenhum dos dois', async () => {
    await callAI('SYS', 'USER', { model: 'claude-opus-5' }, 4096, {});
    expect(ultimo().thinking).toBeUndefined();
    expect(ultimo().output_config).toBeUndefined();
  });
});
