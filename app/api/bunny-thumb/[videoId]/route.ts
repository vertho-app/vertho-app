// Proxy para servir thumbnails de vídeos do Bunny Stream.
//
// O Bunny tem Hotlink Protection ativada com whitelist do domínio raiz.
// Server-side passamos esse Referer e a CDN libera. Cacheamos a imagem 24h
// no edge da Vercel (s-maxage) e no browser (max-age) para evitar re-fetch.

import { ROOT_DOMAIN } from '@/lib/domain';

const REFERER = `https://www.${ROOT_DOMAIN}/`;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O nome do arquivo de thumbnail varia: o frame auto-gerado é `thumbnail.jpg`,
// mas thumbnails customizados (upload manual no Bunny) recebem um nome com
// hash, ex. `thumbnail_47b9900c.jpg`. O nome real fica em `thumbnailFileName`
// nos metadados do vídeo. Consultamos a API pra servir o arquivo certo;
// fallback pro `thumbnail.jpg` se a API não responder.
async function resolveThumbFileName(videoId: string): Promise<string> {
  const lib = process.env.BUNNY_LIBRARY_ID;
  const key = process.env.BUNNY_STREAM_API_KEY;
  if (!lib || !key) return 'thumbnail.jpg';
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${lib}/videos/${videoId}`, {
      headers: { AccessKey: key, Accept: 'application/json' },
      next: { revalidate: 3600 },
    } as any);
    if (!res.ok) return 'thumbnail.jpg';
    const v = await res.json();
    return v?.thumbnailFileName || 'thumbnail.jpg';
  } catch {
    return 'thumbnail.jpg';
  }
}

export async function GET(_req, { params }) {
  const { videoId } = await params;

  if (!videoId || !GUID_RE.test(videoId)) {
    return new Response('Invalid videoId', { status: 400 });
  }

  const pullZone = process.env.BUNNY_PULL_ZONE;
  if (!pullZone) {
    return new Response('BUNNY_PULL_ZONE not configured', { status: 500 });
  }

  const fileName = await resolveThumbFileName(videoId);
  const url = `https://${pullZone}/${videoId}/${fileName}`;

  try {
    const res = await fetch(url, {
      headers: { Referer: REFERER },
      // Garante que o fetch é feito a cada deploy (idempotente)
      cache: 'no-store',
    });
    if (!res.ok) {
      return new Response('Thumbnail not available', { status: 404 });
    }

    const buf = await res.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        // 1h no browser/edge + SWR de 1 dia: thumbnails podem ser trocados no
        // Bunny, então mantemos a janela curta pra a troca propagar sozinha.
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[bunny-thumb]', err);
    return new Response('Upstream error', { status: 502 });
  }
}
