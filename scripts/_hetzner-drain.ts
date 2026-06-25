/**
 * DRENA a fila de render no Hetzner para finalizar UM vídeo já enfileirado
 * (status render_queued). Provisiona box efêmera → builda+roda o worker → ele
 * puxa o job da fila, renderiza, masteriza e sobe no Bunny → marca done.
 * Monitora o VIDEO alvo até done e SEMPRE deleta a box no fim.
 * Sem GEMINI_API_KEY no worker → finaliza só o DECK (pula personalização).
 * Rodar: VIDEO=<uuid> npx tsx scripts/_hetzner-drain.ts
 */
import './_env';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import pg from 'pg';

const exec = promisify(execFile);
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const VIDEO = process.env.VIDEO || '90ecb619-e049-44b4-b907-49473dab0da7';

const TOKEN = (() => { for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i < 0) continue; const k = l.slice(0, i).trim(); if (/hetzner/i.test(k) && !/render_backend/i.test(k)) { const v = l.slice(i + 1).trim().replace(/^"|"$/g, ''); if (v.length > 10) return v; } } return null; })();
if (!TOKEN) throw new Error('token Hetzner ausente');
const H = (p: string, opts: any = {}) => fetch('https://api.hetzner.cloud/v1/' + p, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }));

const KEY = os.homedir() + '/.ssh/id_ed25519';
const NUL = process.platform === 'win32' ? 'NUL' : '/dev/null';
const SSH = ['-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${NUL}`, '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];
const ssh = (ip: string, cmd: string, timeout = 60000) => exec('ssh', [...SSH, 'root@' + ip, cmd], { timeout, maxBuffer: 32 * 1024 * 1024 });
const scp = (ip: string, src: string, dst: string, timeout = 600000) => exec('scp', [...SSH, '-r', src, `root@${ip}:${dst}`], { timeout, maxBuffer: 32 * 1024 * 1024 });

const cloudInit = `#cloud-config
package_update: true
packages:
  - docker.io
runcmd:
  - systemctl enable --now docker
  - ufw allow OpenSSH
  - ufw --force enable
`;

async function main() {
  let id: number | null = null;
  const sb = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 2 });
  const envPath = os.tmpdir() + '/worker-drain.env';
  try {
    log('alvo VIDEO=' + VIDEO);
    log('provisionando CCX33 (fsn1)…');
    const cr = await H('servers', { method: 'POST', body: JSON.stringify({ name: 'vertho-drain-' + Math.floor(Number(process.env.SOURCE_DATE_EPOCH) || 0 || 1), server_type: 'ccx33', image: 'ubuntu-22.04', location: 'fsn1', ssh_keys: [113820480], user_data: cloudInit, labels: { role: 'render-worker', drain: 'true' } }) });
    if (!cr.ok) throw new Error('create ' + cr.status + ' ' + JSON.stringify(cr.body).slice(0, 200));
    id = cr.body.server.id;
    let ip: string | null = null;
    for (let i = 0; i < 60; i++) { await sleep(3000); const s = await H('servers/' + id); const srv = s.body.server; ip = srv?.public_net?.ipv4?.ip; if (srv?.status === 'running' && ip) break; }
    if (!ip) throw new Error('box não ficou running');
    log('box id=' + id + ' IP=' + ip + ' · esperando SSH+docker…');
    for (let i = 0; i < 40; i++) { await sleep(5000); try { await ssh(ip, 'docker --version', 12000); break; } catch { /* ainda não */ } }
    await ssh(ip, 'cloud-init status --wait >/dev/null 2>&1; true', 240000);
    log('docker pronto. copiando worker…');

    // .env do worker — SEM GEMINI_API_KEY (finaliza só o deck, pula personalização)
    writeFileSync(envPath, [
      `DATABASE_URL=${process.env.DATABASE_URL}`,
      `BUNNY_LIBRARY_ID=${process.env.BUNNY_LIBRARY_ID}`,
      `BUNNY_STREAM_API_KEY=${process.env.BUNNY_STREAM_API_KEY}`,
      `VIDEO_TTS_VOICE=${process.env.VIDEO_TTS_VOICE || 'Vindemiatrix'}`,
      'VIDEO_RENDER_SCALE=1',
      'POLL_INTERVAL_MS=8000',
    ].join('\n') + '\n');
    await ssh(ip, 'mkdir -p /root/worker', 15000);
    await scp(ip, 'worker-hetzner/.', '/root/worker/', 600000);
    await scp(ip, envPath, '/root/worker/.env', 60000);

    log('docker build (npm install + chrome, ~8-12 min)…');
    await ssh(ip, 'cd /root/worker && docker build -t vw . 2>&1 | tail -3', 1200000);
    log('build ok. subindo worker…');
    await ssh(ip, 'docker rm -f vw 2>/dev/null; docker run -d --name vw --env-file /root/worker/.env vw', 60000);
    await sleep(4000);
    log('worker logs:', (await ssh(ip, 'docker logs vw 2>&1 | tail -4', 20000).catch(() => ({ stdout: '?' }))).stdout.trim());

    // monitora o VIDEO alvo até done
    let prev = '';
    for (let i = 0; i < 240; i++) { // ~32 min
      await sleep(8000);
      const { rows } = await sb.query('SELECT status,etapa,video_url,error FROM videos_gerados WHERE id=$1', [VIDEO]);
      const r = rows[0]; const k = `${r?.etapa}|${r?.status}`;
      if (k !== prev) { prev = k; log('  etapa=' + r?.etapa + ' status=' + r?.status + (r?.error ? ' ERRO: ' + String(r.error).slice(0, 150) : '')); }
      if (r?.status === 'done' && r?.video_url) { log('✅ VÍDEO PRONTO → ' + r.video_url); break; }
      if (r?.status === 'error') { log('❌ erro: ' + String(r.error).slice(0, 200)); break; }
    }
  } finally {
    if (id) { log('deletando box id=' + id + '…'); await H('servers/' + id, { method: 'DELETE' }).catch(() => {}); await sleep(3000); const l = await H('servers?label_selector=drain=true'); log('boxes drain restantes:', (l.body.servers || []).length ? '⚠️ ' + (l.body.servers || []).map((s: any) => s.id).join(',') : 'NENHUMA ✓'); }
    try { rmSync(envPath, { force: true }); } catch { /* */ }
    await sb.end().catch(() => {});
    log('FIM.');
  }
}
main().catch((e) => { console.error('ERRO:', e?.stack || e?.message || e); process.exit(1); });
