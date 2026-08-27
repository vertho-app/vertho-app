/**
 * MATRIZ DE CONTRATO: o que o wrapper manda para CADA modelo do dropdown.
 *
 * Por que este arquivo existe (26/08/2026): antes de aplicar as 43 trocas do
 * de-para, a pergunta é "o que muda por modelo/provider e o que quebra calado?".
 * O levantamento achou seis eixos que divergem entre famílias — e três deles
 * tinham **zero** teste:
 *
 *   · `cachedUserPrefix` (0 arquivos) — é o eixo em que o argumento de custo do
 *     bloco D2 inteiro se apoia ("92% do input do BETO é cache do Claude");
 *   · `truncou` (0 arquivos) — as quatro detecções de truncamento, uma por
 *     provider, cada uma lendo um campo de nome diferente;
 *   · corpo de request do Gemini (0 arquivos) — `generationConfig` nunca foi
 *     asserido por ninguém.
 *
 * A invariante que este arquivo trava é UMA, e vale para todo modelo:
 * **nada que o chamador passa pode se perder em silêncio.** O teto chega; o
 * prefixo cacheado chega (como breakpoint ou concatenado); o esforço chega OU
 * está declarado aqui como descartado, com o motivo.
 *
 * 🔑 A lista de modelos é DERIVADA de `MODELOS_DISPONIVEIS`. Modelo novo no
 * dropdown entra nesta matriz sozinho e falha até ser classificado — que é o
 * oposto de uma lista copiada, que envelhece calada.
 *
 * ⚠️ O que este arquivo NÃO prova: que a API do fornecedor aceita o corpo. Mock
 * testa o NOSSO código; se a Anthropic trocar o formato de `thinking` de novo,
 * tudo aqui segue verde. Isso é canário/probe, não `.test.ts` — está anotado no
 * fim do arquivo com o que falta cobrir por fora.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  claude: [] as any[],
  fetches: [] as Array<{ url: string; body: any }>,
  ledger: [] as any[],
  respostaFetch: null as any,
  usouStream: false,
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async (params: any) => {
        mocks.claude.push(params);
        return {
          content: [{ type: 'text', text: 'ok' }],
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: mocks.respostaFetch?.claudeStop ?? 'end_turn',
        };
      },
      // Acima de 8.192 o wrapper troca para STREAM — outro caminho de código,
      // com outra leitura de uso e outra detecção de truncamento. O stub cobre
      // os dois, senão metade dos eixos ficaria sem exercício justamente nas
      // tarefas caras (blueprint, módulo-base, IA4).
      stream: async (params: any) => {
        mocks.claude.push(params);
        mocks.usouStream = true;
        const stop = mocks.respostaFetch?.claudeStop ?? 'end_turn';
        return (async function* () {
          yield { type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
          yield { type: 'content_block_delta', delta: { text: 'ok' } };
          yield { type: 'message_delta', usage: { output_tokens: 5 }, delta: { stop_reason: stop } };
        })();
      },
    };
  },
}));

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: () => ({ insert: async (linha: any) => { mocks.ledger.push(linha); return {}; } }),
  }),
}));

import { callAI } from '@/actions/ai-client';
import { MODELOS_DISPONIVEIS, familiaDoModelo } from '@/lib/ai-tasks';

// ── Classificação dos modelos por DIALETO de request ───────────────────────
// Não é "família": `gpt-5.6-*`, `kimi-k3`, `qwen3.8-max` e `grok-4.6` são
// famílias diferentes que falam o MESMO dialeto (OpenAI). O que decide o corpo
// da request é o dialeto; o que decide o Dual-IA é a família.
const dialeto = (id: string): 'anthropic' | 'google' | 'openai' =>
  id.startsWith('claude') ? 'anthropic' : id.startsWith('gemini') ? 'google' : 'openai';

/** Claude que usa thinking adaptativo + output_config.effort (geração 5 / 4.7+). */
const claudeAdaptativo = (id: string) => /^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-7|opus-4-8)/.test(id);

const TODOS = MODELOS_DISPONIVEIS.map((m) => m.id);

function prepararFetch(payload: any, ok = true) {
  mocks.respostaFetch = payload;
  vi.stubGlobal('fetch', async (url: string, init: any) => {
    mocks.fetches.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') });
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as any;
  });
}

