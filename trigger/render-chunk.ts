import { task } from '@trigger.dev/sdk';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = 'video-render-tmp';

async function resolveBundle(): Promise<string> {
  for (const c of [path.join(process.cwd(), 'spike-bundle'), path.resolve('spike-bundle'), '/app/spike-bundle']) {
    try { await access(path.join(c, 'index.html')); return c; } catch { /* próximo */ }
  }
  throw new Error('bundle não encontrado (cwd=' + process.cwd() + ')');
}

/**
 * Renderiza UM pedaço (frameRange) da composição e sobe a parte no Supabase
 * Storage (video-render-tmp/{jobId}/part-NNN.mp4). O orquestrador (render-video)
 * baixa as partes e concatena. Cada chunk roda na sua própria máquina (paralelo).
 */
export const renderChunkTask = task({
  id: 'render-chunk',
  machine: 'large-2x',
  maxDuration: 1800,
  run: async (p: { composition: string; frameRange: [number, number]; jobId: string; index: number; inputProps?: any }) => {
    const bundle = await resolveBundle();
    await ensureBrowser();
    const composition = await selectComposition({ serveUrl: bundle, id: p.composition, inputProps: p.inputProps || {} });

    const out = `/tmp/part-${p.index}.mp4`;
    await renderMedia({
      serveUrl: bundle,
      composition,
      codec: 'h264',
      outputLocation: out,
      concurrency: 4,
      chromiumOptions: { gl: 'swangle' },
      timeoutInMilliseconds: 120000,
      frameRange: p.frameRange,
      inputProps: p.inputProps || {},
    });

    const buf = await readFile(out);
    const objPath = `${p.jobId}/part-${String(p.index).padStart(3, '0')}.mp4`;
    const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${objPath}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
      body: buf as any,
    });
    if (!r.ok) throw new Error(`upload part ${p.index}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return { index: p.index, path: objPath, bytes: buf.length, frames: p.frameRange[1] - p.frameRange[0] + 1 };
  },
});
