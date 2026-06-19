import { task } from '@trigger.dev/sdk';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { readFile } from 'node:fs/promises';
import { resolveBundle, storagePut } from '../lib/video/render-helpers';

const BUCKET = 'video-render-tmp';

/**
 * Renderiza UM pedaço (frameRange) da composição e sobe a parte no Supabase
 * Storage (video-render-tmp/{jobId}/part-NNN.mp4). O orquestrador (render-video)
 * baixa as partes e concatena. Cada chunk roda na sua própria máquina (paralelo).
 */
export const renderChunkTask = task({
  id: 'render-chunk',
  machine: 'large-2x',
  maxDuration: 1800,
  run: async (p: { composition: string; frameRange: [number, number]; jobId: string; index: number; inputProps?: any; scale?: number }) => {
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
      // scale < 1 = downscale do output (ex.: 0.6667 → 1080p design vira 720p).
      // Mantém o layout (design em 1920x1080) e reduz pixels processados/encode.
      ...(p.scale && p.scale !== 1 ? { scale: p.scale } : {}),
    });

    const buf = await readFile(out);
    const objPath = `${p.jobId}/part-${String(p.index).padStart(3, '0')}.mp4`;
    await storagePut(BUCKET, objPath, buf, 'video/mp4');
    return { index: p.index, path: objPath, bytes: buf.length, frames: p.frameRange[1] - p.frameRange[0] + 1 };
  },
});
