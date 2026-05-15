'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';
import { getSegmento } from '@/lib/radarempresas/segmentos';
import { CLASSIFICACAO_LABEL, type Classificacao } from '@/lib/radarempresas/score';

export interface FunilEtapa {
  etapa: string;
  quantidade: number;
  pct_do_topo: number;       // % relativo ao total de ativos
}

/**
 * Funil de Mercado Endereçável Vertho (ponto 1 do feedback).
 * Não basta "estabelecimentos ativos" — mostra o afunilamento até o
 * que é realmente abordável, evitando ilusão de TAM local inflado.
 *
 * Usa as colunas do score v4: priority_rank só é preenchido pra
 * ELEGÍVEIS (segmento mapeado + não-micro). low_team_probability,
 * commercial_actionability, score_total.
 */
export async function loadFunilMercado(): Promise<FunilEtapa[]> {
  const sb = await requireAdminSupabase();
  const T = 'radarempresas_scores';
  const cnt = async (f: (q: any) => any) => {
    const { count } = await f(sb.from(T).select('*', { count: 'exact', head: true }));
    return count || 0;
  };

  const ativos = await cnt((q: any) => q);
  const naoMicro = await cnt((q: any) => q.eq('low_team_probability', false));
  const aderente = await cnt((q: any) =>
    q.eq('low_team_probability', false).not('score_explanation->>segmento_key', 'is', null));
  const score60 = await cnt((q: any) =>
    q.eq('low_team_probability', false).not('score_explanation->>segmento_key', 'is', null)
      .gte('score_total', 60));
  const priorizados = await cnt((q: any) =>
    q.eq('low_team_probability', false).not('score_explanation->>segmento_key', 'is', null)
      .gte('score_total', 60).gte('priority_rank', 90));

  const pct = (n: number) => ativos > 0 ? Math.round((n / ativos) * 1000) / 10 : 0;
  return [
    { etapa: 'Estabelecimentos ativos', quantidade: ativos, pct_do_topo: 100 },
    { etapa: 'Excluindo micro sem equipe provável', quantidade: naoMicro, pct_do_topo: pct(naoMicro) },
    { etapa: 'CNAE aderente à Vertho', quantidade: aderente, pct_do_topo: pct(aderente) },
    { etapa: 'Score ≥ 60 (boa+)', quantidade: score60, pct_do_topo: pct(score60) },
    { etapa: 'Priorizados (top 10% elegíveis)', quantidade: priorizados, pct_do_topo: pct(priorizados) },
  ];
}

export interface RadarKpis {
  total_empresas: number;
  total_estabelecimentos: number;
  com_score: number;
  abordar_agora: number;
  boa: number;
  top_segmentos: { key: string; nome: string; n: number }[];
  genericos_count: number;   // aderentes sem segmento curado (a classificar)
  top_municipios: { municipio: string; n: number }[];
  ultimo_job: { status: string; finished_at: string | null; source_version: string | null } | null;
}

export async function loadRadarKpis(): Promise<RadarKpis> {
  const sb = await requireAdminSupabase();

  const [{ count: totEmp }, { count: totEst }, { count: comScore }] = await Promise.all([
    sb.from('radarempresas_empresas').select('*', { count: 'exact', head: true }),
    sb.from('radarempresas_estabelecimentos').select('*', { count: 'exact', head: true }),
    sb.from('radarempresas_scores').select('*', { count: 'exact', head: true }),
  ]);

  const [{ count: nAbordar }, { count: nBoa }] = await Promise.all([
    sb.from('radarempresas_scores').select('*', { count: 'exact', head: true }).eq('classificacao', 'abordar_agora'),
    sb.from('radarempresas_scores').select('*', { count: 'exact', head: true }).eq('classificacao', 'boa'),
  ]);

  // Top segmentos (via score_explanation->>segmento_key) — amostra
  const { data: scoresSample } = await sb.from('radarempresas_scores')
    .select('score_explanation').limit(5000);
  const segCount = new Map<string, number>();
  let genericos_amostra = 0;
  for (const s of (scoresSample || []) as any[]) {
    const k = s.score_explanation?.segmento_key;
    if (!k) continue;
    if (k === 'generico') { genericos_amostra++; continue; } // não é segmento de produto
    segCount.set(k, (segCount.get(k) || 0) + 1);
  }
  // só segmentos de produto reais (genérico = bucket a curar, fora do ranking)
  const top_segmentos = [...segCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([key, n]) => ({ key, nome: getSegmento(key)?.nome || key, n }));

  // Top municípios
  const { data: estSample } = await sb.from('radarempresas_estabelecimentos')
    .select('municipio_nome').limit(5000);
  const munCount = new Map<string, number>();
  for (const e of (estSample || []) as any[]) {
    const m = e.municipio_nome || '—';
    munCount.set(m, (munCount.get(m) || 0) + 1);
  }
  const top_municipios = [...munCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([municipio, n]) => ({ municipio, n }));

  const { count: genCount } = await sb.from('radarempresas_scores')
    .select('*', { count: 'exact', head: true })
    .eq('score_explanation->>segmento_key', 'generico');

  const { data: job } = await sb.from('radarempresas_jobs')
    .select('status, finished_at, source_version')
    .order('started_at', { ascending: false }).limit(1).maybeSingle();

  return {
    total_empresas: totEmp || 0,
    total_estabelecimentos: totEst || 0,
    com_score: comScore || 0,
    abordar_agora: nAbordar || 0,
    boa: nBoa || 0,
    top_segmentos,
    genericos_count: genCount || 0,
    top_municipios,
    ultimo_job: (job as any) || null,
  };
}

