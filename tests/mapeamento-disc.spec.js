const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

/**
 * DISC Behavioral Assessment — full 29-step mapping flow.
 *
 * Phases:
 *   Rank Phase 1 (Natural)  — 8 groups of 4 words, reorder with arrows
 *   Pairs Phase 1 (Natural) — 6 forced-choice pairs
 *   Rank Phase 2 (Adapted)  — same 8 groups
 *   Pairs Phase 2 (Adapted) — same 6 pairs
 *   Learning Preferences     — 8 formats, rate 1-5 stars
 *   Results                  — DISC profile code, competencies, strengths/gaps
 */

test.describe('Mapeamento DISC', () => {
  test.beforeEach(async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
    await page.goto('/dashboard/perfil-comportamental/mapeamento', { timeout: 15000 });
    // The page may start on RANK1 directly (logged-in user), or on onboarding.
    // If onboarding is shown, advance past it.
    const comecar = page.locator('button:has-text("COMEÇAR")');
    if (await comecar.isVisible({ timeout: 3000 }).catch(() => false)) {
      await comecar.click();
      // Welcome form — fill gender if needed and click INICIAR
      const iniciar = page.locator('button:has-text("INICIAR MAPEAMENTO")');
      if (await iniciar.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Select gender if dropdown is present
        const genderSelect = page.locator('select').first();
        if (await genderSelect.isVisible().catch(() => false)) {
          await genderSelect.selectOption('M');
        }
        await iniciar.click();
      }
    }
    // Now we should be on rank1 phase
  });

  // ── Rank Phase 1 ──

  test('page loads with ranking cards', async ({ page }) => {
    // Should show 4 ranking cards with word labels
    await expect(page.locator('text=MAIS PARECIDO')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=MENOS PARECIDO')).toBeVisible();
    // 4 card items should be visible (each has a numbered badge 1-4)
    const cards = page.locator('.space-y-2 > div').filter({ has: page.locator('span.flex-1') });
    await expect(cards).toHaveCount(4);
  });

  test('can reorder cards with arrow buttons', async ({ page }) => {
    await expect(page.locator('text=MAIS PARECIDO')).toBeVisible({ timeout: 10000 });
    // Get the text of the first card
    const firstCard = page.locator('.space-y-2 > div').filter({ has: page.locator('span.flex-1') }).first();
    const firstText = await firstCard.locator('span.flex-1').textContent();

    // Click the down arrow on the first card (second button in the pair, the ChevronDown one)
    const downBtn = firstCard.locator('button').last();
    await downBtn.click();

    // The former first card should now be second (index 1)
    const secondCard = page.locator('.space-y-2 > div').filter({ has: page.locator('span.flex-1') }).nth(1);
    const movedText = await secondCard.locator('span.flex-1').textContent();
    expect(movedText).toBe(firstText);
  });

  test('AVANCAR button works and advances to next group', async ({ page }) => {
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await avancar.click();
    await expect(page.locator('text=Grupo 02')).toBeVisible({ timeout: 5000 });
  });

  test('completes all 8 ranking groups', async ({ page }) => {
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    const avancar = page.locator('button:has-text("AVANÇAR")');
    for (let i = 0; i < 8; i++) {
      await avancar.click();
      await page.waitForTimeout(300);
    }
    // After 8 rank groups we should be in pairs phase 1
    await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });
  });

  // ── Pairs Phase 1 ──

  test('pairs phase shows two cards and OU separator', async ({ page }) => {
    // Advance past 8 rank groups
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) {
      await avancar.click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Par 1/6')).toBeVisible();
    // Two option cards (buttons with border-2)
    const pairCards = page.locator('button.rounded-2xl');
    await expect(pairCards).toHaveCount(2);
  });

  test('can select a pair option', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(200); }
    await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });

    // Click the first pair card
    const firstOption = page.locator('button.rounded-2xl').first();
    await firstOption.click();
    // After selection, the card should have a teal border (borderColor: #2DD4BF)
    await expect(firstOption).toHaveCSS('border-color', 'rgb(45, 212, 191)');
  });

  test('AVANCAR works in pairs', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(200); }
    await expect(page.locator('text=Par 1/6')).toBeVisible({ timeout: 5000 });

    // Select first option then advance
    await page.locator('button.rounded-2xl').first().click();
    await avancar.click();
    await expect(page.locator('text=Par 2/6')).toBeVisible({ timeout: 5000 });
  });

  test('completes all 6 pairs', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(200); }
    await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });

    for (let i = 0; i < 6; i++) {
      await page.locator('button.rounded-2xl').first().click();
      await avancar.click();
      await page.waitForTimeout(300);
    }
    // Should transition to rank phase 2 (Adaptado)
    await expect(page.locator('text=Adaptado')).toBeVisible({ timeout: 5000 });
  });

  // ── Rank Phase 2 ──

  test('rank phase 2 loads with Adaptado label', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    // Phase 1 ranks
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(200); }
    // Phase 1 pairs
    for (let i = 0; i < 6; i++) {
      await page.locator('button.rounded-2xl').first().click();
      await avancar.click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('text=Adaptado')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Grupo 01')).toBeVisible();
  });

  test('completes rank phase 2 (8 groups)', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    // Phase 1: 8 ranks + 6 pairs
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(150); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(150); }
    // Phase 2 ranks
    await expect(page.locator('text=Adaptado')).toBeVisible({ timeout: 5000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(150); }
    // Should be in pairs phase 2
    await expect(page.locator('text=OU')).toBeVisible({ timeout: 5000 });
  });

  // ── Pairs Phase 2 ──

  test('completes pairs phase 2 (6 pairs)', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    // All phase 1
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
    // Phase 2 ranks
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
    // Phase 2 pairs
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
    // Should be on learning preferences
    await expect(page.locator('text=Como você aprende melhor?')).toBeVisible({ timeout: 5000 });
  });

  // ── Learning Preferences ──

  test('learning preferences shows 8 formats with stars', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }

    await expect(page.locator('text=Como você aprende melhor?')).toBeVisible({ timeout: 5000 });
    // 8 format rows
    const formatRows = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') });
    await expect(formatRows).toHaveCount(8);
  });

  test('can rate each format with stars', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }

    await expect(page.locator('text=Como você aprende melhor?')).toBeVisible({ timeout: 5000 });
    // Click first star of first format row
    const firstRow = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') }).first();
    const firstStar = firstRow.locator('button:has-text("★")').first();
    await firstStar.click();
    // Star should be highlighted (golden color)
    await expect(firstStar).toHaveCSS('color', 'rgb(252, 211, 77)');
  });

  test('VER MEU PERFIL button appears after all rated', async ({ page }) => {
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(100); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(100); }

    await expect(page.locator('text=Como você aprende melhor?')).toBeVisible({ timeout: 5000 });

    // Rate all 8 formats (click 3rd star for each)
    const formatRows = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') });
    const count = await formatRows.count();
    for (let i = 0; i < count; i++) {
      const row = formatRows.nth(i);
      await row.locator('button:has-text("★")').nth(2).click(); // 3 stars
      await page.waitForTimeout(50);
    }

    const verPerfil = page.locator('button:has-text("VER MEU PERFIL")');
    await expect(verPerfil).toBeEnabled();
  });

  // ── Results ──

  test('results page shows DISC profile code', async ({ page }) => {
    test.setTimeout(60000);
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });

    // Speed-run through all phases
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(80); }

    // Rate all formats
    const formatRows = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') });
    const count = await formatRows.count();
    for (let i = 0; i < count; i++) {
      await formatRows.nth(i).locator('button:has-text("★")').nth(2).click();
      await page.waitForTimeout(30);
    }
    await page.locator('button:has-text("VER MEU PERFIL")').click();

    // Wait for calculating spinner then results
    await expect(page.locator('text=Seu Perfil Comportamental')).toBeVisible({ timeout: 15000 });
    // Profile code should be a 1-4 letter DISC code
    const profileCode = page.locator('div').filter({ hasText: /^[DISC]{1,4}$/ }).first();
    await expect(profileCode).toBeVisible({ timeout: 5000 });
  });

  test('results show competency bars', async ({ page }) => {
    test.setTimeout(60000);
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(80); }
    const formatRows = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') });
    for (let i = 0; i < await formatRows.count(); i++) {
      await formatRows.nth(i).locator('button:has-text("★")').nth(2).click();
    }
    await page.locator('button:has-text("VER MEU PERFIL")').click();
    await expect(page.locator('text=Seu Perfil Comportamental')).toBeVisible({ timeout: 15000 });

    // DISC Natural section with bars
    await expect(page.locator('text=DISC Natural')).toBeVisible();
    await expect(page.locator('text=Dominância').first()).toBeVisible();
    await expect(page.locator('text=Influência').first()).toBeVisible();
    await expect(page.locator('text=Estabilidade').first()).toBeVisible();
    await expect(page.locator('text=Conformidade').first()).toBeVisible();
  });

  test('results show strengths and development areas', async ({ page }) => {
    test.setTimeout(60000);
    const avancar = page.locator('button:has-text("AVANÇAR")');
    await expect(page.locator('text=Grupo 01')).toBeVisible({ timeout: 10000 });
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 8; i++) { await avancar.click(); await page.waitForTimeout(80); }
    for (let i = 0; i < 6; i++) { await page.locator('button.rounded-2xl').first().click(); await avancar.click(); await page.waitForTimeout(80); }
    const formatRows = page.locator('.space-y-2 > div').filter({ has: page.locator('button:has-text("★")') });
    for (let i = 0; i < await formatRows.count(); i++) {
      await formatRows.nth(i).locator('button:has-text("★")').nth(2).click();
    }
    await page.locator('button:has-text("VER MEU PERFIL")').click();
    await expect(page.locator('text=Seu Perfil Comportamental')).toBeVisible({ timeout: 15000 });

    // Strengths and development areas
    await expect(page.locator('text=Forças')).toBeVisible();
    await expect(page.locator('text=Desenvolvimento')).toBeVisible();
  });
});
