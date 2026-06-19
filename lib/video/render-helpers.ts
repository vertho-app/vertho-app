/**
 * Helpers compartilhados das tasks de render do trigger.dev (render-video,
 * render-chunk, gerar-video-modulo). Centraliza resolução do bundle Remotion,
 * upload no Bunny Stream e I/O de Storage — antes duplicados em cada task (D4).
 *
 * ⚠️ FRONTEIRA: o worker do Hetzner (`worker-hetzner/*.mjs`) é outro runtime
 * (ESM puro na box, sem TypeScript) e NÃO importa este módulo — ele mantém as
 * próprias cópias por necessidade. Mudou um helper aqui? Confira o espelho no worker.
 */
import { access } from 'node:fs/promises';
import path from 'node:path';

export const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const BUNNY_LIB = process.env.BUNNY_LIBRARY_ID || '';
export const BUNNY_KEY = process.env.BUNNY_STREAM_API_KEY || '';

/** Acha o bundle Remotion pré-construído (incluído no deploy via additionalFiles). */
export async function resolveBundle(): Promise<string> {
  for (const c of [path.join(process.cwd(), 'spike-bundle'), path.resolve('spike-bundle'), '/app/spike-bundle']) {
    try { await access(path.join(c, 'index.html')); return c; } catch { /* próximo */ }
  }
  throw new Error(`bundle Remotion não encontrado (cwd=${process.cwd()})`);
}

/** Sobe o mp4 final no Bunny Stream → retorna o GUID. */
export async function uploadToBunny(buf: Buffer, title: string): Promise<string> {
  if (!BUNNY_LIB || !BUNNY_KEY) throw new Error('BUNNY_LIBRARY_ID/STREAM_API_KEY ausentes');
  const cr = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos`, {
    method: 'POST', headers: { AccessKey: BUNNY_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (!cr.ok) throw new Error(`bunny create ${cr.status}: ${(await cr.text()).slice(0, 200)}`);
  const { guid } = await cr.json();
  const up = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos/${guid}`, {
    method: 'PUT', headers: { AccessKey: BUNNY_KEY }, body: buf as any,
  });
  if (!up.ok) throw new Error(`bunny upload ${up.status}: ${(await up.text()).slice(0, 200)}`);
  return guid;
}

/** Upsert de um objeto no Storage → URL pública. */
export async function storagePut(bucket: string, objPath: string, buf: Buffer, contentType: string): Promise<string> {
  const r = await fetch(`${SUPA}/storage/v1/object/${bucket}/${objPath}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buf as any,
  });
  if (!r.ok) throw new Error(`storage put ${objPath}: ${r.status} ${(await r.text()).slice(0, 150)}`);
  return `${SUPA}/storage/v1/object/public/${bucket}/${objPath}`;
}

/** Baixa um objeto do Storage. */
export async function storageGet(bucket: string, objPath: string): Promise<Buffer> {
  const r = await fetch(`${SUPA}/storage/v1/object/${bucket}/${objPath}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`storage get ${objPath}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Apaga um objeto do Storage (best-effort). */
export async function storageDelete(bucket: string, objPath: string): Promise<void> {
  await fetch(`${SUPA}/storage/v1/object/${bucket}/${objPath}`, { method: 'DELETE', headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).catch(() => {});
}
