// Serviço central de WhatsApp com FAILOVER multi-provedor.
//
// Uso:  const r = await sendWhatsapp({ kind: 'text', phone, text });
//       if (!r.ok) ... r.reason   // r.provider = quem entregou
//
// Ordem de tentativa = primária (env WHATSAPP_PRIMARY, default 'zapi') e depois
// os demais provedores configurados. Em cada provedor:
//   1. checa saúde (cacheada) — pula rápido quem está caído;
//   2. tenta enviar; se falhar num provedor saudável, marca cooldown e cai pro próximo.
//
// Redundância de VERDADE exige números/instâncias distintos (2 APIs ao vivo no
// mesmo número brigam pela sessão). Z-API e WaSender são ambos QR/não-oficiais:
// isso cobre queda de FORNECEDOR e ban por-número, não a fragilidade do QR em si
// — para isso, a primária deveria migrar para a Cloud API oficial (novo adapter).
import { normalizePhoneBR } from '@/lib/phone';
import { zapiProvider } from './providers/zapi';
import { wasenderProvider } from './providers/wasender';
import type { WaKind, WaMessage, WaProvider, WaProviderId, WaSendResult } from './types';

export type { WaMessage, WaProviderId, WaSendResult } from './types';

const REGISTRY: Record<WaProviderId, WaProvider> = {
  zapi: zapiProvider,
  wasender: wasenderProvider,
};

function primaryId(): WaProviderId {
  const p = process.env.WHATSAPP_PRIMARY as WaProviderId | undefined;
  return p && REGISTRY[p] ? p : 'zapi';
}

/** Provedores na ordem de tentativa, só os configurados. */
function orderedProviders(): WaProvider[] {
  const primary = primaryId();
  const ids = [primary, ...(Object.keys(REGISTRY) as WaProviderId[]).filter((id) => id !== primary)];
  return ids.map((id) => REGISTRY[id]).filter((p) => p.configured());
}

// ── Cache de saúde (evita bater /status a cada mensagem num disparo em lote) ──
const HEALTH_TTL_MS = 30_000; // saúde OK válida por 30s
const COOLDOWN_MS = 60_000;   // após falha, pula o provedor por 60s
type HealthEntry = { ok: boolean; reason?: string; at: number };
const healthCache = new Map<WaProviderId, HealthEntry>();

async function isHealthy(p: WaProvider): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now();
  const cached = healthCache.get(p.id);
  if (cached && now - cached.at < (cached.ok ? HEALTH_TTL_MS : COOLDOWN_MS)) {
    return { ok: cached.ok, reason: cached.reason };
  }
  const h = await p.health();
  healthCache.set(p.id, { ok: h.ok, reason: h.reason, at: now });
  return h;
}

function markDown(id: WaProviderId, reason: string) {
  healthCache.set(id, { ok: false, reason, at: Date.now() });
}

/**
 * Envia uma mensagem de WhatsApp pelo melhor provedor disponível, com failover
 * automático. Nunca lança — sempre devolve `WaSendResult` com a trilha.
 */
export async function sendWhatsapp(input: WaMessage): Promise<WaSendResult> {
  const phone = normalizePhoneBR(input.phone);
  if (!phone) return { ok: false, attempts: [], reason: `telefone inválido: ${input.phone}` };
  const msg = { ...input, phone } as WaMessage;

  const providers = orderedProviders();
  if (!providers.length) return { ok: false, attempts: [], reason: 'nenhum provedor de WhatsApp configurado' };

  const attempts: WaSendResult['attempts'] = [];
  for (const p of providers) {
    if (!p.capabilities[msg.kind as WaKind]) {
      attempts.push({ provider: p.id, ok: false, reason: `não suporta ${msg.kind}` });
      continue;
    }
    const h = await isHealthy(p);
    if (!h.ok) {
      attempts.push({ provider: p.id, ok: false, reason: `saúde: ${h.reason}` });
      continue;
    }
    const r = await p.send(msg);
    attempts.push({ provider: p.id, ok: r.ok, status: r.status, reason: r.reason });
    if (r.ok) return { ok: true, provider: p.id, attempts };
    // falhou num provedor que estava saudável → cooldown p/ próximas mensagens
    markDown(p.id, r.reason || 'falha no envio');
  }

  return { ok: false, attempts, reason: attempts.map((a) => `${a.provider}: ${a.reason}`).join(' | ') };
}

/** Saúde agregada de todos os provedores (para telas de admin/diagnóstico). */
export async function whatsappHealth(): Promise<
  Array<{ provider: WaProviderId; label: string; configured: boolean; ok: boolean; reason?: string; primary: boolean }>
> {
  const primary = primaryId();
  const out: Array<{ provider: WaProviderId; label: string; configured: boolean; ok: boolean; reason?: string; primary: boolean }> = [];
  for (const id of Object.keys(REGISTRY) as WaProviderId[]) {
    const p = REGISTRY[id];
    const configured = p.configured();
    const h = configured ? await p.health() : { ok: false, reason: 'não configurado' };
    out.push({ provider: id, label: p.label, configured, ok: h.ok, reason: h.reason, primary: id === primary });
  }
  return out;
}

/**
 * Pré-flight para disparos em lote: garante que existe ao menos UM provedor
 * saudável. Lança com mensagem amigável (mesmo contrato do antigo
 * `assertZapiConnected`, mas agnóstico de provedor).
 */
export async function assertWhatsappAvailable(): Promise<void> {
  const health = await whatsappHealth();
  if (!health.some((h) => h.configured)) throw new Error('Nenhum provedor de WhatsApp configurado');
  if (!health.some((h) => h.ok)) {
    const detail = health.filter((h) => h.configured).map((h) => `${h.label}: ${h.reason}`).join('; ');
    throw new Error(`WhatsApp indisponível (${detail})`);
  }
}

/** Força revalidação de saúde no próximo envio (ex.: após reconectar a instância). */
export function resetWhatsappHealthCache() {
  healthCache.clear();
}
