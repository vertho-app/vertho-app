// Verificação visual do simulador de atendimento (18/09/2026): componentes, CSS e
// núcleo reais; API fictícia, sem login, banco ou IA. Mesmo desenho do
// verify-pace-ui. Uso: node scripts/verify-recepcao-ui.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium, expect } from '@playwright/test';

const dir = 'tmp/recepcao-ui';
mkdirSync(dir, { recursive: true });
await build({
  entryPoints: ['tests/browser/recepcao.entry.tsx'],
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
        b.onResolve({ filter: /^node:crypto$/ }, () => ({ path: 'crypto', namespace: 'qa' }));
        b.onLoad({ filter: /.*/, namespace: 'qa' }, (a) => ({
          contents:
            a.path === 'fetch'
              ? 'export const fetchAuth=(...args)=>window.__recepcaoFetch(...args);'
              : a.path === 'crypto'
                ? 'export const randomUUID=()=>crypto.randomUUID(); export const randomInt=(n)=>0; export const createHash=()=>{throw new Error("sem hash no navegador")};'
                : 'export const useSearchParams=()=>new URLSearchParams(location.search); export const useRouter=()=>({back:()=>{}});',
          loader: 'js',
        }));
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
});
const css = await postcss([tailwind({ base: process.cwd() })]).process(readFileSync('app/globals.css', 'utf8'), {
  from: path.resolve('app/globals.css'),
});
writeFileSync(`${dir}/globals.css`, css.css);
const html =
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"><style>@font-face{font-family:Inter;src:url(/inter.woff2)}body{font-family:Inter,sans-serif;min-height:100vh;margin:0;background:#fff}</style><div id="root"></div><script src="/app.js"></script></html>';
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
  };
  if (!files[name]) {
    res.statusCode = 404;
    res.end();
    return;
  }
  res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'font/woff2');
  res.end(readFileSync(files[name]));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
let checks = 0;
const semRolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Sao_Paulo' });
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));

  // Início: segmento no cabeçalho, caso sem versão para quem treina, ficha neutra.
  await page.goto(origin);
  await page.getByText('Simulador de atendimento · Recepção de clínica', { exact: true }).waitFor();
  // O nome acessível do select inclui a opção escolhida; o rótulo se confere à parte.
  await page.getByText(/^Caso para o próximo atendimento/).first().waitFor();
  const opcao = await page.getByRole('combobox').first().locator('option').first().textContent();
  assert.ok(!/·\s*\d/.test(opcao || ''), `versão do caso na tela de quem treina: ${opcao}`);
  await page.getByText('Procedimentos do caso', { exact: true }).waitFor();
  assert.equal(await page.getByText('Procedimentos da clínica').count(), 0);
  await page.screenshot({ path: `${dir}/inicio-desktop.png`, fullPage: true });
  checks++;

  // Conversa: iniciar, responder pelo nome da pessoa simulada.
  await page.getByRole('button', { name: 'Iniciar atendimento', exact: true }).click();
  const campo = page.getByPlaceholder(/^Escreva como você falaria com /);
  await campo.waitFor();
  await campo.fill('Entendo o impacto das duas alterações. Qual horário funciona para você?');
  await page.getByRole('button', { name: 'Enviar resposta', exact: true }).click();
  await page.getByText('Só consigo depois das 17h30, e quero manter a mesma profissional.').first().waitFor();
  assert.equal(await page.evaluate(() => window.__recepcaoWrites.at(-1).acao), 'responder');
  checks++;

  // Encerrar e ler a devolutiva no formato comum.
  await page.getByRole('button', { name: 'Encerrar e avaliar', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar relatório', exact: true }).click();
  const devolutiva = page.getByRole('region', { name: 'Devolutiva por competência', exact: true });
  await devolutiva.waitFor();
  await expect(devolutiva.locator(':scope > details')).toHaveCount(5);
  await expect(devolutiva.getByText('Evidência insuficiente', { exact: true })).toHaveCount(1);
  await devolutiva.getByText('3 de 6 comportamentos observados', { exact: true }).waitFor();
  const procedimentos = devolutiva.locator(':scope > details').nth(4);
  await procedimentos.locator('summary').first().click();
  await procedimentos.getByText(/não conferiu com o que foi dito/).waitFor();
  const acolhimento = devolutiva.locator(':scope > details').nth(0);
  await acolhimento.locator('summary').first().click();
  await acolhimento.getByText('Sua 1ª resposta').first().waitFor();
  assert.equal(await page.getByText(/N[1-4] ·/).count(), 0, 'rótulo antigo "N3 ·" na devolutiva');
  await page.screenshot({ path: `${dir}/relatorio-desktop.png`, fullPage: true });
  checks++;

  // Outro segmento: o cabeçalho acompanha o caso.
  await page.goto(`${origin}/?segmento=atendimento_loja`);
  await page.getByText('Simulador de atendimento · Atendimento em loja', { exact: true }).waitFor();
  checks++;

  // Celular: com conversa em curso, a conversa vem antes da ficha, que fica a um toque.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/?ativo=1`);
  const conversa = page.getByRole('log');
  await conversa.waitFor();
  const [yConversa, yFicha] = await Promise.all([
    conversa.boundingBox().then((b) => b.y),
    page.locator('#ficha-atendimento').boundingBox().then((b) => b.y),
  ]);
  assert.ok(yConversa < yFicha, 'no celular a conversa vem antes da ficha');
  await page.getByRole('link', { name: 'Ver ficha', exact: true }).waitFor();
  assert.equal(await semRolagemLateral(page), true, 'overflow conversa no celular');
  await page.screenshot({ path: `${dir}/conversa-mobile.png`, fullPage: true });
  checks++;

  for (const locale of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
    await page.goto(`${origin}/?concluido=1&locale=${locale}`);
    await page.locator('section > details').first().waitFor();
    await page.locator('section > details').nth(1).locator('summary').first().click();
    assert.equal(await semRolagemLateral(page), true, `overflow relatório ${locale}`);
    await page.screenshot({ path: `${dir}/relatorio-mobile-${locale}.png`, fullPage: true });
    checks++;
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/?locale=en-US`);
  await page.getByText('Service simulator · Clinic reception', { exact: true }).waitFor();
  checks++;

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errosBrowser: 0, locales: 4, artefatos: dir }));
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
