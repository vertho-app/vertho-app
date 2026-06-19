import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/**
 * Engenharia de áudio do vídeo (PORTÁVEL — roda no piloto local e na worker
 * Hetzner; é o mesmo ffmpeg do normalizarFps). Implementa o caderno de produção
 * sonora Vertho:
 *   - TRILHA (bed) por baixo da voz, com BERÇO ACÚSTICO (notch -3 dB @2.5 kHz);
 *   - DUCKING SIDECHAIN: a trilha recua quando a voz/SFX tocam (attack 15 ms,
 *     release 350 ms) — a voz é rainha;
 *   - MASTER: -14 LUFS integrado / teto -1 dBTP (loudnorm).
 *
 * Entra o vídeo já renderizado (voz + SFX no áudio) + o bed; sai o mesmo vídeo
 * com o áudio masterizado (vídeo é copiado, só o áudio é reprocessado → rápido).
 */
export async function masterizarAudio({ videoIn, bedRespiro, videoOut }) {
  const filtros = [
    // áudio do vídeo (voz + SFX): uma cópia p/ sidechain, outra p/ o mix
    '[0:a]aformat=channel_layouts=stereo,asplit=2[sc][mix]',
    // bed com berço acústico (abre espaço p/ as formantes da voz)
    '[1:a]equalizer=f=2500:width_type=q:w=1.0:g=-3,aformat=channel_layouts=stereo[bed]',
    // ducking: o bed é comprimido pelo sinal da voz/SFX
    '[bed][sc]sidechaincompress=threshold=0.03:ratio=12:attack=15:release=350:makeup=1[duck]',
    // mix: voz/SFX no nível cheio + bed duckado por baixo
    '[mix][duck]amix=inputs=2:duration=first:weights=1 0.55:normalize=0[m]',
    // master: -14 LUFS / -1 dBTP
    '[m]loudnorm=I=-14:TP=-1:LRA=11[a]',
  ].join(';');

  await exec(FFMPEG, [
    '-y',
    '-i', videoIn,
    '-stream_loop', '-1', '-i', bedRespiro, // bed em loop; -shortest corta na duração do vídeo
    '-filter_complex', filtros,
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart',
    videoOut,
  ], { timeout: 300_000, maxBuffer: 64 * 1024 * 1024 });

  return videoOut;
}
