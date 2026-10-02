/**
 * Qual empresa a NAVEGAÇÃO está pedindo (path ou query), independente do filtro
 * salvo no header. Puro, sem React: é a metade que faltava de
 * `useEmpresaContexto`.
 *
 * O par tem que ser simétrico, e não era (medido 14/09/2026):
 *
 *   ida   trocar a empresa no header já atualizava o `?empresa=` da URL
 *         (`setEmpresaFiltro` no `AdminShell`);
 *   volta abrir uma URL que já traz `?empresa=A` NÃO atualizava o header,
 *         porque o sentido inverso só olhava o PATH `/admin/empresas/{id}`.
 *
 * Com o filtro salvo em B (localStorage) e um link com `?empresa=A`, o
 * `useEmpresaContexto` dá precedência ao QUERY: a tela carrega A e o header
 * continua escrito B. Nada corrige, e nada acusa. O sintoma que chegou do dono
 * foi "os cargos-alvo estão vindo de outra tenant": a tela listava os 4 cargos
 * da ACME Demo com "Secretaria Municipal de Ibipeba/BA" no cabeçalho.
 *
 * Isso vale para as 16 telas que usam `useEmpresaContexto`, e algumas ESCREVEM:
 * `/admin/competencias` edita rubrica e `/admin/whatsapp` dispara mensagem. Ler
 * o nome errado no cabeçalho e agir é o modo de falha, não o incômodo visual.
 */
export function empresaDaNavegacao(pathname: string | null | undefined, empresaQuery: string | null | undefined): string | null {
  const doPath = pathname?.match(/^\/admin\/empresas\/([^/]+)/)?.[1] || null;
  if (doPath) return doPath;
  const daQuery = String(empresaQuery || '').trim();
  return daQuery || null;
}

/**
 * Quando o header deve ADOTAR a empresa que a rota pede.
 *
 * Só quando a rota pede uma empresa que ainda NÃO foi sincronizada. A versão
 * anterior comparava a rota com o FILTRO a cada render: escolher "Todas as
 * empresas" mudava o filtro para 'all', a rota ainda dizia A (a URL só muda
 * depois do `router.replace`) e o efeito devolvia o filtro para A. O usuário
 * não conseguia sair de uma empresa numa tela escopada, e nada acusava.
 *
 * Quem decide é a MUDANÇA da navegação, nunca a divergência com o filtro:
 * navegar para outra empresa (link, voltar) adota; escolher no header não.
 */
export function empresaDaRotaParaAdotar(
  routeEmpresaId: string | null,
  ultimaSincronizada: string | null,
  idsConhecidos: string[],
): string | null {
  if (!routeEmpresaId) return null;
  if (routeEmpresaId === ultimaSincronizada) return null;
  return idsConhecidos.includes(routeEmpresaId) ? routeEmpresaId : null;
}