/** Resposta "feliz" no formato de cada dialeto, para a chamada não explodir. */
function respostaFeliz(d: 'google' | 'openai', extras: any = {}) {
  if (d === 'google') {
    return {
      candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: extras.finish ?? 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, cachedContentTokenCount: 0 },
    };
  }
  return {
    choices: [{ message: { content: 'ok' }, finish_reason: extras.finish ?? 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

/** Corpo efetivamente enviado, seja pelo SDK (Claude) ou por fetch. */
function corpoEnviado(id: string) {
  return dialeto(id) === 'anthropic'
    ? mocks.claude[mocks.claude.length - 1]
    : mocks.fetches[mocks.fetches.length - 1]?.body;
}

async function chamar(id: string, maxTokens: number, options: any = {}) {
  mocks.claude = []; mocks.fetches = []; mocks.ledger = []; mocks.usouStream = false;
  const d = dialeto(id);
  if (d !== 'anthropic') prepararFetch(respostaFeliz(d, options.__resposta ?? {}));
  const { __resposta, ...opts } = options;
  await callAI('SYSTEM', 'USER', { model: id }, maxTokens, { taskKey: 'teste_contrato', ...opts });
  return corpoEnviado(id);
}

beforeEach(() => {
  mocks.claude = []; mocks.fetches = []; mocks.ledger = []; mocks.respostaFetch = null; mocks.usouStream = false;
  process.env.ANTHROPIC_API_KEY = 'k';
  process.env.GEMINI_API_KEY = 'k';
  process.env.OPENAI_API_KEY = 'k';
  process.env.XAI_API_KEY = 'k';
  process.env.KIMI_API_KEY = 'k';
  process.env.QWEN_API_KEY = 'k';
  process.env.META_MODEL_API_KEY = 'k';
  vi.unstubAllGlobals();
});

describe('matriz de contrato · a lista é derivada, não copiada', () => {
  it('há modelos para percorrer (matriz vazia passaria em tudo)', () => {
    expect(TODOS.length).toBeGreaterThanOrEqual(10);
  });

  it('todo modelo do dropdown cai em exatamente um dialeto conhecido', () => {
    for (const id of TODOS) {
      expect(['anthropic', 'google', 'openai'], `modelo ${id} sem dialeto`).toContain(dialeto(id));
      expect(() => familiaDoModelo(id)).not.toThrow();
    }
  });
});

// ── EIXO 1 · TETO ──────────────────────────────────────────────────────────
// O mais grave dos eixos: teto que não chega não dá erro, dá resposta cortada
// (ou, em modelo que raciocina, resposta VAZIA depois de gastar o orçamento
// inteiro pensando). Foi exatamente o bug do qwen — `max_tokens` ignorado
// porque o modelo só lê `max_completion_tokens`.
describe('EIXO 1 · o teto chega em TODO modelo', () => {
  // ⚠️ A primeira versão deste teste aceitava `max_completion_tokens ?? max_tokens`
  // e SOBREVIVEU à mutação que faz `usaMaxCompletionTokens` devolver sempre
  // false — porque o corpo caía no outro nome e a asserção seguia passando.
  // Era a MESMA permissividade que produziu o bug original: o qwen recebia
  // `max_tokens`, que ele ignora, e rodava sem teto efetivo. Um teste que aceita
  // qualquer um dos dois nomes não pode detectar que o nome está errado.
  // Agora cada dialeto exige o SEU nome e proíbe o do vizinho.
  it.each(TODOS)('%s recebe o teto no parâmetro CERTO do seu dialeto', async (id) => {
    const corpo = await chamar(id, 4321);
    const d = dialeto(id);
    if (d === 'google') {
      expect(corpo?.generationConfig?.maxOutputTokens, `${id}: teto ausente em generationConfig`).toBe(4321);
      expect(corpo?.max_tokens).toBeUndefined();
      expect(corpo?.max_completion_tokens).toBeUndefined();
    } else if (d === 'openai') {
      // Todo OpenAI-compatible deste projeto lê `max_completion_tokens`; mandar
      // `max_tokens` é o caso em que o modelo roda SEM TETO EFETIVO.
      expect(corpo?.max_completion_tokens, `${id}: teto veio no nome errado — roda sem teto efetivo`).toBe(4321);
      expect(corpo?.max_tokens, `${id}: mandou max_tokens, que este dialeto ignora`).toBeUndefined();
    } else {
      expect(corpo?.max_tokens, `${id}: teto ausente`).toBe(4321);
      expect(corpo?.max_completion_tokens).toBeUndefined();
    }
  });

  it('nenhum modelo manda os DOIS nomes de teto (a API rejeita ou ignora um)', async () => {
    for (const id of TODOS.filter((m) => dialeto(m) === 'openai')) {
      const corpo = await chamar(id, 100);
      const dois = corpo?.max_tokens !== undefined && corpo?.max_completion_tokens !== undefined;
      expect(dois, `${id} mandou max_tokens E max_completion_tokens`).toBe(false);
    }
  });
});

// ── EIXO 2 · PROMPT CACHE ──────────────────────────────────────────────────
// Zero cobertura até hoje, e é o eixo em que a conta de custo do D2 se apoia.
// A regra: o cache é do CLAUDE. Nos outros, o wrapper CONCATENA o prefixo no
// user — o conteúdo continua chegando, mas passa a custar input CHEIO. O que
// NÃO pode acontecer, em nenhum dos dois casos, é o prefixo se PERDER.
describe('EIXO 2 · cachedUserPrefix chega em todo modelo (como cache ou concatenado)', () => {
  const PREFIXO = 'PREFIXO-ESTAVEL-'.repeat(400); // > 4000 chars: passa do piso de cache

  it.each(TODOS)('%s recebe o conteúdo do prefixo', async (id) => {
    const corpo = await chamar(id, 1000, { cachedUserPrefix: PREFIXO });
    const texto = JSON.stringify(corpo);
    expect(texto.includes('PREFIXO-ESTAVEL-'), `${id}: o cachedUserPrefix SUMIU do corpo`).toBe(true);
  });

  it.each(TODOS.filter((m) => dialeto(m) === 'anthropic'))(
    '%s marca o prefixo com cache_control (é onde o desconto de 0,1x nasce)',
    async (id) => {
      const corpo = await chamar(id, 1000, { cachedUserPrefix: PREFIXO });
      const blocos = Array.isArray(corpo?.messages?.[0]?.content) ? corpo.messages[0].content : [];
      const comCache = blocos.filter((b: any) => b?.cache_control);
      expect(comCache.length, `${id}: prefixo entrou sem cache_control — paga input cheio`).toBeGreaterThan(0);
    },
  );

  it.each(TODOS.filter((m) => dialeto(m) !== 'anthropic'))(
    '%s NÃO finge cache — o prefixo vai concatenado, e isso é o custo real da troca cross-família',
    async (id) => {
      const corpo = await chamar(id, 1000, { cachedUserPrefix: PREFIXO });
      expect(JSON.stringify(corpo)).not.toContain('cache_control');
    },
  );
});

// ── EIXO 3 · ESFORÇO E THINKING ────────────────────────────────────────────
// Aqui o teste não força um comportamento — ele DECLARA onde o parâmetro é
// descartado. Um parâmetro silenciosamente ignorado já custou caro nesta base:
// "opus-5 em high" rodou em esforço padrão e a comparação saiu com o rótulo
// errado. Declarar o descarte é o que impede a próxima leitura errada.
describe('EIXO 3 · reasoningEffort: onde chega e onde é DESCARTADO', () => {
  it.each(TODOS)('%s — o destino do effort é o declarado', async (id) => {
    const corpo = await chamar(id, 1000, { reasoningEffort: 'high' });
    const d = dialeto(id);
    if (d === 'openai') {
      expect(corpo?.reasoning_effort, `${id} deveria mandar reasoning_effort`).toBe('high');
    } else if (d === 'anthropic' && claudeAdaptativo(id)) {
      expect(corpo?.output_config?.effort, `${id} deveria mandar output_config.effort`).toBe('high');
    } else {
      // 🔴 DESCARTE DECLARADO: claude-sonnet-4-6 e todo gemini ignoram o effort.
      // Mover para cá uma task que pede `high` NÃO é troca neutra — é perder o
      // parâmetro sem nenhum sinal.
      expect(corpo?.reasoning_effort, `${id}: effort apareceu onde não deveria`).toBeUndefined();
      expect(corpo?.output_config, `${id}: output_config apareceu onde não deveria`).toBeUndefined();
    }
  });

  it.each(TODOS)('%s — thinking só existe no dialeto que o entende', async (id) => {
    const corpo = await chamar(id, 40000, { thinking: true });
    const d = dialeto(id);
    if (d === 'anthropic' && claudeAdaptativo(id)) {
      expect(corpo?.thinking).toEqual({ type: 'adaptive' });
    } else if (d === 'anthropic') {
      expect(corpo?.thinking?.type).toBe('enabled');
      expect(corpo?.thinking?.budget_tokens).toBeGreaterThan(0);
    } else {
      expect(corpo?.thinking, `${id}: thinking vazou para um dialeto que não o aceita`).toBeUndefined();
    }
  });

  it('geração 5 não recebe temperature nem top_p/top_k (a API devolve 400)', async () => {
    for (const id of TODOS.filter((m) => dialeto(m) === 'anthropic' && claudeAdaptativo(m))) {
      const corpo = await chamar(id, 1000, { temperature: 0.7 });
      expect(corpo?.temperature, `${id} mandou temperature — 400 garantido`).toBeUndefined();
      expect(corpo?.top_p).toBeUndefined();
      expect(corpo?.top_k).toBeUndefined();
    }
  });

  it('🔴 o Gemini DESCARTA temperature — determinismo não sobrevive à troca', async () => {
    for (const id of TODOS.filter((m) => dialeto(m) === 'google')) {
      const corpo = await chamar(id, 1000, { temperature: 0 });
      expect(corpo?.generationConfig?.temperature).toBeUndefined();
      expect(corpo?.temperature).toBeUndefined();
    }
  });
});

// ── EIXO 4 · TRUNCAMENTO ───────────────────────────────────────────────────
// Cada provider avisa com um campo de nome diferente. Se a leitura estiver
// errada, o ledger carimba `ok` numa resposta cortada — e o p95 do auditor de
// tetos passa a medir uma distribuição censurada que ninguém sabe que é.
describe('EIXO 4 · truncamento vira status no ledger, em todo dialeto', () => {
  it('OpenAI-compat: finish_reason=length → truncado', async () => {
    const id = TODOS.find((m) => dialeto(m) === 'openai')!;
    mocks.claude = []; mocks.fetches = []; mocks.ledger = [];
    prepararFetch(respostaFeliz('openai', { finish: 'length' }));
    await callAI('S', 'U', { model: id }, 100, { taskKey: 't' });
    expect(mocks.ledger.at(-1)?.status, `${id}: truncamento não virou status`).toBe('truncado');
  });

  it('Gemini: finishReason=MAX_TOKENS → truncado', async () => {
    const id = TODOS.find((m) => dialeto(m) === 'google')!;
    mocks.claude = []; mocks.fetches = []; mocks.ledger = [];
    prepararFetch(respostaFeliz('google', { finish: 'MAX_TOKENS' }));
    await callAI('S', 'U', { model: id }, 100, { taskKey: 't' });
    expect(mocks.ledger.at(-1)?.status, `${id}: truncamento não virou status`).toBe('truncado');
  });

  it('Claude: stop_reason=max_tokens → truncado', async () => {
    const id = TODOS.find((m) => dialeto(m) === 'anthropic')!;
    mocks.claude = []; mocks.fetches = []; mocks.ledger = [];
    mocks.respostaFetch = { claudeStop: 'max_tokens' };
    await callAI('S', 'U', { model: id }, 100, { taskKey: 't' });
    expect(mocks.ledger.at(-1)?.status, `${id}: truncamento não virou status`).toBe('truncado');
  });

  it('resposta normal NÃO é marcada truncada (senão o status não discrimina nada)', async () => {
    const id = TODOS.find((m) => dialeto(m) === 'openai')!;
    mocks.claude = []; mocks.fetches = []; mocks.ledger = [];
    prepararFetch(respostaFeliz('openai'));
    await callAI('S', 'U', { model: id }, 100, { taskKey: 't' });
    expect(mocks.ledger.at(-1)?.status).toBe('ok');
  });
});

// ── EIXO 5 · 200 COM CONTEÚDO VAZIO ────────────────────────────────────────
// "200 vazia fura fail-loud" é regra escrita da casa (FMEA §F-I17). Ela está
// implementada no caminho OpenAI-compat e NÃO no do Gemini — que devolve `''`.
// Este bloco documenta a assimetria em vez de escondê-la: seis prompts do bloco
// F2 estão propostos para o Gemini, e é neles que ela passaria a valer.
describe('EIXO 5 · resposta 200 vazia', () => {
  it('OpenAI-compat FALHA ALTO quando gastou tokens e devolveu vazio', async () => {
    const id = TODOS.find((m) => dialeto(m) === 'openai')!;
    mocks.claude = []; mocks.fetches = []; mocks.ledger = [];
    prepararFetch({
      choices: [{ message: { content: '' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 10, completion_tokens: 3997, completion_tokens_details: { reasoning_tokens: 3997 } },
    });
    await expect(callAI('S', 'U', { model: id }, 4000, { taskKey: 't' }))
      .rejects.toThrow(/conteúdo VAZIO/);
  });

  it('🔴 LACUNA DECLARADA: o Gemini devolve string vazia em silêncio', async () => {
    const id = TODOS.find((m) => dialeto(m) === 'google')!;
    mocks.claude = []; mocks.fetches = []; mocks.ledger = [];
    prepararFetch({
      candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'MAX_TOKENS' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 900, cachedContentTokenCount: 0 },
    });
    const r = await callAI('S', 'U', { model: id }, 1000, { taskKey: 't' });
    // Este `expect` descreve o comportamento ATUAL, e é intencional que ele
    // esteja aqui: quando alguém levar `conteudoOuFalhaAlto` para o ramo do
    // Gemini, ESTE teste falha e obriga a atualizar a nota acima. Enquanto
    // falhar não for verdade, a lacuna fica visível em vez de esquecida.
    expect(r).toBe('');
    expect(mocks.ledger.at(-1)?.status).toBe('truncado');
  });
});

// ── EIXO 6 · O TETO TROCA O CAMINHO DE CÓDIGO (achado ao escrever este arquivo) ──
// `maxTokens > 8192` faz o ramo Claude sair de `messages.create` para
// `messages.stream` — outro caminho, com outra leitura de uso (`message_start`
// / `message_delta` em vez de `response.usage`) e outra detecção de truncamento
// (`event.delta.stop_reason` em vez de `response.stop_reason`).
//
// 🔴 Isso NÃO estava no inventário, e é a fase 1 do plano que o dispara: das
// sete subidas de teto propostas, DUAS cruzam o limiar —
//   ia3_cenarios       6.144 → 9.000   (create → stream)
//   acumulada_primaria 8.000 → 10.000  (create → stream)
// As outras cinco (temporada_extracao, blueprint_audit, ia3_check,
// conteudo_podcast, beto) ficam abaixo e não mudam de caminho.
//
// "Subir o teto" parece ajuste de número e é, nesses dois casos, troca de
// caminho de código. Este bloco garante que os dois caminhos carregam o mesmo
// contrato — senão a fase 1 estrearia o ramo stream sem ninguém ter olhado.
describe('EIXO 6 · limiar de streaming do Claude (8.192)', () => {
  const CLAUDES = TODOS.filter((m) => dialeto(m) === 'anthropic');

  it.each(CLAUDES)('%s: teto 8.192 usa create; 8.193 usa stream', async (id) => {
    await chamar(id, 8192);
    expect(mocks.usouStream, `${id}: 8.192 deveria ir por create`).toBe(false);
    await chamar(id, 8193);
    expect(mocks.usouStream, `${id}: 8.193 deveria ir por stream`).toBe(true);
  });

  it.each(CLAUDES)('%s: o corpo é o MESMO dos dois lados do limiar', async (id) => {
    const abaixo = await chamar(id, 8192, { reasoningEffort: 'high' });
    const acima = await chamar(id, 8193, { reasoningEffort: 'high' });
    // Só o teto muda; thinking, effort e sampling têm de ser idênticos.
    expect({ ...acima, max_tokens: 0 }).toEqual({ ...abaixo, max_tokens: 0 });
  });

  it.each(CLAUDES)('%s: o ramo STREAM também registra uso no ledger', async (id) => {
    await chamar(id, 20000);
    const linha = mocks.ledger.at(-1);
    expect(linha, `${id}: chamada por stream não registrou no ledger`).toBeTruthy();
    expect(linha?.output_tokens ?? linha?.outTokens ?? 0).toBeGreaterThan(0);
  });

  it.each(CLAUDES)('%s: o ramo STREAM detecta truncamento pelo delta', async (id) => {
    mocks.claude = []; mocks.fetches = []; mocks.ledger = []; mocks.usouStream = false;
    mocks.respostaFetch = { claudeStop: 'max_tokens' };
    await callAI('S', 'U', { model: id }, 20000, { taskKey: 't' });
    expect(mocks.usouStream).toBe(true);
    expect(mocks.ledger.at(-1)?.status, `${id}: truncamento no stream passou como ok`).toBe('truncado');
  });
});
