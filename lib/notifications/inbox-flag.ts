/**
 * Flag global da inbox: `empresas.sys_config.notificacoes_inbox_push`.
 *
 * FAIL-CLOSED: qualquer erro ou ausência = desligado.
 * Cache curto por processo.
 */

import { createSupabaseAdmin } from '@/lib/supabase';

const CACHE_TTL_MS = 60_000;
let cache: { ligado: boolean; at: number } | null = null;

export async function inboxPushHabilitado(): Promise<boolean> {
  const agora = Date.now();
  if (cache && agora - cache.at < CACHE_TTL_MS) return cache.ligado;

  try {
    const sb = createSupabaseAdmin();
    // Lê sys_config de todas as empresas (são ~10 linhas) e checa em código.
    // Evita filtro PostgREST em jsonb (->>) que não é indexado e varia por versão.
    const { data, error } = await sb.from('empresas').select('sys_config').limit(50);
    if (error) {
      console.warn('[inbox/flag] falha ao ler sys_config:', error.message);
      cache = { ligado: false, at: agora };
      return false;
    }
    const ligado = Boolean(
      (data as any[])?.some((r) => {
        const v: any = (r as any)?.sys_config?.notificacoes_inbox_push;
        return v === true || v === 'true' || v === 1 || v === '1';
      })
    );
    cache = { ligado, at: agora };
    return ligado;
  } catch (e: any) {
    console.warn('[inbox/flag] erro:', e?.message || e);
    cache = { ligado: false, at: Date.now() };
    return false;
  }
}

export function resetInboxPushFlagCache() {
  cache = null;
}
