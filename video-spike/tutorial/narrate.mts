/**
 * Gera a narração (voz Achird / Beto) de cada etapa do storyboard via o TTS da
 * marca (generateNarrationAudio → PCM Gemini + DSP → MP3). Mede a duração real
 * com ffprobe e grava `out/<flow>.audio.json`.
 *
 * Rodar:  npx tsx video-spike/tutorial/narrate.mts disc
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS, type Flow } from './storyboard';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../..');
const PUBLIC_DIR = path.join(APP_ROOT, 'public', 'video-spike');
const OUT_DIR = path.join(HERE, 'out');
const VOICE = process.env.TUTORIAL_VOICE || 'Achird'; // Beto
// A direção de estilo precisa CASAR com a voz masculina — senão o default da lib
// ('voz feminina… mentora') briga com o timbre do Achird e a voz deriva (às vezes
// puxa pro feminino) a cada segmento gerado.
const STYLE_PADRAO = 'Narre em português do Brasil com voz masculina, grave e firme, tom de mentor experiente, seguro e sereno, dicção clara e ritmo constante, sem variação de gênero';

// Direção de interpretação POR FLOW. Fica no código, não em env: a narração é
// congelada por beat e regenerada aos pedaços — se o estilo viver só na variável
// de ambiente, quem regerar um beat amanhã sem exportá-la reintroduz o tom antigo
// e a voz muda no meio do vídeo.
// `macae`: o take padrão ("grave, sereno, ritmo constante") soou desmotivado ao
// dono — para um convite de boas-vindas o tom tem que levantar no fim.
const STYLE_POR_FLOW: Record<string, string> = {
  macae: 'Narre em português do Brasil com voz masculina, inspiradora e convidativa, tom de treinador que acredita em quem ouve. Comece acolhedor e ganhe energia ao longo da frase, terminando com convicção e otimismo. Dicção clara, sem dureza. Sem variação de gênero.',
};

const STYLE = process.env.TUTORIAL_STYLE || STYLE_POR_FLOW[process.argv[2] || ''] || STYLE_PADRAO;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// .env.local → process.env (o TTS lê TTS_BACKEND/GOOGLE_SERVICE_ACCOUNT_JSON/etc.)
for (const line of readFileSync(path.join(APP_ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
}

function probeDuration(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

async function narrateFlow(flow: Flow) {
  // import tardio: só depois de carregar o .env
  const { generateNarrationAudio } = await import('../../lib/gemini-tts');
  const audioDir = path.join(PUBLIC_DIR, 'tutorial', flow.id, 'audio');
  mkdirSync(audioDir, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // Nome ESTÁVEL por beat (não por índice): reordenar o storyboard não muda o
  // arquivo → o congelamento (skip se já existe) sobrevive a inclusões de beats.
  // `--force` regenera tudo. O TTS é não-determinístico: congelar evita a voz
  // "variar" entre renders quando só se acrescenta um beat.
  const FORCE = process.argv.includes('--force');
  const clips: Array<{ id: string; audio: string; seconds: number }> = [];
  for (const step of flow.steps) {
    const rel = `tutorial/${flow.id}/audio/${step.id}.mp3`;
    const abs = path.join(PUBLIC_DIR, rel);
    if (existsSync(abs) && !FORCE) {
      clips.push({ id: step.id, audio: rel, seconds: probeDuration(abs) });
      log(`· ${step.id.padEnd(14)} mantido (take congelado)`);
      continue;
    }
    const t0 = Date.now();
    const audio = await generateNarrationAudio(step.narration, { voice: VOICE, style: STYLE });
    writeFileSync(abs, audio.buffer);
    clips.push({ id: step.id, audio: rel, seconds: probeDuration(abs) });
    log(`✓ ${step.id.padEnd(14)} ${probeDuration(abs).toFixed(1)}s  (gerado em ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  const outPath = path.join(OUT_DIR, `${flow.id}.audio.json`);
  writeFileSync(outPath, JSON.stringify({ flow: flow.id, voice: VOICE, clips }, null, 2));
  log(`manifesto → ${path.relative(APP_ROOT, outPath)}`);
}

async function main() {
  const flowId = process.argv[2] || 'disc';
  const flow = FLOWS[flowId];
  if (!flow) throw new Error(`flow desconhecido: ${flowId}`);
  log(`narração do flow "${flow.id}" · voz ${VOICE} · backend ${process.env.TTS_BACKEND || 'aistudio'}`);
  await narrateFlow(flow);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
