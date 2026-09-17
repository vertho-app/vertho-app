import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { OfflineTenant } from '../lib/demo/offline/environment.ts';

/** Invoked after closing the origin and restarting the browser without network. */
export async function verifyOfflinePanels(page: Page, tenant: OfflineTenant) {
  const saved = JSON.parse(await readFile('lib/demo/offline/panels-snapshot.json', 'utf8'))[tenant];
  await page.getByLabel('Trocar função apresentada').selectOption('gestor');
  await page.locator('[data-menu-item=\"/dashboard/gestor/engajamento\"]').click();
  await expect(page.getByRole('heading', { name: 'Engajamento do time', exact: true })).toBeVisible();
  await expect(page.getByText('Recurso da sala online', { exact: true })).not.toBeVisible();
  const team = saved.engagement.manager['[null,null]'].colaboradores;
  if (team.length) {
    const input = page.getByPlaceholder(/Buscar/).first();
    await input.fill(team[0].nome);
    await expect(page.getByText(team[0].nome, { exact: true }).first()).toBeVisible();
    await input.fill('');
  }
  await page.locator('[data-menu-item=\"/dashboard/gestor/equipe-evolucao\"]').click();
  await expect(page.getByRole('heading', { name: 'Evolução da equipe', exact: true })).toBeVisible();
  const finished = saved.team.rows.find((row: any) => saved.details[row.colabEmail]);
  if (finished) {
    await page.getByText(finished.colab, { exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Detalhe do liderado' });
    await expect(dialog.getByRole('heading', { name: finished.colab, exact: true })).toBeVisible();
    await expect(dialog.getByText('Descritor a descritor', { exact: true })).toBeVisible();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'PDF', exact: true }).click();
    expect((await download).suggestedFilename()).toContain('temporada');
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click();
  } else {
    await expect(page.getByText('Nenhuma jornada encerrada ainda', { exact: true })).toBeVisible();
  }
  await page.getByLabel('Trocar função apresentada').selectOption('rh');
  await page.locator('[data-menu-item=\"/dashboard/gestor/engajamento\"]').click();
  await expect(page.getByText('Recurso da sala online', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('heading').first()).toContainText(/Engajamento|jornada/i);
  const weeks = saved.engagement.organization['[null,null]'].semanas;
  if (weeks.length > 1) {
    await page.getByLabel('Filtrar métricas por semana').selectOption(String(weeks.at(-1)));
    await expect(page.getByLabel('Filtrar métricas por semana')).toHaveValue(String(weeks.at(-1)));
    await page.getByLabel('Filtrar métricas por semana').selectOption('');
  }
  await page.getByRole('tab', { name: 'Evolução semanal', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Evolução semanal', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Recurso da sala online', { exact: true })).not.toBeVisible();
  await page.locator('[data-menu-item=\"/dashboard/gestor/ranking\"]').click();
  await expect(page.getByRole('heading', { name: 'Ranking de Adequação ao Cargo', exact: true })).toBeVisible();
  const cargos = Object.keys(saved.rankings);
  for (const cargo of [cargos[0], cargos.at(-1)!]) {
    await page.getByRole('button', { name: cargo, exact: true }).click();
    const person = saved.rankings[cargo].elegiveis[0];
    await expect(page.getByText(person.nome, { exact: true }).first()).toBeVisible();
  }
  await page.getByRole('button', { name: /PDF/i }).click();
  await expect.poll(() => page.locator('canvas').first().evaluate((c: HTMLCanvasElement) => {
    const px = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < px.length; i += 64) if (px[i+3] > 200 && px[i] < 220) ink++;
    return ink;
  }).catch(() => 0), { timeout: 30000 }).toBeGreaterThan(500);
  await page.screenshot({ path: `.tmp/offline-${tenant}-ranking.png` });
  console.log('NOVAS TELAS: engajamento nas duas visões, evolução/detalhes e rankings/PDF offline.');
}
