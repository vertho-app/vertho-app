/**
 * Demo dos ÍCONES SEMÂNTICOS: injeta `icons` (vocabulário) nas cenas concept_reveal
 * e icon_story do piloto e renderiza os dois trechos → Bunny, p/ ver os ícones
 * casando com o conteúdo (vs o antigo fixo-por-posição).
 *
 * Rodar: node --env-file=.env.local scripts/_icons-demo.mjs
 */
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const LIB = process.env.BUNNY_LIBRARY_ID, BKEY = process.env.BUNNY_STREAM_API_KEY;
const BUNDLE = path.resolve('spike-bundle');
const props = JSON.parse(readFileSync('scripts/_inputprops-pilot.json', 'utf8'));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// injeta ícones semânticos casando com os bullets/items reais
for (const s of props.scenes) {
  if (s.type === 'concept_reveal') s.icons = ['direcao', 'foco', 'analisar'];          // direção / foco na sala / decidir por evidências
  if (s.type === 'icon_story')     s.icons = ['protecao', 'observar', 'equipe'];        // proteger tempo / observar e devolver / liderança coletiva
}

async function bunny(buf, title) {
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, { method: 'POST', headers: { AccessKey: BKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  const { guid } = await cr.json();
  await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { method: 'PUT', headers: { AccessKey: BKEY }, body: buf });
  return guid;
}

await ensureBrowser();
const comp = await selectComposition({ serveUrl: BUNDLE, id: 'VerthoVideo', inputProps: props });

async function clip(range, label) {
  const out = `C:/Users/rdnav/Downloads/_icons-${label}.mp4`;
  log(`render ${label} (frames ${range.join('-')})…`);
  await renderMedia({ serveUrl: BUNDLE, composition: comp, codec: 'h264', outputLocation: out, concurrency: 4, chromiumOptions: { gl: 'swangle' }, inputProps: props, frameRange: range });
  const guid = await bunny(await readFile(out), `Ícones semânticos — ${label}`);
  log(`${label} → https://iframe.mediadelivery.net/play/${LIB}/${guid}`);
}

await clip([2619, 2920], 'concept_draw');   // do INÍCIO da cena → ícones se desenhando
await clip([6247, 6560], 'iconstory_draw'); // do INÍCIO da cena → ícones se desenhando
log('pronto.');
