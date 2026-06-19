import { task } from '@trigger.dev/sdk';
import { renderChunkTask } from './render-chunk';
import { writeFile, readFile, stat, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { uploadToBunny, storageGet, storageDelete, BUNNY_LIB, BUNNY_KEY } from '../lib/video/render-helpers';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const BUCKET = 'video-render-tmp';

/** Divide [0, frames) em `chunks` faixas contíguas. */
function splitRanges(frames: number, chunks: number): [number, number][] {
  const per = Math.ceil(frames / chunks);
  const ranges: [number, number][] = [];
  for (let i = 0; i < chunks; i++) {
    const a = i * per;
    if (a >= frames) break;
    ranges.push([a, Math.min(frames - 1, a + per - 1)]);
  }
  return ranges;
}

/**
 * Orquestra o render em CHUNKS paralelos: fatia em N faixas, dispara N
 * render-chunk (cada um na sua máquina), baixa as partes do Storage e concatena
 * com ffmpeg → mp4 final em /tmp. (Upload p/ Bunny entra no próximo passo.)
 *
 * `frames` vem do caller (metadata da composição). `chunks` = paralelismo.
 */
export const renderVideoTask = task({
  id: 'render-video',
  machine: 'medium-1x',
  maxDuration: 3600, // espera os chunks (que podem enfileirar conforme a concorrência)
  run: async (p: { composition?: string; frames: number; chunks?: number; jobId?: string; inputProps?: any; title?: string; chunkMachine?: string; scale?: number }) => {
    const compId = p.composition || 'VerthoVideoSpikeV3';
    const jobId = p.jobId || `job-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const chunks = Math.max(1, p.chunks ?? 6);
    const ranges = splitRanges(p.frames, chunks);

    // 1) fan-out — renderiza as faixas em paralelo. `chunkMachine` permite
    //    override da máquina dos chunks; `scale` faz downscale (ex.: 720p).
    const batch = await renderChunkTask.batchTriggerAndWait(
      ranges.map((frameRange, index) => ({
        payload: { composition: compId, frameRange, jobId, index, inputProps: p.inputProps, scale: p.scale },
        options: p.chunkMachine ? { machine: p.chunkMachine as any } : undefined,
      })),
    );
    const parts = batch.runs.map((run: any, i: number) => {
      if (!run.ok) throw new Error(`chunk ${i} falhou: ${JSON.stringify(run.error).slice(0, 200)}`);
      return run.output as { index: number; path: string; bytes: number };
    }).sort((a, b) => a.index - b.index);

    // 2) baixa as partes do Storage.
    const dir = `/tmp/${jobId}`;
    await mkdir(dir, { recursive: true });
    const localPaths: string[] = [];
    for (const part of parts) {
      const local = path.join(dir, `part-${String(part.index).padStart(3, '0')}.mp4`);
      await writeFile(local, await storageGet(BUCKET, part.path));
      localPaths.push(local);
    }

    // 3) concat com ffmpeg (-c copy; fallback re-encode se os params não casarem).
    const listFile = path.join(dir, 'concat.txt');
    await writeFile(listFile, localPaths.map((f) => `file '${f}'`).join('\n'));
    const out = `/tmp/${jobId}-final.mp4`;
    try {
      await exec(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', out]);
    } catch {
      await exec(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out]);
    }

    const s = await stat(out);

    // 4) upload pro Bunny Stream (se as credenciais estiverem no ambiente).
    let bunnyVideoId: string | null = null;
    if (BUNNY_LIB && BUNNY_KEY) {
      bunnyVideoId = await uploadToBunny(await readFile(out), p.title || `Vertho · ${jobId}`);
    }

    await rm(dir, { recursive: true, force: true }).catch(() => {});
    // limpa as partes intermediárias do Storage (cada objeto; Storage não apaga "pasta").
    await Promise.all(parts.map((part) => storageDelete(BUCKET, part.path)));
    return { ok: true, jobId, chunks: parts.length, frames: p.frames, bytes: s.size, bunnyVideoId, bunnyLibrary: BUNNY_LIB || null };
  },
});
