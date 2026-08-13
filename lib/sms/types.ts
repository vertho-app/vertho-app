// Tipos do serviço de SMS (multi-provedor, mesmo formato de `lib/whatsapp`).
//
// ⚠️ SMS NÃO é "mais um provedor de WhatsApp", e por isso mora fora de
// `lib/whatsapp` em vez de entrar naquele registry. Três diferenças que um
// adapter compartilhado esconderia:
//
//  1. **Custo por mensagem.** WhatsApp por QR é ilimitado e grátis; cada SMS é
//     pago. Um failover que trate os dois como intercambiáveis transforma uma
//     queda de provedor em conta de telefone — por isso existe teto (`lib/sms`).
//  2. **A mensagem é outra.** SMS não tem markdown (`*negrito*` sai com os
//     asteriscos literais), não tem preview de link e cobra por segmento de
//     160 caracteres (70 se houver acento ou emoji). Reusar a copy do WhatsApp
//     entregaria asteriscos soltos em mensagem paga.
//  3. **Não há "sessão".** Não existe QR para cair; a saúde é da credencial,
//     não de um telefone pareado — então o cache de saúde do WhatsApp (que
//     existe para não bater /status a cada mensagem de lote) não faz sentido
//     aqui.
//
// O que se mantém de propósito: `configured()` sem I/O, `send()` que nunca
// lança, e a trilha de tentativas no resultado.

export type SmsProviderId = 'twilio';

/** Mensagem de SMS. `phone` em qualquer formato — o serviço normaliza p/ E.164. */
export interface SmsMessage {
  phone: string;
  /** Texto puro. Sem markdown: o provedor entrega os caracteres como estão. */
  text: string;
}

/**
 * Contexto de negócio do envio — espelha `WaSendMeta` para que a telemetria dos
 * dois canais seja consultável do mesmo jeito (`kind` em
 * `notification_deliveries`).
 */
export interface SmsSendMeta {
  /** otp | magic_link | alerta | ... */
  motivo?: string | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  dedupeKey?: string | null;
}

/** Resultado de UMA tentativa num provedor. */
export interface SmsSendOutcome {
  ok: boolean;
  status?: number;
  reason?: string;
  /**
   * Id da mensagem no provedor, quando ele devolve um.
   *
   * ⚠️ Recebê-lo significa que o provedor ACEITOU a mensagem — na Twilio o
   * status inicial é `queued`, e entrega/falha chegam depois, por callback. A
   * mesma distinção que fez "155 enviados" virar 50 entregues em 11/08/2026:
   * `ok: true` aqui é aceite, nunca recebimento.
   */
  providerMessageId?: string | null;
}

export interface SmsProvider {
  id: SmsProviderId;
  label: string;
  /** Tem credenciais no ambiente? (não faz I/O) */
  configured(): boolean;
  send(msg: SmsMessage): Promise<SmsSendOutcome>;
}

/** Resultado final do serviço, após eventual failover entre provedores. */
export interface SmsSendResult {
  ok: boolean;
  /** Quem aceitou a mensagem (quando ok). */
  provider?: SmsProviderId;
  providerMessageId?: string | null;
  attempts: Array<{ provider: SmsProviderId; ok: boolean; status?: number; reason?: string }>;
  /** Resumo do erro quando ok=false. */
  reason?: string;
  /**
   * `true` quando o teto diário barrou o envio ANTES de tentar qualquer
   * provedor. Separado de `ok: false` de propósito: teto atingido é a proteção
   * funcionando, não fornecedor quebrado, e somar os dois na mesma conta
   * esconderia um pico de custo dentro de uma métrica de falha.
   */
  bloqueadoPorTeto?: boolean;
}
