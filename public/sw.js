// Vertho PWA service worker — escopo /dashboard/
// Estratégia conservadora pra evitar staleness em produção:
//   - HTML/navegação: network-first com fallback ao cache (offline)
//   - Static assets (/_next/static/, imagens, fontes): cache-first (hash-versionados)
//   - API/server actions/auth: bypass total (vai direto pra rede)
//
// Versionado: bump CACHE_VERSION quando trocar a estratégia.

const CACHE_VERSION = 'vertho-pwa-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isBypass(url) {
  // Nunca tocar em API routes, server actions ou auth callbacks
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/data/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/login') ||
    url.pathname.startsWith('/admin/') ||
    url.pathname.startsWith('/imprensa') ||
    url.pathname.startsWith('/radar') ||
    url.pathname.startsWith('/radarbett')
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:png|jpg|jpeg|svg|gif|webp|ico|woff2?|ttf|otf|eot|css|js|mjs)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só GET. Outros métodos (POST de server actions) não cacheiam.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Mesma origem apenas (não interceptar Supabase, Resend, Z-API, etc.)
  if (url.origin !== self.location.origin) return;

  if (isBypass(url)) return;

  // Navigation: network-first com fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(PAGES_CACHE).then((cache) => cache.put(request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(request).then((c) => c || caches.match('/dashboard')))
    );
    return;
  }

  // Static assets: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(request).then((cached) =>
          cached ||
          fetch(request).then((resp) => {
            if (resp.ok) cache.put(request, resp.clone());
            return resp;
          })
        )
      )
    );
  }
});
