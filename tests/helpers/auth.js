/**
 * Shared login helper for Playwright e2e tests.
 * Uses SMOKE_EMAIL / SMOKE_PASS env vars (Supabase email+password auth).
 */
async function login(page) {
  const email = process.env.SMOKE_EMAIL;
  const pass = process.env.SMOKE_PASS;
  if (!email || !pass) {
    // Em CI, falta de credencial NÃO pode virar `test.skip()` — a suíte inteira
    // pularia e o comando sairia 0 (F12 da auditoria: "instrumento que não pode
    // disparar"). Local, pular é legítimo: nem todo dev tem a credencial.
    if (process.env.CI) throw new Error('SMOKE_EMAIL/SMOKE_PASS ausentes em CI — sem eles a suíte pula tudo e mente verde');
    return false;
  }

  await page.goto('/login');
  await page.getByText('Entrar com senha').click();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(pass);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });

  await falharSeContaOrfa(page);
  return true;
}

/**
 * Autenticar não é ter acesso: `auth.users` e `colaboradores` são tabelas
 * diferentes, e o reset noturno do tenant demo apaga a segunda.
 *
 * 🔴 `Medido: 01/09 a 09/09/2026` — 185 de 188 runs vermelhos, sempre por isto.
 * O login FUNCIONAVA (chegava a `/dashboard`), e o que aparecia no relatório
 * eram cinco falhas de locator em cinco telas diferentes: saudação ausente,
 * botão "Equipe" que não clica, competências que não listam, perfil vazio,
 * chat sem resposta. Cinco sintomas, uma causa, e nenhum deles a nomeia — foi
 * por isso que o vermelho durou dez dias sem ninguém agir.
 *
 * O gate roda logo depois do login, antes de qualquer asserção de tela: quem
 * lê o CI recebe a causa e o comando que a conserta, não a lista de sintomas.
 */
async function falharSeContaOrfa(page) {
  const orfa = await page.locator('[data-dashboard="sem-colaborador"]')
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (!orfa) return;

  throw new Error(
    `A conta ${process.env.SMOKE_EMAIL} autentica mas NÃO tem linha em \`colaboradores\`. ` +
    'Nenhuma tela autenticada pode passar assim, e as falhas seguintes seriam sintoma, não causa. ' +
    'Repor: `npx --yes tsx scripts/criar-smoke-e2e.ts` (recria o colaborador, rotaciona a senha e ' +
    'atualiza o secret SMOKE_PASS). Causa provável: o reset noturno do tenant demo (07:00 UTC) ' +
    'apagou o colaborador — ver `lib/demo/reset-acme-demo.ts`.',
  );
}

module.exports = { login, falharSeContaOrfa };
