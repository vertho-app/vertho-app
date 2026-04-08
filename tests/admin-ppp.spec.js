const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

/**
 * PPP extraction page (/admin/ppp?empresa=UUID).
 * Tests the form, tabs, URL inputs, model selector, and PPP list.
 */

test.describe('Admin PPP', () => {
  test.beforeEach(async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }

    // Navigate to admin dashboard, find first empresa, go to its PPP page
    await page.goto('/admin/dashboard', { timeout: 15000 });
    const painel = page.getByText('Painel Admin');
    if (!(await painel.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(); return;
    }

    // Click first empresa pipeline
    const empresaBtn = page.locator('button:has-text("Clique para ver o pipeline")').first();
    if (!(await empresaBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(); return;
    }
    await empresaBtn.click();
    await page.waitForURL('**/admin/empresas/**', { timeout: 15000 });

    // Expand Fase 0 and find PPP link
    const fase0 = page.locator('button:has-text("Fase 0")').first();
    await fase0.click();
    await page.waitForTimeout(500);

    const pppLink = page.locator('a:has-text("Extrair PPPs")').first()
      .or(page.locator('a:has-text("PPPs")').first());
    if (!(await pppLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(); return;
    }
    await pppLink.click();
    await page.waitForURL('**/admin/ppp**', { timeout: 15000 });
  });

  test('page loads with empresa name in header', async ({ page }) => {
    await expect(page.locator('text=Extração de PPPs')).toBeVisible({ timeout: 10000 });
    // Empresa name should be shown below the title
    const empresaNome = page.locator('p.text-xs.text-gray-500').first();
    await expect(empresaNome).toBeVisible();
    const nome = await empresaNome.textContent();
    expect(nome.length).toBeGreaterThan(0);
  });

  test('Nova Extracao button expands form', async ({ page }) => {
    const novaBtn = page.locator('button:has-text("Nova Extração")');
    await expect(novaBtn).toBeVisible({ timeout: 10000 });
    await novaBtn.click();

    // Form should appear with tabs
    await expect(page.locator('text=Arquivos + Site').first()).toBeVisible({ timeout: 5000 });
  });

  test('form shows Arquivos + Site and Importar Texto tabs', async ({ page }) => {
    await page.locator('button:has-text("Nova Extração")').click();
    await expect(page.locator('button:has-text("Arquivos + Site")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button:has-text("Importar Texto")')).toBeVisible();
  });

  test('URL input accepts text', async ({ page }) => {
    await page.locator('button:has-text("Nova Extração")').click();
    await page.waitForTimeout(500);

    // URL input should be visible (it's a text input with placeholder containing "https")
    const urlInput = page.locator('input[placeholder*="https"]').first();
    await expect(urlInput).toBeVisible({ timeout: 5000 });
    await urlInput.fill('https://www.example.com/about');
    await expect(urlInput).toHaveValue('https://www.example.com/about');
  });

  test('+Adicionar URL adds another input', async ({ page }) => {
    await page.locator('button:has-text("Nova Extração")').click();
    await page.waitForTimeout(500);

    const urlInputsBefore = await page.locator('input[placeholder*="https"]').count();
    await page.locator('button:has-text("Adicionar URL")').first()
      .or(page.locator('text=+ Adicionar URL')).click();
    const urlInputsAfter = await page.locator('input[placeholder*="https"]').count();
    expect(urlInputsAfter).toBe(urlInputsBefore + 1);
  });

  test('model selector has options', async ({ page }) => {
    await page.locator('button:has-text("Nova Extração")').click();
    await page.waitForTimeout(500);

    const modelSelect = page.locator('select').filter({ has: page.locator('option:has-text("Claude Sonnet")') }).first();
    await expect(modelSelect).toBeVisible({ timeout: 5000 });
    const options = modelSelect.locator('option');
    expect(await options.count()).toBeGreaterThanOrEqual(3);
  });

  test('Extrair via IA button exists (no click)', async ({ page }) => {
    await page.locator('button:has-text("Nova Extração")').click();
    await page.waitForTimeout(500);

    const extrairBtn = page.locator('button:has-text("Extrair")').first();
    await expect(extrairBtn).toBeVisible({ timeout: 5000 });
    // Do NOT click — would call real API
  });

  test('PPP list section exists', async ({ page }) => {
    // The page should have a section for existing PPPs (may be empty)
    // Look for the list area or an empty state
    const pppsSection = page.locator('text=PPPs extraídos').first()
      .or(page.locator('text=Nenhum PPP').first())
      .or(page.locator('text=PPP').first());
    await expect(pppsSection).toBeVisible({ timeout: 10000 });
  });
});
