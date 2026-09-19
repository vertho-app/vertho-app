import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const TITULOS_PLANO = [
  'O que você sabe do cliente e o que precisa confirmar',
  'Objetivo da reunião e alternativa se ele não for possível',
  'Hipóteses e perguntas para testá-las',
  'Como você vai conduzir a conversa',
];
const semRolagemLateral = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

export async function verificarMatrizUI(page: Page, origin: string, dir: string) {
  let checks = 0;
  await page.setViewportSize({ width: 1440, height: 1080 });

  // Plano guiado: seis perguntas, mínimo de quatro respostas (a regra de cobertura).
  await page.goto(`${origin}/?matrix=1&planning=1`);
  const plano = page.getByRole('group', { name: 'Seu plano para a reunião', exact: true });
  await plano.waitFor();
  await expect(plano.locator('textarea')).toHaveCount(6);
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toHaveCount(0);
  const registrar = page.getByRole('button', { name: 'Registrar plano e conversar', exact: true });
  await expect(registrar).toBeDisabled();
  await page.getByText('0 de 6 respondidas · mínimo 4', { exact: true }).waitFor();
  for (const [i, titulo] of TITULOS_PLANO.entries()) {
    if (i === 3) await expect(registrar).toBeDisabled();
    await plano.getByLabel(titulo, { exact: true }).fill(`Resposta ${i + 1} do plano de teste.`);
  }
  await expect(registrar).toBeEnabled();
  await page.getByText('4 de 6 respondidas · mínimo 4', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Descartar este treino', exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/matriz-planejamento-desktop.png`, fullPage: true });
  await registrar.click();
  await page.getByLabel('Sua mensagem', { exact: true }).waitFor();
  await expect(plano).toHaveCount(0);
  const escrito = await page.evaluate(() => (window as any).__paceWrites[0]);
  assert.equal(escrito.acao, 'planejar');
  assert.ok(
    escrito.planejamento.startsWith(`${TITULOS_PLANO[0]}\nResposta 1 do plano de teste.`),
    'o plano leva o título de cada pergunta',
  );
  await page.getByText('Ver planejamento registrado', { exact: true }).click();
  await page.getByText(/Resposta 4 do plano de teste\./).waitFor();
  checks++;

  // Descartar: só antes da primeira fala, com confirmação.
  await page.goto(`${origin}/?matrix=1&planning=1`);
  await page.getByRole('button', { name: 'Descartar este treino', exact: true }).click();
  await page.getByText(/Ele fica no histórico como encerrado sem relatório/).waitFor();
  await page.getByRole('button', { name: 'Descartar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Nova simulação', exact: true })).toBeEnabled();
  assert.equal(await page.evaluate(() => (window as any).__paceWrites.at(-1).acao), 'abandonar');
  await page.getByText(/Encerrado sem relatório/).first().waitFor();
  await expect(page.getByRole('button', { name: 'Descartar este treino', exact: true })).toHaveCount(0);
  checks++;

  // Relatório pace-5 (matriz lida como foi gerada): formato comum, sem código nem versão.
  await page.goto(`${origin}/?matrix=1&completed=1`);
  const devolutiva = page.getByRole('region', { name: 'Devolutiva por competência', exact: true });
  await devolutiva.waitFor();
  await expect(devolutiva.locator(':scope > details')).toHaveCount(5);
  await page
    .getByText('Comportamento: Validação do diagnóstico · Manual PACE v8: Etapa 2 — Analisar Detalhadamente', {
      exact: true,
    })
    .waitFor();
  await expect(page.getByText('Prioridade para o próximo treino', { exact: true })).toHaveCount(1);
  await page.getByText(/^Referências: Manual da Metodologia PACE v8/).waitFor();
  await expect(page.getByText(/Régua:/)).toHaveCount(0);
  // Ordem da matriz: Planejamento, Preparar, Analisar, Co-criar, Engajar.
  const engajar = devolutiva.locator(':scope > details').nth(4);
  await engajar.locator('summary').first().getByText('Engajar', { exact: true }).waitFor();
  await engajar.getByText('4 de 6 comportamentos observados', { exact: true }).waitFor();
  await engajar.locator('summary').first().click();
  await engajar.getByText('2 comportamentos sem oportunidade nesta conversa', { exact: true }).click();
  await expect(
    engajar.getByText('A simulação não inclui execução de pós-venda.', { exact: true }),
  ).toHaveCount(2);
  await page.screenshot({ path: `${dir}/matriz-relatorio-desktop.png`, fullPage: true });
  checks++;

  // pace-7: E5 e E6 fora da avaliação, média com nível.
  await page.goto(`${origin}/?matrix=1&completed=1&regua=pace-7`);
  await devolutiva.waitFor();
  await devolutiva.getByText('4 de 4 comportamentos observados', { exact: true }).waitFor();
  await expect(page.getByText('A simulação não inclui execução de pós-venda.', { exact: true })).toHaveCount(0);
  await expect(devolutiva.getByText('Nível 3', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${dir}/matriz-relatorio-pace7-desktop.png`, fullPage: true });
  checks++;

  // pace-7, conversa curta: a regra aparece em palavras e não há média.
  await page.goto(`${origin}/?matrix=1&completed=1&regua=pace-7&curta=1`);
  await devolutiva.waitFor();
  await page
    .getByText(
      'A média geral aparece quando pelo menos 3 competências têm nível. Cada competência tem nível a partir de 4 comportamentos observados.',
      { exact: true },
    )
    .waitFor();
  await expect(devolutiva.getByText('Evidência insuficiente', { exact: true })).toHaveCount(3);
  await page.screenshot({ path: `${dir}/matriz-relatorio-pace7-curta-desktop.png`, fullPage: true });
  checks++;

  // Evolução por competência (só avanço) e foco sugerido.
  await page.goto(`${origin}/?evolucao=1`);
  const evolucao = page.getByRole('region', { name: 'Sua evolução', exact: true });
  await evolucao.waitFor();
  await expect(evolucao.getByText('Subiu de nível', { exact: true })).toHaveCount(4);
  await page.getByText('Foco sugerido para este treino', { exact: true }).waitFor();
  await page.getByText('Confirme o diagnóstico antes de propor', { exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/evolucao-desktop.png`, fullPage: true });
  checks++;

  // Celular: com treino em curso, a conversa vem antes do histórico e a ficha fica recolhível.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/?active=1`);
  const conversa = page.getByRole('log', { name: 'Conversa com o cliente', exact: true });
  await conversa.waitFor();
  const historico = page.getByRole('navigation', { name: 'Seus treinos', exact: true });
  const [yConversa, yHistorico] = await Promise.all([
    conversa.boundingBox().then((b) => b!.y),
    historico.boundingBox().then((b) => b!.y),
  ]);
  assert.ok(yConversa < yHistorico, 'no celular a conversa vem antes do histórico');
  await page.locator('summary', { hasText: 'Antes da conversa ·' }).click();
  assert.equal(await semRolagemLateral(page), true, 'overflow conversa no celular');
  await page.screenshot({ path: `${dir}/conversa-primeiro-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await expect(page.locator('summary', { hasText: 'Antes da conversa ·' })).toBeHidden();
  checks++;

  for (const locale of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/?matrix=1&completed=1&regua=pace-7&locale=${locale}`);
    const secoes = page.locator('section > details');
    await secoes.first().waitFor();
    await secoes.nth(2).locator('summary').first().click();
    await secoes.nth(2).locator('li').first().locator('summary').first().click();
    assert.equal(await semRolagemLateral(page), true, `overflow matriz ${locale}`);
    await page.screenshot({ path: `${dir}/matriz-relatorio-mobile-${locale}.png`, fullPage: true });
    await page.goto(`${origin}/?matrix=1&planning=1&locale=${locale}`);
    await page.locator('fieldset textarea').first().waitFor();
    assert.equal(await semRolagemLateral(page), true, `overflow plano ${locale}`);
    await page.screenshot({ path: `${dir}/matriz-planejamento-mobile-${locale}.png`, fullPage: true });
    await page.goto(`${origin}/?evolucao=1&locale=${locale}`);
    await page.locator('#pace-evolucao').waitFor();
    assert.equal(await semRolagemLateral(page), true, `overflow evolução ${locale}`);
    checks++;
  }
  return checks;
}
