import { NextResponse } from 'next/server';
import { z } from 'zod';
import { csrfCheck } from '@/lib/csrf';
import { aiLimiter } from '@/lib/rate-limit';
import { contextoRecepcao, RecepcaoError } from '@/lib/recepcao/access';
import { comandoSchema } from '@/lib/recepcao/schema';
import { consultar, executar } from '@/lib/recepcao/service';
import { comContexto } from '@/lib/execucao-contexto';
import { requireUser } from '@/lib/auth/request-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
function falha(e: unknown) {
  if (e instanceof RecepcaoError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError || e instanceof SyntaxError) return json({ error: 'Dados do treino inválidos. Atualize a página e tente novamente.' }, 400);
  console.error('[recepcao] erro interno', e instanceof Error ? e.name : 'erro');
  return json({ error: 'O treino está indisponível. Tente novamente.' }, 500);
}
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req); if (auth instanceof Response) return auth;
    const q = new URL(req.url).searchParams;
    const empresa = q.get('empresaId'), id = q.get('sessaoId');
    if (empresa) z.string().uuid().parse(empresa);
    if (id) z.string().uuid().parse(id);
    const ctx = await contextoRecepcao(req, empresa, false, auth);
    if (ctx instanceof Response) return ctx;
    return json(await consultar(ctx, id));
  } catch (e) { return falha(e); }
}
export async function POST(req: Request) {
  return comContexto({ runtime: 'rota', orcamentoMs: 300000, onde: 'api/recepcao' }, async () => {
    try {
      const csrf = csrfCheck(req); if (csrf) return csrf;
      const auth = await requireUser(req); if (auth instanceof Response) return auth;
      const raw = await req.text();
      if (raw.length > 12000) return json({ error: 'Mensagem muito longa.' }, 413);
      const cmd = comandoSchema.parse(JSON.parse(raw));
      const ctx = await contextoRecepcao(req, cmd.empresaId, true, auth);
      if (ctx instanceof Response) return ctx;
      const limited = await aiLimiter.check(req, ctx.auth.email); if (limited) return limited;
      return json(await executar(ctx, cmd));
    } catch (e) { return falha(e); }
  });
}
