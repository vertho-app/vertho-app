// Sobe os MP4 dos tutoriais pro Bunny Stream (mesmo padrão do lib/video/render-helpers).
// Rodar: npx tsx video-spike/tutorial/_bunny-upload.mts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env: Record<string, string> = {};
for (const line of readFileSync(path.join(APP, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const LIB = env.BUNNY_LIBRARY_ID, KEY = env.BUNNY_STREAM_API_KEY;
if (!LIB || !KEY) throw new Error('BUNNY_LIBRARY_ID / BUNNY_STREAM_API_KEY ausentes');

async function upload(rel: string, title: string) {
  const file = path.join(APP, rel);
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, {
    method: 'POST', headers: { AccessKey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  if (!cr.ok) throw new Error(`create ${cr.status}: ${(await cr.text()).slice(0, 200)}`);
  const { guid } = await cr.json() as { guid: string };
  const buf = readFileSync(file);
  const up = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, {
    method: 'PUT', headers: { AccessKey: KEY }, body: buf,
  });
  if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 200)}`);
  console.log(`✓ ${title.padEnd(42)} guid=${guid}  (${(buf.length / 1e6).toFixed(1)} MB)`);
  return guid;
}

const TODOS: [string, string][] = [
  ['outputs/tutorial-disc-app.mp4', 'Tutorial · Mapeamento DISC — como responder'],
  ['outputs/tutorial-disc-ajuda.mp4', 'Tutorial · Mapeamento DISC — completo'],
  ['outputs/tutorial-jornada.mp4', 'Tutorial · Jornada semanal'],
  ['outputs/tutorial-pdi.mp4', 'Tutorial · PDI'],
  ['outputs/tutorial-aplicacao.mp4', 'Tutorial · Semana de missão (aplicação)'],
];

// Sem argumento sobe TODOS — e cada upload cria um guid NOVO, sem substituir o
// anterior (re-PUT no mesmo guid dá 400 "already uploaded"). Rodar sem filtro só
// para republicar a lista inteira duplica os que já estão no ar e obriga a trocar
// todos os ids na aplicação. Passe o nome do flow: `_bunny-upload.mts aplicacao`.
const filtro = process.argv.slice(2);
const jobs = filtro.length
  ? TODOS.filter(([rel]) => filtro.some((f) => rel.includes(f)))
  : TODOS;
if (!jobs.length) throw new Error(`nenhum vídeo casa com ${filtro.join(', ')}`);

console.log(`Bunny library ${LIB} · ${jobs.length} de ${TODOS.length}`);
const out: Record<string, string> = {};
for (const [rel, title] of jobs) out[rel.replace('outputs/tutorial-', '').replace('.mp4', '')] = await upload(rel, title);
console.log('\nGUIDs:', JSON.stringify(out, null, 2));
