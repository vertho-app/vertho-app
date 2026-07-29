/**
 * Captura da semana de MISSÃO / aplicação (semanas 4, 8 e 12). Dirige o fluxo real:
 * grade da temporada → card da missão → compromisso preenchido → "Aceito a missão"
 * → "Você conseguiu executar?" → chat de relato.
 *
 * Persona `paulo.demo` (não bruna): destravar a semana 4 exige concluir as semanas
 * 1-3, e a bruna é o estúdio dos flows jornada/pdi — mexer no progresso dela
 * mudaria o que aqueles capturam.
 *
 * ESTADO: a captura prepara o progresso (1-3 concluídas, 4 limpa) e RESTAURA tudo no
 * fim, inclusive se falhar no meio. O acme-demo é resetado por cron às 04h de todo
 * jeito, mas deixar lixo aqui quebraria a próxima captura, não o tenant.
 *
 * Rodar:  npx tsx video-spike/tutorial/capture-aplicacao.mts [porta]
 */
import { chromium, type Page } from 'playwright';
import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const PUBLIC_DIR = path.join(APP, 'public', 'video-spike');
const OUT_DIR = path.join(HERE, 'out');
const PORT = process.argv[2] || '3000';
const BASE = `http://acme-demo.localhost:${PORT}`;
const IMGDIR = path.join(PUBLIC_DIR, 'tutorial', 'aplicacao');
const PERSONA = 'paulo.demo@vertho.ai';
const SEMANA = 4;
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
type Box = { x: number; y: number; width: number; height: number };

