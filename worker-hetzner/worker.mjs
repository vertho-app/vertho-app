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
 * Resiliência: sinal de vida + reaper devolvem à fila só o job de worker MORTO
 * (fila.mjs); o processo é idempotente e reinicia limpo.
 */
import pg from 'pg';
import os from 'node:os';
import path from 'node:path';
import { readFile, access, rm } from 'node:fs/promises';
import { ensureBrowser, selectComposition, renderMedia } from '@remotion/renderer';
import { personalizar, primeiroNome } from './personalizar.mjs';
import { DEGRADACAO_SAUDACAO_AUSENTE } from './saudacao-audio.mjs';
import { COLUNAS_PREFERENCIA, destinatariosDaSaudacao } from './saudacao.mjs';
import { masterizarAudio } from './masterizar-audio.mjs';
import { registrarPublicacao, confirmarPublicacoes } from './publicacao-bunny.mjs';
import {
  claim as claimFila, reap as reapFila, reapSemSinalMin, REAP_COM_SINAL_MIN, iniciarSinalDeVida,
  processarJob, preservarDeckNaFalha, registrarDegradacaoVideo,
} from './fila.mjs';

const {
  DATABASE_URL,
  BUNNY_LIBRARY_ID: BUNNY_LIB,
  BUNNY_STREAM_API_KEY: BUNNY_KEY,
  BUNNY_PULL_ZONE,               // CDN da biblioteca: baixa o deck publicado no caminho "só personalizar"
  BUNNY_REFERER,                 // a pull zone tem proteção de hotlink por domínio
  POLL_INTERVAL_MS = '15000',
  RENDER_CONCURRENCY,
  VIDEO_RENDER_SCALE = '0.6667', // 0.6667 = 720p · 1.0 = 1080p (fallback)
  COMPOSITION_ID = 'VerthoVideo',
  EPHEMERAL,                     // 'true' = box on-demand: morre quando a fila seca
  IDLE_SHUTDOWN_MS = '300000',   // 5 min de fila vazia → self-destruct (modo efêmero)
} = process.env;

const POLL = parseInt(POLL_INTERVAL_MS, 10);
const IDLE_MS = parseInt(IDLE_SHUTDOWN_MS, 10);
const REAP_SEM_SINAL_MIN = reapSemSinalMin(process.env);
const EPHEMERAL_MODE = String(EPHEMERAL || '').toLowerCase() === 'true';
const CONCURRENCY = parseInt(RENDER_CONCURRENCY || String(Math.max(1, os.cpus().length)), 10);
// 🚧 TLS sem verificação — ÚLTIMO site desta classe no repo (24/08). Os 13
// scripts irmãos passaram a usar `scripts/_pg-ssl.mjs`, que verifica quando a CA
// está presente e avisa quando não está. Este ficou de fora por um motivo, não
// por esquecimento: o worker é COPIADO sozinho para a VPS Hetzner, sem o resto
// do repo — o import de `../scripts/` não existiria lá, e a CA em `config/`
// também não. Fechar aqui exige embutir a lógica e testar NA VPS.
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 4 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Ajusta o scale para que width*scale e height*scale caiam em INTEIROS — o Remotion
 *  exige dims inteiras no stitch (ex.: 0.6667×1080=720.036 quebra). Snap p/ a razão
 *  exata targetH/h; em 16:9 ambos os lados ficam inteiros (1920×1080 → 1280×720). */
function scaleDimsInteiras(scale, w, h) {
  if (!scale || scale === 1 || !w || !h) return scale;
  return Math.round(h * scale) / h;
}

let bundleDir = null;
async function resolveBundle() {
  if (bundleDir) return bundleDir;
  for (const c of [path.join(process.cwd(), 'spike-bundle'), '/app/spike-bundle', path.resolve('spike-bundle')]) {
    try { await access(path.join(c, 'index.html')); bundleDir = c; return c; } catch { /* próximo */ }
  }
  throw new Error('bundle Remotion não encontrado (esperado em ./spike-bundle)');
}

/** Resolve um asset de áudio (bed) p/ a masterização. Locais determinísticos:
 *  raiz do worker (COPY do Dockerfile) > /app > dentro do bundle. Cacheado por nome. */
const audioCache = new Map();
async function resolveAudio(file) {
  if (audioCache.has(file)) return audioCache.get(file);
  const cands = [
    path.join(process.cwd(), file),
    `/app/${file}`,
    path.join((await resolveBundle().catch(() => '.')) || '.', 'public', 'audio', file),
  ];
  let found = null;
  for (const c of cands) { try { await access(c); found = c; break; } catch { /* próximo */ } }
  audioCache.set(file, found);
  return found;
}

