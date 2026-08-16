/**
 * O navegador é o EMBUTIDO de um app (WhatsApp, Instagram, Facebook)?
 *
 * 🔴 POR QUE ISTO DECIDE UM FLUXO DE LOGIN (medido em 15/08/2026)
 * ──────────────────────────────────────────────────────────────
 * O link de acesso chega por WhatsApp e o app abre no navegador EMBUTIDO. Ali:
 *
 *   1. o `/auth/callback` chama `verifyOtp`, que **consome o token de uso
 *      único**;
 *   2. a sessão nasce no cookie jar do WebView, isolado do navegador e do app
 *      instalado;
 *   3. a pessoa fecha o WhatsApp, abre o app — e não está logada. Pior: o link
 *      não funciona mais, porque o token já foi gasto.
 *
 * O resultado é um link de acesso que parece funcionar e deixa a pessoa de fora.
 * Por isso a detecção acontece ANTES do redirect que consome o token.
 *
 * ⚠️ DETECÇÃO POR USER-AGENT É HEURÍSTICA, e a assimetria importa: um falso
 * POSITIVO só mostra uma tela a mais para quem já estava no navegador certo; um
 * falso NEGATIVO queima o token. Na dúvida, o lado seguro é acusar embutido.
 */

/** Android: o WebView anuncia `wv`, e o WhatsApp costuma se identificar. */
const ANDROID_EMBUTIDO = /\bwv\b|WhatsApp|Instagram|FBAN|FBAV|Line\/|MicroMessenger/i;

/**
 * iOS: o WKWebView usa o motor do Safari e NÃO traz o token `Safari/` no fim do
 * UA — é o sinal que separa "Safari de verdade" de "WebView dentro de um app".
 */
function ehIosEmbutido(ua: string): boolean {
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (!ios) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false; // Chrome/Firefox/Edge no iOS: navegadores de verdade
  return !/Safari\//i.test(ua);
}

/** É Android? Só lá existe caminho programático para sair do WebView. */
export function ehAndroid(userAgent: string | null | undefined): boolean {
  return /Android/i.test(String(userAgent || ''));
}

export function ehNavegadorEmbutido(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || '');
  if (!ua) return false; // sem UA não dá para afirmar; o fluxo normal segue
  if (ANDROID_EMBUTIDO.test(ua)) return true;
  return ehIosEmbutido(ua);
}

/**
 * Link que abre no Chrome a partir do WebView do Android.
 *
 * `intent://` é o único jeito de um WebView entregar a navegação ao navegador do
 * sistema.
 *
 * ⚠️ `package=com.android.chrome` fixa o destino — se o Chrome estiver desativado
 * no aparelho, o Android não resolve a intent e o WebView mostra um erro cru, com
 * a pessoa sem instrução nenhuma. É para isso que serve o `browser_fallback_url`:
 * ele NÃO é o link de acesso (isso recomeçaria o laço dentro do WhatsApp), é a
 * tela de despacho, que explica o caminho e não consome o token.
 *
 * 🔴 NÃO EXISTE EQUIVALENTE NO iOS. O WKWebView não abre o Safari por link,
 * esquema ou script — a única saída de lá é o menu do próprio app ("Abrir no
 * Safari"), acionado pela pessoa. Qualquer promessa de "abrir direto no
 * navegador" no iPhone é falsa; o que dá para fazer é reduzir a instrução a um
 * toque e, para quem usa o app instalado, preferir o OTP (código), que não
 * depende de navegador nenhum.
 */
export function intentChrome(url: string, urlDeFallback?: string): string {
  const semEsquema = url.replace(/^https?:\/\//, '');
  const fallback = urlDeFallback
    ? `S.browser_fallback_url=${encodeURIComponent(urlDeFallback)};`
    : '';
  return `intent://${semEsquema}#Intent;scheme=https;package=com.android.chrome;${fallback}end`;
}
