// Componentes/CSS reais; endpoints exclusivamente fictícios, sem login/IA externa.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium, expect } from '@playwright/test';
const dir = 'tmp/pace-ui-v2';
mkdirSync(dir, { recursive: true });
await build({
  entryPoints: ['tests/browser/pace.entry.tsx'],
  outfile: `${dir}/app.js`,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  plugins: [
    {
      name: 'fronteiras',
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'qa' }));
        b.onResolve({ filter: /lib\/auth\/fetch-auth$/ }, () => ({ path: 'fetch', namespace: 'qa' }));
        b.onLoad({ filter: /.*/, namespace: 'qa' }, (a) => ({
          contents:
            a.path === 'fetch'
              ? 'export const fetchAuth=(...args)=>window.__paceFetch(...args);'
              : 'export const useSearchParams=()=>new URLSearchParams(location.search); export const useRouter=()=>({back:()=>{}});',
          loader: 'js',
        }));
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
});
const css = await postcss([tailwind({ base: process.cwd() })]).process(
  readFileSync('app/globals.css', 'utf8'),
  { from: path.resolve('app/globals.css') },
);
writeFileSync(`${dir}/globals.css`, css.css);
const html =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"><style>@font-face{font-family:Inter;src:url(/inter.woff2)}@font-face{font-family:Instrument;src:url(/instrument-serif-italic.woff2);font-style:italic}:root{--font-serif:Instrument}body{font-family:Inter,sans-serif;min-height:100vh;margin:0}</style><div id="root"></div><script src="/app.js"></script></html>';
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1);
  if (!name) {
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
    return;
  }
  const files = {
    'app.js': `${dir}/app.js`,
    'app.css': `${dir}/app.css`,
    'globals.css': `${dir}/globals.css`,
    'inter.woff2': 'app/fonts/inter.woff2',
    'instrument-serif-italic.woff2': 'app/fonts/instrument-serif-italic.woff2',
  };
  if (!files[name]) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader(
    'Content-Type',
    name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'font/woff2',
  );
  res.end(readFileSync(files[name]));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
