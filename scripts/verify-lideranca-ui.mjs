import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const dir = 'tmp/lideranca-ui';
mkdirSync(dir, { recursive: true });
await build({
  entryPoints: ['tests/browser/lideranca.entry.tsx'],
  outfile: `${dir}/app.js`,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  plugins: [
    {
      name: 'api-ficticia',
      setup(b) {
        b.onResolve({ filter: /lib\/auth\/fetch-auth$/ }, () => ({
          path: 'fetch',
          namespace: 'qa',
        }));
        b.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({
          contents:
            'export const fetchAuth=(...args)=>window.__liderancaFetch(...args);',
          loader: 'js',
        }));
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
});
const html =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>@font-face{font-family:Inter;src:url(/inter.woff2)}@font-face{font-family:Instrument;src:url(/instrument-serif-italic.woff2);font-style:italic}:root{--font-serif:Instrument}body{font-family:Inter,sans-serif;margin:0;background:#091d35;color:white}button,textarea{font:inherit}</style><div id="root"></div><script src="/app.js"></script></html>';
const files = {
  'app.js': `${dir}/app.js`,
  'app.css': `${dir}/app.css`,
  'inter.woff2': 'app/fonts/inter.woff2',
  'instrument-serif-italic.woff2': 'app/fonts/instrument-serif-italic.woff2',
};
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (!name) {
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
    return;
  }
  if (!files[name]) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader(
    'Content-Type',
    name.endsWith('.js')
      ? 'text/javascript'
      : name.endsWith('.css')
        ? 'text/css'
        : 'font/woff2',
  );
  res.end(readFileSync(files[name]));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const plano =
  'Vou ouvir exemplos concretos antes de concluir e combinar uma revisão do fluxo.';
const fala =
  'Vamos revisar os pedidos juntos amanhã e definir uma prioridade por vez.';
const reflexao =
  'Percebi que concluí cedo demais. Vou perguntar pelos fatos antes de propor uma solução.';
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await expect(
    page.getByRole('heading', { name: 'Simulador de liderança' }),
  ).toBeVisible();
  await page.screenshot({ path: `${dir}/inicio-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Começar primeiro encontro' }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Sua preparação para o encontro').fill(plano);
    await page.getByRole('button', { name: 'Registrar e conversar' }).click();
    await expect(
      page.getByRole('button', { name: 'Concluir conversa', exact: true }),
    ).toBeDisabled();
    if (i === 0) {
      await page.getByLabel('Sua fala para Ana').fill(fala);
      await page.evaluate(() => {
        window.__failNext = true;
      });
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Falha de conexão');
      await expect(page.getByLabel('Sua fala para Ana')).toHaveValue(fala);
    }
    for (let j = 0; j < 3; j++) {
      await page.locator('#lideranca-fala').fill(fala);
      if (i === 0 && j === 0)
        await page.evaluate(() => {
          window.__loseNext = true;
        });
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      if (i === 0 && j === 0) {
        await expect(page.getByRole('alert')).toContainText('Resposta salva');
        await expect(
          page.getByText('1 de 16 rodadas', { exact: false }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Enviar', exact: true }).click();
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
      await expect(
        page.getByText(`${j + 1} de 16 rodadas`, { exact: false }),
      ).toBeVisible();
    }
    if (i === 0) {
      await page.reload();
      await expect(
        page.getByText('3 de 16 rodadas', { exact: false }),
      ).toBeVisible();
      await page.screenshot({
        path: `${dir}/conversa-desktop.png`,
        fullPage: true,
      });
    }
    await page
      .getByRole('button', { name: 'Concluir conversa', exact: true })
      .click();
    await page
      .getByLabel('O que você percebeu', { exact: false })
      .fill(reflexao);
    await page
      .getByRole('button', { name: 'Registrar reflexão e receber devolutiva' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'O que sua atuação mostrou' }),
    ).toBeVisible();
    await expect(page.getByText('Consultar contexto e encontros anteriores', { exact: true })).toBeVisible();
    await expect(page.getByRole('log', { name: 'Conversa do encontro' })).toBeHidden();
    if (i < 4)
      await page
        .getByRole('button', { name: `Continuar para o encontro ${i + 2}` })
        .click();
  }
  // A média é da JORNADA (decisão do dono, 22/09/2026): a devolutiva do encontro
  // mostra o nível de cada competência, com o foco marcado, e nenhuma média.
  const devolutiva = page.getByRole('region', { name: 'Devolutiva por competência' }).last();
  await expect(devolutiva.getByText('Em foco', { exact: true })).toBeVisible();
  assert.equal(await devolutiva.getByText(/Média/).count(), 0, 'média dentro da devolutiva do encontro');
  await expect(page.getByText('Cinco encontros concluídos')).toBeVisible();
  await expect(page.getByText('Sua jornada completa')).toBeHidden();
  await page.getByText('Consultar evolução da jornada', { exact: true }).click();
  await expect(page.getByText('Sua jornada completa')).toBeVisible();
  // E a jornada é onde a média vive (ou diz o que falta para ela existir).
  await expect(page.getByText(/Média da jornada: Nível|A média aparece quando/)).toBeVisible();
  await page.screenshot({ path: `${dir}/sintese-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Repetir este encontro' }).click();
  // Repetir pede confirmação (antes disparava na hora uma chamada paga).
  await page.getByRole('button', { name: 'Sim, repetir' }).click();
  await expect(
    page.getByText('Repetição para praticar:', { exact: false }),
  ).toBeVisible();
  await page.getByLabel('Sua preparação para o encontro').fill(plano);
  await page.getByRole('button', { name: 'Registrar e conversar' }).click();
  for (let j = 0; j < 3; j++) {
    await page.locator('#lideranca-fala').fill(fala);
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  }
  await page
    .getByRole('button', { name: 'Concluir conversa', exact: true })
    .click();
  await page.getByLabel('O que você percebeu', { exact: false }).fill(reflexao);
  await page
    .getByRole('button', { name: 'Registrar reflexão e receber devolutiva' })
    .click();
  await expect(
    page.getByText('Competência em foco na primeira vez:', { exact: false }).last(),
  ).toBeVisible();
  await page.screenshot({
    path: `${dir}/devolutiva-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: `${dir}/devolutiva-mobile.png`,
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'overflow horizontal no celular',
  );
  await page.getByText('Consultar contexto e encontros anteriores', { exact: true }).click();
  await page.getByText('Encontros anteriores', { exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Encontro 5 · Repetição/ }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: /Encontro 1 · Jornada original/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Antes de concluir' }),
  ).toBeVisible();
  // Acompanhamento (RH e gestor): mesma tela, aba Equipe, devolutivas sem a conversa.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}?equipe=1`);
  await page.getByRole('button', { name: 'Equipe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acompanhamento da equipe' })).toBeVisible();
  await page.screenshot({ path: `${dir}/equipe-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Ver devolutivas' }).first().click();
  await expect(page.getByRole('button', { name: 'Voltar à equipe' })).toBeVisible();
  await page.screenshot({ path: `${dir}/equipe-detalhe-desktop.png`, fullPage: true });
  // Sem revisão humana (decisão do dono, 22/09/2026): RH e gestor leem as devolutivas, não registram parecer.
  assert.equal(await page.getByRole('region', { name: 'Revisão humana' }).count(), 0, 'bloco de revisão no detalhe da equipe');
  assert.equal(await page.getByRole('button', { name: 'Registrar revisão' }).count(), 0, 'botão de revisão no detalhe da equipe');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${dir}/equipe-detalhe-mobile.png`, fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow horizontal no painel da equipe');
  for (const locale of ['en-US', 'es-ES', 'pt-PT']) {
    const p = await browser.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(`${origin}?locale=${locale}`);
    await expect(p.getByRole('heading', { level: 1 })).toBeVisible();
    await p.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    'UI OK: cinco encontros, repetição, comparação, retomada, erro recuperável, celular e quatro idiomas.',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
