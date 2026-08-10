import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Multi-tenant subdomain proxy.
 *
 * Fluxo:
 *   1. Lê o hostname da request (ex: zula.vertho.ai)
 *   2. Extrai o slug do subdomínio (ex: "zula")
 *   3. Injeta o header `x-tenant-slug` na request via rewrite
 *   4. Todas as rotas existentes continuam inalteradas — server components
 *      e API routes lêem o header quando precisarem saber o tenant.
 *
 * Domínios "raiz" (sem tenant):
 *   - vertho.ai / www.vertho.ai (principal)
 *   - app.vertho.ai
 *   - vertho.com.br / app.vertho.com.br (legacy — mantido só por compat de
 *     DNS antigo; será removido quando o registro expirar)
 *   - localhost:3000 (sem subdomínio)
 *   - *.vercel.app (preview deploys)
 *
 * Subdomínios públicos com rewrite:
 *   - imprensa.vertho.ai → /imprensa/<path>
 *
 * radar.vertho.ai (10/08/2026) e radarbett.vertho.ai (25/05/2026) foram
 * APOSENTADOS: 301 para vertho.ai — ver resolveSubdominioAposentado. O Radar
 * continua existindo como ferramenta INTERNA em app.vertho.ai/radar, atrás da
 * régua de platform-admin.
 *
 * Os demais seguem o fluxo normal sem injeção de tenant.
 */

// Subdomínios reservados que NÃO são tenants
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'mail',
  'smtp',
  'ftp',
  'radar',
  'radarbett',
  'imprensa',
]);

// Subdomínios públicos que rewriteam para um path interno do app
// (imprensa.vertho.ai/<path>   →  /imprensa/<path>)
// radar e radarbett saíram daqui: são redirect 301 (ver SUBDOMINIOS_APOSENTADOS).
const REWRITE_SUBDOMAINS = {
  imprensa: '/imprensa',
};

// Subdomínios aposentados → 301 para a home institucional.
//
// `radar` saiu do ar público em 10/08/2026 por decisão do dono: a ferramenta
// passou a ser INTERNA (platform-admin, em app.vertho.ai/radar). O que o
// número dizia — 90 dias, 182 eventos humanos, 15 IPs e **zero** visitante com
// referer externo; 5 leads no total, 4 deles de abril, nenhum convertido.
//
// Vai para a home, e não para a versão interna, porque mandar quem clicou num
// link antigo para uma tela de login anuncia a existência da ferramenta sem
// entregar nada. Mesmo tratamento que o `radarbett` já tinha.
const SUBDOMINIOS_APOSENTADOS = new Set(['radar', 'radarbett']);
const HOME_INSTITUCIONAL = 'https://vertho.ai';

// Domínios raiz (sem subdomínio = sem tenant). vertho.com.br fica
// no final como legacy — manter por compat até DNS expirar.
const ROOT_DOMAINS = [
  'vertho.ai',
  'vertho.com.br',
  'localhost',
  'vercel.app',
];

/**
 * Extrai o slug do tenant a partir do hostname.
 * Retorna null se não houver subdomínio de tenant.
 */
export function extractTenantSlug(hostname) {
  // Remove porta (localhost:3000 → localhost)
  const host = hostname.split(':')[0];

  // Preview deploys do Vercel (*.vercel.app) — sem tenant
  if (host.endsWith('.vercel.app')) return null;

  // Checa cada domínio raiz
  for (const root of ROOT_DOMAINS) {
    if (host === root) return null; // É o domínio raiz exato

    if (host.endsWith(`.${root}`)) {
      // Extrai o que vem antes do domínio raiz
      const subdomain = host.slice(0, -(root.length + 1)); // "zula" de "zula.vertho.ai"

      // Pode ter múltiplos níveis (a.b.vertho.ai) — pega só o primeiro
      const slug = subdomain.split('.')[0];

      if (!slug || RESERVED_SUBDOMAINS.has(slug)) return null;

      return slug;
    }
  }

  return null;
}

// Detecta se o host é um subdomínio público com rewrite (ex: radar.vertho.ai)
export function detectRewriteSubdomain(hostname) {
  const host = hostname.split(':')[0];
  for (const [sub, basePath] of Object.entries(REWRITE_SUBDOMAINS)) {
    for (const root of ROOT_DOMAINS) {
      if (host === `${sub}.${root}`) return basePath;
    }
  }
  return null;
}

/**
 * Subdomínio aposentado (radar, radarbett) → URL absoluta de destino, ou null.
 *
 * Todo caminho vai para a home institucional, inclusive os deep-links. O
 * radarbett preservava `/escola/:id` e `/municipio/:id` apontando para o radar
 * público — que deixou de existir em 10/08/2026, então preservá-los agora seria
 * mandar quem vem de um link antigo para um 301 em cadeia até uma tela de
 * login. Um salto, um destino que existe.
 */
export function resolveSubdominioAposentado(hostname) {
  const host = hostname.split(':')[0];
  for (const sub of SUBDOMINIOS_APOSENTADOS) {
    for (const root of ROOT_DOMAINS) {
      if (host === `${sub}.${root}`) return HOME_INSTITUCIONAL;
    }
  }
  return null;
}

/**
 * Remove o cookie `vertho-tenant-slug` de um header Cookie.
 * Retorna a string limpa, ou null se não sobrar cookie nenhum.
 */
export function stripTenantCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const restantes = cookieHeader
    .split(';')
    .filter((par) => par.split('=')[0].trim() !== 'vertho-tenant-slug')
    .map((par) => par.trim())
    .filter(Boolean);
  return restantes.length ? restantes.join('; ') : null;
}

