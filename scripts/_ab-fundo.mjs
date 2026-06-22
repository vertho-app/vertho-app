/**
 * A/B do FUNDO (lowFx): renderiza o MESMO trecho COM o fundo (glow/pontos/vinheta,
 * lowFx=false) e SEM (lowFx=true) e sobe os dois no Bunny p/ comparação visual.
 * (O backdrop-blur da legenda já foi removido dos dois — isto isola só o fundo.)
 *
 * Rodar: node --env-file=.env.local scripts/_ab-fundo.mjs
 */
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { readFileSync, readFile as readFileCb } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const LIB = process.env.BUNNY_LIBRARY_ID, BKEY = process.env.BUNNY_STREAM_API_KEY;
const BUNDLE = path.resolve('spike-bundle');
const props = JSON.parse(readFileSync('scripts/_inputprops-pilot.json', 'utf8'));
const RANGE = [500, 799];   // ~10s de scenario_card: card sobre o fundo (glow/pontos/vinheta visíveis)
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function bunny(buf, title) {
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, { method: 'POST', headers: { AccessKey: BKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  const { guid } = await cr.json();
  await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { method: 'PUT', headers: { AccessKey: BKEY }, body: buf });
  return guid;
}

await ensureBrowser();

async function renderAB(lowFx, label) {
  const inputProps = { ...props, lowFx };
  const comp = await selectComposition({ serveUrl: BUNDLE, id: 'VerthoVideo', inputProps });
  const out = `C:/Users/rdnav/Downloads/_ab-${label}.mp4`;
  log(`render ${label} (lowFx=${lowFx})…`);
  await renderMedia({ serveUrl: BUNDLE, composition: comp, codec: 'h264', outputLocation: out, concurrency: 4, chromiumOptions: { gl: 'swangle' }, inputProps, frameRange: RANGE });
  const guid = await bunny(await readFile(out), `A/B fundo — ${label}`);
  log(`${label} → https://iframe.mediadelivery.net/play/${LIB}/${guid}`);
}

await renderAB(false, 'COM-fundo');
await renderAB(true, 'SEM-fundo-lowFx');
log('pronto.');
