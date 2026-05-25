import { createSupabaseAdmin } from '@/lib/supabase';
import { resolveAppLocale } from '@/lib/i18n';
import type { AppLocale } from '@/i18n/routing';

export async function getTenantDefaultLocaleBySlug(slug: string | null | undefined): Promise<AppLocale | null> {
  if (!slug) return null;

  try {
    const sb = createSupabaseAdmin();
    const { data, error } = await sb
      .from('empresas')
      .select('default_locale')
      .eq('slug', slug)
      .maybeSingle();

    if (error) return null;
    return resolveAppLocale(data?.default_locale);
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
