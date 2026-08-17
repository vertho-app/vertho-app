/**
 * Parâmetro do botão do template de magic link por WhatsApp.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * ──────────────────────────
 * O botão de URL de um template da Meta tem a base FIXA e só o sufixo variável.
 * Isso colide de frente com o multi-tenant por subdomínio: o link precisaria
 * apontar para `ibipeba.vertho.ai`, mas a base é a mesma para todo mundo.
 *
 * Duas consequências, medidas em 14/08/2026:
 *  - `app` é subdomínio RESERVADO no `proxy.js` ⇒ `app.vertho.ai` resolve tenant
 *    `null`;
 *  - o cookie de sessão não declara `domain` ⇒ fica preso ao host exato.
 *
 * Logo, logar em `app.vertho.ai` deixaria a pessoa sem sessão em
 * `ibipeba.vertho.ai`. A alternativa seria um template por cliente — dez hoje,
 * cada um com aprovação, e cliente novo esperando revisão da Meta.
 *
 * A saída é empacotar tenant e token num parâmetro só, e deixar uma rota de
 * despacho (`/entrar`) redirecionar para o subdomínio certo. Um template serve
 * todos os tenants, inclusive os que ainda não existem.
 */

/**
 * Separador entre slug e token.
 *
 * `~` de propósito: slug de tenant é `[a-z0-9-]` (o hífen é comum — `acme-demo`,
 * `teste-piloto`), e o `token_hash` do Supabase é hex/base64url. Nenhum dos dois
 * produz `~`, então o primeiro `~` sempre marca a fronteira. Usar `-` ou `.`
 * quebraria em slug com hífen ou token com ponto.
 */
const SEP = '~';

/** Slug de tenant válido — a mesma forma aceita pelo `proxy.js`. */
const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** Empacota tenant + token no valor que vai no `{{1}}` do botão. */
export function montarParametroAcesso(slug: string, tokenHash: string): string {
  return `${slug}${SEP}${tokenHash}`;
}

/**
 * Subdomínios que NÃO são tenant. Espelha `RESERVED_SUBDOMAINS` do `proxy.js` —
 * duplicado aqui de propósito: este módulo é puro (sem imports) porque roda em
 * caminho de auth, e um import do proxy traria o middleware junto.
 */
const RESERVADOS = new Set(['www', 'app', 'api', 'admin', 'mail', 'smtp', 'ftp', 'radar', 'radarbett', 'imprensa']);

/**
 * Deriva `<slug>~<token_hash>` a partir da URL de callback já montada.
 *
 * 🔴 POR QUE ISTO EXISTE (medido 17/08/2026)
 * ─────────────────────────────────────────
 * `sendAccessLink` só usa o template da Cloud API quando recebe `acessoParam`, e
 * dos **4 call-sites apenas 1** o passava. Os outros três —
 * `phone-magic-link/request` (o login por telefone do colaborador!),
 * `magic-link` e `signup` — caíam no legado, que depende da Z-API desconectada
 * desde 11/08: **28 falhas com `zapi: saúde: desconectada` entre 14 e 16/08**.
 * Login que não chega é a pessoa fora.
 *
 * A correção não é repetir a linha nos outros três — é derivar do que TODOS já
 * passam (o `whatsappLink`), num lugar só. Assim o próximo call-site nasce certo
 * sem ninguém lembrar. (Lição de 11/08 que eu tinha registrado e não apliquei:
 * ao mexer no envio, procurar TODOS os call-sites.)
 *
 * ⚠️ ESTRITO DE PROPÓSITO. Devolve `null` para qualquer coisa que não seja
 * inequivocamente um callback de tenant nosso: o `whatsappLink` pode ser o
 * `action_link` do Supabase (outro host) quando o `token_hash` não veio, e
 * derivar dali produziria um slug que não é tenant nenhum — um link de acesso
 * apontando para lugar errado é pior que não mandar.
 */
export function derivarParametroAcesso(
  url: string | null | undefined,
  rootDomain = 'vertho.ai',
): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }

  if (u.protocol !== 'https:') return null;
  // Só o callback do tenant. Outro caminho não carrega token de sessão.
  if (u.pathname !== '/auth/callback') return null;
  if (!u.hostname.endsWith(`.${rootDomain}`)) return null;

  const slug = u.hostname.slice(0, -(rootDomain.length + 1));
  // `ibipeba` sim; `app`, `www` e afins não; `algo.ibipeba` também não (sub-sub).
  if (!slug || slug.includes('.') || RESERVADOS.has(slug)) return null;
  if (!SLUG_VALIDO.test(slug)) return null;

  const tokenHash = u.searchParams.get('token_hash');
  if (!tokenHash) return null;

  const param = montarParametroAcesso(slug, tokenHash);
  // Fecha o círculo: o que sai daqui tem que ser legível pelo `/entrar`.
  return lerParametroAcesso(param) ? param : null;
}

export interface AcessoDespacho {
  slug: string;
  tokenHash: string;
}

/**
 * Desempacota o parâmetro. Devolve `null` para qualquer coisa fora do formato.
 *
 * ⚠️ ESTE VALOR VEM DO CLIENTE — é uma query string numa rota pública. A
 * validação do slug aqui é o que impede **open redirect**: sem ela, um `t` como
 * `site-malicioso.com~x` produziria um redirecionamento para fora do domínio,
 * assinado pela nossa URL e chegando pelo canal de login. Quem chama ainda
 * precisa confirmar que o slug EXISTE — este módulo garante só a forma.
 */
export function lerParametroAcesso(valor: string | null | undefined): AcessoDespacho | null {
  if (!valor) return null;
  const i = valor.indexOf(SEP);
  if (i <= 0) return null;

  const slug = valor.slice(0, i);
  const tokenHash = valor.slice(i + 1);
  if (!SLUG_VALIDO.test(slug)) return null;
  // Token vazio ou absurdamente longo não é token — e o limite evita que uma URL
  // gigante vire carga de trabalho na rota pública.
  if (!tokenHash || tokenHash.length < 8 || tokenHash.length > 512) return null;
  // O token do Supabase é hex/base64url. Recusar o resto fecha a porta para
  // `../`, `//host` e afins entrarem na URL montada adiante.
  if (!/^[A-Za-z0-9_-]+$/.test(tokenHash)) return null;

  return { slug, tokenHash };
}

/**
 * Caminho de destino no subdomínio do tenant.
 *
 * `type=email` é obrigatório: o `/auth/callback` só chama `verifyOtp` quando
 * recebe `token_hash` E `type` — sem ele cai em "Nenhum token ou código
 * fornecido", que é um erro que aparece como se o link estivesse quebrado.
 */
export function caminhoCallback(tokenHash: string, next = '/dashboard'): string {
  const qs = new URLSearchParams({ type: 'email', token_hash: tokenHash, next });
  return `/auth/callback?${qs.toString()}`;
}
