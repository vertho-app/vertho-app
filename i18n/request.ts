import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { localeCookieName, normalizeAppLocale, resolveAppLocale } from '@/lib/i18n';
import { getTenantDefaultLocaleBySlug, getTenantGlossarioBySlug } from '@/lib/i18n-server';
import { aplicarGlossario } from '@/lib/i18n-vocabulario';

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

  // Vocabulário do tenant sobre as mensagens do idioma.
  //
  // Uma rede de escolas não tem "liderados", tem professores. O esqueleto de
  // telas é UM só; o que muda é o nome que a operação do cliente dá às mesmas
  // coisas. Tenant sem `ui_config.vocabulario` recebe o objeto original, sem
  // cópia e sem custo — que é o caso da maioria.
  const glossario = await getTenantGlossarioBySlug(tenantSlug);

  return {
    locale,
    messages: aplicarGlossario(messages, glossario),
  };
});
