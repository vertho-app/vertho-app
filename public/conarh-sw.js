/* eslint-disable no-restricted-globals */
/**
 * CONARH 52 — service worker da demo do estande.
 *
 * A demo já rodava "sem rede" no sentido de não CHAMAR nada durante a rota (o
 * conteúdo é um JSON no bundle). Faltava o outro lado: carregar a página com o
 * iPad em modo avião. É o que este arquivo resolve.
 *
 * Estratégia, e por que ela é assim:
 *
 *  1. PRECACHE das mídias que a tela exibe (~16 MB, nomes estáveis). São os
 *     arquivos que o expositor abre na frente do visitante — vídeo, podcast e
 *     os PDFs. Falhar em UM deles é falhar na demonstração, então eles não
 *     podem depender de o visitante ter passado por aquela etapa antes.
 *  2. RUNTIME cache (cache-first) para o resto do mesmo domínio: HTML das
 *     rotas e os chunks do Next, que têm HASH no nome e mudam a cada deploy —
 *     uma lista fixa deles quebraria no primeiro deploy seguinte.
 *  3. Navegação com fallback: offline e sem cache da URL exata, serve `/conarh`.
 *
 * ⚠️ CONSEQUÊNCIA OPERACIONAL: deployar durante a feira invalida os chunks
 * cacheados. Quem abriu antes continua funcionando (cache-first), mas um tablet
 * novo precisa de rede uma vez. Congele o deploy nos dias 18-20/08.
 */
const VERSAO = 'conarh-v1';
const CACHE = `${VERSAO}`;

/** O que a TELA exibe hoje. As personas de reserva (80 MB de vídeo) ficam de
 *  fora de propósito: não são renderizadas, e precachear 96 MB no iOS encosta
 *  no limite de armazenamento sem entregar nada ao visitante. */
const PRECACHE = [
  '/conarh',
  '/conarh/prancheta',
  '/conarh/media/pilula-video-marcos-combinado.mp4',
  '/conarh/media/pilula-audio-rogerio-combinado.mp3',
  '/conarh/media/guia-sandra-roteiro.pdf',
  '/conarh/media/perfil-exemplo-d.pdf',
  '/conarh/media/relatorio-gestor.pdf',
  '/conarh/media/relatorio-rh.pdf',
  '/conarh/media/perfil-organizacional.pdf',
  '/conarh/media/dna-organizacional.pdf',
  '/conarh/media/capa-relatorio-gestor.png',
  '/conarh/media/capa-relatorio-rh.png',
  '/conarh/media/capa-perfil-organizacional.png',
  '/conarh/media/capa-dna-organizacional.png',
  '/conarh/pdi-renata-falcao.pdf',
  '/conarh/pdi-capa.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Um a um, e tolerante: `addAll` falha TUDO se um único arquivo falhar —
      // e aí o tablet fica sem cache nenhum por causa de um 404.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (e) {
            console.warn('[conarh-sw] precache falhou:', url, e);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return; // captura de lead é POST: nunca do cache
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Fora de /conarh (admin, dashboard) o SW não se mete.
  if (!url.pathname.startsWith('/conarh') && !url.pathname.startsWith('/_next')) return;

  evento.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(req, { ignoreSearch: false });
      if (guardado) return guardado;
      try {
        const resposta = await fetch(req);
        // Só guarda resposta completa: `206 Partial Content` (o vídeo pedindo
        // faixa de bytes) no cache devolve pedaço e o player quebra offline.
        if (resposta.ok && resposta.status === 200) cache.put(req, resposta.clone());
        return resposta;
      } catch (e) {
        if (req.mode === 'navigate') {
          const raiz = await cache.match('/conarh');
          if (raiz) return raiz;
        }
        throw e;
      }
    })(),
  );
});
