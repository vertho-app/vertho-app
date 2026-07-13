'use server';

/**
 * Leitura do ledger de IA (S1.3) — o custo REAL medido, para comparar com o
 * estimado do catálogo no /admin/vertho/simulador-custo.
 *
 * Agregação acontece no Postgres (função ia_uso_resumo, mig 178) — não puxamos
 * as linhas cruas do ledger para o Node. Gate: platform admin em leitura.
 */

import { requireAdminAction } from '@/lib/auth/action-context';
import { createSupabaseAdmin } from '@/lib/supabase';

export interface UsoRealLinha {
  feature: string;
  provider: string;
  model: string;
  chamadas: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  custo_usd: number;
  /** Fração das chamadas cujo modelo está no catálogo (cost_usd não-nulo). <1 = custo real subestimado. */
  custo_conhecido_frac: number;
  latencia_ms_media: number | null;
}

export interface UsoRealResumo {
  linhas: UsoRealLinha[];
  dias: number;
}

export async function getUsoRealIA(dias = 30): Promise<UsoRealResumo | { erro: string }> {
  await requireAdminAction();
  const d = Math.min(365, Math.max(1, Math.floor(Number(dias) || 30)));
  const sb = createSupabaseAdmin();
  const { data, error } = await sb.rpc('ia_uso_resumo', { p_dias: d });
  if (error) return { erro: error.message };

  const linhas: UsoRealLinha[] = (data || []).map((r: any) => ({
    feature: r.feature,
    provider: r.provider,
    model: r.model,
    chamadas: Number(r.chamadas) || 0,
    input_tokens: Number(r.input_tokens) || 0,
    output_tokens: Number(r.output_tokens) || 0,
    cache_read_tokens: Number(r.cache_read_tokens) || 0,
    cache_write_tokens: Number(r.cache_write_tokens) || 0,
    custo_usd: Number(r.custo_usd) || 0,
    custo_conhecido_frac: r.custo_conhecido_frac == null ? 1 : Number(r.custo_conhecido_frac),
    latencia_ms_media: r.latencia_ms_media == null ? null : Number(r.latencia_ms_media),
  }));

  return { linhas, dias: d };
}
