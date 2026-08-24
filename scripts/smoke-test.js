#!/usr/bin/env node

/**
 * Smoke Test Runner — Vertho Mentor IA
 *
 * Testa as rotas da aplicação via HTTP, SEM sessão. Roda no CI a cada push
 * (`.github/workflows/smoke-test.yml`) contra produção — é o único check que
 * exercita o app de verdade.
 *
 * ⚠️ REESCRITO EM 10/08/2026 (F11 da auditoria). A versão anterior não conseguia
 * falhar em três frentes independentes:
 *
 *  1. **`redirect: 'follow'` com `expect: [200]` em TODAS as páginas.** Uma rota
 *     protegida que joga o visitante no `/login` devolve 200 depois de seguir o
 *     redirect — indistinguível de "a página carregou". Num apagão de auth (o
 *     laço `/rota` ↔ `/login` já aconteceu em produção em 22/07) o smoke
 *     reportaria 29/29 e o GitHub ficaria verde. O refutador da auditoria
 *     reproduziu: `/admin/dashboard` devolvendo 200 em `login?redirect=...`.
 *  2. **`500` estava na lista de status esperados de 6 APIs.** Erro de servidor
 *     não é resultado aceitável em nenhum check.
 *  3. **`sleep 90` no workflow** para esperar o deploy, com build de ~2 min: o
 *     smoke media o deployment ANTERIOR. Agora `--aguardar-sha` espera
 *     `/api/version` devolver o commit certo antes de começar.
 *
 * Cada rota declara o que se espera SEM SESSÃO — medido contra produção em
 * 10/08: `/` e `/admin/*` respondem 307 para `/login`; `/login` e `/dashboard/*`
 * respondem 200 (o gate do dashboard é client-side); as APIs respondem 401/400.
 * Se um `/admin/*` passar a responder 200 sem sessão, isso é um furo de auth e
 * este arquivo acusa. Se um `/dashboard/*` passar a responder 307, é o laço.
 *
 * Uso:
 *   node scripts/smoke-test.js                          # localhost:3000
 *   node scripts/smoke-test.js https://app.vertho.ai    # produção
 *   node scripts/smoke-test.js https://app.vertho.ai --aguardar-sha <sha>
 */

const args = process.argv.slice(2);
const BASE = args.find((a) => !a.startsWith('--')) || 'http://localhost:3000';
const shaIdx = args.indexOf('--aguardar-sha');
const SHA_ESPERADO = shaIdx >= 0 ? args[shaIdx + 1] : null;

const results = [];
let passed = 0, failed = 0;

// ── O que se espera SEM sessão ──────────────────────────────────────────────
// `paraLogin: true` = tem que redirecionar para /login. É o oposto de aceitar
// 200 depois de seguir o redirect: aqui, chegar em /login com 200 é FALHA.

const paginaProtegidaAdmin = (path, label) => ({ path, status: [307, 302], paraLogin: true, label });
const paginaDashboard = (path, label) => ({ path, status: [200], label });

