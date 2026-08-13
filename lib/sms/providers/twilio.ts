// Adapter Twilio Programmable Messaging (SMS).
//
// REST: POST {BASE}/2010-04-01/Accounts/{ACCOUNT_SID}/Messages.json
//   auth:  Basic base64(usuario:senha) — ver `credencial()` abaixo
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
/** Conta que DONA do recurso — vai sempre na URL, mesmo autenticando por API Key. */
const accountSid = () => process.env.TWILIO_ACCOUNT_SID || '';
const authToken = () => process.env.TWILIO_AUTH_TOKEN || '';
const apiKeySid = () => process.env.TWILIO_API_KEY_SID || '';
const apiKeySecret = () => process.env.TWILIO_API_KEY_SECRET || '';
/** Remetente: número comprado (+55...) OU Messaging Service (MG...). */
const from = () => process.env.TWILIO_SMS_FROM || '';

/**
 * Par (usuário, senha) do Basic auth. A Twilio aceita DOIS esquemas:
 *
 *   1. **API Key** — `SK…` + secret. Preferido: é revogável sozinha, tem escopo
 *      e não é a credencial-mestra da conta. Tem precedência aqui.
 *   2. **Account SID + Auth Token** — a credencial-mestra. Vazou, vazou tudo.
 *
 * 🔴 A ARMADILHA da API Key, e a razão de esta função existir separada da URL:
 * o `SK…` autentica, mas **NÃO** é o dono do recurso. A URL continua exigindo o
 * `AC…` da conta. Trocar um pelo outro devolve 404 num endpoint que existe — um
 * erro que se lê como "recurso não encontrado" quando na verdade é credencial
 * montada errada, e que custa uma tarde para quem nunca viu.
 */
function credencial(): { user: string; pass: string } | null {
  if (apiKeySid() && apiKeySecret()) return { user: apiKeySid(), pass: apiKeySecret() };
  if (accountSid() && authToken()) return { user: accountSid(), pass: authToken() };
  return null;
}

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

/**
 * O remetente também precisa de E.164 quando é NÚMERO — mas não quando é um
 * Messaging Service (`MG…`), que não é telefone e seria destruído por `paraE164`.
 *
 * Medido em 13/08/2026: a env foi preenchida como `551151980701`, sem o `+`.
 * `To` já era normalizado e `From` não, então a primeira mensagem real bateria
 * em 21212 ("Invalid From number") — um erro que aponta para o número e não
 * para o código que esqueceu de normalizá-lo.
 */
function remetenteNormalizado(valor: string): string {
  return campoRemetente(valor) === 'MessagingServiceSid' ? valor : paraE164(valor);
}

/**
 * O que ainda falta para o canal ficar de pé, em português, para aparecer no
 * log em vez de um 401 cru. Uma credencial pela metade é o estado NORMAL de quem
 * está configurando — e "não configurado" sem dizer o que falta é a diferença
 * entre cinco minutos e uma tarde.
 */
export function pendenciasDeConfig(): string[] {
  const faltando: string[] = [];
  if (!accountSid()) faltando.push('TWILIO_ACCOUNT_SID (o AC… da conta, mesmo usando API Key)');
  if (!credencial()) faltando.push('TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET (ou TWILIO_AUTH_TOKEN)');
  if (!from()) faltando.push('TWILIO_SMS_FROM (número +55… comprado ou Messaging Service MG…)');
  return faltando;
}

export const twilioProvider: SmsProvider = {
  id: 'twilio',
  label: 'Twilio SMS',
  configured: () => pendenciasDeConfig().length === 0,

  async send(msg: SmsMessage): Promise<SmsSendOutcome> {
    const pendencias = pendenciasDeConfig();
    if (pendencias.length) return { ok: false, reason: `Twilio incompleto — falta: ${pendencias.join('; ')}` };

    const cred = credencial()!;
    const corpo = new URLSearchParams({
      To: paraE164(msg.phone),
      Body: msg.text,
      [campoRemetente(from())]: remetenteNormalizado(from()),
    });

    try {
      // Sempre o ACCOUNT SID na URL — ver a nota em `credencial()`.
      const res = await fetch(`${BASE}/2010-04-01/Accounts/${accountSid()}/Messages.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${cred.user}:${cred.pass}`).toString('base64'),
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
