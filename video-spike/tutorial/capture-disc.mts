/**
 * Captura dedicada do fluxo do Mapeamento (DISC), natural-only. Dirige o SPA do
 * /mapeamento (onboarding → intro → ranking → pares → aprendizagem) SEM salvar
 * (não clica "Ver meu perfil"), e o /perfil-comportamental para o resultado.
 *
 * Rodar (dev no ar em acme-demo.localhost:3000):
 *   npx tsx video-spike/tutorial/capture-disc.mts
 */
import { chromium, type Page } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const PUBLIC_DIR = path.join(APP, 'public', 'video-spike');
const OUT_DIR = path.join(HERE, 'out');
const BASE = process.env.TUTORIAL_BASE || 'http://acme-demo.localhost:3000';
const IMGDIR = path.join(PUBLIC_DIR, 'tutorial', 'disc');

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
  const domain = new URL(BASE).hostname;
  const names = chunks.length === 1 ? [`sb-${ref}-auth-token`] : chunks.map((_, i) => `sb-${ref}-auth-token.${i}`);
  return names.map((name, i) => ({ name, value: chunks[i], domain, path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const }));
}

const frames: Record<string, { image: string; bbox: Box | null }> = {};

async function shot(page: Page, id: string, bbox: Box | null = null) {
  await page.evaluate(() => {
    if (document.getElementById('__hidedev')) return;
    const s = document.createElement('style'); s.id = '__hidedev';
    s.textContent = 'nextjs-portal,next-route-announcer{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  }).catch(() => {});
  const rel = `tutorial/disc/${id}.png`;
  await page.screenshot({ path: path.join(PUBLIC_DIR, `${rel}`) });
  frames[id] = { image: rel, bbox };
  log(`✓ ${id.padEnd(18)} bbox=${bbox ? `${Math.round(bbox.x)},${Math.round(bbox.y)} ${Math.round(bbox.width)}×${Math.round(bbox.height)}` : '—'}`);
}

/** Rola o alvo p/ ~220px do topo e devolve a bbox (coords do vídeo 1920×1080). */
async function frameTarget(page: Page, re: RegExp): Promise<Box | null> {
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

async function main() {
  mkdirSync(IMGDIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  const cookies = await mint('ana.demo@vertho.ai');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const settle = () => page.waitForTimeout(700);

  // ── Onboarding ──────────────────────────────────────────────────────────
  await page.goto(`${BASE}/dashboard/perfil-comportamental/mapeamento`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /come[çc]ar mapeamento/i }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'onboarding-top');
  const bCards = await frameTarget(page, /Como funcionam as perguntas/i);
  await shot(page, 'onboarding-cards', bCards);

  // ── Abertura do bloco natural ───────────────────────────────────────────
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('button', { name: /come[çc]ar mapeamento/i }).click();
  await page.getByText(/pense no seu jeito mais espont/i).waitFor({ timeout: 15000 });
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'intro');

  // ── Ranking (grupo 1) ───────────────────────────────────────────────────
  await page.getByRole('button', { name: /^come[çc]ar$/i }).click();
  await page.getByRole('button', { name: 'AVANÇAR' }).waitFor({ timeout: 15000 });
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'rank');

  // avança os 8 grupos até os PARES
  for (let i = 0; i < 12; i++) {
    if (await page.getByText(/toque na frase|OU/i).count().catch(() => 0)) break;
    const av = page.getByRole('button', { name: 'AVANÇAR' });
    if (!(await av.count().catch(() => 0))) break;
    await av.click();
    await page.waitForTimeout(220);
  }

  // ── Pares (par 1) ───────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'AVANÇAR' }).waitFor({ timeout: 15000 });
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'pairs');

  // responde os 6 pares até APRENDIZAGEM (seleciona a 1ª opção + avança)
  for (let i = 0; i < 8; i++) {
    if (await page.getByText(/Como você aprende melhor/i).count().catch(() => 0)) break;
    const opt = page.locator('button.border-2').first();
    if (await opt.count().catch(() => 0)) { await opt.click(); await page.waitForTimeout(150); }
    const av = page.getByRole('button', { name: 'AVANÇAR' });
    if (await av.count().catch(() => 0)) { await av.click(); await page.waitForTimeout(250); }
  }

  // ── Preferências de aprendizagem ────────────────────────────────────────
  await page.getByText(/Como você aprende melhor/i).waitFor({ timeout: 15000 });
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'learning');
  // (NÃO clicamos "Ver meu perfil" → nada é salvo)

  // ── Resultado (perfil já existente da ana.demo) ─────────────────────────
  await page.goto(`${BASE}/dashboard/perfil-comportamental`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText(/Resumo Executivo/i).waitFor({ timeout: 15000 });
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  const bPerfil = await page.getByText(/Influência dominante/i).first().boundingBox().catch(() => null);
  await shot(page, 'perfil', bPerfil);

  // 'acoes' = MESMA tela do perfil, mas bbox unindo os 3 botões (Ouvir / Enviar / Baixar)
  const bOuvir = await page.getByText(/Ouvir devolutiva/i).first().boundingBox().catch(() => null);
  const bBaixar = await page.getByText(/Baixar PDF/i).first().boundingBox().catch(() => null);
  let bAcoes: Box | null = null;
  if (bOuvir && bBaixar) {
    const x = Math.min(bOuvir.x, bBaixar.x), y = Math.min(bOuvir.y, bBaixar.y);
    bAcoes = { x, y, width: Math.max(bOuvir.x + bOuvir.width, bBaixar.x + bBaixar.width) - x, height: Math.max(bOuvir.y + bOuvir.height, bBaixar.y + bBaixar.height) - y };
  }
  frames['acoes'] = { image: frames['perfil'].image, bbox: bAcoes };
  log(`✓ acoes (reusa perfil.png)  bbox=${bAcoes ? `${Math.round(bAcoes.x)},${Math.round(bAcoes.y)} ${Math.round(bAcoes.width)}×${Math.round(bAcoes.height)}` : '—'}`);

  const bComp = await frameTarget(page, /^Ousadia$/i);
  await shot(page, 'competencias', bComp);

  await browser.close();
  const out = path.join(OUT_DIR, 'disc.frames.json');
  writeFileSync(out, JSON.stringify({ flow: 'disc', viewport: { width: 1920, height: 1080 }, frames }, null, 2));
  log(`manifesto → ${path.relative(APP, out)} (${Object.keys(frames).length} frames)`);
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
