/** Encerra (deleta) a box de teste do Chatwoot e confirma que não sobrou nenhuma. */
import { readFileSync } from 'node:fs';
const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i < 0) continue; env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ''); }
let TOKEN = null; for (const k of Object.keys(env)) if (/hetzner|hcloud/i.test(k) && !/backend/i.test(k)) { const v = env[k]; if (v.length > 10) TOKEN = v; }
const H = (p, o = {}) => fetch('https://api.hetzner.cloud/v1/' + p, { ...o, headers: { Authorization: 'Bearer ' + TOKEN } }).then(r => r.json().catch(() => ({})));
const arg = process.argv[2];
const list = await H('servers?label_selector=role%3Dchatwoot-test');
const alvos = arg ? [{ id: Number(arg) }] : (list.servers || []);
for (const s of alvos) { const r = await fetch('https://api.hetzner.cloud/v1/servers/' + s.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN } }); console.log('DELETE', s.id, r.status); }
const left = await H('servers?label_selector=role%3Dchatwoot-test');
console.log('boxes chatwoot-test restantes:', (left.servers || []).length);
