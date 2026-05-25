export const locales = ['pt-BR', 'pt-PT', 'es-ES'] as const;

export type AppLocale = (typeof locales)[number];

export const defaultLocale: AppLocale = 'pt-BR';

export const routing = {
  locales,
  defaultLocale,
};

export function isAppLocale(locale: string | undefined | null): locale is AppLocale {
  return locales.includes(locale as AppLocale);
}
