import { NextResponse } from 'next/server';
import { callAIChat } from '@/actions/ai-client';

export async function POST(req) {
  try {
    const { system, messages, model } = await req.json();

    if (!messages?.length) {
      return NextResponse.json({ ok: false, error: 'Nenhuma mensagem fornecida' }, { status: 400 });
    }

    const response = await callAIChat(
      system || 'Voce e um assistente util.',
      messages,
      { model: model || 'claude-sonnet-4-6' },
      4096
    );

    return NextResponse.json({ ok: true, mensagem: response });
  } catch (err) {
    console.error('[chat-simulador]', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
