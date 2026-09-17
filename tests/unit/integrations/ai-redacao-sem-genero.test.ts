import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chamadas = vi.hoisted(() => ({ individuais: [] as any[], lotes: [] as any[] }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (params: any) => {
        chamadas.individuais.push(params);
        return { content: [{ type: 'text', text: '{"nota":2.7}' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' };
      },
      batches: { create: async (params: any) => { chamadas.lotes.push(params); return { id: 'batch_teste' }; } },
    };
  },
}));
vi.mock('@/lib/ia-ledger', () => ({ gravarLinhaLedger: vi.fn() }));
vi.mock('@/lib/supabase', async () => {
  const { criarSupabaseMock } = await import('../../helpers/supabase-mock');
  const sb = criarSupabaseMock();
  return { createSupabaseAdmin: () => sb.client };
});

import { callAI, callAIChat } from '@/actions/ai-client';
import { createClaudeBatch, createOpenAIBatch } from '@/lib/ai-batch';
import { REDACAO_SEM_GENERO, withLanguageInstruction } from '@/lib/ai-language';

const modelo = 'claude-sonnet-4-6';
const system = 'Avalie EXCLUSIVAMENTE pela régua fornecida. Retorne JSON.';
const user = 'Evidência literal: "estou preparada". Nota consolidada: 2.7.';
const textoDoSystem = (s: any): string => typeof s === 'string' ? s : s.map((b: any) => b.text).join('\n\n');

beforeEach(() => {
  chamadas.individuais = [];
  chamadas.lotes = [];
  vi.stubEnv('ANTHROPIC_API_KEY', 'teste');
  vi.stubEnv('OPENAI_API_KEY', 'teste');
  vi.stubEnv('GEMINI_API_KEY', 'teste');
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Rede não permitida neste teste'); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('regra de redação chega ao provedor, sem editar evidências ou resposta', () => {
  it('síncrono, chat e lote Claude recebem a MESMA regra', async () => {
    const opcoes = { locale: 'pt-BR' as const, taskKey: 'sem14_scorer' };
    expect(await callAI(system, user, { model: modelo }, 1000, opcoes)).toBe('{"nota":2.7}');
    expect(await callAIChat(system, [{ role: 'user', content: user }], { model: modelo }, 1000, opcoes)).toBe('{"nota":2.7}');
    await createClaudeBatch([{ customId: 'pessoa', system, user, model: modelo, maxTokens: 1000 }]);
    const enviados = [...chamadas.individuais, chamadas.lotes[0].requests[0].params];
    expect(enviados).toHaveLength(3);
    for (const req of enviados) {
      expect(textoDoSystem(req.system)).toBe(withLanguageInstruction(system, 'pt-BR'));
      expect(textoDoSystem(req.system)).toContain(REDACAO_SEM_GENERO);
      expect(JSON.stringify(req.messages)).toContain(user.replaceAll('"', '\\"'));
    }
  });

  it.each(['gpt-5.4', 'gemini-2.5-flash'])('a regra também chega no transporte %s', async (model) => {
    const corpos: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      corpos.push(JSON.parse(init.body));
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
      }), { status: 200 });
    }));
    for (const chat of [false, true]) {
      if (chat) await callAIChat(system, [{ role: 'user', content: user }], { model }, 1000, { locale: 'pt-BR', taskKey: 'temporada_feedback' });
      else await callAI(system, user, { model }, 1000, { locale: 'pt-BR', taskKey: 'sem14_scorer' });
    }
    expect(corpos).toHaveLength(2);
    for (const corpo of corpos) {
      const recebido = model.startsWith('gemini') ? corpo.systemInstruction.parts[0].text : corpo.messages[0].content;
      expect(recebido).toContain(REDACAO_SEM_GENERO);
      expect(recebido).toContain(system);
    }
  });

  it('lote OpenAI recebe a regra no arquivo JSONL enviado', async () => {
    let jsonl = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      if (String(url).endsWith('/files')) {
        jsonl = await init.body.get('file').text();
        return new Response(JSON.stringify({ id: 'file_teste' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'batch_teste' }), { status: 200 });
    }));
    await createOpenAIBatch([{ customId: 'pessoa', system, user, model: 'gpt-5.4', maxTokens: 1000 }]);
    const enviado = JSON.parse(jsonl).body;
    expect(enviado.messages[0].content).toBe(withLanguageInstruction(system, 'pt-BR'));
    expect(enviado.messages[1].content).toBe(user);
  });

  it('a orientação mantém o idioma, citações, critérios e formato de saída', () => {
    for (const [locale, idioma] of [['pt-BR', 'português do Brasil'], ['en-US', 'inglês dos Estados Unidos'], ['es-ES', 'espanhol da Espanha']] as const) {
      const prompt = withLanguageInstruction(system, locale);
      expect(prompt.startsWith(system)).toBe(true);
      expect(prompt).toContain(idioma);
      expect(prompt).toContain('Preserve citações literais');
      expect(prompt).toContain('não altera critérios, notas, níveis, conclusões');
      expect(prompt).toContain('Não o deduza pelo nome');
      expect(prompt).toContain('Preserve o formato de saída e as chaves JSON');
    }
  });
});