/** Início do clímax (s) = começo do avatar_outro na timeline. 0 = sem clímax. */
function climaxFromProps(props) {
  const fps = props?.fps || 30;
  const outro = (props?.scenes || []).find((s) => s?.type === 'avatar_outro');
  return outro?.fromFrame ? outro.fromFrame / fps : 0;
}

/** Masteriza o áudio (trilha + ducking + -14 LUFS + fade-out + bed-pico no clímax).
 *  Em QUALQUER falha devolve o arquivo cru: o render nunca quebra pela eng. de áudio. */
async function masterizarSeguro(videoIn, props) {
  const bed = await resolveAudio('bed-respiro.mp3');
  if (!bed) { log('masterização pulada (bed-respiro.mp3 não encontrado) — áudio cru'); return videoIn; }
  const bedPico = await resolveAudio('bed-pico.mp3');
  const climaxStartSec = climaxFromProps(props);
  const out = videoIn.replace(/\.mp4$/, '') + '-master.mp4';
  try {
    await masterizarAudio({ videoIn, bedRespiro: bed, bedPico, climaxStartSec, videoOut: out });
    return out;
  } catch (e) {
    log('masterização falhou → áudio cru:', e?.message || e);
    return videoIn;
  }
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

/** Devolve à fila os jobs de worker morto (regras em fila.mjs). */
async function reap() {
  const n = await reapFila(pool, { comSinalMin: REAP_COM_SINAL_MIN, semSinalMin: REAP_SEM_SINAL_MIN });
  if (n) log(`reaper: ${n} job(s) de worker morto devolvido(s) à fila`);
}

/** Pré-aquece a célula: gera o vídeo PERSONALIZADO (saudação "Olá, {nome}") de
 *  cada colaborador da célula e sobe no Bunny. Idempotente (pula quem já está
 *  'done'). Roda na própria box (o deck já está em /tmp). */
async function personalizeCell(job, deckPath) {
  // A saudação vem PRONTA do app (mp3 no Storage, sintetizado no Vertex): a box não sintetiza e não precisa de chave de TTS.
  // Precisa ler o Storage e saber a versão do elenco que o app usou na chave do arquivo. Sem uma das duas, pular a célula
  // inteira é o certo, e é CRÍTICO: todas as pessoas dela ficariam sem nominal sem que nada dissesse por quê.
  const semStorage = !(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (semStorage || !process.env.VOZ_VERSAO) {
    const falta = semStorage ? 'credencial do Storage' : 'VOZ_VERSAO';
    log(`personalização pulada (sem ${falta}) ${job.id}`);
    await registrarDegradacaoVideo(pool, { tipo: DEGRADACAO_SAUDACAO_AUSENTE, chave: `config:${falta}`, empresaId: job.empresa_id || null, severidade: 'critico', detalhe: { celula: job.id, falta } }, log);
    return;
  }
  const disc = String(job.disc_dominante || '').trim().charAt(0).toUpperCase();
  if (!job.empresa_id || !job.cargo || !['D', 'I', 'S', 'C'].includes(disc)) {
    log(`personalização pulada (célula incompleta) ${job.id}`); return;
  }
  const { rows: daCelula } = await pool.query(
    `SELECT id, nome_completo, ${COLUNAS_PREFERENCIA.join(', ')} FROM colaboradores
     WHERE empresa_id=$1 AND cargo=$2 AND upper(left(coalesce(perfil_dominante,''),1))=$3
       AND coalesce(trim(nome_completo),'') <> ''`,
    [job.empresa_id, job.cargo, disc]);
  // Kit nascido da regra das preferências: a saudação só vai para quem tem o vídeo entre os 2 primeiros formatos.
  let porPreferencia = false;
  if (job.kit_id) {
    const { rows: kr } = await pool.query("SELECT (desafio->>'por_preferencia') = 'true' AS por_pref FROM kits WHERE id=$1", [job.kit_id]);
    porPreferencia = !!kr[0]?.por_pref;
  }
  const colabs = destinatariosDaSaudacao(daCelula, porPreferencia);
  if (porPreferencia) log(`saudação só para quem tem vídeo no top 2: ${colabs.length}/${daCelula.length} da célula ${job.cargo}/${disc}`);
  if (!colabs.length) { log(`célula ${job.cargo}/${disc} sem colaboradores p/ personalizar`); return; }
  // PERSONALIZE_LIMIT (>0) limita quantos personalizar (spikes/testes). 0/ausente = todos.
  const limit = parseInt(process.env.PERSONALIZE_LIMIT || '0', 10) || 0;
  const targets = limit > 0 ? colabs.slice(0, limit) : colabs;
  log(`personalizando ${targets.length}${limit > 0 ? `/${colabs.length} (limit ${limit})` : ''} colaborador(es) da célula ${job.cargo}/${disc}…`);
  let ok = 0, err = 0;
  for (const c of targets) {
    const nome = primeiroNome(c.nome_completo);
    try {
      const { rows: ex } = await pool.query('SELECT status, deck_fingerprint FROM videos_personalizados WHERE cell_video_id=$1 AND colaborador_id=$2', [job.id, c.id]);
      if (ex[0]?.status === 'done' && ex[0].deck_fingerprint === job.render_fingerprint) continue;
      await pool.query(
        `INSERT INTO videos_personalizados (cell_video_id, colaborador_id, nome_usado, status)
         VALUES ($1,$2,$3,'processing')
         ON CONFLICT (cell_video_id, colaborador_id) DO UPDATE SET
           status=CASE WHEN videos_personalizados.status='done' THEN 'done' ELSE 'processing' END,
           nome_usado=$3, error=null, updated_at=now()`,
        [job.id, c.id, nome]);
      const outPath = `/tmp/perso-${job.id}-${c.id}.mp4`;
      await personalizar(deckPath, c.nome_completo, outPath, {
        bundleDir: await resolveBundle(),
        brand: job.render_inputprops?.brand,
        width: job.render_inputprops?.width,   // design (ex. 1920) — saudação casa o avatar_intro
        height: job.render_inputprops?.height, // design (ex. 1080); o scale deriva do output do deck
        jobId: job.id,
        colaboradorId: c.id,
      });
      const buf = await readFile(outPath);
      const guid = await uploadToBunny(buf, `${nome} · ${job.id}`);
      const videoUrl = `https://iframe.mediadelivery.net/play/${BUNNY_LIB}/${guid}`;
      const publicacaoId = await registrarPublicacao(pool, { cellVideoId: job.id, colaboradorId: c.id,
        bunnyId: guid, library: BUNNY_LIB, url: videoUrl, fingerprint: job.render_fingerprint,
        altura: Math.round(job.render_inputprops.height * (job.render_scale || Number(VIDEO_RENDER_SCALE))) });
      await confirmarPublicacoes(pool, { ids: [publicacaoId] }).catch(e => log('publicação seguirá no cron:', e?.message));
      await rm(outPath, { force: true }).catch(() => {});
      ok++; log(`  ✓ upload ${nome} → ${guid} (publicação confirmada pelo Bunny/cron)`);
    } catch (e) {
      err++; log(`  ✗ ${nome} (${c.id}): ${e?.message || e}`);
      // Sem o áudio da saudação a pessoa fica sem nominal e o deck genérico segue no ar; a reconciliação refaz depois que o
      // app gerar o áudio. Não cai em outro sintetizador (ver `personalizar.mjs`), então a falta TEM de deixar rastro.
      if (e?.name === 'SaudacaoAusenteError') {
        await registrarDegradacaoVideo(pool, { tipo: DEGRADACAO_SAUDACAO_AUSENTE, chave: c.id, empresaId: job.empresa_id || null, severidade: 'aviso', detalhe: { celula: job.id, objeto: e.chave } }, log);
      }
      await pool.query("UPDATE videos_personalizados SET status=CASE WHEN status='done' THEN 'done' ELSE 'error' END, error=$3, updated_at=now() WHERE cell_video_id=$1 AND colaborador_id=$2",
        [job.id, c.id, String(e?.message || e).slice(0, 300)]).catch(() => {});
    }
  }
  log(`personalização da célula ${job.id}: ${ok} ok, ${err} erro(s)`);
}

/**
 * Guard do contrato render_inputprops na ENTRADA do worker (M2). JS puro (sem
 * zod — runtime .mjs separado do trigger; o schema autoritativo zod vive em
 * lib/video/montar-inputprops.ts, lado produtor). Valida os invariantes que
 * causam render quebrado e falha cedo com mensagem clara (em vez de estourar
 * cru no meio do Remotion). Espelha as checagens do produtor.
 */
function validarInputProps(props) {
  const erros = [];
  if (!props || typeof props !== 'object') erros.push('props ausente/inválido');
  else {
    if (!Array.isArray(props.scenes) || !props.scenes.length) erros.push('scenes vazio');
    for (const [n, v] of [['fps', props.fps], ['width', props.width], ['height', props.height], ['totalFrames', props.totalFrames]]) {
      if (!(typeof v === 'number' && v > 0)) erros.push(`${n} inválido (${v})`);
    }
    let cursor = 0;
    for (const s of props.scenes || []) {
      if (!s?.id || !s?.type) erros.push(`cena sem id/type`);
      if (!(s?.durationInFrames > 0)) erros.push(`cena '${s?.id}' durationInFrames inválido (${s?.durationInFrames})`);
      if (s?.fromFrame !== cursor) erros.push(`cena '${s?.id}' fromFrame descontínuo (esperado ${cursor}, veio ${s?.fromFrame})`);
      cursor += Number(s?.durationInFrames) || 0;
    }
    if (props.totalFrames != null && cursor !== props.totalFrames) erros.push(`totalFrames (${props.totalFrames}) ≠ soma das cenas (${cursor})`);
  }
  if (erros.length) throw new Error(`render_inputprops inválido: ${erros.slice(0, 6).join('; ')}`);
}

async function renderOne(job) {
  const props = job.render_inputprops;
  validarInputProps(props);
  const rawScale = job.render_scale != null ? Number(job.render_scale) : Number(VIDEO_RENDER_SCALE);
  const scale = scaleDimsInteiras(rawScale, props.width, props.height);
  const bundle = await resolveBundle();
  const title = job.roteiro?.title || `Vertho · ${job.id}`;

  log(`render ${job.id}: ${props.scenes.length} cenas · ${props.totalFrames} frames · scale ${scale} · concurrency ${CONCURRENCY}`);
  await ensureBrowser();
  const composition = await selectComposition({ serveUrl: bundle, id: COMPOSITION_ID, inputProps: props });

  const out = `/tmp/${job.id}.mp4`;
  const t0 = Date.now();
  // WATCHDOG: se o render pendurar (OOM/swap silencioso, frame travado), aborta
  // em vez de segurar a box pra sempre. cancelRender() mata o render; o erro sobe
  // → loop marca status=error → fila esvazia → self-destruct. Default 40min: um
  // vídeo de ~5,6min levou 32min em cx33 (25min antigo mataria render VÁLIDO);
  // com vídeos de 3,5–4,5min em cx43 o render cai p/ ~15–26min, então 40min é
  // folga de segurança contra TRAVA, não teto de render normal. Override por MAX_RENDER_MS.
  const MAX_RENDER_MS = parseInt(process.env.MAX_RENDER_MS || '2400000', 10);
  const { makeCancelSignal } = await import('@remotion/renderer');
  const { cancelSignal, cancel } = makeCancelSignal();
  let wd = null;
  const watchdog = new Promise((_, rej) => { wd = setTimeout(() => { try { cancel(); } catch {} rej(new Error(`render watchdog: passou de ${Math.round(MAX_RENDER_MS / 60000)}min sem concluir (cx33/OOM provável) — abortado`)); }, MAX_RENDER_MS); });
  try {
    await Promise.race([
      renderMedia({
        serveUrl: bundle, composition, codec: 'h264', outputLocation: out,
        concurrency: CONCURRENCY, chromiumOptions: { gl: 'swangle' }, inputProps: props,
        cancelSignal,
        ...(scale && scale !== 1 ? { scale } : {}),
      }),
      watchdog,
    ]);
  } finally { if (wd) clearTimeout(wd); }
  log(`render ${job.id} OK em ${Math.round((Date.now() - t0) / 1000)}s · masterizando áudio…`);

  // Engenharia de áudio (trilha + ducking + master -14 LUFS) — mesmo passo do
  // piloto. O deck masterizado é o que sobe E o que personalizamos (a porção do
  // deck na saudação preserva a trilha).
  const final = await masterizarSeguro(out, props);
  const buf = await readFile(final);
  log(`áudio pronto · ${(buf.length / 1e6).toFixed(1)}MB · subindo no Bunny…`);

  const guid = await uploadToBunny(buf, title);
  const videoUrl = `https://iframe.mediadelivery.net/play/${BUNNY_LIB}/${guid}`;
  const publicacaoId = await registrarPublicacao(pool, { cellVideoId: job.id, bunnyId: guid,
    library: BUNNY_LIB, url: videoUrl, fingerprint: job.render_fingerprint, altura: Math.round(props.height * scale) });
  await confirmarPublicacoes(pool, { ids: [publicacaoId] }).catch(e => log('publicação seguirá no cron:', e?.message));
  log(`UPLOAD ${job.id} → ${videoUrl} (publicação confirmada pelo Bunny/cron)`);

  // Personalização nominal (Rota A): prepend "Olá, {nome}" por colaborador da
  // célula, na própria box (sobre o deck JÁ masterizado em `final`). Falha aqui
  // NÃO derruba o render — o deck genérico já está done e entregável.
  await personalizeCell(job, final).catch((e) => log(`personalização falhou (deck OK) ${job.id}:`, e?.message || e));
}

/** Reconciliação pede só os nominais sobre o deck publicado; o resto renderiza (fila.mjs). */
const processar = (job) => processarJob(job, {
  pool, log, biblioteca: BUNNY_LIB, pullZone: BUNNY_PULL_ZONE, referer: BUNNY_REFERER,
  personalizeCell, renderizar: renderOne,
});

/** Modo efêmero (box on-demand): apaga a PRÓPRIA box Hetzner quando a fila seca,
 *  pra não deixar máquina ligada. Descobre o id pelo metadata server da Hetzner. */
async function selfDestruct() {
  const token = process.env.HCLOUD_TOKEN;
  if (!token) { log('self-destruct pulado (sem HCLOUD_TOKEN)'); return false; }
  try {
    const id = (await fetch('http://169.254.169.254/hetzner/v1/metadata/instance-id').then((r) => r.text())).trim();
    if (!/^\d+$/.test(id)) { log('self-destruct: instance-id inválido:', id); return false; }
    log(`self-destruct: apagando a própria box ${id}…`);
    const r = await fetch(`https://api.hetzner.cloud/v1/servers/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    log(`self-destruct: DELETE ${r.status}`);
    return r.ok;
  } catch (e) { log('self-destruct erro:', e?.message || e); return false; }
}

let parando = false;
process.on('SIGTERM', () => { parando = true; log('SIGTERM — encerrando após o job atual'); });
process.on('SIGINT', () => { parando = true; log('SIGINT — encerrando após o job atual'); });

async function main() {
  if (!DATABASE_URL || !BUNNY_LIB || !BUNNY_KEY) {
    console.error('Faltam env vars: DATABASE_URL, BUNNY_LIBRARY_ID, BUNNY_STREAM_API_KEY');
    process.exit(1);
  }
  log(`worker iniciado · poll ${POLL}ms · concurrency ${CONCURRENCY} · scale fallback ${VIDEO_RENDER_SCALE}` +
    ` · reaper ${REAP_COM_SINAL_MIN}min com sinal / ${REAP_SEM_SINAL_MIN}min sem sinal` +
    (EPHEMERAL_MODE ? ` · EFÊMERO (self-destruct após ${Math.round(IDLE_MS / 1000)}s de fila vazia)` : ''));
  let lastActivity = Date.now();
  while (!parando) {
    try {
      await reap();
      const job = await claimFila(pool);
      if (!job) {
        // Modo efêmero: fila vazia por IDLE_MS → apaga a própria box e encerra.
        if (EPHEMERAL_MODE && Date.now() - lastActivity > IDLE_MS) {
          log(`fila vazia há ${Math.round((Date.now() - lastActivity) / 1000)}s — encerrando box efêmera`);
          await selfDestruct();
          break;
        }
        await sleep(POLL); continue;
      }
      lastActivity = Date.now(); // claim resetou o ócio
      const pararSinal = iniciarSinalDeVida(pool, job, { log });
      try {
        await processar(job);
      } catch (e) {
        log(`ERRO no job ${job.id}:`, e?.message || e);
        // Célula que já tinha deck publicado volta a `done` (fila.mjs, FMEA F-V8).
        const preservada = await preservarDeckNaFalha(pool, job, e, log).catch((pe) => { log(`falha ao preservar deck ${job.id}:`, pe?.message || pe); return false; });
        if (!preservada) {
          // Guarda do claim: um worker que perdeu o job para o reaper não sobrescreve quem o pegou depois.
          await pool.query(`UPDATE videos_gerados SET status='error', error=$2, updated_at=now() WHERE id=$1 AND claimed_at=$3::timestamptz`,
            [job.id, String(e?.message || e).slice(0, 500), job.claim_token]).catch((pe) => log(`falha ao gravar status=error ${job.id}:`, pe?.message || pe));
        }
      } finally { pararSinal(); }
      lastActivity = Date.now(); // terminou o job; reinicia a janela de ócio
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
