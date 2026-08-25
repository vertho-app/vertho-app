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

/**
 * 🔴 A TRILHA É RESOLVIDA EM RUNTIME, NÃO CRAVADA.
 *
 * Havia um GUID literal aqui (`02b63e87-…`) e ele deixou de existir: o reset
 * diário do acme-demo (04h) recria a trilha da bruna.demo com id novo. O
 * `UPDATE … where trilha_id='02b63e87-…'` passou a afetar ZERO linhas — sem
 * erro, sem aviso —, e a captura seguiu com a semana travada. Resultado medido
 * em 25/08: o beat "evidencias" narrava a conversa mostrando a tela com os
 * botões DESABILITADOS e "Libera após marcar conteúdo como realizado".
 *
 * Id de dado semeado nunca é estável em tenant que reseta. Resolver pelo EMAIL
 * é o único jeito de o script sobreviver ao próximo reset.
 */
async function pg_() {
  const c = new pg.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

let TRILHA = '';
async function resolverTrilha() {
  const c = await pg_();
  const { rows } = await c.query(
    `select t.id from trilhas t
       join colaboradores co on co.id = t.colaborador_id
      where co.email = $1
      order by t.criado_em desc limit 1`,
    ['bruna.demo@vertho.ai'],
  );
  await c.end();
  if (!rows.length) throw new Error('trilha da bruna.demo não encontrada — rode o reset do acme-demo');
  TRILHA = rows[0].id;
  log(`trilha resolvida: ${TRILHA}`);
}

async function setConsumed(v: boolean) {
  const c = await pg_();
  const r = await c.query(`update temporada_semana_progresso set conteudo_consumido=$1, status='em_andamento' where trilha_id=$2 and semana=1`, [v, TRILHA]);
  await c.end();
  // FALHA ALTO: um update que não acha a linha é exatamente como esta captura
  // gravou a tela errada por semanas sem ninguém ver.
  if (!r.rowCount) throw new Error(`setConsumed(${v}) não afetou nenhuma linha (trilha ${TRILHA}, semana 1)`);
}

/**
 * Deixa a conversa de evidências com N turnos de IA já feitos, para capturar o
 * CONTADOR ("faltam N respostas") e, com N = necessário, a semana CONCLUÍDA.
 *
 * A conversa real custaria N chamadas de IA por captura e produziria um texto
 * diferente a cada rodada — o tutorial mostraria uma conversa que ninguém mais
 * vai ver. Aqui o transcript é semeado: o que importa no vídeo é o ESTADO da
 * tela (o contador, a faixa verde), não o conteúdo do papo.
 */
/**
 * ⚠️ AS FALAS PRECISAM VARIAR. A primeira versão repetia o mesmo par de
 * pergunta/resposta N vezes, e no vídeo isso aparece como a Mentora fazendo a
 * MESMA pergunta seis vezes seguidas — quem assiste não lê "dado de exemplo",
 * lê "produto quebrado". O tutorial é a primeira impressão do mecanismo.
 *
 * O roteiro segue a progressão real do socrático (situação → o que fez →
 * reação → o que aprendeu), com o tema da semana 1 do acme-demo.
 */
const ROTEIRO_EVIDENCIAS: [string, string][] = [
  ['Me conta uma situação desta semana em que você precisou que o cliente decidisse mais rápido.',
   'Tive uma proposta parada há duas semanas com um cliente que só dizia "vou ver".'],
  ['E o que você fez de diferente dessa vez?',
   'Coloquei na proposta que a condição de pagamento valia até sexta, e expliquei o porquê.'],
  ['Como você explicou esse porquê para ele?',
   'Falei que a agenda de implantação de junho fechava, e que depois disso só entraria em julho.'],
  ['E como ele reagiu a essa razão?',
   'Ele parou de adiar. Respondeu no mesmo dia pedindo para fechar ainda naquela semana.'],
  ['O que te parece que fez a diferença: o prazo ou a explicação?',
   'A explicação. Prazo sozinho eu já tinha tentado antes e ele ignorava.'],
  ['O que você faria diferente na próxima proposta com base nisso?',
   'Colocar a razão concreta logo no começo, e não como argumento de última hora.'],
];

async function semearConversa(turnosIa: number, concluida: boolean) {
  const msgs: { role: string; content: string }[] = [];
  for (let i = 0; i < turnosIa; i++) {
    const [ia, colab] = ROTEIRO_EVIDENCIAS[i % ROTEIRO_EVIDENCIAS.length];
    msgs.push({ role: 'assistant', content: ia });
    msgs.push({ role: 'user', content: colab });
  }
  const c = await pg_();
  const r = await c.query(
    `update temporada_semana_progresso
        set reflexao = $1, status = $2
      where trilha_id = $3 and semana = 1`,
    [JSON.stringify({ transcript_completo: msgs }), concluida ? 'concluido' : 'em_andamento', TRILHA],
  );
  await c.end();
  if (!r.rowCount) throw new Error('semearConversa não afetou nenhuma linha');
}

/** Devolve a semana 1 ao estado inicial — captura não pode deixar rastro. */
async function limparConversa() {
  const c = await pg_();
  await c.query(
    `update temporada_semana_progresso set reflexao = null, status = 'em_andamento', conteudo_consumido = false where trilha_id = $1 and semana = 1`,
    [TRILHA],
  );
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
/**
 * BBox do BLOCO que contém o texto, não do texto em si.
 *
 * 🔴 `bbox()` mede o rótulo: para a barra "Sua semana" isso deu 986×15px, e o
 * highlight desenhou uma moldura de 15px de altura em volta do título — com a
 * borda passando POR CIMA da linha de passos, que é justamente a informação que
 * o beat existe para mostrar. Destacar o rótulo e esconder o conteúdo é pior
 * que não destacar nada.
 *
 * Sobe do texto até o ancestral que é o cartão (o `rounded-xl` do layout) e
 * devolve o retângulo dele.
 */
async function bboxDoBloco(page: Page, re: RegExp) {
  const alvo = page.getByText(re).first();
  if (!(await alvo.count().catch(() => 0))) return null;
  const box = await alvo.evaluate((el) => {
    let n: HTMLElement | null = el as HTMLElement;
    for (let i = 0; i < 6 && n; i++) {
      if (/rounded-xl/.test(n.className || '')) break;
      n = n.parentElement;
    }
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }).catch(() => null);
  return box;
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
  await resolverTrilha();
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
  await shot(page, 'estado', await bboxDoBloco(page, /SUA SEMANA/i));

  // Recarrega para o estado persistido. `setConsumed(true)` é a GARANTIA
  // determinística — e agora FALHA ALTO se não achar a linha, que foi
  // exatamente como esta captura gravou a tela travada sem ninguém ver.
  await setConsumed(true);
  await page.goto(`${BASE}/dashboard/temporada/semana/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText(/Criação de senso de urgência/i).first().waitFor({ timeout: 15000 });
  // Espera pelo ESTADO, não pelo relógio: o botão de Evidências só fica
  // clicável depois de a tela ler o progresso. Capturar antes disso é como o
  // beat "evidencias" acabou mostrando a tela com os botões cinza.
  await page.getByRole('button', { name: /Levantar evidências/i }).first()
    .waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  await page.waitForFunction(
    () => !document.body.innerText.includes('Libera após marcar conteúdo'),
    undefined, { timeout: 15000 },
  ).catch(() => {});
  await settle();
  await injectVideoChip(page);
  const bTd = await frameTarget(page, /TIRA-DÚVIDAS/i);
  await shot(page, 'tiraduvidas', bTd);
  const bEv = await frameTarget(page, /EVIDÊNCIAS/i);
  await shot(page, 'evidencias', bEv);

  /*
   * ── OS TRÊS ESTADOS QUE FALTAVAM (pedido do dono, 25/08) ──────────────────
   * O tutorial FALAVA das evidências e nunca mostrava o que acontece ao clicar:
   * a conversa abrindo, o contador andando e a semana fechando. Quem assiste
   * ouve "é o passo mais importante" e não vê nenhum deles.
   */

  // 1) A CONVERSA ABERTA — o clique real no botão.
  await page.getByRole('button', { name: /Levantar evidências/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await shot(page, 'conversa', await frameTarget(page, /EVIDÊNCIAS/i));

  // 2) O CONTADOR — semeia 3 de 6 turnos e mostra "faltam 3 respostas".
  await semearConversa(3, false);
  await page.goto(`${BASE}/dashboard/temporada/semana/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText(/Faltam .* respostas/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  await settle();
  // `bbox` e nao `bboxDoBloco`: o contador e uma LINHA dentro do card da
  // conversa, e subir ate o cartao emolduraria o chat inteiro (a primeira
  // tentativa devolveu 1920x1146 — a pagina toda). Aqui o alvo e a frase.
  await shot(page, 'progresso', await bbox(page, /Faltam .* respostas/i));

  // 3) A SEMANA CONCLUÍDA — a faixa verde, o marco que a pessoa nunca via.
  await semearConversa(6, true);
  await page.goto(`${BASE}/dashboard/temporada/semana/1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByText(/Semana 1 concluída/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  await settle();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'concluida', await bboxDoBloco(page, /Semana 1 concluída/i));

  // Captura não deixa rastro: devolve a semana ao estado inicial.
  await limparConversa();
  log('estado da bruna.demo restaurado');

  await browser.close();
  const out = path.join(OUT_DIR, 'jornada.frames.json');
  writeFileSync(out, JSON.stringify({ flow: 'jornada', viewport: { width: 1920, height: 1080 }, frames }, null, 2));
  log(`manifesto → ${path.relative(APP, out)} (${Object.keys(frames).length} frames)`);
}
main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
