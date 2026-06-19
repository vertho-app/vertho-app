import { task } from '@trigger.dev/sdk';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import nodePath from 'node:path';
import { renderVideoTask } from './render-video';
import { generateNarrationAudio } from '../lib/gemini-tts';
import { gerarClipHeyGen, aguardarClipHeyGen } from '../lib/video/heygen';
import { montarInputProps, exportCaptionsToSrt, exportCaptionsToVtt, type AssetMap } from '../lib/video/montar-inputprops';
import type { VideoRoteiro } from '../lib/video/roteiro-prompt';
import { storagePut, SUPA, KEY } from '../lib/video/render-helpers';
import { transcribeWords } from '../lib/video/whisper-align';

const exec = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
// FPS-alvo da composição Remotion. O HeyGen entrega o avatar a 25fps; o
// OffthreadVideo reamostra 25→30 e DESCASA o lip-sync (A/V). Normalizamos o mp4
// p/ CFR neste fps antes de montar → mapeamento 1:1 de frame, sync preservado.
const VIDEO_FPS = Number(process.env.VIDEO_FPS) || 30;
// Concorrência da narração (Gemini TTS) — 2: paralelo o suficiente sem estourar o
// rate-limit por minuto do TTS preview (com backoff no ttsToPcm como rede de segurança).
const NARRACAO_CONCURRENCY = Number(process.env.NARRACAO_CONCURRENCY) || 2;

/** Roda `fn` sobre todos os items com no máximo `n` simultâneos (pool). */
async function mapPool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (idx < items.length) { const i = idx++; await fn(items[i], i); }
  });
  await Promise.all(workers);
}
const VOICE = process.env.VIDEO_TTS_VOICE || 'Vindemiatrix';
// Direção de voz por CONTEXTO (camada-experiência). As pontas de avatar são
// âncoras emocionais → dose com mais respiro/calor (B1); o miolo é voice-over de
// conteúdo → dose ágil-warm (B2), pra não arrastar a explicação. Mesma voz,
// estilo dirigido por tipo de cena — o "TTS chapado" vinha de não dirigir.
const NARRATION_STYLE_AVATAR = 'Narre como uma mentora calorosa e próxima, conversando com uma pessoa, em português do Brasil. Ritmo natural e fluido de conversa, acolhedor, com respiros leves entre as frases e uma micro-pausa antes da ideia principal. Sem pressa, mas sem arrastar.';
const NARRATION_STYLE_MIOLO = 'Narre como uma mentora calorosa e acolhedora, em português do Brasil, num ritmo natural de conversa. Respiração natural entre as frases, tom íntimo e humano. Mantenha a fluidez — não alongue as pausas.';
const styleForScene = (type: string) => (String(type).startsWith('avatar') ? NARRATION_STYLE_AVATAR : NARRATION_STYLE_MIOLO);

/** PATCH no registro videos_gerados via PostgREST (evita o crash do supabase-js no worker). */
async function patchVideo(videoId: string, fields: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPA}/rest/v1/videos_gerados?id=eq.${videoId}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`patch video ${videoId}: ${r.status} ${(await r.text()).slice(0, 150)}`);
}

/**
 * Re-encoda o mp4 do avatar para CFR no fps-alvo da composição. O HeyGen entrega
 * 25fps; sem isso o OffthreadVideo (30fps) reamostra e descasa o lip-sync. Mantém
 * o áudio (voz embutida) alinhado (`-async 1`). Em falha, devolve o buffer original.
 */
