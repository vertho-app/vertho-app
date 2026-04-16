import { createSupabaseAdmin } from './supabase';

/**
 * Cache em memória para evitar query a cada request.
 * TTL de 5 minutos — suficiente para não bater no banco a cada page view,
 * curto o bastante para refletir mudanças de ui_config.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface Tenant {
  id: string;
  nome: string;
  slug: string;
  ui_config: any;
}

interface CacheEntry {
  data: Tenant | null;
  ts: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Resolve um slug de tenant para os dados da empresa.
 */
export async function resolveTenant(slug: string | null | undefined): Promise<Tenant | null> {
  if (!slug) return null;

  const key = slug.toLowerCase();

  // Verifica cache
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('empresas')
    .select('id, nome, slug, ui_config')
    .eq('slug', key)
    .single();

  if (error || !data) {
    // Cache negativo para evitar spam de slugs inválidos (TTL curto: 60s)
    cache.set(key, { data: null, ts: Date.now() - CACHE_TTL_MS + 60_000 });
    return null;
  }

  cache.set(key, { data: data as Tenant, ts: Date.now() });
  return data as Tenant;
}

/**
 * Extrai o slug do tenant a partir dos headers da request (server-side).
 * Usado em Server Components e API Routes.
 */
export function getTenantSlug(headersOrRequest: Request | Headers): string | null {
  const h = headersOrRequest instanceof Request
    ? headersOrRequest.headers
    : headersOrRequest;
  return h.get('x-tenant-slug') || null;
}

/**
 * Conveniência: extrai slug dos headers e resolve o tenant de uma vez.
 */
export async function resolveTenantFromHeaders(headersOrRequest: Request | Headers): Promise<Tenant | null> {
  const slug = getTenantSlug(headersOrRequest);
  if (!slug) return null;
  return resolveTenant(slug);
}
