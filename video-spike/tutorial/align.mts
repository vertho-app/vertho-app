/** Split ONE approved continuous take at verified transcript boundaries. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS } from './storyboard';
import { alignSteps } from './alignment';
import { chaveNarracao, sha256, validarClipsTutorial, type TutorialNarration, type TutorialAudioManifest } from './narration-config';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.env.TUTORIAL_OUT_DIR || path.join(HERE, 'out'));
const PUBLIC = path.resolve(process.env.TUTORIAL_PUBLIC_DIR || path.join(HERE, '../../public/video-spike'));
const flow = FLOWS[process.argv[2]];
if (!flow) throw new Error('Tutorial desconhecido');
const source: TutorialNarration = JSON.parse(readFileSync(path.join(OUT, `${flow.id}.narration.json`), 'utf8'));
const audio = path.join(PUBLIC, source.audio);
if (!source.qa?.ok || source.key !== chaveNarracao(flow.id, 'continuous', flow.steps.map(s => s.narration).join('\n\n'))
  || sha256(readFileSync(audio)) !== source.sha256) throw new Error('Take alterado/desatualizado ou sem aprovação');
const transcript = JSON.parse(readFileSync(audio.replace(/\.mp3$/, '.words.json'), 'utf8'));
/**
 * Tolerância de duração PROPORCIONAL, não fixa.
 *
 * Quem garante a IDENTIDADE do take é o `sourceSha256` — exato, byte a byte. A duração
 * serve para pegar transcrição TRUNCADA, e para isso um limiar fixo de 0,15 s estava
 * errado: `Medido 10/09/2026` nos quatro tutoriais, o `ffprobe` (que o narrate usa) e o
 * decodificador do Whisper divergem por ~0,15 % da duração — pdi 63 s → 0,104 s;
 * macae 74 s → 0,104; jornada 98 s → 0,157; disc 124 s → 0,183. É padding do encoder,
 * cresce com o tempo, e com 0,15 s fixo TODO take longo reprovava com a transcrição
 * correta na mão. Uma truncagem de verdade erra por segundos, não por milésimos.
 */
const tolDuracaoS = Math.max(0.25, source.seconds * 0.005);
if (transcript.sourceSha256 !== source.sha256) throw new Error('Transcrição não pertence ao take aprovado (sha256 difere)');
if (Math.abs(transcript.duration - source.seconds) > tolDuracaoS) {
  throw new Error(`Transcrição truncada: ${transcript.duration.toFixed(2)}s contra ${source.seconds.toFixed(2)}s do take (tolerância ${tolDuracaoS.toFixed(2)}s)`);
}
// Corte editorial explícito e auditável, por exemplo uma frase duplicada após
// o fim do roteiro. Nunca reutilizar a decisão em outro take por nome de flow.
const reviewPath = path.join(OUT, `${flow.id}.review.json`);
const review = existsSync(reviewPath) ? JSON.parse(readFileSync(reviewPath, 'utf8')) : null;
if (review && (review.sourceSha256 !== source.sha256 || !(review.audioEnd > 0 && review.audioEnd <= source.seconds)
  || !review.reason || !review.reviewedAt)) throw new Error('Revisão editorial inválida ou referente a outro take');
const audioEnd = review?.audioEnd ?? source.seconds;
const words = transcript.words.filter((w: { end: number }) => w.end <= audioEnd + 0.01);
const aligned = alignSteps(flow.steps, words, audioEnd);
const clips = flow.steps.map((step, i) => {
  const row = aligned[i];
  const start = i === 0 ? 0 : (aligned[i - 1].end + row.start) / 2;
  const end = i === aligned.length - 1 ? audioEnd : (row.end + aligned[i + 1].start) / 2;
  const key = chaveNarracao(flow.id, step.id, step.narration);
  const sliceKey = sha256(JSON.stringify({ sha256: source.sha256, start, end, codec: 'mp3-192k-v1' }));
  const rel = `tutorial/${flow.id}/audio/${step.id}-${sliceKey.slice(0, 16)}.mp3`;
  const dest = path.join(PUBLIC, rel);
  if (!existsSync(dest)) execFileSync('ffmpeg', ['-v', 'error', '-i', audio, '-ss', start.toFixed(6), '-t', (end - start).toFixed(6), '-c:a', 'libmp3lame', '-b:a', '192k', '-n', dest], { windowsHide: true });
  const seconds = Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0',dest], { encoding: 'utf8', windowsHide: true }).trim());
  return { id: step.id, key, audio: rel, seconds, sha256: sha256(readFileSync(dest)), sourceSha256: source.sha256, sourceStart: start, sourceEnd: end, qa: source.qa, createdAt: new Date().toISOString() };
});
const manifest: TutorialAudioManifest = { schema: 3, flow: flow.id, profile: source.profile, source, clips };
validarClipsTutorial(flow, manifest);
writeFileSync(path.join(OUT, `${flow.id}.audio.json`), JSON.stringify(manifest, null, 2));
writeFileSync(path.join(OUT, `${flow.id}.alignment.json`), JSON.stringify({ sourceSha256: source.sha256, review, steps: aligned }, null, 2));
console.log(`${flow.id}: ${clips.length} etapas alinhadas e fatiadas do mesmo take aprovado`);
