# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sandbox-danger.spec.js >> Sandbox Danger Zone >> create test empresa via /admin/empresas/nova
- Location: tests\sandbox-danger.spec.js:19:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: null
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e3]:
    - generic [ref=e4]:
      - heading "Nova Empresa" [level=1] [ref=e5]
      - button "Voltar" [ref=e6]:
        - img [ref=e7]
        - text: Voltar
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]: Nome
        - textbox "Nome da empresa" [ref=e12]: PLAYWRIGHT_TEST_mnpy5mjz
      - generic [ref=e13]:
        - generic [ref=e14]: Segmento
        - combobox [ref=e15]:
          - option "Corporativo" [selected]
          - option "Educacao"
      - button "Criando..." [disabled] [ref=e16]:
        - img [ref=e17]
        - text: Criando...
```

# Test source

```ts
  1   | const { test, expect } = require('@playwright/test');
  2   | const { login } = require('./helpers/auth');
  3   | 
  4   | /**
  5   |  * SAFE sandbox test for danger zone operations.
  6   |  *
  7   |  * CRITICAL: This test creates its own test empresa, tests cleanup
  8   |  * operations on it (safe because no real data exists), then deletes
  9   |  * the empresa entirely. NEVER touches real production data.
  10  |  */
  11  | 
  12  | test.describe('Sandbox Danger Zone', () => {
  13  |   test.setTimeout(120000); // generous timeout for multi-step flow
  14  | 
  15  |   const testSuffix = Date.now().toString(36);
  16  |   const testEmpresaName = `PLAYWRIGHT_TEST_${testSuffix}`;
  17  |   let empresaId = '';
  18  | 
  19  |   test('create test empresa via /admin/empresas/nova', async ({ page }) => {
  20  |     if (!(await login(page))) { test.skip(); return; }
  21  | 
  22  |     await page.goto('/admin/empresas/nova', { timeout: 15000 });
  23  |     await expect(page.locator('text=Nova Empresa')).toBeVisible({ timeout: 10000 });
  24  | 
  25  |     // Fill the form
  26  |     await page.locator('input[placeholder="Nome da empresa"]').fill(testEmpresaName);
  27  |     await page.locator('select').first().selectOption('corporativo');
  28  | 
  29  |     // Submit
  30  |     await page.locator('button:has-text("Criar Empresa")').click();
  31  | 
  32  |     // Should redirect to the new empresa's pipeline page
  33  |     await page.waitForURL('**/admin/empresas/**', { timeout: 15000 });
  34  |     const url = page.url();
  35  |     const match = url.match(/\/admin\/empresas\/([a-f0-9-]+)/);
> 36  |     expect(match).toBeTruthy();
      |                   ^ Error: expect(received).toBeTruthy()
  37  |     empresaId = match[1];
  38  | 
  39  |     // Verify empresa name appears on pipeline
  40  |     await expect(page.locator(`text=${testEmpresaName}`)).toBeVisible({ timeout: 10000 });
  41  |   });
  42  | 
  43  |   test('navigate to pipeline and expand advanced settings', async ({ page }) => {
  44  |     if (!(await login(page))) { test.skip(); return; }
  45  |     if (!empresaId) { test.skip(); return; }
  46  | 
  47  |     await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
  48  |     await expect(page.locator(`text=${testEmpresaName}`)).toBeVisible({ timeout: 10000 });
  49  | 
  50  |     // Expand advanced settings
  51  |     const advancedBtn = page.locator('button:has-text("Configurações avançadas")');
  52  |     await advancedBtn.click();
  53  |     await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });
  54  |   });
  55  | 
  56  |   test('verify cleanup buttons exist', async ({ page }) => {
  57  |     if (!(await login(page))) { test.skip(); return; }
  58  |     if (!empresaId) { test.skip(); return; }
  59  | 
  60  |     await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
  61  |     await page.locator('button:has-text("Configurações avançadas")').click();
  62  |     await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });
  63  | 
  64  |     await expect(page.locator('button:has-text("Limpar competências")').first()).toBeVisible();
  65  |     await expect(page.locator('button:has-text("Limpar Mapeamento")').first()).toBeVisible();
  66  |     await expect(page.locator('button:has-text("LIMPAR TUDO")').first()).toBeVisible();
  67  |     await expect(page.locator('button:has-text("Excluir Empresa Permanentemente")').first()).toBeVisible();
  68  |   });
  69  | 
  70  |   test('click Limpar competencias (safe — no data exists)', async ({ page }) => {
  71  |     if (!(await login(page))) { test.skip(); return; }
  72  |     if (!empresaId) { test.skip(); return; }
  73  | 
  74  |     await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
  75  |     await page.locator('button:has-text("Configurações avançadas")').click();
  76  |     await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });
  77  | 
  78  |     // Accept the confirm dialog
  79  |     page.on('dialog', dialog => dialog.accept());
  80  | 
  81  |     await page.locator('button:has-text("Limpar competências")').first().click();
  82  |     await page.waitForTimeout(2000);
  83  | 
  84  |     // Verify success log message appears
  85  |     const logArea = page.locator('text=concluído').first()
  86  |       .or(page.locator('text=Limpar competências').first());
  87  |     await expect(logArea).toBeVisible({ timeout: 10000 });
  88  |   });
  89  | 
  90  |   test('click Limpar Mapeamento (safe — no data exists)', async ({ page }) => {
  91  |     if (!(await login(page))) { test.skip(); return; }
  92  |     if (!empresaId) { test.skip(); return; }
  93  | 
  94  |     await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
  95  |     await page.locator('button:has-text("Configurações avançadas")').click();
  96  |     await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });
  97  | 
  98  |     page.on('dialog', dialog => dialog.accept());
  99  |     await page.locator('button:has-text("Limpar Mapeamento")').first().click();
  100 |     await page.waitForTimeout(2000);
  101 | 
  102 |     const logArea = page.locator('text=concluído').first()
  103 |       .or(page.locator('text=Limpar Mapeamento').first());
  104 |     await expect(logArea).toBeVisible({ timeout: 10000 });
  105 |   });
  106 | 
  107 |   test('verify log shows success messages', async ({ page }) => {
  108 |     if (!(await login(page))) { test.skip(); return; }
  109 |     if (!empresaId) { test.skip(); return; }
  110 | 
  111 |     await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
  112 |     await page.locator('button:has-text("Configurações avançadas")').click();
  113 |     await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });
  114 | 
  115 |     page.on('dialog', dialog => dialog.accept());
  116 |     await page.locator('button:has-text("Limpar competências")').first().click();
  117 |     await page.waitForTimeout(2000);
  118 | 
  119 |     // Log section should be visible
  120 |     const logSection = page.locator('text=Log').first();
  121 |     await expect(logSection).toBeVisible({ timeout: 10000 });
  122 |   });
  123 | 
  124 |   test('delete test empresa permanently', async ({ page }) => {
  125 |     if (!(await login(page))) { test.skip(); return; }
  126 |     if (!empresaId) { test.skip(); return; }
  127 | 
  128 |     await page.goto(`/admin/empresas/${empresaId}`, { timeout: 15000 });
  129 |     await page.locator('button:has-text("Configurações avançadas")').click();
  130 |     await expect(page.locator('text=Zona de Perigo')).toBeVisible({ timeout: 5000 });
  131 | 
  132 |     // Accept the confirm dialog
  133 |     page.on('dialog', dialog => dialog.accept());
  134 | 
  135 |     await page.locator('button:has-text("Excluir Empresa Permanentemente")').click();
  136 | 
```