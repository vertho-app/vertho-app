import { verificarMatrizUI } from '../tests/browser/pace-matriz.checks.ts';
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
  await expect(page.getByRole('button', { name: 'Nova simulação', exact: true })).toBeDisabled();
  await page.getByText('Conclua a simulação atual para iniciar uma nova.', { exact: true }).waitFor();
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
  // D3: quem escreve o comentário sabe quem lê.
  await expect(page.getByLabel('Comentário (opcional)', { exact: true })).toHaveAccessibleDescription(
    /^RH e liderança leem os comentários sem o seu nome e sem data, e só quando pelo menos 5 pessoas/,
  );
  await page.screenshot({ path: `${dir}/avaliacao-antes-relatorio-desktop.png`, fullPage: true });
  const notasMaximas = await page.getByRole('radio', { name: '5 de 5', exact: true }).all();
  assert.equal(notasMaximas.length, 5);
  for (const nota of notasMaximas) await nota.check();
  await page.getByRole('button', { name: 'Enviar avaliação e abrir devolutiva', exact: true }).click();
  await page.getByText('Avance no diagnóstico antes de propor.', { exact: true }).waitFor();
  // Escala comum 1 a 4 desde 17/09 (pace-6); a leitura pública converte toda versão.
  assert.equal(await page.locator('meter').first().getAttribute('min'), '1');
  await page.screenshot({ path: `${dir}/relatorio-desktop.png`, fullPage: true });
  checks += 2;
  await page.goto(`${origin}/?active=1&completed=1&rated=1&zero=1`);
  const engajamentoZero = page.locator('article').filter({
    has: page.getByRole('heading', { name: 'Engajamento', exact: true }),
  });
  await engajamentoZero.getByText('—', { exact: true }).waitFor();
  // Sem evidência não há nota: o pilar mostra "—" e nenhum medidor (a escala 1 a 4 não tem zero).
  assert.equal(await engajamentoZero.locator('meter').count(), 0);
  await page.screenshot({ path: `${dir}/relatorio-nota-zero-desktop.png`, fullPage: true });
  checks++;
  await page.goto(`${origin}/?active=1&processing=1`);
  await page.getByText('Há uma resposta em processamento.', { exact: false }).waitFor();
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeDisabled();
  await page.reload();
  await page.getByText('Há uma resposta em processamento.', { exact: false }).waitFor();
  await page.screenshot({ path: `${dir}/processando-desktop.png`, fullPage: true });
  await page.evaluate(() => window.__paceLiberar());
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeEnabled({ timeout: 12000 });
  checks++;
  // D2 (27/09/2026): com a devolutiva esperando a pesquisa, o histórico não
  // mostra a nota e "Nova simulação" deixa de ser o botão primário.
  await page.goto(`${origin}/?matrix=1&completed=1&regua=pace-7&pendente=1`);
  await page.getByRole('heading', { name: 'Conte como foi a experiência', exact: true }).waitFor();
  const meusTreinos = page.getByRole('navigation', { name: 'Seus treinos', exact: true });
  await meusTreinos.getByText('Pesquisa pendente', { exact: true }).waitFor();
  assert.equal(await meusTreinos.getByText(/Nota PACE/).count(), 0, 'nota antes da pesquisa');
  await page.getByText(/^Sua devolutiva está pronta e abre depois da pesquisa de experiência/).waitFor();
  const fundo = (nome) =>
    page.getByRole('button', { name: nome, exact: true }).evaluate((b) => getComputedStyle(b).backgroundColor);
  const fundoPrimario = await fundo('Enviar avaliação e abrir devolutiva');
  assert.notEqual(await fundo('Nova simulação'), fundoPrimario, '"Nova simulação" primário com pesquisa pendente');
  await page.screenshot({ path: `${dir}/pesquisa-pendente-desktop.png`, fullPage: false });
  for (const nota of await page.getByRole('radio', { name: '5 de 5', exact: true }).all()) await nota.check();
  await page.getByRole('button', { name: 'Enviar avaliação e abrir devolutiva', exact: true }).click();
  await meusTreinos.getByText('Nota PACE 3', { exact: true }).waitFor();
  assert.equal(await fundo('Nova simulação'), fundoPrimario, '"Nova simulação" volta a ser primário');
  checks++;
  // V-3 (27/09/2026): 504 do gateway em HTML vira mensagem traduzida, o texto
  // fica no campo e tentar de novo reaproveita o mesmo requestId.
  await page.goto(`${origin}/?active=1`);
  await page.evaluate(() => (window.__pace504 = 1));
  const campo504 = page.getByLabel('Sua mensagem', { exact: true });
  await campo504.fill('Qual é o prazo que vocês têm hoje?');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page
    .getByRole('alert')
    .getByText(/^O servidor não respondeu como esperado\. Tente de novo: se o envio já tiver chegado/)
    .waitFor();
  assert.equal(await page.getByText(/Unexpected token|is not valid JSON/).count(), 0, 'erro cru do navegador na tela');
  await expect(campo504).toHaveValue('Qual é o prazo que vocês têm hoje?');
  await page.screenshot({ path: `${dir}/erro-504-desktop.png`, fullPage: false });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await page.getByText('Qual é o prazo que vocês têm hoje?', { exact: true }).waitFor();
  const [primeira, segunda] = await page.evaluate(() => window.__paceWrites.slice(-2));
  assert.equal(primeira.acao, 'responder');
  assert.equal(segunda.requestId, primeira.requestId, 'a nova tentativa reaproveita a chave idempotente');
  checks++;
  // V-1 (27/09/2026): prazo vencido há 1 h com conversa aberta. Não se conversa
  // mais, mas a devolutiva ainda sai por 24 h, e a tela diz até quando.
  await page.goto(`${origin}/?active=1&expired=grace`);
  const encerrarTolerancia = page.getByRole('button', { name: 'Encerrar e receber devolutiva', exact: true });
  await expect(encerrarTolerancia).toBeEnabled();
  await expect(page.getByLabel('Sua mensagem', { exact: true })).toBeDisabled();
  const ateHora = /\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}\.$/;
  await page.getByText(/^O prazo de treino terminou\. Você ainda pode pedir a devolutiva desta conversa até /).waitFor();
  assert.match(await page.getByText(/^Você pode pedir sua devolutiva até /).innerText(), ateHora, 'hora local sem segundos');
  await page.reload();
  await expect(encerrarTolerancia).toBeEnabled();
  await page.screenshot({ path: `${dir}/prazo-tolerancia-desktop.png`, fullPage: true });
  await encerrarTolerancia.click();
  await page.getByRole('button', { name: 'Confirmar encerramento', exact: true }).click();
  await page.getByRole('heading', { name: 'Conte como foi a experiência', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__paceWrites.at(-1).acao), 'encerrar');
  await page.goto(`${origin}/?active=1&expired=1`);
  await expect(page.getByRole('button', { name: 'Encerrar e receber devolutiva', exact: true })).toBeDisabled();
  await page.getByText(/^O prazo de acesso não está vigente/).waitFor();
  assert.equal(await page.getByText(/pedir sua devolutiva até/).count(), 0, 'sem aviso fora da tolerância');
  checks++;
  await page.goto(`${origin}/?history=1`);
  await expect(page.getByRole('button', { name: 'Nova simulação', exact: true })).toBeEnabled();
  await page.getByText('Dificuldade: Baixo', { exact: true }).first().waitFor();
  await page.getByText('Nota PACE 2,95', { exact: true }).first().waitFor();
  await page.screenshot({ path: `${dir}/historico-dificuldade-nota-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Carregar mais', exact: true }).click();
  await page.getByRole('button', { name: /Cliente 31/ }).click();
  await page.getByRole('heading', { name: 'Conte como foi a experiência', exact: true }).waitFor();
  checks++;
  await page.goto(`${origin}/?admin=1&empresa=${empresaA}&history=1`);
  await page.getByRole('button', { name: 'Acompanhamento da equipe', exact: true }).click();
  // Visão da equipe (18/09): quem não começou, níveis por pessoa e a pesquisa.
  const visao = page.getByRole('region', { name: 'Visão da equipe', exact: true });
  await visao.waitFor();
  await visao.getByText('Ainda não começaram (2)', { exact: true }).waitFor();
  await visao.getByText('Carla', { exact: true }).first().waitFor();
  const linhaAna = visao.locator('tr', { hasText: 'Ana Souza' });
  await expect(linhaAna.getByText('Subiu de nível', { exact: true })).toHaveCount(3);
  const pesquisa = page.getByRole('region', { name: 'Pesquisa de experiência', exact: true });
  await pesquisa.getByText('6 respostas.', { exact: true }).waitFor();
  await pesquisa.getByText('O cliente pareceu uma pessoa de verdade.', { exact: true }).waitFor();
  await pesquisa.getByText('Queria um cliente mais difícil.', { exact: true }).waitFor();
  assert.equal(await pesquisa.getByText(/Ana Souza/).count(), 0, 'comentário sai sem o nome');
  // D3 (27/09/2026): sem data. A data do comentário era o "Último treino" de quem escreveu.
  assert.equal(await pesquisa.getByText(/\d{2}\/\d{2}\/\d{4}/).count(), 0, 'comentário sai sem data');
  const baixarEquipe = page.waitForEvent('download');
  await visao.getByRole('button', { name: 'Exportar por pessoa (CSV)', exact: true }).click();
  let csvEquipe = '';
  for await (const chunk of await (await baixarEquipe).createReadStream()) csvEquipe += chunk;
  assert.ok(csvEquipe.includes('Ana Souza') && csvEquipe.includes("'=Diego"), 'CSV por pessoa com escape de fórmula');
  await page.screenshot({ path: `${dir}/visao-equipe-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    'overflow visão da equipe',
  );
  await page.screenshot({ path: `${dir}/visao-equipe-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1080 });
  checks++;
  // V-7 (27/09/2026): a gestão recebe o relatório como a produção gera (pace-7,
  // matriz) e a nota da lista é a nota da devolutiva. O harness antigo mandava
  // um relatório 0 a 10 marcado como pace-7 e a tela mostrava "10 / 4".
  const linhaTreino = page.locator('tr', { has: page.getByRole('button', { name: 'Ver relatório', exact: true }) }).first();
  assert.equal((await linhaTreino.locator('td').nth(3).innerText()).trim(), '2,8', 'nota da lista');
  await linhaTreino.getByRole('button', { name: 'Ver relatório', exact: true }).click();
  await page.getByText('Avance no diagnóstico antes de propor.', { exact: true }).waitFor();
  const devolutivaEquipe = page.getByRole('region', { name: 'Devolutiva por competência', exact: true });
  await devolutivaEquipe.getByText('2,8 de 4', { exact: true }).waitFor();
  await expect(devolutivaEquipe.getByText('Nível 2', { exact: true }).first()).toBeVisible();
  assert.equal(await page.getByText(/\d+ \/ 4$/).count(), 0, 'nota 0 a 10 exibida como se fosse 1 a 4');
  await page.screenshot({ path: `${dir}/equipe-desktop.png`, fullPage: true });
  // Sem revisão humana (decisão do dono, 22/09/2026): a gestão lê o relatório, não registra parecer.
  assert.equal(await page.getByRole('region', { name: 'Revisão humana' }).count(), 0, 'bloco de revisão na gestão');
  assert.equal(await page.getByRole('button', { name: 'Registrar revisão' }).count(), 0, 'botão de revisão na gestão');
  checks++;
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
  checks += await verificarMatrizUI(page, origin, dir);
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
