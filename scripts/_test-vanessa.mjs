/**
 * Teste pontual da SAUDAÇÃO nominal — roda o MESMO renderizador que o trigger
 * agora usa (`worker-hetzner/personalizar.mjs`) com nome fixo "Vanessa" contra o
 * deck masterizado do piloto, e sobe no Bunny. Valida visualmente a saudação com
 * o nome pedido, usando o código de produção.
 *
 * Rodar: node --env-file=.env.local scripts/_test-vanessa.mjs   (de nextjs-app)
 */
import { personalizar } from '../worker-hetzner/personalizar.mjs';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const LIB = process.env.BUNNY_LIBRARY_ID, BKEY = process.env.BUNNY_STREAM_API_KEY;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function bunny(buf, title) {
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, {
    method: 'POST', headers: { AccessKey: BKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  const { guid } = await cr.json();
  const up = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, {
    method: 'PUT', headers: { AccessKey: BKEY }, body: buf,
  });
  if (!up.ok) throw new Error(`bunny upload ${up.status}`);
  return guid;
}

const DECK = 'C:/Users/rdnav/Downloads/deck-PILOTO-som-voz.mp4';
const BUNDLE = path.resolve('spike-bundle');
const OUT = 'C:/Users/rdnav/Downloads/deck-VANESSA.mp4';

await access(DECK);
await access(path.join(BUNDLE, 'index.html'));
log('deck:', DECK, '· bundle:', BUNDLE);
log('gerando saudação "Olá, Vanessa!" + prepend no deck (mesmo código do trigger)…');

await personalizar(DECK, 'Vanessa', OUT, {
  bundleDir: BUNDLE,
  voice: 'Vindemiatrix',            // MESMA voz da narração/avatar (continuidade)
  width: 1920, height: 1080,        // design; scale deriva da altura real do deck (720)
  jobId: 'test-vanessa', colaboradorId: 'vanessa',
});

const buf = await readFile(OUT);
log('render+concat OK', (buf.length / 1e6).toFixed(1) + 'MB · subindo no Bunny…');
const guid = await bunny(buf, 'TESTE saudação — Olá, Vanessa (Vindemiatrix, natural v2)');
log('PRONTO → https://iframe.mediadelivery.net/play/' + LIB + '/' + guid);
