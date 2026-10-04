import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Onda E (04/10/2026), os prompts recebem o idioma de quem LÊ.
 *
 * Três peças vivem em `lib/ai-batch.ts` e `lib/ai-language.ts`, e as três existem porque um lote junta
 * pessoas de idiomas diferentes e porque o código confere por NOME o que o modelo devolve:
 *
 *  1. `BatchReq.locale`: o idioma de UMA request do lote (Claude e OpenAI), que vence o `opts.locale` do lote,
 *     que vence o padrão. Antes o lote inteiro saía num idioma só (pt-BR), e o fallback síncrono, sem cookie,
 *     também;
 *  2. o coletor (`createAIBatchCollector`) honra `options.locale` do call-site nos DOIS caminhos (síncrono e
 *     lote). Honrar só no síncrono seria consertar o gêmeo que não roda (F-I14);
 *  3. a regra "não traduza os nomes dos dados" só entra fora do idioma padrão: o PDI casa a competência pelo
 *     nome, o blueprint aplica o nível real pelo nome e o scorer casa o descritor pelo nome. No idioma padrão o
 *     prompt segue byte a byte como era (o cache do prefixo não muda).
 */

const chamadas = vi.hoisted(() => ({ lotes: [] as any[] }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 }, stop_reason: 'end_turn' }),
      batches: {
        create: async (params: any) => { chamadas.lotes.push(params); return { id: `batch_${chamadas.lotes.length}` }; },
        retrieve: async () => ({ processing_status: 'ended', request_counts: { succeeded: 1 } }),
        results: async (id: string) => (async function* () {
          const ultimo = chamadas.lotes[Number(String(id).replace('batch_', '')) - 1];
          for (const r of ultimo?.requests ?? []) {
            yield { custom_id: r.custom_id, result: { type: 'succeeded', message: { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } } } };
          }
        })(),
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

import { createAIBatchCollector, createClaudeBatch, createOpenAIBatch } from '@/lib/ai-batch';
import { REDACAO_SEM_GENERO, REGRA_NOMES_DOS_DADOS, withLanguageInstruction } from '@/lib/ai-language';

const modelo = 'claude-sonnet-4-6';
const system = 'Escreva o plano de desenvolvimento. Retorne JSON.';
const user = 'Competência: Escuta ativa.';
const textoDoSystem = (s: any): string => typeof s === 'string' ? s : s.map((b: any) => b.text).join('\n\n');

beforeEach(() => {
  chamadas.lotes = [];
  vi.stubEnv('ANTHROPIC_API_KEY', 'teste');
  vi.stubEnv('OPENAI_API_KEY', 'teste');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('a regra dos nomes dos dados: só fora do idioma padrão', () => {
  it('pt-BR continua byte a byte como era: sem a regra nova', () => {
    const esperado = `${system}

═══ IDIOMA DA EXPERIÊNCIA ═══
Use português do Brasil em todo texto destinado ao usuário final.
Mantenha nomes de campos JSON, enums técnicos, códigos e identificadores exatamente como especificados no prompt.
Se o prompt exigir JSON, retorne JSON válido e traduza apenas os valores textuais voltados ao usuário.

${REDACAO_SEM_GENERO}`;
    expect(withLanguageInstruction(system, 'pt-BR')).toBe(esperado);
    expect(withLanguageInstruction(system, 'pt-BR')).not.toContain(REGRA_NOMES_DOS_DADOS);
  });

  it.each(['pt-PT', 'es-ES', 'en-US'] as const)('%s ganha a regra, logo depois da instrução de JSON', (locale) => {
    const prompt = withLanguageInstruction(system, locale);
    expect(prompt).toContain(REGRA_NOMES_DOS_DADOS);
    expect(prompt.indexOf('traduza apenas os valores textuais')).toBeLessThan(prompt.indexOf(REGRA_NOMES_DOS_DADOS));
    expect(prompt.indexOf(REGRA_NOMES_DOS_DADOS)).toBeLessThan(prompt.indexOf('REDAÇÃO DIRIGIDA À PESSOA'));
  });

  it('a regra diz POR QUE: o sistema confere por nome', () => {
    expect(REGRA_NOMES_DOS_DADOS).toContain('sem tradução');
    expect(REGRA_NOMES_DOS_DADOS).toContain('por nome');
  });
});

describe('lote Claude: o idioma de cada request', () => {
  it('cada request leva o idioma dela; sem idioma, o do lote; sem os dois, pt-BR', async () => {
    await createClaudeBatch([
      { customId: 'a', system, user, model: modelo, maxTokens: 1000, locale: 'en-US' },
      { customId: 'b', system, user, model: modelo, maxTokens: 1000, locale: 'pt-PT' },
      { customId: 'c', system, user, model: modelo, maxTokens: 1000 },
    ], { locale: 'es-ES' });
    const [a, b, c] = chamadas.lotes[0].requests.map((r: any) => textoDoSystem(r.params.system));
    expect(a).toBe(withLanguageInstruction(system, 'en-US'));
    expect(b).toBe(withLanguageInstruction(system, 'pt-PT'));
    expect(c).toBe(withLanguageInstruction(system, 'es-ES'));
  });

  it('sem idioma na request nem no lote, pt-BR (como sempre foi)', async () => {
    await createClaudeBatch([{ customId: 'a', system, user, model: modelo, maxTokens: 1000 }]);
    expect(textoDoSystem(chamadas.lotes[0].requests[0].params.system)).toBe(withLanguageInstruction(system, 'pt-BR'));
  });
});

describe('lote OpenAI: o idioma de cada request', () => {
  it('o JSONL leva o idioma de cada linha', async () => {
    let jsonl = '';
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
      if (String(url).endsWith('/files')) {
        jsonl = await init.body.get('file').text();
        return new Response(JSON.stringify({ id: 'file_teste' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'batch_teste' }), { status: 200 });
    }));
    await createOpenAIBatch([
      { customId: 'a', system, user, model: 'gpt-5.4', maxTokens: 1000, locale: 'en-US' },
      { customId: 'b', system, user, model: 'gpt-5.4', maxTokens: 1000 },
    ], { locale: 'es-ES' });
    const linhas = jsonl.split('\n').map((l) => JSON.parse(l));
    expect(linhas[0].body.messages[0].content).toBe(withLanguageInstruction(system, 'en-US'));
    expect(linhas[1].body.messages[0].content).toBe(withLanguageInstruction(system, 'es-ES'));
  });
});

describe('coletor de lote: `options.locale` do call-site vale nos dois caminhos', () => {
  it('a request que vai ao lote leva o idioma do call-site; a que não pede fica no do coletor', async () => {
    const { run } = createAIBatchCollector(modelo, { windowMs: 1, pollMs: 1, locale: 'es-ES' });
    await Promise.all([
      run(system, user, { model: modelo }, 1000, { taskKey: 'x', locale: 'en-US' }),
      run(system, user, { model: modelo }, 1000, { taskKey: 'y' }),
    ]);
    expect(chamadas.lotes).toHaveLength(1);
    const enviados = chamadas.lotes[0].requests.map((r: any) => textoDoSystem(r.params.system));
    expect(enviados).toContain(withLanguageInstruction(system, 'en-US'));
    expect(enviados).toContain(withLanguageInstruction(system, 'es-ES'));
  });
});
