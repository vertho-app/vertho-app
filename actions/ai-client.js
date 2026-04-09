'use server';

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Universal AI router — routes to Claude, Gemini, or OpenAI based on model prefix.
 * @param {string} system  - System prompt
 * @param {string} user    - User prompt
 * @param {object} aiConfig - { model?: string }
 * @param {number} maxTokens - max tokens (default 4096)
 * @returns {string} AI response text
 */
export async function callAI(system, user, aiConfig = {}, maxTokens = 4096, options = {}) {
  const model = aiConfig?.model || DEFAULT_MODEL;

  try {
    if (model.startsWith('gemini')) {
      return await callGemini(system, user, model, maxTokens);
    }
    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
      return await callOpenAI(system, user, model, maxTokens);
    }
    // Default: Claude (Anthropic)
    return await callClaude(system, user, model, maxTokens, options);
  } catch (err) {
    console.error(`[callAI] Error with model ${model}:`, err);
    throw new Error(`AI call failed (${model}): ${err.message}`);
  }
}

/**
 * Multi-turn AI call — sends full message history for conversational use.
 * @param {string} system - System prompt
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @param {object} aiConfig - { model?: string }
 * @param {number} maxTokens
 * @returns {string} AI response text
 */
export async function callAIChat(system, messages, aiConfig = {}, maxTokens = 4096, options = {}) {
  const model = aiConfig?.model || DEFAULT_MODEL;

  try {
    if (model.startsWith('gemini')) {
      return await callGeminiChat(system, messages, model, maxTokens);
    }
    if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
      return await callOpenAIChat(system, messages, model, maxTokens);
    }
    return await callClaudeChat(system, messages, model, maxTokens, options);
  } catch (err) {
    console.error(`[callAIChat] Error with model ${model}:`, err);
    throw new Error(`AI chat call failed (${model}): ${err.message}`);
  }
}

// ── Claude (Anthropic SDK) ──────────────────────────────────────────────────

/**
 * Extracts text from Claude response content blocks.
 * When extended thinking is enabled, response contains both 'thinking' and 'text' blocks.
 * We filter for type === 'text' to get the actual answer.
 */
function extractClaudeText(content) {
  const textBlock = content.find(block => block.type === 'text');
  return textBlock?.text || '';
}

async function callClaude(system, user, model, maxTokens, options = {}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };

  if (options.thinking) {
    const budgetTokens = Math.min(options.thinkingBudget || 32768, 65536);
    params.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    if (params.max_tokens < budgetTokens + 4096) {
      params.max_tokens = budgetTokens + 4096;
    }
  }

  // Usar streaming para requests com muitos tokens (Claude exige para >8192)
  if (maxTokens > 8192) {
    let text = '';
    const stream = await client.messages.stream(params);
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        text += event.delta.text;
      }
    }
    return text;
  }

  const response = await client.messages.create(params);
  return options.thinking
    ? extractClaudeText(response.content)
    : response.content[0].text;
}

async function callClaudeChat(system, messages, model, maxTokens, options = {}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages,
  };

  if (options.thinking) {
    const budgetTokens = Math.min(options.thinkingBudget || 32768, 65536);
    params.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    if (params.max_tokens < budgetTokens + 4096) {
      params.max_tokens = budgetTokens + 4096;
    }
  }

  // Streaming para requests longos
  if (maxTokens > 8192) {
    let text = '';
    const stream = await client.messages.stream(params);
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        text += event.delta.text;
      }
    }
    return text;
  }

  const response = await client.messages.create(params);
  return options.thinking
    ? extractClaudeText(response.content)
    : response.content[0].text;
}

// ── Gemini (Google AI REST) ─────────────────────────────────────────────────

async function callGemini(system, user, model, maxTokens) {
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

async function callOpenAI(system, user, model, maxTokens) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const url = 'https://api.openai.com/v1/chat/completions';

  // GPT 5.x usa max_completion_tokens; modelos antigos usam max_tokens
  const isNew = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');
  const body = {
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

async function callGeminiChat(system, messages, model, maxTokens) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map(m => ({
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

async function callOpenAIChat(system, messages, model, maxTokens) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const isNew = model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');
  const body = {
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
