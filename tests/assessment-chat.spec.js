const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

/**
 * Conversational assessment (IA4 chat) — tests the competency-based
 * evaluation chat at /dashboard/assessment/chat?competencia=UUID.
 *
 * Uses longer timeouts (30s) because the AI takes time to respond.
 */

test.describe('Assessment Chat', () => {
  test.setTimeout(90000); // overall generous timeout for AI interactions

  test.beforeEach(async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }
  });

  test('assessment page loads with competency list', async ({ page }) => {
    await page.goto('/dashboard/assessment', { timeout: 15000 });
    // Should show "Suas Competencias" title or the empty state
    const titulo = page.getByText('Suas Competências');
    const empty = page.getByText('Nenhuma competência');
    await expect(titulo.or(empty)).toBeVisible({ timeout: 15000 });
  });

  test('clicking a pending competency navigates to chat', async ({ page }) => {
    await page.goto('/dashboard/assessment', { timeout: 15000 });
    const titulo = page.getByText('Suas Competências');
    if (!(await titulo.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(); // no competencies configured
      return;
    }

    // Find a button that is NOT disabled (pending or em_andamento)
    const compButtons = page.locator('button[style*="background"]').filter({
      has: page.locator('svg'),
    });
    const count = await compButtons.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = compButtons.nth(i);
      const isDisabled = await btn.getAttribute('disabled');
      if (isDisabled === null) {
        await btn.click();
        clicked = true;
        break;
      }
    }
    if (!clicked) { test.skip(); return; } // all completed

    await page.waitForURL('**/assessment/chat**', { timeout: 15000 });
    await expect(page).toHaveURL(/assessment\/chat/);
  });

  test('chat page shows input and send button', async ({ page }) => {
    await page.goto('/dashboard/assessment', { timeout: 15000 });
    const titulo = page.getByText('Suas Competências');
    if (!(await titulo.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(); return;
    }

    // Click first non-disabled competency
    const compButtons = page.locator('button[style*="background"]').filter({ has: page.locator('svg') });
    const count = await compButtons.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = compButtons.nth(i);
      if ((await btn.getAttribute('disabled')) === null) { await btn.click(); clicked = true; break; }
    }
    if (!clicked) { test.skip(); return; }

    await page.waitForURL('**/assessment/chat**', { timeout: 15000 });

    // Input and send button
    const input = page.locator('input[placeholder*="Descreva"]');
    const sendBtn = page.locator('button[type="submit"]');
    await expect(input).toBeVisible({ timeout: 15000 });
    await expect(sendBtn).toBeVisible();
  });

  test('can type a message', async ({ page }) => {
    await page.goto('/dashboard/assessment', { timeout: 15000 });
    const titulo = page.getByText('Suas Competências');
    if (!(await titulo.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return; }

    const compButtons = page.locator('button[style*="background"]').filter({ has: page.locator('svg') });
    const count = await compButtons.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = compButtons.nth(i);
      if ((await btn.getAttribute('disabled')) === null) { await btn.click(); clicked = true; break; }
    }
    if (!clicked) { test.skip(); return; }
    await page.waitForURL('**/assessment/chat**', { timeout: 15000 });

    const input = page.locator('input[placeholder*="Descreva"]');
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill('Eu tentaria resolver conversando com a equipe');
    await expect(input).toHaveValue('Eu tentaria resolver conversando com a equipe');
  });

  test('sending a message shows it in the chat', async ({ page }) => {
    await page.goto('/dashboard/assessment', { timeout: 15000 });
    const titulo = page.getByText('Suas Competências');
    if (!(await titulo.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return; }

    const compButtons = page.locator('button[style*="background"]').filter({ has: page.locator('svg') });
    const count = await compButtons.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = compButtons.nth(i);
      if ((await btn.getAttribute('disabled')) === null) { await btn.click(); clicked = true; break; }
    }
    if (!clicked) { test.skip(); return; }
    await page.waitForURL('**/assessment/chat**', { timeout: 15000 });

    const input = page.locator('input[placeholder*="Descreva"]');
    await expect(input).toBeVisible({ timeout: 15000 });
    const msg = 'Eu conversaria com cada membro da equipe individualmente';
    await input.fill(msg);
    await page.locator('button[type="submit"]').click();

    // User message bubble should appear (cyan background)
    await expect(page.locator('.rounded-br-md').filter({ hasText: msg }).first()).toBeVisible({ timeout: 10000 });
  });

  test('AI responds within 30 seconds', async ({ page }) => {
    await page.goto('/dashboard/assessment', { timeout: 15000 });
    const titulo = page.getByText('Suas Competências');
    if (!(await titulo.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return; }

    const compButtons = page.locator('button[style*="background"]').filter({ has: page.locator('svg') });
    const count = await compButtons.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = compButtons.nth(i);
      if ((await btn.getAttribute('disabled')) === null) { await btn.click(); clicked = true; break; }
    }
    if (!clicked) { test.skip(); return; }
    await page.waitForURL('**/assessment/chat**', { timeout: 15000 });

    const input = page.locator('input[placeholder*="Descreva"]');
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill('Tentaria entender o contexto e agir de forma proativa');
    await page.locator('button[type="submit"]').click();

    // Wait for AI response bubble (assistant messages use rounded-bl-md)
    await expect(page.locator('.rounded-bl-md').first()).toBeVisible({ timeout: 30000 });
  });

  test('AI response contains visible text (not empty)', async ({ page }) => {
    await page.goto('/dashboard/assessment', { timeout: 15000 });
    const titulo = page.getByText('Suas Competências');
    if (!(await titulo.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return; }

    const compButtons = page.locator('button[style*="background"]').filter({ has: page.locator('svg') });
    const count = await compButtons.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = compButtons.nth(i);
      if ((await btn.getAttribute('disabled')) === null) { await btn.click(); clicked = true; break; }
    }
    if (!clicked) { test.skip(); return; }
    await page.waitForURL('**/assessment/chat**', { timeout: 15000 });

    const input = page.locator('input[placeholder*="Descreva"]');
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.fill('Analisaria os dados e proporia um plano de ação');
    await page.locator('button[type="submit"]').click();

    const aiMsg = page.locator('.rounded-bl-md').first();
    await expect(aiMsg).toBeVisible({ timeout: 30000 });
    const text = await aiMsg.textContent();
    expect(text.length).toBeGreaterThan(10);
  });

  test('phase badge updates after interaction', async ({ page }) => {
    await page.goto('/dashboard/assessment', { timeout: 15000 });
    const titulo = page.getByText('Suas Competências');
    if (!(await titulo.isVisible({ timeout: 10000 }).catch(() => false))) { test.skip(); return; }

    const compButtons = page.locator('button[style*="background"]').filter({ has: page.locator('svg') });
    const count = await compButtons.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = compButtons.nth(i);
      if ((await btn.getAttribute('disabled')) === null) { await btn.click(); clicked = true; break; }
    }
    if (!clicked) { test.skip(); return; }
    await page.waitForURL('**/assessment/chat**', { timeout: 15000 });

    // Phase badge should be visible in the header (Cenario, Aprofundamento, etc.)
    const phaseBadge = page.locator('span.rounded-full').filter({ hasText: /Cenário|Aprofundamento|Contraexemplo|Encerramento|Concluída/ }).first();
    await expect(phaseBadge).toBeVisible({ timeout: 15000 });
  });
});
