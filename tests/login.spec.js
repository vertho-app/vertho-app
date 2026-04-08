const { test, expect } = require('@playwright/test');

test.describe('Login', () => {
  test('página carrega com formulário', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('toggle entre Magic Link e senha', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="password"]')).not.toBeVisible();
    await page.getByText('Entrar com senha').click();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await page.getByText('Entrar com Magic Link').click();
    await expect(page.locator('input[type="password"]')).not.toBeVisible();
  });

  test('login com senha (se credenciais configuradas)', async ({ page }) => {
    const email = process.env.SMOKE_EMAIL;
    const pass = process.env.SMOKE_PASS;
    if (!email || !pass) { test.skip(); return; }

    await page.goto('/login');
    await page.getByText('Entrar com senha').click();
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(pass);
    await page.getByText('Entrar com senha').click();

    // Deve redirecionar para dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await expect(page.getByText('Vamos continuar sua evolução')).toBeVisible();
  });
});
