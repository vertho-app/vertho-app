import { task } from '@trigger.dev/sdk';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { stat, access, readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * DE-RISK: prova que o Remotion renderiza headless DENTRO do trigger.dev.
 * Renderiza o bundle pré-construído do spike (incluído na imagem via
 * additionalFiles) → mp4 em /tmp → retorna o tamanho. Bunny fica pro próximo passo.
 *
 * Chrome: libs de sistema vêm do build (installChromeDeps); o binário é baixado
 * por ensureBrowser() em runtime. gl='swangle' = software (container sem GPU).
 */
async function resolveBundle(): Promise<string> {
  const candidatos = [
    path.join(process.cwd(), 'spike-bundle'),
    path.resolve('spike-bundle'),
    '/app/spike-bundle',
  ];
  for (const c of candidatos) {
    try { await access(path.join(c, 'index.html')); return c; } catch { /* próximo */ }
  }
  // diagnóstico: lista o cwd pra achar onde o additionalFiles colocou o bundle
  let cwdList = '';
  try { cwdList = (await readdir(process.cwd())).join(', '); } catch { /* */ }
  throw new Error(`bundle não encontrado. cwd=${process.cwd()} conteúdo=[${cwdList.slice(0, 300)}]`);
}

export const renderSpikeTask = task({
  id: 'render-spike',
  machine: 'large-2x', // 4 vCPU / 8 GB — Remotion render é pesado (OOM na default)
  maxDuration: 1800,
  run: async (payload: { composition?: string; frameRange?: [number, number]; gl?: string; concurrency?: number }) => {
    const compId = payload?.composition || 'VerthoVideoSpikeV3';
    const bundle = await resolveBundle();

    await ensureBrowser();
    const composition = await selectComposition({ serveUrl: bundle, id: compId, inputProps: {} });

    const out = `/tmp/${compId}.mp4`;
    const t0 = Date.now();
    let lastFrame = 0;
    await renderMedia({
      serveUrl: bundle,
      composition,
      codec: 'h264',
      outputLocation: out,
      concurrency: payload?.concurrency ?? 2,
      chromiumOptions: { gl: (payload?.gl as any) ?? 'swangle' },
      timeoutInMilliseconds: 120000,
      frameRange: payload?.frameRange,
      onProgress: ({ renderedFrames }) => { lastFrame = renderedFrames; },
    });

    const s = await stat(out);
    const secs = (Date.now() - t0) / 1000;
    const frames = payload?.frameRange ? payload.frameRange[1] - payload.frameRange[0] + 1 : composition.durationInFrames;
    return { ok: true, composition: compId, bytes: s.size, frames, lastFrame, renderSeconds: Math.round(secs), msPerFrame: Math.round((secs * 1000) / Math.max(1, frames)) };
  },
});
