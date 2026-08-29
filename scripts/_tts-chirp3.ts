/** TTS Cloud Text-to-Speech clássico, engine Chirp 3: HD — mesmas vozes do Gemini TTS (Erinome etc.)
 *  mas em engine DEDICADA de TTS: voz estável por construção, dentro e entre chamadas (sem deriva).
 *  Trade-off: sem prompt de estilo (a entrega é a da voz). Limite 5.000 bytes/chamada.
 *  JSON de seções → 1 chamada POR seção + CHIRP_GAP s de silêncio entre elas (engine determinística
 *  = mesma voz entre chamadas); .txt → 1 chamada única. CHIRP_RATE = speakingRate (ex.: 0.93).
 *  Rodar: npx tsx scripts/_tts-chirp3.ts --list                          (vozes pt-BR)
 *         VIDEO_TTS_VOICE=Erinome npx tsx scripts/_tts-chirp3.ts <secoes.json|texto.txt> [saida.mp3] */
import './_env';
import { writeFile, readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { getGoogleAccessToken } from '../lib/tts/google-token';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Erinome';
const RATE = Number(process.env.CHIRP_RATE || '1');
const GAP = Number(process.env.CHIRP_GAP || '1.2');
const API = 'https://texttospeech.googleapis.com/v1';

async function listarVozes(token: string) {
  const r = await fetch(`${API}/voices?languageCode=pt-BR`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`voices ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const data: any = await r.json();
  for (const v of data.voices || []) console.log(`  ${v.name} · ${v.ssmlGender} · ${v.naturalSampleRateHertz}Hz`);
}

async function sintetizar(token: string, text: string): Promise<Buffer> {
  const body = {
    input: { text },
    voice: { languageCode: 'pt-BR', name: `pt-BR-Chirp3-HD-${VOICE}` },
    audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000, ...(RATE !== 1 ? { speakingRate: RATE } : {}) },
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(`${API}/text:synthesize`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if ((r.status === 429 || r.status >= 500) && attempt < 4) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw Object.assign(new Error(`synthesize ${r.status}: ${(await r.text()).slice(0, 400)}`), { fatal: true });
      const data: any = await r.json();
      if (!data?.audioContent) throw new Error('resposta sem audioContent');
      return Buffer.from(data.audioContent, 'base64'); // WAV (LINEAR16 vem com header RIFF)
    } catch (e: any) {
      if (e?.fatal || attempt >= 4) throw e;
      const wait = Math.min(30000, 2000 * 2 ** attempt);
      console.warn(`  ${e?.message || e} — retry em ${wait / 1000}s`);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error('uso: npx tsx scripts/_tts-chirp3.ts --list | <secoes.json|texto.txt> [saida.mp3]');
  const token = await getGoogleAccessToken();
  if (arg === '--list') { await listarVozes(token); return; }

  const out = path.resolve(process.argv[3] || path.join('outputs', 'espansione-chirp3.mp3'));
  const raw = await readFile(arg, 'utf8');
  await mkdir(path.dirname(out), { recursive: true });
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'chirp-'));
  let montagem: string; // wav único OU lista de concat

  if (arg.endsWith('.json')) {
    const secoes = JSON.parse(raw) as { slug: string; texto: string }[];
    console.log(`Chirp3-HD · voz pt-BR-Chirp3-HD-${VOICE} · rate ${RATE} · ${secoes.length} seções + ${GAP}s de pausa entre blocos`);
    const sil = path.join(tmp, 'sil.wav');
    await exec(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(GAP), '-c:a', 'pcm_s16le', sil]);
    const lista: string[] = [];
    for (let i = 0; i < secoes.length; i++) {
      const bytes = Buffer.byteLength(secoes[i].texto, 'utf8');
      if (bytes > 4900) throw new Error(`seção ${secoes[i].slug} com ${bytes} bytes — acima do limite de 5.000/chamada`);
      const wav = await sintetizar(token, secoes[i].texto);
      const p = path.join(tmp, `${String(i + 1).padStart(2, '0')}.wav`);
      await writeFile(p, wav);
      if (i > 0) lista.push(sil);
      lista.push(p);
      console.log(`  [${i + 1}/${secoes.length}] ${secoes[i].slug} · ${(wav.length / 1024).toFixed(0)} KB`);
    }
    montagem = path.join(tmp, 'concat.txt');
    await writeFile(montagem, lista.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
  } else {
    const texto = raw.trim();
    const bytes = Buffer.byteLength(texto, 'utf8');
    if (bytes > 4900) throw new Error(`texto com ${bytes} bytes — acima do limite de 5.000/chamada; dividir nos parágrafos`);
    console.log(`Chirp3-HD · voz pt-BR-Chirp3-HD-${VOICE} · rate ${RATE} · ${texto.length} chars (${bytes} bytes) em 1 chamada`);
    montagem = path.join(tmp, 'unico.wav');
    await writeFile(montagem, await sintetizar(token, texto));
  }

  const inArgs = montagem.endsWith('.txt') ? ['-f', 'concat', '-safe', '0', '-i', montagem] : ['-i', montagem];
  await exec(FFMPEG, ['-y', ...inArgs, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '3', out]);
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  const sz = (await readFile(out)).length;
  const durOut = await exec(FFMPEG.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1'), ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).then((r) => Number(r.stdout.trim())).catch(() => 0);
  console.log(`PRONTO ✅ ${durOut ? durOut.toFixed(0) + 's · ' : ''}${(sz / 1024).toFixed(0)} KB → ${out}`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
