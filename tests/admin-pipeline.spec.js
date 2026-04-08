const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

/**
 * Admin pipeline page (/admin/empresas/[id]).
 * Tests phase accordion, action buttons, model picker, danger zone.
 */

test.describe('Admin Pipeline', () => {
  /** @type {string} */
  let empresaUrl;

  test.beforeEach(async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }

    // Navigate to admin dashboard and find the first empresa
    await page.goto('/admin/dashboard', { timeout: 15000 });
    const painel = page.getByText('Painel Admin');
    if (!(await painel.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(); return; // not an admin
    }

    // Click the first empresa pipeline button
    const empresaBtn = page.locator('button:has-text("Clique para ver o pipeline")').first();
    if (!(await empresaBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(); return;
    }
    await empresaBtn.click();
    await page.waitForURL('**/admin/empresas/**', { timeout: 15000 });
    empresaUrl = page.url();
  });

  test('pipeline page loads with phases 0-5', async ({ page }) => {
    await expect(page.getByText('Fase 0')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Fase 1')).toBeVisible();
    await expect(page.getByText('Fase 2')).toBeVisible();
    await expect(page.getByText('Fase 3')).toBeVisible();
    await expect(page.getByText('Fase 4')).toBeVisible();
    await expect(page.getByText('Fase 5')).toBeVisible();
  });

  test('clicking a phase expands it and shows action buttons', async ({ page }) => {
    // Click on Fase 0 header
    const fase0 = page.locator('button:has-text("Fase 0")').first();
    await fase0.click();
    // Should show action buttons within the expanded area
    await expect(page.locator('text=Cadastro').first()).toBeVisible({ timeout: 5000 });
  });

  test('Fase 0 shows Cadastro, Moodle, Sistema groups', async ({ page }) => {
    const fase0 = page.locator('button:has-text("Fase 0")').first();
    await fase0.click();
    await expect(page.locator('text=Cadastro').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Moodle').first()).toBeVisible();
    await expect(page.locator('text=Sistema').first()).toBeVisible();
  });

  test('Fase 1 shows IA1, IA2, IA3 buttons', async ({ page }) => {
    const fase1 = page.locator('button:has-text("Fase 1")').first();
    await fase1.click();
    await expect(page.locator('text=IA1').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=IA2').first()).toBeVisible();
    await expect(page.locator('text=IA3').first()).toBeVisible();
  });

  test('clicking an AI button shows model picker modal', async ({ page }) => {
    const fase1 = page.locator('button:has-text("Fase 1")').first();
    await fase1.click();
    await page.waitForTimeout(500);

    // Click IA1 button (it has ai: true so shows model picker)
    const ia1Btn = page.locator('button:has-text("IA1")').first();
    await ia1Btn.click();

    // Model picker modal should appear
    await expect(page.locator('text=Selecione o modelo de IA')).toBeVisible({ timeout: 5000 });
  });

  test('model picker shows 4 models', async ({ page }) => {
    const fase1 = page.locator('button:has-text("Fase 1")').first();
    await fase1.click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("IA1")').first().click();

    await expect(page.locator('text=Selecione o modelo de IA')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Claude Sonnet 4.6')).toBeVisible();
    await expect(page.locator('text=Claude Opus 4.6')).toBeVisible();
    await expect(page.locator('text=Gemini 3 Flash')).toBeVisible();
    await expect(page.locator('text=Gemini 3.1 Pro')).toBeVisible();
  });

  test('cancel button closes model picker', async ({ page }) => {
    const fase1 = page.locator('button:has-text("Fase 1")').first();
    await fase1.click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("IA1")').first().click();

    await expect(page.locator('text=Selecione o modelo de IA')).toBeVisible({ timeout: 5000 });
    await page.locator('button:has-text("Cancelar")').click();
    await expect(page.locator('text=Selecione o modelo de IA')).not.toBeVisible({ timeout: 3000 });
  });

  test('Configuracoes link navigates to config page', async ({ page }) => {
    const fase0 = page.locator('button:has-text("Fase 0")').first();
    await fase0.click();
    await page.waitForTimeout(500);

    // Configuracoes is a link action in Fase 0 > Sistema
    const configLink = page.locator('a:has-text("Configurações")').first();
    if (!(await configLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(); return;
    }
    await configLink.click();
    await page.waitForURL('**/configuracoes', { timeout: 15000 });
    await expect(page.locator('text=Configurações').first()).toBeVisible();
  });

  test('Fase 2 shows form/email/whatsapp buttons', async ({ page }) => {
    const fase2 = page.locator('button:has-text("Fase 2")').first();
    await fase2.click();
    await expect(page.locator('text=Gerar Forms').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Disparar E-mails').first()).toBeVisible();
    await expect(page.locator('text=WhatsApp').first()).toBeVisible();
  });

  test('Fase 3 shows IA4, Check, Relatorios buttons', async ({ page }) => {
    const fase3 = page.locator('button:has-text("Fase 3")').first();
    await fase3.click();
    await expect(page.locator('text=Rodar IA4').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Check Avaliações').first()).toBeVisible();
    await expect(page.locator('text=Relatórios').first()).toBeVisible();
  });

  test('Configuracoes avancadas expands danger zone', async ({ page }) => {
    const advancedBtn = page.locator('button:has-text("Configurações avançadas")');
    await advancedBtn.click();
    await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });
  });

  test('danger zone shows cleanup buttons and collaborator selector', async ({ page }) => {
    await page.locator('button:has-text("Configurações avançadas")').click();
    await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });

    // Cleanup buttons
    await expect(page.locator('button:has-text("Limpar competências")').first()).toBeVisible();
    await expect(page.locator('button:has-text("LIMPAR TUDO")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Excluir Empresa Permanentemente")').first()).toBeVisible();

    // Collaborator scope selector
    await expect(page.locator('text=Escopo da limpeza').first()).toBeVisible();
    const scopeSelect = page.locator('select').filter({ has: page.locator('option:has-text("Todos os colaboradores")') }).first();
    await expect(scopeSelect).toBeVisible();
  });
});
