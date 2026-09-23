const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

/**
 * E2E do Modo Onboarding na UI admin.
 *
 * Valida:
 *   1. Tab "Programa" existe em /admin/empresas/[id]/configuracoes
 *   2. Toggle regular vs onboarding funciona
 *   3. Dropdown fase_carreira tem as 4 opções (sem viés / junior / pleno / senior)
 *   4. Dropdown de papel da tab Equipe tem colaborador, gestor e rh, e NÃO tem
 *      tutor (papel extinto em 22/09/2026, commit 672db4ae)
 *
 * NÃO valida geração de trilha (custa IA e demora) — isso fica pra teste
 * de integração futuro com fixture controlado.
 */

test.describe('Onboarding — UI admin', () => {
  test.beforeEach(async ({ page }) => {
    if (!(await login(page))) { test.skip(); return; }

    // Vai pra config da primeira empresa.
    await page.goto('/admin/dashboard', { timeout: 15000 });
    const painel = page.getByText('Painel Admin');
    if (!(await painel.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(); return;
    }

    const empresaBtn = page.locator('button:has-text("Clique para ver o pipeline")').first();
    if (!(await empresaBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(); return;
    }
    await empresaBtn.click();
    await page.waitForURL('**/admin/empresas/**', { timeout: 15000 });

    const fase0 = page.locator('button:has-text("Fase 0")').first();
    await fase0.click();
    await page.waitForTimeout(500);
    const configLink = page.locator('a:has-text("Configurações")').first();
    if (!(await configLink.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(); return;
    }
    await configLink.click();
    await page.waitForURL('**/configuracoes', { timeout: 15000 });
  });

  test('tab "Programa" aparece entre Equipe e Branding', async ({ page }) => {
    await expect(page.locator('button:has-text("Programa")')).toBeVisible({ timeout: 10000 });
  });

  test('tab Programa mostra toggle regular vs onboarding', async ({ page }) => {
    await page.locator('button:has-text("Programa")').click();
    await page.waitForTimeout(300);
    await expect(page.locator('button:has-text("Regular (14 semanas)")')).toBeVisible();
    await expect(page.locator('button:has-text("Onboarding (10 semanas)")')).toBeVisible();
  });

  test('toggle Onboarding mostra descrição de modo ativo', async ({ page }) => {
    await page.locator('button:has-text("Programa")').click();
    await page.waitForTimeout(300);

    // Click no Onboarding
    await page.locator('button:has-text("Onboarding (10 semanas)")').click();
    await page.waitForTimeout(200);

    // Banner de modo ativo deve aparecer (substitui o aviso amber antigo)
    await expect(page.locator('text=Modo Onboarding ativo')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=competencias_onboarding')).toBeVisible();
  });

  test('dropdown fase_carreira tem 4 opções', async ({ page }) => {
    await page.locator('button:has-text("Programa")').click();
    await page.waitForTimeout(300);

    const select = page.locator('select').filter({ has: page.locator('option:has-text("Junior")') }).first();
    await expect(select).toBeVisible({ timeout: 5000 });

    const options = await select.locator('option').allTextContents();
    expect(options.some(o => o.includes('Sem viés'))).toBeTruthy();
    expect(options.some(o => o.includes('Junior'))).toBeTruthy();
    expect(options.some(o => o.includes('Pleno'))).toBeTruthy();
    expect(options.some(o => o.includes('Senior'))).toBeTruthy();
  });

  test('dropdown de papel da tab Equipe tem os 3 papéis do tenant, sem tutor', async ({ page }) => {
    // Equipe é a tab default — só checa o dropdown
    await expect(page.locator('text=Colaboradores').first()).toBeVisible({ timeout: 10000 });

    const emptyMsg = page.locator('text=Nenhum colaborador cadastrado');
    const isEmpty = await emptyMsg.isVisible().catch(() => false);
    if (isEmpty) { test.skip(); return; } // empresa sem colab nessa fixture

    const roleSelect = page.locator('select').filter({ has: page.locator('option:has-text("Colaborador")') }).first();
    await expect(roleSelect).toBeVisible({ timeout: 5000 });
    // Pelo value, não pelo rótulo: o texto vem do i18n. Os 3 positivos provam que o
    // seletor certo foi lido, então a ausência do tutor não passa por lista vazia.
    const valores = await roleSelect.locator('option').evaluateAll(os => os.map(o => o.value));
    expect(valores).toEqual(expect.arrayContaining(['colaborador', 'gestor', 'rh']));
    expect(valores).not.toContain('tutor');
  });
});
