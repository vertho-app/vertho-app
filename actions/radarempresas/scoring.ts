'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { calcularScore, classificarHelper, SCORING_VERSION, type ScoreInput } from '@/lib/radarempresas/score';
import { calcularPriorityRank } from '@/lib/radarempresas/priority-rank';
import { assertBlocoOnline } from '@/lib/blocos-offline';

const TETO_VAL: Record<string, number> = { boa: 79, nutrir: 59, baixa: 39 };

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
const GENERICO: CnaeSegMap = {
  cnae_prefixo: '', prefixo_len: 0, segmento_key: 'generico',
  people_intensity_score: 55, leadership_complexity_score: 55,
  onboarding_need_score: 55, standardization_need_score: 55,
  commercial_fit_score: 50, is_priority: false,
};

// Híbrido 3 vias: allowlist curada → genérico → excluído (denylist).
// Mantido em sincronia com scripts/radarempresas-score.ts.
function classificarCnae(cnae: string | null, mapa: CnaeSegMap[], deny: string[]) {
  if (!cnae) return { tipo: 'excluido' as const, seg: null as CnaeSegMap | null };
  const c = cnae.replace(/\D/g, '');
  for (const m of mapa) if (c.startsWith(m.cnae_prefixo)) return { tipo: 'curado' as const, seg: m };
  for (const d of deny) if (c.startsWith(d)) return { tipo: 'excluido' as const, seg: null };
  return { tipo: 'generico' as const, seg: GENERICO };
}

// Razão social de PJ unipessoal/holding → excluído (pega disfarçados
// em CNAE de educação/saúde). Sincronizado com scripts/radarempresas-score.ts.
function nomeBloqueado(razao: string | null | undefined): boolean {
  const r = (razao || '').toUpperCase();
  return /\bCONSULTORIA\b/.test(r) || /PARTICIPAC/.test(r);
}

/**
 * Calcula o Score de Oportunidade Vertho pra todos os estabelecimentos
 * carregados e faz upsert em radarempresas_scores. Idempotente.
 * Admin-only. Registra um job em radarempresas_jobs.
 */
