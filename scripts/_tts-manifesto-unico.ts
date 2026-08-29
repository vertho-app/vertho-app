/** TTS Vertex — manifesto INTEIRO numa ÚNICA chamada (voz idêntica por construção) + temperature travada.
 *  Entrada: JSON [{slug,texto}] (junta com parágrafo duplo) ou .txt puro. Loudnorm + MP3 via ffmpeg.
 *  Rodar: VIDEO_TTS_VOICE=Erinome npx tsx scripts/_tts-manifesto-unico.ts <secoes.json|texto.txt> [saida.mp3] */
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

async function ttsUnico(token: string, proj: string, text: string): Promise<{ pcm: Buffer; rate: number }> {
  const url = `https://${host}/v1/projects/${proj}/locations/${LOC}/publishers/google/models/${MODEL}:generateContent`;
  const body = { contents: [{ role: 'user', parts: [{ text: `${STYLE}\n\n${text}` }] }], generationConfig: { temperature: TEMPERATURE, responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  for (let attempt = 0; ; attempt++) {
    let r: Response;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    } catch (e: any) {
      if (attempt >= 4) throw e;
      const wait = Math.min(30000, 2000 * 2 ** attempt); console.warn(`  ${e?.message || e} — retry em ${wait / 1000}s`); await new Promise((res) => setTimeout(res, wait)); continue;
    }
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
  const inFile = process.argv[2];
  if (!inFile) throw new Error('uso: npx tsx scripts/_tts-manifesto-unico.ts <secoes.json|texto.txt> [saida.mp3]');
  const out = path.resolve(process.argv[3] || path.join('outputs', 'espansione-manifesto-unico.mp3'));
  const raw = await readFile(inFile, 'utf8');
  const texto = inFile.endsWith('.json')
    ? (JSON.parse(raw) as { slug: string; texto: string }[]).map((s) => s.texto).join('\n\n')
    : raw.trim();
  await mkdir(path.dirname(out), { recursive: true });
  const token = await getGoogleAccessToken();
  const proj = vertexProjectId();
  console.log(`Vertex ${proj} · ${LOC} · ${MODEL} · voz ${VOICE} · temp ${TEMPERATURE} · ${texto.length} chars em 1 CHAMADA ÚNICA`);

  const { pcm, rate } = await ttsUnico(token, proj, texto);
  const dur = pcm.length / 2 / rate;
  console.log(`  áudio recebido: ${dur.toFixed(0)}s @ ${rate}Hz`);

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'vx-'));
  const inP = path.join(tmp, 'unico.pcm');
  await writeFile(inP, pcm);
  await exec(FFMPEG, ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', inP, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '3', out]);
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
  const sz = (await readFile(out)).length;
  console.log(`PRONTO ✅ ${dur.toFixed(0)}s · ${(sz / 1024).toFixed(0)} KB → ${out}`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