async function normalizarFps(mp4: Buffer, fps: number): Promise<Buffer> {
  const dir = await mkdtemp(nodePath.join(os.tmpdir(), 'avfps-'));
  const inP = nodePath.join(dir, 'in.mp4');
  const outP = nodePath.join(dir, 'out.mp4');
  try {
    await writeFile(inP, mp4);
    // timeout duro: se o ffmpeg pendurar, falha rápido (cai no fallback) em vez de
    // segurar a task por minutos. maxBuffer alto p/ o stderr do libx264.
    await exec(FFMPEG, ['-y', '-i', inP, '-r', String(fps), '-fps_mode', 'cfr',
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-ar', '48000', '-movflags', '+faststart', outP],
      { timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
    return await readFile(outP);
  } catch (e) {
    console.warn('normalizarFps falhou, usando mp4 original:', (e as Error)?.message);
    return mp4;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Duração (s) de um asset por ffprobe — aceita URL http direto. */
async function ffprobeDuration(url: string): Promise<number> {
  try {
    const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url]);
    const d = parseFloat(String(stdout).trim());
    if (Number.isFinite(d) && d > 0) return d;
    console.warn(`ffprobe: duração inválida (${stdout}) p/ ${url}`);
    return 0;
  } catch (e) {
    // Falha SILENCIOSA aqui faz montar-inputprops cair no fallback (6/8s) e a
    // timeline sai errada sem sinal — por isso logamos.
    console.warn(`ffprobe falhou p/ ${url}:`, (e as Error)?.message);
    return 0;
  }
}

/**
 * Orquestra a geração de UM vídeo a partir do roteiro de um Módulo-Base:
 *   1) narração (TTS Callirrhoe) de cada cena → Storage público
 *   2) avatar (HeyGen) das cenas intro/outro com lip-sync da NOSSA narração → re-hospeda o mp4
 *   3) durações reais (ffprobe) → montar inputProps
 *   4) render chunked (renderVideoTask) → Bunny
 *   5) grava status/URLs/legendas em videos_gerados
 */
export const gerarVideoModuloTask = task({
  id: 'gerar-video-modulo',
  // large-1x: o passo de avatar faz re-encode ffmpeg (normalizarFps 25→30) que
  // estrangulava/penduravam a small-1x. CPU/RAM folgadas evitam o hang.
  machine: 'large-1x',
  maxDuration: 3600,
  run: async (p: {
    videoId: string;
    roteiro: VideoRoteiro;
    brand?: { primary: string; secondary: string; background: string; font?: string };
    fps?: number; width?: number; height?: number; chunks?: number;
  }) => {
    const { videoId, roteiro } = p;
    try {
      const assets: AssetMap = {};

      // 1) NARRAÇÃO — uma voz (Callirrhoe, ritmo ágil) em todo o vídeo. Paralela
      // (pool) — antes era sequencial (~3s × N cenas). Saída idêntica (assets por id).
      await patchVideo(videoId, { etapa: 'narracao' });
      const comNarracao = roteiro.scenes.filter((s) => s.narration?.trim());
      await mapPool(comNarracao, NARRACAO_CONCURRENCY, async (s) => {
        const audio = await generateNarrationAudio(s.narration as string, { voice: VOICE, style: styleForScene(s.type) });
        const src = await storagePut('video-assets', `${videoId}/${s.id}.mp3`, audio.buffer, 'audio/mpeg');
        // M4: timing por palavra (Whisper) p/ legendas + animações. null = fallback heurístico.
        const words = await transcribeWords(audio.buffer);
        assets[s.id] = { src, durationSec: 0, words: words || undefined };
      });

      // 2) AVATAR — HeyGen faz lip-sync do NOSSO mp3; re-hospedamos o mp4 (URL HeyGen
      // expira). Cenas de avatar em paralelo (intro + outro).
      await patchVideo(videoId, { etapa: 'avatar' });
      const avatares = roteiro.scenes.filter((s) => s.type.startsWith('avatar') && assets[s.id]?.src);
      await mapPool(avatares, 2, async (s) => {
        const audioUrl = assets[s.id].src;
        const heygenId = await gerarClipHeyGen(audioUrl, { width: 1920, height: 1080 });
        const heygenUrl = await aguardarClipHeyGen(heygenId);
        const mp4 = Buffer.from(await (await fetch(heygenUrl)).arrayBuffer());
        const norm = await normalizarFps(mp4, VIDEO_FPS); // 25fps→30fps CFR (lip-sync)
        const src = await storagePut('video-assets', `${videoId}/${s.id}.mp4`, norm, 'video/mp4');
        // Mantém o mp3 da narração como áudio SEPARADO: o vídeo (mp4) entra mutado e
        // o áudio é tocado alinhado pelo Remotion → lip-sync sem o offset do OffthreadVideo.
        // Preserva `words` (timing Whisper) capturado no passo da narração.
        assets[s.id] = { src, durationSec: 0, audioSrc: audioUrl, words: assets[s.id]?.words };
      });

      // 3) DURAÇÕES reais (ffprobe) → timeline correta. Paralelo.
      await patchVideo(videoId, { etapa: 'render' });
      await mapPool(Object.keys(assets), 6, async (id) => {
        assets[id].durationSec = await ffprobeDuration(assets[id].src);
      });
      // Guard de timeline: asset com duração 0 cai no fallback de montar-inputprops
      // (6/8s) e a cena fica fora de sincronia. Sinaliza (não aborta — é recuperável).
      const semDuracao = Object.keys(assets).filter((id) => !assets[id].durationSec);
      if (semDuracao.length) console.warn(`${videoId}: ${semDuracao.length} asset(s) sem duração (ffprobe): ${semDuracao.join(', ')}`);

      // 4) inputProps (timeline + legendas).
      const props = montarInputProps(roteiro, assets, {
        brand: p.brand, fps: p.fps, width: p.width, height: p.height,
      });

      // 5) render. scale 1.0 = saída Full HD 1080p (design nativo). O avatar HeyGen
      // agora é gerado em 1920×1080, então não há upscale. VIDEO_RENDER_SCALE permite
      // baixar (ex.: 0.667 → 720p) para renders mais rápidos/baratos quando necessário.
      // Por padrão, produção usa Hetzner: enfileira (status render_queued) e o worker
      // always-on finaliza (video_url/bunny/done). Trigger.dev é override p/ testes.
      const scale = Number(process.env.VIDEO_RENDER_SCALE) || 1;
      const srt = exportCaptionsToSrt(props.captions);
      const vtt = exportCaptionsToVtt(props.captions);

      if ((process.env.RENDER_BACKEND || 'hetzner') === 'hetzner') {
        await patchVideo(videoId, { status: 'render_queued', etapa: 'render', assets, render_inputprops: props, render_scale: scale, srt, vtt, error: null });
        return { ok: true, videoId, queued: 'hetzner', frames: props.totalFrames };
      }

      const chunks = p.chunks ?? Math.min(10, Math.max(2, Math.ceil(props.totalFrames / (props.fps * 12))));
      const res = await renderVideoTask.triggerAndWait({
        composition: 'VerthoVideo',
        frames: props.totalFrames,
        chunks,
        inputProps: props,
        title: roteiro.title || `Vertho · ${videoId}`,
        jobId: videoId,
        scale,
      });
      if (!res.ok) throw new Error(`render falhou: ${JSON.stringify((res as any).error).slice(0, 200)}`);
      const out = res.output as { bunnyVideoId: string | null; bunnyLibrary: string | null; bytes: number; frames: number };

      // 6) sidecars + status final.
      const videoUrl = out.bunnyVideoId && out.bunnyLibrary
        ? `https://iframe.mediadelivery.net/play/${out.bunnyLibrary}/${out.bunnyVideoId}`
        : null;
      await patchVideo(videoId, {
        status: 'done',
        etapa: 'upload',
        assets,
        job_id: videoId,
        bunny_video_id: out.bunnyVideoId,
        bunny_library: out.bunnyLibrary,
        video_url: videoUrl,
        srt,
        vtt,
        error: null,
      });

      return { ok: true, videoId, bunnyVideoId: out.bunnyVideoId, frames: out.frames, bytes: out.bytes };
    } catch (e: any) {
      console.error(`gerar-video-modulo ${videoId} FALHOU:`, e?.message || e);
      // Se gravar o status=error falhar, o job fica preso em 'processing' sem
      // sinal no DB — logamos esse caso (em vez de engolir mudo).
      await patchVideo(videoId, { status: 'error', error: String(e?.message || e).slice(0, 500) })
        .catch((pe) => console.error(`${videoId}: falha ao gravar status=error:`, pe?.message || pe));
      throw e;
    }
  },
});
