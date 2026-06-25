/** Prova de voz: Vertex (modelo do env) + Vindemiatrix → MP3 via ffmpeg.
 *  Rodar: npx tsx scripts/_vertex-prova.ts */
import './_env';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { getGoogleAccessToken, vertexProjectId } from '../lib/tts/google-token';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const LOC = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.GEMINI_TTS_VERTEX_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Vindemiatrix';
const host = LOC === 'global' ? 'aiplatform.googleapis.com' : `${LOC}-aiplatform.googleapis.com`;

async function main() {
  const token = await getGoogleAccessToken();
  const proj = vertexProjectId();
  const texto = 'Olá! Aqui é a Vertho, agora pela Vertex. A resposta vem com clareza? Quase sempre — quando o foco está no próximo passo.';
  const url = `https://${host}/v1/projects/${proj}/locations/${LOC}/publishers/google/models/${MODEL}:generateContent`;
  const body = { contents: [{ role: 'user', parts: [{ text: texto }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  console.log('Vertex:', proj, '·', LOC, '·', MODEL, '· voz', VOICE);
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Vertex ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const data: any = await r.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
  if (!part) throw new Error('sem áudio na resposta');
  const rate = Number(String(part.inlineData.mimeType).match(/rate=(\d+)/)?.[1]) || 24000;
  const pcm = Buffer.from(part.inlineData.data, 'base64');

  const dir = await mkdtemp(path.join(os.tmpdir(), 'vx-'));
  const inP = path.join(dir, 'in.pcm');
  const out = path.resolve('outputs', 'vertex-prova.mp3');
  await writeFile(inP, pcm);
  await exec(FFMPEG, ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', inP, '-c:a', 'libmp3lame', '-q:a', '4', out]);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  const sz = (await readFile(out)).length;
  console.log(`PRONTO ✅ → ${out} (${(sz / 1024).toFixed(0)} KB) · ${rate} Hz`);
  console.log('Note a pausa dramática após "...com clareza?"');
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
