import { NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireUser, assertColabAccess } from '@/lib/auth/request-context';
import { extractNarration, generatePersonalizedPodcastAudio } from '@/lib/gemini-tts';

export const runtime = 'nodejs';
export const maxDuration = 300; // fallback on-demand p/ colab sem cache pré-aquecido

function redirectTo(url: string) {
  return NextResponse.redirect(url, { status: 302 });
}

function sanitizeSegment(value: string) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function downloadBaseAudio(sb: ReturnType<typeof createSupabaseAdmin>, content: any): Promise<Buffer | null> {
  if (content.storage_path) {
    const { data, error } = await sb.storage.from('conteudos').download(content.storage_path);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }

  if (!content.url) return null;
  const response = await fetch(content.url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const sb = createSupabaseAdmin();
  const { data: content, error } = await sb
    .from('micro_conteudos')
    .select('id, formato, titulo, url, storage_path, conteudo_inline, competencia, empresa_id')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!content) return NextResponse.json({ error: 'Conteúdo não encontrado' }, { status: 404 });
  if (content.formato !== 'audio') return NextResponse.json({ error: 'Conteúdo não é podcast' }, { status: 400 });

  if (content.empresa_id && !auth.isPlatformAdmin && content.empresa_id !== auth.empresaId) {
    return NextResponse.json({ error: 'sem acesso a este conteúdo' }, { status: 403 });
  }

  // AUDITORIA (admin/rh/gestor): `?colaboradorId=` serve o áudio COM a saudação da
  // PESSOA — o mesmo que ela ouve. O parâmetro é AUTORIZADO por assertColabAccess
  // (que já cobre platform admin, o próprio colab e rh/gestor do tenant), nunca
  // confiado em silêncio. NÃO é o padrão de bypass em que o chamador passa a
  // identidade e o gate é PULADO (ver `gerarConteudoFinalPersonalizado({colab})`).
  let alvo: { id: string; nome_completo?: string | null } | null = auth.colaborador || null;
  const pedido = new URL(req.url).searchParams.get('colaboradorId');
  if (pedido && pedido !== auth.colaborador?.id) {
    const denied = await assertColabAccess(auth, pedido);
    if (denied) return denied;
    const { data: outro } = await sb
      .from('colaboradores')
      .select('id, nome_completo')
      .eq('id', pedido)
      .eq('empresa_id', content.empresa_id)
      .maybeSingle();
    if (!outro) return NextResponse.json({ error: 'colaborador não encontrado neste conteúdo' }, { status: 404 });
    alvo = outro;
  }

  const nome = alvo?.nome_completo?.trim();
  if (!nome) {
    // Sem colaborador (ex.: admin): serve o áudio-base pré-gerado (sem nome).
    return content.url
      ? redirectTo(content.url)
      : NextResponse.json({ error: 'Podcast ainda não gerado' }, { status: 404 });
  }

  const cachePath = [
    'final',
    'audio-personalizado',
    sanitizeSegment(content.id),
    `${sanitizeSegment(alvo!.id)}.mp3`,
  ].join('/');

  const cached = await sb.storage.from('conteudos').download(cachePath);
  if (!cached.error && cached.data) {
    const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(cachePath);
    return redirectTo(publicUrl);
  }

  try {
    const narracao = extractNarration(content.conteudo_inline || '');
    if (narracao.length >= 20) {
      const audio = await generatePersonalizedPodcastAudio(narracao, nome);
      const { error: uploadError } = await sb.storage.from('conteudos').upload(cachePath, audio.buffer, {
        contentType: audio.contentType,
        upsert: true,
      });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = sb.storage.from('conteudos').getPublicUrl(cachePath);
      return redirectTo(publicUrl);
    }
  } catch (err) {
    console.error('[podcast personalizado]', err);
  }

  const base = await downloadBaseAudio(sb, content);
  if (base) {
    return new NextResponse(new Uint8Array(base), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=300',
      },
    });
  }

  return NextResponse.json({ error: 'Podcast ainda não gerado' }, { status: 404 });
}
