import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/request-context';
import { getEffectivePermissionKeys } from '@/lib/permissions';
import { csrfCheck } from '@/lib/csrf';
import { createRateLimiter } from '@/lib/rate-limit';
import { comContexto } from '@/lib/execucao-contexto';
import { isIpiEmail, ipiRequestSchema } from '@/lib/ipi/contracts';
import { answerIpi } from '@/lib/ipi/answer';

export const runtime = 'nodejs';
export const maxDuration = 120;
const limiter = createRateLimiter({ maxRequests: 8, windowMs: 60_000 });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(req: Request) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    if (!auth.isPlatformAdmin || !isIpiEmail(auth.email)) return json({ error: 'Ipi está disponível apenas para a equipe Vertho autorizada.' }, 403);
    const permissions = await getEffectivePermissionKeys(auth);
    if (!permissions.has('admin.access')) return json({ error: 'Seu perfil não tem acesso ao Ipi.' }, 403);
    const limited = await limiter.check(req, `ipi:${auth.email}`);
    if (limited) return limited;
    if (Number(req.headers.get('content-length') || 0) > 80_000) return json({ error: 'Conversa muito longa. Inicie uma nova conversa.' }, 413);
    const body = await req.text();
    if (body.length > 80_000) return json({ error: 'Conversa muito longa. Inicie uma nova conversa.' }, 413);
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { return json({ error: 'Mensagem inválida.' }, 400); }
    const validated = ipiRequestSchema.safeParse(parsed);
    if (!validated.success) return json({ error: 'Confira a mensagem e a empresa selecionada.' }, 400);
    return await comContexto({ runtime: 'rota', orcamentoMs: 120_000, onde: '/api/ipi' }, async () => json(await answerIpi(auth, permissions, validated.data)));
  } catch {
    console.error('[ipi] Falha na consulta ou na geração da orientação.');
    return json({ error: 'Não consegui concluir a consulta. Tente novamente em instantes.' }, 503);
  }
}
