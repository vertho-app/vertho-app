/**
 * Captura de telas roteirizada (Playwright) para os vídeos-tutorial.
 *
 * Para cada STEP do storyboard: minta a sessão da persona, navega, aguarda,
 * tira um screenshot 2× (3840×2160) e mede a bounding-box do elemento a
 * destacar (em px CSS = coordenadas do vídeo 1920×1080). Grava o manifesto
 * `out/<flow>.frames.json` consumido pelo build.
 *
 * Rodar (dev server no ar em acme-demo.localhost:3000):
 *   npx tsx video-spike/tutorial/capture.mts disc
 */
import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOWS, type Flow, type Highlight } from './storyboard';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(HERE, '../..'); // nextjs-app/
const PUBLIC_DIR = path.join(APP_ROOT, 'public', 'video-spike'); // publicDir do Remotion
const OUT_DIR = path.join(HERE, 'out');

const BASE = process.env.TUTORIAL_BASE || 'http://acme-demo.localhost:3000';
const VIEWPORT = { width: 1920, height: 1080 };
const SETTLE_MS = 1100;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

// .env.local → process.env-lite
const env: Record<string, string> = {};
for (const line of readFileSync(path.join(APP_ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}

/** Minta a sessão Supabase da persona e devolve os cookies @supabase/ssr. */
async function mintCookies(email: string) {
  const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
  const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!URL_BASE || !SRK || !ANON) throw new Error('env supabase faltando em .env.local');
  const admin = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };
  await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST', headers: admin, body: JSON.stringify({ email, email_confirm: true }),
  });
  const linkRes = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email }),
  });
  const link = await linkRes.json();
  const hashed = link.hashed_token || link.properties?.hashed_token;
  if (!hashed) throw new Error(`generate_link falhou (${linkRes.status})`);
  const verifyRes = await fetch(`${URL_BASE}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
  });
  const session = await verifyRes.json();
  if (!session.access_token) throw new Error(`verify falhou (${verifyRes.status})`);
  const ref = URL_BASE.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)![1];
  const payload = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const chunks: string[] = [];
  for (let i = 0; i < payload.length; i += 3180) chunks.push(payload.slice(i, i + 3180));
  const domain = new URL(BASE).hostname;
  const names = chunks.length === 1
    ? [`sb-${ref}-auth-token`]
    : chunks.map((_, i) => `sb-${ref}-auth-token.${i}`);
  return names.map((name, i) => ({
    name, value: chunks[i], domain, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const,
  }));
}

type Box = { x: number; y: number; width: number; height: number };

const HEADROOM = 220; // px CSS de respiro acima do alvo quando enquadramos por scroll

/**
 * Resolve o alvo do highlight, enquadra a seção (rola o alvo p/ ~HEADROOM do topo
 * quando scrollIntoView) e devolve a bbox final (em px CSS = coords do vídeo).
 * O scroll aqui persiste para o screenshot subsequente.
 */
async function resolveBbox(page: Page, hl?: Highlight): Promise<Box | null> {
  if (!hl) return null;
  let loc;
  if (hl.testid) loc = page.locator(`[data-testid="${hl.testid}"]`);
  else if (hl.role) loc = page.getByRole(hl.role.role as never, hl.role.name ? { name: hl.role.name } : undefined);
  else if (hl.text) loc = page.getByText(new RegExp(hl.text, 'i'));
  else if (hl.css) loc = page.locator(hl.css);
  else return null;

  const n = await loc.count().catch(() => 0);
  if (!n) return null;

  // Escolhe o maior elemento visível que casa (mede na posição atual).
  let bestIdx = -1;
  let bestArea = 0;
  for (let i = 0; i < Math.min(n, 40); i++) {
    const el = loc.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.width < 8 || box.height < 8) continue;
    const area = box.width * box.height;
    if (area > bestArea) { bestArea = area; bestIdx = i; }
  }
  if (bestIdx < 0) return null;
  const el = loc.nth(bestIdx);

  // Enquadra: leva o alvo a ~HEADROOM do topo (seção com conteúdo abaixo à vista).
  if (hl.scrollIntoView) {
    const box0 = await el.boundingBox().catch(() => null);
    if (box0) {
      const scrollY = await page.evaluate(() => window.scrollY);
      const absTop = box0.y + scrollY;
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(absTop - HEADROOM)));
      await page.waitForTimeout(400);
    }
  }
  return await el.boundingBox().catch(() => null);
}

async function captureFlow(flow: Flow) {
  const outImgDir = path.join(PUBLIC_DIR, 'tutorial', flow.id);
  mkdirSync(outImgDir, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const cookies = await mintCookies(flow.persona);
  log(`sessão mintada p/ ${flow.persona} (${cookies.length} cookie(s))`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  let authed = false;

  const frames: Array<{ id: string; image: string; bbox: Box | null; label: string | null }> = [];

  for (let idx = 0; idx < flow.steps.length; idx++) {
    const step = flow.steps[idx];
    if (step.auth && !authed) { await context.addCookies(cookies); authed = true; }

    await page.goto(BASE + step.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    if (step.scrollY) await page.evaluate((y) => window.scrollTo(0, y), step.scrollY);
    await page.waitForTimeout(SETTLE_MS);

    const landed = new URL(page.url()).pathname;
    if (step.auth && landed.startsWith('/login')) {
      log(`⚠️  etapa "${step.id}" caiu no /login — sessão inválida? (esperava ${step.url})`);
    }

    const bbox = await resolveBbox(page, step.highlight);
    const rel = `tutorial/${flow.id}/${String(idx + 1).padStart(2, '0')}-${step.id}.png`;
    await page.screenshot({ path: path.join(PUBLIC_DIR, rel) });
    frames.push({ id: step.id, image: rel, bbox, label: step.highlight?.label ?? null });
    log(`✓ ${step.id.padEnd(14)} ${landed.padEnd(42)} bbox=${bbox ? `${Math.round(bbox.x)},${Math.round(bbox.y)} ${Math.round(bbox.width)}×${Math.round(bbox.height)}` : '—'}`);
  }

  await browser.close();

  const manifest = { flow: flow.id, viewport: VIEWPORT, persona: flow.persona, frames };
  const outPath = path.join(OUT_DIR, `${flow.id}.frames.json`);
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  log(`manifesto → ${path.relative(APP_ROOT, outPath)}`);
}

async function main() {
  const flowId = process.argv[2] || 'disc';
  const flow = FLOWS[flowId];
  if (!flow) throw new Error(`flow desconhecido: ${flowId} (disponíveis: ${Object.keys(FLOWS).join(', ')})`);
  log(`captura do flow "${flow.id}" · base ${BASE} · ${flow.steps.length} etapas`);
  await captureFlow(flow);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
