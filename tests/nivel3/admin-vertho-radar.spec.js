// Nível 3 — uma jornada por página de ADMIN / vertho + radar. Read-only:
// carrega + exercita filtros. NÃO dispara IA/ingestão/envios. Sessão compartilhada.

const { test } = require('@playwright/test');
const { abrir, exercitarFiltros } = require('../helpers/health');

const PAGINAS = [
  ['radar', '/admin/radar'],
  ['radar/qualidade-dados', '/admin/radar/qualidade-dados'],
  ['radar/funnel', '/admin/radar/funnel'],
  ['radar/funnel-bett', '/admin/radar/funnel-bett'],
  ['vertho/simulador-custo', '/admin/vertho/simulador-custo'],
  ['vertho/orcamento', '/admin/vertho/orcamento'],
  ['vertho/mercado-potencial', '/admin/vertho/mercado-potencial'],
  ['vertho/potencial-cidades', '/admin/vertho/potencial-cidades'],
  ['vertho/radarempresas', '/admin/vertho/radarempresas'],
  ['vertho/radarempresas/listas', '/admin/vertho/radarempresas/listas'],
  ['vertho/radarempresas/redes', '/admin/vertho/radarempresas/redes'],
  ['vertho/evidencias', '/admin/vertho/evidencias'],
  ['vertho/avaliacao-acumulada', '/admin/vertho/avaliacao-acumulada'],
  ['vertho/auditoria-sem14', '/admin/vertho/auditoria-sem14'],
  ['vertho/knowledge-base', '/admin/vertho/knowledge-base'],
];

test.describe('Nível 3 · Admin (vertho + radar)', () => {
  for (const [nome, route] of PAGINAS) {
    test(nome, async ({ page }) => {
      await abrir(page, route, 2000);
      await exercitarFiltros(page, route);
    });
  }
});
