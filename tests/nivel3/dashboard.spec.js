// Nível 3 — uma jornada por página do DASHBOARD (colaborador/gestor/RH).
// Read-mostly: carrega a página, exercita filtros seguros e revalida saúde.
// EXCLUI custo (IA/PDF) e envios. Usa sessão compartilhada (projeto 'nivel3').
//
// Excluídas de propósito (disparam IA ao carregar):
//   /dashboard/perfil-comportamental        (gera insights executivos)
//   /dashboard/perfil-comportamental/relatorio (gera textos do relatório)

const { test, expect } = require('@playwright/test');
const { abrir, exercitarFiltros, assertSaudavel } = require('../helpers/health');

test.describe('Nível 3 · Dashboard', () => {
  test('home', async ({ page }) => {
    await abrir(page, '/dashboard', 2000);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('jornada', async ({ page }) => {
    await abrir(page, '/dashboard/jornada');
    await exercitarFiltros(page, '/dashboard/jornada');
  });

  test('temporada', async ({ page }) => {
    await abrir(page, '/dashboard/temporada');
  });

  test('temporada/concluida', async ({ page }) => {
    await abrir(page, '/dashboard/temporada/concluida');
  });

  test('temporada/sem14', async ({ page }) => {
    await abrir(page, '/dashboard/temporada/sem14');
  });

  test('evolucao', async ({ page }) => {
    await abrir(page, '/dashboard/evolucao');
    await exercitarFiltros(page, '/dashboard/evolucao');
  });

  test('perfil', async ({ page }) => {
    await abrir(page, '/dashboard/perfil');
  });

  test('assessment (lista)', async ({ page }) => {
    await abrir(page, '/dashboard/assessment');
  });

  test('pdi', async ({ page }) => {
    await abrir(page, '/dashboard/pdi');
  });

  test('praticar', async ({ page }) => {
    await abrir(page, '/dashboard/praticar');
  });

  test('mapeamento — entrada (sem submeter)', async ({ page }) => {
    await abrir(page, '/dashboard/perfil-comportamental/mapeamento', 2000);
    // Se a tela de instruções aparecer, avança 1 passo (estado client, sem save).
    const comecar = page.getByRole('button', { name: /começar|comece|start|empezar/i });
    if (await comecar.count()) {
      await comecar.first().click().catch(() => {});
      await page.waitForTimeout(800);
      await assertSaudavel(page, '/mapeamento (passo 1)');
    }
  });

  test('votacao — interage no ranking (sem enviar voto)', async ({ page }) => {
    await abrir(page, '/dashboard/votacao', 2000);
    // NÃO clica em "enviar/salvar voto" — só valida que a tela funciona.
  });

  test('gestor — home', async ({ page }) => {
    await abrir(page, '/dashboard/gestor', 2000);
    await expect(page).toHaveURL(/\/dashboard\/gestor/);
  });

  test('gestor — equipe-evolucao', async ({ page }) => {
    await abrir(page, '/dashboard/gestor/equipe-evolucao');
    await exercitarFiltros(page, '/dashboard/gestor/equipe-evolucao');
  });
});
