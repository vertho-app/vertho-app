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
  '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/app.css"><style>@font-face{font-family:Inter;src:url(/inter.woff2)}@font-face{font-family:Instrument;src:url(/instrument-serif-italic.woff2);font-style:italic}body{--font-serif:Instrument;--font-inter:Inter;font-family:Inter,sans-serif;min-height:100vh;margin:0;background:#091d35}</style><div id="root"></div><script src="/app.js"></script></html>';
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
  // O atendimento compartilha a largura e a tipografia do shell de vendas.
  await page.evaluate(() => document.fonts.ready);
  const hero = page.getByRole('heading', { level: 1 });
  assert.equal(await hero.evaluate(el => getComputedStyle(el).fontStyle), 'italic');
  assert.equal(await hero.evaluate(el => getComputedStyle(el.closest('header').parentElement).maxWidth), '1100px');
  assert.equal(await page.getByRole('button', { name: 'Iniciar atendimento', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(34, 211, 238)');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await semRolagemLateral(page), true, `overflow início em ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
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
  // Administrador: segmento da empresa e aviso de segmento sem casos (mig 263).
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${origin}/?admin=1&empresa=10000000-0000-4000-8000-000000000009&semCasos=1`);
  await page.getByText(/Ainda não há casos publicados no segmento Recepção de clínica/).waitFor();
  await page.getByRole('combobox', { name: /Segmento do simulador/ }).selectOption('atendimento_loja');
  await page.getByText('Simulador de atendimento · Atendimento em loja', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__recepcaoWrites.at(-1).dominio), 'atendimento_loja');
  await page.screenshot({ path: `${dir}/admin-segmento-desktop.png`, fullPage: true });
  checks++;
  // Quem acompanha (RH): visão por competência, quem não treinou e a revisão com o que a pessoa recebeu.
  await page.goto(`${origin}/?equipe=1`);
  const visao = page.getByRole('region', { name: 'Visão por competência', exact: true });
  await visao.waitFor();
  await visao.getByText('Sem treino no período (1)', { exact: true }).waitFor();
  await visao.getByRole('group').getByText('Carla Dias', { exact: true }).waitFor();
  await expect(visao.locator('tr', { hasText: 'Ana Souza' }).getByText('Nível 3', { exact: true }).first()).toBeVisible();
  const baixar = page.waitForEvent('download');
  await visao.getByRole('button', { name: 'Exportar por pessoa (CSV)', exact: true }).click();
  let csvEquipe = '';
  for await (const chunk of await (await baixar).createReadStream()) csvEquipe += chunk;
  assert.ok(csvEquipe.includes('Ana Souza') && csvEquipe.includes('Acolhimento'), 'CSV por pessoa');
  await page.getByRole('button', { name: 'Abrir atendimento', exact: true }).first().click();
  const revisao = page.getByRole('region', { name: 'Revisão do atendimento', exact: true });
  await revisao.getByText('Desfecho:', { exact: true }).waitFor();
  await revisao.getByText('Média geral:', { exact: true }).waitFor();
  await revisao.getByText('O que funcionou', { exact: true }).waitFor();
  await revisao.getByText(/1ª resposta de quem atende/).first().waitFor();
  await page.screenshot({ path: `${dir}/equipe-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await semRolagemLateral(page), true, 'overflow equipe no celular');
  await page.screenshot({ path: `${dir}/equipe-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks++;
  // Evolução de quem treina: maior nível por competência, só avanço.
  await page.goto(`${origin}/?evolucao=1`);
  const evolucao = page.getByRole('region', { name: 'Sua evolução', exact: true });
  await evolucao.waitFor();
  assert.notEqual(await evolucao.locator('li').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  await expect(evolucao.getByText('Subiu de nível', { exact: true })).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await semRolagemLateral(page), true, 'overflow evolução no celular');
  await page.screenshot({ path: `${dir}/evolucao-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks++;
  await page.goto(`${origin}/?locale=en-US`);
  await page.getByText('Service simulator · Clinic reception', { exact: true }).waitFor();
  checks++;

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errosBrowser: 0, locales: 4, artefatos: dir }));
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