const PAGES = [
  { path: '/', status: [307, 302], paraLogin: true, label: 'Home → Login' },
  { path: '/login', status: [200], label: 'Login page' },

  // O gate destas é client-side: o servidor entrega o shell com 200. Se virarem
  // 307 para /login, é o laço `/rota` ↔ `/login`.
  paginaDashboard('/dashboard', 'Dashboard'),
  paginaDashboard('/dashboard/assessment', 'Assessment list'),
  paginaDashboard('/dashboard/assessment/chat', 'Assessment chat'),
  paginaDashboard('/dashboard/pdi', 'PDI'),
  paginaDashboard('/dashboard/praticar', 'Praticar'),
  paginaDashboard('/dashboard/praticar/evidencia', 'Evidência'),
  paginaDashboard('/dashboard/jornada', 'Jornada'),
  paginaDashboard('/dashboard/perfil', 'Perfil'),
  paginaDashboard('/dashboard/perfil-comportamental', 'Perfil Comportamental'),
  paginaDashboard('/dashboard/perfil-comportamental/mapeamento', 'Mapeamento DISC'),
  paginaDashboard('/dashboard/evolucao', 'Evolução'),

  // 🔴 O comentário anterior dizia "o proxy barra no servidor" — e isso é FALSO.
  // Quem redireciona `/admin` e `/admin-v2` sem sessão é o LAYOUT de cada área
  // (server component), não o proxy. A diferença importa: se alguém escrever uma
  // página de admin fora do layout, o proxy não a protege — e o comentário
  // dizia que sim. O check continua o mesmo; a explicação é que estava errada.
  // 200 aqui = furo de autorização.
  paginaProtegidaAdmin('/admin/dashboard', 'Admin Dashboard'),
  paginaProtegidaAdmin('/admin/empresas/nova', 'Nova Empresa'),
  paginaProtegidaAdmin('/admin/empresas/gerenciar', 'Gerenciar'),
  paginaProtegidaAdmin('/admin/cargos', 'Cargos'),
  paginaProtegidaAdmin('/admin/competencias', 'Competências'),
  paginaProtegidaAdmin('/admin/ppp', 'PPP'),
  paginaProtegidaAdmin('/admin/relatorios', 'Relatórios'),
  paginaProtegidaAdmin('/admin/simulador', 'Simulador'),
  paginaProtegidaAdmin('/admin/whatsapp', 'WhatsApp'),
  paginaProtegidaAdmin('/admin/platform-admins', 'Platform Admins'),

  // `/admin-v2` (E10 da auditoria 22/08): o smoke cobria 10 páginas de `/admin`
  // e ZERO da área nova — que já leva a caixa de entrada do WhatsApp, com
  // conversa de gente real. Área nova sem check é área que só ganha check depois
  // do primeiro incidente.
  paginaProtegidaAdmin('/admin-v2', 'Admin v2 (home)'),
  paginaProtegidaAdmin('/admin-v2/clientes', 'Admin v2 · Clientes'),
  paginaProtegidaAdmin('/admin-v2/cliente', 'Admin v2 · Cliente'),
  paginaProtegidaAdmin('/admin-v2/conteudo', 'Admin v2 · Conteúdo'),
  paginaProtegidaAdmin('/admin-v2/inbox', 'Admin v2 · Inbox'),
  paginaProtegidaAdmin('/admin-v2/em-breve', 'Admin v2 · Em breve'),
];

// Sem sessão, o certo é 401 (ou 400 quando o corpo é inválido). `500` NÃO entra
// em lista de esperados — era o que fazia o check aceitar o servidor quebrado.
const APIS = [
  { path: '/api/version', method: 'GET', status: [200], label: 'Version API (público)' },
  { path: '/api/assessment', method: 'GET', status: [401], label: 'Assessment API' },
  { path: '/api/colaboradores', method: 'GET', status: [401, 403], label: 'Colaboradores API' },
  { path: '/api/chat', method: 'POST', body: {}, status: [400, 401, 403], label: 'Chat API (no body)' },
  { path: '/api/chat-simulador', method: 'POST', body: { system: 'test', messages: [{ role: 'user', content: 'oi' }], model: 'claude-sonnet-4-6' }, status: [400, 401, 403], label: 'Simulador API' },
  { path: '/api/cron?action=cleanup_sessoes', method: 'GET', status: [401], label: 'Cron API' },
  { path: '/api/upload-logo', method: 'POST', status: [400, 401, 403], label: 'Upload Logo API (no body)' },
];

// ── Runner ──────────────────────────────────────────────────────────────────

