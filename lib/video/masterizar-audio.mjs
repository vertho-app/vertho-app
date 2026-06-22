import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const FADE_OUT = 1.3;   // fade de áudio no encerramento (s) — respiro mais longo
const PICO_GAIN = 1.45; // bed-pico mais presente que o bed-respiro no clímax

/**
 * Engenharia de áudio do vídeo (PORTÁVEL — roda no piloto local e na worker
 * Hetzner; é o mesmo ffmpeg do normalizarFps). Implementa o caderno de produção
 * sonora Vertho:
 *   - TRILHA (bed) por baixo da voz, com BERÇO ACÚSTICO (notch -3 dB @2.5 kHz);
 *   - DUCKING SIDECHAIN: a trilha recua quando a voz/SFX tocam (attack 15 ms,
 *     release 350 ms) — a voz é rainha;
 *   - MASTER: -14 LUFS integrado / teto -1 dBTP (loudnorm).
 *
 * Entra o vídeo já renderizado (voz no áudio) + o(s) bed(s); sai o mesmo vídeo
 * com o áudio masterizado (vídeo é copiado, só o áudio é reprocessado → rápido).
 *
 * TRILHA DINÂMICA: por padrão usa só `bedRespiro`. Se vier `bedPico` + `climaxStartSec`,
 * faz crossfade respiro→pico no clímax (avatar_outro) → mais energia no encerramento.
 */
export async function masterizarAudio({ videoIn, bedRespiro, bedPico, climaxStartSec, videoOut }) {
  const opts = { timeout: 300_000, maxBuffer: 64 * 1024 * 1024 };

  // Duração total (p/ fade-out e p/ validar o clímax).
  let dur = 0;
  try {
    const { stdout } = await exec(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', videoIn]);
    dur = parseFloat(String(stdout).trim()) || 0;
  } catch { /* sem duração → sem fade */ }
  const fade = dur > FADE_OUT ? `,afade=t=out:st=${(dur - FADE_OUT).toFixed(2)}:d=${FADE_OUT}` : '';

  // Usa o bed-pico só se houver clímax válido (dentro do vídeo, com folga).
  const climax = Number(climaxStartSec);
  const usePico = !!bedPico && climax > 1 && (dur === 0 || climax < dur - 1);
  const CROSS = 1.6; // crossfade respiro→pico (s)

  // Inputs: vídeo + bed-respiro (loop) [+ bed-pico (loop)].
  const inputs = ['-i', videoIn, '-stream_loop', '-1', '-i', bedRespiro];
  if (usePico) inputs.push('-stream_loop', '-1', '-i', bedPico);

  // Construção da TRILHA → [bed] (antes do berço acústico/duck).
  const bedChain = usePico
    ? [
        `[1:a]afade=t=out:st=${climax.toFixed(2)}:d=${CROSS},aformat=channel_layouts=stereo[bedR]`,
        `[2:a]adelay=${Math.round(climax * 1000)}|${Math.round(climax * 1000)},afade=t=in:st=${climax.toFixed(2)}:d=${CROSS},volume=${PICO_GAIN},aformat=channel_layouts=stereo[bedP]`,
        `[bedR][bedP]amix=inputs=2:duration=longest:normalize=0[bedmix]`,
        `[bedmix]equalizer=f=2500:width_type=q:w=1.0:g=-3[bed]`,
      ]
    : ['[1:a]equalizer=f=2500:width_type=q:w=1.0:g=-3,aformat=channel_layouts=stereo[bed]'];

  // mix (voz) + bed (berço acústico) + ducking sidechain — base comum aos 2 passes.
  const base = [
    '[0:a]aformat=channel_layouts=stereo,asplit=2[sc][mix]',
    ...bedChain,
    '[bed][sc]sidechaincompress=threshold=0.03:ratio=12:attack=15:release=350:makeup=1[duck]',
    '[mix][duck]amix=inputs=2:duration=first:weights=1 0.42:normalize=0[m]',
  ];

  // PASS 1 — mede o loudness do mix final (loudnorm em modo análise).
  let measured = null;
  try {
    const medir = [...base, '[m]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[a]'].join(';');
    const { stderr } = await exec(FFMPEG, ['-y', ...inputs, '-filter_complex', medir, '-map', '[a]', '-f', 'null', '-'], opts);
    measured = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  } catch (e) {
    console.warn('loudnorm pass-1 falhou → single-pass:', e?.message);
  }

  // PASS 2 — aplica: two-pass linear (crava -14 exato) se mediu; senão single-pass. + fade-out.
  const ln = measured
    ? `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
    : 'loudnorm=I=-14:TP=-1:LRA=11';
  const aplicar = [...base, `[m]${ln}${fade}[a]`].join(';');
  await exec(FFMPEG, [
    '-y', ...inputs,
    '-filter_complex', aplicar,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart',
    videoOut,
  ], opts);

  return videoOut;
}
