/**
 * E2E COMPLETO: provisiona box Hetzner → builda+roda o worker → dispara
 * gerar-video-modulo (eu-central-1) → worker renderiza/master/Bunny → vídeo final.
 * SEMPRE deleta a box no fim (try/finally + label e2e=true p/ sweep).
 * Rodar: npx tsx scripts/_hetzner-e2e.ts
 */
import './_env';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import pg from 'pg';
import { tasks } from '@trigger.dev/sdk';
import { normalizarRoteiro } from '../lib/video/roteiro-prompt';
import { sslSupabase } from './_pg-ssl.mjs';

const exec = promisify(execFile);
const log = (...a: any[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TOKEN = (() => { for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const i = l.indexOf('='); if (i < 0) continue; const k = l.slice(0, i).trim(); if (/hetzner/i.test(k) && !/render_backend/i.test(k)) { const v = l.slice(i + 1).trim().replace(/^"|"$/g, ''); if (v.length > 10) return v; } } return null; })();
if (!TOKEN) throw new Error('token Hetzner ausente');
const H = (p: string, opts: any = {}) => fetch('https://api.hetzner.cloud/v1/' + p, { ...opts, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }));

const KEY = os.homedir() + '/.ssh/id_ed25519';
const NUL = process.platform === 'win32' ? 'NUL' : '/dev/null';
const SSH = ['-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${NUL}`, '-o', 'ConnectTimeout=10', '-o', 'BatchMode=yes'];
const ssh = (ip: string, cmd: string, timeout = 60000) => exec('ssh', [...SSH, 'root@' + ip, cmd], { timeout, maxBuffer: 32 * 1024 * 1024 });
const scp = (ip: string, src: string, dst: string, timeout = 300000) => exec('scp', [...SSH, '-r', src, `root@${ip}:${dst}`], { timeout, maxBuffer: 32 * 1024 * 1024 });

const cloudInit = `#cloud-config
package_update: true
packages:
  - docker.io
runcmd:
  - systemctl enable --now docker
  - ufw allow OpenSSH
  - ufw --force enable
`;

const CELL = { modulo: 'bbcd7218-faef-4da9-9622-2464f4ab6741', empresa: '0d99fed1-1710-40e3-b32e-7a95c7d023fe', cargo: 'Gestão Escolar', disc: 'I' };
const roteiro: any = normalizarRoteiro({
  title: 'E2E Hetzner', theme: 'teste', deck_invariant: true, disc_sensitive_fields: ['narration'],
  scenes: [
    { id: 'a', type: 'avatar_intro', title: 'Vamos lá', subtitle: 'um teste real', narration: 'Vamos a um teste de ponta a ponta. O que muda quando o pipeline roda inteiro, sem depender do que caiu?', key_idea: 't', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 20 },
    { id: 'b', type: 'concept_reveal', title: 'Três sinais', bullets: ['voz clara', 'render Hetzner', 'sem outage'], icons: ['voz', 'processo', 'feito'], narration: 'Três sinais de que deu certo: a voz sai clara pela Vertex, o render roda no Hetzner, e nada depende do trigger que estava fora.', key_idea: 't', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 28 },
    { id: 'c', type: 'data_diagram', title: 'Onde roda cada parte', cells: [{ label: 'Orquestra', caption: 'trigger eu-central' }, { label: 'Narração', caption: 'Vertex' }, { label: 'Render', caption: 'Hetzner' }], narration: 'Cada parte no seu lugar: o trigger orquestra em eu-central, a narração vem da Vertex, e o render acontece no Hetzner.', key_idea: 't', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 26 },
    { id: 'd', type: 'avatar_outro', title: 'Pergunta', subtitle: 'e agora?', narration: 'Funcionou de ponta a ponta. O que você colocaria no próximo vídeo da sua equipe?', key_idea: 't', source_anchor: 'IDEIA_PRINCIPAL', estimated_words: 16 },
  ],
} as any);

async function main() {
  let id: number | null = null;
  let videoId: string | null = null;
  const sb = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: sslSupabase(), max: 3 });
  const envPath = os.tmpdir() + '/worker-e2e.env';
  try {
    // 0) registra o job (deck) ANTES, p/ dispatch
    const ins = await sb.query(`INSERT INTO videos_gerados (modulo_base_id,empresa_id,cargo,disc_dominante,status,etapa,roteiro,created_by) VALUES ($1,$2,$3,$4,'processing','roteiro',$5,'e2e:hetzner') RETURNING id`, [CELL.modulo, CELL.empresa, CELL.cargo, CELL.disc, roteiro]);
    videoId = ins.rows[0].id;
    log('videoId:', videoId);

    // 1) provisiona a box
    log('provisionando CCX33 (fsn1)…');
    const cr = await H('servers', { method: 'POST', body: JSON.stringify({ name: 'vertho-e2e-' + Math.floor(Date.now() / 1000), server_type: 'ccx33', image: 'ubuntu-22.04', location: 'fsn1', ssh_keys: [113820480], user_data: cloudInit, labels: { role: 'render-worker', e2e: 'true' } }) });
    if (!cr.ok) throw new Error('create ' + cr.status + ' ' + JSON.stringify(cr.body).slice(0, 200));
    id = cr.body.server.id;
    let ip: string | null = null;
    for (let i = 0; i < 60; i++) { await sleep(3000); const s = await H('servers/' + id); const srv = s.body.server; ip = srv?.public_net?.ipv4?.ip; if (srv?.status === 'running' && ip) break; }
    if (!ip) throw new Error('box não ficou running');
    log('box id=' + id + ' IP=' + ip + ' · esperando SSH+docker…');
    for (let i = 0; i < 40; i++) { await sleep(5000); try { await ssh(ip, 'docker --version', 12000); break; } catch { /* ainda não */ } }
    await ssh(ip, 'cloud-init status --wait >/dev/null 2>&1; true', 240000);
    log('docker pronto. copiando worker…');

    // 2) .env do worker + copia worker-hetzner
    writeFileSync(envPath, [
      `DATABASE_URL=${process.env.DATABASE_URL}`,
      `BUNNY_LIBRARY_ID=${process.env.BUNNY_LIBRARY_ID}`,
      `BUNNY_STREAM_API_KEY=${process.env.BUNNY_STREAM_API_KEY}`,
      `GEMINI_API_KEY=${process.env.GEMINI_API_KEY}`,
      `VIDEO_TTS_VOICE=${process.env.VIDEO_TTS_VOICE || 'Vindemiatrix'}`,
      'VIDEO_RENDER_SCALE=0.6667',
      'PERSONALIZE_LIMIT=1',
      'POLL_INTERVAL_MS=8000',
    ].join('\n') + '\n');
    await ssh(ip, 'mkdir -p /root/worker', 15000);
    await scp(ip, 'worker-hetzner/.', '/root/worker/', 600000);
    await scp(ip, envPath, '/root/worker/.env', 60000);

    // 3) build + run do worker
    log('docker build (npm install + chrome, ~8-12 min)…');
    await ssh(ip, 'cd /root/worker && docker build -t vw . 2>&1 | tail -3', 1200000);
    log('build ok. subindo worker…');
    await ssh(ip, 'docker rm -f vw 2>/dev/null; docker run -d --name vw --env-file /root/worker/.env vw', 60000);
    await sleep(4000);
    log('worker logs (início):', (await ssh(ip, 'docker logs vw 2>&1 | tail -4', 20000).catch(() => ({ stdout: '?' }))).stdout.trim());

    // 4) dispara o orquestrador em eu-central-1
    log('disparando gerar-video-modulo em eu-central-1…');
    const handle = await tasks.trigger('gerar-video-modulo', { videoId, roteiro }, { region: 'eu-central-1' } as any);
    log('run:', handle.id);

    // 5) monitora o deck até done (worker renderiza), com log de etapa
    let prev = '';
    for (let i = 0; i < 200; i++) { // ~27 min
      await sleep(8000);
      const { rows } = await sb.query('SELECT status,etapa,video_url,error FROM videos_gerados WHERE id=$1', [videoId]);
      const r = rows[0]; const key = `${r?.etapa}|${r?.status}`;
      if (key !== prev) { prev = key; log('  etapa=' + r?.etapa + ' status=' + r?.status + (r?.error ? ' ERRO: ' + String(r.error).slice(0, 150) : '')); }
      if (r?.status === 'done' && r?.video_url) { log('✅ DECK PRONTO → ' + r.video_url); break; }
      if (r?.status === 'error') { log('❌ erro no job: ' + String(r.error).slice(0, 200)); break; }
    }
    // 6) saudação (1 colaborador)
    const { rows: pers } = await sb.query("SELECT nome_usado,status,video_url FROM videos_personalizados WHERE cell_video_id=$1 AND status='done' LIMIT 1", [videoId]);
    if (pers[0]) log('✅ SAUDAÇÃO ("Olá, ' + pers[0].nome_usado + '") → ' + pers[0].video_url);
    else log('saudação ainda não concluída (pode levar +1-2 min após o deck)');
  } finally {
    if (id) { log('deletando box id=' + id + '…'); await H('servers/' + id, { method: 'DELETE' }).catch(() => {}); await sleep(3000); const l = await H('servers?label_selector=e2e=true'); log('boxes e2e restantes:', (l.body.servers || []).length ? '⚠️ ' + (l.body.servers || []).map((s: any) => s.id).join(',') : 'NENHUMA ✓'); }
    try { rmSync(envPath, { force: true }); } catch { /* */ }
    await sb.end().catch(() => {});
    log('FIM.');
  }
}
main().catch((e) => { console.error('ERRO:', e?.stack || e?.message || e); process.exit(1); });
