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
  const rascunhos = () =>
    page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes(':rascunho:')).length);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Sua preparação para o encontro').fill(plano);
    if (i === 0) {
      // Rascunho no aparelho (27/09/2026): o F5 apagava a preparação.
      await page.reload();
      await expect(page.getByLabel('Sua preparação para o encontro')).toHaveValue(plano);
      await expect(page.getByText('Rascunho salvo neste aparelho', { exact: false })).toBeVisible();
      await page.locator('form').first().screenshot({ path: `${dir}/preparacao-rascunho.png` });
    }
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
        // Resposta perdida com a fala salva: a leitura seguinte mostra a fala, e
        // a caixa e o aviso somem sozinhos, sem convidar a mandar de novo (27/09/2026).
        await expect(
          page.getByText('1 de 16 rodadas', { exact: false }),
        ).toBeVisible();
        await expect(page.locator('#lideranca-fala')).toHaveValue('');
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
      await expect(
        page.getByText(`${j + 1} de 16 rodadas`, { exact: false }),
      ).toBeVisible();
    }
    if (i === 1) {
      // Corrida (27/09/2026): a rede cai, o reenvio com o mesmo pedido bate no
      // lock (423) e o original conclui. A fala entra UMA vez e a caixa esvazia.
      const corrida = 'Mensagem que saiu quando a rede caiu.';
      await page.locator('#lideranca-fala').fill(corrida);
      await page.evaluate(() => {
        window.__redeCaiNext = true;
      });
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Falha de conexão');
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      await expect(page.getByText('4 de 16 rodadas', { exact: false })).toBeVisible();
      await expect(page.locator('#lideranca-fala')).toHaveValue('');
      await expect(page.getByRole('alert')).toHaveCount(0);
      assert.equal(await page.getByRole('log').getByText(corrida, { exact: true }).count(), 1, 'fala duplicada depois do 423');
      const pedidos = await page.evaluate(
        (texto) => [...new Set(window.__posts.filter((p) => p.texto === texto).map((p) => p.requestId))].length,
        corrida,
      );
      assert.equal(pedidos, 1, 'o reenvio depois da queda usou outro pedido');
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
      assert.equal(await rascunhos(), 0, 'rascunho da preparação depois do envio confirmado');
    }
    await page
      .getByRole('button', { name: 'Concluir conversa', exact: true })
      .click();
    await page
      .getByLabel('O que você percebeu', { exact: false })
      .fill(reflexao);
    if (i === 0) {
      // Quem recarrega no meio da reflexão volta para ela, com o texto.
      await page.reload();
      await expect(page.getByLabel('O que você percebeu', { exact: false })).toHaveValue(reflexao);
      await expect(page.getByText('Rascunho salvo neste aparelho', { exact: false })).toBeVisible();
    }
    // O fim da jornada é conferido no celular (a primeira tela que a pessoa vê).
    if (i === 4) await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('button', { name: 'Registrar reflexão e receber devolutiva' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'O que sua atuação mostrou' }),
    ).toBeVisible();
    if (i === 0) {
      assert.equal(await rascunhos(), 0, 'rascunho da reflexão depois do envio confirmado');
      // A próxima prática e o que fazer com ela ficam juntas, no topo da devolutiva (27/09/2026).
      const y = async (loc) => (await loc.boundingBox()).y;
      const yPratica = await y(page.getByRole('heading', { name: 'Próxima prática' }));
      const yAcao = await y(page.getByRole('button', { name: 'Continuar para o encontro 2' }));
      const yCompetencias = await y(page.getByRole('region', { name: 'Devolutiva por competência' }).last());
      assert(yPratica < yAcao && yAcao < yCompetencias, 'ações da devolutiva junto da próxima prática, antes das competências');
    }
    if (i === 4) {
      // Fim da jornada (27/09/2026): a tela para na síntese, aberta, com a sugestão à vista.
      await expect(page.getByText('Sua jornada completa')).toBeInViewport();
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${dir}/fim-jornada-celular.png` });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
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
  // Fim da jornada (27/09/2026): a síntese vem ABERTA e ACIMA da devolutiva, com a
  // sugestão de repetição e o botão dela. Até então ficava recolhida, e o único
  // botão à vista repetia o 5º encontro, não o sugerido.
  await expect(page.getByText('Sua jornada completa')).toBeVisible();
  await expect(page.getByText('Próximo treino sugerido')).toBeVisible();
  // E a jornada é onde a média vive (ou diz o que falta para ela existir).
  await expect(page.getByText(/Média da jornada: Nível|A média aparece quando/)).toBeVisible();
  const ySintese = (await page.getByText('Sua jornada completa').boundingBox()).y;
  const yDevolutiva = (await page.getByRole('heading', { name: 'O que sua atuação mostrou' }).boundingBox()).y;
  assert(ySintese < yDevolutiva, 'a síntese do fim da jornada fica acima da devolutiva');
  await page.screenshot({ path: `${dir}/sintese-desktop.png`, fullPage: true });
  const sugerido = page.getByRole('button', { name: /^Repetir o encontro \d$/ });
  const nSugerido = Number((await sugerido.innerText()).match(/\d/)[0]);
  await sugerido.click();
  // Repetir pede confirmação (antes disparava na hora uma chamada paga), e a do
  // botão da sugestão já é a do encontro sugerido.
  await expect(page.getByRole('alertdialog')).toContainText(`Repetir o encontro ${nSugerido}?`);
  await page.getByRole('button', { name: 'Sim, repetir' }).click();
  await expect(
    page.getByText('Repetição para praticar:', { exact: false }),
  ).toBeVisible();
  const TITULOS = ['Antes de concluir', 'Espaço para crescer', 'A conversa necessária', 'Nem tudo cabe', 'O que você muda'];
  await expect(page.getByRole('heading', { name: TITULOS[nSugerido - 1] })).toBeVisible();
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
    page.getByRole('button', { name: new RegExp(`Encontro ${nSugerido} · Repetição`) }),
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
  // A equipe vê a próxima prática que a pessoa recebeu (o dado já chegava e não era mostrado).
  // (o último encontro vem aberto)
  await expect(page.getByText('Orientação sugerida à pessoa').last()).toBeVisible();
  await expect(page.getByText('Pergunte como um pedido chega e por quais etapas passa.').last()).toBeVisible();
  // D1 (27/09/2026): a evidência da preparação aparece pela fonte e pelo nível,
  // sem o texto; a conversa segue citada. Até então o gestor lia a preparação entre aspas.
  const e1 = page.locator('details').filter({ hasText: 'Encontro 1 · Jornada original' }).first();
  await e1.locator('summary').first().click();
  const comunicacao = e1.locator('details').filter({ hasText: 'Comunicação e Conversas de Liderança' }).first();
  await comunicacao.locator('summary').first().click();
  await expect(comunicacao.getByText('Evidência da preparação (o texto fica com a pessoa)').first()).toBeVisible();
  assert.equal(await page.getByText(plano.slice(0, 40), { exact: false }).count(), 0, 'texto da preparação na visão da equipe');
  assert.equal(await page.getByText(reflexao.slice(0, 40), { exact: false }).count(), 0, 'texto da reflexão na visão da equipe');
  const analise = e1.locator('details').filter({ hasText: 'Análise e Diagnóstico de Situações' }).first();
  await analise.locator('summary').first().click();
  await expect(analise.getByText(fala, { exact: false }).first()).toBeVisible();
  await comunicacao.screenshot({ path: `${dir}/equipe-evidencia-preparacao.png` });
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
