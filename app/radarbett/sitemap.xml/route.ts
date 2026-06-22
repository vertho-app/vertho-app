import { NextResponse } from 'next/server';
import { escapeXml } from '@/lib/radar/sitemap';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = 'https://radarbett.vertho.ai';
  const now = new Date().toISOString();
  const entries = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/comparar`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  const urls = entries.map((entry) => [
    '<url>',
    `<loc>${escapeXml(entry.url)}</loc>`,
    `<lastmod>${now}</lastmod>`,
    `<changefreq>${entry.changeFrequency}</changefreq>`,
    `<priority>${entry.priority}</priority>`,
    '</url>',
  ].join('')).join('');

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
