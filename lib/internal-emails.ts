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

/**
 * Personas de DEMONSTRAÇÃO (`<nome>.demo@vertho.ai`): são @vertho.ai por causa do
 * guardrail de ENVIO (defesa em profundidade), mas NÃO são contas de staff — são
 * o CONTEÚDO do tenant de demo e DEVEM aparecer em estatísticas/ranking/relatórios.
 * O bloqueio de envio do demo é o `is_demo` (envio-guard), não este filtro.
 */
export function isDemoPersonaEmail(email?: string | null): boolean {
  return !!email && String(email).trim().toLowerCase().endsWith('.demo@vertho.ai');
}

/** True se o email pertence a uma conta interna da Vertho (exclui personas de demo). */
export function isInternalEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  if (e.endsWith('.demo@vertho.ai')) return false; // persona de demo ≠ staff
  return INTERNAL_EMAIL_DOMAINS.some((d) => e.endsWith(d));
}

/**
 * Aplica o filtro "exclui internos" a uma query Supabase sobre `colaboradores`
 * (ou qualquer tabela com coluna `email`). Encadeia `.not(email ilike %dominio)`
 * por domínio interno. Use em queries de ESTATÍSTICA/agregação.
 */
export function excludeInternalEmails<Q extends { or: (f: string) => Q }>(query: Q, column = 'email'): Q {
  // Exclui @vertho.ai (staff) MAS mantém as personas de demo (*.demo@vertho.ai) —
  // ver isInternalEmail/isDemoPersonaEmail. Ex.: rodrigo@vertho.ai (fora),
  // bruna.demo@vertho.ai (dentro), joe@acme.com (dentro).
  return query.or(`${column}.not.ilike.*@vertho.ai,${column}.ilike.*.demo@vertho.ai`);
}
