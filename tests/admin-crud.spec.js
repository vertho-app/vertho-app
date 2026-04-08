const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

/**
 * CRUD operations for competencias (/admin/competencias).
 * Tests empresa selector, table, modal form, base competencies.
 *
 * SANDBOX: creates a test competency, verifies it, then deletes it.
 */

test.describe('Admin Competencias CRUD', () => {
  test.beforeEach(async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    await page.goto('/admin/competencias', { timeout: 15000 });
    await expect(page.locator('text=Competencias').first()).toBeVisible({ timeout: 10000 });
  });

  test('page loads with empresa selector', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    await expect(selector).toBeVisible({ timeout: 5000 });
  });

  test('selecting an empresa shows competency table or empty state', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    // Pick the first real empresa (second option, after placeholder)
    const options = selector.locator('option');
    const count = await options.count();
    if (count < 2) { test.skip(); return; }

    await selector.selectOption({ index: 1 });
    await page.waitForTimeout(1500);

    // Should show a table or empty state
    const table = page.locator('table');
    const empty = page.locator('text=Nenhuma competencia cadastrada');
    await expect(table.or(empty)).toBeVisible({ timeout: 10000 });
  });

  test('Nova button opens modal form', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    const options = selector.locator('option');
    if ((await options.count()) < 2) { test.skip(); return; }
    await selector.selectOption({ index: 1 });
    await page.waitForTimeout(1000);

    const novaBtn = page.locator('button:has-text("Nova")').first();
    await expect(novaBtn).toBeVisible({ timeout: 5000 });
    await novaBtn.click();

    // Modal should appear
    await expect(page.locator('text=Nova Competencia').first().or(page.locator('h2:has-text("Nova")').first())).toBeVisible({ timeout: 5000 });
  });

  test('modal has fields: cod_comp, nome, pilar, cargo, descricao', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
    await selector.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Nova")').first().click();

    await expect(page.locator('label:has-text("Nome")').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('label:has-text("Codigo")').first()).toBeVisible();
    await expect(page.locator('label:has-text("Pilar")').first()).toBeVisible();
    await expect(page.locator('label:has-text("Cargo")').first()).toBeVisible();
    await expect(page.locator('label:has-text("Descricao")').first()).toBeVisible();
  });

  test('can fill modal fields', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
    await selector.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Nova")').first().click();
    await page.waitForTimeout(500);

    await page.locator('input[placeholder="Nome da competencia"]').fill('Test Competency');
    await page.locator('input[placeholder*="COMP"]').fill('TEST-99');
    await page.locator('input[placeholder*="Lideranca"]').fill('Testing');
    await page.locator('input[placeholder*="Gerente"]').fill('QA');
    await page.locator('textarea').first().fill('A test competency description');

    await expect(page.locator('input[placeholder="Nome da competencia"]')).toHaveValue('Test Competency');
  });

  test('Cancelar closes modal without saving', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
    await selector.selectOption({ index: 1 });
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Nova")').first().click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=Nova Competencia').first().or(page.locator('h2:has-text("Nova")').first())).toBeVisible({ timeout: 3000 });
    await page.locator('button:has-text("Cancelar")').click();
    await expect(page.locator('text=Nova Competencia').first()).not.toBeVisible({ timeout: 3000 });
  });

  test('Ver Base toggle shows base competencies', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
    await selector.selectOption({ index: 1 });
    await page.waitForTimeout(1000);

    const verBaseBtn = page.locator('button:has-text("Ver Base")');
    await expect(verBaseBtn).toBeVisible({ timeout: 5000 });
    await verBaseBtn.click();
    // Should show base competencies list with Copiar buttons
    await expect(page.locator('text=Competencias Base').first()).toBeVisible({ timeout: 5000 });
  });

  test('base competencies have Copiar button', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
    await selector.selectOption({ index: 1 });
    await page.waitForTimeout(1000);

    await page.locator('button:has-text("Ver Base")').click();
    await page.waitForTimeout(1000);

    const copiarBtns = page.locator('button:has-text("Copiar")');
    const count = await copiarBtns.count();
    if (count === 0) {
      // No base competencies available for this segment — still a valid state
      return;
    }
    await expect(copiarBtns.first()).toBeVisible();
  });

  test('SANDBOX: create, verify, and delete test competency', async ({ page }) => {
    const selector = page.locator('select').filter({ has: page.locator('option:has-text("Selecione uma empresa")') }).first();
    if ((await selector.locator('option').count()) < 2) { test.skip(); return; }
    await selector.selectOption({ index: 1 });
    await page.waitForTimeout(1500);

    const testName = `TESTE_PLAYWRIGHT_${Date.now()}`;

    // Create
    await page.locator('button:has-text("Nova")').first().click();
    await page.waitForTimeout(500);
    // Fill available fields in the modal (order: cod_comp, nome, pilar, cargo, descricao)
    const inputs = page.locator('.fixed input, .fixed textarea');
    const inputCount = await inputs.count();
    if (inputCount >= 2) {
      await inputs.nth(0).fill('PW-TEST');
      await inputs.nth(1).fill(testName);
    }
    if (inputCount >= 3) await inputs.nth(2).fill('Teste');
    if (inputCount >= 4) await inputs.nth(3).fill('QA');
    const textarea = page.locator('.fixed textarea').first();
    if (await textarea.isVisible()) await textarea.fill('Competencia de teste E2E');
    await page.locator('button:has-text("Salvar")').click();
    await page.waitForTimeout(2000);

    // Verify it appears in the table
    await expect(page.locator(`text=${testName}`)).toBeVisible({ timeout: 10000 });

    // Delete it — find the row with our test name and click its trash button
    const row = page.locator('tr').filter({ hasText: testName });
    await expect(row).toBeVisible({ timeout: 5000 });

    // Accept the confirm dialog
    page.on('dialog', dialog => dialog.accept());
    const trashBtn = row.locator('button').filter({ has: page.locator('svg') }).last();
    await trashBtn.click();
    await page.waitForTimeout(2000);

    // Verify it is gone
    await expect(page.locator(`text=${testName}`)).not.toBeVisible({ timeout: 5000 });
  });
});
