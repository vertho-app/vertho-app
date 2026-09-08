import crypto from 'crypto';

/**
 * Autenticação das mensagens do SNS.
 *
 * Este endpoint é PÚBLICO na internet, como todo webhook, e o que ele faz é
 * carimbar "entregue"/"não chegou" em telemetria de envio. Sem autenticar,
 * qualquer um marca como entregue uma mensagem que nunca chegou — corrompendo
 * exatamente a métrica que o webhook existe para tornar confiável. Mesma régua
 * do webhook da Cloud API.
 *
 * O SNS assina a mensagem com a chave privada da AWS e publica o certificado em
 * `SigningCertURL`. A validação tem três partes, e as três importam:
 *
 *  1. o HOST do certificado é da AWS (`sns.<region>.amazonaws.com`) — sem isso o
 *     atacante aponta para um certificado dele e a assinatura "confere";
 *  2. a string canônica é montada com os campos EXATOS do tipo da mensagem, na
 *     ordem da documentação (campo a mais ou a menos muda o hash);
 *  3. o `TopicArn` é o esperado — assinatura válida de OUTRO tópico da AWS
 *     continua sendo assinatura válida.
 */

/** Campos e ordem da string canônica, por tipo de mensagem. */
const CAMPOS: Record<string, string[]> = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
};

/** Só host da AWS: é o elo que impede o atacante de servir o próprio certificado. */
export function urlDaAws(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname);
  } catch { return false; }
}

export function stringCanonica(msg: Record<string, any>): string | null {
  const campos = CAMPOS[String(msg?.Type)];
  if (!campos) return null;
  let out = '';
  for (const c of campos) {
    // `Subject` é opcional: quando ausente, fica FORA da string (não entra vazio).
    if (msg[c] === undefined || msg[c] === null) continue;
    out += `${c}\n${msg[c]}\n`;
  }
  return out;
}

async function baixarCertificado(url: string, buscar: typeof fetch): Promise<string | null> {
  try {
    const r = await buscar(url);
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

/**
 * Confere a assinatura. `topicArnEsperado` vazio = recusa: preferimos o webhook
 * mudo a um webhook que aceita qualquer tópico.
 */
export async function verifySesWebhook(
  msg: Record<string, any>,
  opts: { topicArnEsperado?: string | null; buscar?: typeof fetch } = {},
): Promise<{ ok: boolean; motivo?: string }> {
  const esperado = (opts.topicArnEsperado || '').trim();
  if (!esperado) return { ok: false, motivo: 'SES_SNS_TOPIC_ARN ausente' };
  if (msg?.TopicArn !== esperado) return { ok: false, motivo: 'TopicArn inesperado' };

  const certUrl = String(msg?.SigningCertURL || msg?.SigningCertUrl || '');
  if (!urlDaAws(certUrl)) return { ok: false, motivo: 'SigningCertURL fora do domínio da AWS' };

  const canonica = stringCanonica(msg);
  if (!canonica) return { ok: false, motivo: `tipo desconhecido: ${msg?.Type}` };

  const pem = await baixarCertificado(certUrl, opts.buscar || fetch);
  if (!pem) return { ok: false, motivo: 'não foi possível baixar o certificado' };

  const algoritmo = String(msg?.SignatureVersion) === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  try {
    const v = crypto.createVerify(algoritmo);
    v.update(canonica, 'utf8');
    return v.verify(pem, String(msg?.Signature || ''), 'base64')
      ? { ok: true }
      : { ok: false, motivo: 'assinatura não confere' };
  } catch (e: any) {
    return { ok: false, motivo: `falha ao verificar: ${e?.message || e}` };
  }
}
