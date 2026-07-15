import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { safeSecretEqual } from '@/lib/secure-compare';
import { extractNarration, generatePersonalizedPodcastAudio } from '@/lib/gemini-tts';

/**
 * Pré-geração do áudio de podcast, no runtime da Vercel (onde o lamejs/encoder MP3
 * funciona; não roda no tsx). TTS o roteiro → MP3 → storage. Dois modos:
 *  - SEM colaboradorId: áudio-BASE (sem nome) em final/podcast-base/{id}.mp3 +
 *    grava `url` no micro_conteudo (fallback p/ admin/sem-colab).
 *  - COM colaboradorId: áudio PERSONALIZADO (com "Olá, {nome}...") no MESMO path de
 *    cache que /api/conteudo/{id}/podcast lê → pré-aquece o cache por colaborador,
 *    servido INSTANTÂNEO. (Fim do TTS on-demand que estourava o maxDuration.)
 *
 * Auth: header `x-internal-secret` (INTERNAL_API_KEY OU service-role de compat).
 */
export const runtime = 'nodejs';
export const maxDuration = 300;

function sanitizeSegment(value: string) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret') || '';
  const ok = safeSecretEqual(secret, process.env.INTERNAL_API_KEY)
    || safeSecretEqual(secret, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'json inválido' }, { status: 400 }); }
  const id = body?.id;
  const colaboradorId = body?.colaboradorId as string | undefined;
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const sb = createSupabaseAdmin();
  const { data: content } = await sb.from('micro_conteudos')
    .select('id, formato, conteudo_inline').eq('id', id).maybeSingle();
  if (!content) return NextResponse.json({ error: 'não encontrado' }, { status: 404 });
  if (content.formato !== 'audio') return NextResponse.json({ error: 'não é áudio' }, { status: 400 });

  const narracao = extractNarration(content.conteudo_inline || '');
  if (narracao.length < 20) return NextResponse.json({ error: 'narração insuficiente' }, { status: 422 });

  // ── PERSONALIZADO (com nome) → pré-aquece o cache por colaborador ──────────────
  if (colaboradorId) {
    const { data: colab } = await sb.from('colaboradores')
      .select('nome_completo').eq('id', colaboradorId).maybeSingle();
    const nome = colab?.nome_completo?.trim() || '';
    const audio = await generatePersonalizedPodcastAudio(narracao, nome);
    // MESMO path que /api/conteudo/[id]/podcast lê no cache.
    const path = `final/audio-personalizado/${sanitizeSegment(content.id)}/${sanitizeSegment(colaboradorId)}.mp3`;
    const { error: upErr } = await sb.storage.from('conteudos')
      .upload(path, audio.buffer, { contentType: audio.contentType, upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, personalizado: true, bytes: audio.buffer.length });
  }

  // ── BASE (sem nome) → fallback + url no micro_conteudo ─────────────────────────
  const audio = await generatePersonalizedPodcastAudio(narracao, '');
  const path = `final/podcast-base/${id}.mp3`;
  const { error: upErr } = await sb.storage.from('conteudos')
    .upload(path, audio.buffer, { contentType: audio.contentType, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(path);
  await sb.from('micro_conteudos').update({ url: publicUrl }).eq('id', id);
  return NextResponse.json({ ok: true, url: publicUrl, bytes: audio.buffer.length });
}
