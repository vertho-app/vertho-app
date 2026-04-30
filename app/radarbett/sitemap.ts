import type { MetadataRoute } from 'next';

/**
 * Sitemap simples do radarbett — só rotas estáticas (home, comparar).
 * As páginas internas /escola/[inep] e /municipio/[ibge] são server-rendered
 * sob demanda; não vale a pena indexar todas as escolas BR aqui (já
 * estão no sitemap do radar.vertho.ai). Foco do radarbett é a landing.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://radarbett.vertho.ai';
  const now = new Date();
  return [
    { url: `${base}/`,         lastModified: now, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${base}/comparar`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
