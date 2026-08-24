import { readFileSync } from 'node:fs';
import pg from 'pg';
import { sslSupabase } from './_pg-ssl.mjs';
const raw = readFileSync('.env.local', 'utf-8');
const env = {};
for (const l of raw.split(/\r?\n/)) { const i = l.indexOf('='); if (i < 0) continue; env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ''); }
let TOKEN = null; for (const k of Object.keys(env)) if (/hetzner/i.test(k)) TOKEN = env[k];
const ID = 'afc585f8-3edc-4e13-95fe-7110022d9bd4';
const H = (p) => fetch('https://api.hetzner.cloud/v1/' + p, { headers: { Authorization: 'Bearer ' + TOKEN } }).then(r => r.json());
const client = new pg.Client({ connectionString: env.DATABASE_URL, ssl: sslSupabase() });
await client.connect();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let cpuBaixo = 0;
for (let i = 0; i < 50; i++) {
  const { rows } = await client.query(`SELECT status, etapa, error, video_url FROM videos_gerados WHERE id=$1`, [ID]);
  const r = rows[0];
  const b = await H('servers'); let box = '-', tipo = '', cpu = -1;
  if ((b.servers || []).length) { const s = b.servers[0]; box = s.name; tipo = s.server_type?.name;
    const end = new Date().toISOString(), start = new Date(Date.now() - 120000).toISOString();
    const m = await H(`servers/${s.id}/metrics?type=cpu&start=${start}&end=${end}&step=60`).catch(() => null);
    const vals = (m?.metrics?.time_series?.cpu?.values || []).map(v => Number(v[1])); cpu = vals.length ? Math.round(vals[vals.length - 1]) : -1; }
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${r.status}/${r.etapa} | box=${box}(${tipo}) cpu=${cpu}%${r.video_url ? ' URL:' + r.video_url : ''}${r.error ? ' ERR:' + String(r.error).slice(0, 50) : ''}`);
  if (r.status === 'done') {
    console.log('✅ DECK DONE: ' + r.video_url);
    // espera a personalização (saudação) rodar — checa por ~6min
    for (let j = 0; j < 8; j++) {
      await sleep(45000);
      const { rows: vp } = await client.query(`SELECT status, video_url, error FROM videos_personalizados WHERE cell_video_id=$1`, [ID]);
      const p = vp[0];
      console.log(`  saudação: ${p ? p.status + (p.video_url ? ' ' + p.video_url : '') + (p.error ? ' ERR:' + String(p.error).slice(0, 60) : '') : '(ainda não criada)'}`);
      if (p?.status === 'done') { console.log('✅ SAUDAÇÃO OK: ' + p.video_url); break; }
      if (p?.status === 'error') { console.log('❌ SAUDAÇÃO ERRO: ' + p.error); break; }
    }
    break;
  }
  if (r.status === 'error') { console.log('❌ ERROR: ' + r.error); break; }
  if (box !== '-' && cpu >= 0 && cpu < 20) cpuBaixo++; else cpuBaixo = 0;
  if (cpuBaixo >= 5) { console.log('⚠️ CPU baixa ~7.5min — possível travamento.'); break; }
  await sleep(90000);
}
await client.end();
process.exit(0);
