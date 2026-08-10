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

/**
 * board_paineis.status — fila do /board (painel multi-modelo).
 *
 * QUARTO domínio. 'pendente' e 'concluido' coincidem em VALOR com PROGRESSO,
 * de novo por acaso: aqui descrevem a execução de um painel na máquina local
 * (worker + CLIs por assinatura), não a semana de um colaborador. Constantes
 * separadas para que um refactor num domínio não arraste o outro.
 *
 * 'pendente' tem leitura operacional própria: o pedido está no banco e o worker
 * ainda não o pegou — normalmente porque não está rodando.
 */
export const PAINEL = {
  PENDENTE: 'pendente',
  RODANDO: 'rodando',
  CONCLUIDO: 'concluido',
  ERRO: 'erro',
  CANCELADO: 'cancelado',
} as const;
export type PainelStatus = (typeof PAINEL)[keyof typeof PAINEL];

/**
 * ia_batches.status — rastro de um batch submetido à Anthropic (mig 208).
 *
 * QUINTO domínio, e o que ele descreve não é trabalho NOSSO: é o estado de algo
 * que roda no provedor. Daí `SUBMETIDO` em vez de 'pendente' — um batch nesse
 * estado não está esperando alguém pegá-lo (como no PAINEL); ele já está sendo
 * processado, e nós é que ainda não colhemos. Um batch parado aqui por horas é o
 * sinal de órfão: pago, provavelmente pronto, e sem ninguém buscando.
 */
export const IA_BATCH = {
  SUBMETIDO: 'submetido',
  CONCLUIDO: 'concluido',
  ERRO: 'erro',
} as const;
export type IaBatchStatus = (typeof IA_BATCH)[keyof typeof IA_BATCH];
