import { NextResponse } from 'next/server';
import { callAIChat } from '@/actions/ai-client';
import { requireAdmin } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';

// Modelos permitidos no simulador (ferramenta admin). Evita repassar um `model`
// arbitrário do client ao provedor (escolha do modelo mais caro = abuso de custo).
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-opus-4-7',
  'gemini-3.1-pro-preview', 'gemini-3-flash-preview',
  'gpt-5', 'gpt-5.1', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.5',
]);
const MAX_SYSTEM_CHARS = 16000;

export async function POST(req: Request) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;

    // Simulador é ferramenta de platform admin (app/admin/simulador). Antes
    // aceitava qualquer usuário autenticado → proxy de LLM aberto (abuso de $).
    const auth = await requireAdmin(req);
    if (auth instanceof Response) return auth;

    const limited = aiLimiter.check(req, auth.email);
    if (limited) return limited;

    const { system, messages, model } = await req.json();

    if (!messages?.length) {
      return NextResponse.json({ ok: false, error: 'Nenhuma mensagem fornecida' }, { status: 400 });
    }

    const safeModel = model && ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';
    const safeSystem = (typeof system === 'string' ? system : '').slice(0, MAX_SYSTEM_CHARS)
      || 'Voce e um assistente util.';

    const response = await callAIChat(
      safeSystem,
      messages,
      { model: safeModel },
      4096
    );

    return NextResponse.json({ ok: true, mensagem: response });
  } catch (err: any) {
    console.error('[chat-simulador]', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
