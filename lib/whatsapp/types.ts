// Tipos do serviço central de WhatsApp (multi-provedor com failover).
// A ideia: o app fala SÓ com `sendWhatsapp(msg)`; cada provedor (Z-API,
// WaSender, futuramente Cloud API oficial) é um adapter que implementa
// `WaProvider`. Trocar/empilhar provedor = registrar um adapter, sem mexer
// nos call-sites.

export type WaProviderId = 'zapi' | 'wasender';

/** Mensagem agnóstica de provedor. `phone` em qualquer formato — o serviço
 *  normaliza para E.164 BR antes de despachar. */
export type WaMessage =
  | { kind: 'text'; phone: string; text: string }
  | { kind: 'link'; phone: string; url: string; title?: string; text?: string }
  | { kind: 'document'; phone: string; filename: string; base64?: string; url?: string }
  | { kind: 'audio'; phone: string; url: string };

export type WaKind = WaMessage['kind'];

/**
 * Contexto de NEGÓCIO do envio — opcional, e separado de `WaMessage` de
 * propósito: `WaMessage.kind` é o TIPO de mensagem (text/link/document/audio),
 * não o motivo. Sem isto o serviço central não sabe quem nem por quê, e o log
 * de entrega (mig 198) não conseguiria separar cadência de autenticação.
 *
 * Chamada sem `meta` continua válida e AINDA é registrada, com `motivo` nulo: a
 * lacuna de instrumentação fica contável por query em vez de invisível.
 *
 * ⚠️ O campo se chamava `kind` — MESMO NOME do discriminante de `WaMessage`,
 * que fica a três linhas daqui. Renomeado para `motivo` em 11/08/2026, na
 * véspera do roteamento por número: o despacho passa a escolher o NÚMERO de
 * saída por este campo (`otp` → número de acesso; `pilula` → número de
 * jornada), e um `msg.kind` digitado no lugar de `meta.motivo` rotearia por
 * "text/document" — compilando, passando no teste, e mandando OTP pelo número
 * de campanha. Dois campos com o mesmo nome e semânticas diferentes não são um
 * detalhe de estilo quando um deles vira chave de roteamento.
 */
export interface WaSendMeta {
  /** pilula | otp | magic_link | convite | nudge | alerta | ... */
  motivo?: string | null;
  empresaId?: string | null;
  colaboradorId?: string | null;
  dedupeKey?: string | null;
}

/** Resultado de UMA tentativa num provedor. */
export interface WaSendOutcome {
  ok: boolean;
  status?: number;
  reason?: string;
  data?: unknown;
}

export interface WaHealth {
  ok: boolean;
  reason?: string;
}

export type WaCapabilities = Record<WaKind, boolean>;

export interface WaProvider {
  id: WaProviderId;
  label: string;
  capabilities: WaCapabilities;
  /** Tem credenciais no ambiente? (não faz I/O) */
  configured(): boolean;
  /** Checa sessão/conexão viva (I/O — cacheado pelo serviço). */
  health(): Promise<WaHealth>;
  send(msg: WaMessage): Promise<WaSendOutcome>;
  /**
   * Mensagens presas na fila do PROVEDOR — aceitas por ele, ainda não entregues.
   * Opcional: só provedores que expõem isso (Z-API) implementam.
   *
   * `null` = não sei (sem suporte, erro, formato inesperado); `0` = fila vazia.
   * A distinção importa: o pré-flight de lote só bloqueia com um número, nunca
   * com "não sei" — senão uma instabilidade da API do provedor viraria trava de
   * envio para todos os tenants.
   */
  pendingQueue?(): Promise<number | null>;
}

/** Resultado final do serviço, após eventual failover. */
export interface WaSendResult {
  ok: boolean;
  /** Quem efetivamente entregou (quando ok). */
  provider?: WaProviderId;
  /** Trilha de cada provedor tentado, em ordem. */
  attempts: Array<{ provider: WaProviderId; ok: boolean; status?: number; reason?: string }>;
  /** Resumo do erro quando ok=false. */
  reason?: string;
}
