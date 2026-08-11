// Captura de tela de TODAS as telas do sistema, para o manual do administrador.
// Local, não versionado. Uso:
//   node scripts/_capturar-telas-manual.mjs [perfil]
//   perfis: admin | colab | gestor | rep | publico | todos (default: todos)
//
// Receita de sessão: a mesma de scripts/_mint-colab-session.mjs (memória "E2E em
// produção") — admin API cria/confirma o usuário, generate_link magiclink, verify,
// e o cookie sb-<ref>-auth-token entra no contexto do Playwright.
//
// ⚠️ Só NAVEGA. Nenhum clique em botão que grava, envia ou apaga.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

// O manual vive FORA do repo (que é público): os prints e os alvos têm dado de tenant.
const SAIDA = fileURLToPath(new URL('../../deliverables/manual-telas/', import.meta.url));
const IMGS = path.join(SAIDA, 'img');

// Ids de tenant e e-mails ficam num arquivo local, não no código versionado.
const ARQ_ALVOS = path.join(SAIDA, 'alvos.json');
if (!existsSync(ARQ_ALVOS)) {
  console.error(
    `alvos.json não encontrado em ${ARQ_ALVOS}\n`
    + 'Copie scripts/manual-telas.alvos.exemplo.json para lá e preencha.',
  );
  process.exit(1);
}
const ALVOS = JSON.parse(readFileSync(ARQ_ALVOS, 'utf8'));
const EMPRESA_DEMO = ALVOS.empresaDemo;
const EMPRESA_MACAE = ALVOS.empresaFallback;
const APP = ALVOS.app;
const TENANT_DEMO = ALVOS.tenantDemo;

// ── env ─────────────────────────────────────────────────────────────────────
const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const SB = env.NEXT_PUBLIC_SUPABASE_URL;
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REF = SB.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];

