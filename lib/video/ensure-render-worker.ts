/**
 * Garante UMA box de render Hetzner viva para drenar a fila `render_queued`.
 *
 * Chamado pelo orquestrador logo após enfileirar um vídeo (geração por clique).
 * FAN-OUT por profundidade de fila: mantém ~1 box a cada RENDER_JOBS_PER_BOX
 * jobs na fila (render_queued + rendering), até MAX_RENDER_BOXES. Um clique só
 * (fila=1) → 1 box; um lote grande → várias boxes em paralelo (cada uma puxa
 * jobs distintos via FOR UPDATE SKIP LOCKED). Cada box é EFÊMERA: se autodestrói
 * quando a fila seca (worker.mjs selfDestruct), então não fica máquina ligada.
 * Sobre-provisão eventual (corrida entre cliques simultâneos) é auto-curada: a
 * box extra acha a fila vazia e morre no ócio.
 *
 * Sobe a partir de um SNAPSHOT (RENDER_SNAPSHOT_ID) com Chrome+node já baked →
 * boot ~2 min em vez de ~12 de docker build. cloud-init grava o .env e roda o
 * container `vw` já presente na imagem. Token Hetzner vai no user_data porque o
 * worker precisa dele pra se autodeletar.
 *
 * Envs necessárias (no ambiente do orquestrador / trigger.dev):
 *   HCLOUD_TOKEN, RENDER_SNAPSHOT_ID, DATABASE_URL, BUNNY_LIBRARY_ID,
 *   BUNNY_STREAM_API_KEY, GEMINI_API_KEY (opcional → liga personalização).
 *   Opcionais: RENDER_SERVER_TYPE (cx33 — shared Intel, ~€0.016/hr, NÃO usa cota
 *   dedicada → fan-out funciona sem aumento de limite. cx43=8c mais rápido por ~2×
 *   o custo; ccx33=dedicado, exige cota), RENDER_LOCATION (nbg1 — CX só há em
 *   nbg1/hel1, NÃO em fsn1),
 *   RENDER_SSH_KEY_ID, RENDER_IDLE_SHUTDOWN_MS (300000), VIDEO_RENDER_SCALE (1),
 *   MAX_RENDER_BOXES (4), RENDER_JOBS_PER_BOX (3).
 */
import { SUPA, KEY } from './render-helpers';

const HCLOUD = 'https://api.hetzner.cloud/v1';

export type EnsureResult = { provisioned: boolean; created?: number[]; reason?: string };

/** Profundidade da fila de render (jobs ainda não finalizados). */
async function queueDepth(): Promise<number> {
  try {
    const r = await fetch(`${SUPA}/rest/v1/videos_gerados?select=id&status=in.(render_queued,rendering)`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact', Range: '0-0' },
    });
    const cr = r.headers.get('content-range'); // ex.: "0-0/13"
    const total = cr && cr.includes('/') ? parseInt(cr.split('/')[1], 10) : NaN;
    return Number.isFinite(total) ? total : 1;
  } catch { return 1; }
}

export async function ensureRenderWorker(): Promise<EnsureResult> {
  const token = process.env.HCLOUD_TOKEN;
  const snapshot = process.env.RENDER_SNAPSHOT_ID;
  if (!token) return { provisioned: false, reason: 'sem HCLOUD_TOKEN' };
  if (!snapshot) return { provisioned: false, reason: 'sem RENDER_SNAPSHOT_ID' };
  if (!process.env.DATABASE_URL) return { provisioned: false, reason: 'sem DATABASE_URL' };

  const h = (p: string, opts: any = {}) =>
    fetch(HCLOUD + p, { ...opts, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });

  const MAX = parseInt(process.env.MAX_RENDER_BOXES || '4', 10);
  const JPB = Math.max(1, parseInt(process.env.RENDER_JOBS_PER_BOX || '3', 10));

  // Fan-out: nº de boxes desejado = ceil(fila / jobs_por_box), limitado a MAX.
  const list = await h('/servers?label_selector=role%3Drender-worker').then((r) => r.json()).catch(() => null);
  const alive = (list?.servers || []).filter((s: any) => ['initializing', 'starting', 'running'].includes(s.status));
  const depth = await queueDepth();
  const desired = Math.min(MAX, Math.max(1, Math.ceil(depth / JPB)));
  const deficit = desired - alive.length;
  if (deficit <= 0) return { provisioned: false, reason: `${alive.length} box(es) p/ fila ${depth} (desejado ${desired})` };

  const env = [
    `DATABASE_URL=${process.env.DATABASE_URL}`,
    `BUNNY_LIBRARY_ID=${process.env.BUNNY_LIBRARY_ID || ''}`,
    `BUNNY_STREAM_API_KEY=${process.env.BUNNY_STREAM_API_KEY || ''}`,
    `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}`,
    `VIDEO_TTS_VOICE=${process.env.VIDEO_TTS_VOICE || 'Vindemiatrix'}`,
    `VIDEO_RENDER_SCALE=${process.env.VIDEO_RENDER_SCALE || '1'}`,
    `HCLOUD_TOKEN=${token}`,
    `EPHEMERAL=true`,
    `IDLE_SHUTDOWN_MS=${process.env.RENDER_IDLE_SHUTDOWN_MS || '300000'}`,
    `POLL_INTERVAL_MS=8000`,
  ];

  // cloud-init: grava /root/worker/.env e sobe o container `vw` (já na snapshot).
  const userData = [
    '#cloud-config',
    'write_files:',
    "  - path: /root/worker/.env",
    "    permissions: '0600'",
    '    content: |',
    ...env.map((l) => '      ' + l),
    'runcmd:',
    '  - [ bash, -lc, "docker rm -f vw 2>/dev/null; docker run -d --name vw --restart=no --env-file /root/worker/.env vw" ]',
    '',
  ].join('\n');

  const mkBody = (n: number): any => {
    const b: any = {
      name: `vertho-render-${Date.now()}-${n}`,
      server_type: process.env.RENDER_SERVER_TYPE || 'cx33',
      image: Number(snapshot),
      location: process.env.RENDER_LOCATION || 'nbg1',
      user_data: userData,
      labels: { role: 'render-worker', ephemeral: 'true' },
    };
    if (process.env.RENDER_SSH_KEY_ID) b.ssh_keys = [Number(process.env.RENDER_SSH_KEY_ID)];
    return b;
  };

  const created: number[] = [];
  let lastErr: string | undefined;
  for (let n = 0; n < deficit; n++) {
    const cr = await h('/servers', { method: 'POST', body: JSON.stringify(mkBody(n)) });
    if (!cr.ok) { lastErr = `create ${cr.status}: ${(await cr.text().catch(() => '')).slice(0, 150)}`; break; }
    const j = await cr.json();
    if (j?.server?.id) created.push(j.server.id);
  }
  if (!created.length) return { provisioned: false, reason: lastErr || 'nenhuma box criada' };
  return { provisioned: true, created, reason: `fila ${depth}, +${created.length} box(es) (alvo ${desired})${lastErr ? ' · parcial: ' + lastErr : ''}` };
}
