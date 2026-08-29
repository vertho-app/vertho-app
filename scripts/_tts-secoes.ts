/** TTS Vertex por SEÇÃO: cada seção = 1 chamada única (ZERO emenda) + loudnorm → MP3.
 *  Reusa google-token do pipeline; encode via ffmpeg (lamejs não roda sob tsx).
 *  Rodar: VIDEO_TTS_VOICE=Erinome npx tsx scripts/_tts-secoes.ts <manifest.json> [dir-saida] */
import './_env';
import { writeFile, readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { getGoogleAccessToken, vertexProjectId } from '../lib/tts/google-token';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const LOC = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.GEMINI_TTS_VERTEX_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Erinome';
const host = LOC === 'global' ? 'aiplatform.googleapis.com' : `${LOC}-aiplatform.googleapis.com`;
const STYLE = 'Narre em português do Brasil, com voz feminina, tom institucional, inspirador e confiante, ritmo pausado e claro, transmitindo credibilidade e cuidado';

async function ttsOne(token: string, proj: string, text: string): Promise<{ pcm: Buffer; rate: number }> {
  const url = `https://${host}/v1/projects/${proj}/locations/${LOC}/publishers/google/models/${MODEL}:generateContent`;
  const body = { contents: [{ role: 'user', parts: [{ text: `${STYLE}:\n\n${text}` }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if ((r.status === 429 || r.status === 503) && attempt < 4) { const wait = Math.min(30000, 2000 * 2 ** attempt); console.warn(`  ${r.status} — retry em ${wait / 1000}s`); await new Promise((res) => setTimeout(res, wait)); continue; }
    if (!r.ok) throw new Error(`Vertex ${r.status}: ${(await r.text()).slice(0, 240)}`);
    const data: any = await r.json();
    const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    if (!part) { if (attempt < 4) { const wait = Math.min(30000, 2000 * 2 ** attempt); console.warn(`  sem áudio — retry em ${wait / 1000}s`); await new Promise((res) => setTimeout(res, wait)); continue; } throw new Error('resposta sem áudio após retries'); }
    const rate = Number(String(part.inlineData.mimeType).match(/rate=(\d+)/)?.[1]) || 24000;
    return { pcm: Buffer.from(part.inlineData.data, 'base64'), rate };
  }
}

async function main() {
  const manifest = process.argv[2];
  if (!manifest) throw new Error('uso: npx tsx scripts/_tts-secoes.ts <manifest.json> [dir-saida]');
  const outDir = path.resolve(process.argv[3] || path.join('outputs', 'espansione-secoes'));
  const secoes: { slug: string; texto: string }[] = JSON.parse(await readFile(manifest, 'utf8'));
  await mkdir(outDir, { recursive: true });
  const token = await getGoogleAccessToken();
  const proj = vertexProjectId();
  console.log(`Vertex ${proj} · ${LOC} · ${MODEL} · voz ${VOICE} · ${secoes.length} seções → ${outDir}`);

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'vx-'));
  let idx = 0;
  for (const s of secoes) {
    idx++;
    const nn = String(idx).padStart(2, '0');
    const { pcm, rate } = await ttsOne(token, proj, s.texto);
    const inP = path.join(tmp, `${nn}.pcm`);
    const out = path.join(outDir, `${nn}-${s.slug}.mp3`);
    await writeFile(inP, pcm);
    // 1 chamada = ZERO emenda dentro do arquivo; loudnorm alinha o volume ENTRE as seções (p/ montagem posterior).
    await exec(FFMPEG, ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', inP, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '3', out]);
    const sz = (await readFile(out)).length;
    console.log(`  [${nn}] ${(pcm.length / 2 / rate).toFixed(0)}s · ${(sz / 1024).toFixed(0)} KB · ${s.slug}`);
  }
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log(`PRONTO ✅ → ${outDir}`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
