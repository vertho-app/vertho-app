/**
 * Tradutor do relatório de engajamento fora do React (R-67): o PDF é montado no
 * servidor, sem `useTranslations`. Mesmo namespace da tela (`EngagementWorkspace`),
 * então papel e tela dizem a mesma frase, no idioma pedido.
 *
 * O catálogo entra por `import()` dinâmico (como `i18n/request.ts`) para não
 * pesar em quem não gera PDF.
 */
import { createTranslator } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import { resolveAppLocale } from '@/lib/i18n';
import type { Traduzir } from '@/lib/engajamento/rotulos';

export async function traduzirEngajamento(locale?: AppLocale | string | null): Promise<{ t: Traduzir; locale: AppLocale }> {
  const idioma = resolveAppLocale(locale);
  const messages = (await import(`../../messages/${idioma}.json`)).default;
  const t = createTranslator({ locale: idioma, messages: messages as any, namespace: 'EngagementWorkspace' }) as unknown as Traduzir;
  return { t, locale: idioma };
}
