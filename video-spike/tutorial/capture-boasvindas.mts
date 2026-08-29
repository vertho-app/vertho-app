/**
 * Captura do fluxo BOAS-VINDAS (UniAnchieta): entrar no app → mapeamento
 * comportamental → cenários. Um vídeo só, teto de 2 min.
 *
 * Estúdio: tenant `unianchieta` LOCAL com uma persona FICTÍCIA que este script
 * CRIA no início e APAGA no fim (inclusive em falha) — as diretoras reais nunca
 * entram em tela. Nada é salvo pela persona: o mapeamento não chega a "Ver meu
 * perfil" e a avaliação não chega a "Enviar avaliação".
 *
 * ⚠️ unianchieta NÃO é `is_demo` → o guard de envio não protege. Por isso:
 *   - a persona nasce SEM telefone (nada a enviar por WhatsApp);
 *   - o POST /api/auth/magic-link é INTERCEPTADO no Playwright (nenhum e-mail
 *     real sai; a tela "Link enviado!" é a resposta stubada).
 *
 * Rodar (dev no ar):
 *   npx tsx video-spike/tutorial/capture-boasvindas.mts
 */
import { chromium, type Page, type BrowserContext } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '../..');
const PUBLIC_DIR = path.join(APP, 'public', 'video-spike');
const OUT_DIR = path.join(HERE, 'out');
const BASE = process.env.TUTORIAL_BASE || 'http://unianchieta.localhost:3000';
const IMGDIR = path.join(PUBLIC_DIR, 'tutorial', 'boasvindas');

