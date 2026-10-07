/**
 * Escopo de turma para TELAS DE CLIENTE (Fase 2, temporadas, lista de pessoas).
 *
 * `resolverEscopoDeLeitura` devolve `Map` e roda no servidor; a tela precisa de algo que
 * atravesse a fronteira do server action (objeto simples) e de funções puras que recortem
 * as listas que ela já tem em memória com a MESMA régua das telas de servidor
 * (`./janela.ts`): resposta e trilha entram na turma pela janela da participação.
 *
 * Recorte de LISTA (não de escolha): aqui a pergunta é "esta linha é desta turma?", e a
 * resposta vale para toda linha da pessoa, não só para uma por pessoa.
 */

import type { EscopoDeLeitura } from '@/lib/turmas/escopo-leitura';
import { dentroDaJanela, instanteDaResposta, trilhaPertence, type Janela } from '@/lib/turmas/janela';

export interface EscopoTurmaDeTela {
  turmaId: string;
  turmaNome: string;
  /** Pessoa (colaborador_id) → janela da participação dela nesta turma. */
  janelas: Record<string, Janela>;
  /** Pessoa → id da participação nesta turma (o carimbo `trilhas.turma_membro_id` aponta para ele). */
  participacoes: Record<string, string>;
}

/** O escopo do servidor, em objeto simples (Map não atravessa o server action). */
export function serializarEscopo(e: EscopoDeLeitura): EscopoTurmaDeTela {
  const janelas: Record<string, Janela> = {};
  const participacoes: Record<string, string> = {};
  for (const [colab, p] of e.participacaoPorColab) {
    janelas[colab] = p.janela;
    participacoes[colab] = p.id;
  }
  return { turmaId: e.turmaId, turmaNome: e.turmaNome, janelas, participacoes };
}

/** Só as pessoas da turma (ativas e encerradas). */
export function pessoasDaTurma<T extends { id?: string | null }>(pessoas: T[], e: EscopoTurmaDeTela): T[] {
  return (pessoas || []).filter((p) => !!p.id && Object.prototype.hasOwnProperty.call(e.participacoes, p.id));
}

/**
 * Só as respostas dadas DENTRO da janela da participação da pessoa na turma. Resposta de
 * antes do marco é da jornada anterior; de depois do fim, da seguinte.
 */
export function respostasDaTurma<T extends { colaborador_id?: string | null; timestamp_resposta?: string | null; created_at?: string | null }>(
  respostas: T[],
  e: EscopoTurmaDeTela,
): T[] {
  return (respostas || []).filter((r) => {
    const colab = r.colaborador_id;
    if (!colab || !Object.prototype.hasOwnProperty.call(e.janelas, colab)) return false;
    return dentroDaJanela(instanteDaResposta(r), e.janelas[colab]);
  });
}

/** Só as trilhas da participação (carimbo; legada só se nasceu na janela; sem corte, qualquer trilha da pessoa). */
export function trilhasDaTurma<T extends { colaborador_id?: string | null; turma_membro_id?: string | null; criado_em?: string | null }>(
  trilhas: T[],
  e: EscopoTurmaDeTela,
): T[] {
  return (trilhas || []).filter((t) => {
    const colab = t.colaborador_id;
    if (!colab || !Object.prototype.hasOwnProperty.call(e.participacoes, colab)) return false;
    return trilhaPertence(e.participacoes[colab], e.janelas[colab], t);
  });
}
