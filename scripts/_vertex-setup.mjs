/** Config do Vertex no .env.local a partir do JSON da SA — SEM expor o segredo.
 *  Rodar: node scripts/_vertex-setup.mjs "C:/caminho/sa.json" */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const JSON_PATH = process.argv[2] || 'C:/Users/rdnav/Downloads/corded-photon-496113-j3-91b99f551283.json';
const raw = readFileSync(JSON_PATH, 'utf8');
let sa;
try { sa = JSON.parse(raw); } catch { throw new Error('arquivo não é JSON válido: ' + JSON_PATH); }
if (!sa.client_email || !sa.private_key) throw new Error('não parece chave de service account (faltam client_email/private_key)');

const b64 = Buffer.from(raw, 'utf8').toString('base64');
const KEYS = {
  TTS_BACKEND: 'vertex',
  GOOGLE_SERVICE_ACCOUNT_JSON: b64,
  GOOGLE_VERTEX_PROJECT: sa.project_id || 'corded-photon-496113-j3',
  GOOGLE_VERTEX_LOCATION: 'us-central1',
  GEMINI_TTS_VERTEX_MODEL: 'gemini-3.1-flash-tts-preview', // 3.1 flash TTS (validado no Vertex)
};

const ENV = '.env.local';
let lines = existsSync(ENV) ? readFileSync(ENV, 'utf8').split(/\r?\n/) : [];
lines = lines.filter((l) => { const k = l.slice(0, l.indexOf('=')).trim(); return !Object.keys(KEYS).includes(k); });
while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
for (const [k, v] of Object.entries(KEYS)) lines.push(`${k}=${v}`);
writeFileSync(ENV, lines.join('\n') + '\n');

console.log('✓ .env.local atualizado (segredo NÃO impresso):');
console.log('  SA client_email :', sa.client_email);
console.log('  project_id      :', sa.project_id);
console.log('  GOOGLE_SERVICE_ACCOUNT_JSON : <base64, ' + b64.length + ' chars>');
console.log('  TTS_BACKEND=vertex · GOOGLE_VERTEX_LOCATION=us-central1 · GEMINI_TTS_VERTEX_MODEL=gemini-2.5-flash-preview-tts');
