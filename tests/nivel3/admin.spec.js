// Nível 3 — uma jornada por página do ADMIN (global). Read-only: carrega +
// exercita filtros seguros (<select>). NÃO clica em botões de ação (rodar IA,
// enviar, criar, excluir, exportar, gerar lote). Sessão compartilhada.

const { test } = require('@playwright/test');
const { abrir, exercitarFiltros } = require('../helpers/health');

const PAGINAS = [
  ['dashboard', '/admin/dashboard'],
  ['empresas/gerenciar', '/admin/empresas/gerenciar'],
  ['empresas/nova', '/admin/empresas/nova'],
  ['simulador', '/admin/simulador'],
  ['competencias', '/admin/competencias'],
  ['conteudos', '/admin/conteudos'],
  ['videos', '/admin/videos'],
  ['preferencias-aprendizagem', '/admin/preferencias-aprendizagem'],
  ['platform-admins', '/admin/platform-admins'],
  ['permissoes', '/admin/permissoes'],
  ['auditoria', '/admin/auditoria'],
  ['lixeira', '/admin/lixeira'],
  ['fit', '/admin/fit'],
  ['ppp', '/admin/ppp'],
  ['top10', '/admin/top10'],
  ['evolucao', '/admin/evolucao'],
  ['relatorios', '/admin/relatorios'],
  ['temporadas', '/admin/temporadas'],
  ['whatsapp', '/admin/whatsapp'],
  ['cargos', '/admin/cargos'],
  ['assessment-descritores', '/admin/assessment-descritores'],
];

test.describe('Nível 3 · Admin (global)', () => {
  for (const [nome, route] of PAGINAS) {
    test(nome, async ({ page }) => {
      await abrir(page, route, 2000);
      await exercitarFiltros(page, route);
    });
  }
});
