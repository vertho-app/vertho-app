'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { requireAdminAction } from '@/lib/auth/action-context';

/**
 * Mercado potencial — uso interno comercial.
 *
 * 3 endpoints (município, rede, escola) puxam das MVs criadas na migration 093.
 * Saeb / Ideb / VAAR / ENEM JOIN em runtime das MVs existentes do Radar.
 *
 * TAM = (professores + gestores) × preço/mês (configurável pelo user).
 * Score = TAM × fit_pedagogico × fit_financeiro (cada um 0-1).
 *   fit_pedagogico = 0.5 + 0.5 × (% sem pós + % recém-formados) / 2
 *   fit_financeiro pública = 0.5 + 0.5 × (1 - INSE_norm) — INSE 6 = mais pobre = mais demanda
 *   fit_financeiro privada = 0.5 + 0.5 × INSE_norm — INSE 1 = mais rica = mais bolso
 *
 * Sinais opcionais (NULL quando ausente, não afetam score base):
 *   pública  → saeb_proficiencia, ideb_meta_atingida, vaar_aluno
 *   privada  → enem_media, saresp_proficiencia (SP)
 */

export interface MercadoFilters {
  uf?: string[];                          // multi-UF (vazio = todas)
  redes?: string[];                       // MUNICIPAL/ESTADUAL/FEDERAL/PRIVADA (vazio = todas)
  municipioBusca?: string;                // busca por nome do município (ilike)
  inseMin?: number;                       // 1-6 (NULL passa)
  inseMax?: number;
  precoProf?: number;                     // R$/mês por professor (default 300)
  precoGestor?: number;                   // R$/mês por gestor (default 500)
  idadeOnboarding?: number;               // corte recém-formados (default 29)
  orderBy?: string;                       // coluna pra ordenar
  orderDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

interface MercadoRowBase {
  id: string;                             // municipio_ibge | rede pk | codigo_inep
  nome: string;
  uf: string;
  rede?: string;                          // só nas tabs rede e escola
  inse_medio: number | null;
  qt_escolas: number;
  qt_professores: number;
  qt_docs_jovens: number;
  qt_docs_pos: number;
  qt_gestores: number;
  pct_sem_pos: number;                    // 0-1
  pct_jovens: number;                     // 0-1
  tam_mensal_mentor_ia: number;
  tam_mensal_onboarding: number;
  fit_pedagogico: number;                 // 0-1
  fit_financeiro: number | null;
  score_base: number;                     // TAM_total × fit_pedagogico (quando INSE NULL)
  score_completo: number | null;          // TAM_total × fit_pedagogico × fit_financeiro
}

// ── Scoring helpers ─────────────────────────────────────────────────────────

const DEFAULTS = { precoProf: 300, precoGestor: 500, idadeOnboarding: 29 };

function calcularScores(row: any, filtros: MercadoFilters): Partial<MercadoRowBase> & { qt_jovens_efetivo: number; qt_professores_onboarding: number; qt_professores_total: number } {
  const precoProf = filtros.precoProf ?? DEFAULTS.precoProf;
  const precoGestor = filtros.precoGestor ?? DEFAULTS.precoGestor;
  const idadeCorte = filtros.idadeOnboarding ?? DEFAULTS.idadeOnboarding;
  const profs = Number(row.qt_professores || 0);
  // INEP publica idade em faixas fixas — corte 24 usa só 0-24; corte 29
  // (default) usa 0-24 + 25-29 (= qt_docs_jovens já agregado na MV).
  // Outros valores caem no fallback 29 (limitação documentada).
  const jovens = idadeCorte <= 24
    ? Number(row.qt_docs_0_24 || 0)
    : Number(row.qt_docs_jovens || 0);
  const pos = Number(row.qt_docs_pos || 0);
  const gestores = Number(row.qt_gestores || 0);
  const inse = row.inse_medio != null ? Number(row.inse_medio) : null;

  const pct_sem_pos = profs > 0 ? Math.max(0, 1 - pos / profs) : 0;
  const pct_jovens = profs > 0 ? jovens / profs : 0;

  const tam_mensal_mentor_ia = profs * precoProf + gestores * precoGestor;
  const tam_mensal_onboarding = jovens * precoProf + gestores * precoGestor;

  // fit_pedagogico: maior quando há mais lacuna formativa (sem pós, recém-formados)
  const fit_pedagogico = Math.min(1, 0.4 + 0.3 * pct_sem_pos + 0.3 * pct_jovens);

  // fit_financeiro: depende da rede principal (público vs privado)
  // INSE INEP: 1 = nível socioeconômico MAIS BAIXO; 6 = MAIS ALTO.
  // Normaliza pra inseNorm 0-1 onde 1 = mais rico, 0 = mais pobre.
  // Privada: INSE alto = mais bolso. Pública: INSE baixo = mais demanda/ROI político.
  const redeRow = (row.rede || '').toUpperCase();
  let fit_financeiro: number | null = null;
  if (inse != null) {
    const inseNorm = (inse - 1) / 5; // 0 (INSE 1, mais pobre) a 1 (INSE 6, mais rico)
    if (redeRow === 'PRIVADA') {
      // Privada com INSE alto (6) → mais bolso
      fit_financeiro = 0.4 + 0.6 * inseNorm;
    } else if (redeRow === 'MUNICIPAL' || redeRow === 'ESTADUAL' || redeRow === 'FEDERAL') {
      // Pública: escolas mais carentes (INSE baixo) geram mais demanda
      fit_financeiro = 0.5 + 0.4 * (1 - inseNorm);
    } else {
      // Município agregado (sem rede): combina ambos
      fit_financeiro = 0.5;
    }
  }

  const score_base = tam_mensal_mentor_ia * fit_pedagogico;
  const score_completo = fit_financeiro != null ? score_base * fit_financeiro : null;

  return {
    pct_sem_pos, pct_jovens,
    tam_mensal_mentor_ia, tam_mensal_onboarding,
    fit_pedagogico, fit_financeiro,
    score_base, score_completo,
    qt_jovens_efetivo: jovens,              // reflete idadeCorte escolhido (24 ou 29)
    qt_professores_onboarding: jovens,      // público elegível do onboarding no corte selecionado
    qt_professores_total: profs,
  };
}

/**
 * Aplica filtros UF + INSE + busca de cidade na query.
 * INSE: a MV de município/rede tem `inse_medio` (AVG agregado); a MV de escola
 * tem `inse_grupo` (valor original 1-6). Caller passa o nome da coluna.
 */
function aplicarFiltrosBase(query: any, filtros: MercadoFilters, inseCol: 'inse_medio' | 'inse_grupo' | 'inse_efetivo' = 'inse_medio') {
  if (filtros.uf?.length) query = query.in('uf', filtros.uf);
  if (filtros.inseMin != null) query = query.gte(inseCol, filtros.inseMin);
  if (filtros.inseMax != null) query = query.lte(inseCol, filtros.inseMax);
  if (filtros.municipioBusca?.trim()) {
    // ilike é case-insensitive; unaccent ficaria melhor, mas o índice gin trgm
    // em diag_escolas não está nas MVs — usar ilike simples.
    query = query.ilike('municipio', `%${filtros.municipioBusca.trim()}%`);
  }
  return query;
}

// ── 1. Lista por município ──────────────────────────────────────────────────

export async function loadMercadoMunicipios(filtros: MercadoFilters = {}) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  // ~5.570 municípios no Brasil — default cobre o universo inteiro.
  const limit = Math.min(filtros.limit ?? 6000, 10000);

