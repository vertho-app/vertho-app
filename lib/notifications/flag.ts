/**
 * Flag por empresa que libera o convite de push (`sys_config.notificacoes_push`).
 *
 * Existe como helper próprio em vez de entrar no `resolveTenantFromHeaders`
 * porque aquele resolver é caminho quente de toda a área logada: acrescentar
 * coluna lá custa em todo request do app inteiro para servir um spike que hoje
 * roda num tenant só.
 *
 * Cache curto por processo, mesmo padrão de `lib/demo/envio-guard`.
 *
 * FAIL-CLOSED de propósito: em erro de leitura, devolve `false`. É o oposto do
 * `envio-guard` (que falha aberto para não derrubar envio real), e a razão é a
 * assimetria de custo — aqui, falhar aberto exibiria um convite de notificação
 * para tenants que não pediram nada.
 */
import { createSupabaseAdmin } from '@/lib/supabase';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { ligado: boolean; at: number }>();

export async function pushHabilitado(empresaId: string | null | undefined): Promise<boolean> {
  if (!empresaId) return false;
  const agora = Date.now();
  const hit = cache.get(empresaId);
  if (hit && agora - hit.at < CACHE_TTL_MS) return hit.ligado;

  try {
    const sb = createSupabaseAdmin();
    const { data, error } = await sb
      .from('empresas')
      .select('sys_config')
      .eq('id', empresaId)
      .maybeSingle();
    // supabase-js RETORNA `{ error }`; sem esta checagem a falha viraria
    // "flag desligada" indistinguível de flag realmente desligada.
    if (error) {
      console.warn('[push/flag] falha ao ler sys_config, mantendo desligado:', error.message);
      return false;
    }
    const ligado = Boolean((data as any)?.sys_config?.notificacoes_push);
    cache.set(empresaId, { ligado, at: agora });
    return ligado;
  } catch (e: any) {
    console.warn('[push/flag] erro ao ler flag, mantendo desligado:', e?.message || e);
    return false;
  }
}

/** Limpa o cache (usar após mudar a flag do tenant). */
export function resetPushFlagCache() {
  cache.clear();
}
