/** A/B de VOZ do Beto (mentor): mesmo texto, N vozes masculinas do Gemini TTS via Vertex.
 *  Rodar: npx tsx scripts/_tts-beto-ab.ts [dir-saida]
 *  Saída: um MP3 por voz, loudnorm -16 LUFS, nomeado beto-<voz>.mp3 */
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
const host = LOC === 'global' ? 'aiplatform.googleapis.com' : `${LOC}-aiplatform.googleapis.com`;

// Vozes masculinas candidatas (rótulo do catálogo Gemini entre parênteses).
const VOZES = [
  'Charon',      // informative — já é a voz "Mentor" do podcast multi-speaker
  'Achird',      // friendly
  'Iapetus',     // clear
  'Algieba',     // smooth
  'Umbriel',     // easy-going
  'Sadaltager',  // knowledgeable
];

const STYLE = 'Narre em português do Brasil com voz masculina brasileira, acolhedora, segura e íntima, ritmo moderado e pausas reflexivas naturais, como um mentor experiente conversando diretamente com a pessoa. Sem entonação publicitária. Mantenha o mesmo timbre e caráter do início ao fim, como um único locutor em um único take.';

// Trecho real de devolutiva (perfil S — mesmo material do relatório da piloto).
const TEXTO = `Oi, Sheilla. Aqui é o Beto. Sentei com calma pra olhar o seu mapeamento e queria dividir com você o que ele me contou.
A primeira coisa que salta é a sua consistência. Você tende a construir com as pessoas, não por cima delas. Isso cria um tipo de confiança que não se decreta: a equipe da escola sente que você fica, que você escuta, que você não abandona no meio.
E tem um segundo movimento aí, mais silencioso. Quando a situação aperta, você ativa uma dose de iniciativa que nem sempre aparece no dia a dia. Não é falta de coragem. É escolha de momento.
O que eu te convido a olhar é justamente isso: talvez você esteja guardando essa firmeza pra depois, quando ela poderia entrar bem antes — sem que você deixe de ser quem você é.`;

async function tts(token: string, proj: string, voice: string) {
  const url = `https://${host}/v1/projects/${proj}/locations/${LOC}/publishers/google/models/${MODEL}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: `${STYLE}\n\n${TEXTO}` }] }],
    generationConfig: {
      temperature: 0.2,
      responseModalities: ['AUDIO'],
      speechConfig: { languageCode: 'pt-BR', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  };
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if ((r.status === 429 || r.status === 503) && attempt < 4) {
      const wait = Math.min(30000, 2000 * 2 ** attempt);
      console.warn(`  ${voice}: ${r.status} — retry em ${wait / 1000}s`);
      await new Promise((res) => setTimeout(res, wait));
      continue;
    }
    if (!r.ok) throw new Error(`Vertex ${r.status}: ${(await r.text()).slice(0, 240)}`);
    const data: any = await r.json();
    const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    if (!part) {
      if (attempt < 4) { await new Promise((res) => setTimeout(res, 3000)); continue; }
      throw new Error('resposta sem áudio após retries');
    }
    const rate = Number(String(part.inlineData.mimeType).match(/rate=(\d+)/)?.[1]) || 24000;
    return { pcm: Buffer.from(part.inlineData.data, 'base64'), rate };
  }
}

async function main() {
  const outDir = path.resolve(process.argv[2] || path.join('outputs', 'beto-vozes'));
  await mkdir(outDir, { recursive: true });
  const token = await getGoogleAccessToken();
  const proj = vertexProjectId();
  console.log(`Vertex ${proj} · ${LOC} · ${MODEL} · ${VOZES.length} vozes · ${TEXTO.length} chars cada`);

  for (const voice of VOZES) {
    try {
      const { pcm, rate } = await tts(token, proj, voice);
      const dur = pcm.length / 2 / rate;
      const tmp = await mkdtemp(path.join(os.tmpdir(), 'beto-'));
      const inP = path.join(tmp, 'raw.pcm');
      await writeFile(inP, pcm);
      const out = path.join(outDir, `beto-${voice}.mp3`);
      await exec(FFMPEG, ['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', inP, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-c:a', 'libmp3lame', '-q:a', '3', out]);
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
      const sz = (await readFile(out)).length;
      console.log(`  ✅ ${voice.padEnd(12)} ${dur.toFixed(0)}s · ${(sz / 1024).toFixed(0)} KB → ${out}`);
    } catch (e: any) {
      console.error(`  ❌ ${voice}: ${e?.message || e}`);
    }
  }
  console.log(`\nPRONTO → ${outDir}`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
