import { task } from '@trigger.dev/sdk';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renderVideoTask } from './render-video';
import { generateNarrationAudio } from '../lib/gemini-tts';
import { gerarClipHeyGen, aguardarClipHeyGen } from '../lib/video/heygen';
import { montarInputProps, exportCaptionsToSrt, exportCaptionsToVtt, type AssetMap } from '../lib/video/montar-inputprops';
import type { VideoRoteiro } from '../lib/video/roteiro-prompt';

const exec = promisify(execFile);
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const SUPA = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const BUCKET = 'video-assets';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Kore';

function publicUrl(path: string): string {
  return `${SUPA}/storage/v1/object/public/${BUCKET}/${path}`;
}

/** Sobe um asset no bucket público video-assets (upsert). */
async function upload(path: string, buf: Buffer, contentType: string): Promise<string> {
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buf as any,
  });
  if (!r.ok) throw new Error(`upload ${path}: ${r.status} ${(await r.text()).slice(0, 150)}`);
  return publicUrl(path);
}

/** PATCH no registro videos_gerados via PostgREST (evita o crash do supabase-js no worker). */
async function patchVideo(videoId: string, fields: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPA}/rest/v1/videos_gerados?id=eq.${videoId}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`patch video ${videoId}: ${r.status} ${(await r.text()).slice(0, 150)}`);
}

/** Duração (s) de um asset por ffprobe — aceita URL http direto. */
async function ffprobeDuration(url: string): Promise<number> {
  try {
    const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', url]);
    const d = parseFloat(String(stdout).trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}

/**
 * Orquestra a geração de UM vídeo a partir do roteiro de um Módulo-Base:
 *   1) narração (TTS Kore) de cada cena → Storage público
 *   2) avatar (HeyGen) das cenas intro/outro com lip-sync da NOSSA narração → re-hospeda o mp4
 *   3) durações reais (ffprobe) → montar inputProps
 *   4) render chunked (renderVideoTask) → Bunny
 *   5) grava status/URLs/legendas em videos_gerados
 */
export const gerarVideoModuloTask = task({
  id: 'gerar-video-modulo',
  machine: 'small-1x',
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

      // 1) NARRAÇÃO — uma voz (Kore) em todo o vídeo.
      await patchVideo(videoId, { etapa: 'narracao' });
      for (const s of roteiro.scenes) {
        if (!s.narration?.trim()) continue;
        const audio = await generateNarrationAudio(s.narration, { voice: VOICE });
        const src = await upload(`${videoId}/${s.id}.mp3`, audio.buffer, 'audio/mpeg');
        assets[s.id] = { src, durationSec: 0 };
      }

      // 2) AVATAR — HeyGen faz lip-sync do NOSSO mp3; re-hospedamos o mp4 (URL HeyGen expira).
      await patchVideo(videoId, { etapa: 'avatar' });
      for (const s of roteiro.scenes) {
        if (!s.type.startsWith('avatar')) continue;
        const audioUrl = assets[s.id]?.src;
        if (!audioUrl) continue;
        const heygenId = await gerarClipHeyGen(audioUrl, { width: 1280, height: 720 });
        const heygenUrl = await aguardarClipHeyGen(heygenId);
        const mp4 = Buffer.from(await (await fetch(heygenUrl)).arrayBuffer());
        const src = await upload(`${videoId}/${s.id}.mp4`, mp4, 'video/mp4');
        assets[s.id] = { src, durationSec: 0 }; // src passa a ser o mp4 (voz embutida)
      }

      // 3) DURAÇÕES reais → timeline correta.
      await patchVideo(videoId, { etapa: 'render' });
      for (const id of Object.keys(assets)) {
        assets[id].durationSec = await ffprobeDuration(assets[id].src);
      }

      // 4) inputProps (timeline + legendas).
      const props = montarInputProps(roteiro, assets, {
        brand: p.brand, fps: p.fps, width: p.width, height: p.height,
      });

      // 5) render chunked → Bunny. ~1 chunk por 12s de vídeo (mín. 2, máx. 10).
      // scale 0.667 = saída 720p (design segue 1080p; downscale no render). Corta
      // ~48% do custo de render sem perda real (o avatar HeyGen já é nativo 720p).
      // Máquina = default large-2x do render-chunk (mesmo custo do large-1x em
      // 720p, porém ~2× mais rápido). Override por env, se preciso.
      const chunks = p.chunks ?? Math.min(10, Math.max(2, Math.ceil(props.totalFrames / (props.fps * 12))));
      const scale = Number(process.env.VIDEO_RENDER_SCALE) || 720 / 1080;
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
        srt: exportCaptionsToSrt(props.captions),
        vtt: exportCaptionsToVtt(props.captions),
        error: null,
      });

      return { ok: true, videoId, bunnyVideoId: out.bunnyVideoId, frames: out.frames, bytes: out.bytes };
    } catch (e: any) {
      await patchVideo(videoId, { status: 'error', error: String(e?.message || e).slice(0, 500) }).catch(() => {});
      throw e;
    }
  },
});
