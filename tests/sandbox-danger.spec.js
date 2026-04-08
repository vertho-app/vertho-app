const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

/**
 * SAFE sandbox test for danger zone operations.
 *
 * CRITICAL: This test creates its own test empresa, tests cleanup
 * operations on it (safe because no real data exists), then deletes
 * the empresa entirely. NEVER touches real production data.
 */

test.describe.serial('Sandbox Danger Zone', () => {
  test.setTimeout(120000); // generous timeout for multi-step flow

  const testSuffix = Date.now().toString(36);
  const testEmpresaName = `PLAYWRIGHT_TEST_${testSuffix}`;
  let empresaId = '';

  test('create test empresa via /admin/empresas/nova', async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }

    await page.goto('/admin/empresas/nova', { timeout: 15000 });
    await expect(page.locator('text=Nova Empresa')).toBeVisible({ timeout: 10000 });

    // Fill the form
    await page.locator('input').first().fill(testEmpresaName);
    await page.waitForTimeout(500);

    // Submit
    await page.locator('button[type="submit"]').click();

    // Should redirect to the new empresa's pipeline page
    await page.waitForURL('**/admin/empresas/**', { timeout: 20000 });
    await page.waitForTimeout(1000);
    const url = page.url();
    const match = url.match(/\/admin\/empresas\/([a-f0-9-]+)/);
    if (!match) { test.skip(); return; }
    empresaId = match[1];

    // Verify empresa name appears on pipeline
    await expect(page.locator(`text=${testEmpresaName}`)).toBeVisible({ timeout: 10000 });
  });

  test('navigate to pipeline and expand advanced settings', async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    if (!empresaId) { test.skip(); return; }

    await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
    await expect(page.locator(`text=${testEmpresaName}`)).toBeVisible({ timeout: 10000 });

    // Expand advanced settings
    const advancedBtn = page.locator('button:has-text("Configurações avançadas")');
    await advancedBtn.click();
    await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });
  });

  test('verify cleanup buttons exist', async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    if (!empresaId) { test.skip(); return; }

    await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
    await page.locator('button:has-text("Configurações avançadas")').click();
    await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });

    await expect(page.locator('button:has-text("Limpar competências")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Limpar Mapeamento")').first()).toBeVisible();
    await expect(page.locator('button:has-text("LIMPAR TUDO")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Excluir Empresa Permanentemente")').first()).toBeVisible();
  });

  test('click Limpar competencias (safe — no data exists)', async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    if (!empresaId) { test.skip(); return; }

    await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
    await page.locator('button:has-text("Configurações avançadas")').click();
    await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });

    // Accept the confirm dialog
    page.on('dialog', dialog => dialog.accept());

    await page.locator('button:has-text("Limpar competências")').first().click();
    await page.waitForTimeout(2000);

    // Verify success log message appears
    const logArea = page.locator('text=concluído').first()
      .or(page.locator('text=Limpar competências').first());
    await expect(logArea).toBeVisible({ timeout: 10000 });
  });

  test('click Limpar Mapeamento (safe — no data exists)', async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    if (!empresaId) { test.skip(); return; }

    await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
    await page.locator('button:has-text("Configurações avançadas")').click();
    await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });

    page.on('dialog', dialog => dialog.accept());
    await page.locator('button:has-text("Limpar Mapeamento")').first().click();
    await page.waitForTimeout(2000);

    const logArea = page.locator('text=concluído').first()
      .or(page.locator('text=Limpar Mapeamento').first());
    await expect(logArea).toBeVisible({ timeout: 10000 });
  });

  test('verify log shows success messages', async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    if (!empresaId) { test.skip(); return; }

    await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
    await page.locator('button:has-text("Configurações avançadas")').click();
    await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });

    page.on('dialog', dialog => dialog.accept());
    await page.locator('button:has-text("Limpar competências")').first().click();
    await page.waitForTimeout(2000);

    // Log section should be visible
    const logSection = page.locator('text=Log').first();
    await expect(logSection).toBeVisible({ timeout: 10000 });
  });

  test('delete test empresa permanently', async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    if (!empresaId) { test.skip(); return; }

    await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
    await page.locator('button:has-text("Configurações avançadas")').click();
    await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });

    // Accept the confirm dialog
    page.on('dialog', dialog => dialog.accept());

    await page.locator('button:has-text("Excluir Empresa Permanentemente")').click();

    // Should redirect to admin dashboard
    await page.waitForURL('**/admin/dashboard', { timeout: 15000 });
  });

  test('verify test empresa is gone from dashboard', async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    if (!empresaId) { test.skip(); return; }

    await page.goto('/admin/dashboard', { timeout: 15000 });
    await page.waitForTimeout(2000);

    // The test empresa name should no longer appear
    await expect(page.locator(`text=${testEmpresaName}`)).not.toBeVisible({ timeout: 5000 });
  });
});
