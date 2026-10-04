import { PROGRESSO, TRILHA } from '@/lib/status';
import { resumoSemTratamentoDeGenero } from '@/lib/redacao-sem-genero';
import { resumoSemTravessao } from '@/lib/ai-saida-sem-travessao';
import { cenariosDoSlot, posicaoNoFechamento } from '@/lib/season-engine/fechamento-por-competencia';

/**
 * Em que ponto está o FECHAMENTO (semana do Cenário B) de uma trilha.
 *
 * FONTE ÚNICA entre a tela `/dashboard/temporada/sem14`, a rota
 * `/api/temporada/evaluation` (ação `fechamento_status` e as guardas de `send`)
 * e o núcleo `fechamento-core`. Pura: recebe a linha de
 * `temporada_semana_progresso` e devolve o estado, sem banco.
 *
 * 🔴 O ESTADO QUE NÃO EXISTIA (medido 16/09/2026, Ibipeba). A nota sai de
 * `sem14_scorer`, e a única execução que passou levou 119.748 ms contra o teto
 * de 120 s do `callAI`. Quem terminava a arguição e perdia essa corrida ficava
 * com `arguicao.concluida = true`, semana `em_andamento` e nenhuma nota. E a
 * tela, que só conhecia "concluída", "arguindo" e "respondendo", mandava a
 * pessoa de volta ao formulário das 4 respostas. Reenviar dali empurrava uma
 * 5ª resposta e rodava o scorer de novo. Uma pessoa ficou 8 dias nesse estado.
 *
 * `finalizacao` vive no próprio slot (`feedback.finalizacao`) e é gravada pelo
 * `fechamento-core`: `processando` com carimbo ao reservar, `erro` ao falhar,
 * removida na mesma gravação que conclui a semana.
 */

/**
 * Por quanto tempo uma reserva `processando` vale. A pontuação roda dentro de
 * uma função com `maxDuration = 300`; passada essa janela com folga, a execução
 * certamente morreu, e o estado passa a ser lido como `erro` (a pessoa volta a
 * ter o botão).
 */
export const FINALIZACAO_JANELA_MS = 330_000;

export type EstadoFechamento =
  | 'nao-iniciado'
  | 'respondendo'
  | 'arguindo'
  | 'pronto-para-pontuar'
  | 'processando'
  | 'erro'
  | 'avaliado';

export interface FinalizacaoSlot {
  status: 'processando' | 'erro';
  iniciada_em: string;
  erro?: string | null;
  falhou_em?: string | null;
}

export interface LeituraFechamento {
  estado: EstadoFechamento;
  respostas: number;
  perguntas: number;
  /** Presente em `erro`: a mensagem gravada, ou `expirou` quando a reserva venceu. */
  erro?: string | null;
}

/**
 * Quantas respostas o fechamento já tem. No Onboarding (`feedback.cenarios`) é a
 * soma dos cinco cenários, cada um limitado às suas perguntas; no formato de uma
 * competência, as falas da pessoa no `transcript_completo`, como sempre.
 */
export function respostasDoCenario(feedback: any): number {
  const cenarios = cenariosDoSlot(feedback);
  if (cenarios) return posicaoNoFechamento(cenarios).totalRespostas;
  const transcript = Array.isArray(feedback?.transcript_completo) ? feedback.transcript_completo : [];
  return transcript.filter((m: any) => m?.role === 'user').length;
}

/** Quantas perguntas o fechamento tem: a soma dos cenários, ou as do cenário único. */
export function perguntasDoFechamento(feedback: any): number {
  const cenarios = cenariosDoSlot(feedback);
  if (cenarios) return posicaoNoFechamento(cenarios).totalPerguntas;
  return Array.isArray(feedback?.perguntas) ? feedback.perguntas.length : 0;
}