export async function rodarScores(
  opts?: { scoringVersion?: string },
): Promise<{ ok: true; processados: number; sem_segmento: number; erros: number; job_id: string } | { ok: false; error: string }> {
  assertBlocoOnline('radarempresas');
  const sb = await requireAdminSupabase('ai.audit.regenerate');
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
    const { data: denyRaw } = await sb.from('radarempresas_cnae_denylist')
      .select('cnae_prefixo').order('prefixo_len', { ascending: false });
    const deny = (denyRaw || []).map((d: any) => d.cnae_prefixo as string);
    const { data: segTeto } = await sb.from('radarempresas_segmentos')
      .select('key, classificacao_teto').not('classificacao_teto', 'is', null);
    const tetoMap = new Map<string, string>((segTeto || []).map((s: any) => [s.key, s.classificacao_teto]));

    // Contexto v4: rotatividade real CAGED÷RAIS com travas estatísticas
    // (piso estoque/mov, suavização bayesiana, cap). Mantido em sincronia
    // com scripts/radarempresas-score.ts — alterar os dois juntos.
    const ALPHA = 30, CAP = 1.5, PISO_EST = 30, PISO_MOV = 10;
    const cagedCtx = new Map<string, number>();
    const ctxConf = new Map<string, 'alta' | 'media' | 'baixa'>();
    const raisTam = new Map<string, number>();
    {
      const [{ data: cg }, { data: rs }] = await Promise.all([
        sb.from('radarempresas_caged_municipio_cnae_6m')
          .select('cnae, admissoes_6m, desligamentos_6m').eq('municipio_ibge', '352590'),
        sb.from('radarempresas_rais_estab_municipio_cnae')
          .select('cnae, estoque_vinculos, tam_medio_estimado').eq('municipio_ibge', '352590'),
      ]);
      const rais = new Map<string, { estoque: number; tam: number }>();
      for (const r of (rs || []) as any[]) {
        const k = String(r.cnae).replace(/\D/g, '');
        rais.set(k, { estoque: r.estoque_vinculos || 0, tam: r.tam_medio_estimado || 0 });
        if (r.tam_medio_estimado != null) raisTam.set(k, r.tam_medio_estimado);
      }
      const robustos: number[] = [];
      for (const c of (cg || []) as any[]) {
        const rr = rais.get(String(c.cnae).replace(/\D/g, ''));
        const mov = (c.admissoes_6m || 0) + (c.desligamentos_6m || 0);
        if (rr && rr.estoque >= PISO_EST && mov >= PISO_MOV) robustos.push(mov / rr.estoque);
      }
      const mediaGlobal = robustos.length ? robustos.reduce((a, b) => a + b, 0) / robustos.length : 0.3;
      const raw: { cnae: string; val: number }[] = [];
      for (const c of (cg || []) as any[]) {
        const cnae = String(c.cnae).replace(/\D/g, '');
        const mov = (c.admissoes_6m || 0) + (c.desligamentos_6m || 0);
        const rr = rais.get(cnae);
        let val: number;
        if (rr && rr.estoque > 0) {
          val = Math.min((mov + ALPHA * mediaGlobal) / (rr.estoque + ALPHA), CAP);
          const robusto = rr.estoque >= PISO_EST && mov >= PISO_MOV;
          const meio = rr.estoque >= PISO_EST || mov >= PISO_MOV;
          ctxConf.set(cnae, robusto ? 'alta' : meio ? 'media' : 'baixa');
        } else { val = Math.min(mov / 1000, CAP); ctxConf.set(cnae, 'baixa'); }
        raw.push({ cnae, val });
      }
      raw.sort((a, b) => a.val - b.val);
      const n = raw.length;
      raw.forEach((r, idx) => cagedCtx.set(r.cnae, n > 1 ? Math.round((idx / (n - 1)) * 100) : 50));
    }

    // Empresas (capital/porte) em mapa por cnpj_basico
    const empMap = new Map<string, { capital_social: number | null; porte_empresa: string | null; razao_social: string | null }>();
    {
      let from = 0;
      const page = 1000;
      for (;;) {
        const { data, error } = await sb.from('radarempresas_empresas')
          .select('cnpj_basico, capital_social, porte_empresa, razao_social')
          .order('cnpj_basico')
          .range(from, from + page - 1);
        // Falha ALTO: este mapa alimenta porte e capital de TODO estabelecimento.
        // Uma página perdida em silêncio não quebra nada — só faz mil empresas
        // serem pontuadas como se não tivessem porte nem capital, e o job fecha
        // "done" com 93.710 scores errados. É construção: tem humano para agir.
        if (error) throw new Error(`radarempresas_empresas (offset ${from}): ${error.message}`);
        if (!data?.length) break;
        for (const e of data as any[]) {
          empMap.set(e.cnpj_basico, { capital_social: e.capital_social, porte_empresa: e.porte_empresa, razao_social: e.razao_social });
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
        const { data, error } = await sb.from('radarempresas_estabelecimentos')
          .select('cnpj_basico')
          .order('id')
          .range(from, from + page - 1);
        // Mesma régua: daqui sai `qtd_estabelecimentos_grupo` (multiunidade),
        // que entra no score. Página perdida = rede contada como unidade única.
        if (error) throw new Error(`contagem de estabelecimentos (offset ${from}): ${error.message}`);
        if (!data?.length) break;
        for (const r of data as any[]) {
          grupoCount.set(r.cnpj_basico, (grupoCount.get(r.cnpj_basico) || 0) + 1);
        }
        if (data.length < page) break;
        from += page;
      }
    }

    let semSegmento = 0, erros = 0;
    let from = 0;
    const page = 500;
    const allRows: any[] = [];
    const elegiveis: { id: string; score: number }[] = [];

    for (;;) {
      const { data: estabs, error } = await sb.from('radarempresas_estabelecimentos')
        .select('id, cnpj_basico, cnpj_completo, is_matriz, cnae_principal, has_email, has_phone, has_fantasia, company_age_years')
        .order('id')
        .range(from, from + page - 1);
      /**
       * 🔴 Era `{ erros++; break; }`: contava UM erro e saía do laço, e o
       * `priority_rank` seguia sendo calculado sobre o que tinha chegado até ali.
       * O job fechava `done` com um percentil tirado de uma AMOSTRA e o chamava
       * de ranking — e `rows_processed` mostrava o número menor sem que nada
       * dissesse por quê. Falhar aqui é construção: tem humano para reagir.
       */
      if (error) throw new Error(`estabelecimentos (offset ${from}): ${error.message}`);
      if (!estabs?.length) break;

      for (const est of estabs as any[]) {
        const emp = empMap.get(est.cnpj_basico) || { capital_social: null, porte_empresa: null, razao_social: null };
        let { tipo, seg } = classificarCnae(est.cnae_principal, mapa, deny);
        if (tipo !== 'excluido' && nomeBloqueado(emp.razao_social)) { tipo = 'excluido'; seg = null; }
        if (tipo === 'excluido') { semSegmento++; }
        const cnaeK = String(est.cnae_principal || '').replace(/\D/g, '');

        const input: ScoreInput = {
          porte_empresa: emp.porte_empresa,
          capital_social: emp.capital_social,
          is_matriz: !!est.is_matriz,
          company_age_years: est.company_age_years,
          has_email: !!est.has_email,
          has_phone: !!est.has_phone,
          has_fantasia: !!est.has_fantasia,
          qtd_estabelecimentos_grupo: grupoCount.get(est.cnpj_basico) || 1,
          segmento_key: seg?.segmento_key || null,
          segmento_mapeado: tipo !== 'excluido',
          aderencia_tipo: tipo === 'curado' ? 'curado' : 'generico',
          people_intensity_score: seg?.people_intensity_score ?? 30,
          leadership_complexity_score: seg?.leadership_complexity_score ?? 30,
          onboarding_need_score: seg?.onboarding_need_score ?? 30,
          standardization_need_score: seg?.standardization_need_score ?? 30,
          commercial_fit_score: seg?.commercial_fit_score ?? 25,
          is_priority_cnae: seg?.is_priority ?? false,
          caged_contexto_score: cagedCtx.get(cnaeK) ?? null,
          contexto_confianca: ctxConf.get(cnaeK) ?? null,
          rais_tam_medio_setor: raisTam.get(cnaeK) ?? null,
        };

        const r = calcularScore(input);
        let scoreFinal = r.score_total;
        let classifFinal: string = r.classificacao;
        const teto = input.segmento_key ? tetoMap.get(input.segmento_key) : undefined;
        const tetoCap = teto ? TETO_VAL[teto] : undefined;
        const capeado = tetoCap != null && scoreFinal > tetoCap;
        if (capeado) { scoreFinal = tetoCap!; classifFinal = classificarHelper(scoreFinal); }
        if (input.segmento_mapeado && !r.low_team_probability) {
          elegiveis.push({ id: est.id, score: scoreFinal });
        }
        allRows.push({
          estabelecimento_id: est.id,
          cnpj_completo: est.cnpj_completo,
          score_total: scoreFinal,
          score_dor_pessoas: r.score_dor_pessoas,
          score_capacidade_compra: r.score_capacidade_compra,
          score_fit_vertho: r.score_fit_vertho,
          score_contexto_setorial: r.score_contexto_setorial,
          classificacao: classifFinal,
          score_confidence: r.score_confidence,
          commercial_actionability: r.commercial_actionability,
          low_team_probability: r.low_team_probability,
          priority_rank: null,
          score_explanation: {
            ...r.explanation, segmento_key: input.segmento_key,
            ...(capeado ? { teto_comercial: { segmento: input.segmento_key, teto, score_original: r.score_total } } : {}),
          },
          scoring_version: version,
          updated_at: new Date().toISOString(),
        });
      }
      if (estabs.length < page) break;
      from += page;
    }

    // priority_rank: percentil entre elegíveis (segmento + não-micro)
    const rankById = calcularPriorityRank(elegiveis);
    for (const row of allRows) row.priority_rank = rankById.get(row.estabelecimento_id) ?? null;

    let processados = 0;
    for (let i = 0; i < allRows.length; i += 1000) {
      const lote = allRows.slice(i, i + 1000);
      const { error: upErr } = await sb.from('radarempresas_scores')
        .upsert(lote, { onConflict: 'estabelecimento_id' });
      if (upErr) erros += lote.length; else processados += lote.length;
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
