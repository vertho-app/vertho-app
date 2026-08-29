/**
 * Captura do PDI (bruna.demo — relatorio 'individual' seedado). Lê o /pdi,
 * expande um bloco de competência para mostrar o plano de 30 dias.
 * Rodar:  npx tsx video-spike/tutorial/capture-pdi.mts
 */
import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const PUBLIC_DIR = path.join(APP, 'public', 'video-spike');
const OUT_DIR = path.join(HERE, 'out');
const BASE = 'http://acme-demo.localhost:3000';
const IMGDIR = path.join(PUBLIC_DIR, 'tutorial', 'pdi');
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

const frames: Record<string, { image: string; bbox: Box | null }> = {};
async function shot(page: Page, id: string, bbox: Box | null) {
  await page.evaluate(() => {
    if (document.getElementById('__hidedev')) return;
    const s = document.createElement('style'); s.id = '__hidedev';
    s.textContent = 'nextjs-portal,next-route-announcer{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  }).catch(() => {});
  const rel = `tutorial/pdi/${id}.png`;
  await page.screenshot({ path: path.join(PUBLIC_DIR, rel) });
  frames[id] = { image: rel, bbox };
  log(`✓ ${id.padEnd(14)} bbox=${bbox ? `${Math.round(bbox.x)},${Math.round(bbox.y)} ${Math.round(bbox.width)}×${Math.round(bbox.height)}` : '—'}`);
}
async function bboxAt(page: Page, re: RegExp) { return await page.getByText(re).first().boundingBox().catch(() => null); }
async function frameTarget(page: Page, loc: ReturnType<Page['getByText']>) {
  if (!(await loc.count().catch(() => 0))) return null;
  const b0 = await loc.boundingBox().catch(() => null);
  if (b0) { const sy = await page.evaluate(() => window.scrollY); await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(b0.y + sy - 200))); await page.waitForTimeout(400); }
  return await loc.boundingBox().catch(() => null);
}

async function main() {
  mkdirSync(IMGDIR, { recursive: true }); mkdirSync(OUT_DIR, { recursive: true });
  const cookies = await mint('bruna.demo@vertho.ai');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  await page.addInitScript(() => { // esconde o chrome do modo dev do Next
    const s = document.createElement('style');
    s.textContent = 'nextjs-portal,[data-nextjs-toast],#__next-build-watcher,[data-next-badge-root],[data-nextjs-dev-tools-button]{display:none!important}';
    document.documentElement.appendChild(s);
  });

  await page.goto(`${BASE}/dashboard/pdi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText(/Bruna Costa/i).first().waitFor({ timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));

  // topo: título + Baixar PDF
  await shot(page, 'pdi', await bboxAt(page, /Bruna Costa/i));
  await shot(page, 'baixar', await bboxAt(page, /Baixar PDF/i));

  // competências / níveis (RESUMO DE DESEMPENHO)
  const bComp = await frameTarget(page, page.getByText(/RESUMO DE DESEMPENHO/i).first());
  await shot(page, 'competencias', bComp);

  // 1º bloco de competência (idx 0) já vem ABERTO (useState(idx===0)) → só rolar até o plano
  const plano = page.getByText(/Senso de urgência genuíno|Plano de 30 dias/i).first();
  const bPlano = await frameTarget(page, plano);
  await shot(page, 'plano', bPlano);

  await browser.close();
  const out = path.join(OUT_DIR, 'pdi.frames.json');
  writeFileSync(out, JSON.stringify({ flow: 'pdi', viewport: { width: 1920, height: 1080 }, frames }, null, 2));
  log(`manifesto → ${path.relative(APP, out)} (${Object.keys(frames).length} frames)`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
