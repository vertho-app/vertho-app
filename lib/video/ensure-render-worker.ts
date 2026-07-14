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
 *   Opcionais: RENDER_SERVER_TYPE (tipo PRIMÁRIO, default cx33 — shared Intel, barato,
 *   NÃO usa cota dedicada), RENDER_FALLBACK_TYPE (default cx43 — 16GB, +RAM/rápido, p/
 *   quando o primário não tem estoque), RENDER_LOCATIONS (lista CSV que o LADDER varre,
 *   default 'nbg1,hel1,fsn1'), RENDER_LOCATION (location preferida — tentada 1º).
 *   FALLBACK: em resource_unavailable (412), varre primário × todas as locations, depois
 *   fallback × todas — só falha se NENHUM (tipo × location) tiver capacidade.
 *   RENDER_CONCURRENCY (auto por RAM: cx33→2, cx43→4), RENDER_SSH_KEY_ID,
 *   RENDER_IDLE_SHUTDOWN_MS (300000), VIDEO_RENDER_SCALE (0.6667), MAX_RENDER_BOXES (4),
 *   RENDER_JOBS_PER_BOX (3).
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

  // ── LADDER de fallback (tipo × location) ──────────────────────────────────
  // resource_unavailable (412) é comum no CX shared: um tipo/location fica sem
  // estoque por horas. Em vez de desistir, tenta o PRIMÁRIO (cx33, barato) em TODAS
  // as locations e, esgotado, o FALLBACK (cx43, +RAM) em todas. Só falha se nenhum
  // (tipo × location) tiver capacidade.
  const primaryType = process.env.RENDER_SERVER_TYPE || 'cx33';
  const fallbackType = process.env.RENDER_FALLBACK_TYPE || 'cx43';
  const allLocs = (process.env.RENDER_LOCATIONS || 'nbg1,hel1,fsn1').split(',').map((s) => s.trim()).filter(Boolean);
  const primaryLoc = process.env.RENDER_LOCATION;
  const locs = primaryLoc ? [primaryLoc, ...allLocs.filter((l) => l !== primaryLoc)] : allLocs;
  const types = [...new Set([primaryType, fallbackType])];
  const ladder: Array<{ type: string; loc: string }> = types.flatMap((t) => locs.map((loc) => ({ type: t, loc })));

  // Concorrência por RAM: cx33/cpx31/cax31 (~8GB) OOMam com 4 em 720p → 2; cx43 (16GB) → 4.
  const SMALL_RAM = new Set(['cx33', 'cpx31', 'cax31']);
  const concFor = (t: string) => process.env.RENDER_CONCURRENCY || (SMALL_RAM.has(t) ? '2' : '4');

  const buildEnv = (conc: string) => [
    `DATABASE_URL=${process.env.DATABASE_URL}`,
    `BUNNY_LIBRARY_ID=${process.env.BUNNY_LIBRARY_ID || ''}`,
    `BUNNY_STREAM_API_KEY=${process.env.BUNNY_STREAM_API_KEY || ''}`,
    `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}`,
    // Saudação nominal exige SUPABASE_URL + SERVICE_ROLE_KEY (personalizar.mjs).
    `SUPABASE_URL=${process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''}`,
    `SUPABASE_SERVICE_ROLE_KEY=${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
    `VIDEO_TTS_VOICE=${process.env.VIDEO_TTS_VOICE || 'Vindemiatrix'}`,
    // 720p por padrão: 1080p em cx33/8GB com vídeos longos estourava RAM e travava.
    `VIDEO_RENDER_SCALE=${process.env.VIDEO_RENDER_SCALE || '0.6667'}`,
    `RENDER_CONCURRENCY=${conc}`,
    `MAX_RENDER_MS=${process.env.MAX_RENDER_MS || '2400000'}`,
    `HCLOUD_TOKEN=${token}`,
    `EPHEMERAL=true`,
    `IDLE_SHUTDOWN_MS=${process.env.RENDER_IDLE_SHUTDOWN_MS || '300000'}`,
    `POLL_INTERVAL_MS=8000`,
  ];
  // cloud-init: grava /root/worker/.env e sobe o container `vw` (já na snapshot).
  const userDataFor = (conc: string) => [
    '#cloud-config',
    'write_files:',
    "  - path: /root/worker/.env",
    "    permissions: '0600'",
    '    content: |',
    ...buildEnv(conc).map((l) => '      ' + l),
    'runcmd:',
    '  - [ bash, -lc, "docker rm -f vw 2>/dev/null; docker run -d --name vw --restart=no --env-file /root/worker/.env vw" ]',
    '',
  ].join('\n');

  const mkBody = (type: string, loc: string, n: number): any => {
    // Snapshot foi buildado em cx33 (disco menor) → criar cx43 a partir dele funciona
    // (disk do server ≥ disk do snapshot).
    const b: any = {
      name: `vertho-render-${Date.now()}-${n}`,
      server_type: type,
      image: Number(snapshot),
      location: loc,
      user_data: userDataFor(concFor(type)),
      labels: { role: 'render-worker', ephemeral: 'true' },
    };
    if (process.env.RENDER_SSH_KEY_ID) b.ssh_keys = [Number(process.env.RENDER_SSH_KEY_ID)];
    return b;
  };

  const created: number[] = [];
  const errors: string[] = [];
  let preferred: { type: string; loc: string } | null = null; // primeiro que deu certo → tenta antes nas próximas
  for (let n = 0; n < deficit; n++) {
    const order = preferred
      ? [preferred, ...ladder.filter((x) => !(x.type === preferred!.type && x.loc === preferred!.loc))]
      : ladder;
    let boxOk = false;
    for (const attempt of order) {
      const cr = await h('/servers', { method: 'POST', body: JSON.stringify(mkBody(attempt.type, attempt.loc, n)) });
      if (cr.ok) {
        const j = await cr.json();
        if (j?.server?.id) { created.push(j.server.id); preferred = attempt; boxOk = true; break; }
      } else {
        errors.push(`${attempt.type}@${attempt.loc}: ${cr.status} ${(await cr.text().catch(() => '')).slice(0, 90)}`);
        // resource_unavailable (ou qualquer falha) → tenta o próximo (tipo × location).
      }
    }
    if (!boxOk) break; // ladder inteira sem capacidade → para (a fila fica p/ próxima tentativa)
  }
  if (!created.length) return { provisioned: false, reason: `ladder esgotada: ${errors.slice(-4).join(' | ')}` };
  return { provisioned: true, created, reason: `+${created.length} box(es) via ${preferred?.type}@${preferred?.loc} (fila ${depth}, alvo ${desired})${errors.length ? ' · tentativas: ' + errors.length : ''}` };
}
