// Kill switch: desregistra a si mesmo e limpa todos os caches.
// Usuários que tinham o PWA instalado vão executar isso na próxima visita,
// limpando o service worker antigo. Manter por algumas semanas e remover.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll();
      clients.forEach((c) => c.navigate(c.url));
    })()
  );
});