// Rotas que nunca carregam sessão de browser — cron/webhook/task não pagam refresh.
const ROTAS_SEM_SESSAO = ['/api/cron', '/api/webhooks', '/api/trigger'];

/** Só vale renovar se a request traz cookie de sessão do Supabase. */
function temCookieDeSessao(request) {
  return /(?:^|;\s*)sb-[^=;\s]*=/.test(request.headers.get('cookie') || '');
}

function precisaRenovarSessao(request) {
  // Bearer (cron/serviço) não usa cookie
  if (request.headers.get('authorization')) return false;
  if (!temCookieDeSessao(request)) return false;
  const p = request.nextUrl?.pathname || '';
  return !ROTAS_SEM_SESSAO.some((rota) => p.startsWith(rota));
}

/**
 * Renova a sessão do Supabase AQUI — o proxy é o único ponto da request onde o
 * cookie é GRAVÁVEL.
 *
 * Por que isto existe (bug de 22/07, pisca-pisca /admin/dashboard ↔ /login):
 * `auth.getUser()` num Server Component dispara o refresh quando o access token
 * expira, mas o `cookies()` de RSC é READ-ONLY — o `store.set` de
 * `lib/auth/supabase-server.ts` cai no catch e o token novo é PERDIDO. O refresh
 * token, porém, já foi rotacionado no servidor do Supabase: o browser fica com o
 * token velho (agora inválido) e a sessão morre no meio da navegação. Daí o
 * servidor vê anônimo e manda pro /login, enquanto o cliente ainda tem a sessão
 * em memória e manda de volta pra rota protegida — laço infinito.
 *
 * `getSession()` e não `getUser()`: aqui só queremos o REFRESH (ele não vai à
 * rede enquanto o token é válido, e rotaciona quando expirou). A AUTORIZAÇÃO
 * continua sendo feita com `getUser()` na camada de app, que valida o JWT.
 */
async function renovarSessao(request, cookiesPendentes) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !request.cookies?.getAll) return;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          // 1) request: o render DESTA request já enxerga o token novo
          request.cookies.set(name, value);
          // 2) response: o browser recebe o token rotacionado
          cookiesPendentes.push({ name, value, options });
        }
      },
    },
  });

  try {
    await supabase.auth.getSession();
  } catch {
    // Refresh falhou (token morto, rede) — segue anônimo; quem decide é o gate.
  }
}

/** Aplica na response os cookies rotacionados pelo refresh. */
function aplicarCookiesDeSessao(response, cookiesPendentes) {
  for (const { name, value, options } of cookiesPendentes) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export async function proxy(request) {
  const hostname = request.headers.get('host') || '';

  // 0) Subdomínio aposentado (radar, radarbett) → 301 permanente para a home.
  //    Sem querystring: o destino é uma home, e utm de campanha antiga só
  //    sujaria a analytics do site institucional.
  const destinoAposentado = resolveSubdominioAposentado(hostname);
  if (destinoAposentado) {
    return NextResponse.redirect(new URL(destinoAposentado), 301);
  }

  // 1) Subdomínio público (imprensa): rewrite pra /imprensa/<path>
  const rewriteBase = detectRewriteSubdomain(hostname);
  if (rewriteBase) {
    const url = request.nextUrl.clone();
    // Evita prefixar duas vezes em re-runs do middleware
    if (!url.pathname.startsWith(rewriteBase)) {
      url.pathname = `${rewriteBase}${url.pathname}`;
    }
    return NextResponse.rewrite(url);
  }

  // 2) Refresh da sessão (antes de montar os headers repassados — o cookie novo
  //    precisa chegar ao render desta mesma request).
  const cookiesPendentes = [];
  if (precisaRenovarSessao(request)) await renovarSessao(request, cookiesPendentes);

  // 3) Tenant por subdomínio (fluxo existente)
  const slug = extractTenantSlug(hostname);

  // O tenant é decidido AQUI, pelo hostname — nunca pelo cliente. Quem consome
  // (`lib/tenant-resolver.ts`, `lib/authz.ts`) confia no header/cookie, então
  // um `x-tenant-slug` (ou o cookie) que venha na request é sempre descartado
  // antes de seguir. Sem isso, o apex e os previews *.vercel.app aceitavam o
  // header forjado e davam contexto de qualquer tenant a um cliente anônimo.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-tenant-slug');

  // Sem tenant no host: também limpa o cookie de tenant, que só um cliente HTTP
  // forjaria aqui (é host-only — o browser não o manda para o apex).
  if (!slug) {
    const limpo = stripTenantCookie(requestHeaders.get('cookie'));
    if (limpo === null) requestHeaders.delete('cookie');
    else requestHeaders.set('cookie', limpo);
    return aplicarCookiesDeSessao(
      NextResponse.next({ request: { headers: requestHeaders } }),
      cookiesPendentes,
    );
  }

  // Injeta o slug em DOIS lugares:
  //   1. Header x-tenant-slug — para Server Components (page.js) que rodam
  //      no mesmo ciclo da request original.
  //   2. Cookie vertho-tenant-slug — para Server Actions, que são POSTs
  //      separados onde o header injetado pelo middleware nem sempre chega.
  requestHeaders.set('x-tenant-slug', slug);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Cookie host-only, válido para o subdomínio
  response.cookies.set('vertho-tenant-slug', slug, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });

  return aplicarCookiesDeSessao(response, cookiesPendentes);
}

export const config = {
  // Roda em todas as rotas exceto assets estáticos e internals do Next.js
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
