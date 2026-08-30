const { test, expect } = require('@playwright/test');

test.describe('Navegação pública', () => {
  test('home redireciona para login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login exibe branding Vertho', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Sua jornada de desenvolvimento')).toBeVisible();
  });
});

test.describe('Navegação autenticada', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.SMOKE_EMAIL;
    const pass = process.env.SMOKE_PASS;
    if (!email || !pass) { test.skip(); return; }

    await page.goto('/login');
    await page.getByText('Entrar com senha').click();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(pass);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('dashboard carrega', async ({ page }) => {
    // Hero card ou qualquer elemento do dashboard
    await expect(page.locator('text=/evolução|Próximo Passo|Acesso/i').first()).toBeVisible();
  });

  test('navegação lateral funciona (visão RH)', async ({ page }) => {
    // 30/08: o teste antigo ("bottom nav": Jornada/Praticar/Perfil) era do
    // layout de COLABORADOR; a conta de smoke é RH e a sidebar dela tem outros
    // itens. As rotas de colaborador seguem cobertas por URL no
    // fluxos-criticos.spec.js; conta colaboradora de smoke fica para a fase 2.
    await page.getByRole('button', { name: 'Equipe' }).click();
    await page.waitForURL('**/gestor**');

    // exact: o avatar também é botão "Perfil de Smoke E2E" (strict mode, 30/08)
    await page.getByRole('button', { name: 'Perfil', exact: true }).click();
    await page.waitForURL('**/perfil');

    await page.getByRole('button', { name: 'Início', exact: true }).click();
    await page.waitForURL('**/dashboard');
  });

  test('assessment lista competências', async ({ page }) => {
    await page.goto('/dashboard/assessment');
    await expect(page.locator('text=/Suas Competências|Nenhuma competência|Avaliação/i').first()).toBeVisible();
  });

  test('perfil comportamental mostra resultado ou mapeamento', async ({ page }) => {
    await page.goto('/dashboard/perfil-comportamental');
    await expect(page.locator('text=/Dominância|Iniciar Mapeamento|Mapeamento Comportamental/i').first()).toBeVisible();
  });

  test('BETO chat abre e responde', async ({ page }) => {
    await page.getByText('BETO').click();
    await expect(page.getByPlaceholder('Pergunte ao BETO')).toBeVisible();
    await page.getByPlaceholder('Pergunte ao BETO').fill('Olá');
    await page.locator('button[type="submit"]').last().click();
    // Esperar resposta (pode demorar com API real)
    await expect(page.locator('.bg-white\\/\\[0\\.06\\]').last()).toBeVisible({ timeout: 15000 });
  });
});
