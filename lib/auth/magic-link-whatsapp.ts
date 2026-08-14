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
