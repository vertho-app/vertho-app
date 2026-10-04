/**
 * R-57: o wrapper de IA tira o travessão da resposta das tarefas que escrevem
 * para o cliente, acrescenta a regra de pontuação ao system delas e deixa as
 * demais tarefas byte a byte como estavam. O caractere só aparece como escape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const EM = '\u2014';
const estado = vi.hoisted(() => ({ chamadas: [] as any[], resposta: '', erro: null as any }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (params: any) => {
        estado.chamadas.push(params);
        if (estado.erro) throw estado.erro;
        return { content: [{ type: 'text', text: estado.resposta }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' };
      },
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
import { REGRA_PONTUACAO_DA_SAIDA, withLanguageInstruction } from '@/lib/ai-language';

const modelo = 'claude-sonnet-4-6';
const system = 'Responda à pessoa.';
const user = 'Pergunta da pessoa.';
const textoDoSystem = (s: any): string => (typeof s === 'string' ? s : s.map((b: any) => b.text).join('\n\n'));

beforeEach(() => {
  estado.chamadas = [];
  estado.resposta = '';
  estado.erro = null;
  vi.stubEnv('ANTHROPIC_API_KEY', 'teste');
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Rede não permitida neste teste'); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('tarefas que escrevem para o cliente', () => {
  it('callAIChat: o texto sai sem travessão e o system leva a regra de pontuação', async () => {
    estado.resposta = `Boa pergunta ${EM} vamos ver juntos.`;
    const r = await callAIChat(system, [{ role: 'user', content: user }], { model: modelo }, 500, { locale: 'pt-BR', taskKey: 'tira_duvidas' });
    expect(r).toBe('Boa pergunta, vamos ver juntos.');
    expect(textoDoSystem(estado.chamadas[0].system)).toBe(withLanguageInstruction(system, 'pt-BR', { semTravessao: true }));
    expect(textoDoSystem(estado.chamadas[0].system)).toContain(REGRA_PONTUACAO_DA_SAIDA);
  });

  it('callAI: JSON do PDI sai limpo e parseável, e o eco da entrada fica como veio', async () => {
    const nome = `Feedback ${EM} receber e aplicar`;
    estado.resposta = '```json\n' + JSON.stringify({ competencias: [{ nome, feedback: `Avançou ${EM} falta prazo.` }] }) + '\n```';
    const r = await callAI(system, `Competência avaliada: ${nome}`, { model: modelo }, 500, { locale: 'pt-BR', taskKey: 'pdi_individual' });
    expect(r).not.toContain('\u2014 falta');
    const json = JSON.parse(r.replace(/```json\s*/, '').replace(/```\s*$/, ''));
    expect(json.competencias[0].nome).toBe(nome);
    expect(json.competencias[0].feedback).toBe('Avançou, falta prazo.');
    // o gêmeo síncrono também leva a regra de pontuação no system
    expect(textoDoSystem(estado.chamadas[0].system)).toBe(withLanguageInstruction(system, 'pt-BR', { semTravessao: true }));
  });

  it('o [META] da conversa chega intocado ao código que o lê', async () => {
    const meta = `[META]{"trecho":"disse ${EM} sem pensar"}[/META]`;
    estado.resposta = `Conta mais ${EM} o que houve?\n${meta}`;
    const r = await callAIChat(system, [{ role: 'user', content: user }], { model: modelo }, 500, { locale: 'pt-BR', taskKey: 'arguicao_turno' });
    expect(r).toBe(`Conta mais, o que houve?\n${meta}`);
  });

  it('o ramo de fallback de provedor também sai limpo', async () => {
    // O primário (Claude) responde 529 até esgotar os retries e o wrapper cai no GPT:
    // o texto do fallback passa pelo mesmo filtro.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      estado.erro = Object.assign(new Error('overloaded'), { status: 529 });
      vi.stubEnv('OPENAI_API_KEY', 'teste');
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: `Resposta do fallback ${EM} limpa` }, finish_reason: 'stop' }],
      }), { status: 200 })));
      const promessa = callAI(system, user, { model: modelo }, 500, { locale: 'pt-BR', taskKey: 'beto' });
      await vi.advanceTimersByTimeAsync(120000);
      expect(await promessa).toBe('Resposta do fallback, limpa');
    } finally {
      vi.useRealTimers();
    }
  });

  it('o caminho direto do OpenAI sai limpo', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'teste');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: `Resposta direta ${EM} limpa` }, finish_reason: 'stop' }],
    }), { status: 200 })));
    expect(await callAI(system, user, { model: 'gpt-5.4' }, 500, { locale: 'pt-BR', taskKey: 'beto' })).toBe('Resposta direta, limpa');
  });
});

describe('tarefas fora do registro seguem como estavam', () => {
  it.each(['sem14_scorer', 'ia4_avaliacao', 'temporada_feedback', undefined])('%s: texto e system byte a byte', async (taskKey) => {
    estado.resposta = `A ${EM} B`;
    const r = await callAI(system, user, { model: modelo }, 500, { locale: 'pt-BR', taskKey });
    expect(r).toBe(`A ${EM} B`);
    expect(textoDoSystem(estado.chamadas[0].system)).toBe(withLanguageInstruction(system, 'pt-BR'));
    expect(textoDoSystem(estado.chamadas[0].system)).not.toContain(REGRA_PONTUACAO_DA_SAIDA);
  });

  it('withLanguageInstruction sem a opção é idêntico ao de antes', () => {
    expect(withLanguageInstruction(system, 'pt-BR')).toBe(withLanguageInstruction(system, 'pt-BR', { semTravessao: false }));
    expect(withLanguageInstruction(system, 'pt-BR', { semTravessao: true })).toBe(`${withLanguageInstruction(system, 'pt-BR')}\n\n${REGRA_PONTUACAO_DA_SAIDA}`);
  });

  it('a regra de pontuação não traz o caractere que proíbe', () => {
    expect(REGRA_PONTUACAO_DA_SAIDA).not.toMatch(/[\u2013\u2014\u2015]/);
  });
});
