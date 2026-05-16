import { cache } from 'react';
import { createSupabaseAdmin } from './supabase';

/**
 * Resolução de tenant. Memoização via React cache(): dedupe DENTRO de
 * um único render/request (login page + layout + authz no mesmo
 * request batem o banco 1x só), mas SEM persistir entre requests —
 * cada novo request relê do banco, então salvar branding/slug reflete
 * na hora ("salvo e atualiza").
 *
 * Histórico: era um Map em memória com TTL 5min — quebrado em
 * serverless (Map é por-instância: salvar numa lambda não limpava o
 * cache da que serve /login → branding velho por muito tempo). O cache
 * do Next (unstable_cache/revalidateTag) resolveria cross-instance mas
 * adiciona churn da nova API de cache do Next 16; o lookup é um
 * indexado de 1 linha (~ms), então per-request cache é o trade-off
 * correto: correção garantida, custo desprezível.
 */
export interface Tenant {
  id: string;
  nome: string;
  slug: string;
  ui_config: any;
}

const fetchTenant = cache(async (key: string): Promise<Tenant | null> => {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('empresas')
    .select('id, nome, slug, ui_config')
    .eq('slug', key)
    .single();
  if (error || !data) return null;
  return data as Tenant;
});

/**
 * Resolve um slug de tenant para os dados da empresa.
 */
export async function resolveTenant(slug: string | null | undefined): Promise<Tenant | null> {
  if (!slug) return null;
  return fetchTenant(slug.toLowerCase());
}

/**
 * Extrai o slug do tenant a partir dos headers da request (server-side).
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
