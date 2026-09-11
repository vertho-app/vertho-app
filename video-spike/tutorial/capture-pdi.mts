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
/**
 * O alvo está VISÍVEL no ponto em que a moldura vai cair?
 *
 * `count() > 0` prova que o nó existe; `boundingBox()` devolve a caixa mesmo com
 * um modal por cima. Quem responde "o que a câmera vê naquele pixel" é o
 * `elementFromPoint` — se o que está lá não é o alvo nem parente/filho dele,
 * alguma coisa cobriu, e a moldura vai emoldurar essa outra coisa.
 *
 * Lança com o texto do INTRUSO: sem ele o erro vira "não sei o que aconteceu", e
 * com ele o diagnóstico é imediato ("Seu Plano de Desenvolvimento Individual" =
 * o modal do FirstViewVideo).
 */
async function conferirVisivel(page: Page, loc: ReturnType<Page['getByText']>, id: string) {
  const intruso = await loc.evaluate((el: Element) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return 'alvo com caixa zerada (invisível)';
    const topo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!topo) return 'nada no ponto do alvo (fora da viewport)';
    if (topo === el || el.contains(topo) || topo.contains(el)) return null;
    const texto = (topo.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return `${topo.tagName.toLowerCase()}${topo.className ? '.' + String(topo.className).split(/\s+/)[0] : ''} — "${texto}"`;
  }).catch(() => null as string | null);
  if (intruso) throw new Error(`alvo COBERTO no beat "${id}": ${intruso}`);
}

async function bboxAt(page: Page, re: RegExp, id: string) {
  const loc = page.getByText(re).first();
  if (!(await loc.count().catch(() => 0))) throw new Error(`alvo nao encontrado na tela (${re}) - a tela mudou desde a ultima captura`);
  await conferirVisivel(page, loc, id);
  return await loc.boundingBox().catch(() => null);
}
async function frameTarget(page: Page, loc: ReturnType<Page['getByText']>, id: string) {
  // ALVO AUSENTE LANCA. Ate 10/09/2026 devolvia null, o `shot` imprimia "bbox=-" e a
  // captura seguia: sete semanas de mudanca de tela produziam PNGs sem destaque e um
  // log cheio de check verde. Quem descobria era o video, depois de renderizado.
  if (!(await loc.count().catch(() => 0))) {
    throw new Error(`alvo nao encontrado na tela (locator do passo) - a tela mudou desde a ultima captura`);
  }
  const b0 = await loc.boundingBox().catch(() => null);
  if (b0) { const sy = await page.evaluate(() => window.scrollY); await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, Math.round(b0.y + sy - 200))); await page.waitForTimeout(400); }
  await conferirVisivel(page, loc, id); // depois de rolar: é nesta posição que a moldura cai
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

  /*
   * 🔴 O MODAL DO TUTORIAL DO PDI COBRIU AS QUATRO CAPTURAS DO TUTORIAL DO PDI.
   *
   * `FirstViewVideo` (app/dashboard/pdi/page.tsx:280) abre sozinho na 1ª visita
   * da seção e marca o visto em `localStorage` por colaborador. A captura nasce
   * sempre em contexto NOVO, então ele abriu em cima de tudo — e o vídeo que
   * tocava dentro dele era a versão ANTERIOR deste mesmo tutorial. As quatro
   * molduras de destaque ficaram apontando para elementos atrás do modal.
   *
   * O `frameTarget` não pegou porque ele pergunta se o alvo EXISTE, e existia:
   * `getByText` acha o nó no DOM e `boundingBox()` devolve a caixa mesmo com
   * outra coisa por cima. Por isso, junto com esta dispensa, o `shot` passou a
   * conferir OCLUSÃO — ver `conferirVisivel`.
   *
   * Esta é a TERCEIRA tela com `FirstViewVideo`; jornada e aplicação já
   * dispensavam o modal desde 10/09, esta ficou de fora.
   */
  await page.addInitScript(() => {
    try {
      const orig = localStorage.getItem.bind(localStorage);
      localStorage.getItem = (k: string) => (k.startsWith('vertho:video-visto:') ? '1' : orig(k));
    } catch { /* localStorage indisponível */ }
  });

  await page.goto(`${BASE}/dashboard/pdi`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText(/Bruna Costa/i).first().waitFor({ timeout: 15000 });
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));

  // topo: título + Baixar PDF
  await shot(page, 'pdi', await bboxAt(page, /Bruna Costa/i, 'pdi'));
  await shot(page, 'baixar', await bboxAt(page, /Baixar PDF/i, 'baixar'));

  // competências / níveis (RESUMO DE DESEMPENHO)
  const bComp = await frameTarget(page, page.getByText(/RESUMO DE DESEMPENHO/i).first(), 'competencias');
  await shot(page, 'competencias', bComp);

  // 1º bloco de competência (idx 0) já vem ABERTO (useState(idx===0)) → só rolar até ele.
  //
  // ⚠️ A âncora é ESTRUTURAL, não o texto do plano. Até 10/09/2026 ela era
  // `/Senso de urgência genuíno|Plano de 30 dias/` — conteúdo do PDI que a `bruna.demo`
  // tinha em julho. O PDI dela hoje é outro (Negociação e Fechamento, Resiliência e
  // Constância…), então a captura morria procurando um texto que só existia naquela
  // versão daquele PDI. O destaque do beat é a COMPETÊNCIA, e todo card de competência
  // traz o selo de prioridade — isso vale para qualquer pessoa e qualquer conteúdo.
  const plano = page.getByRole('button').filter({ hasText: /Prioridade/i }).first();
  const bPlano = await frameTarget(page, plano, 'plano');
  await shot(page, 'plano', bPlano);

  await browser.close();
  const out = path.join(OUT_DIR, 'pdi.frames.json');
  writeFileSync(out, JSON.stringify({ flow: 'pdi', viewport: { width: 1920, height: 1080 }, frames }, null, 2));
  log(`manifesto → ${path.relative(APP, out)} (${Object.keys(frames).length} frames)`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
