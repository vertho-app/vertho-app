import type { AppLocale } from '@/i18n/routing';
import { APP_URL } from '@/lib/domain';

/**
 * Rodapé com o link da política de privacidade nos e-mails do app (R-46,
 * 03/10/2026).
 *
 * A página `/privacidade` diz que quem usa a plataforma declara ciência dos
 * Termos de Uso, e até aqui nenhum e-mail levava até ela: o login e o rodapé do
 * painel ganharam o link em 03/10 (deploy 0fd7358d), faltavam os e-mails, que
 * são o primeiro contato da pessoa com a plataforma.
 *
 * O rótulo é o MESMO de `messages/*.json` (`privacyLink`, usado no login e no
 * painel). Ele vive aqui em TypeScript porque e-mail sai de trigger e de cron,
 * onde não há contexto do next-intl; o teste
 * `tests/unit/rodape-privacidade-email.test.ts` compara os dois lados, então um
 * rótulo alterado só num deles falha o CI.
 *
 * A página de destino é só em pt-BR (texto jurídico de referência): traduzir o
 * rótulo do link não traduz a política, e isso é decisão declarada em
 * `app/privacidade/page.tsx`.
 */
export const ROTULO_PRIVACIDADE: Record<AppLocale, string> = {
  'pt-BR': 'Privacidade e termos de uso',
  'pt-PT': 'Privacidade e termos de utilização',
  'es-ES': 'Privacidad y términos de uso',
  'en-US': 'Privacy and terms of use',
};

/**
 * URL da política. `baseUrl` é o endereço do TENANT quando o e-mail tem um
 * (`https://ibipeba.vertho.ai`); a página é pública e idêntica em qualquer host,
 * então sem `baseUrl` (ou com valor vazio, como em script) cai no `APP_URL`.
 * Link relativo num e-mail não abre em lugar nenhum.
 */
export function urlPrivacidade(baseUrl?: string | null): string {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '') || APP_URL;
  return `${base}/privacidade`;
}

/**
 * Parágrafo de rodapé (HTML) com o link. Estilo discreto, na mesma família de
 * cinza do resto do rodapé dos e-mails de texto simples.
 */
export function rodapePrivacidadeHtml(baseUrl?: string | null, locale?: AppLocale | null): string {
  // `locale` ausente ou nulo (e-mail de quem não tem idioma resolvido) é pt-BR, como sempre foi.
  const rotulo = ROTULO_PRIVACIDADE[locale && Object.prototype.hasOwnProperty.call(ROTULO_PRIVACIDADE, locale) ? locale : 'pt-BR'];
  return `<p style="color:#666;font-size:12px;margin-top:20px"><a href="${urlPrivacidade(baseUrl)}" style="color:#666;text-decoration:underline">${rotulo}</a></p>`;
}
