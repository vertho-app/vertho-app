/**
 * Resolução de score — fonte ÚNICA da lógica que envolve o motor puro
 * calcularScore (lib/radarempresas/score.ts):
 *
 *  - classificação CNAE 3-vias (allowlist curada → genérico → denylist)
 *  - bloqueio por razão social (consultoria / participações)
 *  - montagem do ScoreInput
 *  - teto comercial por segmento (capeia + reclassifica)
 *
 * Antes isto vivia duplicado em scripts/radarempresas-score.ts E
 * actions/radarempresas/scoring.ts ("mantidos em sync" = drift à
 * espreita). O pipeline BR (data-pipeline/radarempresas/br) consome
 * ESTE módulo — zero divergência entre Supabase e Parquet. Os dois
 * scripts antigos devem convergir pra cá depois.
 *
 * PURO: nenhuma dependência de Supabase/IO. O contexto setorial
 * (CAGED÷RAIS bayesiano) é calculado fora (Stage 3, por município×CNAE)
 * e entra resolvido via ContextoLookup.
 */
import {
  calcularScore, classificarHelper, SCORING_VERSION, type ScoreInput,
} from './score';

// Teto de classificação por segmento (override comercial reversível).
export const TETO_VAL: Record<string, number> = { boa: 79, nutrir: 59, baixa: 39 };

// Pesos do "aderente genérico" (fallback híbrido): medianos.
export const GENERICO = {
  segmento_key: 'generico', people_intensity_score: 55,
  leadership_complexity_score: 55, onboarding_need_score: 55,
  standardization_need_score: 55, commercial_fit_score: 50, is_priority: false,
};

/**
 * Razão social que indica PJ unipessoal / holding (sem equipe):
 * "consultoria" (palavra) ou "participaç..." (prefixo) → excluído,
 * independente do CNAE (pega disfarce em CNAE de educação/saúde).
 */
export function nomeBloqueado(razao: string | null | undefined): boolean {
  const r = (razao || '').toUpperCase();
  return /\bCONSULTORIA\b/.test(r) || /PARTICIPAC/.test(r);
}

export interface CnaeRegra {
  cnae_prefixo: string;
  segmento_key: string;
  people_intensity_score: number;
  leadership_complexity_score: number;
  onboarding_need_score: number;
  standardization_need_score: number;
  commercial_fit_score: number;
  is_priority: boolean;
}

export type AderenciaTipo = 'curado' | 'generico' | 'excluido';

/**
 * 3 vias: allowlist curada → genérico (fallback) → excluído (denylist).
 * `mapa` deve vir ordenado por prefixo_len DESC (match mais específico
 * primeiro); `denySet` idem.
 */
export function classificarCnae(
  cnae: string | null, mapa: CnaeRegra[], denySet: { p: string }[],
): { tipo: AderenciaTipo; seg: CnaeRegra | typeof GENERICO | null } {
  if (!cnae) return { tipo: 'excluido', seg: null };
  const c = cnae.replace(/\D/g, '');
  for (const m of mapa) if (c.startsWith(m.cnae_prefixo)) return { tipo: 'curado', seg: m };
  for (const d of denySet) if (c.startsWith(d.p)) return { tipo: 'excluido', seg: null };
  return { tipo: 'generico', seg: GENERICO };
}

/** Dados do estab/empresa já resolvidos (de Parquet ou Supabase). */
export interface EstabInput {
  estabelecimento_id: string;
  cnpj_completo: string;
  cnpj_basico: string;
  cnae_principal: string | null;
  is_matriz: boolean;
  has_email: boolean;
  has_phone: boolean;
  has_fantasia: boolean;
  company_age_years: number | null;
  qtd_estabelecimentos_grupo: number;
  porte_empresa: string | null;
  capital_social: number | null;
  razao_social: string | null;
}

