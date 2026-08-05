/**
 * Adapter Web Push (VAPID + RFC 8291).
 *
 * Contrato deliberadamente estreito: recebe a subscription crua e o payload já
 * serializado, devolve um resultado tipado e NUNCA lança. Quem decide o que
 * fazer com a falha é o núcleo (`push-core`), não o adapter.
 *
 * O campo `morto` é a razão de este tipo existir: 404/410 do provedor significam
 * que a inscrição não existe mais (app desinstalado, PWA removido da tela de
 * início, token rotacionado). Isso NÃO é erro transitório — reenviar para sempre
 * gera falha crônica e polui a medição. É sinal para desligar o endpoint.
 */
import webpush from 'web-push';

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Interface única com campos opcionais em vez de união discriminada: o projeto
 * roda `strict: false`, e sem `strictNullChecks` o TS não estreita união por
 * `if (r.ok)`. União aqui daria erro de compilação em quem consome, então a
 * forma honesta é esta — com os campos documentados por quando valem.
 */
export interface WebPushResult {
  ok: boolean;
  status?: number;
  /** Preenchido quando ok=false. */
  motivo?: string;
  /** true = inscrição morta (404/410) → desligar o endpoint, não retentar. */
  morto?: boolean;
}

let configurado = false;

/** Lê as VAPID do ambiente. Devolve o motivo quando não dá pra configurar. */
function configurar(): { ok: boolean; motivo?: string } {
  if (configurado) return { ok: true };
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:contato@vertho.ai';
  if (!publica || !privada) {
    return { ok: false, motivo: 'VAPID ausente (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)' };
  }
  webpush.setVapidDetails(subject, publica, privada);
  configurado = true;
  return { ok: true };
}

/** Só para teste: força releitura das envs entre casos. */
export function resetWebPushConfig() {
  configurado = false;
}

export function webPushConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function enviarWebPush(
  subscription: WebPushSubscription,
  payload: string
): Promise<WebPushResult> {
  const cfg = configurar();
  if (!cfg.ok) return { ok: false, motivo: cfg.motivo, morto: false };

  try {
    const r = await webpush.sendNotification(subscription as any, payload, { TTL: 60 * 60 * 12 });
    return { ok: true, status: r?.statusCode };
  } catch (e: any) {
    const status: number | undefined = e?.statusCode;
    // 404/410 = inscrição morta. 413 (payload grande) e 429 (throttle) são
    // nossos problemas, não do usuário — não desligam o endpoint.
    const morto = status === 404 || status === 410;
    return {
      ok: false,
      status,
      motivo: e?.body || e?.message || 'falha desconhecida no web push',
      morto,
    };
  }
}
