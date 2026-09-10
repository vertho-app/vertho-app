const { test, expect } = require('@playwright/test');
const { login } = require('./helpers/auth');

test.describe('Navegação pública', () => {
  test('home redireciona para login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('login exibe branding Vertho', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Sua jornada de desenvolvimento')).toBeVisible();
  });
});

test.describe('Navegação autenticada', () => {
  // O login vai pelo helper compartilhado (era copiado aqui): é ele que checa
  // se a conta tem vínculo em `colaboradores` antes de qualquer asserção de
  // tela. Login duplicado significava que este arquivo não passava por essa
  // checagem — e foi exatamente aqui que 4 das 5 falhas apareceram.
  test.beforeEach(async ({ page }) => {
    const ok = await login(page);
    test.skip(!ok, 'SMOKE_EMAIL/SMOKE_PASS não definidos');
  });

  test('dashboard carrega', async ({ page }) => {
    // Hero card ou qualquer elemento do dashboard
    await expect(page.locator('text=/evolução|Próximo Passo|Acesso/i').first()).toBeVisible();
  });

  test('navegação lateral funciona (visão RH)', async ({ page }) => {
    // 30/08: o teste antigo ("bottom nav": Jornada/Praticar/Perfil) era do
    // layout de COLABORADOR; a conta de smoke é RH e a sidebar dela tem outros
    // itens. As rotas de colaborador seguem cobertas por URL no
    // fluxos-criticos.spec.js; conta colaboradora de smoke fica para a fase 2.
    await page.getByRole('button', { name: 'Equipe' }).click();
    await page.waitForURL('**/gestor**');

    // exact: o avatar também é botão "Perfil de Smoke E2E" (strict mode, 30/08)
    await page.getByRole('button', { name: 'Perfil', exact: true }).click();
    await page.waitForURL('**/perfil');

    await page.getByRole('button', { name: 'Início', exact: true }).click();
    await page.waitForURL('**/dashboard');
  });

  test('assessment lista competências', async ({ page }) => {
    await page.goto('/dashboard/assessment');
    await expect(page.locator('text=/Suas Competências|Nenhuma competência|Avaliação/i').first()).toBeVisible();
  });

  test('perfil comportamental mostra resultado ou mapeamento', async ({ page }) => {
    await page.goto('/dashboard/perfil-comportamental');
    await expect(page.locator('text=/Dominância|Iniciar Mapeamento|Mapeamento Comportamental/i').first()).toBeVisible();
  });

  // O chat abre com UMA mensagem do assistente (a saudação). Responder é a
  // segunda — por isso a asserção conta balões, e não "existe balão".
  //
  // 🔴 A âncora anterior era `.bg-white/[0.06]` — e o problema NÃO era ela
  // falhar: era ela PASSAR sem olhar o chat. A cor do balão do Beto é style
  // inline, então a classe não existe no componente; ela existe em outras oito
  // partes da tela do RH. `Medido: 09/09/2026` em produção — antes mesmo de
  // abrir o chat, o seletor casava **8 elementos**, e o `.last()` deles já
  // estava visível: a barrinha de progresso do funil (`home-rh.tsx:89`,
  // `h-[3px] rounded-full`). O teste afirmava que o Beto tinha respondido
  // olhando para uma barra de progresso.
  //
  // Ele só ficou vermelho quando a conta de smoke foi apagada e a tela passou a
  // renderizar apenas "Colaborador não encontrado" — sem nenhuma barra. Ou
  // seja: os 10 dias de vermelho foram o que revelou o teste que mentia há
  // muito mais tempo. Agora a âncora é `data-beto-msg`, que o componente
  // declara para este fim.
  test('BETO chat abre e responde', async ({ page }) => {
    await page.getByText('BETO').click();
    const campo = page.getByPlaceholder('Pergunte ao Beto');
    await expect(campo).toBeVisible();

    const respostas = page.locator('[data-beto-msg="assistant"]');
    await expect(respostas).toHaveCount(1); // a saudação, antes de perguntar

    await campo.fill('Olá');
    await page.locator('button[type="submit"]').last().click();
    await expect(page.locator('[data-beto-msg="user"]')).toHaveCount(1);

    // Chamada de IA real: 15s era curto — medido 09/09, o indicador de digitação
    // ainda estava na tela quando o relógio virou.
    await expect(respostas).toHaveCount(2, { timeout: 45000 });

    // 🔴 O componente insere a mensagem de ERRO como fala do assistente (o
    // `catch` do handleSend). Sem esta linha, "o Beto respondeu" continuaria
    // verde com a IA fora do ar — que é o único caso em que este teste,
    // que existe para exercitar a IA de verdade, precisa falhar.
    await expect(respostas.last()).not.toHaveText(/tive um problema/i);
  });
});
