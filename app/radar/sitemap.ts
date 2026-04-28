import type { MetadataRoute } from 'next';
import { listAllScopes } from '@/lib/radar/queries';

/**
 * Sitemap dinâmico do Radar com chunks de 5000 URLs.
 *
 * Next.js App Router gera automaticamente sitemap-index quando há mais de
 * uma página de sitemap, então `radar.vertho.ai/sitemap.xml` aponta pros
 * chunks `sitemap/0.xml`, `sitemap/1.xml`, etc.
 *
 * Layout dos chunks:
 *   - 0: estático (home, comparar, metodologia) + estados + municípios
 *        (sempre ≤ 5500 URLs em escala nacional)
 *   - 1+: escolas em chunks de CHUNK_SIZE
 */
const CHUNK_SIZE = 5000;

export async function generateSitemaps() {
  const scopes = await listAllScopes().catch(() => ({ escolas: [], municipios: [], estados: [] }));
  const totalEscolas = scopes.escolas.length;
  // 1 chunk pra estático+estados+municípios + N chunks pra escolas
  const totalChunks = 1 + Math.max(1, Math.ceil(totalEscolas / CHUNK_SIZE));
  const out = [];
  for (let i = 0; i < totalChunks; i++) out.push({ id: i });
  return out;
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const base = 'https://radar.vertho.ai';
  const now = new Date();
  const scopes = await listAllScopes().catch(() => ({ escolas: [], municipios: [], estados: [] }));

  if (id === 0) {
    const estaticas: MetadataRoute.Sitemap = [
      { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
      { url: `${base}/comparar`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
      { url: `${base}/metodologia`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    ];
    const estados: MetadataRoute.Sitemap = (scopes.estados || []).map((e) => ({
      url: `${base}/estado/${e.uf}`,
      lastModified: e.updatedAt ? new Date(e.updatedAt) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.85,
    }));
    const municipios: MetadataRoute.Sitemap = scopes.municipios.map((m) => ({
      url: `${base}/municipio/${m.ibge}`,
      lastModified: m.updatedAt ? new Date(m.updatedAt) : now,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    }));
    return [...estaticas, ...estados, ...municipios];
  }

  // Chunk de escolas (id começando em 1)
  const escolasIdx = id - 1;
  const start = escolasIdx * CHUNK_SIZE;
  const fatia = scopes.escolas.slice(start, start + CHUNK_SIZE);
  return fatia.map((e) => ({
    url: `${base}/escola/${e.inep}`,
    lastModified: e.updatedAt ? new Date(e.updatedAt) : now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));
}
