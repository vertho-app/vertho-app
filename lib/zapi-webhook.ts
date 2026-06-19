import { timingSafeEqual } from 'node:crypto';

export type ZapiWebhookCheck = {
  ok: boolean;
  status: number;
  reason?: string;
  payload?: Record<string, any>;
};

function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual exige buffers do mesmo tamanho; checar length antes só vaza
  // o tamanho (aceitável — não vaza o conteúdo do segredo).
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verifica a autenticidade de um callback da Z-API.
 *
 * LIMITAÇÃO DO PROVIDER: a Z-API NÃO assina o payload e NÃO permite header
 * customizado no webhook — o callback é configurado apenas como uma URL de
 * destino (confirmado na doc oficial). Logo:
 *   - não há HMAC real possível (ficaria dependente de suporte futuro da Z-API);
 *   - o shared secret precisa viajar NA URL (querystring), pois é o único canal.
 *
 * Defesa viável (defense-in-depth):
 *   - secret obrigatório em produção (fail-closed: sem segredo → recusa);
 *   - aceito por header `x-vertho-webhook-secret` (preferencial, p/ outros
 *     providers/proxies que reescrevam) OU querystring `secret` (Z-API);
 *   - comparação em tempo constante (timingSafeEqual);
 *   - `instanceId` do payload validado contra ZAPI_INSTANCE_ID — segundo fator,
 *     já que só a nossa instância emite o nosso ID;
 *   - JSON de objeto obrigatório.
 *
 * IMPORTANTE: o chamador NÃO deve logar `req.url` (o secret está na query). Esta
 * função nunca devolve o segredo no `reason`.
 *
 * Lê o corpo (req.json() só pode ser consumido uma vez): em caso de sucesso
 * devolve o payload já parseado em `payload`.
 */
export async function verifyZapiWebhook(req: Request): Promise<ZapiWebhookCheck> {
  const secret = process.env.ZAPI_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, status: 401, reason: 'segredo ausente em producao' };
    }
    // dev/local sem segredo configurado: segue (facilita testes locais)
  } else {
    const url = new URL(req.url);
    const received = req.headers.get('x-vertho-webhook-secret') || url.searchParams.get('secret') || '';
    if (!received || !secretsMatch(received, secret)) {
      return { ok: false, status: 401, reason: 'segredo invalido' };
    }
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return { ok: false, status: 400, reason: 'json invalido' };
  }
  if (!payload || typeof payload !== 'object') {
    return { ok: false, status: 400, reason: 'payload invalido' };
  }

  const expected = process.env.ZAPI_INSTANCE_ID;
  if (expected) {
    if (!payload.instanceId || typeof payload.instanceId !== 'string') {
      return { ok: false, status: 401, reason: 'instancia ausente' };
    }
    if (payload.instanceId !== expected) {
      return { ok: false, status: 401, reason: 'instancia divergente' };
    }
  }

  return { ok: true, status: 200, payload };
}
