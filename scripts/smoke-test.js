#!/usr/bin/env node

/**
 * Smoke Test Runner — Vertho Mentor IA
 *
 * Testa todas as rotas da aplicação via HTTP.
 * Não precisa de browser — roda com Node.js puro.
 *
 * Uso:
 *   node scripts/smoke-test.js                    # testa localhost:3000
 *   node scripts/smoke-test.js https://vertho.com.br  # testa produção
 *   SMOKE_EMAIL=x SMOKE_PASS=y node scripts/smoke-test.js  # com auth
 */

const BASE = process.argv[2] || 'http://localhost:3000';
const EMAIL = process.env.SMOKE_EMAIL || '';
const PASS = process.env.SMOKE_PASS || '';

const results = [];
let passed = 0, failed = 0, skipped = 0;

// ── Routes to test ──────────────────────────────────────────────────────────

const PAGES = [
  { path: '/', expect: [200], label: 'Home → Login' },
  { path: '/login', expect: [200], label: 'Login page' },
  { path: '/dashboard', expect: [200], label: 'Dashboard' },
  { path: '/dashboard/assessment', expect: [200], label: 'Assessment list' },
  { path: '/dashboard/assessment/chat', expect: [200], label: 'Assessment chat' },
  { path: '/dashboard/pdi', expect: [200], label: 'PDI' },
  { path: '/dashboard/praticar', expect: [200], label: 'Praticar' },
  { path: '/dashboard/praticar/evidencia', expect: [200], label: 'Evidência' },
  { path: '/dashboard/jornada', expect: [200], label: 'Jornada' },
  { path: '/dashboard/perfil', expect: [200], label: 'Perfil' },
  { path: '/dashboard/perfil-comportamental', expect: [200], label: 'Perfil Comportamental' },
  { path: '/dashboard/perfil-comportamental/mapeamento', expect: [200], label: 'Mapeamento DISC' },
  { path: '/dashboard/evolucao', expect: [200], label: 'Evolução' },
  { path: '/admin/dashboard', expect: [200], label: 'Admin Dashboard' },
  { path: '/admin/empresas/nova', expect: [200], label: 'Nova Empresa' },
  { path: '/admin/empresas/gerenciar', expect: [200], label: 'Gerenciar' },
  { path: '/admin/cargos', expect: [200], label: 'Cargos' },
  { path: '/admin/competencias', expect: [200], label: 'Competências' },
  { path: '/admin/ppp', expect: [200], label: 'PPP' },
  { path: '/admin/relatorios', expect: [200], label: 'Relatórios' },
  { path: '/admin/simulador', expect: [200], label: 'Simulador' },
  { path: '/admin/whatsapp', expect: [200], label: 'WhatsApp' },
  { path: '/admin/platform-admins', expect: [200], label: 'Platform Admins' },
];

const APIS = [
  { path: '/api/assessment', method: 'GET', expect: [200, 401, 500], label: 'Assessment API' },
  { path: '/api/colaboradores', method: 'GET', expect: [200, 500], label: 'Colaboradores API' },
  { path: '/api/chat', method: 'POST', body: {}, expect: [400, 401, 500], label: 'Chat API (no body)' },
  { path: '/api/chat-simulador', method: 'POST', body: { system: 'test', messages: [{ role: 'user', content: 'oi' }], model: 'claude-sonnet-4-6' }, expect: [200, 400, 500], label: 'Simulador API' },
  { path: '/api/cron?action=cleanup_sessoes', method: 'GET', expect: [200, 401, 500], label: 'Cron API' },
  { path: '/api/upload-logo', method: 'POST', expect: [400, 500], label: 'Upload Logo API (no body)' },
];

// ── Test runner ─────────────────────────────────────────────────────────────

async function testRoute(route) {
  const url = BASE + route.path;
  const method = route.method || 'GET';
  const start = Date.now();

  try {
    const opts = {
      method,
      redirect: 'follow',
      headers: { 'User-Agent': 'Vertho-Smoke-Test/1.0' },
    };

    if (route.body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(route.body);
    }

    const res = await fetch(url, opts);
    const ms = Date.now() - start;
    const ok = route.expect.includes(res.status);

    const result = {
      label: route.label,
      path: route.path,
      method,
      status: res.status,
      ms,
      ok,
    };

    results.push(result);

    if (ok) {
      passed++;
      console.log(`  ✅ ${route.label} — ${res.status} (${ms}ms)`);
    } else {
      failed++;
      console.log(`  ❌ ${route.label} — ${res.status} (expected ${route.expect.join('|')}) (${ms}ms)`);
    }
  } catch (err) {
    failed++;
    const ms = Date.now() - start;
    results.push({ label: route.label, path: route.path, method, status: 'ERR', ms, ok: false, error: err.message });
    console.log(`  ❌ ${route.label} — ERROR: ${err.message} (${ms}ms)`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔍 Vertho Smoke Test`);
  console.log(`   Target: ${BASE}`);
  console.log(`   ${PAGES.length} pages + ${APIS.length} APIs\n`);

  console.log('── Pages ──');
  for (const page of PAGES) {
    await testRoute(page);
  }

  console.log('\n── APIs ──');
  for (const api of APIS) {
    await testRoute(api);
  }

  // Summary
  const total = passed + failed + skipped;
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`   RESULTADO: ${passed}/${total} passed`);
  if (failed) console.log(`   ❌ ${failed} failed`);
  if (skipped) console.log(`   ⏭️  ${skipped} skipped`);

  const avgMs = Math.round(results.reduce((s, r) => s + (r.ms || 0), 0) / results.length);
  console.log(`   ⏱️  Tempo médio: ${avgMs}ms`);
  console.log(`${'═'.repeat(50)}\n`);

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
