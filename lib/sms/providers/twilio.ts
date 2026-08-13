// Adapter Twilio Programmable Messaging (SMS).
//
// REST: POST {BASE}/2010-04-01/Accounts/{SID}/Messages.json
//   auth:  Basic base64(SID:AUTH_TOKEN)
//   corpo: application/x-www-form-urlencoded — To, Body e (From | MessagingServiceSid)
//   200/201 → { sid, status: "queued", error_code, error_message, ... }
//   4xx/5xx → { code, message, more_info, status }
//
// `fetch` direto em vez do SDK oficial: é o padrão dos adapters de mensageria
// desta base (ver `lib/whatsapp/providers/wasender.ts`) e evita uma dependência
// nova para três campos de formulário. Note que a regra "nunca montar request
// cru" do CLAUDE.md é sobre IA (o contrato muda a cada geração de modelo) — a
// API de mensagens da Twilio está congelada na versão 2010-04-01 há quinze anos.
import type { SmsMessage, SmsProvider, SmsSendOutcome } from '../types';

const BASE = (process.env.TWILIO_BASE_URL || 'https://api.twilio.com').replace(/\/+$/, '');
const sid = () => process.env.TWILIO_ACCOUNT_SID || '';
const token = () => process.env.TWILIO_AUTH_TOKEN || '';
/** Remetente: número comprado (+55...) OU Messaging Service (MG...). */
const from = () => process.env.TWILIO_SMS_FROM || '';

/**
 * A Twilio aceita o remetente em dois campos MUTUAMENTE exclusivos, e mandar o
 * SID de um Messaging Service no campo `From` é erro 21212 ("Invalid From
 * number"). Como o valor certo depende de como a conta foi montada — e quem
 * configura a env não necessariamente sabe a diferença —, o campo é escolhido
 * aqui pelo prefixo, que é o único sinal confiável.
 */
function campoRemetente(valor: string): 'MessagingServiceSid' | 'From' {
  return /^MG[0-9a-f]{32}$/i.test(valor) ? 'MessagingServiceSid' : 'From';
}

/** E.164 com '+' — a Twilio recusa número sem o prefixo internacional. */
const paraE164 = (phone: string) => '+' + phone.replace(/\D/g, '');

export const twilioProvider: SmsProvider = {
  id: 'twilio',
  label: 'Twilio SMS',
  configured: () => Boolean(sid() && token() && from()),

  async send(msg: SmsMessage): Promise<SmsSendOutcome> {
    if (!this.configured()) return { ok: false, reason: 'Twilio não configurado' };

    const corpo = new URLSearchParams({
      To: paraE164(msg.phone),
      Body: msg.text,
      [campoRemetente(from())]: from(),
    });

    try {
      const res = await fetch(`${BASE}/2010-04-01/Accounts/${sid()}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${sid()}:${token()}`).toString('base64'),
        },
        body: corpo.toString(),
        cache: 'no-store',
      });

      const json: any = await res.json().catch(() => null);

      if (!res.ok) {
        // A Twilio devolve o motivo em `message` + `code`; sem eles, o status
        // HTTP sozinho não diz se é credencial errada, número inválido ou saldo.
        const detalhe = json?.message ? `${json.message}${json.code ? ` (${json.code})` : ''}` : '';
        return { ok: false, status: res.status, reason: `Twilio HTTP ${res.status}${detalhe ? ': ' + detalhe : ''}` };
      }

      // 2xx com `error_code` preenchido: a API aceitou a chamada e RECUSOU a
      // mensagem. Tratar como sucesso aqui produziria exatamente o relatório
      // mentiroso que esta base já pagou uma vez — envio contabilizado, nada
      // entregue.
      if (json?.error_code) {
        return {
          ok: false,
          status: res.status,
          reason: `Twilio recusou: ${json.error_message || 'erro ' + json.error_code} (${json.error_code})`,
        };
      }

      return { ok: true, status: res.status, providerMessageId: json?.sid ?? null };
    } catch (e: any) {
      return { ok: false, reason: `Twilio rede: ${String(e?.message || e).slice(0, 150)}` };
    }
  },
};
