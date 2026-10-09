import 'server-only';

import { listarTurmasDoTenant, type TurmaDoTenant } from '@/lib/turmas';
import { resolverEscopoDeLeitura, type EscopoDeLeitura } from '@/lib/turmas/escopo-leitura';

/**
 * O recorte de turma da central do RH — uma régua, dois consumidores.
 *
 * POR QUE ISTO SAIU DE DENTRO DA CENTRAL (09/09/2026): o PDF executivo de
 * evolução recebe o mesmo `turma` pela URL que a tela recebe, e a validação
 * desse parâmetro é uma decisão de ACESSO disfarçada de filtro. Reescrevê-la no
 * lado do PDF seria a segunda porta com critério próprio — a classe de erro em
 * que a porta mais permissiva vira a promessa e a mais restritiva vira a
 * experiência. Aqui o pior caso seria um PDF nominal com o recorte de turma de
 * OUTRO tenant, porque `turmaId` vem do cliente.
 *
 * A régua: `turmaId` só vale se for uma das turmas NÃO ARQUIVADAS DESTE tenant
 * (ativas e, desde 09/10/2026, também as CONCLUÍDAS: o RH lê a turma que já
 * terminou, como a Temporada 1 de Ibipeba). Id de outra empresa, turma arquivada
 * ou link velho caem para "empresa inteira" em silêncio — e como o seletor da
 * tela é desenhado a partir da mesma lista, o filtro mostra "Todas as turmas",
 * que é o que foi aplicado.
 *
 * As pessoas da turma vêm do escopo de LEITURA (quem passou por ela, com
 * participação ativa ou concluída), não do escopo de lote (só ativas): com o de
 * lote, a turma cujas pessoas seguiram para a seguinte ficava com 0 pessoas.
 */
export type RecorteDeTurma = {
  /** Turmas não arquivadas do tenant — é a lista que desenha o seletor. */
  turmas: TurmaDoTenant[];
  /** A turma aplicada, ou null quando o recorte é a empresa inteira. */
  turma: TurmaDoTenant | null;
  /** Ids para filtrar, ou null para "sem recorte" (empresa inteira). */
  colaboradorIds: string[] | null;
  /** O escopo de leitura da turma aplicada (pessoas + janela de cada uma), ou null. */
  escopoLeitura: EscopoDeLeitura | null;
};

export async function resolverRecorteDeTurma(
  sb: any,
  empresaId: string,
  turmaId?: string | null,
): Promise<RecorteDeTurma> {
  const turmas = await listarTurmasDoTenant(sb, empresaId, { incluirConcluidas: true });
  const turma = turmaId ? turmas.find((t) => t.id === turmaId) || null : null;
  const escopoLeitura = turma ? await resolverEscopoDeLeitura(sb, empresaId, turma.id) : null;
  return { turmas, turma, colaboradorIds: escopoLeitura ? escopoLeitura.colaboradorIds : null, escopoLeitura };
}
