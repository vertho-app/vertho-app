import { NextResponse } from 'next/server';
import { escapeXml, getRadarSitemapEntries } from '@/lib/radar/sitemap';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string[] }>;
};

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const rawId = id.join('/').replace(/\.xml$/i, '');
  const chunkId = Number(rawId);
  if (!Number.isInteger(chunkId) || chunkId < 0) {
    return NextResponse.json({ error: 'Invalid sitemap chunk' }, { status: 400 });
  }

  const entries = await getRadarSitemapEntries(chunkId);
  const urls = entries.map((entry) => {
    const lastModified = entry.lastModified instanceof Date
      ? entry.lastModified.toISOString()
      : entry.lastModified;

    return [
      '<url>',
      `<loc>${escapeXml(entry.url)}</loc>`,
      lastModified ? `<lastmod>${escapeXml(String(lastModified))}</lastmod>` : '',
      entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : '',
      entry.priority !== undefined ? `<priority>${entry.priority}</priority>` : '',
      '</url>',
    ].join('');
  }).join('');

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
