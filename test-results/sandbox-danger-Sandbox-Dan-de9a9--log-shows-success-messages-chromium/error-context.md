# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sandbox-danger.spec.js >> Sandbox Danger Zone >> verify log shows success messages
- Location: tests\sandbox-danger.spec.js:107:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/dashboard" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - heading "Vertho" [level=1] [ref=e4]
    - paragraph [ref=e5]: Sua jornada de desenvolvimento
    - paragraph [ref=e6]: Digite seu e-mail para acessar
    - generic [ref=e7]:
      - textbox "seu@email.com" [ref=e8]: rodrigo@vertho.ai
      - textbox "Senha" [ref=e9]: vertho
      - button "Entrar com senha" [ref=e10] [cursor=pointer]
      - button "Entrar com Magic Link" [ref=e11]
      - paragraph [ref=e12]: Request rate limit reached
  - alert [ref=e13]
```

# Test source

```ts
  1  | /**
  2  |  * Shared login helper for Playwright e2e tests.
  3  |  * Uses SMOKE_EMAIL / SMOKE_PASS env vars (Supabase email+password auth).
  4  |  */
  5  | async function login(page) {
  6  |   const email = process.env.SMOKE_EMAIL;
  7  |   const pass = process.env.SMOKE_PASS;
  8  |   if (!email || !pass) return false;
  9  | 
  10 |   await page.goto('/login');
  11 |   await page.getByText('Entrar com senha').click();
  12 |   await page.locator('input[type="email"]').fill(email);
  13 |   await page.locator('input[type="password"]').fill(pass);
  14 |   await page.locator('button[type="submit"]').click();
> 15 |   await page.waitForURL('**/dashboard', { timeout: 15000 });
     |              ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  16 |   return true;
  17 | }
  18 | 
  19 | module.exports = { login };
  20 | 
```