const env: Record<string, string> = {};
for (const line of readFileSync(path.join(APP, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

async function mint(email: string) {
  const U = env.NEXT_PUBLIC_SUPABASE_URL, S = env.SUPABASE_SERVICE_ROLE_KEY, A = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const admin = { apikey: S, Authorization: `Bearer ${S}`, 'Content-Type': 'application/json' };
  await fetch(`${U}/auth/v1/admin/users`, { method: 'POST', headers: admin, body: JSON.stringify({ email, email_confirm: true }) });
  const link = await (await fetch(`${U}/auth/v1/admin/generate_link`, { method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email }) })).json();
  const hashed = link.hashed_token || link.properties?.hashed_token;
  const session = await (await fetch(`${U}/auth/v1/verify`, { method: 'POST', headers: { apikey: A, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hashed }) })).json();
  const ref = U.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)![1];
  const payload = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const chunks: string[] = []; for (let i = 0; i < payload.length; i += 3180) chunks.push(payload.slice(i, i + 3180));
  const names = chunks.length === 1 ? [`sb-${ref}-auth-token`] : chunks.map((_, i) => `sb-${ref}-auth-token.${i}`);
  return names.map((name, i) => ({ name, value: chunks[i], domain: 'acme-demo.localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const }));
}

// ⚠️ DÍVIDA HERDADA, não escolha: com `rejectUnauthorized: true` a conexão morre em
// "self-signed certificate in certificate chain" — a cadeia do Supabase aqui não
// fecha por CA pública. Os 23 outros scripts do repo fazem o mesmo (vem do
// apply-migration). A correção certa é distribuir o CA do Supabase e apontar
// `ssl.ca`/NODE_EXTRA_CA_CERTS, de uma vez para todos — não vale fazer só aqui e
// dar a impressão de que o problema está resolvido.
const db = () => new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

/** A trilha é resolvida por e-mail: o reset diário do acme-demo troca os ids. */
async function resolverTrilha(): Promise<string> {
  const c = db(); await c.connect();
  const { rows } = await c.query(
    `select t.id from trilhas t join colaboradores c on c.id = t.colaborador_id
      where c.email = $1 order by t.criado_em desc limit 1`, [PERSONA]);
  await c.end();
  if (!rows[0]) throw new Error(`sem trilha para ${PERSONA} — o reset do acme-demo rodou?`);
  return rows[0].id;
}

type Snapshot = { semana: number; status: string; feedback: any }[];

/** Guarda o progresso para devolver exatamente como estava. */
async function snapshot(trilha: string): Promise<Snapshot> {
  const c = db(); await c.connect();
  const { rows } = await c.query(
    `select semana, status, feedback from temporada_semana_progresso
      where trilha_id = $1 and semana <= $2 order by semana`, [trilha, SEMANA]);
  await c.end();
  return rows;
}

async function restaurar(trilha: string, snap: Snapshot) {
  const c = db(); await c.connect();
  for (const r of snap) {
    await c.query(`update temporada_semana_progresso set status=$1, feedback=$2 where trilha_id=$3 and semana=$4`,
      [r.status, r.feedback, trilha, r.semana]);
  }
  await c.end();
  log('estado do paulo.demo restaurado');
}

/** Semana 4 só abre com a anterior concluída (week-gating). */
async function destravar(trilha: string) {
  const c = db(); await c.connect();
  await c.query(`update temporada_semana_progresso set status='concluido'
                  where trilha_id=$1 and semana < $2`, [trilha, SEMANA]);
  await c.query(`update temporada_semana_progresso set status='em_andamento', feedback='{}'::jsonb
                  where trilha_id=$1 and semana=$2`, [trilha, SEMANA]);
  await c.end();
}

/** Estado B da tela: modo escolhido + compromisso salvo. */
async function aceitarMissao(trilha: string, compromisso: string) {
  const c = db(); await c.connect();
  await c.query(
    `update temporada_semana_progresso
        set feedback = coalesce(feedback,'{}'::jsonb) || jsonb_build_object('modo','pratica','compromisso',$3::text)
      where trilha_id=$1 and semana=$2`, [trilha, SEMANA, compromisso]);
  await c.end();
}

const frames: Record<string, { image: string; bbox: Box | null }> = {};
async function hideDev(page: Page) {
  await page.evaluate(() => {
    if (document.getElementById('__hidedev')) return;
    const s = document.createElement('style'); s.id = '__hidedev';
    s.textContent = 'nextjs-portal,next-route-announcer{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  }).catch(() => {});
}
async function shot(page: Page, id: string, bbox: Box | null) {
  await hideDev(page);
  const rel = `tutorial/aplicacao/${id}.png`;
  await page.screenshot({ path: path.join(PUBLIC_DIR, rel) });
  frames[id] = { image: rel, bbox };
  log(`✓ ${id.padEnd(14)} bbox=${bbox ? `${Math.round(bbox.x)},${Math.round(bbox.y)} ${Math.round(bbox.width)}×${Math.round(bbox.height)}` : '—'}`);
}
async function bbox(page: Page, re: RegExp) {
  return await page.getByText(re).first().boundingBox().catch(() => null);
}

/**
 * Dispensa o modal de vídeo da Jornada (`components/first-view-video.tsx`), que
 * auto-abre 1× por `localStorage` — e o contexto do Playwright nasce sempre limpo,
 * então ele aparece SEMPRE aqui. Na primeira execução ele cobriu a grade inteira e
 * o bbox capturou um botão do player.
 */
async function fecharModalVideo(page: Page) {
  const fechar = page.getByRole('button', { name: /fechar|close/i }).first();
  if (await fechar.count().catch(() => 0)) {
    await fechar.click().catch(() => {});
    await page.waitForTimeout(500);
    return;
  }
  // Sem nome acessível: o X do cabeçalho do modal.
  const x = page.locator('[role="dialog"] button, .fixed button').first();
  if (await x.count().catch(() => 0)) { await x.click().catch(() => {}); await page.waitForTimeout(500); }
}
/** Enquadra o alvo a ~220px do topo — senão o Ken Burns corta o callout. */
async function frameTarget(page: Page, re: RegExp) {
  const loc = page.getByText(re).first();
  if (!(await loc.count().catch(() => 0))) return null;
  const b0 = await loc.boundingBox().catch(() => null);
  if (b0) {
    const sy = await page.evaluate(() => window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(b0.y + sy - 220)));
    await page.waitForTimeout(400);
  }
  return await loc.boundingBox().catch(() => null);
}

const COMPROMISSO = 'Na reunião de quarta com a equipe da escola, quando for apresentar o plano do mês.';

async function main() {
  mkdirSync(IMGDIR, { recursive: true }); mkdirSync(OUT_DIR, { recursive: true });
  const trilha = await resolverTrilha();
  log(`trilha ${trilha} · ${BASE}`);
  const snap = await snapshot(trilha);

  const browser = await chromium.launch({ headless: true });
  try {
    await destravar(trilha);
    const cookies = await mint(PERSONA);
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    await ctx.addCookies(cookies);
    const page = await ctx.newPage();
    ctx.on('page', (p) => { if (p !== page) p.close().catch(() => {}); });
    await page.addInitScript(() => {
      const s = document.createElement('style');
      s.textContent = 'nextjs-portal,[data-nextjs-toast],#__next-build-watcher,[data-next-badge-root],[data-nextjs-dev-tools-button]{display:none!important}';
      document.documentElement.appendChild(s);
    });
    const settle = () => page.waitForTimeout(900);
    const abrirSemana = async () => {
      await page.goto(`${BASE}/dashboard/temporada/semana/${SEMANA}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.getByText(/Missão da Semana/i).first().waitFor({ timeout: 20000 });
      await settle();
    };

    // 1) Grade da temporada — a semana de aplicação tem ícone/cor próprios.
    await page.goto(`${BASE}/dashboard/temporada`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await settle();
    await fecharModalVideo(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    // O card da semana de aplicação na grade: é o único rotulado "Prática".
    const cardPratica = page.getByRole('button').filter({ hasText: /Prática/i }).first();
    await shot(page, 'temporada', await cardPratica.boundingBox().catch(() => null));

    // 2) Estado A — card da missão (sem modo escolhido ainda).
    await abrirSemana();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'missao', await frameTarget(page, /Missão da Semana/i));

    // 3) Compromisso preenchido (digitado de verdade, para a tela ficar real).
    const campo = page.locator('textarea').first();
    await campo.click().catch(() => {});
    await campo.fill(COMPROMISSO).catch(() => {});
    await page.waitForTimeout(400);
    await shot(page, 'compromisso', await campo.boundingBox().catch(() => null));

    // 4) O botão de aceitar, já habilitado pelo texto acima.
    await shot(page, 'aceitar', await bbox(page, /Aceito a missão/i));

    // 5) Estado B — compromisso salvo + "conseguiu executar?" com Sim/Não.
    await aceitarMissao(trilha, COMPROMISSO);
    await abrirSemana();
    await shot(page, 'executou', await frameTarget(page, /Você conseguiu executar a missão/i));

    // 6) O relato. No estado B o bloco de Evidências NÃO está na tela: ele só
    // aparece depois do "Sim", que inicia a conversa (chamada de IA real). Então
    // clicamos de verdade — é o único jeito de capturar o que a pessoa vê.
    // Se a IA demorar ou falhar, o beat cai no frame anterior em vez de derrubar
    // a captura inteira: um vídeo com um frame repetido é melhor que nenhum vídeo.
    await page.getByRole('button', { name: /^Sim$/i }).first().click().catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    // No modo prática o card muda de rótulo: "Relato da Missão", não
    // "Feedback (Evidências)" (i18n `evidence.missionReport` × `evidence.feedback`).
    const bRelato = await frameTarget(page, /Relato da Missão/i);
    if (bRelato) {
      await shot(page, 'relato', bRelato);
    } else {
      log('⚠ chat de relato não abriu — beat "relato" reusa o frame "executou"');
      frames.relato = frames.executou;
    }
  } finally {
    await browser.close();
    await restaurar(trilha, snap);
  }

  const out = path.join(OUT_DIR, 'aplicacao.frames.json');
  writeFileSync(out, JSON.stringify({ flow: 'aplicacao', viewport: { width: 1920, height: 1080 }, frames }, null, 2));
  log(`manifesto → ${path.relative(APP, out)} (${Object.keys(frames).length} frames)`);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
