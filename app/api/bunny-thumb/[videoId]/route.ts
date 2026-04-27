// Proxy para servir thumbnails de vídeos do Bunny Stream.
//
// O Bunny tem Hotlink Protection ativada com whitelist do domínio raiz.
// Server-side passamos esse Referer e a CDN libera. Cacheamos a imagem 24h
// no edge da Vercel (s-maxage) e no browser (max-age) para evitar re-fetch.

import { ROOT_DOMAIN } from '@/lib/domain';

const REFERER = `https://www.${ROOT_DOMAIN}/`;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req, { params }) {
  const { videoId } = await params;

  if (!videoId || !GUID_RE.test(videoId)) {
    return new Response('Invalid videoId', { status: 400 });
  }

  const pullZone = process.env.BUNNY_PULL_ZONE;
  if (!pullZone) {
    return new Response('BUNNY_PULL_ZONE not configured', { status: 500 });
  }

  const url = `https://${pullZone}/${videoId}/thumbnail.jpg`;

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
        // 24h no browser + 24h no edge da Vercel; SWR de 1 dia
        'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch (err) {
    console.error('[bunny-thumb]', err);
    return new Response('Upstream error', { status: 502 });
  }
}