const EMPRESA_ID = '4093fc44-906d-4a1a-926f-16e9c220f59d'; // unianchieta
const PERSONA = {
  email: 'marina.demo@vertho.ai',
  nome_completo: 'Marina Prado',
  cargo: 'Diretor(a) Universitário(a)', // precisa bater com cargos_empresa (top5 → cenário)
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

// ── Persona fictícia: cria e apaga ──────────────────────────────────────────
async function seedPersona(): Promise<string> {
  const q = `${SB_URL}/rest/v1/colaboradores?empresa_id=eq.${EMPRESA_ID}&email=eq.${encodeURIComponent(PERSONA.email)}&select=id`;
  const existente = await (await fetch(q, { headers: rest })).json();
  if (Array.isArray(existente) && existente[0]?.id) {
    log(`· persona já existia (${existente[0].id})`);
    return existente[0].id;
  }
  const res = await fetch(`${SB_URL}/rest/v1/colaboradores`, {
    method: 'POST',
    headers: { ...rest, Prefer: 'return=representation' },
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
  // o dev chrome do Next só existe DEPOIS do hydrate → esconder aqui, não no addInitScript
  await page.evaluate(() => {
    if (document.getElementById('__hidedev')) return;
    const s = document.createElement('style'); s.id = '__hidedev';
    s.textContent = 'nextjs-portal,next-route-announcer{display:none!important}';
    (document.head || document.documentElement).appendChild(s);
  }).catch(() => {});
  const rel = `tutorial/boasvindas/${id}.png`;
  await page.screenshot({ path: path.join(PUBLIC_DIR, rel) });
  frames[id] = { image: rel, bbox };
  log(`✓ ${id.padEnd(16)} bbox=${bbox ? `${Math.round(bbox.x)},${Math.round(bbox.y)} ${Math.round(bbox.width)}×${Math.round(bbox.height)}` : '—'}`);
}

/**
 * Clica até a tela mudar. O primeiro clique depois de um `goto` costuma cair
 * ANTES da hidratação: o handler ainda não existe, o clique não é erro e o SPA
 * fica na mesma fase — foi assim que a tela de "Contexto" virou um segundo
 * retrato da tela anterior.
 */
async function clickUntil(page: Page, clicar: () => Promise<void>, alvo: () => Promise<boolean>, tentativas = 6) {
  for (let i = 0; i < tentativas; i++) {
    await clicar();
    for (let j = 0; j < 10; j++) {
      await page.waitForTimeout(300);
      if (await alvo().catch(() => false)) return;
    }
  }
  throw new Error('clickUntil: a tela não avançou');
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

async function novaAba(ctx: BrowserContext) {
  const page = await ctx.newPage();
  // O MicInput some ("Indisponível") sem Web Speech API, e o Chromium headless
  // não tem. O usuário real (Chrome) TEM — então stubamos pra tela mostrar o
  // que ele vê de fato. Nada é gravado: o botão nunca é clicado.
  await page.addInitScript(() => {
    if (!(window as any).webkitSpeechRecognition) {
      (window as any).webkitSpeechRecognition = class { start() {} stop() {} abort() {} addEventListener() {} };
    }
  });
  return page;
}

const RESPOSTAS = [
  'Suspendo o uso da plataforma para dados de alunos até termos contrato e parecer jurídico, mas mantenho o piloto com dados anonimizados. Converso com a Marcela antes, para ela ouvir de mim e não do comunicado.',
  'Convoco a coordenação e o DPO na segunda de manhã, comunico a decisão por escrito aos 38 docentes e ofereço uma alternativa contratada em até trinta dias, para não parar o trabalho que já melhorou a evasão.',
  'O ganho pedagógico é real, mas dado de aluno sem base legal expõe a instituição e as próprias famílias. Prefiro perder velocidade agora a perder a confiança depois — e o congresso pode esperar.',
  'Acompanho dois indicadores: a evasão da turma-piloto e o tempo de devolutiva, comparados ao semestre anterior. Se a alternativa contratada não sustentar o resultado em sessenta dias, revejo a escolha com dados na mesa.',
];

async function main() {
  mkdirSync(IMGDIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const personaId = await seedPersona();
  const browser = await chromium.launch({ headless: true });

  try {
    // ══ 1. DESLOGADO: tela de login + "link enviado" ════════════════════════
    const anon = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    const lp = await novaAba(anon);

    // NENHUM e-mail/WhatsApp real sai daqui: as duas rotas de envio são stubadas.
    await lp.route('**/api/auth/check-email', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ exists: true, allowSignup: false }) }));
    await lp.route('**/api/auth/magic-link', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));
    await lp.route('**/api/auth/phone-magic-link/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }));

    await lp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const inputEmail = lp.getByPlaceholder(/seu@email\.com/i);
    await inputEmail.waitFor({ timeout: 20000 });
    await lp.waitForTimeout(1200); // logo do tenant + fontes
    await inputEmail.fill(PERSONA.email);
    await lp.waitForTimeout(300);
    const bLogin = await lp.locator('form').first().boundingBox().catch(() => null);
    await shot(lp, 'login', bLogin);

    await lp.getByRole('button', { name: /^entrar$/i }).click();
    await lp.getByText(/link enviado!/i).first().waitFor({ timeout: 15000 });
    await lp.waitForTimeout(700);
    await shot(lp, 'link');
    await anon.close();

    // ══ 2. LOGADO: home → mapeamento → cenários ═════════════════════════════
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    await ctx.addCookies(await mint(PERSONA.email));
    const page = await novaAba(ctx);
    const settle = () => page.waitForTimeout(700);

    // ── Home ───────────────────────────────────────────────────────────────
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByText(/Olá, Marina/i).waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    const bCta = await page.getByRole('button', { name: /diagn[óo]stico comportamental/i }).first().boundingBox().catch(() => null);
    await shot(page, 'home', bCta);

    // ── Mapeamento (dirige o SPA; NÃO clica "Ver meu perfil" → nada é salvo) ─
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
    await page.getByRole('button', { name: 'AVANÇAR' }).waitFor({ timeout: 15000 });
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'map-pares');

    // preferências de aprendizagem (última etapa do mapeamento)
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
    // (NÃO clicamos "Ver meu perfil" → nada é salvo)

    // ── Cenários (para na representatividade; NÃO envia) ────────────────────
    await page.goto(`${BASE}/dashboard/assessment`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.getByText(/Como funciona\?/i).first().waitFor({ timeout: 30000 });
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'aval-inicio');

    // ⚠️ o nome tem que ser o do BOTÃO DO CARD ("▶ Iniciar avaliação"): a shell
    // do dashboard tem um passo de jornada chamado "Iniciar avaliação" (oculto)
    // e um regex frouxo casava com ele — a espera passava sem a tela ter mudado.
    const btnIniciar = page.getByRole('button', { name: /▶\s*iniciar avalia[çc][ãa]o/i });
    await clickUntil(
      page,
      () => page.getByRole('button', { name: /come[çc]ar avalia[çc][ãa]o/i }).click(),
      () => btnIniciar.first().isVisible(),
    );
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'aval-contexto');

    await clickUntil(page, () => btnIniciar.first().click(), () => page.getByText(/Pergunta 1 de 4/i).first().isVisible());
    const ta = page.locator('textarea').first();
    await ta.fill(RESPOSTAS[0]);
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    const bMic = await page.getByRole('button', { name: /gravar por voz/i }).first().boundingBox().catch(() => null);
    await shot(page, 'aval-responder', bMic);

    // P2→P4 e depois "Avançar →" (nada é gravado até "Enviar avaliação ✓")
    for (let i = 1; i <= 3; i++) {
      await page.getByRole('button', { name: /pr[óo]xima/i }).click();
      await page.getByText(new RegExp(`Pergunta ${i + 1} de 4`, 'i')).waitFor({ timeout: 15000 });
      await page.locator('textarea').first().fill(RESPOSTAS[i]);
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: /^avan[çc]ar/i }).click();
    await page.getByText(/grau de representatividade/i).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: '8', exact: true }).click();
    await settle();
    await page.evaluate(() => window.scrollTo(0, 0));
    const bEnviar = await page.getByRole('button', { name: /enviar avalia[çc][ãa]o/i }).first().boundingBox().catch(() => null);
    await shot(page, 'aval-enviar', bEnviar);
    // ⛔ o clique em "Enviar avaliação" NÃO acontece — nada é persistido.

    const out = path.join(OUT_DIR, 'boasvindas.frames.json');
    writeFileSync(out, JSON.stringify({ flow: 'boasvindas', viewport: { width: 1920, height: 1080 }, frames }, null, 2));
    log(`manifesto → ${path.relative(APP, out)} (${Object.keys(frames).length} frames)`);
  } finally {
    await browser.close().catch(() => {});
    await purgePersona(personaId); // sempre, inclusive em falha
  }
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
