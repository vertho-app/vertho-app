/**
 * Benchmark de custo de render: mede s/frame da composição ATUAL (lowFx=false)
 * vs com os efeitos caros desligados (lowFx=true), num trecho de miolo (slides,
 * sem avatar). Mesmo bundle, mesmo frameRange, mesma concorrência → o ganho
 * relativo transfere pra box.
 *
 * Rodar: node scripts/_bench-render.mjs
 */
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BUNDLE = path.resolve('spike-bundle');
const props = JSON.parse(readFileSync('scripts/_inputprops-pilot.json', 'utf8'));
const RANGE = [500, 899];           // 400 frames de scene-2 (scenario_card): fundo + legenda, sem avatar
const CONC = 4;                     // fixa p/ comparar maçã-com-maçã
const N = RANGE[1] - RANGE[0] + 1;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

await ensureBrowser();

async function run(lowFx) {
  const inputProps = { ...props, lowFx };
  const comp = await selectComposition({ serveUrl: BUNDLE, id: 'VerthoVideo', inputProps });
  const out = `C:/Users/rdnav/Downloads/_bench-${lowFx ? 'low' : 'full'}.mp4`;
  const t0 = Date.now();
  await renderMedia({
    serveUrl: BUNDLE, composition: comp, codec: 'h264', outputLocation: out,
    concurrency: CONC, chromiumOptions: { gl: 'swangle' }, inputProps,
    frameRange: RANGE, // 1080p nativo (sem scale) p/ medir o pior caso
  });
  const sec = (Date.now() - t0) / 1000;
  return { sec, perFrame: sec / N };
}

log(`benchmark: ${N} frames (1080p, conc ${CONC}), range ${RANGE.join('-')}`);
log('rodando BASELINE (lowFx=false)…');
const full = await run(false);
log(`BASELINE: ${full.sec.toFixed(1)}s · ${full.perFrame.toFixed(3)}s/frame`);
log('rodando OTIMIZADO (lowFx=true)…');
const low = await run(true);
log(`OTIMIZADO: ${low.sec.toFixed(1)}s · ${low.perFrame.toFixed(3)}s/frame`);

const speedup = full.sec / low.sec;
const saved = (1 - low.sec / full.sec) * 100;
log('================ RESULTADO ================');
log(`speedup: ${speedup.toFixed(2)}× · redução de tempo/custo de render: ${saved.toFixed(0)}%`);
log(`extrapolando o deck 1080p ($0,43): cairia p/ ~$${(0.43 * low.sec / full.sec).toFixed(2)}`);
