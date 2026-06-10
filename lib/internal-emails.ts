/**
 * Regra de contas INTERNAS da Vertho.
 *
 * Emails `@vertho.ai` são contas da equipe interna (testes/operação) e devem
 * ser EXCLUÍDOS de TODAS as estatísticas, relatórios e diagnósticos agregados
 * (DNA Organizacional, Perfil Organizacional, votação, pulso, evolução, etc.).
 * NÃO afeta fluxos operacionais individuais (login, trilha do próprio colab).
 *
 * Ponto único de verdade: para adicionar outro domínio interno, edite a lista.
 */
export const INTERNAL_EMAIL_DOMAINS = ['@vertho.ai'];

/** True se o email pertence a uma conta interna da Vertho. */
export function isInternalEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  return INTERNAL_EMAIL_DOMAINS.some((d) => e.endsWith(d));
}

/**
 * Aplica o filtro "exclui internos" a uma query Supabase sobre `colaboradores`
 * (ou qualquer tabela com coluna `email`). Encadeia `.not(email ilike %dominio)`
 * por domínio interno. Use em queries de ESTATÍSTICA/agregação.
 */
export function excludeInternalEmails<Q extends { not: (col: string, op: string, val: string) => Q }>(query: Q, column = 'email'): Q {
  let q = query;
  for (const d of INTERNAL_EMAIL_DOMAINS) q = q.not(column, 'ilike', `%${d}`);
  return q;
}
