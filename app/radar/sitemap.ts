import type { MetadataRoute } from 'next';
import { listAllScopes } from '@/lib/radar/queries';

/**
 * Sitemap dinâmico do Radar. Indexa /radar/, /metodologia,
 * /municipio/[ibge] e /escola/[inep] para cada item importado.
 *
 * Note que o Next.js gera o sitemap servido em radar.vertho.ai/sitemap.xml
 * (o middleware reescreve / -> /radar, então o sitemap responde em ambos
 * os hosts).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://radar.vertho.ai';
  const now = new Date();

  const scopes = await listAllScopes().catch(() => ({ escolas: [], municipios: [], estados: [] }));

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/comparar`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/metodologia`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];

  const escolasEntries: MetadataRoute.Sitemap = scopes.escolas.map((e) => ({
    url: `${base}/escola/${e.inep}`,
    lastModified: e.updatedAt ? new Date(e.updatedAt) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const municipiosEntries: MetadataRoute.Sitemap = scopes.municipios.map((m) => ({
    url: `${base}/municipio/${m.ibge}`,
    lastModified: m.updatedAt ? new Date(m.updatedAt) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const estadosEntries: MetadataRoute.Sitemap = (scopes.estados || []).map((e) => ({
    url: `${base}/estado/${e.uf}`,
    lastModified: e.updatedAt ? new Date(e.updatedAt) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.85,
  }));

  return [...staticEntries, ...estadosEntries, ...municipiosEntries, ...escolasEntries];
}
