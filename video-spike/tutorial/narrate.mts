/**
 * Tutorial genérico: um take contínuo do Beto atual, via Vertex, QA fechado.
 * Não sintetize cada beat separadamente: isso sorteia um registro a cada tela.
 * Depois: transcribe.py <mp3> → align.mts <flow> → build/render.
 * Cache por texto + perfil completo + hash do arquivo, nunca só existência.
 * --force cria outro take sem apagar o anterior.
 * TUTORIAL_ENV_FILE / TUTORIAL_OUT_DIR / TUTORIAL_PUBLIC_DIR: worktree isolada.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS } from './storyboard';
import { perfilTutorial, chaveNarracao, sha256, type TutorialNarration } from './narration-config';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../..');
const PUBLIC_DIR = path.resolve(process.env.TUTORIAL_PUBLIC_DIR || path.join(APP_ROOT, 'public', 'video-spike'));
const OUT_DIR = path.resolve(process.env.TUTORIAL_OUT_DIR || path.join(HERE, 'out'));
const envFile = process.env.TUTORIAL_ENV_FILE || path.join(APP_ROOT, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const flow = FLOWS[process.argv[2] || 'disc'];
  if (!flow) throw new Error('Tutorial desconhecido');
  if (process.argv.some(a => a.startsWith('--only='))) throw new Error('Narre o tutorial inteiro, não beats isolados');
  const profile = perfilTutorial(flow.id);
  if (process.env.TUTORIAL_VOICE && process.env.TUTORIAL_VOICE !== profile.voice) throw new Error('TUTORIAL_VOICE diverge do elenco atual do Beto');
  if (process.env.TUTORIAL_STYLE && process.env.TUTORIAL_STYLE !== profile.style) throw new Error('Direção deve ser versionada em narration-config.ts');
  process.env.TTS_BACKEND = profile.backend;
  process.env.GEMINI_TTS_VERTEX_MODEL = profile.model;
  process.env.TTS_QA_GATE = 'on';
  const text = flow.steps.map(s => s.narration).join('\n\n');
  const key = chaveNarracao(flow.id, 'continuous', text, profile);
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${flow.id}.narration.json`);
  const old: TutorialNarration | null = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
  if (!process.argv.includes('--force') && old?.schema === 3 && old.key === key && old.qa?.ok
    && existsSync(path.join(PUBLIC_DIR, old.audio)) && sha256(readFileSync(path.join(PUBLIC_DIR, old.audio))) === old.sha256) {
    console.log(`${flow.id}: take contínuo atual aprovado mantido`); return;
  }
  console.log(`${flow.id} · ${profile.voice} · ${profile.model} · Vertex · contínuo, sem saudação nominal`);
  const { generateNarrationAudio } = await import('../../lib/gemini-tts');
  const result = await generateNarrationAudio(text, {
    voice: profile.voice, style: profile.style, segmentar: false,
    tentativas: profile.tentativas, retakeParalelo: false,
    ledger: { feature: 'tts_tutorial', artifactKey: `tutorial:${flow.id}:continuous:${key}` },
  });
  if (!result.qa?.ok) throw new Error('Áudio sem aprovação explícita do QA');
  const audio = `tutorial/${flow.id}/audio/continuous-${key.slice(0, 12)}-${randomUUID().slice(0, 8)}.mp3`;
  const abs = path.join(PUBLIC_DIR, audio);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, result.buffer, { flag: 'wx' });
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', abs], { encoding: 'utf8', windowsHide: true }).trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Áudio sem duração');
  const manifest: TutorialNarration = { schema: 3, flow: flow.id, profile, text, key, audio, seconds, sha256: sha256(result.buffer), qa: result.qa, createdAt: new Date().toISOString() };
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`APROVADO ${flow.id} ${seconds.toFixed(1)}s → ${abs}`);
}
main().catch(e => { console.error('ERRO:', e?.message || e); process.exitCode = 1; });
