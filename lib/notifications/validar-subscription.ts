/**
 * Validação de forma da subscription de Web Push, antes de gravar.
 *
 * Existe separada para ser testável sem rota e sem rede. Uma subscription
 * malformada só falharia na hora do ENVIO — longe da causa, e o sintoma seria
 * "push não funciona para essa pessoa", que é caro de diagnosticar.
 *
 * O campo `endpoint` é uma URL do serviço de push (Apple, FCM, Mozilla…). Exigir
 * HTTPS não é preciosismo: é o único transporte que os serviços reais usam, e um
 * endpoint http:// ou de esquema exótico só chega aqui por bug ou por abuso.
 */
export interface ResultadoValidacao {
  ok: boolean;
  motivo?: string;
}

/** Tetos generosos: a maior subscription real observada fica bem abaixo. */
const MAX_ENDPOINT = 2048;
const MAX_CHAVE = 256;

export function validarSubscription(sub: any): ResultadoValidacao {
  if (!sub || typeof sub !== 'object') return { ok: false, motivo: 'subscription ausente' };

  const endpoint = sub.endpoint;
  if (typeof endpoint !== 'string' || !endpoint) {
    return { ok: false, motivo: 'subscription sem endpoint' };
  }
  if (endpoint.length > MAX_ENDPOINT) {
    return { ok: false, motivo: 'endpoint longo demais' };
  }

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, motivo: 'endpoint não é URL válida' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, motivo: 'endpoint precisa ser https' };
  }

  const p256dh = sub.keys?.p256dh;
  const auth = sub.keys?.auth;
  if (typeof p256dh !== 'string' || !p256dh || typeof auth !== 'string' || !auth) {
    return { ok: false, motivo: 'subscription sem chaves p256dh/auth' };
  }
  if (p256dh.length > MAX_CHAVE || auth.length > MAX_CHAVE) {
    return { ok: false, motivo: 'chaves com tamanho inesperado' };
  }

  return { ok: true };
}
