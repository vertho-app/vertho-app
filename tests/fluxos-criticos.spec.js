// Fluxos críticos E2E — jornadas ponta-a-ponta (read-mostly).
//
// EXCLUI de propósito ações com CUSTO (geração de IA, render/baixa de PDF) e
// ENVIOS (WhatsApp/email). Foca em navegação + telas que carregam dados +
// guardas de regressão (ex.: a home do gestor não pode mais cair no error
// boundary). Não submete mapeamento (o save dispara IA em background).
//
// Uso:
//   PLAYWRIGHT_BASE_URL=https://teste-piloto.vertho.ai \
//   SMOKE_EMAIL=... SMOKE_PASS=... DIAG_EMPRESA_ID=<uuid> \
//   npx playwright test tests/fluxos-criticos.spec.js

const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

const EMP = process.env.DIAG_EMPRESA_ID || '2dba7739-a922-4de0-bd59-2c4fb5e3e10e';

// Garante que a rota carregou saudável: não voltou pro login, sem error-boundary.
async function assertSaudavel(page, route) {
  await expect(page, `redirecionou pro login em ${route}`).not.toHaveURL(/\/login/);
  const corpo = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(/Algo deu errado|erro inesperado ocorreu|Application error|client-side exception/i.test(corpo),
    `error-boundary em ${route}`).toBeFalsy();
}

test.describe.configure({ mode: 'serial' });

test.describe('Fluxos críticos (sem custo/envios)', () => {
  test.beforeEach(async ({ page }) => {
    const ok = await login(page);
    test.skip(!ok, 'SMOKE_EMAIL/SMOKE_PASS não definidos');
  });

  test('colaborador: login → navegação → entrada do mapeamento', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    await assertSaudavel(page, '/dashboard');

    // Navega por telas de leitura (sem disparar geração de IA).
    for (const r of ['/dashboard/jornada', '/dashboard/perfil', '/dashboard/evolucao']) {
      await page.goto(r, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1200);
      await assertSaudavel(page, r);
    }

    // Entrada do mapeamento (tela de instruções) — NÃO submete (save = IA).
    await page.goto('/dashboard/perfil-comportamental/mapeamento', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await assertSaudavel(page, '/mapeamento');
  });

  test('gestor/RH: home do gestor + evolução da equipe (guarda do crash)', async ({ page }) => {
    await page.goto('/dashboard/gestor', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await assertSaudavel(page, '/dashboard/gestor'); // regressão: timeline shadowing
    await expect(page).toHaveURL(/\/dashboard\/gestor/);

    await page.goto('/dashboard/gestor/equipe-evolucao', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await assertSaudavel(page, '/dashboard/gestor/equipe-evolucao');
  });

  test('admin: pipeline da empresa carrega (sem rodar ações)', async ({ page }) => {
    await page.goto(`/admin/empresas/${EMP}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await assertSaudavel(page, `/admin/empresas/${EMP}`);
    await expect(page).toHaveURL(new RegExp(`/admin/empresas/${EMP}`));
    // NÃO clica em botões de ação (IA1/IA2, envios, exclusões) — fora do escopo.
  });
});