  let q = sb.from('diag_mv_mercado_municipio')
    .select('municipio_ibge, municipio, uf, microrregiao, qt_escolas, qt_escolas_municipal, qt_escolas_estadual, qt_escolas_federal, qt_escolas_privada, qt_professores, qt_docs_0_24, qt_docs_jovens, qt_docs_pos, qt_gestores, inse_medio, pct_inse_oficial, score_conectividade');
  q = aplicarFiltrosBase(q, filtros);
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) return { error: error.message };

  let rows = (data || []).map((r: any) => ({
    id: r.municipio_ibge,
    nome: r.municipio,
    uf: r.uf,
    microrregiao: r.microrregiao,
    qt_escolas: Number(r.qt_escolas),
    qt_escolas_breakdown: {
      municipal: Number(r.qt_escolas_municipal || 0),
      estadual: Number(r.qt_escolas_estadual || 0),
      federal: Number(r.qt_escolas_federal || 0),
      privada: Number(r.qt_escolas_privada || 0),
    },
    qt_professores: Number(r.qt_professores || 0),
    qt_docs_0_24: Number(r.qt_docs_0_24 || 0),
    qt_docs_jovens: Number(r.qt_docs_jovens || 0),
    qt_docs_pos: Number(r.qt_docs_pos || 0),
    qt_gestores: Number(r.qt_gestores || 0),
    inse_medio: r.inse_medio != null ? Number(r.inse_medio) : null,
    pct_inse_oficial: r.pct_inse_oficial != null ? Number(r.pct_inse_oficial) : null,
    score_conectividade: r.score_conectividade,
    ...calcularScores(r, filtros),
  }));

  rows = ordenarRows(rows, filtros);
  return { ok: true, rows, total: rows.length };
}

// ── 2. Lista por rede (município × rede) ────────────────────────────────────