/** Contexto setorial resolvido por CNAE (Stage 3 / Supabase caged+rais). */
export interface ContextoSetor {
  caged_contexto_score: number | null;
  contexto_confianca: 'alta' | 'media' | 'baixa' | null;
  rais_tam_medio_setor: number | null;
}
export type ContextoLookup = (cnaeDigits: string) => ContextoSetor;

export interface ScoreRow {
  estabelecimento_id: string;
  cnpj_completo: string;
  score_total: number;
  score_dor_pessoas: number;
  score_capacidade_compra: number;
  score_fit_vertho: number;
  score_contexto_setorial: number | null;
  classificacao: string;
  score_confidence: string;
  commercial_actionability: number;
  low_team_probability: boolean;
  priority_rank: number | null;   // preenchido depois (percentil nacional)
  segmento_key: string | null;
  elegivel: boolean;              // segmento_mapeado && !low_team
  score_explanation: any;
  scoring_version: string;
}

/**
 * Resolve + pontua UM estabelecimento. Espelha exatamente a lógica de
 * scripts/radarempresas-score.ts (sem o IO). priority_rank fica null —
 * é percentil, calculado em lote depois (Stage 5, nacional).
 */
export function scoreEstab(
  est: EstabInput,
  mapa: CnaeRegra[],
  denySet: { p: string }[],
  tetoMap: Map<string, string>,
  ctx: ContextoLookup,
): ScoreRow {
  let { tipo, seg } = classificarCnae(est.cnae_principal, mapa, denySet);
  if (tipo !== 'excluido' && nomeBloqueado(est.razao_social)) { tipo = 'excluido'; seg = null; }
  const cnaeK = String(est.cnae_principal || '').replace(/\D/g, '');
  const cs = ctx(cnaeK);
  const s: any = seg;

  const input: ScoreInput = {
    porte_empresa: est.porte_empresa ?? null,
    capital_social: est.capital_social ?? null,
    is_matriz: !!est.is_matriz,
    company_age_years: est.company_age_years,
    has_email: !!est.has_email,
    has_phone: !!est.has_phone,
    has_fantasia: !!est.has_fantasia,
    qtd_estabelecimentos_grupo: est.qtd_estabelecimentos_grupo || 1,
    segmento_key: s?.segmento_key || null,
    segmento_mapeado: tipo !== 'excluido',
    aderencia_tipo: tipo === 'curado' ? 'curado' : 'generico',
    people_intensity_score: s?.people_intensity_score ?? 30,
    leadership_complexity_score: s?.leadership_complexity_score ?? 30,
    onboarding_need_score: s?.onboarding_need_score ?? 30,
    standardization_need_score: s?.standardization_need_score ?? 30,
    commercial_fit_score: s?.commercial_fit_score ?? 25,
    is_priority_cnae: s?.is_priority ?? false,
    caged_contexto_score: cs.caged_contexto_score,
    contexto_confianca: cs.contexto_confianca,
    rais_tam_medio_setor: cs.rais_tam_medio_setor,
  };

  const r = calcularScore(input);

  // Teto comercial por segmento (capeia score_total + reclassifica).
  let scoreFinal = r.score_total;
  let classifFinal: string = r.classificacao;
  const teto = input.segmento_key ? tetoMap.get(input.segmento_key) : undefined;
  const tetoCap = teto ? TETO_VAL[teto] : undefined;
  const capeado = tetoCap != null && scoreFinal > tetoCap;
  if (capeado) { scoreFinal = tetoCap!; classifFinal = classificarHelper(scoreFinal); }

  return {
    estabelecimento_id: est.estabelecimento_id,
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
    segmento_key: input.segmento_key,
    elegivel: input.segmento_mapeado === true && !r.low_team_probability,
    score_explanation: {
      ...r.explanation, segmento_key: input.segmento_key,
      ...(capeado ? { teto_comercial: { segmento: input.segmento_key, teto, score_original: r.score_total } } : {}),
    },
    scoring_version: SCORING_VERSION,
  };
}
