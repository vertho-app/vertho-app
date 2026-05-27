// Diagnóstico E2E — crawler de rotas (nível 1).
//
// Loga uma vez e visita todas as rotas (dashboard + admin), capturando por
// página: erros de console, exceções não tratadas (pageerror), respostas
// HTTP >= 400, redirect inesperado pro /login (sem acesso) e error-boundary.
// Tira screenshot de cada rota e escreve um relatório em test-results/.
//
// NÃO clica botões de ação — é read-only, seguro pra rodar sem mutar dados.
//
// Uso:
//   PLAYWRIGHT_BASE_URL=https://teste-piloto.vertho.ai \
//   SMOKE_EMAIL=... SMOKE_PASS=... DIAG_EMPRESA_ID=<uuid> \
//   npx playwright test tests/diagnostico.spec.js

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');
const fs = require('fs');
const path = require('path');

const EMP = process.env.DIAG_EMPRESA_ID || '2dba7739-a922-4de0-bd59-2c4fb5e3e10e';

// Rotas a varrer. `{EMP}` é substituído pelo id da empresa de sandbox.
const ROUTES = [
  // ── Dashboard (colaborador / gestor / rh) ──
  '/dashboard',
  '/dashboard/jornada',
  '/dashboard/temporada',
  '/dashboard/temporada/concluida',
  '/dashboard/temporada/sem14',
  '/dashboard/temporada/semana/1',
  '/dashboard/evolucao',
  '/dashboard/perfil',
  '/dashboard/perfil-comportamental',
  '/dashboard/perfil-comportamental/mapeamento',
  '/dashboard/perfil-comportamental/relatorio',
  '/dashboard/assessment',
  '/dashboard/assessment/chat',
  '/dashboard/pdi',
  '/dashboard/praticar',
  '/dashboard/praticar/evidencia',
  '/dashboard/votacao',
  '/dashboard/gestor',
  '/dashboard/gestor/equipe-evolucao',

  // ── Admin (global) ──
  '/admin/dashboard',
  '/admin/empresas/gerenciar',
  '/admin/empresas/nova',
  '/admin/simulador',
  '/admin/competencias',
  '/admin/conteudos',
  '/admin/videos',
  '/admin/preferencias-aprendizagem',
  '/admin/platform-admins',
  '/admin/permissoes',
  '/admin/auditoria',
  '/admin/lixeira',
  '/admin/fit',
  '/admin/ppp',
  '/admin/top10',
  '/admin/evolucao',
  '/admin/relatorios',
  '/admin/temporadas',
  '/admin/whatsapp',
  '/admin/cargos',
  '/admin/assessment-descritores',

  // ── Admin / radar + vertho ──
  '/admin/radar',
  '/admin/radar/qualidade-dados',
  '/admin/radar/funnel',
  '/admin/radar/funnel-bett',
  '/admin/vertho/simulador-custo',
  '/admin/vertho/orcamento',
  '/admin/vertho/mercado-potencial',
  '/admin/vertho/potencial-cidades',
  '/admin/vertho/radarempresas',
  '/admin/vertho/radarempresas/listas',
  '/admin/vertho/radarempresas/redes',
  '/admin/vertho/evidencias',
  '/admin/vertho/avaliacao-acumulada',
  '/admin/vertho/auditoria-sem14',
  '/admin/vertho/knowledge-base',

  // ── Admin / empresa específica (sandbox) ──
  '/admin/empresas/{EMP}',
  '/admin/empresas/{EMP}/configuracoes',
  '/admin/empresas/{EMP}/fase1',
  '/admin/empresas/{EMP}/fase2',
  '/admin/empresas/{EMP}/fase4',
  '/admin/empresas/{EMP}/relatorios',
  '/admin/empresas/{EMP}/perfis-comportamentais',
  '/admin/empresas/{EMP}/perfil-externo',
  '/admin/empresas/{EMP}/votacao',
  '/admin/empresas/{EMP}/pulso',
].map((r) => r.replace('{EMP}', EMP));

// Ruídos de rede que não são bug do app (analytics/terceiros).
const IGNORE_REQ = [/sentry/i, /vercel-insights/i, /va\.vercel/i, /google-analytics/i, /gtag/i, /bunnycdn|mediadelivery|b-cdn/i];
// Ruídos de console conhecidos.
const IGNORE_CONSOLE = [/Download the React DevTools/i, /\[Fast Refresh\]/i];

