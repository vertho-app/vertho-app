import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { criarModuloBaseDeTextoExtraido } from '@/actions/modulos-base';

/**
 * Callback interno do worker de extração (trigger.dev). O worker baixa o vídeo,
 * extrai o texto-base e chama esta rota para estruturar o Módulo-Base rascunho
 * (precisa da IA-autora + catálogo, que só existem no runtime do app).
 *
 * Autenticação: header `x-internal-secret` == SUPABASE_SERVICE_ROLE_KEY (segredo
 * forte que o worker já possui — evita uma env var nova). Não é rota pública.
 *
 * Body: { extracaoId, textoBase, titulo?, locale? }
 */
export const runtime = 'nodejs';
export const maxDuration = 300; // estruturar 4 blocos via IA-autora pode levar minutos

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret') || '';
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'json inválido' }, { status: 400 }); }
  const { extracaoId, textoBase, titulo, locale } = body || {};
  if (!extracaoId || !textoBase) return NextResponse.json({ error: 'extracaoId e textoBase obrigatórios' }, { status: 400 });

  const sb = createSupabaseAdmin();
  const { data: ext } = await sb.from('extracoes_video')
    .select('id, escopo_empresa_id').eq('id', extracaoId).maybeSingle();
  if (!ext) return NextResponse.json({ error: 'extração não encontrada' }, { status: 404 });

  const empresaId = ext.escopo_empresa_id || null; // null = módulo global/canônico
  const res = await criarModuloBaseDeTextoExtraido({
    textoBase, tituloVideo: titulo, locale, empresaId, createdBy: 'extracao-video',
  });

  if (res.error || !res.id) {
    await sb.from('extracoes_video').update({
      status: 'error', error: String(res.error || 'falha ao estruturar módulo').slice(0, 500),
      titulo: titulo || null, updated_at: new Date().toISOString(),
    }).eq('id', extracaoId);
    return NextResponse.json({ error: res.error || 'falha ao estruturar' }, { status: 422 });
  }

  await sb.from('extracoes_video').update({
    status: 'done', modulo_base_id: res.id, titulo: titulo || res.competencia || null,
    error: null, updated_at: new Date().toISOString(),
  }).eq('id', extracaoId);
  return NextResponse.json({ ok: true, moduloId: res.id, competencia: res.competencia });
}
