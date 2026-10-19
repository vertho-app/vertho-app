/**
 * Monitoramento de IA no Sentry (19/10/2026): cada chamada que RESPONDEU vira um span `gen_ai.chat`
 * no trace da requisição, com modelo, provedor, tokens, custo e a tarefa (`taskKey`).
 *
 * Por que aqui e não na instrumentação automática do SDK: ela não pegava nada (zero spans `gen_ai.*`
 * em 30 dias, medido em 19/10), e o app tem um wrapper único (`callAI`/`callAIChat`) que já sabe tudo
 * isso no `registrarUsoIA`, o ponto do ledger por onde passam Claude, GPT, Gemini, Bedrock e a busca
 * web. O span nasce ali com a duração medida, sem tocar no fluxo da chamada.
 *
 * 🔴 NUNCA o texto: nem system, nem prompt, nem resposta. Só metadados. O ledger (`ia_usage_log`)
 * continua sendo a fonte do CUSTO; o Sentry acrescenta onde a chamada caiu no trace e a latência
 * junto do resto da requisição.
 *
 * `@sentry/core` e não `@sentry/nextjs`: o wrapper também roda nas tasks do Trigger.dev, onde o
 * Sentry só captura falha (sem tracing). Ali o span é no-op; na Vercel ele cai no trace ativo. Os
 * dois SDKs compartilham o mesmo carrier global por versão, então o span chega ao cliente certo.
 */
import { startInactiveSpan } from '@sentry/core';

export interface ChamadaDeIA {
  provider: string;
  model: string;
  latencyMs: number;
  /** Tokens de entrada FRESCOS (fora do cache), como o ledger grava. */
  inTokens: number;
  outTokens: number;
  cacheRead?: number;
  cacheWrite?: number;
  truncou?: boolean;
  taskKey?: string;
  custoUsd?: number | null;
  source?: string;
}

/** Atributos do span (puros, para o teste). Convenção `gen_ai.*` do OpenTelemetry, que o Sentry lê. */
export function atributosDaChamada(c: ChamadaDeIA): Record<string, string | number | boolean> {
  const cacheRead = c.cacheRead || 0;
  const cacheWrite = c.cacheWrite || 0;
  // O `gen_ai.usage.input_tokens` é o TOTAL de entrada, com o cache dentro.
  const entrada = (c.inTokens || 0) + cacheRead + cacheWrite;
  const atributos: Record<string, string | number | boolean> = {
    'gen_ai.operation.name': 'chat',
    'gen_ai.system': c.provider,
    'gen_ai.provider.name': c.provider,
    'gen_ai.request.model': c.model,
    'gen_ai.response.model': c.model,
    'gen_ai.usage.input_tokens': entrada,
    'gen_ai.usage.input_tokens.cached': cacheRead,
    'gen_ai.usage.input_tokens.cache_write': cacheWrite,
    'gen_ai.usage.output_tokens': c.outTokens || 0,
    'gen_ai.usage.total_tokens': entrada + (c.outTokens || 0),
    'vertho.ia.tarefa': c.taskKey || 'untagged',
    'vertho.ia.origem': c.source || 'wrapper',
    'vertho.ia.truncou': !!c.truncou,
  };
  if (typeof c.custoUsd === 'number') atributos['vertho.ia.custo_usd'] = c.custoUsd;
  return atributos;
}

/** Registra a chamada como span já terminado, com a duração medida pelo wrapper. Nunca lança. */
export function registrarSpanDeIA(c: ChamadaDeIA, agoraMs: number = Date.now()): void {
  try {
    const span = startInactiveSpan({
      name: `chat ${c.model}`,
      op: 'gen_ai.chat',
      startTime: new Date(agoraMs - Math.max(0, c.latencyMs || 0)),
      attributes: atributosDaChamada(c),
    });
    span.end(new Date(agoraMs));
  } catch {
    /* sem span, a chamada e o ledger seguem iguais */
  }
}
