/**
 * Builda o SNAPSHOT da box de render (Chrome+node+worker `vw` baked) que o
 * orquestrador usa pra subir boxes efêmeras on-demand (ensureRenderWorker).
 * Provisiona uma box → scp worker-hetzner → docker build -t vw → cloud-init
 * clean → poweroff → create_image (snapshot) → DELETA a box → imprime o ID.
 *
 * RODAR SEMPRE QUE worker-hetzner/* mudar. Depois, setar RENDER_SNAPSHOT_ID
 * (no trigger.dev e onde o orquestrador roda) com o ID impresso.
 *   node scripts/_render-snapshot-build.mjs
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import os from 'node:os';

const exec = promisify(execFile);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let TOKEN = null;
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i < 0) continue; const k = l.slice(0, i).trim(); if (/hetzner/i.test(k) && !/render_backend/i.test(k)) { const v = l.slice(i + 1).trim().replace(/^"|"$/g, ''); if (v.length > 10) TOKEN = v; } }
if (!TOKEN) throw new Error('token Hetzner ausente');
const H = (p, opts = {}) => fetch('https://api.hetzner.cloud/v1/' + p, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }));

const KEY = os.homedir() + '/.ssh/id_ed25519';
const NUL = process.platform === 'win32' ? 'NUL' : '/dev/null';
const SSH = ['-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${NUL}`, '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];
const ssh = (ip, cmd, timeout = 60000) => exec('ssh', [...SSH, 'root@' + ip, cmd], { timeout, maxBuffer: 32 * 1024 * 1024 });
const scp = (ip, src, dst, timeout = 600000) => exec('scp', [...SSH, '-r', src, `root@${ip}:${dst}`], { timeout, maxBuffer: 32 * 1024 * 1024 });

const cloudInit = `#cloud-config
package_update: true
packages:
  - docker.io
runcmd:
  - systemctl enable --now docker
`;

async function main() {
  let id = null;
  try {
    // Builda no MENOR tipo alvo (cx33) — o snapshot herda o disco do build, e a
    // Hetzner só cria servidor com disco ≥ o do snapshot. cx33 (disco menor) cabe
    // em cx33 E em tipos maiores (cx43/ccx33). Intel x86, sem cross-vendor. CX só
    // existe em nbg1/hel1 (fsn1 não tem).
    const buildType = process.env.SNAPSHOT_BUILD_TYPE || 'cx33';
    const buildLoc = process.env.SNAPSHOT_BUILD_LOCATION || 'nbg1';
    log(`provisionando box de build (${buildType}, ${buildLoc})…`);
    const cr = await H('servers', { method: 'POST', body: JSON.stringify({ name: 'vertho-snapshot-build', server_type: buildType, image: 'ubuntu-22.04', location: buildLoc, ssh_keys: [113820480], user_data: cloudInit, labels: { role: 'snapshot-build' } }) });
    if (!cr.ok) throw new Error('create ' + cr.status + ' ' + JSON.stringify(cr.body).slice(0, 200));
    id = cr.body.server.id;
    let ip = null;
    for (let i = 0; i < 60; i++) { await sleep(3000); const s = await H('servers/' + id); const srv = s.body.server; ip = srv?.public_net?.ipv4?.ip; if (srv?.status === 'running' && ip) break; }
    if (!ip) throw new Error('box não ficou running');
    log('box id=' + id + ' IP=' + ip + ' · esperando SSH+docker…');
    for (let i = 0; i < 40; i++) { await sleep(5000); try { await ssh(ip, 'docker --version', 12000); break; } catch { /* ainda não */ } }
    await ssh(ip, 'cloud-init status --wait >/dev/null 2>&1; true', 240000);

    log('copiando worker-hetzner + docker build -t vw…');
    await ssh(ip, 'mkdir -p /root/worker', 15000);
    await scp(ip, 'worker-hetzner/.', '/root/worker/', 600000);
    await ssh(ip, 'cd /root/worker && docker build -t vw . 2>&1 | tail -3', 1200000);
    log('imagem vw pronta. verificando…');
    log((await ssh(ip, 'docker images vw --format "{{.Repository}}:{{.Tag}} {{.Size}}"', 15000)).stdout.trim());

    // cloud-init clean → garante que o user_data do PROVISION rode em boxes novas
    await ssh(ip, 'cloud-init clean --logs 2>/dev/null; rm -f /root/worker/.env; true', 20000);

    log('desligando p/ snapshot consistente…');
    await H(`servers/${id}/actions/poweroff`, { method: 'POST' });
    for (let i = 0; i < 30; i++) { await sleep(4000); const s = await H('servers/' + id); if (s.body.server?.status === 'off') break; }

    log('criando snapshot (create_image)…');
    const img = await H(`servers/${id}/actions/create_image`, { method: 'POST', body: JSON.stringify({ type: 'snapshot', description: 'vertho-render-worker', labels: { role: 'render-snapshot' } }) });
    if (!img.ok) throw new Error('create_image ' + img.status + ' ' + JSON.stringify(img.body).slice(0, 200));
    const imageId = img.body.image.id;
    log('snapshot id=' + imageId + ' · aguardando ficar available…');
    for (let i = 0; i < 90; i++) { await sleep(5000); const s = await H('images/' + imageId); const st = s.body.image?.status; if (st === 'available') { log('snapshot AVAILABLE'); break; } if (i % 6 === 0) log('  status=' + st); }

    console.log('\n========================================');
    console.log('RENDER_SNAPSHOT_ID=' + imageId);
    console.log('========================================\n');
  } finally {
    if (id) { log('deletando box de build id=' + id + '…'); await H('servers/' + id, { method: 'DELETE' }).catch(() => {}); await sleep(3000); const l = await H('servers?label_selector=role=snapshot-build'); log('boxes build restantes:', (l.body.servers || []).length ? '⚠️ ' + (l.body.servers || []).map((s) => s.id).join(',') : 'NENHUMA ✓'); }
    log('FIM.');
  }
}
main().catch((e) => { console.error('ERRO:', e?.stack || e?.message || e); process.exit(1); });