export interface RadarFiltros {
  uf?: string;
  municipio?: string;
  segmento_key?: string;
  porte?: string;
  classificacao?: Classificacao;
  score_min?: number;
  busca?: string;        // razão social / fantasia
  page?: number;
  pageSize?: number;
}

export interface RadarEmpresaRow {
  estabelecimento_id: string;
  cnpj_completo: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  municipio_nome: string | null;
  uf: string | null;
  cnae_principal: string | null;
  cnae_principal_desc: string | null;
  porte_empresa: string | null;
  capital_social: number | null;
  segmento_key: string | null;
  segmento_nome: string | null;
  score_total: number | null;
  classificacao: string | null;
  classificacao_label: string | null;
}

export async function listarEmpresas(
  f: RadarFiltros = {},
): Promise<{ rows: RadarEmpresaRow[]; total: number }> {
  const sb = await requireAdminSupabase();
  const page = f.page ?? 0;
  const pageSize = Math.min(f.pageSize ?? 50, 200);

  let q = sb.from('radarempresas_estabelecimentos')
    .select('id, cnpj_completo, nome_fantasia, municipio_nome, uf, cnae_principal, cnae_principal_desc, cnpj_basico', { count: 'exact' });

  if (f.uf) q = q.eq('uf', f.uf);
  if (f.municipio) q = q.ilike('municipio_nome', `%${f.municipio}%`);
  if (f.busca) q = q.ilike('nome_fantasia', `%${f.busca}%`);

  const { data: estabs, count, error } = await q
    .order('cnpj_completo')
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error || !estabs?.length) return { rows: [], total: count || 0 };

  const ids = (estabs as any[]).map(e => e.id);
  const basicos = [...new Set((estabs as any[]).map(e => e.cnpj_basico))];

  const [{ data: scores }, { data: empresas }] = await Promise.all([
    sb.from('radarempresas_scores')
      .select('estabelecimento_id, score_total, classificacao, score_explanation').in('estabelecimento_id', ids),
    sb.from('radarempresas_empresas')
      .select('cnpj_basico, razao_social, porte_empresa, capital_social').in('cnpj_basico', basicos),
  ]);

  const scoreMap = new Map((scores || []).map((s: any) => [s.estabelecimento_id, s]));
  const empMap = new Map((empresas || []).map((e: any) => [e.cnpj_basico, e]));

  let rows: RadarEmpresaRow[] = (estabs as any[]).map(e => {
    const sc = scoreMap.get(e.id);
    const emp = empMap.get(e.cnpj_basico);
    const segKey = sc?.score_explanation?.segmento_key || null;
    return {
      estabelecimento_id: e.id,
      cnpj_completo: e.cnpj_completo,
      razao_social: emp?.razao_social ?? null,
      nome_fantasia: e.nome_fantasia,
      municipio_nome: e.municipio_nome,
      uf: e.uf,
      cnae_principal: e.cnae_principal,
      cnae_principal_desc: e.cnae_principal_desc,
      porte_empresa: emp?.porte_empresa ?? null,
      capital_social: emp?.capital_social ?? null,
      segmento_key: segKey,
      segmento_nome: segKey ? (getSegmento(segKey)?.nome || segKey) : null,
      score_total: sc?.score_total ?? null,
      classificacao: sc?.classificacao ?? null,
      classificacao_label: sc?.classificacao ? CLASSIFICACAO_LABEL[sc.classificacao as Classificacao] : null,
    };
  });

  // Filtros pós-join (segmento/score/classificação/porte vivem em scores/empresa)
  if (f.segmento_key) rows = rows.filter(r => r.segmento_key === f.segmento_key);
  if (f.porte) rows = rows.filter(r => r.porte_empresa === f.porte);
  if (f.classificacao) rows = rows.filter(r => r.classificacao === f.classificacao);
  if (f.score_min != null) rows = rows.filter(r => (r.score_total ?? -1) >= f.score_min!);

  rows.sort((a, b) => (b.score_total ?? -1) - (a.score_total ?? -1));

  return { rows, total: count || 0 };
}

export async function getFichaEmpresa(cnpjCompleto: string) {
  const sb = await requireAdminSupabase();

  const { data: est } = await sb.from('radarempresas_estabelecimentos')
    .select('*').eq('cnpj_completo', cnpjCompleto).maybeSingle();
  if (!est) return { ok: false as const, error: 'Estabelecimento não encontrado' };

  const [{ data: emp }, { data: score }, { data: insight }] = await Promise.all([
    sb.from('radarempresas_empresas').select('*').eq('cnpj_basico', (est as any).cnpj_basico).maybeSingle(),
    sb.from('radarempresas_scores').select('*').eq('estabelecimento_id', (est as any).id).maybeSingle(),
    sb.from('radarempresas_insights').select('*').eq('estabelecimento_id', (est as any).id).maybeSingle(),
  ]);

  const segKey = (score as any)?.score_explanation?.segmento_key || null;

  return {
    ok: true as const,
    estabelecimento: est,
    empresa: emp || null,
    score: score || null,
    insight: insight || null,
    segmento: segKey ? getSegmento(segKey) : null,
  };
}
