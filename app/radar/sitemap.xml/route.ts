import { NextResponse } from 'next/server';
import { escapeXml, getRadarSitemapChunkCount, RADAR_SITEMAP_BASE_URL } from '@/lib/radar/sitemap';

export const dynamic = 'force-dynamic';

export async function GET() {
  const totalChunks = await getRadarSitemapChunkCount();
  const now = new Date().toISOString();
  const entries = Array.from({ length: totalChunks }, (_, id) => {
    const loc = `${RADAR_SITEMAP_BASE_URL}/sitemap/${id}.xml`;
    return `<sitemap><loc>${escapeXml(loc)}</loc><lastmod>${now}</lastmod></sitemap>`;
  }).join('');

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
