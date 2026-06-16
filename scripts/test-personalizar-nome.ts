/**
 * Teste offline da personalização nominal (lib/video/personalizar-nome.ts).
 * Sintetiza um "deck" (5s, 720p/30fps/h264/aac) + um áudio de saudação, roda
 * personalizarComNome e confere que o resultado = deck + 3s, com vídeo e áudio.
 *
 * Rodar: npx tsx scripts/test-personalizar-nome.ts  (precisa ffmpeg no PATH)
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { personalizarComNome, probeDeck, primeiroNome } from '../lib/video/personalizar-nome';

const exec = promisify(execFile);
const FF = process.env.FFMPEG_PATH || 'ffmpeg';

async function main() {
  const wd = await mkdtemp(path.join(tmpdir(), 'perso-test-'));
  const deck = path.join(wd, 'deck.mp4');
  const greet = path.join(wd, 'greet.mp3');
  const out = path.join(wd, 'personal.mp4');

  console.log('1) sintetizando deck (5s, 1280x720, 30fps, h264/aac)…');
  await exec(FF, [
    '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=5',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=5',
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-shortest', deck,
  ]);
  const d0 = await probeDeck(deck);
  console.log(`   deck: ${d0.width}x${d0.height} ${d0.fps}fps ${d0.pixFmt} · audio ${d0.hasAudio} ${d0.sampleRate}/${d0.channels} · ${d0.durationSec.toFixed(2)}s`);

  console.log('2) sintetizando áudio de saudação (2.4s)…');
  await exec(FF, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2.4', '-c:a', 'libmp3lame', greet]);

  console.log(`3) personalizando (nome bruto "MARIA DA SILVA" → "${primeiroNome('MARIA DA SILVA')}")…`);
  const r = await personalizarComNome({ deckPath: deck, outPath: out, nome: 'MARIA DA SILVA', greetingAudioPath: greet, workdir: wd });
  const dOut = await probeDeck(out);

  const esperado = d0.durationSec + 3;
  const ok = Math.abs(dOut.durationSec - esperado) < 0.5 && dOut.hasAudio && dOut.width === d0.width;
  console.log(`\n   saída: ${dOut.durationSec.toFixed(2)}s (esperado ~${esperado.toFixed(2)}s) · ${dOut.width}x${dOut.height} · audio ${dOut.hasAudio}`);
  console.log(`   concat: ${r.reencoded ? 're-encode (fallback)' : 'stream-copy (instantâneo)'}`);
  console.log(`\n${ok ? '✓ PASSOU' : '✗ FALHOU'} — ${out}`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error('ERRO', e?.stderr?.toString?.() || e?.message || e); process.exit(1); });
