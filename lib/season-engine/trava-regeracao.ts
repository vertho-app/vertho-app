/**
 * Trava de regeração: regerar a trilha de alguém não pode apagar o que a
 * geração nova não sabe reproduzir.
 *
 * `persistirTrilha` grava por upsert na MESMA linha (empresa, colaborador,
 * temporada) quando não é linha nova, com `status: ativa` e `programa_config:
 * null` nos presets. Sem esta trava, "Regerar temporada inteira" e o lote
 * "Gerar Temporadas" do pipeline (que lista todo o escopo):
 * - reabriam como ativa uma jornada CONCLUÍDA, com o fechamento dela;
 * - apagavam o snapshot de plano próprio (Ibipeba: 9 semanas desde 02/09) e a
 *   trilha voltava ao preset do modo resolvido hoje;
 * - trocavam o formato de quem está no meio (ex.: legado de 14 semanas sem
 *   carimbo virando o modo resolvido agora).
 *
 * Só vale quando a escrita cai na MESMA linha. Linha nova (encadeamento com
 * `novaJornada`, ou troca de participação de turma) nunca é travada.
 * Custom regerado em custom é permitido: o snapshot é derivado de novo.
 */
import { TRILHA } from '@/lib/status';

export interface TrilhaExistenteParaTrava {
  status?: string | null;
  programa_modo?: string | null;
  programa_config?: unknown;
  turma_membro_id?: string | null;
}

export type MotivoTravaRegeracao = 'trilha_concluida' | 'trilha_com_snapshot' | 'trilha_formato_diferente';

export interface TravaRegeracao {
  codigo: MotivoTravaRegeracao;
  mensagem: string;
}

export function travaRegeracao(
  existente: TrilhaExistenteParaTrava | null | undefined,
  alvo: { modoNovo: string; novaJornada?: boolean; turmaMembroId?: string | null },
): TravaRegeracao | null {
  if (!existente) return null;
  const trocouDeParticipacao =
    !!alvo.turmaMembroId && !!existente.turma_membro_id && existente.turma_membro_id !== alvo.turmaMembroId;
  if (alvo.novaJornada || trocouDeParticipacao) return null;

  if (existente.status === TRILHA.CONCLUIDA) {
    return {
      codigo: 'trilha_concluida',
      mensagem: 'A trilha atual desta pessoa está concluída. Regerar por cima reabriria a trilha e apagaria o fechamento. A próxima jornada precisa ser criada como nova.',
    };
  }
  if (existente.programa_config && alvo.modoNovo !== 'custom') {
    return {
      codigo: 'trilha_com_snapshot',
      mensagem: 'A trilha atual tem um plano próprio gravado (por exemplo, um encerramento em outra duração). Regerar apagaria esse plano. Nada foi alterado.',
    };
  }
  const modoAtual = existente.programa_modo ?? null;
  if (modoAtual !== alvo.modoNovo) {
    return {
      codigo: 'trilha_formato_diferente',
      mensagem: `A trilha atual está no formato "${modoAtual ?? 'legado sem carimbo'}" e a regeração a transformaria em "${alvo.modoNovo}". Recusado para não mudar o programa de quem já está no meio.`,
    };
  }
  return null;
}
