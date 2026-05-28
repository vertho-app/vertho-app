// Nível 3 — uma jornada por página de ADMIN / empresa específica (sandbox).
// Read-only: carrega + exercita filtros. NÃO roda ações (IA, envios, exclusões).
// Empresa via DIAG_EMPRESA_ID (fallback = teste-piloto). Sessão compartilhada.

const { test } = require('@playwright/test');
const { abrir, exercitarFiltros } = require('../helpers/health');

const EMP = process.env.DIAG_EMPRESA_ID || '2dba7739-a922-4de0-bd59-2c4fb5e3e10e';

const PAGINAS = [
  ['pipeline', `/admin/empresas/${EMP}`],
  ['configuracoes', `/admin/empresas/${EMP}/configuracoes`],
  ['fase1', `/admin/empresas/${EMP}/fase1`],
  ['fase2', `/admin/empresas/${EMP}/fase2`],
  ['fase4', `/admin/empresas/${EMP}/fase4`],
  ['relatorios', `/admin/empresas/${EMP}/relatorios`],
  ['perfis-comportamentais', `/admin/empresas/${EMP}/perfis-comportamentais`],
  ['perfil-externo', `/admin/empresas/${EMP}/perfil-externo`],
  ['votacao', `/admin/empresas/${EMP}/votacao`],
  ['pulso', `/admin/empresas/${EMP}/pulso`],
];

test.describe('Nível 3 · Admin (empresa)', () => {
  for (const [nome, route] of PAGINAS) {
    test(nome, async ({ page }) => {
      await abrir(page, route, 2500);
      await exercitarFiltros(page, route);
    });
  }
});
