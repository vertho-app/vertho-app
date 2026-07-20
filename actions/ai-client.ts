'use server';

import Anthropic from '@anthropic-ai/sdk';
import { cookies } from 'next/headers';
import { AppLocale, defaultLocale } from '@/i18n/routing';
import { localeCookieName, localeLanguageName, resolveAppLocale } from '@/lib/i18n';
import { costFromTokens } from '@/lib/ia-cost-catalog';

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
  // Etiqueta da tarefa no ledger de IA (ia_usage_log.feature). Sem ela a
  // chamada é registrada como 'untagged' — adoção incremental pelos call-sites.
  taskKey?: string;
  // Atribuição opcional (para custo por empresa/colaborador no ledger).
  // Não obrigatório: o eixo primário do ledger é feature × modelo × tokens.
  empresaId?: string | null;
  colaboradorId?: string | null;
  // Origem da chamada no ledger (ia_usage_log.source). Default 'wrapper'.
  // O simulador de temporada marca 'simulator' para que as rodadas de medição
  // sejam isoláveis do tráfego real e o overhead do "aluno" seja netável.
  source?: string;
  // Sufixo VOLÁTIL do system (ex.: instrução do turno no chat socrático), que
  // muda a cada chamada. Fica DEPOIS do breakpoint de cache → o prefixo estável
  // (persona/régua/contexto) é cacheado e lido a 0,1× nos turnos seguintes,
  // enquanto o sufixo não quebra o cache. Prompt caching é output-neutral: a
  // resposta é byte-idêntica, só muda o billing. (Claude: 2 blocos de system;
  // Gemini/OpenAI: concatenado, sem cache.)
  systemSuffix?: string;
  // Parte VOLÁTIL de um chat multi-turn (grounding + instrução do turno) que
  // deve ficar FORA do prefixo cacheado. Com cacheHistory=true (Claude): migra
  // p/ a cauda da última mensagem do usuário e cache_control vai na última
  // assistant → cacheia system+histórico. Sem cacheHistory: volta pro system
  // (byte-idêntico). Gemini/OpenAI: sempre concatenado ao system.
  userSuffix?: string;
  // Liga o history caching (relocação do userSuffix + cache_control). Só Claude.
  // O caller gateia por flag (IA_CACHE_HISTORY) até a qualidade ser validada.
  cacheHistory?: boolean;
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
// falhar. Sobrescreva com a env AI_FALLBACK_MODEL (Vercel = gpt-5.4-2026-03-05, 20/07).
// ⚠️ NÃO é a mesma coisa que OPENAI_FALLBACK_MODEL: essa outra é knob EXCLUSIVA do
// Radar (lib/radar/*, default gpt-5.1) e NÃO afeta este fallback central. Manter
// os dois nomes separados de propósito — são fallbacks de subsistemas diferentes.
// Snapshot datado: o alias `gpt-5.4` deixou de existir para a chave OpenAI do
// projeto (model_not_found, medido 20/07/2026) — fallback em alias quebrado =
// fallback que nunca funciona. Alinhar a env AI_FALLBACK_MODEL no Vercel.
const AI_FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL || 'gpt-5.4-2026-03-05';

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
  // Gemini/OpenAI: sufixo volátil concatenado ao system (sem cache). Claude: via
  // options (2 blocos). Sem systemSuffix, comportamento inalterado.
  const sysForConcat = options.systemSuffix ? `${localizedSystem}\n\n${options.systemSuffix}` : localizedSystem;
  const dispatch = (m: string) => {
    if (m.startsWith('gemini')) return callGemini(sysForConcat, combinedUser, m, maxTokens, options);
    // kimi* (Moonshot) é OpenAI-compatible — mesmo caminho REST, base/chave próprias.
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.startsWith('kimi')) return callOpenAI(sysForConcat, combinedUser, m, maxTokens, options);
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

  // Gemini/OpenAI não têm caching por breakpoint: os sufixos voláteis
  // (systemSuffix e userSuffix) são concatenados ao system. Claude recebe os
  // sufixos em options e decide (2 blocos / history caching).
  const suffixConcat = [localizedSystem, options.systemSuffix, options.userSuffix].filter(Boolean).join('\n\n');
  const dispatch = (m: string) => {
    if (m.startsWith('gemini')) return callGeminiChat(suffixConcat, messages, m, maxTokens, options);
    if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.startsWith('kimi')) return callOpenAIChat(suffixConcat, messages, m, maxTokens, options);
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

