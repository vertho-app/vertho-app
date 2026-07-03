/**
 * Status canônicos — FONTE ÚNICA dos literais que viviam hardcoded em 42
 * arquivos (168 ocorrências), onde `'concluido'` (progresso de semana) e
 * `'concluida'` (trilha) coexistem a um typo de distância de um bug
 * silencioso de filtro.
 *
 * Os VALORES são os já persistidos no banco — migração de código é só troca
 * de literal por constante (zero mudança de dado). Adoção por fatias; o
 * guard `status-literal-guard` congela o estoque de literais restantes.
 */

/** temporada_semana_progresso.status */
export const PROGRESSO = {
  PENDENTE: 'pendente',
  EM_ANDAMENTO: 'em_andamento',
  CONCLUIDO: 'concluido',
} as const;
export type ProgressoStatus = (typeof PROGRESSO)[keyof typeof PROGRESSO];

/** trilhas.status */
export const TRILHA = {
  ATIVA: 'ativa',
  PAUSADA: 'pausada',
  CONCLUIDA: 'concluida',
  ARQUIVADA: 'arquivada',
} as const;
export type TrilhaStatus = (typeof TRILHA)[keyof typeof TRILHA];
