import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf-8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function probe(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  const t = await r.text();
  console.log(`${r.status} ${path} →`, t.slice(0, 200));
}

await probe('diag_ideb?select=*&limit=1');
await probe('diag_escolas?select=count');
await probe('diag_saeb_snapshots?select=*&limit=1');
await probe('diag_mv_escola_infra_saeb?select=*&limit=1');