// ── Ledger central de IA (Sprint 1) ─────────────────────────────────────────
// Toda chamada de IA que passa pelo wrapper grava usage REAL em ia_usage_log
// (mig 177): tokens in/out/cache, custo na tabela vigente, latência, provider.
// Cobertura por construção: o log vive AQUI, não nos call-sites. Falha de log
// nunca derruba a chamada (try/catch). `feature` = options.taskKey || 'untagged'.
// ⚠️ Batch API (lib/ai-batch) não passa por aqui — ledger do batch é fatia S1.2.

interface LedgerUsage {
  inTokens: number;
  outTokens: number;
  cacheRead?: number;
  cacheWrite?: number;
}

async function registrarUsoIA(
  provider: 'anthropic' | 'gemini' | 'openai' | 'kimi',
  model: string,
  u: LedgerUsage | null,
  latencyMs: number,
  options: AICallOptions,
) {
  try {
    if (!u) return;
    // Mantém a linha grep-ável [ai-cache] quando há cache (contrato da 1ª instrumentação).
    const read = u.cacheRead || 0, write = u.cacheWrite || 0;
    if (read || write) {
      const base = read + write + u.inTokens;
      console.log(`[ai-cache] ${model} hit=${base ? Math.round((read / base) * 100) : 0}% read=${read} write=${write} fresh=${u.inTokens}`);
    }
    const { createSupabaseAdmin } = await import('@/lib/supabase');
    await createSupabaseAdmin().from('ia_usage_log').insert({
      feature: options.taskKey || 'untagged',
      empresa_id: options.empresaId ?? null,
      colaborador_id: options.colaboradorId ?? null,
      provider,
      model,
      input_tokens: u.inTokens,
      output_tokens: u.outTokens,
      cache_read_tokens: read || null,
      cache_write_tokens: write || null,
      cost_usd: costFromTokens(model, u),
      latency_ms: latencyMs,
      status: 'ok',
      source: options.source || 'wrapper',
    });
  } catch (e: any) {
    console.warn('[ia-ledger] falha ao registrar uso:', e?.message);
  }
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

  // Com systemSuffix: 2 blocos — [estável cacheado] + [volátil sem cache]. O
  // prefixo estável (>1024 tok) é lido a 0,1× nas chamadas seguintes; o sufixo
  // (ex.: instrução do turno) não quebra o cache. Sem suffix: igual a antes.
  const systemBlock: any = options.systemSuffix
    ? [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: options.systemSuffix },
      ]
    : (typeof system === 'string' && system.length > 4000
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : system);

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

  const t0 = Date.now();
  if (maxTokens > 8192) {
    let text = '';
    const uso: LedgerUsage = { inTokens: 0, outTokens: 0, cacheRead: 0, cacheWrite: 0 };
    const stream = await client.messages.stream(params);
    for await (const event of stream as any) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        text += event.delta.text;
      } else if (event.type === 'message_start' && event.message?.usage) {
        uso.inTokens = event.message.usage.input_tokens || 0;
        uso.cacheRead = event.message.usage.cache_read_input_tokens || 0;
        uso.cacheWrite = event.message.usage.cache_creation_input_tokens || 0;
      } else if (event.type === 'message_delta' && event.usage?.output_tokens != null) {
        uso.outTokens = event.usage.output_tokens;
      }
    }
    await registrarUsoIA('anthropic', model, uso, Date.now() - t0, options);
    return text;
  }

  const response = await client.messages.create(params);
  const u = (response as any).usage;
  await registrarUsoIA('anthropic', model, u ? {
    inTokens: u.input_tokens || 0, outTokens: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
  } : null, Date.now() - t0, options);
  // Sempre extrai o bloco de texto (não content[0]): modelos com adaptive
  // thinking por padrão (Sonnet 5, Opus 4.8+) devolvem `thinking` em content[0].
  return extractClaudeText(response.content as any[]);
}

