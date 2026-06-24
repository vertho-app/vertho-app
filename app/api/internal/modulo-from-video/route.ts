import { NextRequest, NextResponse } from 'next/server';
import { segmentarEEstruturarExtracao } from '@/actions/modulos-base';

/**
 * Callback interno do worker de extração (trigger.dev). O worker baixa o vídeo,
 * gera a TRANSCRIÇÃO completa (em blocos, para qualquer duração) e chama esta
 * rota para segmentar em temas e estruturar N Módulos-Base rascunho — a IA-autora
 * + o catálogo só existem no runtime do app. Vídeo curto → 1 módulo; 1h+ → N.
 *
 * Autenticação: header `x-internal-secret` == SUPABASE_SERVICE_ROLE_KEY (segredo
 * forte que o worker já possui — evita uma env var nova). Não é rota pública.
 *
 * Body: { extracaoId, transcricao, titulo?, locale? }
 */
export const runtime = 'nodejs';
export const maxDuration = 800; // segmentar + estruturar N módulos via IA pode levar minutos

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret') || '';
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'json inválido' }, { status: 400 }); }
  const { extracaoId, transcricao, titulo, locale } = body || {};
  if (!extracaoId) return NextResponse.json({ error: 'extracaoId obrigatório' }, { status: 400 });

  // Wrapper fino: a lógica (idempotência + segmentação + status) vive em
  // segmentarEEstruturarExtracao, que as tasks do trigger rodam DIRETO (sem o teto
  // de 800s desta rota). Mantido p/ compat / chamadas externas.
  const r = await segmentarEEstruturarExtracao(extracaoId, { transcricao, titulo, locale });
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.httpStatus || 422 });
  return NextResponse.json({ ok: true, moduloIds: r.moduloIds, n: r.n, idempotente: r.idempotente });
}
