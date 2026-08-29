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

/**
 * turmas.status — a SAFRA (mig 210).
 *
 * SEXTO domínio. `CONCLUIDA`/`ARQUIVADA` coincidem em valor com TRILHA, de novo
 * por acaso: aqui descrevem a turma inteira, não a jornada de uma pessoa — uma
 * turma em `EM_JORNADA` tem gente concluída e gente atrasada ao mesmo tempo.
 *
 * `EM_JORNADA` é o estado que vivia, emprestado, no enum de `pulse_ciclos`
 * (docs/TURMAS.md §2): não é estado do Pulso, é da turma. O ciclo fica com o
 * que é dele (T0 aberto / aguardando T2 / encerrado).
 *
 * ⚠️ A turma NÃO tem fase única: o status é o rótulo operacional, e a
 * distribuição individual (quantos responderam, quantos têm trilha) é que
 * descreve a realidade. Um sem o outro mente.
 */
export const TURMA = {
  PLANEJADA: 'planejada',
  DIAGNOSTICO: 'diagnostico',
  TRILHAS_EM_GERACAO: 'trilhas_em_geracao',
  EM_JORNADA: 'em_jornada',
  CONCLUIDA: 'concluida',
  ARQUIVADA: 'arquivada',
} as const;
export type TurmaStatus = (typeof TURMA)[keyof typeof TURMA];

/** Turmas que não recebem mais operação — base do fail-closed das ações em lote. */
export const TURMA_ENCERRADAS: TurmaStatus[] = [TURMA.CONCLUIDA, TURMA.ARQUIVADA];

/**
 * turma_membros.status — a PARTICIPAÇÃO (mig 210).
 *
 * SÉTIMO domínio. Só UMA participação `ATIVO` por pessoa (índice parcial):
 * reentrada é linha nova, e a anterior vira `CONCLUIDO` (terminou a safra) ou
 * `REMOVIDO` (saiu antes). A distinção importa para o relatório histórico —
 * quem terminou e quem desistiu não são a mesma coisa.
 */
export const TURMA_MEMBRO = {
  ATIVO: 'ativo',
  REMOVIDO: 'removido',
  CONCLUIDO: 'concluido',
} as const;
export type TurmaMembroStatus = (typeof TURMA_MEMBRO)[keyof typeof TURMA_MEMBRO];

/**
 * diag_leads.t0_status — a ENTREGA do recorte prometido no estande (mig 221).
 *
 * OITAVO domínio. `PENDENTE` coincide em valor com PROGRESSO e PAINEL, mais uma
 * vez por acaso: aqui não descreve o andamento de uma semana nem uma fila de
 * worker, e sim **o que nós devemos a um visitante da feira**.
 *
 * 🔑 `DESCONHECIDO` é o único que não descreve uma tentativa: é o lead capturado
 * ANTES de o worker medir a entrega (até 18/08/2026 ele carimbava "T+0 executado"
 * sem que nada tivesse saído). Não significa "não recebeu" — significa "não dá
 * para afirmar". Por isso fica fora do reenvio automático: reenviar o recorte a
 * quem já leu é ruído, e afirmar que não chegou seria a mesma invenção que a
 * mig 221 veio corrigir.
 */
export const ENTREGA_T0 = {
  PENDENTE: 'pendente',
  ENVIADO: 'enviado',
  FALHOU: 'falhou',
  DESCONHECIDO: 'desconhecido',
} as const;
export type EntregaT0Status = (typeof ENTREGA_T0)[keyof typeof ENTREGA_T0];

/** Os que ainda devem entrega — a fila que o cron e o botão da equipe varrem. */
export const ENTREGA_T0_NA_FILA: EntregaT0Status[] = [ENTREGA_T0.PENDENTE, ENTREGA_T0.FALHOU];

/**
 * copiloto evolution — o estágio de um item de EVOLUÇÃO DE CONTA (vendas).
 *
 * NONO domínio (28/08). `PENDENTE` coincide em valor com PROGRESSO/PAINEL/
 * ENTREGA_T0 por acaso: aqui é "a IA anotou que algo evoluiu na conversa
 * comercial e ninguém confirmou ainda", não uma semana de trilha nem uma
 * entrega nossa. Nasceu em `lib/copiloto/types.ts` como union de literais;
 * o `status-literal-guard` congela literal em arquivo novo, então o domínio
 * vem morar aqui como os outros oito.
 */
export const COPILOTO_EVOLUCAO = {
  NOVO: 'novo',
  CONFIRMADO: 'confirmado',
  MUDOU: 'mudou',
  PENDENTE: 'pendente',
} as const;
export type CopilotEvolutionStatus = (typeof COPILOTO_EVOLUCAO)[keyof typeof COPILOTO_EVOLUCAO];
