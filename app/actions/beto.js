'use server';

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SYSTEM_PROMPT = `Você é o BETO (Business Evolution & Talent Optimizer), um mentor de desenvolvimento profissional acolhedor e empático.

Regras:
- Responda em 3-5 frases no máximo
- Seja acolhedor, motivacional e prático
- Foque em desenvolvimento comportamental e profissional
- Dê dicas acionáveis quando possível
- Use linguagem simples e direta
- Nunca invente dados sobre o colaborador`;

export async function chatWithBeto(userMessage, history = []) {
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages,
  });

  return response.content[0].text;
}
