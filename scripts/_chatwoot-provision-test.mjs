/**
 * TESTE E2E de provisionamento do Chatwoot (efêmero): cria CX33/hel1 → cloud-init
 * (docker/ufw/hardening) → sobe a stack do Chatwoot → valida → DEIXA de pé p/
 * inspeção (deletar com _chatwoot-kill.mjs). Sem DNS/Twilio: não testa HTTPS/WhatsApp.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const exec = promisify(execFile);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const env = {};
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i < 0) continue; env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ''); }
let TOKEN = null; for (const k of Object.keys(env)) if (/hetzner|hcloud/i.test(k) && !/backend/i.test(k)) { const v = env[k]; if (v.length > 10) TOKEN = v; }
if (!TOKEN) throw new Error('token Hetzner ausente');
const H = (p, opts = {}) => fetch('https://api.hetzner.cloud/v1/' + p, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }));

const KEY = os.homedir() + '/.ssh/id_ed25519';
const PUB = readFileSync(KEY + '.pub', 'utf8').trim();
const NUL = process.platform === 'win32' ? 'NUL' : '/dev/null';
const SSHOPTS = ['-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${NUL}`, '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];
const ssh = (ip, cmd, timeout = 120000) => exec('ssh', [...SSHOPTS, 'deploy@' + ip, cmd], { timeout, maxBuffer: 32 * 1024 * 1024 });
const scp = (ip, src, dst, timeout = 300000) => exec('scp', [...SSHOPTS, src, `deploy@${ip}:${dst}`], { timeout, maxBuffer: 32 * 1024 * 1024 });

// cloud-init real do repo, com a chave pública injetada.
const cloudInit = readFileSync('../chatwoot-deploy/cloud-init.yaml', 'utf8').replaceAll('__SUA_CHAVE_SSH_PUBLICA__', PUB);

async function main() {
  let id = null, ip = null;
  // 1) Cria a box
  log('criando CX33 (hel1, ubuntu-24.04)…');
  const cr = await H('servers', { method: 'POST', body: JSON.stringify({
    name: 'vertho-chatwoot-test', server_type: 'cx33', image: 'ubuntu-24.04', location: 'hel1',
    ssh_keys: [113820480], user_data: cloudInit, labels: { role: 'chatwoot-test', ephemeral: 'true' },
  }) });
  if (!cr.ok) throw new Error('create ' + cr.status + ' ' + JSON.stringify(cr.body).slice(0, 300));
  id = cr.body.server.id;
  for (let i = 0; i < 60; i++) { await sleep(3000); const s = await H('servers/' + id); const srv = s.body.server; ip = srv?.public_net?.ipv4?.ip; if (srv?.status === 'running' && ip) break; }
  log(`box id=${id} IP=${ip} · running. Esperando SSH (deploy) + cloud-init…`);

  // 2) Espera SSH como deploy (cloud-init cria o user)
  let sshOk = false;
  for (let i = 0; i < 60; i++) { await sleep(8000); try { await ssh(ip, 'echo ok', 12000); sshOk = true; break; } catch { /* ainda subindo */ } }
  if (!sshOk) throw new Error('SSH (deploy) não respondeu — cloud-init pode ter falhado. box=' + id);
  log('SSH ok. Aguardando cloud-init terminar…');
  await ssh(ip, 'cloud-init status --wait >/dev/null 2>&1; true', 360000);

  // 3) Valida o provisionamento
  log('== VALIDAÇÃO DO PROVISIONAMENTO ==');
  const docker = (await ssh(ip, 'docker --version && docker compose version | head -1', 20000)).stdout.trim();
  const ufw = (await ssh(ip, 'sudo ufw status | tr "\\n" " "', 20000)).stdout.trim();
  const sshd = (await ssh(ip, 'sudo sshd -T 2>/dev/null | grep -E "^permitrootlogin|^passwordauthentication"', 20000)).stdout.trim();
  console.log('  docker:', docker.replace(/\n/g, ' | '));
  console.log('  ufw   :', ufw);
  console.log('  sshd  :', sshd.replace(/\n/g, ' / '));

  // 4) Copia o repo (tar evita o espaço no path local)
  log('== DEPLOY DA STACK ==');
  await exec('tar', ['-czf', '/tmp/cw.tgz', '-C', '/c/GAS/Vertho App', 'chatwoot-deploy'], { timeout: 60000 });
  await scp(ip, '/tmp/cw.tgz', '/tmp/cw.tgz');
  await ssh(ip, 'sudo mkdir -p /opt/chatwoot && sudo chown deploy:deploy /opt/chatwoot && tar -xzf /tmp/cw.tgz -C /opt/chatwoot', 30000);

  // 5) .env de teste (segredos gerados no servidor; sem Caddy → sem DNS necessário)
  const envScript = `cd /opt/chatwoot/chatwoot-deploy && \
SKB=$(openssl rand -hex 64) && PG=$(openssl rand -hex 24) && RD=$(openssl rand -hex 24) && \
cp .env.example .env && \
sed -i "s|^SECRET_KEY_BASE=.*|SECRET_KEY_BASE=$SKB|" .env && \
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$PG|" .env && \
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$RD|" .env && \
sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:$RD@redis:6379|" .env && \
sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=http://${ip}|" .env && \
echo ".env gerado"`;
  await ssh(ip, envScript, 30000);

  // 6) Pull + db prepare + up (sem caddy — TLS exige DNS, fora do teste)
  log('pull das imagens (chatwoot ~1.5GB)…');
  console.log((await ssh(ip, 'cd /opt/chatwoot/chatwoot-deploy && docker compose pull postgres redis rails 2>&1 | tail -3', 600000)).stdout.trim());
  await ssh(ip, 'cd /opt/chatwoot/chatwoot-deploy && docker compose up -d postgres redis', 120000);
  await sleep(20000);
  log('db:chatwoot_prepare…');
  const prep = (await ssh(ip, 'cd /opt/chatwoot/chatwoot-deploy && docker compose run --rm rails bundle exec rails db:chatwoot_prepare 2>&1 | tail -5', 420000)).stdout.trim();
  console.log('  prepare:', prep.replace(/\n/g, ' | ').slice(-300));
  await ssh(ip, 'cd /opt/chatwoot/chatwoot-deploy && docker compose up -d rails sidekiq', 120000);

  // 7) Verifica o app respondendo
  log('aguardando o rails subir…');
  let httpOk = '';
  for (let i = 0; i < 12; i++) { await sleep(15000); try { httpOk = (await ssh(ip, 'curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo conn-fail', 20000)).stdout.trim(); if (/^(200|301|302|307)$/.test(httpOk)) break; } catch { httpOk = 'err'; } }
  const ps = (await ssh(ip, 'cd /opt/chatwoot/chatwoot-deploy && docker compose ps --format "{{.Service}}:{{.State}}" 2>/dev/null | tr "\\n" " "', 20000)).stdout.trim();

  console.log('\n========== RESULTADO ==========');
  console.log('box id      :', id, '| IP:', ip);
  console.log('containers  :', ps);
  console.log('rails HTTP  :', httpOk, (/^(200|301|302|307)$/.test(httpOk) ? '✅ app respondendo' : '⚠️ verificar'));
  console.log('==============================');
  console.log('Para ENCERRAR: node scripts/_chatwoot-kill.mjs ' + id);
  writeFileSync('/tmp/chatwoot-test-id.txt', String(id));
}
main().catch((e) => { console.error('ERRO:', e?.stack || e?.message || e); console.error('Se sobrou box, encerre: node scripts/_chatwoot-kill.mjs <id>'); process.exit(1); });