test('diagnóstico E2E — crawl de rotas', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);

  const ok = await login(page);
  test.skip(!ok, 'SMOKE_EMAIL/SMOKE_PASS não definidos');

  const outDir = path.join('test-results', 'diagnostico');
  fs.mkdirSync(outDir, { recursive: true });

  const report = [];

  for (const route of ROUTES) {
    const consoleErrors = [];
    const pageErrors = [];
    const badResponses = [];

    const onConsole = (msg) => {
      if (msg.type() !== 'error') return;
      const txt = msg.text();
      if (IGNORE_CONSOLE.some((re) => re.test(txt))) return;
      consoleErrors.push(txt);
    };
    const onPageError = (err) => pageErrors.push(err.message || String(err));
    const onResponse = (res) => {
      const s = res.status();
      if (s < 400) return;
      const url = res.url();
      if (IGNORE_REQ.some((re) => re.test(url))) return;
      badResponses.push(`${s} ${url}`);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    let finalUrl = '';
    let nav = 'ok';
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500); // deixa hidratar + carregar dados client
      finalUrl = page.url();
    } catch (e) {
      nav = `goto-fail: ${e.message}`;
      finalUrl = page.url();
    }

    // Detecções
    const redirectedToLogin = /\/login/.test(finalUrl) && !route.includes('/login');
    const bodyText = (await page.locator('body').innerText().catch(() => '')) || '';
    const errorBoundary = /Application error|Something went wrong|Algo deu errado|erro inesperado ocorreu|client-side exception/i.test(bodyText);

    const slug = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
    const shot = path.join(outDir, `${slug}.png`);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);

    const issues = [];
    if (nav !== 'ok') issues.push(nav);
    if (redirectedToLogin) issues.push('redirecionou pro /login (sem acesso?)');
    if (errorBoundary) issues.push('error-boundary na tela');
    if (pageErrors.length) issues.push(`${pageErrors.length} exceção(ões) JS`);
    if (badResponses.length) issues.push(`${badResponses.length} request(s) >=400`);
    if (consoleErrors.length) issues.push(`${consoleErrors.length} erro(s) de console`);

    report.push({ route, finalUrl, issues, pageErrors, badResponses, consoleErrors });

    const tag = issues.length ? '⚠️ ' : '✅ ';
    console.log(`${tag}${route}${issues.length ? '  →  ' + issues.join('; ') : ''}`);

    // Soft assertions: não aborta o crawl, mas marca o teste como falho se houver
    // problema "duro" (exceção JS, 5xx, ou redirect inesperado pro login).
    expect.soft(pageErrors, `pageerror em ${route}`).toHaveLength(0);
    expect.soft(errorBoundary, `error-boundary em ${route}`).toBeFalsy();
    expect.soft(badResponses.filter((r) => /^5\d\d /.test(r)), `5xx em ${route}`).toHaveLength(0);
    expect.soft(redirectedToLogin, `acesso negado em ${route}`).toBeFalsy();
  }

  // Relatório Markdown
  const comProblema = report.filter((r) => r.issues.length);
  const lines = [];
  lines.push(`# Diagnóstico E2E — ${new Date().toISOString()}`);
  lines.push(`Base: ${process.env.PLAYWRIGHT_BASE_URL || 'https://vertho.ai'}`);
  lines.push(`Rotas visitadas: ${report.length} · com problema: ${comProblema.length}`);
  lines.push('');
  for (const r of report) {
    lines.push(`## ${r.issues.length ? '⚠️' : '✅'} ${r.route}`);
    if (r.finalUrl && !r.finalUrl.endsWith(r.route)) lines.push(`- urlFinal: ${r.finalUrl}`);
    for (const e of r.pageErrors) lines.push(`- JS: ${e}`);
    for (const e of r.badResponses) lines.push(`- HTTP: ${e}`);
    for (const e of r.consoleErrors.slice(0, 5)) lines.push(`- console: ${e}`);
    lines.push('');
  }
  const reportPath = path.join(outDir, 'RELATORIO.md');
  fs.writeFileSync(reportPath, lines.join('\n'));
  console.log(`\n📄 Relatório: ${reportPath} · screenshots em ${outDir}/`);
  console.log(`Resumo: ${report.length} rotas, ${comProblema.length} com problema.`);
});
