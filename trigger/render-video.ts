import { task } from '@trigger.dev/sdk';
import { renderChunkTask } from './render-chunk';
import { writeFile, readFile, stat, mkdir, rm, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { uploadToBunny, storageGet, storageDelete, resolveBundle, SUPA, KEY, BUNNY_LIB, BUNNY_KEY } from '../lib/video/render-helpers';
// @ts-ignore — .mjs portável (mesmo passo do worker Hetzner e do piloto), sem tipos.
import { masterizarAudio } from '../lib/video/masterizar-audio.mjs';
// @ts-ignore — reusa o MESMO renderizador de saudação do worker (ESM puro, sem cópia nova).
import { personalizar, primeiroNome } from '../worker-hetzner/personalizar.mjs';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const BUCKET = 'video-render-tmp';

/** Resolve o arquivo de TRILHA (bed) p/ a masterização. `null` = não achou →
 *  masterização é pulada (degrada p/ áudio cru; o render NÃO quebra). */
async function resolveBed(): Promise<string | null> {
  // O bed viaja no bundle (additionalFiles 'spike-bundle/**'); publicDir=public/video-spike
  // → dentro do bundle vira public/audio/bed-respiro.mp3. resolveBundle acha o bundle
  // onde quer que esteja (cwd ou /app).
  const bundleBed = await resolveBundle().then((b) => path.join(b, 'public', 'audio', 'bed-respiro.mp3')).catch(() => null);
  const cands = [
    process.env.BED_RESPIRO_PATH,
    bundleBed,
    path.join(process.cwd(), 'public', 'video-spike', 'audio', 'bed-respiro.mp3'),
    path.join(process.cwd(), 'bed-respiro.mp3'),
  ].filter(Boolean) as string[];
  for (const c of cands) {
    try { await access(c); return c; } catch { /* próximo */ }
  }
  return null;
}

/** Masteriza o áudio (trilha + ducking + -14 LUFS). Em qualquer falha devolve o
 *  arquivo cru — engenharia de áudio nunca derruba o render. */
async function masterizarSeguro(videoIn: string, jobId: string): Promise<string> {
  const bed = await resolveBed();
  if (!bed) { console.warn(`[${jobId}] masterização pulada (bed-respiro.mp3 ausente) — áudio cru`); return videoIn; }
  const out = videoIn.replace(/\.mp4$/, '') + '-master.mp4';
  try {
    await masterizarAudio({ videoIn, bedRespiro: bed, videoOut: out });
    return out;
  } catch (e: any) {
    console.warn(`[${jobId}] masterização falhou → áudio cru:`, e?.message || e);
    return videoIn;
  }
}

/** GET no PostgREST (o worker usa `pg`; aqui no trigger usamos REST como o resto das tasks). */
async function pgGet(query: string): Promise<any[]> {
  const r = await fetch(`${SUPA}/rest/v1/${query}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`pgGet ${query.slice(0, 60)}: ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

/** Upsert de uma linha de videos_personalizados (conflito em cell_video_id,colaborador_id). */
async function upsertPerso(videoId: string, colabId: string, fields: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPA}/rest/v1/videos_personalizados?on_conflict=cell_video_id,colaborador_id`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ cell_video_id: videoId, colaborador_id: colabId, ...fields, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`upsertPerso: ${r.status} ${(await r.text()).slice(0, 120)}`);
}

/**
 * Personalização nominal (Rota A) no caminho TRIGGER — espelha `personalizeCell`
 * do worker Hetzner, mas via PostgREST (o worker usa `pg`). Prepend "Olá, {nome}"
 * por colaborador da célula, com o deck (já masterizado) ainda em /tmp. Idempotente
 * (pula 'done'). Best-effort: NÃO roda se o jobId não for um vídeo de célula real
 * (ex.: render de spike) → query vazia → pula silencioso. Falha por pessoa não
 * derruba as outras nem o deck.
 */
async function personalizarCelula(deckPath: string, videoId: string, inputProps: any): Promise<void> {
  if (!process.env.GEMINI_API_KEY) { console.warn(`[${videoId}] personalização pulada (sem GEMINI_API_KEY)`); return; }
  const rows = await pgGet(`videos_gerados?id=eq.${videoId}&select=empresa_id,cargo,disc_dominante`).catch(() => []);
  const job = rows[0];
  if (!job) return; // jobId não é um vídeo de célula (render genérico/spike) → pula
  const disc = String(job.disc_dominante || '').trim().charAt(0).toUpperCase();
  if (!job.empresa_id || !job.cargo || !['D', 'I', 'S', 'C'].includes(disc)) {
    console.warn(`[${videoId}] personalização pulada (célula incompleta)`); return;
  }
  const colabs = await pgGet(
    `colaboradores?empresa_id=eq.${job.empresa_id}&cargo=eq.${encodeURIComponent(job.cargo)}&select=id,nome_completo,perfil_dominante`,
  );
  const inCell = colabs.filter(
    (c) => String(c.perfil_dominante || '').trim().charAt(0).toUpperCase() === disc && String(c.nome_completo || '').trim(),
  );
  if (!inCell.length) { console.warn(`[${videoId}] célula ${job.cargo}/${disc} sem colaboradores`); return; }
  // PERSONALIZE_LIMIT (>0) limita quantos colaboradores personalizar — usado em
  // spikes/testes p/ não gerar a célula inteira. 0/ausente = todos (produção).
  const limit = Number(process.env.PERSONALIZE_LIMIT) || 0;
  const targets = limit > 0 ? inCell.slice(0, limit) : inCell;
  if (limit > 0) console.log(`[${videoId}] PERSONALIZE_LIMIT=${limit} → ${targets.length}/${inCell.length} colaborador(es)`);
  const bundle = await resolveBundle();
  let ok = 0, err = 0;
  for (const c of targets) {
    const nome = primeiroNome(c.nome_completo);
    try {
      const ex = await pgGet(`videos_personalizados?cell_video_id=eq.${videoId}&colaborador_id=eq.${c.id}&select=status`);
      if (ex[0]?.status === 'done') continue;
      await upsertPerso(videoId, c.id, { nome_usado: nome, status: 'processing', error: null });
      const outPath = `/tmp/perso-${videoId}-${c.id}.mp4`;
      await personalizar(deckPath, c.nome_completo, outPath, {
        bundleDir: bundle, brand: inputProps?.brand, width: inputProps?.width, height: inputProps?.height,
        jobId: videoId, colaboradorId: c.id,
      });
      const guid = await uploadToBunny(await readFile(outPath), `${nome} · ${videoId}`);
      const videoUrl = `https://iframe.mediadelivery.net/play/${BUNNY_LIB}/${guid}`;
      await upsertPerso(videoId, c.id, { nome_usado: nome, status: 'done', video_url: videoUrl, bunny_video_id: guid, bunny_library: BUNNY_LIB, error: null });
      await rm(outPath, { force: true }).catch(() => {});
      ok++; console.log(`[${videoId}] perso ✓ ${nome} → ${guid}`);
    } catch (e: any) {
      err++; console.warn(`[${videoId}] perso ✗ ${nome} (${c.id}): ${e?.message || e}`);
      await upsertPerso(videoId, c.id, { nome_usado: nome, status: 'error', error: String(e?.message || e).slice(0, 300) }).catch(() => {});
    }
  }
  console.log(`[${videoId}] personalização da célula: ${ok} ok, ${err} erro(s)`);
}

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

    // 3.5) engenharia de áudio (trilha + ducking + master -14 LUFS) — mesmo passo
    //      do worker Hetzner e do piloto. Degrada p/ áudio cru se o bed não estiver
    //      no runtime (ver resolveBed): o render nunca quebra por isto.
    const final = await masterizarSeguro(out, jobId);
    const s = await stat(final);

    // 4) upload pro Bunny Stream (se as credenciais estiverem no ambiente).
    let bunnyVideoId: string | null = null;
    if (BUNNY_LIB && BUNNY_KEY) {
      bunnyVideoId = await uploadToBunny(await readFile(final), p.title || `Vertho · ${jobId}`);
    }

    await rm(dir, { recursive: true, force: true }).catch(() => {});
    // limpa as partes intermediárias do Storage (cada objeto; Storage não apaga "pasta").
    await Promise.all(parts.map((part) => storageDelete(BUCKET, part.path)));

    // 5) personalização nominal (Rota A) — prepend "Olá, {nome}" por colaborador da
    //    célula, com o deck (masterizado, em `final`) ainda em /tmp. Best-effort: a
    //    falha aqui NÃO derruba o deck. Pula se o jobId não for vídeo de célula.
    await personalizarCelula(final, jobId, p.inputProps).catch((e) => console.warn(`[${jobId}] personalização falhou (deck OK):`, e?.message || e));
    await rm(final, { force: true }).catch(() => {});

    return { ok: true, jobId, chunks: parts.length, frames: p.frames, bytes: s.size, bunnyVideoId, bunnyLibrary: BUNNY_LIB || null };
  },
});
