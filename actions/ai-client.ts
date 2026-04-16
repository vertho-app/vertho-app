'use server';

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export interface AIConfig {
  model?: string;
}

export interface AICallOptions {
  temperature?: number;
  thinking?: boolean;
  thinkingBudget?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Universal AI router — routes to Claude, Gemini, or OpenAI based on model prefix.
 */
export async function callAI(
  system: string,
  user: string,
  aiConfig: AIConfig = {},
  maxTokens: number = 4096,
  options: AICallOptions = {},
): Promise<string> {
  const model = aiConfig?.model || DEFAULT_MODEL;

  try {
    if (model.startsWith('gemini')) {
      return await callGemini(system, user, model, maxTokens);
    }
    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
      return await callOpenAI(system, user, model, maxTokens);
    }
    return await callClaude(system, user, model, maxTokens, options);
  } catch (err: any) {
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

  try {
    if (model.startsWith('gemini')) {
      return await callGeminiChat(system, messages, model, maxTokens);
    }
    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
      return await callOpenAIChat(system, messages, model, maxTokens);
    }
    return await callClaudeChat(system, messages, model, maxTokens, options);
  } catch (err: any) {
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
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemBlock: any = typeof system === 'string' && system.length > 4000
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;

  const params: any = {
    model,
    max_tokens: maxTokens,
    system: systemBlock,
    messages: [{ role: 'user', content: user }],
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
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}