async function callClaudeChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: AI_TIMEOUT_MS, maxRetries: 1 });

  // HISTORY CACHING (S3, o lever medido como o maior): cacheia o prefixo
  // `system + histórico congelado`, lido a 0,1× nos turnos seguintes. O piloto
  // provou que o cache estava MORTO porque a parte VOLÁTIL (grounding + instrução
  // do turno) ficava DENTRO do prefixo cacheado e o envenenava. A correção:
  //  - a parte volátil vem em `options.userSuffix`;
  //  - com cacheHistory: migra p/ a cauda da ÚLTIMA mensagem do usuário, e o
  //    cache_control vai na ÚLTIMA mensagem ASSISTANT (congelada) → o prefixo não
  //    inclui o volátil e é lido a 0,1× no turno seguinte (validado por probe:
  //    turno 2 leu 2073 tok, turno 3 leu 2479);
  //  - sem cacheHistory: o userSuffix volta pro system (posição original) →
  //    saída BYTE-IDÊNTICA. É um behavior-change (posição system→mensagem), por
  //    isso atrás de flag no caller até validar qualidade (ia-sinais/goldens).
  const cacheHistory = options.cacheHistory === true;
  const sysText = options.userSuffix && !cacheHistory ? `${system}\n\n${options.userSuffix}` : system;

  // Bloco de system (com systemSuffix: 2 blocos estável/volátil — feature à parte).
  const systemBlock: any = options.systemSuffix
    ? [
        { type: 'text', text: sysText, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: options.systemSuffix },
      ]
    : (cacheHistory || (typeof sysText === 'string' && sysText.length > 4000)
        ? [{ type: 'text', text: sysText, cache_control: { type: 'ephemeral' } }]
        : sysText);

  const legacyHistoryCache = process.env.CHAT_HISTORY_CACHE === '1';
  let msgs: any = messages;
  if (cacheHistory) {
    const arr = messages.map((m) => ({ role: m.role, content: m.content as any }));
    // sufixo volátil (grounding+instrução) na cauda da última mensagem do usuário
    if (options.userSuffix) {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].role === 'user') { arr[i] = { role: 'user', content: `${arr[i].content}\n\n${options.userSuffix}` }; break; }
      }
    }
    // cache_control na última mensagem ASSISTANT (prefixo congelado, sem o volátil)
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].role === 'assistant') { arr[i] = { role: 'assistant', content: [{ type: 'text', text: arr[i].content, cache_control: { type: 'ephemeral' } }] }; break; }
    }
    msgs = arr;
  } else if (legacyHistoryCache && messages.length > 1) {
    msgs = messages.map((m, i) =>
      i === messages.length - 1
        ? { role: m.role, content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } }] }
        : m,
    );
  }

  const params: any = {
    model,
    max_tokens: maxTokens,
    system: systemBlock,
    messages: msgs,
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  };

  if (options.thinking) {
    const budgetTokens = Math.min(options.thinkingBudget || 32768, 65536);
    params.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    if (params.max_tokens < budgetTokens + 4096) {
      params.max_tokens = budgetTokens + 4096;
    }
  }

  const t0 = Date.now();
  if (maxTokens > 8192) {
    let text = '';
    const uso: LedgerUsage = { inTokens: 0, outTokens: 0, cacheRead: 0, cacheWrite: 0 };
    const stream = await client.messages.stream(params);
    for await (const event of stream as any) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        text += event.delta.text;
      } else if (event.type === 'message_start' && event.message?.usage) {
        uso.inTokens = event.message.usage.input_tokens || 0;
        uso.cacheRead = event.message.usage.cache_read_input_tokens || 0;
        uso.cacheWrite = event.message.usage.cache_creation_input_tokens || 0;
      } else if (event.type === 'message_delta' && event.usage?.output_tokens != null) {
        uso.outTokens = event.usage.output_tokens;
      }
    }
    await registrarUsoIA('anthropic', model, uso, Date.now() - t0, options);
    return text;
  }

  const response = await client.messages.create(params);
  const u = (response as any).usage;
  await registrarUsoIA('anthropic', model, u ? {
    inTokens: u.input_tokens || 0, outTokens: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
  } : null, Date.now() - t0, options);
  // Sempre extrai o bloco de texto (não content[0]): modelos com adaptive
  // thinking por padrão (Sonnet 5, Opus 4.8+) devolvem um bloco `thinking` em
  // content[0], sem `.text` → content[0].text seria undefined.
  return extractClaudeText(response.content as any[]);
}

