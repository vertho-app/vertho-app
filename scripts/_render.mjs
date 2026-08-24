import pg from 'pg';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { personalizar, primeiroNome } from '../worker-hetzner/personalizar.mjs';
import { sslSupabase } from './_pg-ssl.mjs';

const ID = '710538a8-48b9-4b62-bf15-ce348d5652d7';
const LIB = process.env.BUNNY_LIBRARY_ID, BKEY = process.env.BUNNY_STREAM_API_KEY;
const BUNDLE = path.resolve('worker-hetzner/spike-bundle');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: sslSupabase(), max: 2 });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function bunny(buf, title) {
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, { method: 'POST', headers: { AccessKey: BKEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
  const { guid } = await cr.json();
  await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { method: 'PUT', headers: { AccessKey: BKEY }, body: buf });
  return guid;
}

async function main() {
  const { rows } = await pool.query("SELECT roteiro, render_inputprops, render_scale, empresa_id, cargo, disc_dominante FROM videos_gerados WHERE id=$1", [ID]);
  const r = rows[0];
  const props = r.render_inputprops;
  const scale = Number(r.render_scale) || 1;
  log('captions:', props.captions?.length, '| cenas c/ fala:', props.scenes.filter(s => s.speechStartFrame != null).length, '| scale', scale, '| dims', props.width + 'x' + props.height);
  await ensureBrowser();
  const comp = await selectComposition({ serveUrl: BUNDLE, id: 'VerthoVideo', inputProps: props });
  const OUT = 'C:/Users/rdnav/Downloads/deck-HD.mp4';
  await renderMedia({ serveUrl: BUNDLE, composition: comp, codec: 'h264', outputLocation: OUT, concurrency: Math.max(2, os.cpus().length - 2), chromiumOptions: { gl: 'swangle' }, inputProps: props, scale });
  const buf = await readFile(OUT);
  log('deck OK', (buf.length / 1e6).toFixed(1) + 'MB');
  const guid = await bunny(buf, (props.title || r.roteiro?.title || 'Vertho') + ' HD');
  log('DECK  → https://iframe.mediadelivery.net/play/' + LIB + '/' + guid);

  const disc = String(r.disc_dominante || '').trim().charAt(0).toUpperCase();
  const { rows: cs } = await pool.query(
    "SELECT id, nome_completo FROM colaboradores WHERE empresa_id=$1 AND cargo=$2 AND upper(left(coalesce(perfil_dominante,''),1))=$3 AND nome_completo ILIKE 'B%' LIMIT 1",
    [r.empresa_id, r.cargo, disc]);
  if (cs[0]) {
    const c = cs[0];
    const persoOut = 'C:/Users/rdnav/Downloads/personalizado-HD.mp4';
    await personalizar(OUT, c.nome_completo, persoOut, { bundleDir: BUNDLE, brand: props.brand, width: props.width, height: props.height, jobId: ID, colaboradorId: c.id });
    const pbuf = await readFile(persoOut);
    const pg2 = await bunny(pbuf, primeiroNome(c.nome_completo) + ' HD');
    log('PERSO → https://iframe.mediadelivery.net/play/' + LIB + '/' + pg2);
  }
  await pool.query("UPDATE videos_gerados SET status='done', etapa='upload', video_url=$2 WHERE id=$1", [ID, 'https://iframe.mediadelivery.net/play/' + LIB + '/' + guid]);
  await pool.end();
  log('FIM');
}
main().catch(e => { console.error('ERRO', e?.stack || e?.message || e); process.exit(1); });
