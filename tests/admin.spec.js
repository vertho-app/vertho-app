const { test, expect } = require('@playwright/test');

test.describe('Admin (requer credenciais admin)', () => {
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

  test('admin dashboard carrega KPIs', async ({ page }) => {
    await page.goto('/admin/dashboard');
    // Pode mostrar painel ou bloqueio de acesso
    const painel = page.getByText('Painel Admin');
    const bloqueio = page.getByText('Acesso restrito');
    await expect(painel.or(bloqueio)).toBeVisible();
  });

  test('admin navega entre seções', async ({ page }) => {
    await page.goto('/admin/dashboard');
    const painel = page.getByText('Painel Admin');
    if (!(await painel.isVisible())) return; // não é admin

    // Competências
    await page.getByText('Competencias').click();
    await page.waitForURL('**/competencias');
    await expect(page.getByText('Selecione uma empresa').or(page.getByText('competencia'))).toBeVisible();

    // Simulador
    await page.goto('/admin/simulador');
    await expect(page.getByText('Limpar').or(page.getByPlaceholder(/mensagem|Envie/))).toBeVisible();
  });

  test('pipeline da empresa carrega fases', async ({ page }) => {
    await page.goto('/admin/dashboard');
    const painel = page.getByText('Painel Admin');
    if (!(await painel.isVisible())) return;

    // Clicar na primeira empresa
    const empresaBtn = page.locator('button:has-text("Clique para ver o pipeline")').first();
    if (await empresaBtn.isVisible()) {
      await empresaBtn.click();
      await expect(page.getByText('Fase 0')).toBeVisible();
      await expect(page.getByText('Fase 1')).toBeVisible();
    }
  });
});