async function mintar(email) {
  const admin = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };
  await fetch(`${SB}/auth/v1/admin/users`, {
    method: 'POST', headers: admin, body: JSON.stringify({ email, email_confirm: true }),
  });
  const linkRes = await fetch(`${SB}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email }),
  });
  const link = await linkRes.json();
  const hashed = link.hashed_token || link.properties?.hashed_token;
  if (!hashed) throw new Error(`generate_link falhou p/ ${email}: ${linkRes.status}`);
  const verifyRes = await fetch(`${SB}/auth/v1/verify`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
  });
  const session = await verifyRes.json();
  if (!session.access_token) throw new Error(`verify falhou p/ ${email}: ${verifyRes.status}`);
  const payload = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
  const chunks = [];
  for (let i = 0; i < payload.length; i += 3180) chunks.push(payload.slice(i, i + 3180));
  return chunks.length === 1
    ? [{ name: `sb-${REF}-auth-token`, value: chunks[0] }]
    : chunks.map((v, i) => ({ name: `sb-${REF}-auth-token.${i}`, value: v }));
}

function cookiesPara(base, pares) {
  const host = new URL(base).hostname;
  return pares.map((c) => ({ ...c, domain: host, path: '/', secure: true, sameSite: 'Lax' }));
}

// ── rotas ───────────────────────────────────────────────────────────────────
const E = EMPRESA_DEMO;
const IDS = ALVOS.ids;

const R = (slug, url, nota) => ({ slug, url, nota: nota || '' });

const ROTAS_ADMIN = [
  // visão geral
  R('admin-dashboard', '/admin/dashboard'),
  R('admin-empresas-gerenciar', '/admin/empresas/gerenciar'),
  R('admin-empresas-nova', '/admin/empresas/nova'),
  R('admin-empresa-pipeline', `/admin/empresas/${E}`),
  // pipeline de fases
  R('admin-fase0', `/admin/empresas/${E}/fase0`),
  R('admin-fase1', `/admin/empresas/${E}/fase1`),
  R('admin-fase2', `/admin/empresas/${E}/fase2`),
  R('admin-fase4', `/admin/empresas/${E}/fase4`),
  R('admin-extracao-cargo', `/admin/empresas/${E}/extracao-cargo`),
  R('admin-extracao-video-empresa', `/admin/empresas/${E}/extracao-video`),
  // operação
  R('admin-temporadas', `/admin/temporadas?empresa=${E}`),
  R('admin-engajamento', `/admin/engajamento?empresa=${E}`),
  R('admin-engajamento-evolucao', `/admin/engajamento/evolucao?empresa=${E}`),
  R('admin-whatsapp', `/admin/whatsapp?empresa=${E}`),
  R('admin-pulso', `/admin/empresas/${E}/pulso`),
  R('admin-pulso-dashboard', `/admin/empresas/${EMPRESA_MACAE}/pulso/${IDS.cicloPulso}/dashboard`, 'tenant real (Macaé) — a demo não tem ciclo de pulso'),
  R('admin-pulso-enviar', `/admin/empresas/${EMPRESA_MACAE}/pulso/${IDS.cicloPulso}/enviar`, 'tenant real (Macaé) — a demo não tem ciclo de pulso'),
  // configuração
  R('admin-competencias', `/admin/competencias?empresa=${E}`),
  R('admin-cargos', `/admin/cargos?empresa=${E}`),
  R('admin-ppp', `/admin/ppp?empresa=${E}`),
  R('admin-configuracoes', `/admin/empresas/${E}/configuracoes`),
  R('admin-escolas', `/admin/empresas/${E}/escolas`),
  R('admin-votacao', `/admin/empresas/${E}/votacao`),
  R('admin-assessment-descritores', '/admin/assessment-descritores'),
  R('admin-perfil-externo', `/admin/empresas/${E}/perfil-externo`),
  R('admin-calibracao', `/admin/empresas/${E}/calibracao`),
  // conteúdo
  R('admin-conteudos', `/admin/conteudos?empresa=${E}`),
  R('admin-kit', '/admin/conteudos/kit'),
  R('admin-kit-coorte', '/admin/conteudos/kit/coorte'),
  R('admin-videos', `/admin/videos?empresa=${E}`),
  R('admin-knowledge-base', `/admin/vertho/knowledge-base?empresa=${E}`),
  R('admin-preferencias', '/admin/preferencias-aprendizagem'),
  // módulos-base
  R('admin-modulos-base', '/admin/vertho/modulos-base'),
  R('admin-modulo-base-detalhe', `/admin/vertho/modulos-base/${IDS.moduloBase}`),
  R('admin-modulos-cobertura', '/admin/vertho/modulos-base/cobertura'),
  R('admin-modulos-extracao-video', '/admin/vertho/modulos-base/extracao-video'),
  R('admin-modulos-manuscrito', '/admin/vertho/modulos-base/importar-manuscrito'),
  // resultados
  R('admin-perfis-comportamentais', `/admin/empresas/${E}/perfis-comportamentais`),
  R('admin-relatorios-empresa', `/admin/empresas/${E}/relatorios`),
  R('admin-fit', `/admin/fit?empresa=${E}`),
  R('admin-evolucao', `/admin/evolucao?empresa=${E}`),
  R('admin-ranking', `/admin/empresas/${E}/ranking`),
  R('admin-top10', `/admin/top10?empresa=${E}`),
  R('admin-selecao', `/admin/empresas/${E}/selecao`),
  R('admin-relatorios', '/admin/relatorios'),
  // auditoria Vertho
  R('admin-evidencias', `/admin/vertho/evidencias?empresa=${E}`),
  R('admin-auditorias', `/admin/vertho/auditorias?empresa=${E}`),
  R('admin-auditoria-sem14', `/admin/vertho/auditoria-sem14?empresa=${E}`),
  R('admin-avaliacao-acumulada', `/admin/vertho/avaliacao-acumulada?empresa=${E}`),
  // radar educacional
  R('admin-radar', '/admin/radar'),
  R('admin-radar-funnel', '/admin/radar/funnel'),
  R('admin-radar-funnel-bett', '/admin/radar/funnel-bett'),
  R('admin-radar-qualidade', '/admin/radar/qualidade-dados'),
  // comercial
  R('admin-comercial', '/admin/comercial'),
  R('admin-comercial-carteira', '/admin/comercial/carteira'),
  R('admin-comercial-comissoes', '/admin/comercial/comissoes'),
  R('admin-comercial-materiais', '/admin/comercial/materiais'),
  R('admin-comercial-propostas', '/admin/comercial/propostas'),
  R('admin-comercial-proposta-detalhe', `/admin/comercial/propostas/${IDS.proposta}`),
  R('admin-comercial-representantes', '/admin/comercial/representantes'),
  // radar empresas
  R('admin-radarempresas', '/admin/vertho/radarempresas'),
  R('admin-radarempresas-empresa', `/admin/vertho/radarempresas/empresa/${IDS.cnpj}`),
  R('admin-radarempresas-listas', '/admin/vertho/radarempresas/listas'),
  R('admin-radarempresas-redes', '/admin/vertho/radarempresas/redes'),
  R('admin-mercado-potencial', '/admin/vertho/mercado-potencial'),
  R('admin-potencial-cidades', '/admin/vertho/potencial-cidades'),
  // custos
  R('admin-simulador-custo', '/admin/vertho/simulador-custo'),
  R('admin-custo-ia', '/admin/vertho/custo-ia'),
  R('admin-orcamento', '/admin/vertho/orcamento'),
  // sistema
  R('admin-platform-admins', '/admin/platform-admins'),
  R('admin-permissoes', '/admin/permissoes'),
  R('admin-auditoria', '/admin/auditoria'),
  R('admin-lixeira', '/admin/lixeira'),
  R('admin-demo', '/admin/demo'),
  R('admin-simulador', `/admin/simulador?empresa=${E}`),
  R('admin-board', '/admin/vertho/board'),
  R('admin-board-detalhe', `/admin/vertho/board/${IDS.board}`),
];

const ROTAS_COLAB = [
  R('colab-dashboard', '/dashboard'),
  R('colab-home', '/dashboard/home'),
  R('colab-jornada', '/dashboard/jornada'),
  R('colab-perfil', '/dashboard/perfil'),
  R('colab-assessment', '/dashboard/assessment'),
  R('colab-assessment-chat', '/dashboard/assessment/chat'),
  R('colab-perfil-comportamental', '/dashboard/perfil-comportamental'),
  R('colab-mapeamento', '/dashboard/perfil-comportamental/mapeamento'),
  R('colab-relatorio-disc', '/dashboard/perfil-comportamental/relatorio'),
  R('colab-praticar', '/dashboard/praticar'),
  R('colab-evidencia', '/dashboard/praticar/evidencia'),
  R('colab-temporada', '/dashboard/temporada'),
  R('colab-temporada-semana', '/dashboard/temporada/semana/1'),
  R('colab-temporada-concluida', '/dashboard/temporada/concluida'),
  R('colab-temporada-sem14', '/dashboard/temporada/sem14'),
  R('colab-pdi', '/dashboard/pdi'),
  R('colab-evolucao', '/dashboard/evolucao'),
  R('colab-votacao', '/dashboard/votacao'),
  R('colab-pulso', `/dashboard/pulso/${IDS.pulsoAssignment}`, 'assignment é de tenant real (Macaé) — na demo não existe ciclo'),
];

const ROTAS_GESTOR = [
  R('gestor-home', '/dashboard/gestor'),
  R('gestor-equipe-evolucao', '/dashboard/gestor/equipe-evolucao'),
  R('gestor-ranking', '/dashboard/gestor/ranking'),
  R('gestor-selecao', '/dashboard/gestor/selecao'),
  R('gestor-selecao-nova', '/dashboard/gestor/selecao/nova'),
];

const ROTAS_REP = [
  R('rep-home', '/representante'),
  R('rep-carteira', '/representante/carteira'),
  R('rep-conta', `/representante/carteira/${IDS.conta}`),
  R('rep-comissoes', '/representante/comissoes'),
  R('rep-crm', '/representante/crm'),
  R('rep-oportunidade', `/representante/crm/${IDS.oportunidade}`),
  R('rep-crm-nova', '/representante/crm/nova'),
  R('rep-demo', '/representante/demo'),
  R('rep-inteligencia', '/representante/inteligencia-comercial'),
  R('rep-propostas', '/representante/propostas'),
  R('rep-proposta', `/representante/propostas/${IDS.proposta}`),
  R('rep-proposta-nova', '/representante/propostas/nova'),
];

const ROTAS_PUBLICO = [R('login', '/login')];

const PERFIS = {
  // ⚠️ `sessoes.admin` TEM que ser um e-mail da tabela `platform_admins`, não o de
  // ADMIN_EMAILS. O layout do /admin aceita os dois (checarAcessoPlataforma tem fallback
  // de env), mas `requireAdminAction()` lê só a tabela — com o e-mail do env a tela ABRE
  // e todas as actions devolvem 403, deixando a página girando para sempre, sem erro.
  admin: { email: ALVOS.sessoes.admin, base: APP, rotas: ROTAS_ADMIN, filtroEmpresa: E },
  colab: { email: ALVOS.sessoes.colab, base: TENANT_DEMO, rotas: ROTAS_COLAB },
  gestor: { email: ALVOS.sessoes.gestor, base: TENANT_DEMO, rotas: ROTAS_GESTOR },
  rep: { email: ALVOS.sessoes.rep, base: APP, rotas: ROTAS_REP },
  publico: { email: null, base: TENANT_DEMO, rotas: ROTAS_PUBLICO },
};

// ── captura ─────────────────────────────────────────────────────────────────
const CSS_ESTAVEL = `
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important; }
  html { scrollbar-width: none; }
  ::-webkit-scrollbar { display: none; }
