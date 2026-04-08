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

  test('bottom nav funciona', async ({ page }) => {
    // Jornada
    await page.getByText('Jornada').click();
    await page.waitForURL('**/jornada');

    // Praticar
    await page.getByText('Praticar').click();
    await page.waitForURL('**/praticar');

    // Perfil
    await page.getByText('Perfil').click();
    await page.waitForURL('**/perfil');

    // Início
    await page.getByText('Início').click();
    await page.waitForURL('**/dashboard');
  });

  test('assessment lista competências', async ({ page }) => {
    await page.getByText('Competências').click();
    await page.waitForURL('**/assessment');
    // Deve mostrar título ou empty state
    const titulo = page.getByText('Suas Competências');
    const empty = page.getByText('Nenhuma competência');
    await expect(titulo.or(empty)).toBeVisible();
  });

  test('perfil comportamental mostra resultado ou mapeamento', async ({ page }) => {
    await page.goto('/dashboard/perfil-comportamental');
    // Deve mostrar perfil DISC ou botão de mapeamento
    const perfil = page.getByText('Dominância');
    const mapear = page.getByText('Iniciar Mapeamento');
    const semPerfil = page.getByText('Mapeamento Comportamental');
    await expect(perfil.or(mapear).or(semPerfil).first()).toBeVisible();
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