let checks = 0;
const empresaA = '10000000-0000-4000-8000-000000000003',
  empresaB = '10000000-0000-4000-8000-000000000004';
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
    timezoneId: 'America/Sao_Paulo',
  });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Iniciar treino', exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/inicio-desktop.png`, fullPage: true });
  checks++;
  await page.goto(`${origin}/?active=1`);
  assert.equal(await page.getByRole('button', { name: 'Encerrar sem relatório', exact: true }).count(), 0);
  const input = page.getByLabel('Sua mensagem', { exact: true });
  await input.fill('Como isso impacta o trabalho da equipe?');
  await input.press('Enter');
  await page.getByText('Como isso impacta o trabalho da equipe?', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__paceWrites.length), 1);
  await page.screenshot({ path: `${dir}/conversa-desktop.png`, fullPage: true });
  checks++;
  await page.getByRole('button', { name: 'Encerrar e receber devolutiva', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar encerramento', exact: true }).click();
  await page.getByRole('heading', { name: 'Conte como foi a experiência', exact: true }).waitFor();
  assert.equal(await page.getByText('Avance no diagnóstico antes de propor.', { exact: true }).count(), 0);
  await page.screenshot({ path: `${dir}/avaliacao-antes-relatorio-desktop.png`, fullPage: true });
  const notasMaximas = await page.getByRole('radio', { name: '5 de 5', exact: true }).all();
  assert.equal(notasMaximas.length, 5);
  for (const nota of notasMaximas) await nota.check();
  await page.getByRole('button', { name: 'Enviar avaliação e abrir devolutiva', exact: true }).click();
  await page.getByText('Avance no diagnóstico antes de propor.', { exact: true }).waitFor();
  assert.equal(await page.locator('meter').first().getAttribute('min'), '0.5');
  await page.screenshot({ path: `${dir}/relatorio-desktop.png`, fullPage: true });
  checks += 2;
  await page.goto(`${origin}/?active=1&processing=1`);
  await page.getByText('Há uma resposta em processamento.', { exact: false }).waitFor();
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeDisabled();
  await page.reload();
  await page.getByText('Há uma resposta em processamento.', { exact: false }).waitFor();
  await page.screenshot({ path: `${dir}/processando-desktop.png`, fullPage: true });
  await page.evaluate(() => window.__paceLiberar());
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeEnabled({ timeout: 12000 });
  checks++;
  await page.goto(`${origin}/?history=1`);
  await page.getByText('Dificuldade: Baixo', { exact: true }).first().waitFor();
  await page.getByText('Nota PACE 6,5', { exact: true }).first().waitFor();
  await page.screenshot({ path: `${dir}/historico-dificuldade-nota-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await page.getByRole('button', { name: /Cliente 31/ }).click();
  await page.getByRole('heading', { name: 'Conte como foi a experiência', exact: true }).waitFor();
  checks++;
  await page.goto(`${origin}/?admin=1&empresa=${empresaA}&history=1`);
  await page.getByRole('button', { name: 'Histórico da equipe', exact: true }).click();
  await page.getByRole('button', { name: 'Ver relatório', exact: true }).first().click();
  await page.getByText('Avance no diagnóstico antes de propor.', { exact: true }).waitFor();
  await page.screenshot({ path: `${dir}/equipe-desktop.png`, fullPage: true });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = '';
  for await (const chunk of stream) csv += chunk;
  assert.ok(csv.includes("'=FORMULA"), 'escape de fórmula');
  checks++;
  await page.getByRole('button', { name: 'Configuração da empresa', exact: true }).click();
  await page.getByLabel('Início do acesso', { exact: true }).fill('2026-09-13T09:00');
  await page.getByLabel('Fim do acesso', { exact: true }).fill('2026-12-13T18:00');
  await page.screenshot({ path: `${dir}/config-desktop.png`, fullPage: true });
  await page.locator('[role="note"]').waitFor();
  await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Salvar configuração', exact: true })).toBeEnabled();
  assert.equal(
    await page.evaluate(() => window.__paceWrites.at(-1).periodoInicio),
    '2026-09-13T12:00:00.000Z',
  );
  checks++;
  await page.goto(`${origin}/?confirmation=1`);
  await page.getByTestId('pace-exclusion-preview').click();
  await page.getByRole('alertdialog').waitFor();
  await page.getByText(/7 dias/).waitFor();
  await page.screenshot({ path: `${dir}/exclusao-desktop.png`, fullPage: true });
  checks++;
  // Mudança de contexto enquanto respostas antigas ainda chegam; novo finally é soberano.
  await page.goto(`${origin}/?admin=1&empresa=${empresaA}`);
  await page.getByRole('button', { name: 'Iniciar treino', exact: true }).waitFor();
  await page.evaluate(() => (window.__paceDelay = true));
  await page.getByRole('button', { name: 'Iniciar treino', exact: true }).click();
  await page.evaluate((id) => window.__paceContexto(id), empresaB);
  await expect(page.getByRole('button', { name: 'Iniciar treino', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Iniciar treino', exact: true }).click();
  await page.evaluate(() => window.__pacePendentes.shift()());
  await expect(page.getByRole('button', { name: 'Iniciar treino', exact: true })).toBeDisabled();
  await page.evaluate(() => window.__pacePendentes.shift()());
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeEnabled();
  checks++;
  for (const locale of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/?active=1&locale=${locale}`);
    await page.locator('textarea').waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `overflow ${locale}`,
    );
    await page.screenshot({ path: `${dir}/mobile-${locale}.png`, fullPage: true });
    checks++;
    if (locale === 'pt-BR') {
      await page.goto(`${origin}/?history=1&locale=${locale}`);
      await page.getByText('Dificuldade: Baixo', { exact: true }).first().waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        'overflow histórico mobile',
      );
      await page.screenshot({ path: `${dir}/historico-dificuldade-nota-mobile.png`, fullPage: true });
      checks++;
    }
    await page.goto(`${origin}/?active=1&completed=1&locale=${locale}`);
    await page.getByRole('radio').first().waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `overflow avaliação ${locale}`,
    );
    await page.screenshot({ path: `${dir}/avaliacao-mobile-${locale}.png`, fullPage: true });
    checks++;
    await page.goto(`${origin}/?confirmation=1&locale=${locale}`);
    await page.getByTestId('pace-exclusion-preview').click();
    await page.getByRole('alertdialog').waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
      `overflow confirmação ${locale}`,
    );
    await page.screenshot({ path: `${dir}/exclusao-mobile-${locale}.png`, fullPage: true });
    checks++;
  }
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      checks,
      errosBrowser: 0,
      locales: 4,
      artefatos: dir,
      fronteiras: 'APIs fictícias; componentes/CSS reais',
    }),
  );
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
