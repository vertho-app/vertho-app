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

/**
 * Marcadores que o app EMBUTIDO acrescenta ao UA.
 *
 * 🔑 `WAiOS` é o que o WhatsApp do iPhone usa — medido em 15/08/2026 num
 * aparelho real:
 *
 *   …Version/26.6 Mobile/15E148 Safari/604.1 **[WAiOS/2.26.31]**
 *
 * Note o `Safari/604.1` ali: o WebView do WhatsApp no iOS **assina como Safari**.
 * A primeira versão desta régua procurava a AUSÊNCIA desse token e por isso
 * deixou passar um iPhone real — o token estava lá. O sinal confiável é o
 * marcador do app, não a ausência de algo.
 *
 * `wv` (Android), `WAiOS`/`WhatsApp` (WhatsApp), `FBAN`/`FBAV`/`FB_IAB`
 * (Facebook/Messenger), `Instagram`, `Line/`, `MicroMessenger` (WeChat).
 */
const APP_EMBUTIDO = /\bwv\b|WAiOS|WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|MicroMessenger/i;

/**
 * iOS sem marcador de app: o WKWebView de apps menos educados usa o motor do
 * Safari e não traz o token `Safari/`.
 *
 * ⚠️ Este ramo é o FRACO — ele erra por omissão sempre que o app assina como
 * Safari (foi o caso do WhatsApp). Ele fica porque cobre apps que o
 * `APP_EMBUTIDO` não conhece, não porque seja confiável.
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
  if (APP_EMBUTIDO.test(ua)) return true;
  return ehIosEmbutido(ua);
}

/** iPhone/iPad — muda a instrução ("Abrir no Safari" × "Abrir no Chrome"). */
export function ehIos(userAgent: string | null | undefined): boolean {
  return /iPhone|iPad|iPod/i.test(String(userAgent || ''));
}

/**
 * Do outro lado tem um ROBÔ (preview de link, crawler, monitor) em vez de gente?
 *
 * 🔑 POR QUE ISTO PASSOU A EXISTIR (18/08/2026)
 * ────────────────────────────────────────────
 * A tela de confirmação deixou de esperar um toque: ela entra sozinha (ver
 * `AutoEntrar`). Como entrar CONSOME o token de uso único, quem carrega a página
 * sem ser a pessoa passa a ser um problema — o robô de preview da Meta busca a
 * URL para montar o cartão da mensagem.
 *
 * **A defesa principal NÃO é esta régua, é o JavaScript**: o servidor continua
 * sem redirecionar por conta própria (o invariante de `/entrar` está intacto — um
 * GET nunca aponta para o callback), e quem entra é um `location.replace` que só
 * roda em navegador de verdade. Robô de preview baixa o HTML e vai embora.
 *
 * Esta função é a segunda camada, barata: nem serve o script para quem se
 * anuncia como robô. Ela é por marcador POSITIVO — a lição do `WAiOS` vale aqui
 * também: régua por ausência falha calada no dia em que o outro lado muda.
 *
 * ⚠️ Ela erra para o lado seguro: falso positivo só mostra a tela com o botão
 * (o comportamento antigo, um toque a mais); falso negativo não queima nada
 * sozinho, porque ainda depende de o robô executar JS.
 */
const ROBO_DE_PREVIEW =
  /facebookexternalhit|Facebot|WhatsApp\/|Twitterbot|Slackbot|Slack-ImgProxy|LinkedInBot|TelegramBot|Discordbot|SkypeUriPreview|Embedly|redditbot|Googlebot|bingbot|DuckDuckBot|Applebot|YandexBot|Baiduspider|AhrefsBot|SemrushBot|PetalBot|\bbot\b|crawler|spider|HeadlessChrome|Chrome-Lighthouse|curl\/|Wget\/|python-requests|Go-http-client|node-fetch|axios\/|okhttp|Java\/|libwww-perl/i;

export function ehRoboDePreview(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || '');
  // Sem UA não é gente com navegador — navegador SEMPRE manda User-Agent. O lado
  // seguro aqui é o oposto do de `ehNavegadorEmbutido`: na dúvida, não entrar.
  if (!ua.trim()) return true;
  return ROBO_DE_PREVIEW.test(ua);
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
/**
 * Esquemas que fazem o WebView do iOS entregar a navegação ao navegador.
 *
 * 🔴 NENHUM DOS DOIS É API SUPORTADA. A Apple não oferece forma de sair do
 * WKWebView; o que existe é um efeito colateral — ao navegar para um esquema
 * DESCONHECIDO, um app bem-comportado repassa a URL ao sistema
 * (`UIApplication.open`) em vez de tratar como erro. `x-safari-https://` é
 * registrado pelo Safari e `googlechromes://` pelo Chrome.
 *
 * **Medido funcionando no WhatsApp 2.26.31 (iPhone, 15/08/2026.)** Pode sumir
 * numa atualização do app, sem aviso e sem erro — por isso quem usa isto tem
 * que ter um caminho manual visível quando a tentativa não leva a lugar nenhum.
 *
 * Ficam aqui, e não na tela, porque são a mesma pegadinha em dois lugares
 * (`/entrar/abrir` e o login): conhecimento frágil duplicado envelhece em
 * metades.
 */
export function esquemaSafari(url: string): string {
  return `x-safari-https://${url.replace(/^https?:\/\//, '')}`;
}

export function esquemaChrome(url: string): string {
  return `googlechromes://${url.replace(/^https?:\/\//, '')}`;
}

export function intentChrome(url: string, urlDeFallback?: string): string {
  const semEsquema = url.replace(/^https?:\/\//, '');
  const fallback = urlDeFallback
    ? `S.browser_fallback_url=${encodeURIComponent(urlDeFallback)};`
    : '';
  return `intent://${semEsquema}#Intent;scheme=https;package=com.android.chrome;${fallback}end`;
}
