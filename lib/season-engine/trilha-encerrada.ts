/**
 * Trilha ENCERRADA não recebe trabalho novo (09/10/2026).
 *
 * A Temporada 1 de Ibipeba foi encerrada quando a Temporada 2 abriu: "nada deve
 * ser feito nesta temporada mais" (dono). As semanas dela continuam no histórico,
 * só para leitura, mas uma aba esquecida aberta, ou um link antigo, não pode
 * seguir gravando conversa, missão ou dúvida nela. A régua mora AQUI, uma vez, e
 * cada rota que grava trabalho na semana pergunta a ela.
 *
 * Só `ENCERRADA` fecha a porta. `CONCLUIDA` tem caminhos legítimos depois do fim
 * (relatório, certificado) e `PAUSADA`/`ARQUIVADA` têm donos e mensagens
 * próprios: mudar o que elas aceitam está fora do escopo desta regra.
 */

import { TRILHA } from '@/lib/status';

export const CODIGO_TRILHA_ENCERRADA = 'TRILHA_ENCERRADA';

export const MENSAGEM_TRILHA_ENCERRADA =
  'Esta jornada foi encerrada. Ela continua no seu histórico, só para leitura.';

/** A trilha aceita trabalho novo (resposta, missão, dúvida, conteúdo consumido)? */
export function trilhaRecebeTrabalho(status: string | null | undefined): boolean {
  return status !== TRILHA.ENCERRADA;
}

/** Corpo e status HTTP da recusa, iguais em todas as rotas. */
export function recusaTrilhaEncerrada(): { body: { error: string; codigo: string }; status: number } {
  return { body: { error: MENSAGEM_TRILHA_ENCERRADA, codigo: CODIGO_TRILHA_ENCERRADA }, status: 409 };
}
