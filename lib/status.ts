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

/**
 * fase4_envios.status — inscrição na cadência semanal (o cron `triggerDiario`
 * só envia pra quem está ATIVO).
 *
 * TERCEIRO domínio, distinto dos de cima: 'concluido' aqui é o envio que chegou
 * ao fim da temporada, e coincide em VALOR com PROGRESSO.CONCLUIDO por acaso —
 * são tabelas diferentes. Trocar um pelo outro no código passa no compilador e
 * amarra dois conceitos que podem divergir; daí terem constantes separadas.
 */
export const ENVIO = {
  ATIVO: 'ativo',
  PAUSADO: 'pausado',
  CONCLUIDO: 'concluido',
} as const;
export type EnvioStatus = (typeof ENVIO)[keyof typeof ENVIO];
