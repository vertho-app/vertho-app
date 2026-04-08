# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.js >> Admin (requer credenciais admin) >> admin dashboard carrega KPIs
- Location: tests\admin.spec.js:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Painel Admin').or(getByText('Acesso restrito'))
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('Painel Admin').or(getByText('Acesso restrito'))

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - img [ref=e3]
  - alert [ref=e5]
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test.describe('Admin (requer credenciais admin)', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     const email = process.env.SMOKE_EMAIL;
  6  |     const pass = process.env.SMOKE_PASS;
  7  |     if (!email || !pass) { test.skip(); return; }
  8  | 
  9  |     await page.goto('/login');
  10 |     await page.getByText('Entrar com senha').click();
  11 |     await page.locator('input[type="email"]').fill(email);
  12 |     await page.locator('input[type="password"]').fill(pass);
  13 |     await page.locator('button[type="submit"]').click();
  14 |     await page.waitForURL('**/dashboard', { timeout: 10000 });
  15 |   });
  16 | 
  17 |   test('admin dashboard carrega KPIs', async ({ page }) => {
  18 |     await page.goto('/admin/dashboard');
  19 |     // Pode mostrar painel ou bloqueio de acesso
  20 |     const painel = page.getByText('Painel Admin');
  21 |     const bloqueio = page.getByText('Acesso restrito');
> 22 |     await expect(painel.or(bloqueio)).toBeVisible();
     |                                       ^ Error: expect(locator).toBeVisible() failed
  23 |   });
  24 | 
  25 |   test('admin navega entre seções', async ({ page }) => {
  26 |     await page.goto('/admin/dashboard');
  27 |     const painel = page.getByText('Painel Admin');
  28 |     if (!(await painel.isVisible())) return; // não é admin
  29 | 
  30 |     // Competências
  31 |     await page.getByText('Competencias').click();
  32 |     await page.waitForURL('**/competencias');
  33 |     await expect(page.getByText('Selecione uma empresa').or(page.getByText('competencia'))).toBeVisible();
  34 | 
  35 |     // Simulador
  36 |     await page.goto('/admin/simulador');
  37 |     await expect(page.getByText('Limpar').or(page.getByPlaceholder(/mensagem|Envie/))).toBeVisible();
  38 |   });
  39 | 
  40 |   test('pipeline da empresa carrega fases', async ({ page }) => {
  41 |     await page.goto('/admin/dashboard');
  42 |     const painel = page.getByText('Painel Admin');
  43 |     if (!(await painel.isVisible())) return;
  44 | 
  45 |     // Clicar na primeira empresa
  46 |     const empresaBtn = page.locator('button:has-text("Clique para ver o pipeline")').first();
  47 |     if (await empresaBtn.isVisible()) {
  48 |       await empresaBtn.click();
  49 |       await expect(page.getByText('Fase 0')).toBeVisible();
  50 |       await expect(page.getByText('Fase 1')).toBeVisible();
  51 |     }
  52 |   });
  53 | });
  54 | 
```