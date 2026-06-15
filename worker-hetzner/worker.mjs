/**
 * Worker de render de vídeo — Vertho (always-on, modelo PULL).
 *
 * Roda numa VPS Hetzner (CX33) e faz POLL na fila do Supabase: pega um job
 * `render_queued`, renderiza a composição Remotion (VerthoVideo) com os inputProps
 * já prontos, sobe o mp4 no Bunny Stream e marca `done`. Sem endpoint público:
 * só conexões de saída (Postgres + Bunny). Reaproveita a MESMA composição/bundle
 * do trigger.dev — só muda o "onde renderiza".
 *
 * Concorrência: claim atômico via `FOR UPDATE SKIP LOCKED` (seguro com N workers).
 * Resiliência: reaper devolve jobs presos em `rendering` à fila; o processo é
 * idempotente e reinicia limpo (docker --restart=always / systemd).
 */
import pg from 'pg';
import os from 'node:os';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';

const {
  DATABASE_URL,
  BUNNY_LIBRARY_ID: BUNNY_LIB,
  BUNNY_STREAM_API_KEY: BUNNY_KEY,
  POLL_INTERVAL_MS = '15000',
  REAP_AFTER_MIN = '40',
  RENDER_CONCURRENCY,
  VIDEO_RENDER_SCALE = '0.6667', // 0.6667 = 720p · 1.0 = 1080p (fallback)
  COMPOSITION_ID = 'VerthoVideo',
} = process.env;

const POLL = parseInt(POLL_INTERVAL_MS, 10);
const CONCURRENCY = parseInt(RENDER_CONCURRENCY || String(Math.max(1, os.cpus().length)), 10);
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

let bundleDir = null;
async function resolveBundle() {
  if (bundleDir) return bundleDir;
  for (const c of [path.join(process.cwd(), 'spike-bundle'), '/app/spike-bundle', path.resolve('spike-bundle')]) {
    try { await access(path.join(c, 'index.html')); bundleDir = c; return c; } catch { /* próximo */ }
  }
  throw new Error('bundle Remotion não encontrado (esperado em ./spike-bundle)');
}

/** Sobe o mp4 final no Bunny Stream → retorna o GUID. */
async function uploadToBunny(buf, title) {
  const cr = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos`, {
    method: 'POST', headers: { AccessKey: BUNNY_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (!cr.ok) throw new Error(`bunny create ${cr.status}: ${(await cr.text()).slice(0, 200)}`);
  const { guid } = await cr.json();
  const up = await fetch(`https://video.bunnycdn.com/library/${BUNNY_LIB}/videos/${guid}`, {
    method: 'PUT', headers: { AccessKey: BUNNY_KEY }, body: buf,
  });
  if (!up.ok) throw new Error(`bunny upload ${up.status}: ${(await up.text()).slice(0, 200)}`);
  return guid;
}

/** Claim atômico de um job da fila (nunca 2 workers no mesmo job). */
async function claim() {
  const { rows } = await pool.query(`
    UPDATE videos_gerados SET status='rendering', etapa='render', claimed_at=now(), updated_at=now()
    WHERE id = (
      SELECT id FROM videos_gerados WHERE status='render_queued'
      ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    RETURNING id, render_inputprops, render_scale, roteiro`);
  return rows[0] || null;
}

/** Devolve jobs presos em `rendering` (worker morreu no meio) à fila. */
async function reap() {
  const { rowCount } = await pool.query(
    `UPDATE videos_gerados SET status='render_queued', claimed_at=null, updated_at=now()
     WHERE status='rendering' AND claimed_at < now() - ($1 || ' minutes')::interval`,
    [REAP_AFTER_MIN],
  );
  if (rowCount) log(`reaper: ${rowCount} job(s) preso(s) devolvido(s) à fila`);
}

async function renderOne(job) {
  const props = job.render_inputprops;
  if (!props?.scenes?.length) throw new Error('render_inputprops vazio/ inválido');
  const scale = job.render_scale != null ? Number(job.render_scale) : Number(VIDEO_RENDER_SCALE);
  const bundle = await resolveBundle();
  const title = job.roteiro?.title || `Vertho · ${job.id}`;

  log(`render ${job.id}: ${props.scenes.length} cenas · ${props.totalFrames} frames · scale ${scale} · concurrency ${CONCURRENCY}`);
  await ensureBrowser();
  const composition = await selectComposition({ serveUrl: bundle, id: COMPOSITION_ID, inputProps: props });

  const out = `/tmp/${job.id}.mp4`;
  const t0 = Date.now();
  await renderMedia({
    serveUrl: bundle, composition, codec: 'h264', outputLocation: out,
    concurrency: CONCURRENCY, chromiumOptions: { gl: 'swangle' }, inputProps: props,
    ...(scale && scale !== 1 ? { scale } : {}),
  });
  const buf = await readFile(out);
  log(`render ${job.id} OK em ${Math.round((Date.now() - t0) / 1000)}s · ${(buf.length / 1e6).toFixed(1)}MB · subindo no Bunny…`);

  const guid = await uploadToBunny(buf, title);
  const videoUrl = `https://iframe.mediadelivery.net/play/${BUNNY_LIB}/${guid}`;
  await pool.query(
    `UPDATE videos_gerados SET status='done', etapa='upload', video_url=$2, bunny_video_id=$3, bunny_library=$4, error=null, updated_at=now() WHERE id=$1`,
    [job.id, videoUrl, guid, BUNNY_LIB],
  );
  log(`DONE ${job.id} → ${videoUrl}`);
}

let parando = false;
process.on('SIGTERM', () => { parando = true; log('SIGTERM — encerrando após o job atual'); });
process.on('SIGINT', () => { parando = true; log('SIGINT — encerrando após o job atual'); });

async function main() {
  if (!DATABASE_URL || !BUNNY_LIB || !BUNNY_KEY) {
    console.error('Faltam env vars: DATABASE_URL, BUNNY_LIBRARY_ID, BUNNY_STREAM_API_KEY');
    process.exit(1);
  }
  log(`worker iniciado · poll ${POLL}ms · concurrency ${CONCURRENCY} · scale fallback ${VIDEO_RENDER_SCALE}`);
  while (!parando) {
    try {
      await reap();
      const job = await claim();
      if (!job) { await sleep(POLL); continue; }
      try {
        await renderOne(job);
      } catch (e) {
        log(`ERRO no job ${job.id}:`, e?.message || e);
        await pool.query(`UPDATE videos_gerados SET status='error', error=$2, updated_at=now() WHERE id=$1`,
          [job.id, String(e?.message || e).slice(0, 500)]).catch(() => {});
      }
    } catch (e) {
      log('erro no loop (segue):', e?.message || e);
      await sleep(POLL);
    }
  }
  await pool.end().catch(() => {});
  log('worker encerrado');
  process.exit(0);
}

main();