async function testRoute(route) {
  const url = BASE + route.path;
  const method = route.method || 'GET';
  const start = Date.now();

  try {
    const opts = {
      method,
      redirect: 'manual',   // o redirect é o SINAL, não um detalhe a atravessar
      headers: { 'User-Agent': 'Vertho-Smoke-Test/2.0' },
    };
    if (route.body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(route.body);
    }

    const res = await fetch(url, opts);
    const ms = Date.now() - start;
    const location = res.headers.get('location') || '';

    let ok = route.status.includes(res.status);
    let motivo = ok ? '' : `status ${res.status}, esperado ${route.status.join('|')}`;

    if (ok && route.paraLogin && !/\/login(\?|$)/.test(location)) {
      ok = false;
      motivo = `redireciona para "${location || '(nenhum)'}" em vez de /login`;
    }
    if (ok && !route.paraLogin && /\/login(\?|$)/.test(location)) {
      ok = false;
      motivo = `caiu no /login — rota que deveria responder direto`;
    }
    if (res.status >= 500) {
      ok = false;
      motivo = `${res.status} — erro de servidor nunca é resultado esperado`;
    }

    results.push({ label: route.label, path: route.path, method, status: res.status, ms, ok, motivo });
    if (ok) {
      passed++;
      console.log(`  ✅ ${route.label} — ${res.status}${location ? ` → ${location}` : ''} (${ms}ms)`);
    } else {
      failed++;
      console.log(`  ❌ ${route.label} — ${motivo} (${ms}ms)`);
    }
  } catch (err) {
    failed++;
    const ms = Date.now() - start;
    results.push({ label: route.label, path: route.path, method, status: 'ERR', ms, ok: false, error: err.message });
    console.log(`  ❌ ${route.label} — ERROR: ${err.message} (${ms}ms)`);
  }
}

/**
 * Espera o deployment do commit certo entrar no ar. Sem isto, o check pode
 * medir a versão anterior e chamar de verde — foi o que o `sleep 90` fazia.
 */
async function aguardarSha(sha, timeoutMs = 300000) {
  const alvo = String(sha).slice(0, 40);
  const ate = Date.now() + timeoutMs;
  let visto = '(nenhum)';
  console.log(`⏳ Aguardando ${alvo.slice(0, 8)} entrar no ar em ${BASE} …`);
  while (Date.now() < ate) {
    try {
      const r = await fetch(`${BASE}/api/version`, { headers: { 'Cache-Control': 'no-cache' } });
      if (r.ok) {
        const j = await r.json();
        visto = j.sha || '(sem sha)';
        if (visto === alvo) {
          console.log(`✅ No ar: ${visto.slice(0, 8)}\n`);
          return true;
        }
      }
    } catch { /* deployment trocando: tenta de novo */ }
    await new Promise((r) => setTimeout(r, 10000));
  }
  console.log(`\n❌ Timeout: ${BASE} ainda serve ${String(visto).slice(0, 8)}, esperado ${alvo.slice(0, 8)}.`);
  console.log('   O smoke NÃO roda contra a versão errada — isso seria um verde sobre código que não está no ar.');
  return false;
}

async function main() {
  console.log(`\n🔍 Vertho Smoke Test`);
  console.log(`   Alvo: ${BASE}`);
  console.log(`   ${PAGES.length} páginas + ${APIS.length} APIs (sem sessão)\n`);

  if (SHA_ESPERADO && !(await aguardarSha(SHA_ESPERADO))) process.exit(1);

  console.log('── Páginas ──');
  for (const page of PAGES) await testRoute(page);

  console.log('\n── APIs ──');
  for (const api of APIS) await testRoute(api);

  const total = passed + failed;
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`   RESULTADO: ${passed}/${total} passed`);
  if (failed) {
    console.log(`   ❌ ${failed} failed`);
    for (const r of results.filter((x) => !x.ok)) console.log(`      · ${r.label}: ${r.motivo || r.error}`);
  }
  const avgMs = Math.round(results.reduce((s, r) => s + (r.ms || 0), 0) / (results.length || 1));
  console.log(`   ⏱️  Tempo médio: ${avgMs}ms`);
  console.log(`${'═'.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
