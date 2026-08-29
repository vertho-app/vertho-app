/** TTS Vertex (voz Erinome) p/ texto longo: chunking real + pausa entre trechos → MP3 via ffmpeg.
 *  Reusa splitNarrationForTts do pipeline; NÃO usa lamejs (não roda sob tsx).
 *  Rodar: npx tsx scripts/_tts-erinome.ts <texto.txt> [saida.mp3] */
import './_env';
import { writeFile, readFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { getGoogleAccessToken, vertexProjectId } from '../lib/tts/google-token';
import { splitNarrationForTts } from '../lib/tts/narration-text';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const LOC = process.env.GOOGLE_VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.GEMINI_TTS_VERTEX_MODEL || 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.VIDEO_TTS_VOICE || 'Erinome';
const host = LOC === 'global' ? 'aiplatform.googleapis.com' : `${LOC}-aiplatform.googleapis.com`;
const STYLE = 'Narre em português do Brasil, com voz feminina, tom institucional, inspirador e confiante, ritmo pausado e claro, transmitindo credibilidade e cuidado';
const QUESTION_PAUSE = 0.7;
const SEGMENT_PAUSE = 0.22;

// segmentação: corta após pergunta retórica seguida de mais texto (mantém "?" à esquerda)
function segmentarPorPausa(trecho: string): { text: string; q: boolean }[] {
  const parts: { text: string; q: boolean }[] = [];
  const re = /([^?]*\?)\s+(?=\S)/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(trecho)) !== null) {
    const text = trecho.slice(last, m.index + m[1].length).trim();
    if (text) parts.push({ text, q: true });
    last = re.lastIndex;
  }
  const rest = trecho.slice(last).trim();
  if (rest) parts.push({ text: rest, q: /\?$/.test(rest) });
  return parts.length ? parts : [{ text: trecho.trim(), q: /\?$/.test(trecho.trim()) }];
}

const MIN_SEG_WORDS = 4;
const nWords = (s: string) => s.split(/\s+/).filter(Boolean).length;
function coalesceCurtos(parts: { text: string; q: boolean }[]) {
  const out: { text: string; q: boolean }[] = [];
  for (const p of parts) {
    if (out.length && nWords(p.text) < MIN_SEG_WORDS) {
      const prev = out[out.length - 1];
      prev.text = `${prev.text} ${p.text}`.trim();
      prev.q = /\?$/.test(prev.text);
    } else out.push({ ...p });
  }
  if (out.length > 1 && nWords(out[0].text) < MIN_SEG_WORDS) {
    out[1].text = `${out[0].text} ${out[1].text}`.trim();
    out.shift();
  }
  return out;
}

const silencePcm = (sec: number, rate: number): Buffer => Buffer.alloc(Math.round(sec * rate) * 2); // 16-bit mono zeros

async function ttsSeg(token: string, proj: string, text: string): Promise<{ pcm: Buffer; rate: number }> {
  const url = `https://${host}/v1/projects/${proj}/locations/${LOC}/publishers/google/models/${MODEL}:generateContent`;
  const prompt = `${STYLE}:\n\n${text}`;
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } } };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if ((r.status === 429 || r.status === 503) && attempt < 4) {
      const wait = Math.min(30000, 2000 * 2 ** attempt);
      console.warn(`  ${r.status} — retry em ${wait / 1000}s`);
      await new Promise((res) => setTimeout(res, wait)); continue;
    }
    if (!r.ok) throw new Error(`Vertex ${r.status}: ${(await r.text()).slice(0, 240)}`);
    const data: any = await r.json();
    const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    if (!part) {
      if (attempt < 4) { const wait = Math.min(30000, 2000 * 2 ** attempt); console.warn(`  sem áudio — retry em ${wait / 1000}s`); await new Promise((res) => setTimeout(res, wait)); continue; }
      throw new Error('resposta sem áudio após retries');
    }
    const rate = Number(String(part.inlineData.mimeType).match(/rate=(\d+)/)?.[1]) || 24000;
    return { pcm: Buffer.from(part.inlineData.data, 'base64'), rate };
  }
}

async function main() {
  const inFile = process.argv[2];
  if (!inFile) throw new Error('uso: npx tsx scripts/_tts-erinome.ts <texto.txt> [saida.mp3]');
  const outArg = path.resolve(process.argv[3] || path.join('outputs', 'erinome.mp3'));
  const texto = (await readFile(inFile, 'utf8')).trim();
  if (!texto) throw new Error('texto vazio');
  const token = await getGoogleAccessToken();
  const proj = vertexProjectId();
  const segmentos = coalesceCurtos(splitNarrationForTts(texto).flatMap(segmentarPorPausa));
  console.log(`Vertex ${proj} · ${LOC} · ${MODEL} · voz ${VOICE} · ${segmentos.length} segmentos`);

  const partes: Buffer[] = [];
  let rate = 24000; let prevQ = false;
  for (let i = 0; i < segmentos.length; i++) {
    const seg = segmentos[i];
    const { pcm, rate: r } = await ttsSeg(token, proj, seg.text);
    rate = r;
    if (partes.length) partes.push(silencePcm(prevQ ? QUESTION_PAUSE : SEGMENT_PAUSE, rate));
    partes.push(pcm);
    prevQ = seg.q;
    console.log(`  [${i + 1}/${segmentos.length}] ${(pcm.length / 2 / rate).toFixed(1)}s · ${seg.text.slice(0, 56)}…`);
  }

  const full = Buffer.concat(partes);
  await mkdir(path.dirname(outArg), { recursive: true });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vx-'));
  const inP = path.join(dir, 'in.pcm');
  await writeFile(inP, full);
  await exec(FFMPEG, ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', inP, '-c:a', 'libmp3lame', '-q:a', '3', outArg]);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  const sz = (await readFile(outArg)).length;
  const dur = full.length / 2 / rate;
  console.log(`PRONTO ✅ → ${outArg} (${(sz / 1024).toFixed(0)} KB · ${dur.toFixed(0)}s · ${rate} Hz)`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
