/** Gera N takes Gemini TTS de CADA bloco (deriva é estocástica → amostrar e escolher depois).
 *  Saída: <outDir>/b<bloco>t<take>.mp3 (loudnorm). Escolha via _timbre-match.ts.
 *  Rodar: VIDEO_TTS_VOICE=Erinome npx tsx scripts/_tts-blocos-takes.ts <secoes.json> <outDir> [takes=5] */
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
const TEMPERATURE = Number(process.env.VIDEO_TTS_TEMPERATURE || '0.2');
const host = LOC === 'global' ? 'aiplatform.googleapis.com' : `${LOC}-aiplatform.googleapis.com`;
const STYLE = 'Narre o texto a seguir em português brasileiro, com voz feminina firme, calorosa e intelectualmente articulada. Ritmo pausado e reflexivo, com pequenas pausas entre as frases de impacto. Sem entonação publicitária. Mantenha exatamente o mesmo timbre, a mesma velocidade e o mesmo caráter de voz, constantes do início ao fim da narração, como uma única locutora gravando em um único take.';

async function tts(token: string, proj: string, text: string): Promise<{ pcm: Buffer; rate: number }> {
  const url = `https://${host}/v1/projects/${proj}/locations/${LOC}/publishers/google/models/${MODEL}:generateContent`;
  const body = { contents: [{ role: 'user', parts: [{ text: `${STYLE}\n\n${text}` }] }], generationConfig: { temperature: TEMPERATURE, responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if ((r.status === 429 || r.status >= 500) && attempt < 5) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw Object.assign(new Error(`Vertex ${r.status}: ${(await r.text()).slice(0, 240)}`), { fatal: true });
      const data: any = await r.json();
      const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
      if (!part) throw new Error('resposta sem áudio');
      const rate = Number(String(part.inlineData.mimeType).match(/rate=(\d+)/)?.[1]) || 24000;
      return { pcm: Buffer.from(part.inlineData.data, 'base64'), rate };
    } catch (e: any) {
      if (e?.fatal || attempt >= 5) throw e;
      const wait = Math.min(30000, 2000 * 2 ** attempt);
      console.warn(`  ${e?.message || e} — retry em ${wait / 1000}s`);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}

async function main() {
  const [manifest, outDirArg] = [process.argv[2], process.argv[3]];
  if (!manifest || !outDirArg) throw new Error('uso: npx tsx scripts/_tts-blocos-takes.ts <secoes.json> <outDir> [takes]');
  const TAKES = Number(process.argv[4] || '5');
  const outDir = path.resolve(outDirArg);
  const secoes: { slug: string; texto: string }[] = JSON.parse(await readFile(manifest, 'utf8'));
  await mkdir(outDir, { recursive: true });
  const token = await getGoogleAccessToken();
  const proj = vertexProjectId();
  console.log(`${MODEL} · voz ${VOICE} · temp ${TEMPERATURE} · ${secoes.length} blocos × ${TAKES} takes → ${outDir}`);

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'takes-'));
  for (let b = 0; b < secoes.length; b++) {
    for (let t = 1; t <= TAKES; t++) {
      const { pcm, rate } = await tts(token, proj, secoes[b].texto);
      const inP = path.join(tmp, 'raw.pcm');
      const out = path.join(outDir, `b${b + 1}t${t}.mp3`);
      await writeFile(inP, pcm);
      await exec(FFMPEG, ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', inP, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '3', out]);
      console.log(`  b${b + 1}t${t} ${secoes[b].slug} · ${(pcm.length / 2 / rate).toFixed(0)}s`);
    }
  }
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  console.log('PRONTO ✅');
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
