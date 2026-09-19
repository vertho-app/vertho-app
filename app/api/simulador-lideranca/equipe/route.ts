import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readLimiter } from '@/lib/rate-limit';
import { csrfCheck } from '@/lib/csrf';
import { requireUser } from '@/lib/auth/request-context';
import { LiderancaError } from '@/lib/simulador-lideranca/schema';
import { contextoEquipe, detalhePessoa, painelEquipe, revisarJornada } from '@/lib/simulador-lideranca/equipe';
import { revisaoComandoSchema } from '@/lib/simuladores/revisao';
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

/** Revisão humana da devolutiva (18/09/2026): quem acompanha, nunca a própria pessoa. */
export async function POST(req: Request) {
  try {
    const csrf = csrfCheck(req);
    if (csrf) return csrf;
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const limite = await readLimiter.check(req, `sim-lideranca-revisao:${auth.email}`);
    if (limite) return limite;
    const raw = await req.text();
    if (raw.length > 20000) return json({ error: 'Formulário muito longo.' }, 413);
    const cmd = revisaoComandoSchema.parse(JSON.parse(raw));
    const c = await contextoEquipe(auth, cmd.empresaId);
    return json(await revisarJornada(c, cmd));
  } catch (e) {
    if (e instanceof LiderancaError) return json({ error: e.message }, e.status);
    if (e instanceof z.ZodError || e instanceof SyntaxError) return json({ error: 'Dados inválidos. Confira os campos e tente novamente.' }, 400);
    console.error('[sim-lideranca/equipe] erro interno na revisão', e instanceof Error ? e.name : 'erro');
    return json({ error: 'Não foi possível registrar a revisão agora. Tente novamente.' }, 500);
  }
}
