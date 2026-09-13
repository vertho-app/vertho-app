import { z } from 'zod';
import { csrfCheck } from '@/lib/csrf';
import { aiLimiter, readLimiter } from '@/lib/rate-limit';
import { requireUser } from '@/lib/auth/request-context';
import { comContexto } from '@/lib/execucao-contexto';
import { contexto } from '@/lib/simulador-vendas/access';
import { comandoSchema } from '@/lib/simulador-vendas/schema';
import { consultar, executar } from '@/lib/simulador-vendas/service';
import { falha, json } from '@/lib/simulador-vendas/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req); if (auth instanceof Response) return auth;
    const limited = await readLimiter.check(req, `sim-vendas:${auth.email}`); if (limited) return limited;
    const q = new URL(req.url).searchParams;
    const empresa = q.get('empresaId'), id = q.get('sessaoId');
    if (empresa) z.string().uuid().parse(empresa);
    if (id) z.string().uuid().parse(id);
    const c = await contexto(req, empresa, false, auth); if (c instanceof Response) return c;
    return json(await consultar(c, id));
  } catch (e) { return falha(e); }
}
export async function POST(req: Request) {
  return comContexto({ runtime: 'rota', orcamentoMs: 300000, onde: 'api/simulador-vendas' }, async () => {
    try {
      const csrf = csrfCheck(req); if (csrf) return csrf;
      const auth = await requireUser(req); if (auth instanceof Response) return auth;
      const raw = await req.text(); if (raw.length > 16000) return json({ error: 'Mensagem muito longa.' }, 413);
      const cmd = comandoSchema.parse(JSON.parse(raw));
      const c = await contexto(req, cmd.empresaId, true, auth); if (c instanceof Response) return c;
      const limited = await aiLimiter.check(req, `sim-vendas:${c.empresaId}:${c.ownerKey}`); if (limited) return limited;
      return json(await executar(c, cmd));
    } catch (e) { return falha(e); }
  });
}
