import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { localeCookieName, normalizeAppLocale, resolveAppLocale } from '@/lib/i18n';
import { getTenantDefaultLocaleBySlug } from '@/lib/i18n-server';

function resolveAcceptLanguage(value: string | null) {
  if (!value) return null;

  for (const part of value.split(',')) {
    const locale = normalizeAppLocale(part.split(';')[0]);
    if (locale) return locale;
  }

  return null;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const cookieStore = await cookies();
  const headerStore = await headers();
  const tenantSlug = headerStore.get('x-tenant-slug');
  const tenantLocale = await getTenantDefaultLocaleBySlug(tenantSlug);

  const locale = resolveAppLocale(
    requested,
    cookieStore.get(localeCookieName)?.value,
    headerStore.get('x-vertho-locale'),
    tenantLocale,
    resolveAcceptLanguage(headerStore.get('accept-language')),
  );

  const messages = (await import(`../messages/${locale}.json`)).default;

  return {
    locale,
    messages,
  };
});
