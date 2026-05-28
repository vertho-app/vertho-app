/**
 * Cloud Run Job — render do vídeo de microlearning Vertho.
 *
 * Entrada: env CONTEUDO_ID (override injetado pela Run Admin API).
 * Fluxo:
 *   1. Busca o micro-conteúdo + baixa o plano (final/video/<slug>/<id>-plano.json).
 *   2. Gera um clipe Veo por cena (b-roll, 16:9).
 *   3. Gera o voice-over Charon (Gemini TTS) a partir do voiceover_script.
 *   4. FFmpeg: normaliza 1280x720, remove áudio dos clipes, concatena, casa a
 *      duração com o voice-over, aplica fade-in/out e logo (se houver), exporta
 *      MP4 H.264/AAC.
 *   5. Sobe o MP4 no Storage e atualiza url/storage_path/status no Supabase.
 *
 * Env: CONTEUDO_ID, GEMINI_API_KEY, SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL),
 *      SUPABASE_SERVICE_ROLE_KEY, [LOGO_URL], [MUSIC_URL].
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateVeoClip } from './veo.mjs';
import { generateVoiceOver } from './tts.mjs';

const BUCKET = 'conteudos';
const W = 1280, H = 720, FPS = 30;

const env = (k, fallback) => process.env[k] || fallback;

function sb() {
  const url = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configurados');
  return createClient(url, key, { auth: { persistSession: false } });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${code}`))));
  });
}

function ffprobeDuration(file) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('error', reject);
    p.on('close', () => resolve(parseFloat(out.trim()) || 0));
  });
}

async function download(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const id = env('CONTEUDO_ID');
  if (!id) throw new Error('CONTEUDO_ID não informado');
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurado');
  const db = sb();

  const { data: c, error } = await db.from('micro_conteudos')
    .select('id, titulo, competencia, formato').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) throw new Error('conteúdo não encontrado');
  if (c.formato !== 'video') throw new Error('conteúdo não é vídeo');

  const slug = String(c.competencia || 'geral').replace(/[^a-zA-Z0-9]/g, '_');
  const planoPath = `final/video/${slug}/${id}-plano.json`;
  const { data: planoFile, error: dlErr } = await db.storage.from(BUCKET).download(planoPath);
  if (dlErr) throw new Error(`plano não encontrado (${planoPath}): ${dlErr.message}`);
  const plano = JSON.parse(Buffer.from(await planoFile.arrayBuffer()).toString('utf8'));
  const scenes = plano.scenes || [];
  if (!scenes.length) throw new Error('plano sem cenas');

  const dir = await mkdtemp(join(tmpdir(), 'vrender-'));
  try {
    // 1) Clipes Veo (sequencial p/ limitar custo/concorrência) + normalização.
    const normed = [];
    for (const s of scenes) {
      const n = String(s.scene_number).padStart(2, '0');
      console.log(`[veo] cena ${n}/${scenes.length}: ${s.narrative_function || ''}`);
      const clip = await generateVeoClip(apiKey, s.veo_prompt, {
        negativePrompt: s.negative_prompt,
        aspectRatio: '16:9',
        durationSeconds: s.duration_seconds,
      });
      const raw = join(dir, `raw_${n}.mp4`);
      const norm = join(dir, `norm_${n}.mp4`);
      await writeFile(raw, clip);
      // Sem áudio, 1280x720, fps fixo — params idênticos p/ concat por copy.
      await run('ffmpeg', ['-y', '-i', raw, '-an',
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', norm]);
      normed.push(norm);
    }

    // 2) Voice-over Charon.
    console.log('[tts] gerando voice-over Charon...');
    const vo = join(dir, 'vo.wav');
    await writeFile(vo, await generateVoiceOver(apiKey, plano?.tts?.voiceover_script, plano?.tts?.style_prompt));
    const voDur = await ffprobeDuration(vo);
    if (!voDur) throw new Error('voice-over com duração 0');

    // 3) Concatena os clipes (concat demuxer, mesmos params => copy).
    const listPath = join(dir, 'list.txt');
    await writeFile(listPath, normed.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const concat = join(dir, 'concat.mp4');
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', concat]);

    // 4) Logo opcional.
    let logo = null;
    if (env('LOGO_URL')) {
      logo = join(dir, 'logo.png');
      await writeFile(logo, await download(env('LOGO_URL')));
    }

    // 5) Montagem final: casa vídeo ao voice-over, fades, logo, export.
    const out = join(dir, 'out.mp4');
    const fadeOutV = Math.max(0, voDur - 1.0);
    const fadeOutA = Math.max(0, voDur - 1.2);
    // Estende o vídeo (clona último frame) até cobrir o voice-over; -shortest corta no áudio.
    let vChain = `[0:v]tpad=stop_mode=clone:stop_duration=600,fade=t=in:st=0:d=0.8,fade=t=out:st=${fadeOutV.toFixed(2)}:d=1.0[vb]`;
    const aChain = `[1:a]afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOutA.toFixed(2)}:d=1.2[a]`;
    const args = ['-y', '-i', concat, '-i', vo];
    let lastV = '[vb]';
    if (logo) {
      args.push('-i', logo);
      // Logo no topo-direito, só na abertura (0-4s) e fechamento (últimos 4s).
      vChain += `;[2:v]scale=220:-1[lg];${lastV}[lg]overlay=W-w-40:40:enable='between(t,0,4)+between(t,${(voDur - 4).toFixed(2)},${voDur.toFixed(2)})'[vo2]`;
      lastV = '[vo2]';
    }
    const filter = `${vChain};${aChain}`;
    args.push('-filter_complex', filter, '-map', lastV, '-map', '[a]',
      '-shortest', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out);
    console.log('[ffmpeg] montagem final...');
    await run('ffmpeg', args);

    // 6) Upload + update.
    const outPath = `final/video/${slug}/${id}-${Date.now()}.mp4`;
    const mp4 = await readFile(out);
    const { error: upErr } = await db.storage.from(BUCKET).upload(outPath, mp4, {
      contentType: 'video/mp4', upsert: true,
    });
    if (upErr) throw new Error(`upload falhou: ${upErr.message}`);
    const { data: { publicUrl } } = db.storage.from(BUCKET).getPublicUrl(outPath);

    await db.from('micro_conteudos').update({
      url: publicUrl, storage_path: outPath, video_render_status: 'done', video_render_error: null,
    }).eq('id', id);

    console.log(`[ok] vídeo pronto: ${publicUrl}`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch(async (err) => {
  console.error('[render] erro:', err);
  try {
    const id = env('CONTEUDO_ID');
    if (id) {
      await sb().from('micro_conteudos').update({
        video_render_status: 'error', video_render_error: String(err?.message || err).slice(0, 500),
      }).eq('id', id);
    }
  } catch {}
  process.exit(1);
});
