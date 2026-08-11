export type ZapiStatus = {
  configured: boolean;
  connected: boolean;
  session: boolean;
  smartphoneConnected: boolean;
  error?: string;
  raw?: any;
};

export function getZapiConfig() {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN || '';
  const configured = Boolean(instanceId && token);

  return {
    configured,
    instanceId,
    token,
    clientToken,
    baseUrl: configured ? `https://api.z-api.io/instances/${instanceId}/token/${token}` : '',
  };
}

export async function getZapiStatus(): Promise<ZapiStatus> {
  const cfg = getZapiConfig();
  if (!cfg.configured) {
    return {
      configured: false,
      connected: false,
      session: false,
      smartphoneConnected: false,
      error: 'Z-API não configurada',
    };
  }

  const res = await fetch(`${cfg.baseUrl}/status`, {
    headers: {
      'Content-Type': 'application/json',
      'Client-Token': cfg.clientToken,
    },
    cache: 'no-store',
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      configured: true,
      connected: false,
      session: false,
      smartphoneConnected: false,
      error: `Z-API status ${res.status}`,
      raw,
    };
  }

  return {
    configured: true,
    connected: raw?.connected === true,
    session: raw?.session === true,
    smartphoneConnected: raw?.smartphoneConnected === true,
    error: raw?.error,
    raw,
  };
}

/**
 * Quantas mensagens estão presas na fila INTERNA da Z-API.
 *
 * A Z-API aceita o POST (HTTP 200) e só então tenta entregar. Se o celular cair
 * no meio, a mensagem fica na fila dela — e **descarrega toda de uma vez quando
 * o número reconecta**. Em 11/08/2026, 13 mensagens do lote de Macaé ficaram
 * aqui: contadas como "sucesso" no nosso log, nunca entregues, e prontas para
 * disparar em rajada assim que a instância voltasse — em cima de um número que
 * acabara de ser bloqueado.
 *
 * Devolve `null` quando não dá para saber (não configurada, erro de rede, HTTP
 * ruim, formato inesperado). `null` é "não sei", diferente de `0` = "está
 * vazia" — quem decide bloquear um disparo precisa distinguir os dois.
 */
export async function getZapiQueueSize(): Promise<number | null> {
  const cfg = getZapiConfig();
  if (!cfg.configured) return null;

  try {
    const res = await fetch(`${cfg.baseUrl}/queue`, {
      headers: { 'Content-Type': 'application/json', 'Client-Token': cfg.clientToken },
      cache: 'no-store',
    });
    if (!res.ok) return null;

    const raw = await res.json().catch(() => null);
    // A Z-API devolve um array cru; os wrappers cobrem variações de formato.
    const itens = Array.isArray(raw) ? raw : (raw?.queue ?? raw?.messages);
    return Array.isArray(itens) ? itens.length : null;
  } catch {
    return null;
  }
}

export async function assertZapiConnected(): Promise<ZapiStatus> {
  const status = await getZapiStatus();
  if (!status.configured) throw new Error(status.error || 'Z-API não configurada');
  // A Z-API pode responder session=false mesmo quando a instância já está
  // conectada ao smartphone. Para envio, connected + smartphoneConnected é o
  // sinal operacional mais confiável.
  if (!status.connected || !status.smartphoneConnected) {
    throw new Error(
      `Z-API desconectada: connected=${status.connected}, session=${status.session}, smartphoneConnected=${status.smartphoneConnected}` +
      `${status.error ? `, error="${status.error}"` : ''}`,
    );
  }
  return status;
}
