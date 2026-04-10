import { NextResponse } from 'next/server';

/**
 * Multi-tenant subdomain middleware.
 *
 * Fluxo:
 *   1. Lê o hostname da request (ex: zula.vertho.com.br)
 *   2. Extrai o slug do subdomínio (ex: "zula")
 *   3. Injeta o header `x-tenant-slug` na request via rewrite
 *   4. Todas as rotas existentes continuam inalteradas — server components
 *      e API routes lêem o header quando precisarem saber o tenant.
 *
 * Domínios "raiz" (sem tenant):
 *   - vertho.com.br / www.vertho.com.br
 *   - app.vertho.com.br
 *   - localhost:3000 (sem subdomínio)
 *   - *.vercel.app (preview deploys)
 *
 * Esses seguem o fluxo normal sem injeção de tenant.
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
]);

// Domínios raiz (sem subdomínio = sem tenant)
const ROOT_DOMAINS = [
  'vertho.com.br',
  'vertho.ai',
  'localhost',
  'vercel.app',
];

/**
 * Extrai o slug do tenant a partir do hostname.
 * Retorna null se não houver subdomínio de tenant.
 */
function extractTenantSlug(hostname) {
  // Remove porta (localhost:3000 → localhost)
  const host = hostname.split(':')[0];

  // Preview deploys do Vercel (*.vercel.app) — sem tenant
  if (host.endsWith('.vercel.app')) return null;

  // Checa cada domínio raiz
  for (const root of ROOT_DOMAINS) {
    if (host === root) return null; // É o domínio raiz exato

    if (host.endsWith(`.${root}`)) {
      // Extrai o que vem antes do domínio raiz
      const subdomain = host.slice(0, -(root.length + 1)); // "zula" de "zula.vertho.com.br"

      // Pode ter múltiplos níveis (a.b.vertho.com.br) — pega só o primeiro
      const slug = subdomain.split('.')[0];

      if (!slug || RESERVED_SUBDOMAINS.has(slug)) return null;

      return slug;
    }
  }

  return null;
}

export function middleware(request) {
  const hostname = request.headers.get('host') || '';
  const slug = extractTenantSlug(hostname);

  // Sem tenant — fluxo normal, não faz nada
  if (!slug) return NextResponse.next();

  // Injeta o slug em DOIS lugares:
  //   1. Header x-tenant-slug — para Server Components (page.js) que rodam
  //      no mesmo ciclo da request original.
  //   2. Cookie vertho-tenant-slug — para Server Actions, que são POSTs
  //      separados onde o header injetado pelo middleware nem sempre chega.
  const requestHeaders = new Headers(request.headers);
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

  return response;
}

export const config = {
  // Roda em todas as rotas exceto assets estáticos e internals do Next.js
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
