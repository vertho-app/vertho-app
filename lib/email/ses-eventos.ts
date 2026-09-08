/**
 * Eventos de entrega do Amazon SES (via SNS) → colunas de `notification_deliveries`.
 *
 * POR QUE EXISTE (08/09/2026). O e-mail era o único canal sem telemetria de
 * entrega: `Medido` nos 30 dias até hoje, 1.255 envios pelo Resend com **zero**
 * `provider_message_id`, logo zero entregas e zero bounces — "saiu" era tudo o
 * que se sabia. No WhatsApp isso já funciona há tempo: o envio guarda o id da
 * mensagem e o webhook carimba a linha depois. O SES fecha o par no e-mail
 * porque devolve `MessageId` no envio, e é esse mesmo id que volta em
 * `mail.messageId` no evento.
 *
 * 🔑 O ganho maior não é abertura, é BOUNCE. Endereço errado hoje some sem
 * rastro, e a pessoa fica meses parecendo desengajada quando nunca recebeu nada.
 *
 * A régua das colunas é a mesma do WhatsApp (`lib/whatsapp/cloud-webhook.ts`):
 * `status` continua significando "o provedor ACEITOU" e não é tocado aqui.
 * Aceite e entrega são eixos diferentes; fundi-los foi o que fez "155 enviados"
 * virar 50 entregues.
 */

export type TipoEventoSes =
  | 'Delivery' | 'Bounce' | 'Complaint' | 'Reject' | 'Send'
  | 'Open' | 'Click' | 'DeliveryDelay' | 'Rendering Failure' | 'Subscription';

export interface EventoSes {
  /** `mail.messageId` — o mesmo id devolvido pelo `SendEmailCommand`. */
  messageId: string;
  tipo: TipoEventoSes | string;
  /** ISO. Cai para o horário do processamento quando o evento não traz. */
  timestamp: string;
  /** Motivo legível de bounce/complaint/reject. */
  erro?: string;
}

/** Tipos que descrevem falha DEFINITIVA de entrega. */
const FALHAS = new Set(['Bounce', 'Reject', 'Rendering Failure']);

/**
 * Lê o corpo `Message` de uma notificação SNS do SES.
 *
 * Devolve `null` para o que não der para atribuir a uma linha: sem
 * `mail.messageId` não há o que carimbar, e inventar uma correspondência aqui
 * seria pior que não medir.
 */
export function interpretarEventoSes(mensagem: unknown): EventoSes | null {
  let raiz: any = mensagem;
  if (typeof mensagem === 'string') {
    try { raiz = JSON.parse(mensagem); } catch { return null; }
  }
  if (!raiz || typeof raiz !== 'object') return null;

  const messageId = raiz?.mail?.messageId;
  if (!messageId || typeof messageId !== 'string') return null;

  // `eventType` é o campo do event publishing; `notificationType` é o formato
  // antigo (feedback notification). Aceitar os dois evita que a escolha da
  // origem no console da AWS decida se a métrica existe.
  const tipo = raiz.eventType || raiz.notificationType;
  if (!tipo || typeof tipo !== 'string') return null;

  const timestamp = String(
    raiz?.delivery?.timestamp
    || raiz?.bounce?.timestamp
    || raiz?.complaint?.timestamp
    || raiz?.open?.timestamp
    || raiz?.mail?.timestamp
    || new Date().toISOString(),
  );

  let erro: string | undefined;
  if (tipo === 'Bounce') {
    const b = raiz.bounce || {};
    const diag = b.bouncedRecipients?.[0]?.diagnosticCode;
    erro = [b.bounceType, b.bounceSubType, diag].filter(Boolean).join(' · ').slice(0, 300) || undefined;
  } else if (tipo === 'Complaint') {
    erro = String(raiz.complaint?.complaintFeedbackType || 'complaint').slice(0, 300);
  } else if (tipo === 'Reject') {
    erro = String(raiz.reject?.reason || 'reject').slice(0, 300);
  }

  return { messageId, tipo, timestamp, erro };
}

/**
 * Colunas a atualizar para um evento. Vazio = evento conhecido que não move
 * nada (`Send` é o aceite, que a linha já registrou no envio).
 */
export function camposDoEventoSes(e: EventoSes): Record<string, unknown> {
  const campos: Record<string, unknown> = { provider_status: e.tipo };

  if (e.tipo === 'Delivery') campos.delivered_at = e.timestamp;
  if (e.tipo === 'Open') {
    campos.opened_at = e.timestamp;
    // Abertura implica entrega. A ordem dos eventos não é garantida, e sem isto
    // um `Open` que chegasse antes deixaria a linha eternamente "não entregue" —
    // a mesma armadilha já corrigida no webhook do WhatsApp.
    campos.delivered_at = e.timestamp;
  }
  if (FALHAS.has(e.tipo)) {
    campos.failed_at = e.timestamp;
    if (e.erro) campos.error = e.erro;
  }
  // `Complaint` (marcou como spam) NÃO é falha de entrega: chegou, e a pessoa
  // reclamou. Vira `provider_status` para a decisão de parar de escrever para
  // ela, sem falsear a entrega.
  if (e.tipo === 'Complaint' && e.erro) campos.error = e.erro;

  return campos;
}
