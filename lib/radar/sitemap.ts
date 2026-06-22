import type { MetadataRoute } from 'next';
import { countRadarSchools, listMunicipiosEstadosSitemap, listSitemapEscolas } from '@/lib/radar/queries';

export const RADAR_SITEMAP_CHUNK_SIZE = 5000;
export const RADAR_SITEMAP_BASE_URL = 'https://radar.vertho.ai';

export async function getRadarSitemapChunkCount(): Promise<number> {
  const totalEscolas = await countRadarSchools().catch(() => 0);
  return 1 + Math.max(1, Math.ceil(totalEscolas / RADAR_SITEMAP_CHUNK_SIZE));
}

export async function getRadarSitemapEntries(id: number): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  if (id === 0) {
    const scopes = await listMunicipiosEstadosSitemap().catch(() => ({ municipios: [], estados: [] }));
    const estaticas: MetadataRoute.Sitemap = [
      { url: `${RADAR_SITEMAP_BASE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
      { url: `${RADAR_SITEMAP_BASE_URL}/comparar`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
      { url: `${RADAR_SITEMAP_BASE_URL}/metodologia`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    ];
    const estados: MetadataRoute.Sitemap = (scopes.estados || []).map((e) => ({
      url: `${RADAR_SITEMAP_BASE_URL}/estado/${e.uf}`,
      lastModified: e.updatedAt ? new Date(e.updatedAt) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
    }));
    const municipios: MetadataRoute.Sitemap = scopes.municipios.map((m) => ({
      url: `${RADAR_SITEMAP_BASE_URL}/municipio/${m.ibge}`,
      lastModified: m.updatedAt ? new Date(m.updatedAt) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }));
    return [...estaticas, ...estados, ...municipios];
  }

  const escolasIdx = id - 1;
  const start = escolasIdx * RADAR_SITEMAP_CHUNK_SIZE;
  const fatia = await listSitemapEscolas(start, RADAR_SITEMAP_CHUNK_SIZE).catch(() => []);
  return fatia.map((e) => ({
    url: `${RADAR_SITEMAP_BASE_URL}/escola/${e.inep}`,
    lastModified: e.updatedAt ? new Date(e.updatedAt) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
