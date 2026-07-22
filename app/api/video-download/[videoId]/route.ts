// Proxy para download direto do MP4 de um vídeo do Bunny Stream.
//
// A URL armazenada no conteúdo é a página de embed (iframe.mediadelivery.net),
// que NÃO é um arquivo. O arquivo baixável é o "MP4 fallback" servido pela CDN
// (pull zone) em https://{pullZone}/{guid}/play_{res}.mp4. A CDN tem Hotlink
// Protection com whitelist do domínio raiz, então passamos o Referer
// server-side (igual ao proxy de thumbnail) e devolvemos com
// Content-Disposition: attachment pro browser baixar com nome amigável.

import { ROOT_DOMAIN } from '@/lib/domain';
import { requirePermission } from '@/lib/auth/request-context';

const REFERER = `https://www.${ROOT_DOMAIN}/`;
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Resoluções de MP4 fallback do Bunny, da maior pra menor (preferimos a melhor
// qualidade disponível). Cruzamos com availableResolutions quando a API responde.
const RES_ORDER = ['1080p', '720p', '480p', '360p', '240p'];

async function resolveResolutions(videoId: string): Promise<string[]> {
  const lib = process.env.BUNNY_LIBRARY_ID;
  const key = process.env.BUNNY_STREAM_API_KEY;
  if (!lib || !key) return RES_ORDER;
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${lib}/videos/${videoId}`, {
      headers: { AccessKey: key, Accept: 'application/json' },
      next: { revalidate: 3600 },
    } as any);
    if (!res.ok) return RES_ORDER;
    const v = await res.json();
    const avail = String(v?.availableResolutions || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (!avail.length) return RES_ORDER;
    // Ordena as disponíveis pela ordem de preferência (maior primeiro).
    return RES_ORDER.filter(r => avail.includes(r));
  } catch {
    return RES_ORDER;
  }
}

function sanitizeName(raw: string | null): string {
  const base = (raw || 'video')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'video';
  return `${base}.mp4`;
}

export async function GET(req: Request, { params }: { params: Promise<{ videoId: string }> }) {
  // A library do Bunny é COMPARTILHADA entre tenants e recebe os vídeos
  // personalizados (título = "<primeiro nome> · <cellVideoId>"). Sem gate, o
  // GUID vira download anônimo de conteúdo nominal. Único caller é o
  // /admin/conteudos, que já exige `content.manage`.
  const auth = await requirePermission(req, 'content.manage');
  if (auth instanceof Response) return auth;

  const { videoId } = await params;

  if (!videoId || !GUID_RE.test(videoId)) {
    return new Response('Invalid videoId', { status: 400 });
  }

  const pullZone = process.env.BUNNY_PULL_ZONE;
  if (!pullZone) {
    return new Response('BUNNY_PULL_ZONE not configured', { status: 500 });
  }

  const url = new URL(req.url);
  const fileName = sanitizeName(url.searchParams.get('name'));

  const resolutions = await resolveResolutions(videoId);
  // Candidatos: MP4 fallback por resolução + arquivo original (se mantido).
  const candidates = [
    ...resolutions.map(r => `play_${r}.mp4`),
    'original',
  ];

  for (const file of candidates) {
    const upstream = `https://${pullZone}/${videoId}/${file}`;
    try {
      const res = await fetch(upstream, { headers: { Referer: REFERER }, cache: 'no-store' });
      if (!res.ok || !res.body) continue;
      const headers = new Headers({
        'Content-Type': res.headers.get('content-type') || 'video/mp4',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      });
      const len = res.headers.get('content-length');
      if (len) headers.set('Content-Length', len);
      return new Response(res.body, { status: 200, headers });
    } catch (err) {
      console.error('[video-download]', file, err);
    }
  }

  return new Response('MP4 not available', { status: 404 });
}
