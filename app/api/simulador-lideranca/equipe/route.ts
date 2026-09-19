import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readLimiter } from '@/lib/rate-limit';
import { requireUser } from '@/lib/auth/request-context';
import { LiderancaError } from '@/lib/simulador-lideranca/schema';
import { contextoEquipe, detalhePessoa, painelEquipe } from '@/lib/simulador-lideranca/equipe';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (dados: unknown, status = 200) =>
  NextResponse.json(dados, { status, headers: { 'Cache-Control': 'no-store' } });

/** Acompanhamento do simulador de liderança: RH, gestor e tutor (régua da jornada). */
export async function GET(req: Request) {
  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const limite = await readLimiter.check(req, `sim-lideranca-equipe:${auth.email}`);
    if (limite) return limite;
    const q = new URL(req.url).searchParams;
    const empresa = q.get('empresaId');
    const pessoa = q.get('pessoa');
    if (empresa) z.uuid().parse(empresa);
    if (pessoa) z.uuid().parse(pessoa);
    const c = await contextoEquipe(auth, empresa);
    return json(pessoa ? await detalhePessoa(c, pessoa) : await painelEquipe(c));
  } catch (e) {
    if (e instanceof LiderancaError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError) return json({ error: 'Parâmetros inválidos.' }, 400);
    console.error('[sim-lideranca/equipe] erro interno', e instanceof Error ? e.name : 'erro');
    return json({ error: 'O acompanhamento está temporariamente indisponível. Tente novamente.' }, 500);
  }
}
