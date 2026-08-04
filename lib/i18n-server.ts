import { unstable_cache } from 'next/cache';
import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveAppLocale } from '@/lib/i18n';
import type { AppLocale } from '@/i18n/routing';

/**
 * Tag do data cache do locale default por tenant. O locale muda raramente
 * (só em /admin/empresas/[id]/configuracoes) e a query rodava em TODA
 * request renderizada via i18n/request.ts — era a query mais quente do
 * sistema. Invalidada em salvarLocaleEmpresa; TTL de 1 dia como backstop.
 */
export const TENANT_LOCALE_CACHE_TAG = 'tenant-default-locale';

async function fetchTenantDefaultLocale(slug: string): Promise<AppLocale | null> {
  const sb = createSupabaseAdmin();
  const { data, error } = await sb
    .from('empresas')
    .select('default_locale')
    .eq('slug', slug)
    .maybeSingle();

  // Lança (em vez de retornar null) para o unstable_cache NÃO cachear erro
  // transitório do banco por 1 dia — quem chama trata o fallback.
  if (error) throw new Error(`tenant locale: ${error.message}`);
  return resolveAppLocale(data?.default_locale);
}

// Os argumentos (slug) entram na chave do cache automaticamente — cada
// tenant tem sua entrada.
const getCachedTenantDefaultLocale = unstable_cache(
  fetchTenantDefaultLocale,
  ['tenant-default-locale-by-slug'],
  { tags: [TENANT_LOCALE_CACHE_TAG], revalidate: 86_400 },
);

export async function getTenantDefaultLocaleBySlug(slug: string | null | undefined): Promise<AppLocale | null> {
  if (!slug) return null;

  try {
    return await getCachedTenantDefaultLocale(slug);
  } catch {
    return null;
  }
}

export async function getLocaleForEmail(email: string | null | undefined): Promise<AppLocale | null> {
  if (!email) return null;

  try {
    const sb = createSupabaseAdmin();
    const { data, error } = await sb
      .from('colaboradores')
      .select('locale, empresas(default_locale)')
      .eq('email', email.trim().toLowerCase())
      .limit(1)
      .maybeSingle();

    if (error) return null;
    const empresaLocale = Array.isArray((data as any)?.empresas)
      ? (data as any)?.empresas?.[0]?.default_locale
      : (data as any)?.empresas?.default_locale;

    return resolveAppLocale((data as any)?.locale, empresaLocale);
  } catch {
    return null;
  }
}
