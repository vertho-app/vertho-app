const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

/**
 * DISC Behavioral Assessment — full 29-step flow as serial test.
 * Uses test.describe.serial to maintain state between steps.
 */
test.describe.serial('Mapeamento DISC — fluxo completo', () => {
  /** @type {import('@playwright/test').Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    if (!(await login(page))) {
      test.skip();
    }
  });

  test.afterAll(async () => { await page?.close(); });

  test('navega para mapeamento', async () => {
    await page.goto('/dashboard/perfil-comportamental/mapeamento', { timeout: 15000 });
    await page.waitForTimeout(1000);
  });

  // ── Rank Phase 1 (Natural) ──

  test('rank 1: cards visíveis com setas', async () => {
    await expect(page.locator('text=/NATURAL|Grupo 01/i').first()).toBeVisible({ timeout: 10000 });
    const cards = page.locator('[draggable="true"]');
    await expect(cards).toHaveCount(4, { timeout: 5000 });
  });

  test('rank 1: reordenar com setas funciona', async () => {
    const firstText = await page.locator('[draggable="true"]').first().innerText();
    await page.locator('[draggable="true"]').first().locator('button').last().click();
    await page.waitForTimeout(300);
    const newFirstText = await page.locator('[draggable="true"]').first().innerText();
    expect(newFirstText).not.toBe(firstText);
  });

  test('rank 1: completa 8 grupos', async () => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    for (let i = 0; i < 8; i++) {
      await expect(avancar).toBeVisible({ timeout: 5000 });
      await avancar.click();
      await page.waitForTimeout(300);
    }
  });

  // ── Pairs Phase 1 ──

  test('pairs 1: mostra cards e OU', async () => {
    await expect(page.locator('text=OU').first()).toBeVisible({ timeout: 5000 });
  });

  test('pairs 1: completa 6 pares', async () => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    for (let i = 0; i < 6; i++) {
      await page.locator('button.rounded-2xl').first().click();
      await page.waitForTimeout(200);
      await avancar.click();
      await page.waitForTimeout(400);
    }
  });

  // ── Rank Phase 2 (Adaptado) ──

  test('rank 2: mostra Adaptado', async () => {
    await expect(page.locator('text=/ADAPTADO|Adaptado/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('rank 2: completa 8 grupos', async () => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    for (let i = 0; i < 8; i++) {
      await expect(avancar).toBeVisible({ timeout: 5000 });
      await avancar.click();
      await page.waitForTimeout(300);
    }
  });

  // ── Pairs Phase 2 ──

  test('pairs 2: completa 6 pares', async () => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    for (let i = 0; i < 6; i++) {
      await page.locator('button.rounded-2xl').first().click();
      await page.waitForTimeout(200);
      await avancar.click();
      await page.waitForTimeout(400);
    }
  });

  // ── Learning Preferences ──

  test('preferências: mostra 8 formatos', async () => {
    await expect(page.locator('text=/aprende melhor|ÚLTIMA ETAPA/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('preferências: dar 5 estrelas em cada formato', async () => {
    const stars = page.locator('button:has-text("★")');
    const count = await stars.count();
    // Click the 5th star of each row (every 5th button)
    for (let i = 4; i < count; i += 5) {
      await stars.nth(i).click();
      await page.waitForTimeout(100);
    }
  });

  test('preferências: VER MEU PERFIL e clica', async () => {
    const btn = page.locator('button:has-text("VER MEU PERFIL")');
    await expect(btn).toBeEnabled({ timeout: 5000 });
    await btn.click();
    await page.waitForTimeout(2000);
  });

  // ── Results ──

  test('resultado: perfil DISC visível', async () => {
    await expect(page.locator('text=/PERFIL COMPORTAMENTAL/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('resultado: barras DISC Natural', async () => {
    await expect(page.locator('text=/DISC Natural/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('resultado: Forças e Desenvolvimento', async () => {
    await expect(page.locator('text=/Forças/i').first()).toBeVisible();
    await expect(page.locator('text=/Desenvolvimento/i').first()).toBeVisible();
  });

  test('resultado: competências agrupadas', async () => {
    await expect(page.locator('text=/Competências/i').first()).toBeVisible();
  });

  test('resultado: preferências de aprendizagem', async () => {
    await expect(page.locator('text=/Preferências de Aprendizagem/i').first()).toBeVisible();
  });

  test('resultado: Ver Meu Perfil navega', async () => {
    const btn = page.locator('button:has-text("Ver Meu Perfil")');
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForURL('**/perfil-comportamental', { timeout: 10000 });
    }
  });
});
