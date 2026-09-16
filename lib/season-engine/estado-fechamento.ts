import { PROGRESSO } from '@/lib/status';

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

export function respostasDoCenario(feedback: any): number {
  const transcript = Array.isArray(feedback?.transcript_completo) ? feedback.transcript_completo : [];
  return transcript.filter((m: any) => m?.role === 'user').length;
}

export function estadoDoFechamento(
  prog: { status?: string | null; feedback?: any } | null | undefined,
  opts: { arguicaoAtiva: boolean },
  agoraMs: number,
): LeituraFechamento {
  const fb = prog?.feedback || {};
  const perguntas = Array.isArray(fb.perguntas) ? fb.perguntas.length : 0;
  const respostas = respostasDoCenario(fb);
  const base = { respostas, perguntas };

  if (prog?.status === PROGRESSO.CONCLUIDO) return { estado: 'avaliado', ...base };
  if (!fb.cenario || perguntas === 0) return { estado: 'nao-iniciado', ...base };
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

/** O recorte da avaliação que a tela mostra ao concluir (o mesmo nas duas pontas). */
export function resumoDaAvaliacao(feedback: any) {
  const fb = feedback || {};
  return {
    nota_media_pre: fb.nota_media_pre,
    nota_media_pos: fb.nota_media_pos,
    delta_medio: fb.delta_medio,
    resumo_avaliacao: fb.resumo_avaliacao,
    spec_version: fb.spec_version,
  };
}
