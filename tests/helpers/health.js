const { expect } = require('@playwright/test');

/**
 * Garante que a rota carregou saudável: não voltou pro login e não está no
 * error-boundary. Base de toda asserção dos testes nível 3.
 */
async function assertSaudavel(page, route) {
  await expect(page, `redirecionou pro login em ${route}`).not.toHaveURL(/\/login/);
  const corpo = (await page.locator('body').innerText().catch(() => '')) || '';
  expect(
    /Algo deu errado|erro inesperado ocorreu|Application error|client-side exception/i.test(corpo),
    `error-boundary em ${route}`,
  ).toBeFalsy();
}

/** Abre uma rota e espera hidratar, já validando saúde. */
async function abrir(page, route, espera = 1500) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(espera);
  await assertSaudavel(page, route);
}

/**
 * Exercita filtros da página de forma SEGURA: muda cada <select> visível pra
 * outra opção (filtrar é read-only — não submete formulário, não dispara IA
 * nem envio) e revalida que a tela continua saudável. É o "nível 3" genérico
 * sem tocar em botões de ação.
 */
async function exercitarFiltros(page, route) {
  const selects = page.locator('select');
  const n = await selects.count();
  for (let i = 0; i < Math.min(n, 4); i++) {
    const sel = selects.nth(i);
    if (!(await sel.isVisible().catch(() => false))) continue;
    const opts = await sel.locator('option').count();
    if (opts > 1) {
      await sel.selectOption({ index: opts - 1 }).catch(() => {});
      await page.waitForTimeout(600);
    }
  }
  await assertSaudavel(page, route);
}

module.exports = { assertSaudavel, abrir, exercitarFiltros };
