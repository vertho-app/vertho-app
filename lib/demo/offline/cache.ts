import type { OfflineAsset, OfflinePackage } from "./types";
import { ENVIRONMENT } from "./environment";

export const BASE = ENVIRONMENT.base;
export const CACHE_PREFIX = ENVIRONMENT.cachePrefix;
export const META_CACHE = `${CACHE_PREFIX}meta`;
export const ACTIVE_KEY = `${BASE}_active`;
export type InstalledPackage = OfflinePackage & {
  cacheName: string;
  installedAt: string;
};

export async function digest(bytes: ArrayBuffer): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function validatePackage(pack: OfflinePackage) {
  if (
    !pack ||
    !/^[a-f0-9]{16}$/.test(pack.version) ||
    !Array.isArray(pack.assets) ||
    pack.assets.length < 5
  )
    throw new Error("Pacote inválido. Recarregue a página com internet.");
  const paths = new Set<string>();
  for (const asset of pack.assets) {
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/.test(asset.path) ||
      asset.path.includes("..") ||
      paths.has(asset.path) ||
      !/^[a-f0-9]{64}$/.test(asset.sha256) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes <= 0
    )
      throw new Error("Arquivo inválido no pacote.");
    const url = new URL(asset.source, location.origin);
    const local =
      url.origin === location.origin && url.pathname.startsWith(BASE);
    const media =
      url.protocol === "https:" &&
      (url.hostname.endsWith(".b-cdn.net") ||
        url.hostname === "xwuqrgrvakxtphbmudwj.supabase.co");
    if (!local && !media) throw new Error("Origem de arquivo não permitida.");
    paths.add(asset.path);
  }
  if (!paths.has("index.html"))
    throw new Error("O pacote não contém a tela inicial.");
}

export async function installedPackage(): Promise<InstalledPackage | null> {
  const response = await (await caches.open(META_CACHE)).match(ACTIVE_KEY);
  if (!response) return null;
  const pack = (await response.json()) as InstalledPackage;
  validatePackage(pack);
  if (
    !pack.cacheName?.startsWith(CACHE_PREFIX) ||
    pack.cacheName === META_CACHE
  )
    return null;
  return pack;
}

export async function verifyPackage(
  pack: InstalledPackage,
  report?: (label: string) => void,
) {
  const cache = await caches.open(pack.cacheName);
  for (const asset of pack.assets) {
    report?.(asset.label);
    const response = await cache.match(BASE + asset.path);
    if (!response)
      throw new Error(
        `Falta baixar: ${asset.label}. Prepare o pacote novamente.`,
      );
    const bytes = await response.arrayBuffer();
    if (
      bytes.byteLength !== asset.bytes ||
      (await digest(bytes)) !== asset.sha256
    )
      throw new Error(
        `Arquivo incompleto: ${asset.label}. Prepare o pacote novamente.`,
      );
  }
}

async function download(
  asset: OfflineAsset,
  signal: AbortSignal,
  progress: (bytes: number) => void,
) {
  const response = await fetch(asset.source, {
    signal,
    cache: "no-store",
    credentials: "omit",
  });
  if (response.status !== 200 || !response.body)
    throw new Error(
      `Não foi possível baixar ${asset.label}. Tente novamente no Wi-Fi.`,
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > asset.bytes) {
      await reader.cancel();
      throw new Error(`O arquivo ${asset.label} mudou. Atualize o pacote.`);
    }
    chunks.push(value);
    progress(length);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  if (length !== asset.bytes || (await digest(buffer.buffer)) !== asset.sha256)
    throw new Error(`Download incompleto: ${asset.label}. Tente novamente.`);
  return new Response(buffer, {
    headers: { "Content-Type": asset.type, "Content-Length": String(length) },
  });
}

/** All-or-nothing: the active pointer changes only AFTER every file verifies.
 * Cancellation/quota/network errors leave the previous presentation usable. */
export async function preparePackage(
  pack: OfflinePackage,
  signal: AbortSignal,
  progress: (done: number, total: number, label: string) => void,
) {
  if (navigator.locks)
    return navigator.locks.request(`${CACHE_PREFIX}prepare`, { signal }, () =>
      downloadPackage(pack, signal, progress, true),
    );
  return downloadPackage(pack, signal, progress, false);
}

async function downloadPackage(
  pack: OfflinePackage,
  signal: AbortSignal,
  progress: (done: number, total: number, label: string) => void,
  mayClean: boolean,
) {
  validatePackage(pack);
  const old = await installedPackage();
  const total = pack.assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const estimate = await navigator.storage?.estimate?.();
  if (estimate?.quota && estimate.quota - (estimate.usage || 0) < total * 1.15)
    throw new Error(
      "Não há espaço suficiente. Libere espaço no aparelho e tente novamente.",
    );
  const cacheName = `${CACHE_PREFIX}${pack.version}-${crypto.randomUUID()}`;
  const cache = await caches.open(cacheName);
  let done = 0;
  try {
    for (const asset of pack.assets) {
      signal.throwIfAborted();
      // Reuse only bytes whose hash was checked, never an opaque CDN response.
      const previous = old?.assets.find(
        (item) => item.path === asset.path && item.sha256 === asset.sha256,
      );
      let response = previous
        ? await (await caches.open(old!.cacheName)).match(BASE + asset.path)
        : undefined;
      if (
        response &&
        (await digest(await response.clone().arrayBuffer())) !== asset.sha256
      )
        response = undefined;
      if (!response)
        response = await download(asset, signal, (bytes) =>
          progress(done + bytes, total, asset.label),
        );
      await cache.put(BASE + asset.path, response);
      done += asset.bytes;
      progress(done, total, asset.label);
    }
    const installed = {
      ...pack,
      cacheName,
      installedAt: new Date().toISOString(),
    };
    await verifyPackage(installed);
    signal.throwIfAborted();
    await (
      await caches.open(META_CACHE)
    ).put(ACTIVE_KEY, Response.json(installed));
    // Keep the previous verified package for open tabs; never touch other caches.
    if (mayClean)
      await caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith(CACHE_PREFIX) &&
                  key !== META_CACHE &&
                  key !== cacheName &&
                  key !== old?.cacheName,
              )
              .map((key) => caches.delete(key)),
          ),
        )
        .catch(() => {});
    return installed;
  } catch (error) {
    await caches.delete(cacheName);
    throw error;
  }
}

/** Byte ranges are needed by native audio/video seeking (including Safari). */
export function byteRange(
  header: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start <= end &&
    start < size
    ? { start, end }
    : null;
}
