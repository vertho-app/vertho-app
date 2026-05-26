import { AppLocale, defaultLocale, isAppLocale } from '@/i18n/routing';

export const localeCookieName = 'vertho-locale';

export function normalizeAppLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null;

  const [locale] = value.trim().split(';');
  if (isAppLocale(locale)) return locale;

  const lower = locale.toLowerCase();
  if (lower === 'pt' || lower === 'pt-br') return 'pt-BR';
  if (lower === 'pt-pt') return 'pt-PT';
  if (lower === 'es' || lower === 'es-es') return 'es-ES';
  if (lower === 'en' || lower === 'en-us') return 'en-US';

  return null;
}

export function resolveAppLocale(...candidates: Array<string | null | undefined>): AppLocale {
  for (const candidate of candidates) {
    const locale = normalizeAppLocale(candidate);
    if (locale) return locale;
  }

  return defaultLocale;
}

export function localeLanguageName(locale: AppLocale): string {
  switch (locale) {
    case 'pt-PT':
      return 'português de Portugal';
    case 'es-ES':
      return 'espanhol da Espanha';
    case 'en-US':
      return 'inglês dos Estados Unidos';
    case 'pt-BR':
    default:
      return 'português do Brasil';
  }
}
