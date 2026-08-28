const SOCIAL_HOSTS = new Set([
  'linkedin.com', 'instagram.com', 'x.com', 'twitter.com', 'facebook.com',
  'youtube.com', 'tiktok.com',
]);

function normalizedHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');
}

function parsedSocialUrl(value: string): URL | null {
  const raw = value.trim().replace(/[)\]}>.,;]+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const host = normalizedHost(url.hostname);
    if (!SOCIAL_HOSTS.has(host)) return null;
    const path = url.pathname.replace(/\/+$/, '');
    if (!path || path === '/') return null;
    url.protocol = 'https:';
    url.hostname = host;
    url.port = '';
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function canonicalSocialUrl(value: string): string | null {
  const url = parsedSocialUrl(value);
  return url ? url.href.replace(/\/$/, '').toLowerCase() : null;
}

export function parseOfficialSocialUrls(value: unknown): string[] {
  const pieces = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/[\s,;]+/) : [];
  const urls = new Map<string, string>();
  for (const piece of pieces) {
    if (typeof piece !== 'string') continue;
    const parsed = parsedSocialUrl(piece);
    if (!parsed) continue;
    const canonical = canonicalSocialUrl(parsed.href);
    if (canonical && !urls.has(canonical)) urls.set(canonical, parsed.href.replace(/\/$/, ''));
    if (urls.size === 8) break;
  }
  return [...urls.values()];
}

export function isSocialUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    return SOCIAL_HOSTS.has(normalizedHost(new URL(value).hostname));
  } catch {
    return false;
  }
}

export function isOfficialSocialProfile(value: string | null, officialProfiles: string[]): boolean {
  if (!value) return false;
  const candidate = canonicalSocialUrl(value);
  if (!candidate) return false;
  return officialProfiles.some((profile) => canonicalSocialUrl(profile) === candidate);
}

/**
 * Evidência web comum sempre é permitida. Evidência social só passa quando é
 * o próprio perfil oficial ou quando o modelo associa o post a um perfil
 * oficial exato que o usuário forneceu.
 */
export function isAllowedSocialEvidence(
  evidenceUrl: string | null,
  claimedOfficialProfile: string | null,
  officialProfiles: string[],
): boolean {
  if (!isSocialUrl(evidenceUrl)) return true;
  return isOfficialSocialProfile(evidenceUrl, officialProfiles)
    || isOfficialSocialProfile(claimedOfficialProfile, officialProfiles);
}

/**
 * Remove sinais sociais sem identidade confirmada antes que eles cheguem à
 * síntese do plano. A rota ainda repete a validação ao montar a resposta, como
 * defesa em profundidade.
 */
export function filterResearchByOfficialSocials<T extends Record<string, any>>(
  research: T,
  officialProfiles: string[],
): T {
  const facts = (Array.isArray(research.fatos_relevantes) ? research.fatos_relevantes : [])
    .filter((item: any) => {
      const sourceUrl = typeof item?.fonte_url === 'string' ? item.fonte_url : null;
      const claimedProfile = typeof item?.perfil_oficial_url === 'string' ? item.perfil_oficial_url : null;
      if (claimedProfile && !isOfficialSocialProfile(claimedProfile, officialProfiles)) return false;
      return isAllowedSocialEvidence(sourceUrl, claimedProfile, officialProfiles);
    });
  const trends = (Array.isArray(research.tendencias_setor) ? research.tendencias_setor : [])
    .filter((item: any) => {
      const sourceUrl = typeof item?.fonte_url === 'string' ? item.fonte_url : null;
      return !isSocialUrl(sourceUrl) || isOfficialSocialProfile(sourceUrl, officialProfiles);
    });

  return { ...research, fatos_relevantes: facts, tendencias_setor: trends };
}
