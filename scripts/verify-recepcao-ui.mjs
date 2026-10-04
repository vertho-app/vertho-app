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
  await page.getByText('Procedimentos do caso', { exact: true }).first().waitFor();
  // A-12 (27/09/2026): a sugestão diz o porquê e, sem caso do degrau sugerido, o que há.
  await page.getByText(/nenhum degrau chegou ainda ao Nível 3/).waitFor();
  await page.getByText(/Ainda não há caso publicado desse degrau; disponível agora: Limite contestado\./).waitFor();
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

  // A-2 (27/09/2026): o mesmo caso tem três degraus publicados. O seletor fica
  // travado na conversa, e o relatório do Limite repete o LIMITE (antes voltava à Introdução).
  await page.goto(`${origin}/?escada=1`);
  const seletorCaso = page.getByRole('combobox').first();
  await page.getByRole('button', { name: 'Iniciar atendimento', exact: true }).waitFor();
  assert.equal(await seletorCaso.inputValue(), 'reg-limite', 'o seletor abre no degrau sugerido');
  await page.getByText(/Você chegou ao Nível 3 em Sob pressão: este é o próximo degrau\./).waitFor();
  assert.equal(await page.getByText(/Ainda não há caso publicado desse degrau/).count(), 0, 'degrau sugerido tem caso');
  await page.getByRole('button', { name: 'Iniciar atendimento', exact: true }).click();
  const campoEscada = page.getByPlaceholder(/^Escreva como você falaria com /);
  await campoEscada.waitFor();
  assert.equal(await seletorCaso.isDisabled(), true, 'o seletor fica travado durante a conversa');
  await campoEscada.fill('Entendo o impacto das duas alterações. Qual horário funciona para você?');
  await page.getByRole('button', { name: 'Enviar resposta', exact: true }).click();
  await page.getByText('Só consigo depois das 17h30, e quero manter a mesma profissional.').first().waitFor();
  // Trocar de atendimento com a conversa em curso pede confirmação.
  await page.getByRole('button', { name: 'Preparar outro atendimento', exact: true }).click();
  await page.getByText(/A conversa em andamento fica em “Seus atendimentos”/).waitFor();
  await page.getByRole('button', { name: 'Voltar à conversa', exact: true }).click();
  await campoEscada.waitFor();
  await page.getByRole('button', { name: 'Encerrar e avaliar', exact: true }).click();
  await page.getByRole('button', { name: 'Gerar relatório', exact: true }).click();
  await page.getByRole('region', { name: 'Devolutiva por competência', exact: true }).waitFor();
  assert.equal(await seletorCaso.inputValue(), 'reg-limite', 'depois do relatório o seletor segue no Limite');
  // A-10: o relatório começa por "degrau · caso" e pelo nível geral; o desfecho vem abaixo,
  // com a leitura do degrau (no Limite, sustentar a recusa é o certo).
  const cabecalho = page.getByRole('region', { name: 'Relatório de atendimento', exact: true }).locator('header').first();
  assert.equal((await cabecalho.locator('h2').textContent()).trim(), 'Limite contestado · A primeira consulta');
  await cabecalho.getByText('Nível geral do atendimento', { exact: true }).waitFor();
  await cabecalho.getByText(/^Nível \d$/).waitFor();
  await cabecalho.getByText(/sustentar a recusa com respeito/).waitFor();
  // Revisão de 04/10/2026: o nível geral aparece uma vez, no cabeçalho; o bloco de
  // competências de quem treinou não o repete como "Nível geral".
  const competenciasDaPessoa = page.getByRole('region', { name: 'Devolutiva por competência', exact: true });
  await competenciasDaPessoa.locator('details').first().waitFor();
  assert.equal(await competenciasDaPessoa.getByText('Nível geral', { exact: true }).count(), 0, 'nível geral repetido abaixo do cabeçalho');
  await page.screenshot({ path: `${dir}/relatorio-cabecalho-desktop.png` });
  await page.getByRole('button', { name: 'Praticar novamente' }).click();
  await campoEscada.waitFor();
  assert.deepEqual(
    await page.evaluate(() => window.__recepcaoWrites.filter((w) => w.acao === 'iniciar').map((w) => w.cenarioId)),
    ['reg-limite', 'reg-limite'],
    '"Praticar novamente" repete o registro do relatório na tela',
  );
  checks++;
  // Caso que saiu do catálogo: aviso e "Escolher outro caso", sem iniciar nada em silêncio.
  await page.goto(`${origin}/?escada=1&concluido=1&retirado=1`);
  await page.getByText(/Este caso saiu do catálogo/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Praticar novamente' }).count(), 0, 'caso retirado sem "Praticar novamente"');
  await page.getByRole('button', { name: 'Escolher outro caso', exact: true }).click();
  await page.getByRole('button', { name: 'Iniciar atendimento', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__recepcaoWrites.filter((w) => w.acao === 'iniciar').length), 0, 'nenhum início com caso retirado');
  checks++;

  // A-11 (27/09/2026): início no celular. O cartão de início vem antes da ficha, com
  // situação, objetivo e procedimentos abertos; o resto da ficha fica recolhido; o título
  // inteiro do caso aparece fora do seletor. "Iniciar" estava a 2.337 px de 2.430.
  {
    const cel = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Sao_Paulo' });
    cel.setDefaultTimeout(15000);
    cel.on('pageerror', (e) => errors.push(e.message));
    await cel.goto(`${origin}/?escada=1`);
    const iniciarCel = cel.getByRole('button', { name: 'Iniciar atendimento', exact: true });
    await iniciarCel.waitFor();
    const topo = (loc) => loc.evaluate((el) => Math.round(el.getBoundingClientRect().top + scrollY));
    const [yIniciar, yFichaInicio] = [await topo(iniciarCel), await topo(cel.locator('#ficha-atendimento'))];
    assert.ok(yIniciar < yFichaInicio, `cartão de início depois da ficha (${yIniciar} x ${yFichaInicio})`);
    assert.ok(yIniciar < 2 * 844, `"Iniciar atendimento" a ${yIniciar}px no celular`);
    const cartao = cel.getByRole('region', { name: 'Atendimento simulado', exact: true });
    await expect(cartao.locator('details[open]')).toHaveCount(1);
    await cartao.getByText('Objetivo do exercício', { exact: true }).waitFor();
    await expect(cel.locator('#ficha-atendimento details[open]')).toHaveCount(0);
    await cel.locator('p', { hasText: /^Limite contestado · A primeira consulta$/ }).first().waitFor();
    assert.equal(await semRolagemLateral(cel), true, 'overflow no início (celular)');
    await cel.screenshot({ path: `${dir}/inicio-mobile.png` });
    await cel.close();
    checks++;
  }

  // A-14 (27/09/2026): voz sem "teste" no rótulo; depois do limite de respostas não há
  // "Gravar" (a transcrição seria recusada com 409), mas "Ouvir" continua.
  {
    const lim = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Sao_Paulo' });
    lim.setDefaultTimeout(15000);
    lim.on('pageerror', (e) => errors.push(e.message));
    await lim.goto(`${origin}/?ativo=1`);
    await lim.getByRole('button', { name: 'Gravar resposta', exact: true }).waitFor();
    await lim.getByText('Voz opcional', { exact: true }).waitFor();
    assert.equal(await lim.getByText(/Voz opcional · teste/).count(), 0, 'rótulo "teste" na voz');
    await lim.goto(`${origin}/?limiteTurnos=1`);
    const aviso = lim.getByText(/Você chegou ao limite deste exercício/);
    await aviso.waitFor();
    await lim.getByRole('button', { name: /^Ouvir / }).waitFor();
    assert.equal(await lim.getByRole('button', { name: 'Gravar resposta', exact: true }).count(), 0, '"Gravar" depois do limite');
    await aviso.scrollIntoViewIfNeeded();
    await lim.screenshot({ path: `${dir}/limite-respostas-mobile.png` });
    await lim.close();
    checks++;
  }

  // A-3 (27/09/2026): a rede cai durante a avaliação (celular). Mensagem traduzida com
  // "Tentar de novo", aviso de que é o relatório e reconsulta automática até ele chegar.
  {
    const rede = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Sao_Paulo' });
    rede.setDefaultTimeout(15000);
    rede.on('pageerror', (e) => errors.push(e.message));
    await rede.clock.install();
    await rede.goto(`${origin}/?ativo=1&falhaRede=1`);
    await rede.getByRole('button', { name: 'Encerrar e avaliar', exact: true }).click();
    await rede.getByRole('button', { name: 'Gerar relatório', exact: true }).click();
    const alerta = rede.getByRole('alert').first();
    await alerta.getByText(/A conexão caiu durante a avaliação/).waitFor();
    assert.equal(await rede.getByText(/Failed to fetch/).count(), 0, 'erro de rede cru na tela');
    await alerta.getByRole('button', { name: 'Tentar de novo', exact: true }).waitFor();
    await rede.getByText(/A avaliação da conversa está em andamento/).waitFor();
    await rede.screenshot({ path: `${dir}/queda-de-rede-mobile.png` });
    const leiturasAntes = await rede.evaluate(() => window.__gets);
    await rede.clock.fastForward(13_000);
    await rede.getByRole('region', { name: 'Devolutiva por competência', exact: true }).waitFor();
    assert.ok((await rede.evaluate(() => window.__gets)) > leiturasAntes, 'a tela reconsultou sozinha');
    assert.equal(await rede.getByRole('alert').count(), 0, 'o aviso de rede sai quando o relatório chega');
    assert.equal(await semRolagemLateral(rede), true, 'overflow na queda de rede');
    await rede.close();
    checks++;
  }

  // A-5 (27/09/2026): histórico em páginas de 20; o atendimento aberto com resposta que
  // ficou fora da primeira página aparece em "Atendimentos em aberto para retomar".
  await page.goto(`${origin}/?historicoLongo=1`);
  const abertos = page.getByRole('region', { name: 'Atendimentos em aberto para retomar', exact: true });
  await abertos.getByText('Caso antigo em aberto').waitFor();
  const historico = page.getByRole('region', { name: 'Seus atendimentos', exact: true });
  await expect(historico.getByRole('button')).toHaveCount(20);
  await page.getByRole('button', { name: 'Ver atendimentos anteriores', exact: true }).click();
  await expect(historico.getByRole('button')).toHaveCount(22);
  await historico.getByText('Caso antigo em aberto').waitFor();
  assert.equal(await abertos.count(), 0, 'o bloco de abertos some quando o atendimento entra na lista');
  assert.equal(await page.getByRole('button', { name: 'Ver atendimentos anteriores', exact: true }).count(), 0, 'sem mais páginas');
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
  // A-9: aviso ao administrador de que habilitar agora deixa a equipe sem caso.
  await page.getByText(/O segmento Recepção de clínica ainda não tem casos publicados/).waitFor();
  await page.getByRole('combobox', { name: /Segmento do simulador/ }).selectOption('atendimento_loja');
  await page.getByText('Simulador de atendimento · Atendimento em loja', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__recepcaoWrites.at(-1).dominio), 'atendimento_loja');
  await page.screenshot({ path: `${dir}/admin-segmento-desktop.png`, fullPage: true });
  checks++;
  // A-9 (27/09/2026): empresa sem configuração (como a 4Life). Nada de "Recepção de clínica"
  // como se fosse escolha: "segmento não definido", aviso e "Habilitar" travado até escolher.
  await page.goto(`${origin}/?admin=1&empresa=10000000-0000-4000-8000-000000000009&semSegmento=1`);
  await page.getByText('Simulador de atendimento · Segmento não definido', { exact: true }).waitFor();
  const segmentoSelect = page.getByRole('combobox', { name: /Segmento do simulador/ });
  assert.equal(await segmentoSelect.inputValue(), '', 'o seletor não finge um segmento escolhido');
  await page.getByText(/Esta empresa ainda não tem segmento definido/).waitFor();
  const habilitar = page.getByRole('button', { name: 'Habilitar para a equipe', exact: true });
  assert.equal(await habilitar.isDisabled(), true, '"Habilitar" sem segmento');
  await page.screenshot({ path: `${dir}/admin-sem-segmento-desktop.png`, fullPage: true });
  await segmentoSelect.selectOption('secretaria_escolar');
  await page.getByText('Simulador de atendimento · Secretaria escolar', { exact: true }).waitFor();
  assert.equal(await habilitar.isDisabled(), false, '"Habilitar" liberado depois de escolher');
  await habilitar.click();
  await page.getByText('Disponível para a equipe desta empresa.', { exact: true }).waitFor();
  assert.deepEqual(
    await page.evaluate(() => window.__recepcaoWrites.filter((w) => 'habilitado' in w).map((w) => [w.habilitado, w.dominio ?? null])),
    [[false, 'secretaria_escolar'], [true, null]],
  );
  checks++;
  // Quem acompanha (RH): visão por competência, quem não treinou e o detalhe com o que a pessoa recebeu.
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
  // A-6 (27/09/2026): treino concluído sem média geral não é "Em andamento".
  const semMedia = page.locator('tr', { hasText: '10/09/2026' });
  // Desde 04/10/2026 (R-35) a tabela diz o nível, e "Sem nível" no lugar de "Sem nota".
  await expect(semMedia.getByText('Sem nível', { exact: true }).first()).toBeVisible();
  assert.equal(await page.getByText('Em andamento', { exact: true }).count(), 0, 'concluído sem média aparece como "Em andamento"');
  await page.getByRole('button', { name: 'Abrir atendimento', exact: true }).first().click();
  const detalhe = page.getByRole('region', { name: 'Detalhe do atendimento', exact: true });
  await detalhe.getByText('Desfecho:', { exact: true }).waitFor();
  await detalhe.getByText('Nível geral:', { exact: true }).waitFor();
  await detalhe.getByText('O que funcionou', { exact: true }).waitFor();
  // R-10 (03/10/2026): a conversa fica com quem treinou; as citações seguem situadas
  // ("1ª resposta de quem atende") dentro de cada competência, que abre recolhida.
  await detalhe.getByText('A conversa fica com quem treinou', { exact: true }).waitFor();
  await detalhe.locator('details > summary').first().click();
  await detalhe.getByText(/1ª resposta de quem atende/).first().waitFor();
  // Sem revisão humana (decisão do dono, 22/09/2026): o detalhe é só leitura.
  assert.equal(await page.getByRole('button', { name: 'Registrar revisão' }).count(), 0, 'botão de revisão no detalhe');
  assert.equal(await page.getByText('Motivo e evidências').count(), 0, 'campo de parecer no detalhe');
  await page.screenshot({ path: `${dir}/equipe-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await semRolagemLateral(page), true, 'overflow equipe no celular');
  await page.screenshot({ path: `${dir}/equipe-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks++;
  // A-13 (27/09/2026): equipe no celular. "Abrir atendimento" à vista (a coluna "Ação" ficava
  // cortada) e, ao abrir, o detalhe entra na tela com foco (começava a 834 px de 844).
  {
    const eq = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Sao_Paulo' });
    eq.setDefaultTimeout(15000);
    eq.on('pageerror', (e) => errors.push(e.message));
    await eq.goto(`${origin}/?equipe=1`);
    const abrirCel = eq.getByRole('button', { name: 'Abrir atendimento', exact: true }).first();
    await abrirCel.waitFor({ state: 'attached' });
    // Só rolagem VERTICAL da página: `scrollIntoViewIfNeeded` rolaria a tabela na horizontal
    // e esconderia justamente o corte que a pessoa vê.
    const inteiro = await abrirCel.evaluate((el) => {
      window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 200);
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth;
    });
    assert.equal(inteiro, true, '"Abrir atendimento" cortado no celular');
    await eq.screenshot({ path: `${dir}/equipe-lista-mobile.png` });
    await abrirCel.click();
    const detCel = eq.getByRole('region', { name: 'Detalhe do atendimento', exact: true });
    await detCel.waitFor();
    await eq.waitForTimeout(300);
    const topoDet = await detCel.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    assert.ok(topoDet >= -2 && topoDet < 120, `detalhe fora da tela no celular (topo a ${topoDet}px)`);
    assert.equal(await detCel.evaluate((el) => el === document.activeElement), true, 'o detalhe recebe o foco');
    assert.equal(await semRolagemLateral(eq), true, 'overflow na equipe (celular)');
    await eq.screenshot({ path: `${dir}/equipe-detalhe-mobile.png` });
    await eq.close();
    checks++;
  }
  // A-16 (27/09/2026): abrir a biblioteca e o editor de cenários não busca mais a biblioteca
  // de competências (não alterava nada). A-15: o editor pede o nome do estabelecimento do segmento.
  await page.goto(`${origin}/?cenarios=1`);
  await page.getByRole('button', { name: 'Cenários', exact: true }).click();
  await page.getByRole('heading', { name: 'Biblioteca de cenários', exact: true }).waitFor();
  await page.getByText('Catálogo Vertho · publicado', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Criar caso', exact: true }).click();
  await page.getByRole('heading', { name: 'Nova versão do caso', exact: true }).waitFor();
  await page.getByText('Nome fictício da clínica', { exact: true }).waitFor();
  await page.getByText('Pessoas simuladas e variantes', { exact: true }).waitFor();
  assert.deepEqual(
    await page.evaluate(() => window.__gestaoGets.filter((u) => u.includes('visao=competencias'))),
    [],
    'a biblioteca de competências ainda é buscada ao abrir cenários',
  );
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
  // Nome do produto nos 4 idiomas desde 04/10/2026 (`7242ab05`, um nome por conceito).
  await page.getByText('Customer service simulator · Clinic reception', { exact: true }).waitFor();
  checks++;

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, errosBrowser: 0, locales: 4, artefatos: dir }));
} finally {
  if (browser) await browser.close();
  await new Promise((r) => server.close(r));
}
