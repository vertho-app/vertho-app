'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { calcularScore, SCORING_VERSION, type ScoreInput } from '@/lib/radarempresas/score';

interface CnaeSegMap {
  cnae_prefixo: string;
  prefixo_len: number;
  segmento_key: string;
  people_intensity_score: number;
  leadership_complexity_score: number;
  onboarding_need_score: number;
  standardization_need_score: number;
  commercial_fit_score: number;
  is_priority: boolean;
}

/**
 * Resolve o segmento de um CNAE pelo registro mais específico:
 * o de maior prefixo_len cujo cnae_prefixo prefixa o cnae do estabelecimento.
 * Mapa já vem ordenado por prefixo_len DESC.
 */
function matchSegmento(cnae: string | null, mapa: CnaeSegMap[]): CnaeSegMap | null {
  if (!cnae) return null;
  const c = cnae.replace(/\D/g, '');
  for (const m of mapa) {
    if (c.startsWith(m.cnae_prefixo)) return m;
  }
  return null;
}

/**
 * Calcula o Score de Oportunidade Vertho pra todos os estabelecimentos
 * carregados e faz upsert em radarempresas_scores. Idempotente.
 * Admin-only. Registra um job em radarempresas_jobs.
 */
export async function rodarScores(
  opts?: { scoringVersion?: string },
): Promise<{ ok: true; processados: number; sem_segmento: number; erros: number; job_id: string } | { ok: false; error: string }> {
  const sb = await requireAdminSupabase();
  const version = opts?.scoringVersion || SCORING_VERSION;

  const { data: job } = await sb.from('radarempresas_jobs')
    .insert({ job_type: 'score', status: 'running', source_version: version })
    .select('id').single();
  const jobId = (job as any)?.id;

  try {
    // Mapa CNAE→segmento (poucos registros) — ordenado mais específico primeiro
    const { data: mapaRaw } = await sb.from('radarempresas_cnae_segmento')
      .select('cnae_prefixo, prefixo_len, segmento_key, people_intensity_score, leadership_complexity_score, onboarding_need_score, standardization_need_score, commercial_fit_score, is_priority')
      .order('prefixo_len', { ascending: false });
    const mapa = (mapaRaw || []) as CnaeSegMap[];
    if (!mapa.length) {
      await finishJob(sb, jobId, 'failed', 0, 0, 1, 'mapa CNAE→segmento vazio');
      return { ok: false, error: 'Rode a migration 099 (seed cnae_segmento vazio)' };
    }

    // Empresas (capital/porte) em mapa por cnpj_basico
    const empMap = new Map<string, { capital_social: number | null; porte_empresa: string | null }>();
    {
      let from = 0;
      const page = 1000;
      for (;;) {
        const { data } = await sb.from('radarempresas_empresas')
          .select('cnpj_basico, capital_social, porte_empresa')
          .range(from, from + page - 1);
        if (!data?.length) break;
        for (const e of data as any[]) {
          empMap.set(e.cnpj_basico, { capital_social: e.capital_social, porte_empresa: e.porte_empresa });
        }
        if (data.length < page) break;
        from += page;
      }
    }

    // Contagem de estabelecimentos por cnpj_basico (multiunidade)
    const grupoCount = new Map<string, number>();
    {
      let from = 0;
      const page = 1000;
      for (;;) {
        const { data } = await sb.from('radarempresas_estabelecimentos')
          .select('cnpj_basico')
          .range(from, from + page - 1);
        if (!data?.length) break;
        for (const r of data as any[]) {
          grupoCount.set(r.cnpj_basico, (grupoCount.get(r.cnpj_basico) || 0) + 1);
        }
        if (data.length < page) break;
        from += page;
      }
    }

    let processados = 0, semSegmento = 0, erros = 0;
    let from = 0;
    const page = 500;

    for (;;) {
      const { data: estabs, error } = await sb.from('radarempresas_estabelecimentos')
        .select('id, cnpj_basico, cnpj_completo, is_matriz, cnae_principal, has_email, has_phone, company_age_years')
        .range(from, from + page - 1);
      if (error) { erros++; break; }
      if (!estabs?.length) break;

      const rows: any[] = [];
      for (const est of estabs as any[]) {
        const seg = matchSegmento(est.cnae_principal, mapa);
        if (!seg) { semSegmento++; }
        const emp = empMap.get(est.cnpj_basico) || { capital_social: null, porte_empresa: null };

        const input: ScoreInput = {
          porte_empresa: emp.porte_empresa,
          capital_social: emp.capital_social,
          is_matriz: !!est.is_matriz,
          company_age_years: est.company_age_years,
          has_email: !!est.has_email,
          has_phone: !!est.has_phone,
          qtd_estabelecimentos_grupo: grupoCount.get(est.cnpj_basico) || 1,
          segmento_key: seg?.segmento_key || null,
          people_intensity_score: seg?.people_intensity_score ?? 30,
          leadership_complexity_score: seg?.leadership_complexity_score ?? 30,
          onboarding_need_score: seg?.onboarding_need_score ?? 30,
          standardization_need_score: seg?.standardization_need_score ?? 30,
          commercial_fit_score: seg?.commercial_fit_score ?? 25,
          is_priority_cnae: seg?.is_priority ?? false,
        };

        const r = calcularScore(input);
        rows.push({
          estabelecimento_id: est.id,
          cnpj_completo: est.cnpj_completo,
          score_total: r.score_total,
          score_dor_pessoas: r.score_dor_pessoas,
          score_capacidade_compra: r.score_capacidade_compra,
          score_fit_vertho: r.score_fit_vertho,
          score_contexto_setorial: r.score_contexto_setorial,
          classificacao: r.classificacao,
          score_explanation: { ...r.explanation, segmento_key: input.segmento_key },
          scoring_version: version,
          updated_at: new Date().toISOString(),
        });
        processados++;
      }

      if (rows.length) {
        const { error: upErr } = await sb.from('radarempresas_scores')
          .upsert(rows, { onConflict: 'estabelecimento_id' });
        if (upErr) erros += rows.length;
      }

      if (estabs.length < page) break;
      from += page;
    }

    await finishJob(sb, jobId, 'done', processados, processados - erros, erros, null);
    return { ok: true, processados, sem_segmento: semSegmento, erros, job_id: jobId };
  } catch (e: any) {
    await finishJob(sb, jobId, 'failed', 0, 0, 1, e.message);
    return { ok: false, error: e.message };
  }
}

async function finishJob(sb: any, jobId: string, status: string, proc: number, ins: number, fail: number, err: string | null) {
  if (!jobId) return;
  await sb.from('radarempresas_jobs').update({
    status, rows_processed: proc, rows_inserted: ins, rows_failed: fail,
    finished_at: new Date().toISOString(), error_message: err,
  }).eq('id', jobId);
}
