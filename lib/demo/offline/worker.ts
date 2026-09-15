/// <reference lib="webworker" />
import {
  BASE,
  CACHE_PREFIX,
  META_CACHE,
  installedPackage,
  byteRange,
} from "./cache";
const worker = self as unknown as ServiceWorkerGlobalScope;
worker.addEventListener("install", (event) =>
  event.waitUntil(worker.skipWaiting()),
);
worker.addEventListener("activate", (event) =>
  event.waitUntil(worker.clients.claim()),
);

worker.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache auth, API traffic, live dashboard or push resources.
  if (
    event.request.method !== "GET" ||
    url.origin !== worker.location.origin ||
    !url.pathname.startsWith(BASE)
  )
    return;
  // Explicit preparation must fetch the new build, not the installed old shell.
  if (event.request.cache === "no-store") return;
  if (url.pathname === `${BASE}package.json` || url.pathname === `${BASE}sw.js`)
    return;
  event.respondWith(
    (async () => {
      const pack = await installedPackage();
      const path = url.pathname === BASE ? `${BASE}index.html` : url.pathname;
      let response = pack
        ? await (await caches.open(pack.cacheName)).match(path)
        : undefined;
      // An older open tab can still use its content-hashed JS/CSS/fonts.
      if (!response && /\.[a-f0-9]{16}\.(js|css|woff2)$/.test(path)) {
        for (const key of await caches.keys()) {
          if (key.startsWith(CACHE_PREFIX) && key !== META_CACHE)
            response ||= await (await caches.open(key)).match(path);
        }
      }
      if (!response) {
        // The app never pretends missing local media are available online.
        if (path.startsWith(`${BASE}media/`))
          return new Response(
            "Prepare a apresentação para baixar este conteúdo.",
            { status: 503 },
          );
        return fetch(event.request);
      }
      const range = event.request.headers.get("range");
      if (!range) return response;
      const blob = await response.blob();
      const parsed = byteRange(range, blob.size);
      if (!parsed)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${blob.size}` },
        });
      return new Response(blob.slice(parsed.start, parsed.end + 1, blob.type), {
        status: 206,
        headers: {
          "Content-Type": blob.type,
          "Accept-Ranges": "bytes",
          "Content-Length": String(parsed.end - parsed.start + 1),
          "Content-Range": `bytes ${parsed.start}-${parsed.end}/${blob.size}`,
        },
      });
    })(),
  );
});
