/**
 * Veredito do portão de deriva PERSISTIDO (`tts_qa_log`, mig 242) — fase 4 do plano
 * de deriva (06/09/2026). Até aqui o veredito só existia no log: não dava para saber a
 * taxa de retake por voz, quantas vezes o fail-open publicou "a menos ruim", nem se o
 * modelo GA mudou por baixo (o Google atualiza in-place). Uma linha por TENTATIVA;
 * `publicado` marca a que virou o áudio entregue.
 *
 * Client de INFRA (como o ledger): não é dado de tenant, `empresa_id` é etiqueta.
 * Nunca lança — perder o veredito não pode derrubar a síntese. Mas o `{ error }` do
 * supabase-js é lido e logado: perda silenciosa é justamente o que a tabela combate.
 */
import type { MetricasDeriva } from './deriva';

export interface VereditoTts {
  origem?: 'portao' | 'canario';
  feature: string;
  voz: string;
  modelo?: string | null;
  rotulo?: string | null;
  tentativa: number;
  totalTentativas: number;
  ok: boolean;
  publicado: boolean;
  motivos: string[];
  metricas: MetricasDeriva;
  empresaId?: string | null;
  correlationId?: string | null;
}

const num = (v: number | undefined | null, casas: number) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(casas)));

export async function gravarVereditosTts(vereditos: VereditoTts[]): Promise<boolean> {
  if (!vereditos.length) return true;
  try {
    const { createSupabaseAdmin } = await import('@/lib/supabase');
    const sb = createSupabaseAdmin();
    const linhas = vereditos.map((v) => ({
      origem: v.origem ?? 'portao',
      feature: v.feature,
      voz: v.voz,
      modelo: v.modelo ?? null,
      rotulo: v.rotulo ?? null,
      tentativa: v.tentativa,
      total_tentativas: v.totalTentativas,
      ok: v.ok,
      publicado: v.publicado,
      motivos: v.motivos,
      dur_s: num(v.metricas.durS, 2),
      janelas: v.metricas.janelas,
      fracao_vozeada: num(v.metricas.fracaoVozeada, 3),
      f0_med_hz: num(v.metricas.f0MedHz, 1),
      f0_amp_st: num(v.metricas.f0AmpSt, 2),
      f0_slope_st_min: num(v.metricas.f0SlopeStMin, 2),
      loud_slope_db_min: num(v.metricas.loudSlopeDbMin, 2),
      loud_amp_db: num(v.metricas.loudAmpDb, 2),
      timbre_max: num(v.metricas.timbreMaxVs1a, 3),
      timbre_vs_ref: num(v.metricas.timbreVsRefSigma, 3),
      empresa_id: v.empresaId ?? null,
      correlation_id: v.correlationId ?? null,
    }));
    const { error } = await sb.from('tts_qa_log').insert(linhas);
    if (error) { console.warn('[tts-qa] veredito NÃO gravado:', error.message); return false; }
    return true;
  } catch (e) {
    console.warn('[tts-qa] veredito NÃO gravado:', (e as Error)?.message);
    return false;
  }
}
