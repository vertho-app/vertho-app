// Gate de envio de tenant-demo — bloqueia disparo real (WhatsApp/e-mail) em
// ambientes de demonstração/treinamento.
//
// Fonte de verdade: coluna empresas.is_demo (mig 160), NÃO os flags cosméticos
// do sys_config. Todo ponto de disparo em lote (whatsapp-lote, fase2 e-mails,
// pulso, relatórios) e o caminho de magic link/signup consultam este guard e
// param ANTES de mandar qualquer mensagem quando o tenant é demo.
//
// Fail-safe: em erro de leitura, NÃO bloqueia (não queremos derrubar envio real
// por um blip); a proteção de última instância continua sendo as personas
// @vertho.ai sem telefone. Observável: loga toda supressão.
import { createSupabaseAdmin } from '@/lib/supabase';

// Cache curto por processo — dispatch em lote chama uma vez por ação, mas o
// login/signup chama por usuário; evita repetir a query no mesmo burst.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { isDemo: boolean; at: number }>();

/** true se o tenant é de demonstração (envios reais bloqueados). */
export async function isTenantDemo(empresaId: string | null | undefined): Promise<boolean> {
  if (!empresaId) return false;
  const now = Date.now();
  const hit = cache.get(empresaId);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.isDemo;
  try {
    const sb = createSupabaseAdmin();
    const { data } = await sb.from('empresas').select('is_demo').eq('id', empresaId).maybeSingle();
    const isDemo = !!(data as any)?.is_demo;
    cache.set(empresaId, { isDemo, at: now });
    return isDemo;
  } catch (e: any) {
    console.warn('[envio-guard] falha ao ler is_demo, NÃO bloqueando:', e?.message);
    return false;
  }
}

export type EnvioGate = { blocked: boolean; motivo?: string };

/**
 * Resultado de gate para o topo dos dispatchers. Quando `blocked`, o chamador
 * deve retornar SEM enviar nada (com uma mensagem clara ao operador).
 */
export async function gateEnvioDemo(empresaId: string | null | undefined): Promise<EnvioGate> {
  if (await isTenantDemo(empresaId)) {
    console.log(`[envio-guard] disparo suprimido — tenant demo ${empresaId}`);
    return { blocked: true, motivo: 'Envios reais estão desligados no ambiente de demonstração.' };
  }
  return { blocked: false };
}

/** Limpa o cache (usar após reset/mudança de flag do tenant). */
export function resetEnvioGuardCache() {
  cache.clear();
}
