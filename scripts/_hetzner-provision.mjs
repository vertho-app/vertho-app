/** Provisiona a CCX33 efêmera de render e espera ficar pronta (IP + running). */
import { readFileSync } from 'node:fs';
const raw = readFileSync('.env.local', 'utf8');
let TOKEN = null;
for (const line of raw.split(/\r?\n/)) { const i = line.indexOf('='); if (i < 0) continue; const k = line.slice(0, i).trim(); if (/hetzner/i.test(k)) TOKEN = line.slice(i + 1).trim().replace(/^"|"$/g, ''); }
if (!TOKEN) throw new Error('token Hetzner ausente');
const H = (p, opts = {}) => fetch('https://api.hetzner.cloud/v1/' + p, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } }).then(async r => ({ ok: r.ok, status: r.status, body: await r.json() }));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const cloudInit = `#cloud-config
package_update: true
packages:
  - docker.io
runcmd:
  - systemctl enable --now docker
  - ufw allow OpenSSH
  - ufw --force enable
`;

log('criando servidor vertho-render-mt (ccx33, fsn1, ubuntu-22.04)…');
const create = await H('servers', { method: 'POST', body: JSON.stringify({
  name: 'vertho-render-mt', server_type: 'ccx33', image: 'ubuntu-22.04', location: 'fsn1',
  ssh_keys: [113820480], user_data: cloudInit, labels: { role: 'render-worker', ephemeral: 'true' },
}) });
if (!create.ok) throw new Error('create falhou: ' + create.status + ' ' + JSON.stringify(create.body).slice(0, 300));
const id = create.body.server.id;
log('servidor criado id=' + id + ' · aguardando IP/running…');

let ip = null;
for (let i = 0; i < 60; i++) {
  await sleep(5000);
  const s = await H('servers/' + id);
  const srv = s.body.server;
  ip = srv?.public_net?.ipv4?.ip;
  if (srv?.status === 'running' && ip) { log('RUNNING · IP=' + ip); break; }
  if (i % 3 === 0) log('status=' + srv?.status + ' ip=' + (ip || '—'));
}
if (!ip) throw new Error('servidor não ficou pronto a tempo');
console.log('SERVER_ID=' + id);
console.log('SERVER_IP=' + ip);
