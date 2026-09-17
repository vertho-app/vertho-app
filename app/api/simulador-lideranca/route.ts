import { NextResponse } from 'next/server';
import { z } from 'zod';
import { csrfCheck } from '@/lib/csrf';
import { aiLimiter, readLimiter } from '@/lib/rate-limit';
import { requireUser } from '@/lib/auth/request-context';
import { comContexto } from '@/lib/execucao-contexto';
import { contexto } from '@/lib/simulador-lideranca/access';
import {
  comandoSchema,
  LiderancaError,
} from '@/lib/simulador-lideranca/schema';
import { consultar, executar } from '@/lib/simulador-lideranca/service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const json = (dados: unknown, status = 200) =>
  NextResponse.json(dados, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
function falha(e: unknown) {
  if (e instanceof LiderancaError) return json({ error: e.message }, e.status);
  if (e instanceof z.ZodError || e instanceof SyntaxError)
    return json(
      { error: 'Confira o preenchimento dos campos e tente novamente.' },
      400,
    );
  console.error(
    '[sim-lideranca] erro interno',
    e instanceof Error ? e.name : 'erro',
  );
  return json(
    {
      error: 'O simulador está temporariamente indisponível. Tente novamente.',
    },
    500,
  );
}
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const limite = await readLimiter.check(req, `sim-lideranca:${auth.email}`);
    if (limite) return limite;
    const q = new URL(req.url).searchParams;
    const empresa = q.get('empresaId'),
      episodio = q.get('episodioId');
    if (empresa) z.uuid().parse(empresa);
    if (episodio) z.uuid().parse(episodio);
    const pagina = z.coerce
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(q.get('pagina') || 0);
    const c = await contexto(auth, empresa);
    return json(await consultar(c, episodio, pagina));
  } catch (e) {
    return falha(e);
  }
}
export async function POST(req: Request) {
  return comContexto(
    { runtime: 'rota', orcamentoMs: 300000, onde: 'api/simulador-lideranca' },
    async () => {
      try {
        const csrf = csrfCheck(req);
        if (csrf) return csrf;
        const auth = await requireUser(req);
        if (auth instanceof Response) return auth;
        const limite = await aiLimiter.check(
          req,
          `sim-lideranca:${auth.email}`,
        );
        if (limite) return limite;
        const raw = await req.text();
        if (raw.length > 14000)
          return json({ error: 'Mensagem muito longa.' }, 413);
        const cmd = comandoSchema.parse(JSON.parse(raw));
        const c = await contexto(auth, cmd.empresaId);
        return json(await executar(c, cmd));
      } catch (e) {
        return falha(e);
      }
    },
  );
}
