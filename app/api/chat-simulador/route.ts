import { NextResponse } from 'next/server';
import { callAIChat } from '@/actions/ai-client';
import { requireAdmin } from '@/lib/auth/request-context';
import { aiLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';

// Modelos permitidos no simulador (ferramenta admin). Evita repassar um `model`
// arbitrário do client ao provedor (escolha do modelo mais caro = abuso de custo).
const ALLOWED_MODELS = new Set([
  'claude-sonnet-5', 'claude-opus-5',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
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

    const limited = await aiLimiter.check(req, auth.email);
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
      4096,
      // Sem taskKey esta chamada some no `untagged` do ledger — e ela é
      // justamente a que roda com system e modelo escolhidos por quem usa o
      // simulador, ou seja, a de custo mais imprevisível do bloco.
      { taskKey: 'chat_simulador' },
    );

    return NextResponse.json({ ok: true, mensagem: response });
  } catch (err: any) {
    console.error('[chat-simulador]', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
