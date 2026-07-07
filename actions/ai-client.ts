'use server';

import Anthropic from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';
import { AppLocale, defaultLocale } from '@/i18n/routing';
import { localeCookieName, localeLanguageName, resolveAppLocale } from '@/lib/i18n';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Timeout por chamada de IA. Sem isto, uma request que "pendura" (rede/modelo)
// bloqueia a função até o maxDuration da rota (até 300s), travando lotes
// inteiros. 120s cobre gerações longas (IA3 ~60-90s) e ainda deixa margem p/
// retry dentro do limite da rota.
const AI_TIMEOUT_MS = 120000;

export interface AIConfig {
  model?: string;
}

export interface AICallOptions {
  temperature?: number;
  thinking?: boolean;
  thinkingBudget?: number;
  locale?: AppLocale;
  // Override do timeout/maxRetries do SDK (Claude) por chamada. Chamadas densas
  // legítimas (segmentação/autoria de módulo) precisam de mais que os 120s
  // default sem disparar o retry do SDK (que dobra o tempo e estoura a rota).
  timeoutMs?: number;
  maxRetries?: number;
  // Prefixo GRANDE e ESTÁVEL do user message (ex.: régua + cenário + rubrica,
  // idênticos entre os colaboradores do MESMO lote) — vira um bloco com
  // `cache_control` próprio no Claude (2º breakpoint, além do system). Em lote
  // (ex.: IA4 sobre N colabs da mesma competência) as chamadas seguintes em 5min
  // pagam ~10% nesse trecho. Gemini/OpenAI: concatenado ao user (sem cache).
  cachedUserPrefix?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function resolveAILocale(explicitLocale?: AppLocale): Promise<AppLocale> {
  if (explicitLocale) return explicitLocale;

  try {
    const store = await cookies();
    return resolveAppLocale(store.get(localeCookieName)?.value);
  } catch {
    return defaultLocale;
  }
}

function withLanguageInstruction(system: string, locale: AppLocale): string {
  const language = localeLanguageName(locale);

  return `${system}

═══ IDIOMA DA EXPERIÊNCIA ═══
Use ${language} em todo texto destinado ao usuário final.
Mantenha nomes de campos JSON, enums técnicos, códigos e identificadores exatamente como especificados no prompt.
Se o prompt exigir JSON, retorne JSON válido e traduza apenas os valores textuais voltados ao usuário.`;
}

/**
 * Universal AI router — routes to Claude, Gemini, or OpenAI based on model prefix.
 */
// Erro transitório de provedor (sobrecarga/limite) — vale retry com backoff.
// Ex.: Anthropic 529 overloaded_error, 429 rate_limit, 503.
function isTransientAIError(e: any): boolean {
  const s = e?.status ?? e?.statusCode;
  const m = String(e?.message || e || '').toLowerCase();
  return s === 429 || s === 503 || s === 529
    || /overloaded|rate.?limit|too many requests|temporarily unavailable|\b(429|503|529)\b/.test(m);
}

/** Reexecuta `fn` com backoff exponencial + jitter em erros transitórios. */
async function withAIRetry<T>(fn: () => Promise<T>, label: string, max = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      if (i >= max || !isTransientAIError(e)) throw e;
      const wait = Math.min(20000, 1500 * 2 ** i) + Math.floor(Math.random() * 500);
      console.warn(`[callAI] ${label} transitório (${e?.status || ''} ${String(e?.message || '').slice(0, 60)}) — retry ${i + 1}/${max} em ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Fallback de PROVEDOR quando o primário (Claude) fica sobrecarregado mesmo após
// retries (ex.: outage de 529 da Anthropic). Gera por GPT-5.4 (OpenAI) em vez de
// falhar. Sobrescreva com a env AI_FALLBACK_MODEL.
const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || 'gpt-5.4';

export async function callAI(
  system: string,
  user: string,
  aiConfig: AIConfig = {},
  maxTokens: number = 4096,
  options: AICallOptions = {},
): Promise<string> {
  const model = aiConfig?.model || DEFAULT_MODEL;
  const locale = await resolveAILocale(options.locale);
  const localizedSystem = withLanguageInstruction(system, locale);

  // Providers sem prompt caching (Gemini/OpenAI) recebem o prefixo concatenado.
  const combinedUser = options.cachedUserPrefix ? `${options.cachedUserPrefix}\n\n${user}` : user;
  const dispatch = (m: string) => {
    if (m.startsWith('gemini')) return callGemini(localizedSystem, combinedUser, m, maxTokens);
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return callOpenAI(localizedSystem, combinedUser, m, maxTokens);
    return callClaude(localizedSystem, user, m, maxTokens, options);
  };

  try {
    return await withAIRetry(() => dispatch(model), model);
  } catch (err: any) {
    // Primário sobrecarregado após retries → fallback de provedor (Claude → Gemini).
    if (isTransientAIError(err) && !model.startsWith('gemini') && AI_FALLBACK_MODEL && AI_FALLBACK_MODEL !== model) {
      console.warn(`[callAI] ${model} sobrecarregado após retries — fallback p/ ${AI_FALLBACK_MODEL}`);
      try {
        return await withAIRetry(() => dispatch(AI_FALLBACK_MODEL), AI_FALLBACK_MODEL, 2);
      } catch (e2: any) {
        console.error(`[callAI] fallback ${AI_FALLBACK_MODEL} também falhou:`, e2?.message ?? e2);
      }
    }
    console.error(`[callAI] Error with model ${model}:`, err);
    throw new Error(`AI call failed (${model}): ${err?.message ?? err}`);
  }
}

/**
 * Multi-turn AI call — sends full message history for conversational use.
 */
export async function callAIChat(
  system: string,
  messages: ChatMessage[],
  aiConfig: AIConfig = {},
  maxTokens: number = 4096,
  options: AICallOptions = {},
): Promise<string> {
  const model = aiConfig?.model || DEFAULT_MODEL;
  const locale = await resolveAILocale(options.locale);
  const localizedSystem = withLanguageInstruction(system, locale);

  const dispatch = (m: string) => {
    if (m.startsWith('gemini')) return callGeminiChat(localizedSystem, messages, m, maxTokens);
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return callOpenAIChat(localizedSystem, messages, m, maxTokens);
    return callClaudeChat(localizedSystem, messages, m, maxTokens, options);
  };

  try {
    return await withAIRetry(() => dispatch(model), model);
  } catch (err: any) {
    if (isTransientAIError(err) && !model.startsWith('gemini') && AI_FALLBACK_MODEL && AI_FALLBACK_MODEL !== model) {
      console.warn(`[callAIChat] ${model} sobrecarregado após retries — fallback p/ ${AI_FALLBACK_MODEL}`);
      try {
        return await withAIRetry(() => dispatch(AI_FALLBACK_MODEL), AI_FALLBACK_MODEL, 2);
      } catch (e2: any) {
        console.error(`[callAIChat] fallback ${AI_FALLBACK_MODEL} também falhou:`, e2?.message ?? e2);
      }
    }
    console.error(`[callAIChat] Error with model ${model}:`, err);
    throw new Error(`AI chat call failed (${model}): ${err?.message ?? err}`);
  }
}

// ── Claude (Anthropic SDK) ──────────────────────────────────────────────────

/**
 * Extracts text from Claude response content blocks.
 * When extended thinking is enabled, response contains both 'thinking' and 'text' blocks.
 */
function extractClaudeText(content: any[]): string {
  const textBlock = content.find((block) => block.type === 'text');
  return textBlock?.text || '';
}

async function callClaude(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: options.timeoutMs ?? AI_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? 1,
  });

  const systemBlock: any = typeof system === 'string' && system.length > 4000
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;

  // 2º breakpoint: prefixo estável do user (régua/cenário) num bloco próprio com
  // cache_control quando vale a pena (> ~1024 tokens ≈ 4000 chars). Abaixo disso
  // o cache é no-op → só concatena (evita write inútil).
  const userContent: any = options.cachedUserPrefix && options.cachedUserPrefix.length > 4000
    ? [
        { type: 'text', text: options.cachedUserPrefix, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: user },
      ]
    : (options.cachedUserPrefix ? `${options.cachedUserPrefix}\n\n${user}` : user);

  const params: any = {
    model,
    max_tokens: maxTokens,
    system: systemBlock,
    messages: [{ role: 'user', content: userContent }],
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  };

  if (options.thinking) {
    const budgetTokens = Math.min(options.thinkingBudget || 32768, 65536);
    params.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    if (params.max_tokens < budgetTokens + 4096) {
      params.max_tokens = budgetTokens + 4096;
    }
  }

  if (maxTokens > 8192) {
    let text = '';
    const stream = await client.messages.stream(params);
    for await (const event of stream as any) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        text += event.delta.text;
      }
    }
    return text;
  }

  const response = await client.messages.create(params);
  return options.thinking
    ? extractClaudeText(response.content as any[])
    : (response.content as any[])[0].text;
}

async function callClaudeChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 1 });

  // Prompt Caching: se system é grande (>1024 tokens ≈ 4000 chars), marca como
  // cache_control ephemeral. Chamadas subsequentes em 5 min com mesmo system
  // pagam só 10% do custo normal no cached tier.
  const systemBlock: any = typeof system === 'string' && system.length > 4000
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;

  const params: any = {
    model,
    max_tokens: maxTokens,
    system: systemBlock,
    messages,
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  };

  if (options.thinking) {
    const budgetTokens = Math.min(options.thinkingBudget || 32768, 65536);
    params.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    if (params.max_tokens < budgetTokens + 4096) {
      params.max_tokens = budgetTokens + 4096;
    }
  }

  if (maxTokens > 8192) {
    let text = '';
    const stream = await client.messages.stream(params);
    for await (const event of stream as any) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        text += event.delta.text;
      }
    }
    return text;
  }

  const response = await client.messages.create(params);
  return options.thinking
    ? extractClaudeText(response.content as any[])
    : (response.content as any[])[0].text;
}

// ── Gemini (Google AI REST) ─────────────────────────────────────────────────

async function callGemini(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── OpenAI (REST) ───────────────────────────────────────────────────────────

async function callOpenAI(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const url = 'https://api.openai.com/v1/chat/completions';

  const isNew = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');
  const body: any = {
    model,
    ...(isNew ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Multi-turn variants ────────────────────────────────────────────────────

async function callGeminiChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAIChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const isNew = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');
  const body: any = {
    model,
    ...(isNew ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    messages: [{ role: 'system', content: system }, ...messages],
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
