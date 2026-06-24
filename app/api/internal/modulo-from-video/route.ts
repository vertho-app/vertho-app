import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { criarModulosDeTranscricao } from '@/actions/modulos-base';

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

  const sb = createSupabaseAdmin();
  const { data: ext } = await sb.from('extracoes_video')
    .select('id, status, modulo_base_ids, escopo_empresa_id, url, transcricao, pilar_direcionador, competencia_direcionadora, competencia_base_id_direcionadora')
    .eq('id', extracaoId).maybeSingle();
  if (!ext) return NextResponse.json({ error: 'extração não encontrada' }, { status: 404 });

  // IDEMPOTÊNCIA: se já concluiu (re-chamada por retry/reconexão da task), devolve
  // o resultado existente em vez de re-segmentar e DUPLICAR módulos.
  if (ext.status === 'done' && Array.isArray(ext.modulo_base_ids) && ext.modulo_base_ids.length) {
    return NextResponse.json({ ok: true, moduloIds: ext.modulo_base_ids, n: ext.modulo_base_ids.length, idempotente: true });
  }

  const texto = String(transcricao || ext.transcricao || '').trim();
  if (!texto) return NextResponse.json({ error: 'transcricao obrigatória' }, { status: 400 });

  const empresaId = ext.escopo_empresa_id || null; // null = módulo global/canônico
  const res = await criarModulosDeTranscricao({
    transcricao: texto, tituloVideo: titulo, urlOrigem: ext.url, locale, empresaId, createdBy: 'extracao-video',
    direcionamento: {
      pilar: ext.pilar_direcionador || null,
      competencia: ext.competencia_direcionadora || null,
      competenciaBaseId: ext.competencia_base_id_direcionadora || null,
    },
  });

  // Guarda a transcrição (artefato reusável) mesmo em caso de erro na autoria.
  if (res.error || !res.modulos.length) {
    await sb.from('extracoes_video').update({
      status: 'error', error: String(res.error || 'falha ao estruturar módulos').slice(0, 500),
      transcricao: texto.slice(0, 500000), titulo: titulo || null, updated_at: new Date().toISOString(),
    }).eq('id', extracaoId);
    return NextResponse.json({ error: res.error || 'falha ao estruturar' }, { status: 422 });
  }

  const ids = res.modulos.map((m) => m.id);
  const comps = res.modulos.map((m) => m.competencia).filter(Boolean);
  const tituloFinal = res.modulos.length > 1
    ? `${res.modulos.length} módulos: ${comps.slice(0, 2).join(', ')}${comps.length > 2 ? '…' : ''}`
    : (comps[0] || titulo || 'Vídeo');
  await sb.from('extracoes_video').update({
    status: 'done',
    modulo_base_id: ids[0],
    modulo_base_ids: ids,
    n_modulos: ids.length,
    transcricao: texto.slice(0, 500000),
    titulo: tituloFinal,
    error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', extracaoId);
  return NextResponse.json({ ok: true, moduloIds: ids, n: ids.length });
}
