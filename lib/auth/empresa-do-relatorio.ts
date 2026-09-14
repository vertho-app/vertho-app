/**
 * De qual empresa é o relatório que esta requisição está pedindo?
 *
 * Duas regras diferentes convivem numa rota nominal (nomes, cargos, notas):
 *
 *  · **gestor e RH**: a empresa vem da SESSÃO, sempre. Um `empresaId` escolhido
 *    pelo cliente seria leitura cross-tenant de PII a um parâmetro de distância,
 *    então aqui o parâmetro é lido e DESCARTADO.
 *  · **platform admin**: a empresa vem da ROTA, que é como toda a área /admin
 *    funciona (a tela tem um filtro de empresa e o gate é o papel).
 *
 * 🔴 Por que isto é uma função e não um `if` na rota (medido 14/09/2026): a
 * guarda `if (!auth.empresaId) return 403` estava ANTES da resolução, e o
 * platform admin desta base tem `empresaId` NULO na sessão. Resultado: o botão
 * de PDF da tela de admin respondia `{"error":"sessão sem empresa"}` com a
 * empresa escolhida na URL, porque a guarda media a sessão e a decisão era do
 * parâmetro. Guarda tem que medir o valor que vai ser USADO.
 *
 * ⚠️ E não vira `empresaPedida || auth.empresaId`: o `||` faria o parâmetro
 * valer justamente quando a sessão não tem empresa, que é o caso a proteger.
 */
export function resolverEmpresaDoRelatorio(
  auth: { empresaId: string | null; isPlatformAdmin?: boolean },
  empresaPedida: string | null | undefined,
): string | null {
  const pedida = empresaPedida?.trim();
  if (auth.isPlatformAdmin && pedida) return pedida;
  return auth.empresaId || null;
}
