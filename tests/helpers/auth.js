/**
 * Shared login helper for Playwright e2e tests.
 * Uses SMOKE_EMAIL / SMOKE_PASS env vars (Supabase email+password auth).
 */
async function login(page) {
  const email = process.env.SMOKE_EMAIL;
  const pass = process.env.SMOKE_PASS;
  if (!email || !pass) return false;

  await page.goto('/login');
  await page.getByText('Entrar com senha').click();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(pass);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  return true;
}

module.exports = { login };
