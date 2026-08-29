/**
 * Captura do fluxo MACAÉ (professores do projeto Educação Integral):
 * entrar no app → mapeamento comportamental. PARA no mapeamento — o professor
 * não tem cenários nesta etapa.
 *
 * Estúdio: tenant `macae` LOCAL com uma persona FICTÍCIA que este script CRIA no
 * início e APAGA no fim (inclusive em falha) — os 155 professores reais nunca
 * entram em tela. Nada é salvo: o mapeamento não chega a "Ver meu perfil".
 *
 * ⚠️ macae NÃO é `is_demo` → o guard de envio não protege. Por isso:
 *   - a persona nasce SEM telefone (nada a enviar por WhatsApp);
 *   - check-email / magic-link / phone-magic-link são INTERCEPTADOS no Playwright.
 *
 * Rodar (dev no ar):
 *   npx tsx video-spike/tutorial/capture-macae.mts
 */
import { chromium, type Page, type BrowserContext } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const PUBLIC_DIR = path.join(APP, 'public', 'video-spike');
const OUT_DIR = path.join(HERE, 'out');
const BASE = process.env.TUTORIAL_BASE || 'http://macae.localhost:3000';
const IMGDIR = path.join(PUBLIC_DIR, 'tutorial', 'macae');

const EMPRESA_ID = '44b632ae-b7b9-440d-bc74-92cead889d52'; // Secretaria Municipal de Macaé/RJ
const PERSONA = {
  email: 'gravacao.professor@vertho.ai', // @vertho.ai → fora de toda estatística
  nome_completo: 'Ana Demonstração',
  cargo: 'Professor(a)',
  role: 'colaborador',
};

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
type Box = { x: number; y: number; width: number; height: number };

const env: Record<string, string> = {};
for (const line of readFileSync(path.join(APP, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const rest = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, 'Content-Type': 'application/json' };

async function seedPersona(): Promise<string> {
  const q = `${SB_URL}/rest/v1/colaboradores?empresa_id=eq.${EMPRESA_ID}&email=eq.${encodeURIComponent(PERSONA.email)}&select=id`;
  const existente = await (await fetch(q, { headers: rest })).json();
  if (Array.isArray(existente) && existente[0]?.id) {
    // Garante que ela não tenha telefone: sem número, não há o que enviar.
    await fetch(`${SB_URL}/rest/v1/colaboradores?id=eq.${existente[0].id}`, {
      method: 'PATCH', headers: rest,
      body: JSON.stringify({ telefone: null, whatsapp: null, login_por_whatsapp: false }),
    });
    log(`· persona já existia (${existente[0].id}) — telefone removido`);
    return existente[0].id;
  }
  const res = await fetch(`${SB_URL}/rest/v1/colaboradores`, {
    method: 'POST', headers: { ...rest, Prefer: 'return=representation' },
    body: JSON.stringify({ ...PERSONA, empresa_id: EMPRESA_ID }),
  });
  const body = await res.json();
  if (!res.ok || !body?.[0]?.id) throw new Error(`falha ao criar persona: ${JSON.stringify(body)}`);
  log(`✓ persona fictícia criada: ${PERSONA.nome_completo} (${body[0].id})`);
  return body[0].id;
}

async function purgePersona(id: string) {
  const res = await fetch(`${SB_URL}/rest/v1/colaboradores?id=eq.${id}`, { method: 'DELETE', headers: rest });
  log(res.ok ? `✓ persona fictícia apagada (${id})` : `⚠ NÃO consegui apagar a persona ${id} — apagar à mão`);
}

async function mint(email: string) {
  const U = SB_URL, S = SB_SERVICE, A = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
  const rel = `tutorial/macae/${id}.png`;
  await page.screenshot({ path: path.join(PUBLIC_DIR, rel) });
  frames[id] = { image: rel, bbox };
  log(`✓ ${id.padEnd(16)} bbox=${bbox ? `${Math.round(bbox.x)},${Math.round(bbox.y)} ${Math.round(bbox.width)}×${Math.round(bbox.height)}` : '—'}`);
}

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

async function novaAba(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    if (!(window as any).webkitSpeechRecognition) {
      (window as any).webkitSpeechRecognition = class { start() {} stop() {} abort() {} addEventListener() {} };
    }
  });
  return page;
}