export function estadoDoFechamento(
  prog: { status?: string | null; feedback?: any } | null | undefined,
  opts: { arguicaoAtiva: boolean },
  agoraMs: number,
): LeituraFechamento {
  const fb = prog?.feedback || {};
  const perguntas = perguntasDoFechamento(fb);
  const respostas = respostasDoCenario(fb);
  const base = { respostas, perguntas };
  const iniciado = cenariosDoSlot(fb) ? true : !!fb.cenario;

  if (prog?.status === PROGRESSO.CONCLUIDO) return { estado: 'avaliado', ...base };
  if (!iniciado || perguntas === 0) return { estado: 'nao-iniciado', ...base };
  if (respostas < perguntas) return { estado: 'respondendo', ...base };
  if (opts.arguicaoAtiva && !fb.arguicao?.concluida) return { estado: 'arguindo', ...base };

  const fin: FinalizacaoSlot | undefined = fb.finalizacao;
  if (fin?.status === 'processando') {
    const iniciadaMs = Date.parse(fin.iniciada_em || '');
    if (Number.isFinite(iniciadaMs) && agoraMs - iniciadaMs < FINALIZACAO_JANELA_MS) {
      return { estado: 'processando', ...base };
    }
    return { estado: 'erro', ...base, erro: 'expirou' };
  }
  if (fin?.status === 'erro') return { estado: 'erro', ...base, erro: fin.erro || null };
  return { estado: 'pronto-para-pontuar', ...base };
}

/**
 * Quanto tempo, depois de a nota ser gravada, o relatório ainda é lido como
 * "sendo gerado". No caminho normal ele sai na MESMA execução, logo depois da
 * nota (consolidação programática, sem IA): milissegundos. Passada a janela com
 * a trilha ainda aberta, o relatório falhou e a tela pode retomar sem correr o
 * risco de gerar em paralelo com o fechamento.
 */
export const RELATORIO_JANELA_MS = 90_000;

/**
 * Onde está o RELATÓRIO de evolução de um fechamento (R-137, 03/10/2026).
 *
 * `avaliado` não basta para a tela da avaliação final: a nota é gravada antes
 * do relatório, e se ele falha a pessoa via "Avaliação concluída" com um "Ver
 * relatório" que abria "Temporada ainda não concluída", sem retomada nenhuma.
 *
 *  - `nao-avaliado`: a semana do Cenário B ainda não concluiu (ou a trilha
 *    não está ativa nem concluída: arquivada e pausada não se retomam);
 *  - `pronto`: a trilha está concluída (o relatório é o ato que a conclui);
 *  - `gerando`: nota gravada há menos de `RELATORIO_JANELA_MS`;
 *  - `falhou`: nota gravada, janela vencida e trilha aberta. Retome.
 */
export type EstadoRelatorio = 'nao-avaliado' | 'gerando' | 'falhou' | 'pronto';

export function estadoDoRelatorio(
  input: { statusSemana?: string | null; concluidoEm?: string | null; trilhaStatus?: string | null },
  agoraMs: number,
): EstadoRelatorio {
  if (input.trilhaStatus === TRILHA.CONCLUIDA) return 'pronto';
  if (input.statusSemana !== PROGRESSO.CONCLUIDO) return 'nao-avaliado';
  // Só trilha ATIVA se retoma: gerar o relatório CONCLUI a trilha, e uma
  // arquivada ou pausada não pode ser reaberta como concluída por uma tela.
  if (input.trilhaStatus !== TRILHA.ATIVA) return 'nao-avaliado';
  const concluidoMs = Date.parse(input.concluidoEm || '');
  // Sem carimbo legível não há como saber se o fechamento ainda roda: trata
  // como vencido. Retomar é idempotente (o encadeamento não duplica a trilha
  // seguinte), então o custo do engano é uma consolidação a mais.
  if (Number.isFinite(concluidoMs) && agoraMs - concluidoMs < RELATORIO_JANELA_MS) return 'gerando';
  return 'falhou';
}

/** O recorte da avaliação que a tela mostra ao concluir (o mesmo nas duas pontas). */
export function resumoDaAvaliacao(feedback: any) {
  const fb = feedback || {};
  return {
    nota_media_pre: fb.nota_media_pre,
    nota_media_pos: fb.nota_media_pos,
    delta_medio: fb.delta_medio,
    resumo_avaliacao: resumoSemTravessao(resumoSemTratamentoDeGenero(fb.resumo_avaliacao)),
    spec_version: fb.spec_version,
  };
}
