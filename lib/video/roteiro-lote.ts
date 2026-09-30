/**
 * Roteiro do vídeo do Kit pela Batch API (−50%), sem somar espera célula a célula.
 *
 * Por que existe (30/09/2026): o roteiro do Kit saía síncrono (`forceSync`), a
 * ~US$ 0,224 por vídeo; em lote, ~US$ 0,133. O lote é mais lento (medido em
 * `ia_batches`, 21 lotes de 1 item: mediana 210 s, p90 549 s, máximo 717 s, contra
 * ~65 s do síncrono), e o vídeo inteiro leva 40-60 min: alguns minutos a mais no
 * roteiro não mudam quando ele fica pronto. O que não pode é esperar um lote POR
 * célula. Então quem dispara várias células usa UM coletor (os roteiros saem num
 * lote só) e UMA agenda (os disparos continuam espaçados, para as narrações não
 * disputarem o TTS: `gerar-video-modulo` não tem limite de concorrência).
 *
 * Fora de `'use server'` de propósito: é núcleo headless, usado pelo Kit
 * (`actions/kits.ts`) e pelos scripts de lote.
 */
import { createAIBatchCollector, type AIRun } from '@/lib/ai-batch';
import { getModelForTask } from '@/lib/ai-tasks';

/**
 * Janela de silêncio do coletor. Os roteiros de um lote chegam depois de leituras
 * do banco (módulo, cargo, empresa) que terminam em instantes diferentes; com a
 * janela padrão de 200 ms eles se espalhariam em vários lotes paralelos. Não somam
 * espera, mas pagam o piso de latência de cada lote à toa.
 */
export const JANELA_COLETOR_ROTEIRO_MS = 3000;

/** Orçamento de espera do lote antes do fallback síncrono (o Kit roda com teto de 1 h no Trigger). */
export const ORCAMENTO_LOTE_ROTEIRO_MS = 20 * 60_000;

/**
 * Espaçamento padrão entre disparos de vídeo. Antes do lote, o script dormia 150 s
 * entre disparos e cada roteiro síncrono somava ~65 s: o espaçamento REAL era ~215 s.
 */
export const INTERVALO_DISPARO_PADRAO_S = 210;

/**
 * Teto do atraso de um disparo. A célula nasce `processing` e só é tocada quando a
 * task começa; a regra `video-stale` (`lib/pipeline-health/core.ts`) acusa célula
 * sem atualização há mais de 2 h. Acima deste teto, divida o lote.
 */
export const TETO_ATRASO_DISPARO_S = 90 * 60;

/**
 * Coletor dos roteiros de vídeo: acumula as chamadas concorrentes num lote só,
 * etiquetado `conteudo_video` no ledger (a mesma etiqueta do caminho síncrono de
 * `lib/video/gerar-roteiro.ts`). Item sem resultado, ou lote que estoura o
 * orçamento, cai no síncrono item a item, rotulado `batch-sync`.
 */
export async function coletorDeRoteiros(
  empresaId: string | null,
  opts: { budgetMs?: number } = {},
): Promise<AIRun> {
  // Só vale como padrão: `gerarRoteiroDeModulo` passa o modelo em toda chamada.
  // Mesmo fallback de lá, para uma leitura falha da config não derrubar o Kit.
  const modelo = await getModelForTask(null as any, 'conteudo_video').catch(() => 'claude-sonnet-4-6');
  const { run } = createAIBatchCollector(modelo, { windowMs: JANELA_COLETOR_ROTEIRO_MS, budgetMs: opts.budgetMs ?? ORCAMENTO_LOTE_ROTEIRO_MS, ledger: { feature: 'conteudo_video', empresaId } });
  return run;
}

export interface AgendaDeDisparo {
  /** Atraso (s) do disparo que acontece AGORA; reserva a vaga. */
  proximoAtrasoS(): number;
}

/**
 * Agenda os disparos a partir do instante em que cada um acontece:
 * `max(agora, último + intervalo)`. Não é `índice × intervalo`: se um roteiro cai
 * no fallback síncrono e chega minutos depois, ele sai na hora, sem encavalar
 * com o anterior nem esperar à toa. Quem não dispara (célula de grupo, reuso)
 * não pede vaga.
 */
export function criarAgendaDeDisparo(
  intervaloS: number = INTERVALO_DISPARO_PADRAO_S,
  agora: () => number = Date.now,
): AgendaDeDisparo {
  if (!Number.isFinite(intervaloS) || intervaloS < 0) {
    throw new Error(`intervalo de disparo inválido: ${intervaloS}`);
  }
  let ultimo: number | null = null;
  return {
    proximoAtrasoS() {
      const t = agora();
      const alvo = ultimo === null ? t : Math.max(t, ultimo + intervaloS * 1000);
      const atrasoS = Math.round((alvo - t) / 1000);
      if (atrasoS > TETO_ATRASO_DISPARO_S) {
        throw new Error(
          `atraso de ${atrasoS} s passa do teto de ${TETO_ATRASO_DISPARO_S} s `
          + '(a regra video-stale acusa célula parada há mais de 2 h); dispare em lotes menores',
        );
      }
      ultimo = alvo;
      return atrasoS;
    },
  };
}