async function main() {
  mkdirSync(IMGDIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const personaId = await seedPersona();
  const browser = await chromium.launch({ headless: true });

  try {
    // ══ 1. DESLOGADO: tela de login + "link enviado" ════════════════════════
    const anon = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    const lp = await novaAba(anon);

    await lp.route('**/api/auth/check-email', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exists: true, allowSignup: false }) }));
    await lp.route('**/api/auth/magic-link', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));
    await lp.route('**/api/auth/phone-magic-link/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));

    await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const inputEmail = lp.getByPlaceholder(/seu@email\.com/i);
    await inputEmail.waitFor({ timeout: 20000 });
    await lp.waitForTimeout(1500); // logo do tenant + fontes

    // A mensagem do Beto chega pelo WhatsApp e manda entrar pelo número — então
    // é o campo do TELEFONE que aparece preenchido, não o de e-mail.
    const inputFone = lp.getByPlaceholder(/DDD \+ n[úu]mero/i);
    await inputFone.fill('22981234567');
    await lp.waitForTimeout(300);
    const bLogin = await lp.locator('form').first().boundingBox().catch(() => null);
    await shot(lp, 'login', bLogin);

    await lp.getByRole('button', { name: /^entrar$/i }).click();
    await lp.getByText(/link enviado!/i).first().waitFor({ timeout: 15000 });
    await lp.waitForTimeout(700);
    await shot(lp, 'link');
    await anon.close();

    // ══ 2. LOGADO: home → mapeamento ════════════════════════════════════════
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    await ctx.addCookies(await mint(PERSONA.email));
    const page = await novaAba(ctx);
    const settle = () => page.waitForTimeout(700);

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByText(/Olá, Ana/i).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    const bCta = await page.getByRole('button', { name: /diagn[óo]stico comportamental/i }).first().boundingBox().catch(() => null);
    await shot(page, 'home', bCta);

    await page.goto(`${BASE}/dashboard/perfil-comportamental/mapeamento`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByRole('button', { name: /come[çc]ar mapeamento/i }).waitFor({ timeout: 30000 });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    const bCards = await frameTarget(page, /Como funcionam as perguntas/i);
    await shot(page, 'map-inicio', bCards);

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('button', { name: /come[çc]ar mapeamento/i }).click();
    await page.getByText(/pense no seu jeito mais espont/i).waitFor({ timeout: 15000 });
    await settle();
    await page.getByRole('button', { name: /^come[çc]ar$/i }).click();
    await page.getByRole('button', { name: 'AVANÇAR' }).waitFor({ timeout: 15000 });
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'map-rank');

    for (let i = 0; i < 12; i++) {
      if (await page.getByText(/toque na frase|OU/i).count().catch(() => 0)) break;
      const av = page.getByRole('button', { name: 'AVANÇAR' });
      if (!(await av.count().catch(() => 0))) break;
      await av.click();
      await page.waitForTimeout(220);
    }

    for (let i = 0; i < 8; i++) {
      if (await page.getByText(/Como você aprende melhor/i).count().catch(() => 0)) break;
      const opt = page.locator('button.border-2').first();
      if (await opt.count().catch(() => 0)) { await opt.click(); await page.waitForTimeout(150); }
      const av = page.getByRole('button', { name: 'AVANÇAR' });
      if (await av.count().catch(() => 0)) { await av.click(); await page.waitForTimeout(250); }
    }
    await page.getByText(/Como você aprende melhor/i).first().waitFor({ timeout: 15000 });
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    const bAprender = await frameTarget(page, /Como você aprende melhor/i);
    await shot(page, 'map-aprender', bAprender);
    // ⛔ "Ver meu perfil" NÃO é clicado → nada é salvo.

    const out = path.join(OUT_DIR, 'macae.frames.json');
    writeFileSync(out, JSON.stringify({ flow: 'macae', viewport: { width: 1920, height: 1080 }, frames }, null, 2));
    log(`manifesto → ${path.relative(APP, out)} (${Object.keys(frames).length} frames)`);
  } finally {
    await browser.close().catch(() => {});
    await purgePersona(personaId);
  }
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