`;

/**
 * Espera a tela ASSENTAR. O critério não é tempo, é estado:
 *   1. nenhum `.animate-spin` VISÍVEL (é a classe do Loader2 em toda a base — 278 usos);
 *   2. o texto da página parou de crescer (3 amostras iguais).
 * Se estourar o teto, devolve `aindaCarregando: true` — a foto sai mesmo assim, mas
 * fica MARCADA. Print de spinner entregue como se fosse a tela é o que não pode.
 */
async function esperarAssentar(page, tetoMs = 22000) {
  const t0 = Date.now();
  let anterior = -1;
  let iguais = 0;
  while (Date.now() - t0 < tetoMs) {
    const estado = await page.evaluate(() => {
      const girando = [...document.querySelectorAll('.animate-spin')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length;
      return { girando, texto: (document.body?.innerText || '').length };
    }).catch(() => ({ girando: 1, texto: -1 }));
    if (estado.girando === 0) {
      if (estado.texto === anterior) iguais++; else iguais = 0;
      anterior = estado.texto;
      if (iguais >= 2) return { aindaCarregando: false, esperouMs: Date.now() - t0 };
    } else {
      iguais = 0;
      anterior = -1;
    }
    await page.waitForTimeout(400);
  }
  return { aindaCarregando: true, esperouMs: Date.now() - t0 };
}

/** Rola a página inteira para acionar conteúdo preguiçoso e volta ao topo. */
async function varrerPagina(page) {
  await page.evaluate(async () => {
    const alturaTela = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += alturaTela) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  }).catch(() => {});
  await page.waitForTimeout(600);
}

async function capturarPerfil(browser, nomePerfil, cfg, manifesto) {
  const cookiesBase = cfg.email ? await mintar(cfg.email) : [];
  let ctx = await novoContexto(browser, cfg, cookiesBase);
  let page = await ctx.newPage();

  for (const rota of cfg.rotas) {
    const alvo = cfg.base + rota.url;
    const registro = { perfil: nomePerfil, slug: rota.slug, rota: rota.url, url: alvo, nota: rota.nota };
    const erros = [];
    const onErr = (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 300)); };
    page.on('console', onErr);
    try {
      const resp = await page.goto(alvo, { waitUntil: 'domcontentloaded', timeout: 60000 });
      registro.status = resp ? resp.status() : null;
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      let assentou = await esperarAssentar(page);

      // Sessão morreu? Re-minta uma vez e repete.
      if (cfg.email && /\/login/.test(page.url()) && !/\/login/.test(rota.url)) {
        console.log(`  ↻ sessão caiu em ${rota.slug} — re-mintando`);
        page.off('console', onErr);
        await ctx.close();
        ctx = await novoContexto(browser, cfg, await mintar(cfg.email));
        page = await ctx.newPage();
        page.on('console', onErr);
        await page.goto(alvo, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        assentou = await esperarAssentar(page);
      }

      await varrerPagina(page);
      registro.aindaCarregando = assentou.aindaCarregando;
      registro.esperouMs = assentou.esperouMs;
      registro.urlFinal = page.url();
      registro.titulo = await page.title();
      // Prova de que o filtro de empresa chegou na origem certa (o sidebar do admin
      // só mostra os itens de tenant quando esta chave existe).
      if (cfg.filtroEmpresa) {
        registro.filtroLido = await page
          .evaluate(() => localStorage.getItem('vertho-admin-filter-empresa'))
          .catch(() => null);
      }
      registro.redirecionou = !registro.urlFinal.includes(rota.url.split('?')[0]);
      const arq = path.join(IMGS, `${rota.slug}.png`);
      await page.screenshot({ path: arq, fullPage: true, animations: 'disabled' });
      registro.imagem = `img/${rota.slug}.png`;
      registro.ok = true;
      console.log(`  ✓ ${rota.slug} (${(assentou.esperouMs / 1000).toFixed(1)}s)`
        + (assentou.aindaCarregando ? '  ⚠ AINDA CARREGANDO' : '')
        + (registro.redirecionou ? '  ⚠ REDIRECIONOU → ' + registro.urlFinal : ''));
    } catch (e) {
      registro.ok = false;
      registro.erro = String(e).slice(0, 400);
      console.log(`  ✗ ${rota.slug}: ${registro.erro.split('\n')[0]}`);
    }
    registro.consoleErros = erros.slice(0, 5);
    page.off('console', onErr);
    manifesto.push(registro);
    writeFileSync(path.join(SAIDA, 'dados', 'capturas.json'), JSON.stringify(manifesto, null, 2), 'utf8');
  }
  await ctx.close();
}

async function novoContexto(browser, cfg, cookies) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  if (cookies.length) await ctx.addCookies(cookiesPara(cfg.base, cookies));
  await ctx.addInitScript(({ filtro, css }) => {
    if (filtro) { try { localStorage.setItem('vertho-admin-filter-empresa', filtro); } catch {} }
    const s = document.createElement('style');
    s.textContent = css;
    document.documentElement.appendChild(s);
  }, { filtro: cfg.filtroEmpresa || null, css: CSS_ESTAVEL });
  return ctx;
}

// ── main ────────────────────────────────────────────────────────────────────
const alvo = process.argv[2] || 'todos';
const perfis = alvo === 'todos' ? Object.keys(PERFIS) : [alvo];
if (!existsSync(IMGS)) mkdirSync(IMGS, { recursive: true });
if (!existsSync(path.join(SAIDA, 'dados'))) mkdirSync(path.join(SAIDA, 'dados'), { recursive: true });

const manifesto = existsSync(path.join(SAIDA, 'dados', 'capturas.json'))
  ? JSON.parse(readFileSync(path.join(SAIDA, 'dados', 'capturas.json'), 'utf8')).filter((r) => !perfis.includes(r.perfil))
  : [];

const browser = await chromium.launch();
for (const p of perfis) {
  if (!PERFIS[p]) { console.error(`perfil desconhecido: ${p}`); continue; }
  console.log(`\n=== ${p} (${PERFIS[p].rotas.length} telas) ===`);
  await capturarPerfil(browser, p, PERFIS[p], manifesto);
}
await browser.close();

const ok = manifesto.filter((r) => r.ok).length;
const redir = manifesto.filter((r) => r.redirecionou).length;
const carregando = manifesto.filter((r) => r.aindaCarregando).length;
const semFiltro = manifesto.filter((r) => r.perfil === 'admin' && !r.filtroLido).length;
console.log(`\n${ok}/${manifesto.length} capturadas · ${redir} redirecionaram · ${carregando} AINDA CARREGANDO · ${semFiltro} sem filtro de empresa`);
if (carregando) console.log('⚠ revisar:', manifesto.filter((r) => r.aindaCarregando).map((r) => r.slug).join(', '));