export async function loadMercadoRedes(filtros: MercadoFilters = {}) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  // (5.570 municípios × 4 redes) = ~22k combinações no pior caso — default
  // 8000 cobre maioria; use filtros pra reduzir mais.
  const limit = Math.min(filtros.limit ?? 8000, 25000);

  let q = sb.from('diag_mv_mercado_rede')
    .select('municipio_ibge, municipio, uf, rede, qt_escolas, qt_professores, qt_docs_0_24, qt_docs_jovens, qt_docs_pos, qt_gestores, inse_medio, pct_inse_oficial');
  q = aplicarFiltrosBase(q, filtros);
  if (filtros.redes?.length) q = q.in('rede', filtros.redes);
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) return { error: error.message };

  let rows = (data || []).map((r: any) => ({
    id: `${r.municipio_ibge}::${r.rede}`,
    nome: `${r.municipio} — ${r.rede}`,
    uf: r.uf,
    rede: r.rede,
    municipio: r.municipio,
    municipio_ibge: r.municipio_ibge,
    qt_escolas: Number(r.qt_escolas),
    qt_professores: Number(r.qt_professores || 0),
    qt_docs_0_24: Number(r.qt_docs_0_24 || 0),
    qt_docs_jovens: Number(r.qt_docs_jovens || 0),
    qt_docs_pos: Number(r.qt_docs_pos || 0),
    qt_gestores: Number(r.qt_gestores || 0),
    inse_medio: r.inse_medio != null ? Number(r.inse_medio) : null,
    pct_inse_oficial: r.pct_inse_oficial != null ? Number(r.pct_inse_oficial) : null,
    ...calcularScores(r, filtros),
  }));

  rows = ordenarRows(rows, filtros);
  return { ok: true, rows, total: rows.length };
}

// ── 3. Lista por escola ─────────────────────────────────────────────────────

export async function loadMercadoEscolas(filtros: MercadoFilters = {}) {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  // ~180k escolas no Brasil — default conservador 1000, force user a filtrar
  // por UF/rede/INSE pra ver mais. Cap 10000 protege o browser.
  const limit = Math.min(filtros.limit ?? 1000, 10000);

  let q = sb.from('diag_mv_mercado_escola')
    .select('codigo_inep, nome, municipio, municipio_ibge, uf, rede, inse_grupo, inse_efetivo, inse_fonte, etapas, qt_professores, qt_doc_0_24, qt_docs_jovens, qt_docs_pos, qt_coord_pedag, qt_diretor_proxy, score_conectividade');
  // Escola usa `inse_efetivo` (oficial OR proxy) pra filtros — pra que privadas
  // sem INSE oficial ainda apareçam quando o range cobrir o proxy.
  q = aplicarFiltrosBase(q, filtros, 'inse_efetivo');
  if (filtros.redes?.length) q = q.in('rede', filtros.redes);
  q = q.limit(limit);

  const { data, error } = await q;
  if (error) return { error: error.message };

  let rows = (data || []).map((r: any) => {
    const qt_gestores = Number(r.qt_coord_pedag || 0) + Number(r.qt_diretor_proxy || 0);
    // Pra escola, score usa inse_efetivo (oficial OR proxy do Censo).
    const enriched = {
      ...r,
      qt_professores: Number(r.qt_professores || 0),
      qt_docs_0_24: Number(r.qt_doc_0_24 || 0),   // escola tem qt_doc_0_24 singular
      qt_docs_jovens: Number(r.qt_docs_jovens || 0),
      qt_docs_pos: Number(r.qt_docs_pos || 0),
      qt_gestores,
      inse_medio: r.inse_efetivo != null ? Number(r.inse_efetivo) : null,
      qt_escolas: 1,
    };
    return {
      id: r.codigo_inep,
      nome: r.nome,
      uf: r.uf,
      rede: r.rede,
      municipio: r.municipio,
      municipio_ibge: r.municipio_ibge,
      codigo_inep: r.codigo_inep,
      etapas: r.etapas,
      qt_escolas: 1,
      qt_professores: enriched.qt_professores,
      qt_docs_0_24: enriched.qt_docs_0_24,
      qt_docs_jovens: enriched.qt_docs_jovens,
      qt_docs_pos: enriched.qt_docs_pos,
      qt_gestores: enriched.qt_gestores,
      inse_medio: enriched.inse_medio,
      inse_fonte: r.inse_fonte || null,             // 'oficial' | 'inferido'
      inse_grupo_oficial: r.inse_grupo != null ? Number(r.inse_grupo) : null,
      score_conectividade: r.score_conectividade,
      ...calcularScores(enriched, filtros),
    };
  });

  rows = ordenarRows(rows, filtros);
  return { ok: true, rows, total: rows.length };
}

// ── Ordenação universal ─────────────────────────────────────────────────────

function ordenarRows(rows: any[], filtros: MercadoFilters): any[] {
  const orderBy = filtros.orderBy || 'score_completo';
  const orderDir = filtros.orderDir || 'desc';
  const mult = orderDir === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    const av = a[orderBy] ?? -Infinity;
    const bv = b[orderBy] ?? -Infinity;
    if (av === bv) return 0;
    return av < bv ? -1 * mult : 1 * mult;
  });
}

// ── Refresh manual das MVs (admin Vertho only) ─────────────────────────────

export async function refreshMercadoPotencial() {
  await requireAdminAction();
  const sb = createSupabaseAdmin();
  const { error } = await sb.rpc('refresh_mv_mercado_potencial');
  if (error) return { error: error.message };
  return { ok: true, message: 'MVs atualizadas' };
}
