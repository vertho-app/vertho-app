import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function verificarMatrizUI(page: Page, origin: string, dir: string) {
  let checks = 0;
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto(`${origin}/?matrix=1&planning=1`);
  const plano = page.getByLabel('Seu plano para a reunião', { exact: true });
  await plano.waitFor();
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', {
      name: 'Registrar plano e conversar',
      exact: true,
    }),
  ).toBeDisabled();
  await plano.fill(
    'Vou confirmar os impactos do estoque, priorizar necessidades e comparar opções de implantação.',
  );
  await page.screenshot({
    path: `${dir}/matriz-planejamento-desktop.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Registrar plano e conversar', exact: true }).click();
  await page.getByLabel('Sua mensagem', { exact: true }).waitFor();
  await expect(page.getByLabel('Seu plano para a reunião', { exact: true })).toHaveCount(0);
  assert.equal(await page.evaluate(() => (window as any).__paceWrites[0].acao), 'planejar');
  await page.getByText('Ver planejamento registrado', { exact: true }).click();
  await page
    .getByText(
      'Vou confirmar os impactos do estoque, priorizar necessidades e comparar opções de implantação.',
      { exact: true },
    )
    .waitFor();
  checks++;

  await page.goto(`${origin}/?matrix=1&completed=1`);
  const section = page.getByRole('region', {
    name: 'Competências demonstradas neste treino',
    exact: true,
  });
  await section.waitFor();
  await expect(section.locator(':scope > div > article')).toHaveCount(5);
  await section.getByText('N3 · evidência parcial', { exact: true }).waitFor();
  await section.getByText('4 de 6 descritores observados', { exact: true }).waitFor();
  await section.getByText('Ver descritores e evidências', { exact: true }).last().click();
  await expect(
    section.getByText('A simulação não inclui execução de pós-venda.', {
      exact: true,
    }),
  ).toHaveCount(2);
  await page.screenshot({
    path: `${dir}/matriz-relatorio-desktop.png`,
    fullPage: true,
  });
  checks++;

  for (const locale of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/?matrix=1&completed=1&locale=${locale}`);
    await page.locator('h4').last().waitFor();
    const competencias = page.locator('article').filter({ has: page.locator('h4') });
    await competencias.nth(2).locator('summary').first().click();
    await competencias.nth(2).locator('li').first().locator('summary').click();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `overflow matriz ${locale}`,
    );
    await page.screenshot({
      path: `${dir}/matriz-relatorio-mobile-${locale}.png`,
      fullPage: true,
    });
    checks++;
  }
  return checks;
}
