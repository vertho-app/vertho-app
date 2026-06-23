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