// ── Gemini (Google AI REST) ─────────────────────────────────────────────────

async function callGemini(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const t0 = Date.now();

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
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const um = data.usageMetadata;
  await registrarUsoIA('gemini', model, um ? {
    inTokens: (um.promptTokenCount || 0) - (um.cachedContentTokenCount || 0),
    outTokens: um.candidatesTokenCount || 0,
    cacheRead: um.cachedContentTokenCount || 0,
  } : null, Date.now() - t0, options);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ── OpenAI (REST) ───────────────────────────────────────────────────────────

async function callOpenAI(
  system: string,
  user: string,
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  // kimi* (Moonshot) fala o MESMO protocolo chat/completions — só muda base + chave.
  const isKimi = model.startsWith('kimi');
  const apiKey = isKimi ? process.env.KIMI_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(isKimi ? 'KIMI_API_KEY not set' : 'OPENAI_API_KEY not set');
  const t0 = Date.now();

  const url = isKimi
    ? 'https://api.moonshot.ai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

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
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const uo = data.usage;
  const cachedIn = uo?.prompt_tokens_details?.cached_tokens || 0;
  await registrarUsoIA(isKimi ? 'kimi' : 'openai', model, uo ? {
    inTokens: (uo.prompt_tokens || 0) - cachedIn,
    outTokens: uo.completion_tokens || 0,
    cacheRead: cachedIn,
  } : null, Date.now() - t0, options);
  return data.choices?.[0]?.message?.content || '';
}

// ── Multi-turn variants ────────────────────────────────────────────────────

async function callGeminiChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const t0 = Date.now();

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
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const um = data.usageMetadata;
  await registrarUsoIA('gemini', model, um ? {
    inTokens: (um.promptTokenCount || 0) - (um.cachedContentTokenCount || 0),
    outTokens: um.candidatesTokenCount || 0,
    cacheRead: um.cachedContentTokenCount || 0,
  } : null, Date.now() - t0, options);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAIChat(
  system: string,
  messages: ChatMessage[],
  model: string,
  maxTokens: number,
  options: AICallOptions = {},
): Promise<string> {
  const isKimi = model.startsWith('kimi');
  const apiKey = isKimi ? process.env.KIMI_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error(isKimi ? 'KIMI_API_KEY not set' : 'OPENAI_API_KEY not set');
  const t0 = Date.now();

  const isNew = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');
  const body: any = {
    model,
    ...(isNew ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
    messages: [{ role: 'system', content: system }, ...messages],
  };

  const res = await fetch(isKimi ? 'https://api.moonshot.ai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? AI_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const uo = data.usage;
  const cachedIn = uo?.prompt_tokens_details?.cached_tokens || 0;
  await registrarUsoIA(isKimi ? 'kimi' : 'openai', model, uo ? {
    inTokens: (uo.prompt_tokens || 0) - cachedIn,
    outTokens: uo.completion_tokens || 0,
    cacheRead: cachedIn,
  } : null, Date.now() - t0, options);
  return data.choices?.[0]?.message?.content || '';
}
