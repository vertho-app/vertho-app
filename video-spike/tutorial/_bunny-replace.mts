// DELETE os DISC antigos + sobe os limpos (GUIDs novos). npx tsx ..._bunny-replace.mts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env: Record<string, string> = {};
for (const line of readFileSync(path.join(APP, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const LIB = env.BUNNY_LIBRARY_ID!, KEY = env.BUNNY_STREAM_API_KEY!;

async function del(guid: string) {
  const r = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { method: 'DELETE', headers: { AccessKey: KEY } });
  console.log(`del ${guid} → ${r.status}`);
}
async function upload(rel: string, title: string) {
  const cr = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos`, {
    method: 'POST', headers: { AccessKey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
  });
  const { guid } = await cr.json() as { guid: string };
  const buf = readFileSync(path.join(APP, rel));
  const up = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${guid}`, { method: 'PUT', headers: { AccessKey: KEY }, body: buf });
  console.log(`${up.ok ? '✓' : '✗'} ${title.padEnd(38)} guid=${guid} (${(buf.length / 1e6).toFixed(1)} MB)`);
  return guid;
}

await del('440c084e-0ff8-4767-a89f-c5424a93f65d');
await del('726052dc-b6f1-496f-b90a-050835738e7c');
const app = await upload('outputs/tutorial-disc-app.mp4', 'Tutorial · Mapeamento DISC — como responder');
const ajuda = await upload('outputs/tutorial-disc-ajuda.mp4', 'Tutorial · Mapeamento DISC — completo');
console.log('\nNOVOS GUIDs:', JSON.stringify({ 'disc-app': app, 'disc-ajuda': ajuda }, null, 2));
