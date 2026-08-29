import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'http://acme-demo.localhost:3000';
const TMP = process.env.TEMP || 'C:/Users/rdnav/AppData/Local/Temp';

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

const cookies = await mint('bruna.demo@vertho.ai');
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
for (const [url, name] of [
  ['/dashboard/temporada', 'v-temporada'],
  ['/dashboard/temporada/semana/1', 'v-semana'],
  ['/dashboard/pdi', 'v-pdi'],
] as [string, string][]) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${TMP}/${name}.png` });
  console.log('shot', name, '←', new URL(page.url()).pathname);
}
await browser.close();
