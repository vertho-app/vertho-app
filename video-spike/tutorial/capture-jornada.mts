/**
 * Captura da Jornada semanal (bruna.demo). Dirige o fluxo real da semana 1:
 * abre um formato de conteúdo → Tira-Dúvidas/Evidências destravam NA HORA. O
 * popup do PDF (chip de conteúdo) é auto-fechado.
 *
 * 🔴 O PASSO "Marcar como realizado" SAIU (25/08/2026). Ele existia porque a
 * tela exigia um segundo clique para destravar a semana; hoje abrir o conteúdo
 * destrava e já marca, e o botão só aparece na pílula sem nada abrível. Este
 * script procurava o botão por texto (`/Marcar como realizado/i`) e passaria a
 * capturar vazio — a captura é o que prova que a tela faz o que o roteiro diz.
 * No lugar dele entra a barra "Sua semana", que é onde a régua agora é dita.
 *
 * Pré: seed aplicado + progresso da semana com conteudo_consumido=false.
 * Rodar:  npx tsx video-spike/tutorial/capture-jornada.mts
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
// `TUTORIAL_BASE` como nos outros captures — este era o único com a porta
// cravada, e a 3000 costuma estar ocupada por outro dev na mesma máquina.
// Porta errada captura a tela de OUTRA versão do app sem erro nenhum.
const BASE = process.env.TUTORIAL_BASE || 'http://acme-demo.localhost:3000';
const IMGDIR = path.join(PUBLIC_DIR, 'tutorial', 'jornada');
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

const TRILHA = '02b63e87-f864-43ea-806f-fd8c44fd2573';
async function setConsumed(v: boolean) {
  const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(`update temporada_semana_progresso set conteudo_consumido=$1, status='em_andamento' where trilha_id=$2 and semana=1`, [v, TRILHA]);
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
  const rel = `tutorial/jornada/${id}.png`;
  await page.screenshot({ path: path.join(PUBLIC_DIR, rel) });
  frames[id] = { image: rel, bbox };
  log(`✓ ${id.padEnd(14)} bbox=${bbox ? `${Math.round(bbox.x)},${Math.round(bbox.y)} ${Math.round(bbox.width)}×${Math.round(bbox.height)}` : '—'}`);
}
function union(a: Box | null, b: Box | null): Box | null {
  if (!a) return b; if (!b) return a;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}
async function bbox(page: Page, re: RegExp) {
  return await page.getByText(re).first().boundingBox().catch(() => null);
}
async function frameTarget(page: Page, re: RegExp) {
  const loc = page.getByText(re).first();
  if (!(await loc.count().catch(() => 0))) return null;
  const b0 = await loc.boundingBox().catch(() => null);
  if (b0) { const sy = await page.evaluate(() => window.scrollY); await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(b0.y + sy - 220))); await page.waitForTimeout(400); }
  return await loc.boundingBox().catch(() => null);
}

// Chip "vídeo" FAKE: clona o último chip de formato (herda o estilo real do app)
// e troca o rótulo p/ "vídeo". Pedido do Rodrigo — o acme-demo não tem vídeo real.
async function injectVideoChip(page: Page) {
  await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('a[href*="/api/conteudo"]'));
    if (!chips.length || chips.some((c) => /v[ií]deo/i.test(c.textContent || ''))) return;
    const clone = chips[chips.length - 1].cloneNode(true) as HTMLElement;
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    let node: Node | null; let textNode: Node | null = null;
    while ((node = walker.nextNode())) if (node.textContent && node.textContent.trim()) textNode = node;
    if (textNode) textNode.textContent = 'vídeo';
    chips[chips.length - 1].parentElement!.appendChild(clone);
  });
  await page.waitForTimeout(250);
}

async function main() {
  mkdirSync(IMGDIR, { recursive: true }); mkdirSync(OUT_DIR, { recursive: true });
  const cookies = await mint('bruna.demo@vertho.ai');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  ctx.on('page', (p) => { if (p !== page) p.close().catch(() => {}); }); // auto-fecha SÓ o popup do PDF
  await page.addInitScript(() => { // esconde o chrome do modo dev do Next
    const s = document.createElement('style');
    s.textContent = 'nextjs-portal,[data-nextjs-toast],#__next-build-watcher,[data-next-badge-root],[data-nextjs-dev-tools-button]{display:none!important}';
    document.documentElement.appendChild(s);
  });
  const settle = () => page.waitForTimeout(800);
  // Estado inicial: semana ainda NÃO consumida — é assim que a pessoa chega,
  // e é o que faz a barra "Sua semana" mostrar o passo de conteúdo pendente.
  await setConsumed(false);

  // /temporada — a grade
  await page.goto(`${BASE}/dashboard/temporada`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'temporada', await bbox(page, /Negociação e Fechamento/i));

  // /semana/1 — topo (episódio + conteúdo)
  await page.goto(`${BASE}/dashboard/temporada/semana/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText(/Criação de senso de urgência/i).first().waitFor({ timeout: 15000 });
  await settle();
  await injectVideoChip(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'semana', await bbox(page, /^Criação de senso de urgência$/i));
  // chips de formato = links p/ /api/conteudo (union = bbox do highlight)
  const chips = page.locator('a[href*="/api/conteudo"]');
  let bChips: Box | null = null;
  const nc = await chips.count().catch(() => 0);
  for (let i = 0; i < nc; i++) bChips = union(bChips, await chips.nth(i).boundingBox().catch(() => null));
  await shot(page, 'conteudo', bChips);

  // Abre um formato (popup do PDF auto-fecha). A partir daqui as conversas
  // liberam sozinhas — é exatamente o que o passo `estado` narra.
  await chips.first().click().catch(() => {});
  await page.waitForTimeout(1200);
  // A barra "Sua semana": o novo lugar onde a régua da conclusão é dita.
  await shot(page, 'estado', await bbox(page, /SUA SEMANA/i));

  // Recarrega para o estado persistido (o clique acima já gravou o consumo).
  // `setConsumed(true)` continua aqui como GARANTIA determinística: se a
  // gravação assíncrona não tiver concluído, a captura seguinte pegaria a tela
  // no meio do caminho — e captura instável é como um tutorial passa a mostrar
  // uma tela que ninguém vê.
  await setConsumed(true);
  await page.goto(`${BASE}/dashboard/temporada/semana/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText(/Criação de senso de urgência/i).first().waitFor({ timeout: 15000 });
  await settle();
  await injectVideoChip(page);
  const bTd = await frameTarget(page, /TIRA-DÚVIDAS/i);
  await shot(page, 'tiraduvidas', bTd);
  const bEv = await frameTarget(page, /EVIDÊNCIAS/i);
  await shot(page, 'evidencias', bEv);

  await browser.close();
  const out = path.join(OUT_DIR, 'jornada.frames.json');
  writeFileSync(out, JSON.stringify({ flow: 'jornada', viewport: { width: 1920, height: 1080 }, frames }, null, 2));
  log(`manifesto → ${path.relative(APP, out)} (${Object.keys(frames).length} frames)`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
