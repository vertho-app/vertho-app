/**
 * BENCH do "ligar" Hetzner: sobe uma CCX33 efêmera, cronometra os estágios
 * (boot→running, SSH respondendo, cloud-init/docker pronto) e SEMPRE deleta +
 * verifica no fim. Mede o tempo real do overhead fixo por box.
 *
 * Rodar: npx tsx scripts/_hetzner-bench.mjs   (ou node)
 */
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';

const exec = promisify(execFile);
let TOKEN = null;
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('='); if (i < 0) continue;
  const k = line.slice(0, i).trim();
  if (/hetzner/i.test(k) && !/render_backend/i.test(k)) {
    const v = line.slice(i + 1).trim().replace(/^"|"$/g, '');
    if (v.length > 10) TOKEN = v;
  }
}
if (!TOKEN) throw new Error('token Hetzner ausente');

const H = (p, opts = {}) => fetch('https://api.hetzner.cloud/v1/' + p, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const secs = (a, b) => ((b - a) / 1000).toFixed(0) + 's';

const cloudInit = `#cloud-config
package_update: true
packages:
  - docker.io
runcmd:
  - systemctl enable --now docker
  - ufw allow OpenSSH
  - ufw --force enable
`;
const KEY = os.homedir() + '/.ssh/id_ed25519';
const NULLHOST = process.platform === 'win32' ? 'NUL' : '/dev/null';
const sshArgs = ['-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${NULLHOST}`, '-o', 'ConnectTimeout=8', '-o', 'BatchMode=yes'];
const ssh = (ip, cmd, timeout = 300000) => exec('ssh', [...sshArgs, 'root@' + ip, cmd], { timeout, maxBuffer: 8 * 1024 * 1024 });

let id = null;
try {
  const t0 = now();
  log('criando CCX33 efêmera (fsn1, ubuntu-22.04)…');
  const create = await H('servers', { method: 'POST', body: JSON.stringify({ name: 'vertho-bench-' + Math.floor(t0 / 1000), server_type: 'ccx33', image: 'ubuntu-22.04', location: 'fsn1', ssh_keys: [113820480], user_data: cloudInit, labels: { role: 'render-worker', ephemeral: 'true', bench: 'true' } }) });
  if (!create.ok) throw new Error('create ' + create.status + ' ' + JSON.stringify(create.body).slice(0, 300));
  id = create.body.server.id;
  log('id=' + id + ' · cronometrando…');

  // ESTÁGIO 1 — boot até running + IP
  let ip = null, tRun = null;
  for (let i = 0; i < 120; i++) { await sleep(3000); const s = await H('servers/' + id); const srv = s.body.server; ip = srv?.public_net?.ipv4?.ip; if (srv?.status === 'running' && ip) { tRun = now(); break; } }
  if (!ip || !tRun) throw new Error('não ficou running a tempo');
  log(`▶ ESTÁGIO 1 — VM running + IP: ${secs(t0, tRun)} (IP=${ip})`);

  // ESTÁGIO 2 — SSH respondendo
  let tSsh = null;
  for (let i = 0; i < 48; i++) { await sleep(5000); try { await ssh(ip, 'true', 12000); tSsh = now(); break; } catch { /* ainda não */ } }
  if (tSsh) log(`▶ ESTÁGIO 2 — SSH respondendo: ${secs(t0, tSsh)}`);
  else log('▶ ESTÁGIO 2 — SSH não respondeu em ~4min (segue p/ deletar)');

  // ESTÁGIO 3 — cloud-init concluído (docker instalado)
  if (tSsh) {
    try {
      await ssh(ip, 'cloud-init status --wait >/dev/null 2>&1; true', 360000);
      const tCi = now();
      log(`▶ ESTÁGIO 3 — cloud-init concluído (Docker instalado): ${secs(t0, tCi)}`);
      const d = await ssh(ip, 'docker --version 2>/dev/null || echo none', 15000).catch(() => ({ stdout: '?' }));
      log('   docker:', String(d.stdout).trim());
    } catch (e) { log('▶ ESTÁGIO 3 — falhou/timeout:', String(e.message || e).slice(0, 120)); }
  }
  log(`TOTAL até "Docker pronto" (sem o docker pull da imagem do worker): ~${secs(t0, now())}`);
} finally {
  if (id) {
    log('deletando box id=' + id + '…');
    const del = await H('servers/' + id, { method: 'DELETE' });
    log('delete HTTP ' + del.status);
    await sleep(3000);
    const list = await H('servers?label_selector=bench=true');
    const rem = (list.body.servers || []).map((s) => s.id);
    log('boxes bench restantes:', rem.length ? '⚠️ ' + rem.join(',') : 'NENHUMA ✓');
  }
}
