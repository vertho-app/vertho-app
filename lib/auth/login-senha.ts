/**
 * Onde a tela de login oferece "Entrar com senha" (R-78, 03/10/2026).
 *
 * 🔴 POR QUE A OPÇÃO SAIU DA TELA DO CLIENTE
 * ─────────────────────────────────────────
 * "Entrar com senha" aparecia para todo mundo, e o produto não tem como
 * DEFINIR uma senha nem "esqueci a senha": quem não é persona de demonstração
 * não tem senha nenhuma que conheça. Medido em 03/10/2026 nas sessões que o
 * Auth ainda guarda (`auth.mfa_amr_claims`): de 2.448 entradas por senha desde
 * 15/07, 2.435 são de 3 personas de demonstração (a conta do E2E entre elas),
 * 5 de duas contas `@vertho.ai` e 8 de outras 7 pessoas, a última em 25/08.
 * Para o cliente, o botão levava a um erro em inglês ("Invalid login
 * credentials").
 *
 * Continua onde a senha existe de fato:
 *  - tenant de demonstração (`is_demo`): as personas recebem senha em
 *    `prepararAcessosDemo`, com o endereço `<tenant>/login`;
 *  - pedido do painel da equipe Vertho (`?redirect=/admin...`, para onde o
 *    `/admin` manda quem chega sem sessão);
 *  - `?senha=1`: a porta de operação e do E2E, que entra pelo endereço
 *    genérico com a conta de verificação do tenant de demonstração.
 *
 * Esconder não é controle de acesso: o `signInWithPassword` segue aberto na API
 * do Auth para quem tem senha. É só não oferecer na tela um caminho que o
 * cliente não tem como usar.
 *
 * 🔑 Decisão do dono em 04/10/2026 (senha para clientes, opção A): o cliente
 * NÃO tem senha, entra por link de uso único. Senha existe só em demonstração
 * e para a equipe. Não criar definição nem reset de senha para cliente. O
 * guard `tests/unit/security/senha-fixa-guard.test.ts` falha se um escritor de
 * senha novo aparecer fora dos três lugares que têm motivo.
 *
 * As contas que JÁ existiam com a senha única de teste foram acertadas só no
 * banco, por script, em 04/10/2026 (decisão do dono): os administradores da
 * plataforma seguem com a senha master e os usuários dos clientes passaram a
 * uma senha por tenant. Nada disso entra no código nem na tela.
 */

/** O destino é o painel da plataforma (`/admin`, `/admin-v2`)? */
export function ehDestinoDoPainel(caminho: string | null | undefined): boolean {
  return /^\/admin(-v2)?(\/|$|\?)/.test(String(caminho || ''));
}

export function senhaDisponivelNoLogin(p: {
  tenantDemo: boolean;
  redirect?: string | null;
  senha?: string | null;
}): boolean {
  if (p.tenantDemo) return true;
  if (ehDestinoDoPainel(p.redirect)) return true;
  return p.senha === '1';
}

/**
 * O erro do `signInWithPassword` vem do Supabase em inglês. A tela mostra o que
 * a pessoa precisa saber, no idioma dela: credencial errada, ou outra falha.
 */
export function chaveDoErroDeSenha(erro: unknown): 'errors.wrongPassword' | 'errors.passwordLogin' {
  const e = (erro && typeof erro === 'object' ? erro : {}) as { code?: unknown; message?: unknown };
  if (e.code === 'invalid_credentials' || /invalid login credentials/i.test(String(e.message || ''))) {
    return 'errors.wrongPassword';
  }
  return 'errors.passwordLogin';
}
