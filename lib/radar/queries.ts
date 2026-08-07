import { createSupabaseAdmin } from '@/lib/supabase';
import {
  DOCENTES_AGG_COLUNAS,
  DOCENTES_ESCOLA_COLUNAS,
  agregarDocentes,
  consolidarPorRede,
  type CensoDocentes,
  type DocentesAggRow,
  type DocentesAgregado,
} from '@/lib/radar/docentes';
import {
  agregarIdebMunicipio,
  type MunicipioIdebAggregate,
  type MunicipioIdebSourceRow,
} from '@/lib/radar/ideb-municipio';

// Corpo docente: tipos e agregação ficam em `lib/radar/docentes.ts` (puro,
// testável); aqui só as queries. Reexportado para não quebrar quem já importa
// os tipos do Radar por este módulo.
export type { CensoDocentes, DocentesAgregado } from '@/lib/radar/docentes';
export type { MunicipioIdebAggregate } from '@/lib/radar/ideb-municipio';
export { temVinculoDeclarado } from '@/lib/radar/docentes';

const SUPABASE_PAGE_SIZE = 1000;

type SupabaseSelectBuilder = {
  range: (from: number, to: number) => PromiseLike<{ data: any[] | null; error?: { message?: string } | null }>;
};

async function fetchAllRows<T>(buildQuery: () => SupabaseSelectBuilder, pageSize = SUPABASE_PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message || 'Falha ao paginar consulta Supabase');
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function countRows(buildQuery: () => PromiseLike<{ count: number | null; error?: { message?: string } | null }>): Promise<number> {
  const { count, error } = await buildQuery();
  if (error) throw new Error(error.message || 'Falha ao contar registros Supabase');
  return count || 0;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type SaebSnapshot = {
  ano: number;
  etapa: '5_EF' | '9_EF' | '3_EM' | string;
  disciplina: 'LP' | 'MAT' | string;
  distribuicao: Record<string, number>;
  similares?: Record<string, number> | null;
  total_municipio?: Record<string, number> | null;
  total_estado?: Record<string, number> | null;
  total_brasil?: Record<string, number> | null;
  presentes?: number | null;
  matriculados?: number | null;
  taxa_participacao?: number | null;
  formacao_docente?: number | null;
  media_proficiencia?: number | null;
  media_similares?: number | null;
};

export type Escola = {
  codigo_inep: string;
  nome: string;
  rede: string | null;
  municipio: string;
  municipio_ibge: string | null;
  uf: string;
  microrregiao: string | null;
  zona: string | null;
  inse_grupo: number | null;
  etapas: string[];
  ano_referencia: number | null;
};

export type CensoInfra = {
  codigo_inep: string;
  ano: number;
  matriculas: number | null;   // QT_MAT_BAS — total de alunos na educação básica
  zona_localizacao: string | null;
  latitude: number | null;
  longitude: number | null;
  endereco: string | null;
  bairro: string | null;
  indicadores: Record<string, number>;
  quantidades: Record<string, number>;
  score_basica: number | null;
  score_pedagogica: number | null;
  score_acessibilidade: number | null;
  score_conectividade: number | null;
};

export type IdebSnapshot = {
  codigo_inep: string;
  municipio_ibge: string | null;
  uf: string | null;
  rede: string | null;
  ano: number;
  etapa: '5_EF' | '9_EF' | '3_EM' | string;
  ideb: number | null;
  meta: number | null;
  indicador_rendimento: number | null;
  nota_saeb: number | null;
};

export type EnemEscolaSnapshot = {
  codigo_inep: string;
  ano: number;
  municipio_ibge: string | null;
  municipio: string | null;
  uf: string | null;
  dependencia_adm_code: number | null;
  dependencia_adm: string | null;
  localizacao_code: number | null;
  localizacao: string | null;
  situacao_funcionamento_code: number | null;
  participantes_total: number;
  participantes_com_objetiva: number;
  participantes_com_redacao: number;
  participantes_com_media_geral: number;
  media_cn: number | null;
  media_ch: number | null;
  media_lc: number | null;
  media_mt: number | null;
  media_redacao: number | null;
  media_objetiva: number | null;
  media_geral: number | null;
  presenca_dist: Record<string, Record<string, number>>;
  status_redacao_dist: Record<string, number>;
};

export function isEnemComparable(row: Pick<EnemEscolaSnapshot, 'participantes_total'>): boolean {
  return Number(row.participantes_total || 0) >= 10;
}

export function filterComparableEnem<T extends Pick<EnemEscolaSnapshot, 'participantes_total'>>(rows: T[]): T[] {
  return rows.filter(isEnemComparable);
}

export type MunicipioEnemAggregate = {
  ano: number;
  totalEscolas: number;
  escolasCom10: number;
  participantesTotal: number;
  participantesTotalCom10: number;
  participantesMediaGeral: number;
  mediaGeralPonderada: number | null;
  mediaObjetivaPonderada: number | null;
  mediaRedacaoPonderada: number | null;
};

export type SarespSnapshot = {
  codigo_inep: string;
  ano: number;
  serie: number;
  disciplina: string;
  proficiencia_media: number | null;
  distribuicao_niveis: Record<string, number>;
  total_alunos: number | null;
};

export type FundebRepasse = {
  municipio_ibge: string;
  uf: string | null;
  ano: number;
  total_repasse_bruto: number | null;
  total_complementacao_uniao: number | null;
  matriculas_consideradas: number | null;
  valor_aluno_ano: number | null;
};

export type PddeRepasse = {
  codigo_inep: string;
  ano: number;
  valor_recebido: number | null;
  saldo_atual: number | null;
  prestacao_contas_status: string | null;
};

export type PddeMunicipal = {
  municipio_ibge: string;
  ano: number;
  total_repasse: number | null;
  total_escolas_atendidas: number | null;
};

export type VaarSnapshot = {
  municipio_ibge: string;
  uf: string | null;
  ano: number;
  cond_i: boolean | null;
  cond_ii: boolean | null;
  cond_iii: boolean | null;
  cond_iv: boolean | null;
  cond_v: boolean | null;
  habilitado: boolean | null;
  evoluiu_atendimento: boolean | null;
  evoluiu_aprendizagem: boolean | null;
  beneficiario: boolean | null;
  pendencia: string | null;
};

export type FundebReceitaPrevista = {
  municipio_ibge: string;
  uf: string | null;
  ano: number;
  receita_contribuicao: number | null;
  complementacao_vaaf: number | null;
  complementacao_vaat: number | null;
  complementacao_vaar: number | null;
  complementacao_uniao_total: number | null;
  total_receita_prevista: number | null;
};

export type BenchmarkScope = 'cidade' | 'microrregiao' | 'estado' | 'brasil';

export type BenchmarkRow = {
  scope: BenchmarkScope;
  ica_taxa: number | null;
  ideb_5ef: number | null;
  ideb_9ef: number | null;
  ideb_3em: number | null;
  saeb_5ef_lp: number | null;
  saeb_5ef_mat: number | null;
  saeb_9ef_lp: number | null;
  saeb_9ef_mat: number | null;
  fundeb_aluno: number | null;
  qtd_munis: number;
};

export async function getMunicipioBenchmarks(ibge: string): Promise<BenchmarkRow[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.rpc('diag_municipio_benchmarks', { p_ibge: ibge });
  return (data as BenchmarkRow[]) || [];
}

/**
 * Benchmarks de município comparando APENAS a rede municipal entre cidade,
 * microrregião, UF e Brasil. Útil para o glimpse radarbett, onde a narrativa
 * é dirigida ao gestor municipal e não faz sentido enviesar pela rede privada.
 *
 * Backed by `diag_mv_municipio_metricas_municipal` (migration 083).
 */
export async function getMunicipioBenchmarksMunicipal(ibge: string): Promise<BenchmarkRow[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.rpc('diag_municipio_benchmarks_municipal', { p_ibge: ibge });
  return (data as BenchmarkRow[]) || [];
}

// ── Top benchmarks escalonados (sempre puxar a barra pra cima) ───────────────

export type TopBenchScope = {
  valor: number | null;
  municipio_ibge: string | null;
  municipio_nome: string | null;
  total: number; // qtd de munis no escopo
};

export type TopBench = {
  cidade: TopBenchScope; // total = 1
  microrregiao: TopBenchScope; // melhor da microrregião
  estado: TopBenchScope; // melhor da UF
  brasil: TopBenchScope; // melhor do Brasil
};

export type TopBenchmarksMunicipal = {
  uf: string;
  microrregiao: string | null;
  ica: TopBench | null;
  ideb_5ef: TopBench | null;
  ideb_9ef: TopBench | null;
  ideb_3em: TopBench | null;
  enem: TopBench | null;
};

/**
 * Busca, para cada indicador, o melhor município por escopo (microrregião, UF,
 * Brasil) considerando APENAS redes municipais. Permite "puxar a barra pra
 * cima" — quando a cidade está bem vs vizinhos, mostra o gap até o melhor da
 * UF; quando está acima da UF, mostra gap até o melhor do Brasil.
 *
 * Backed by `diag_mv_municipio_metricas_municipal` (mig 083).
 */
export async function getTopBenchmarksMunicipal(ibge: string): Promise<TopBenchmarksMunicipal | null> {
  const sb = createSupabaseAdmin();
  const alvoRes = await sb
    .from('diag_mv_municipio_metricas_municipal')
    .select('*')
    .eq('municipio_ibge', ibge)
    .maybeSingle();
  if (!alvoRes.data) return null;
  const alvo = alvoRes.data as any;
  const { uf, microrregiao } = alvo;

  // Para um indicador, busca top 1 da microrregião, UF e Brasil + total escolas no escopo
  async function topPara(coluna: string): Promise<TopBench | null> {
    const valorCidade = alvo[coluna] != null ? Number(alvo[coluna]) : null;
    const [microR, ufR, brR] = await Promise.all([
      microrregiao
        ? sb.from('diag_mv_municipio_metricas_municipal')
            .select(`municipio_ibge, ${coluna}`)
            .eq('uf', uf)
            .eq('microrregiao', microrregiao)
            .not(coluna, 'is', null)
            .order(coluna, { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null } as any),
      sb.from('diag_mv_municipio_metricas_municipal')
        .select(`municipio_ibge, ${coluna}`)
        .eq('uf', uf)
        .not(coluna, 'is', null)
        .order(coluna, { ascending: false })
        .limit(1)
        .maybeSingle(),
      sb.from('diag_mv_municipio_metricas_municipal')
        .select(`municipio_ibge, ${coluna}`)
        .not(coluna, 'is', null)
        .order(coluna, { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    // Pega contagem de munis em cada escopo (com valor não-nulo)
    const [microCount, ufCount, brCount] = await Promise.all([
      microrregiao
        ? sb.from('diag_mv_municipio_metricas_municipal')
            .select('municipio_ibge', { count: 'exact', head: true })
            .eq('uf', uf)
            .eq('microrregiao', microrregiao)
            .not(coluna, 'is', null)
        : Promise.resolve({ count: 0 } as any),
      sb.from('diag_mv_municipio_metricas_municipal')
        .select('municipio_ibge', { count: 'exact', head: true })
        .eq('uf', uf)
        .not(coluna, 'is', null),
      sb.from('diag_mv_municipio_metricas_municipal')
        .select('municipio_ibge', { count: 'exact', head: true })
        .not(coluna, 'is', null),
    ]);

    // Resolve nomes dos municípios top
    const ibgesTop = [
      (microR as any)?.data?.municipio_ibge,
      (ufR as any)?.data?.municipio_ibge,
      (brR as any)?.data?.municipio_ibge,
    ].filter(Boolean) as string[];
    const nomes: Record<string, string> = {};
    if (ibgesTop.length) {
      const { data: escs } = await sb
        .from('diag_escolas')
        .select('municipio_ibge, municipio')
        .in('municipio_ibge', ibgesTop)
        .limit(50);
      for (const e of (escs || []) as any[]) {
        if (!nomes[e.municipio_ibge]) nomes[e.municipio_ibge] = e.municipio;
      }
    }

    return {
      cidade: { valor: valorCidade, municipio_ibge: ibge, municipio_nome: null, total: 1 },
      microrregiao: {
        valor: (microR as any)?.data?.[coluna] != null ? Number((microR as any).data[coluna]) : null,
        municipio_ibge: (microR as any)?.data?.municipio_ibge || null,
        municipio_nome: (microR as any)?.data?.municipio_ibge ? nomes[(microR as any).data.municipio_ibge] || null : null,
        total: (microCount as any)?.count || 0,
      },
      estado: {
        valor: (ufR as any)?.data?.[coluna] != null ? Number((ufR as any).data[coluna]) : null,
        municipio_ibge: (ufR as any)?.data?.municipio_ibge || null,
        municipio_nome: (ufR as any)?.data?.municipio_ibge ? nomes[(ufR as any).data.municipio_ibge] || null : null,
        total: (ufCount as any)?.count || 0,
      },
      brasil: {
        valor: (brR as any)?.data?.[coluna] != null ? Number((brR as any).data[coluna]) : null,
        municipio_ibge: (brR as any)?.data?.municipio_ibge || null,
        municipio_nome: (brR as any)?.data?.municipio_ibge ? nomes[(brR as any).data.municipio_ibge] || null : null,
        total: (brCount as any)?.count || 0,
      },
    };
  }

  // Roda em paralelo para todos os indicadores principais
  const [icaT, ideb5T, ideb9T, ideb3T, enemT] = await Promise.all([
    topPara('ica_taxa'),
    topPara('ideb_5ef'),
    topPara('ideb_9ef'),
    topPara('ideb_3em'),
    topPara('enem_media_geral'),
  ]);

  return {
    uf,
    microrregiao,
    ica: icaT,
    ideb_5ef: ideb5T,
    ideb_9ef: ideb9T,
    ideb_3em: ideb3T,
    enem: enemT,
  };
}

/**
 * Helper: dado um TopBench, escolhe o **próximo benchmark "que puxa a barra
 * pra cima"** considerando o valor da cidade. Se cidade está bem vs micro,
 * sobe para UF; se está bem vs UF, sobe para Brasil. Sempre devolve um
 * benchmark com valor estritamente maior que o da cidade — ou null se a
 * cidade já é a melhor de tudo.
 */
export type ProximoBenchmark = {
  scope: 'microrregiao' | 'estado' | 'brasil';
  valor: number;
  municipio_nome: string | null;
  total: number;
  delta: number; // distância da cidade até esse benchmark (positivo = a cidade tem que subir)
  cidade: number;
};

export function escolherProximoBenchmark(t: TopBench | null): ProximoBenchmark | null {
  if (!t || t.cidade.valor == null) return null;
  const v = t.cidade.valor;
  const candidatos: Array<{ scope: 'microrregiao' | 'estado' | 'brasil'; bench: TopBenchScope }> = [
    { scope: 'microrregiao', bench: t.microrregiao },
    { scope: 'estado', bench: t.estado },
    { scope: 'brasil', bench: t.brasil },
  ];
  // Procura o primeiro benchmark cujo valor é estritamente maior que a cidade
  for (const { scope, bench } of candidatos) {
    if (bench.valor != null && bench.valor > v + 0.05) {
      return {
        scope,
        valor: bench.valor,
        municipio_nome: bench.municipio_nome,
        total: bench.total,
        delta: bench.valor - v,
        cidade: v,
      };
    }
  }
  return null;
}

export type DispersaoEscolasMunicipal = {
  etapa: string;
  ano: number;
  totalEscolas: number;
  media: number;
  mediana: number;
  min: number;
  max: number;
  desvio: number;
  // Distribuição: cada escola um ponto (codigo_inep + ideb)
  pontos: { inep: string; nome: string; valor: number }[];
};

export function calcularDispersaoMunicipalFromRows(
  escolas: Array<{ codigo_inep: string; nome: string }>,
  rows: Array<{ codigo_inep: string; ano: number; etapa: string; ideb: number | null }>,
): DispersaoEscolasMunicipal | null {
  const escolasMap = new Map<string, string>();
  for (const e of escolas) escolasMap.set(e.codigo_inep, e.nome);
  if (!escolasMap.size) return null;

  const rowsComIdeb = rows.filter((r) => r.ideb != null && escolasMap.has(r.codigo_inep));
  if (!rowsComIdeb.length) return null;

  const anoMax = Math.max(...rowsComIdeb.map((r) => r.ano));
  const recentes = rowsComIdeb.filter((r) => r.ano === anoMax);
  const counts: Record<string, number> = {};
  for (const r of recentes) counts[r.etapa] = (counts[r.etapa] || 0) + 1;
  const etapa = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!etapa) return null;

  const filtrados = recentes.filter((r) => r.etapa === etapa).map((r) => ({
    inep: r.codigo_inep,
    nome: escolasMap.get(r.codigo_inep) || '',
    valor: Number(r.ideb),
  }));
  if (filtrados.length < 3) return null;

  const valores = filtrados.map((p) => p.valor).sort((a, b) => a - b);
  const min = valores[0];
  const max = valores[valores.length - 1];
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const mediana = valores.length % 2
    ? valores[(valores.length - 1) / 2]
    : (valores[valores.length / 2 - 1] + valores[valores.length / 2]) / 2;
  const desvio = Math.sqrt(valores.reduce((s, v) => s + (v - media) ** 2, 0) / valores.length);

  return {
    etapa,
    ano: anoMax,
    totalEscolas: filtrados.length,
    media,
    mediana,
    min,
    max,
    desvio,
    pontos: filtrados.sort((a, b) => a.valor - b.valor),
  };
}

/**
 * Calcula a dispersão de Ideb entre as escolas da rede MUNICIPAL de um
 * município. Usa a etapa com mais escolas (geralmente 9_EF). Retorna
 * estatísticas (min, max, mediana, média, desvio) + lista de pontos.
 */
export async function getDispersaoMunicipal(ibge: string): Promise<DispersaoEscolasMunicipal | null> {
  const sb = createSupabaseAdmin();

  const escolasRes = await sb
    .from('diag_escolas')
    .select('codigo_inep, nome')
    .eq('municipio_ibge', ibge)
    .eq('rede', 'MUNICIPAL');
  const escolasMap = new Map<string, string>();
  for (const e of (escolasRes.data || []) as any[]) escolasMap.set(e.codigo_inep, e.nome);
  if (!escolasMap.size) return null;

  const ineps = Array.from(escolasMap.keys());

  // Pega último ano disponível e a etapa com maior contagem
  const idebRes = await sb
    .from('diag_ideb_snapshots')
    .select('codigo_inep, ano, etapa, ideb')
    .in('codigo_inep', ineps)
    .not('ideb', 'is', null);
  const rows = (idebRes.data || []) as { codigo_inep: string; ano: number; etapa: string; ideb: number }[];
  return calcularDispersaoMunicipalFromRows((escolasRes.data || []) as any, rows);
}

export type EscolaBenchmarkScope = 'escola' | 'microrregiao' | 'estado';

export type EscolaBenchmarkRow = {
  scope: EscolaBenchmarkScope;
  ideb_5ef: number | null;
  ideb_9ef: number | null;
  ideb_3em: number | null;
  saeb_5ef_lp: number | null;
  saeb_5ef_mat: number | null;
  saeb_9ef_lp: number | null;
  saeb_9ef_mat: number | null;
  saeb_3em_lp: number | null;
  saeb_3em_mat: number | null;
  qtd_escolas: number;
  inse_grupo: number | null;
};

export async function getEscolaBenchmarks(codigoInep: string): Promise<EscolaBenchmarkRow[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.rpc('diag_escola_benchmarks', { p_inep: codigoInep });
  return (data as EscolaBenchmarkRow[]) || [];
}

export type Quadrante =
  | 'q1_bem_servida_aprende'
  | 'q2_estrutura_resultado_baixo'
  | 'q3_faz_mais_com_menos'
  | 'q4_dupla_vulnerabilidade'
  | 'sem_dados';

export type EscolaInfraSaeb = {
  codigo_inep: string;
  score_basica: number | null;
  score_pedagogica: number | null;
  score_acessibilidade: number | null;
  score_conectividade: number | null;
  score_geral: number | null;
  pct_n0_avg_simples: number | null;
  n0_diff_mediana: number | null;
  n0_ratio_mediana: number | null;
  saeb_ano: number | null;
  quadrante: Quadrante;
};

export type EscolaN0Row = {
  codigo_inep: string;
  etapa: string;
  disciplina: string;
  ano: number;
  pct_n0_escola: number;
  pct_n0_mediana_brasil: number;
  diff_mediana: number;
};

export type ParCidade = {
  codigo_inep: string;
  nome: string;
  rede: string | null;
  is_target: boolean;
  saeb_lp: number | null;
  saeb_mat: number | null;
  saeb_geral: number | null;
  ideb_principal: number | null;
  rank_geral: number;
  total_pares: number;
};

export async function getParesCidade(codigoInep: string, limit = 10): Promise<ParCidade[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.rpc('diag_escola_pares_cidade', { p_inep: codigoInep, p_limit: limit });
  return (data as ParCidade[]) || [];
}

export type MunicipioVariabilidade = {
  qtd_escolas: number;
  saeb_lp_avg: number | null;
  saeb_lp_stddev: number | null;
  saeb_lp_min: number | null;
  saeb_lp_max: number | null;
  saeb_mat_avg: number | null;
  saeb_mat_stddev: number | null;
  saeb_mat_min: number | null;
  saeb_mat_max: number | null;
  ideb_avg: number | null;
  ideb_stddev: number | null;
  etapa: '5_EF' | '9_EF' | '3_EM';
};

export type RedeStats = {
  qtd_escolas: number;
  saeb_lp_avg: number | null;
  saeb_lp_stddev: number | null;
  saeb_lp_min: number | null;
  saeb_lp_max: number | null;
  saeb_lp_p25: number | null;
  saeb_lp_p75: number | null;
  saeb_mat_avg: number | null;
  saeb_mat_stddev: number | null;
  saeb_mat_min: number | null;
  saeb_mat_max: number | null;
  saeb_mat_p25: number | null;
  saeb_mat_p75: number | null;
  ideb_avg: number | null;
  ideb_stddev: number | null;
  ideb_min: number | null;
  ideb_max: number | null;
  etapa: '5_EF' | '9_EF' | '3_EM';
};

export type RedeEscolaRanking = {
  codigo_inep: string;
  nome: string;
  rede: string | null;
  inse_grupo: number | null;
  saeb_geral: number | null;
  saeb_lp: number | null;
  saeb_mat: number | null;
  ideb: number | null;
  rank_total: number;
  qtd_total: number;
  posicao: 'top' | 'bottom';
};

export type RedePorInse = {
  inse_grupo: number;
  qtd_escolas: number;
  saeb_lp_avg: number | null;
  saeb_mat_avg: number | null;
  ideb_avg: number | null;
};

export async function getRedeStats(ibge: string): Promise<RedeStats | null> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.rpc('diag_rede_stats', { p_ibge: ibge });
  return Array.isArray(data) && data.length ? (data[0] as RedeStats) : null;
}

export async function getRedeRanking(ibge: string, limit = 5): Promise<RedeEscolaRanking[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.rpc('diag_rede_ranking', { p_ibge: ibge, p_limit: limit });
  return (data as RedeEscolaRanking[]) || [];
}

export async function getRedePorInse(ibge: string): Promise<RedePorInse[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb.rpc('diag_rede_por_inse', { p_ibge: ibge });
  return (data as RedePorInse[]) || [];
}

export type MunicipioCompacto = {
  ibge: string;
  nome: string;
  uf: string;
  totalEscolas: number;
  icaTaxa: number | null;
  icaAno: number | null;
  ideb_5ef: number | null;
  ideb_9ef: number | null;
  ideb_3em: number | null;
  saeb_5ef_lp: number | null;
  saeb_5ef_mat: number | null;
  saeb_9ef_lp: number | null;
  saeb_9ef_mat: number | null;
  fundeb_aluno: number | null;
  fundeb_ano: number | null;
  vaar_beneficiario: boolean | null;
  vaar_recebimento: number | null;
  vaar_ano: number | null;
};

export async function getMunicipiosCompactos(ibges: string[]): Promise<MunicipioCompacto[]> {
  if (!ibges.length) return [];
  const sb = createSupabaseAdmin();

  const [metRes, vaarRes, receitaRes, ...countResults] = await Promise.all([
    sb.from('diag_mv_municipio_metricas').select('*').in('municipio_ibge', ibges),
    sb.from('diag_fundeb_vaar').select('municipio_ibge, ano, beneficiario').in('municipio_ibge', ibges),
    sb.from('diag_fundeb_receita_prevista').select('municipio_ibge, ano, complementacao_vaar').in('municipio_ibge', ibges),
    // Para cada município, busca 1 row (nome/uf) + count exato em paralelo
    ...ibges.map(async (ibge) => {
      const [nomeRes, totalRes] = await Promise.all([
        sb.from('diag_escolas').select('municipio, uf').eq('municipio_ibge', ibge).limit(1).maybeSingle(),
        sb.from('diag_escolas').select('*', { count: 'exact', head: true }).eq('municipio_ibge', ibge),
      ]);
      return {
        ibge,
        nome: (nomeRes.data as any)?.municipio || ibge,
        uf: (nomeRes.data as any)?.uf || '',
        total: totalRes.count || 0,
      };
    }),
  ]);

  const metMap = new Map<string, any>();
  for (const m of (metRes.data || [])) metMap.set(m.municipio_ibge, m);

  const counts = new Map<string, { nome: string; uf: string; total: number }>();
  for (const c of countResults as Array<{ ibge: string; nome: string; uf: string; total: number }>) {
    counts.set(c.ibge, { nome: c.nome, uf: c.uf, total: c.total });
  }

  const vaarMap = new Map<string, { ano: number; beneficiario: boolean | null }>();
  for (const v of (vaarRes.data || []) as any[]) {
    const ex = vaarMap.get(v.municipio_ibge);
    if (!ex || (v.ano > ex.ano)) vaarMap.set(v.municipio_ibge, v);
  }

  const receitaMap = new Map<string, { ano: number; vaar: number | null }>();
  for (const r of (receitaRes.data || []) as any[]) {
    const ex = receitaMap.get(r.municipio_ibge);
    const cur = { ano: r.ano, vaar: r.complementacao_vaar };
    if (!ex || (r.ano > ex.ano)) receitaMap.set(r.municipio_ibge, cur);
  }

  return ibges.map((ibge) => {
    const met = metMap.get(ibge) || {};
    const c = counts.get(ibge);
    const vaar = vaarMap.get(ibge);
    const rec = receitaMap.get(ibge);
    return {
      ibge,
      nome: c?.nome || ibge,
      uf: c?.uf || '',
      totalEscolas: c?.total || 0,
      icaTaxa: met.ica_taxa ?? null,
      icaAno: met.ica_ano ?? null,
      ideb_5ef: met.ideb_5ef ?? null,
      ideb_9ef: met.ideb_9ef ?? null,
      ideb_3em: met.ideb_3em ?? null,
      saeb_5ef_lp: met.saeb_5ef_lp ?? null,
      saeb_5ef_mat: met.saeb_5ef_mat ?? null,
      saeb_9ef_lp: met.saeb_9ef_lp ?? null,
      saeb_9ef_mat: met.saeb_9ef_mat ?? null,
      fundeb_aluno: met.fundeb_aluno ?? null,
      fundeb_ano: met.fundeb_ano ?? null,
      vaar_beneficiario: vaar?.beneficiario ?? null,
      vaar_recebimento: rec?.vaar ?? null,
      vaar_ano: rec?.ano ?? vaar?.ano ?? null,
    };
  });
}

export async function getMunicipioVariabilidade(ibge: string): Promise<MunicipioVariabilidade | null> {
  const sb = createSupabaseAdmin();
  // Tenta 9_EF primeiro (mais escolas em rede municipal típica), cai pra 5_EF
  for (const etapa of ['5_EF', '9_EF', '3_EM'] as const) {
    const { data: stats } = await sb.rpc('diag_municipio_stats_etapa', {
      p_ibge: ibge,
      p_etapa: etapa,
    });
    if (stats && Array.isArray(stats) && stats.length > 0 && stats[0].qtd_escolas >= 5) {
      return { ...stats[0], etapa } as MunicipioVariabilidade;
    }
  }
  return null;
}

export async function getIcaMunicipioRecente(ibge: string): Promise<IcaSnapshot | null> {
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('diag_ica_snapshots')
    .select('*')
    .eq('municipio_ibge', ibge)
    .gt('taxa', 0)
    .order('ano', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as IcaSnapshot) || null;
}

export async function getEscolaInfraSaeb(codigoInep: string): Promise<{
  resumo: EscolaInfraSaeb | null;
  breakdown: EscolaN0Row[];
}> {
  const sb = createSupabaseAdmin();
  const [resumoRes, breakdownRes] = await Promise.all([
    sb.from('diag_mv_escola_infra_saeb').select('*').eq('codigo_inep', codigoInep).maybeSingle(),
    sb.from('diag_view_escola_n0_breakdown')
      .select('*')
      .eq('codigo_inep', codigoInep)
      .order('etapa', { ascending: true })
      .order('disciplina', { ascending: true })
      .order('ano', { ascending: false }),
  ]);
  // Para o breakdown, fica só o ano mais recente por (etapa, disc)
  const seen = new Set<string>();
  const breakdown: EscolaN0Row[] = [];
  for (const row of (breakdownRes.data || []) as EscolaN0Row[]) {
    const key = `${row.etapa}/${row.disciplina}`;
    if (seen.has(key)) continue;
    seen.add(key);
    breakdown.push(row);
  }
  return {
    resumo: (resumoRes.data as EscolaInfraSaeb) || null,
    breakdown,
  };
}

export type IcaSnapshot = {
  municipio_ibge: string;
  uf: string;
  rede: 'MUNICIPAL' | 'ESTADUAL' | 'FEDERAL' | 'PRIVADA' | 'TOTAL' | string;
  ano: number;
  alunos_avaliados: number | null;
  alfabetizados: number | null;
  taxa: number | null;
  total_estado: number | null;
  total_brasil: number | null;
};

export async function getEscola(codigoInep: string): Promise<{
  escola: Escola | null;
  saeb: SaebSnapshot[];
  censo: CensoInfra | null;
  docentes: CensoDocentes | null;
  ideb: IdebSnapshot[];
  enem: EnemEscolaSnapshot[];
  saresp: SarespSnapshot[];
  pdde: PddeRepasse[];
} | null> {
  const sb = createSupabaseAdmin();
  const { data: escola } = await sb
    .from('diag_escolas')
    .select('*')
    .eq('codigo_inep', codigoInep)
    .single();
  if (!escola) return null;

  const [saebRes, censoRes, docentesRes, idebRes, enemRes, sarespRes, pddeRes] = await Promise.all([
    sb.from('diag_saeb_snapshots')
      .select('*')
      .eq('codigo_inep', codigoInep)
      .order('ano', { ascending: false })
      .order('etapa', { ascending: true })
      .order('disciplina', { ascending: true }),
    sb.from('diag_censo_infra')
      .select('*')
      .eq('codigo_inep', codigoInep)
      .order('ano', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from('diag_censo_docentes')
      .select(DOCENTES_ESCOLA_COLUNAS)
      .eq('codigo_inep', codigoInep)
      .order('ano', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from('diag_ideb_snapshots')
      .select('codigo_inep, municipio_ibge, uf, rede, ano, etapa, ideb, meta, indicador_rendimento, nota_saeb')
      .eq('codigo_inep', codigoInep)
      .in('ano', [2019, 2021, 2023, 2025])
      .order('etapa', { ascending: true })
      .order('ano', { ascending: false }),
    sb.from('diag_enem_escola_snapshots')
      .select('*')
      .eq('codigo_inep', codigoInep)
      .order('ano', { ascending: false }),
    (escola as any).uf === 'SP'
      ? sb.from('diag_saresp_snapshots')
          .select('*')
          .eq('codigo_inep', codigoInep)
          .order('ano', { ascending: false })
          .order('serie', { ascending: true })
          .order('disciplina', { ascending: true })
      : Promise.resolve({ data: [] } as any),
    sb.from('diag_pdde_repasses')
      .select('*')
      .eq('codigo_inep', codigoInep)
      .order('ano', { ascending: false }),
  ]);

  return {
    escola: escola as any,
    saeb: (saebRes.data || []) as any,
    censo: (censoRes.data as any) || null,
    docentes: (docentesRes.data as any) || null,
    ideb: (idebRes.data || []) as any,
    enem: (enemRes.data || []) as any,
    saresp: (sarespRes.data || []) as any,
    pdde: (pddeRes.data || []) as any,
  };
}

// ── Corpo docente agregado (MV diag_mv_docentes_agg, migration 204) ──────

/**
 * Corpo docente do município. `apenasRedeMunicipal` espelha o recorte que a
 * página já usa para ICA/Ideb/Enem quando o leitor pede só a rede municipal.
 */
export async function getDocentesMunicipio(
  ibge: string,
  opts: { apenasRedeMunicipal?: boolean } = {},
): Promise<DocentesAgregado | null> {
  const sb = createSupabaseAdmin();
  let q = sb
    .from('diag_mv_docentes_agg')
    .select(DOCENTES_AGG_COLUNAS)
    .eq('municipio_ibge', ibge);
  if (opts.apenasRedeMunicipal) q = q.eq('rede', 'MUNICIPAL');
  const { data, error } = await q;
  if (error) return null;
  return agregarDocentes((data || []) as any);
}

/** Corpo docente da UF (soma dos municípios × redes; ~1-2k linhas por UF). */
export async function getDocentesUf(uf: string): Promise<DocentesAgregado | null> {
  const sb = createSupabaseAdmin();
  try {
    const rows = await fetchAllRows<DocentesAggRow>(() => sb
      .from('diag_mv_docentes_agg')
      .select(DOCENTES_AGG_COLUNAS)
      .eq('uf', uf));
    // Uma linha por (município × rede) — consolida por rede para o breakdown.
    return agregarDocentes(consolidarPorRede(rows));
  } catch {
    return null;
  }
}

export async function getMunicipio(
  ibge: string,
  opts: { filtrarRedeMunicipal?: boolean } = {},
): Promise<{
  ibge: string;
  nome: string;
  uf: string;
  ica: IcaSnapshot[];
  ideb: MunicipioIdebAggregate[];
  enem: MunicipioEnemAggregate[];
  totalEscolas: number;
  totalEscolasMunicipais: number;
  redes: Record<string, number>;
  fundeb: FundebRepasse[];
  pddeMunicipal: PddeMunicipal[];
  vaar: VaarSnapshot | null;
  receitaPrevista: FundebReceitaPrevista | null;
} | null> {
  const apenasMunicipal = !!opts.filtrarRedeMunicipal;
  const sb = createSupabaseAdmin();
  const escolas = await fetchAllRows<{
    codigo_inep: string;
    nome: string;
    municipio: string;
    uf: string;
    rede: string | null;
  }>(() => sb
    .from('diag_escolas')
    .select('codigo_inep, nome, municipio, uf, rede')
    .eq('municipio_ibge', ibge));

  // Fontes municipais (FUNDEB, PDDE municipal, VAAR, receita prevista) — em paralelo,
  // independente de ter escola cadastrada (só dependem do IBGE).
  const [fundebRes, pddeRes, vaarRes, receitaRes] = await Promise.all([
    sb.from('diag_fundeb_repasses')
      .select('*').eq('municipio_ibge', ibge).order('ano', { ascending: false }).limit(8),
    sb.from('diag_pdde_municipal')
      .select('*').eq('municipio_ibge', ibge).order('ano', { ascending: false }).limit(8),
    sb.from('diag_fundeb_vaar')
      .select('*').eq('municipio_ibge', ibge).order('ano', { ascending: false }).limit(1).maybeSingle(),
    sb.from('diag_fundeb_receita_prevista')
      .select('*').eq('municipio_ibge', ibge).order('ano', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (!escolas.length) {
    // Pode ainda não ter escolas mas ter ICA/FUNDEB
    const { data: icaOnly } = await sb
      .from('diag_ica_snapshots')
      .select('municipio_ibge, uf, rede, ano, alunos_avaliados, alfabetizados, taxa, total_estado, total_brasil')
      .eq('municipio_ibge', ibge)
      .order('ano', { ascending: false });
    if (!icaOnly?.length && !fundebRes.data?.length) return null;
    const icaFiltered = apenasMunicipal
      ? (icaOnly || []).filter((r: any) => (r.rede || '').toUpperCase() === 'MUNICIPAL')
      : (icaOnly || []);
    return {
      ibge,
      nome: '',
      uf: icaOnly?.[0]?.uf || (fundebRes.data?.[0] as any)?.uf || '',
      ica: icaFiltered as any,
      ideb: [],
      enem: [],
      totalEscolas: 0,
      totalEscolasMunicipais: 0,
      redes: {},
      fundeb: (fundebRes.data || []) as any,
      pddeMunicipal: (pddeRes.data || []) as any,
      vaar: (vaarRes.data as any) || null,
      receitaPrevista: (receitaRes.data as any) || null,
    };
  }

  const redes: Record<string, number> = {};
  for (const e of escolas) {
    const r = (e.rede || 'OUTRA').toString();
    redes[r] = (redes[r] || 0) + 1;
  }
  // INEPs da rede municipal (usado quando filtrarRedeMunicipal=true)
  const inepsMunicipais = new Set(escolas.filter((e) => (e.rede || '').toUpperCase() === 'MUNICIPAL').map((e) => e.codigo_inep));

  let icaQ = sb
    .from('diag_ica_snapshots')
    .select('municipio_ibge, uf, rede, ano, alunos_avaliados, alfabetizados, taxa, total_estado, total_brasil')
    .eq('municipio_ibge', ibge)
    .order('ano', { ascending: false });
  if (apenasMunicipal) icaQ = icaQ.eq('rede', 'MUNICIPAL');
  const { data: ica } = await icaQ;

  const redeIdebOficial = apenasMunicipal ? 'MUNICIPAL' : 'PUBLICA';
  const [idebEscolasAll, idebOficialRes] = await Promise.all([
    fetchAllRows<MunicipioIdebSourceRow>(() => sb
      .from('diag_ideb_snapshots')
      .select('ano, etapa, codigo_inep, ideb, indicador_rendimento, nota_saeb')
      .eq('municipio_ibge', ibge)
      .eq('escopo', 'escola')
      .in('ano', [2019, 2021, 2023, 2025])
      .order('etapa', { ascending: true })
      .order('ano', { ascending: false })),
    sb.from('diag_ideb_snapshots')
      .select('ano, etapa, codigo_inep, ideb, indicador_rendimento, nota_saeb')
      .eq('municipio_ibge', ibge)
      .eq('escopo', 'municipio')
      .eq('rede', redeIdebOficial)
      .in('ano', [2019, 2021, 2023, 2025])
      .order('etapa', { ascending: true })
      .order('ano', { ascending: false }),
  ]);
  const idebEscolas = apenasMunicipal
    ? idebEscolasAll.filter((row) => inepsMunicipais.has(row.codigo_inep || ''))
    : idebEscolasAll;
  const idebOficial = (idebOficialRes.data || []) as MunicipioIdebSourceRow[];

  let enemQ = sb
    .from('diag_enem_escola_snapshots')
    .select('ano, codigo_inep, participantes_total, participantes_com_objetiva, participantes_com_redacao, participantes_com_media_geral, media_objetiva, media_redacao, media_geral, dependencia_adm')
    .eq('municipio_ibge', ibge)
    .order('ano', { ascending: false });
  if (apenasMunicipal) enemQ = enemQ.eq('dependencia_adm', 'MUNICIPAL');
  const { data: enemRows } = await enemQ;

  return {
    ibge,
    nome: escolas[0].municipio,
    uf: escolas[0].uf,
    ica: (ica || []) as any,
    ideb: agregarIdebMunicipio(idebEscolas, idebOficial),
    enem: aggregateMunicipioEnem((enemRows || []) as any),
    totalEscolas: escolas.length,
    totalEscolasMunicipais: inepsMunicipais.size,
    redes,
    fundeb: (fundebRes.data || []) as any,
    pddeMunicipal: (pddeRes.data || []) as any,
    vaar: (vaarRes.data as any) || null,
    receitaPrevista: (receitaRes.data as any) || null,
  };
}

function aggregateMunicipioEnem(rows: Array<{
  ano: number;
  codigo_inep: string;
  participantes_total: number;
  participantes_com_objetiva: number;
  participantes_com_redacao: number;
  participantes_com_media_geral: number;
  media_objetiva: number | null;
  media_redacao: number | null;
  media_geral: number | null;
}>): MunicipioEnemAggregate[] {
  const groups = new Map<number, {
    escolas: Set<string>;
    escolasCom10: number;
    participantesTotal: number;
    participantesTotalCom10: number;
    participantesMediaGeral: number;
    objWeightedSum: number;
    objWeight: number;
    redWeightedSum: number;
    redWeight: number;
    geralWeightedSum: number;
    geralWeight: number;
  }>();

  for (const row of rows) {
    if (!groups.has(row.ano)) {
      groups.set(row.ano, {
        escolas: new Set<string>(),
        escolasCom10: 0,
        participantesTotal: 0,
        participantesTotalCom10: 0,
        participantesMediaGeral: 0,
        objWeightedSum: 0,
        objWeight: 0,
        redWeightedSum: 0,
        redWeight: 0,
        geralWeightedSum: 0,
        geralWeight: 0,
      });
    }
    const group = groups.get(row.ano)!;
    const elegivel = (row.participantes_total || 0) >= 10;
    if (row.codigo_inep) group.escolas.add(row.codigo_inep);
    if (elegivel) group.escolasCom10 += 1;
    group.participantesTotal += Number(row.participantes_total || 0);
    if (elegivel) {
      group.participantesTotalCom10 += Number(row.participantes_total || 0);
      group.participantesMediaGeral += Number(row.participantes_com_media_geral || 0);
    }

    if (elegivel && row.media_objetiva != null && (row.participantes_com_objetiva || 0) > 0) {
      group.objWeightedSum += Number(row.media_objetiva) * Number(row.participantes_com_objetiva);
      group.objWeight += Number(row.participantes_com_objetiva);
    }
    if (elegivel && row.media_redacao != null && (row.participantes_com_redacao || 0) > 0) {
      group.redWeightedSum += Number(row.media_redacao) * Number(row.participantes_com_redacao);
      group.redWeight += Number(row.participantes_com_redacao);
    }
    if (elegivel && row.media_geral != null && (row.participantes_com_media_geral || 0) > 0) {
      group.geralWeightedSum += Number(row.media_geral) * Number(row.participantes_com_media_geral);
      group.geralWeight += Number(row.participantes_com_media_geral);
    }
  }

  return Array.from(groups.entries())
    .map(([ano, group]) => ({
      ano,
      totalEscolas: group.escolas.size,
      escolasCom10: group.escolasCom10,
      participantesTotal: group.participantesTotal,
      participantesTotalCom10: group.participantesTotalCom10,
      participantesMediaGeral: group.participantesMediaGeral,
      mediaGeralPonderada: group.geralWeight > 0 ? group.geralWeightedSum / group.geralWeight : null,
      mediaObjetivaPonderada: group.objWeight > 0 ? group.objWeightedSum / group.objWeight : null,
      mediaRedacaoPonderada: group.redWeight > 0 ? group.redWeightedSum / group.redWeight : null,
    }))
    .sort((a, b) => b.ano - a.ano);
}

export async function getEscolasMunicipio(ibge: string, limit = 200): Promise<Pick<Escola, 'codigo_inep' | 'nome' | 'rede' | 'etapas'>[]> {
  const sb = createSupabaseAdmin();
  const { data } = await sb
    .from('diag_escolas')
    .select('codigo_inep, nome, rede, etapas')
    .eq('municipio_ibge', ibge)
    .order('nome')
    .limit(limit);
  return (data || []) as any;
}

// ── Comparativo lado-a-lado ──────────────────────────────────────────

export type EscolaCompacta = {
  codigo_inep: string;
  nome: string;
  rede: string | null;
  municipio: string;
  uf: string;
  inse_grupo: number | null;
  // Saeb agregado
  saebPctNivel01: number | null;
  saebTaxaPart: number | null;
  saebFormacao: number | null;
  saebAno: number | null;
  // Censo scores
  scoreBasica: number | null;
  scorePedagogica: number | null;
  scoreAcessibilidade: number | null;
  scoreConectividade: number | null;
};

export async function getEscolasCompactas(inepCodes: string[]): Promise<EscolaCompacta[]> {
  if (!inepCodes.length) return [];
  const sb = createSupabaseAdmin();
  const [escolas, saeb, censo] = await Promise.all([
    sb.from('diag_escolas')
      .select('codigo_inep, nome, rede, municipio, uf, inse_grupo')
      .in('codigo_inep', inepCodes),
    sb.from('diag_saeb_snapshots')
      .select('codigo_inep, ano, distribuicao, taxa_participacao, formacao_docente')
      .in('codigo_inep', inepCodes),
    sb.from('diag_censo_infra')
      .select('codigo_inep, score_basica, score_pedagogica, score_acessibilidade, score_conectividade, ano')
      .in('codigo_inep', inepCodes)
      .order('ano', { ascending: false }),
  ]);

  const censoByInep = new Map<string, any>();
  for (const c of censo.data || []) {
    if (!censoByInep.has((c as any).codigo_inep)) censoByInep.set((c as any).codigo_inep, c);
  }

  const saebByInep = new Map<string, any[]>();
  for (const s of saeb.data || []) {
    const inep = (s as any).codigo_inep;
    if (!saebByInep.has(inep)) saebByInep.set(inep, []);
    saebByInep.get(inep)!.push(s);
  }

  return (escolas.data || []).map((e: any) => {
    const snaps = saebByInep.get(e.codigo_inep) || [];
    const anos = snaps.length ? Math.max(...snaps.map((s: any) => s.ano)) : null;
    const recentes = anos ? snaps.filter((s: any) => s.ano === anos) : [];
    let sumPct = 0, cntPct = 0, sumPart = 0, cntPart = 0, sumForm = 0, cntForm = 0;
    for (const s of recentes) {
      const dist = s.distribuicao || {};
      const pct = Number(dist['0'] || 0) + Number(dist['1'] || 0);
      if (Number.isFinite(pct)) { sumPct += pct; cntPct++; }
      if (s.taxa_participacao != null) { sumPart += Number(s.taxa_participacao); cntPart++; }
      if (s.formacao_docente != null) { sumForm += Number(s.formacao_docente); cntForm++; }
    }
    const c = censoByInep.get(e.codigo_inep);
    return {
      codigo_inep: e.codigo_inep,
      nome: e.nome,
      rede: e.rede,
      municipio: e.municipio,
      uf: e.uf,
      inse_grupo: e.inse_grupo,
      saebPctNivel01: cntPct > 0 ? sumPct / cntPct : null,
      saebTaxaPart: cntPart > 0 ? sumPart / cntPart : null,
      saebFormacao: cntForm > 0 ? sumForm / cntForm : null,
      saebAno: anos,
      scoreBasica: c?.score_basica ?? null,
      scorePedagogica: c?.score_pedagogica ?? null,
      scoreAcessibilidade: c?.score_acessibilidade ?? null,
      scoreConectividade: c?.score_conectividade ?? null,
    };
  });
}

// ── Agregações por UF ────────────────────────────────────────────────

export type EstadoStats = {
  uf: string;
  totalEscolas: number;
  totalMunicipios: number;
  totalSnapshots: number;
  microrregioes: { nome: string; total: number }[];
  redes: Record<string, number>;
};

export async function getEstadoStats(uf: string): Promise<EstadoStats | null> {
  const sb = createSupabaseAdmin();

  // Tenta primeiro a MV (rápida). Se vazia ou erro, cai pro fallback agregado em Node.
  const { data: mv } = await sb
    .from('diag_mv_estado_stats')
    .select('total_escolas, total_municipios, total_snapshots')
    .eq('uf', uf)
    .maybeSingle();

  // Microrregiões e redes agregam no Node, mas com paginação explícita
  // para UFs grandes não ficarem limitadas ao default do Supabase.
  const escolas = await fetchAllRows<{
    codigo_inep: string;
    municipio_ibge: string | null;
    microrregiao: string | null;
    rede: string | null;
  }>(() => sb
    .from('diag_escolas')
    .select('codigo_inep, municipio_ibge, microrregiao, rede')
    .eq('uf', uf));

  if (!escolas.length) return null;

  const microMap = new Map<string, number>();
  const redes: Record<string, number> = {};
  for (const e of escolas) {
    if (e.microrregiao) microMap.set(e.microrregiao, (microMap.get(e.microrregiao) || 0) + 1);
    const r = e.rede || 'OUTRA';
    redes[r] = (redes[r] || 0) + 1;
  }
  const microrregioes = Array.from(microMap.entries())
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  // Fallback: se MV não existe ainda (migration 060 não rodada), conta no Node
  if (!mv) {
    const ibges = new Set(escolas.map((e: any) => e.municipio_ibge).filter(Boolean));
    let snapshots = 0;
    for (const lote of chunks(escolas.map((e: any) => e.codigo_inep), 500)) {
      snapshots += await countRows(() => sb
        .from('diag_saeb_snapshots')
        .select('id', { count: 'exact', head: true })
        .in('codigo_inep', lote));
    }
    return {
      uf,
      totalEscolas: escolas.length,
      totalMunicipios: ibges.size,
      totalSnapshots: snapshots,
      microrregioes,
      redes,
    };
  }

  return {
    uf,
    totalEscolas: mv.total_escolas,
    totalMunicipios: mv.total_municipios,
    totalSnapshots: mv.total_snapshots || 0,
    microrregioes,
    redes,
  };
}

export type RankingMunicipio = {
  ibge: string;
  nome: string;
  totalEscolas: number;
  // Saeb agregado
  pctNivel01Avg: number | null;     // média de % nos níveis 0-1 (menor = melhor)
  taxaParticipacaoAvg: number | null;
  formacaoDocenteAvg: number | null;
  // ICA mais recente
  icaTaxa: number | null;
  icaAno: number | null;
};

/**
 * Ranking de municípios da UF por desempenho Saeb agregado.
 * Score primário: média de (% N0 + % N1) nos snapshots do município.
 * Menor = melhor. Inclui ICA municipal mais recente como contexto.
 */
export async function getRankingMunicipiosUf(uf: string): Promise<RankingMunicipio[]> {
  const sb = createSupabaseAdmin();

  // Tenta primeiro a MV (preferencial). Inclui ICA via JOIN.
  const { data: mv, error: mvErr } = await sb
    .from('diag_mv_municipio_saeb_agg')
    .select('municipio_ibge, municipio_nome, total_escolas, pct_n01_avg, taxa_participacao_avg, formacao_docente_avg')
    .eq('uf', uf);

  if (!mvErr && mv && mv.length > 0) {
    const ibges = mv.map((m: any) => m.municipio_ibge);
    const { data: ica } = await sb
      .from('diag_mv_municipio_ica_recent')
      .select('municipio_ibge, ano, taxa')
      .in('municipio_ibge', ibges);
    const icaByIbge = new Map<string, { ano: number; taxa: number | null }>();
    for (const i of ica || []) {
      icaByIbge.set((i as any).municipio_ibge, { ano: (i as any).ano, taxa: (i as any).taxa });
    }
    return mv.map((m: any) => {
      const i = icaByIbge.get(m.municipio_ibge);
      return {
        ibge: m.municipio_ibge,
        nome: m.municipio_nome || '',
        totalEscolas: m.total_escolas || 0,
        pctNivel01Avg: m.pct_n01_avg ?? null,
        taxaParticipacaoAvg: m.taxa_participacao_avg ?? null,
        formacaoDocenteAvg: m.formacao_docente_avg ?? null,
        icaTaxa: i?.taxa ?? null,
        icaAno: i?.ano ?? null,
      };
    });
  }

  // ── Fallback: agrega no Node se MV ainda não foi criada/refrescada ─
  const escolas = await fetchAllRows<{
    codigo_inep: string;
    municipio: string | null;
    municipio_ibge: string | null;
  }>(() => sb
    .from('diag_escolas')
    .select('codigo_inep, municipio, municipio_ibge')
    .eq('uf', uf)
    .not('municipio_ibge', 'is', null));
  if (!escolas.length) return [];

  const grupos = new Map<string, { nome: string; codigos: string[] }>();
  for (const e of escolas) {
    const ibge = (e as any).municipio_ibge;
    if (!ibge) continue;
    if (!grupos.has(ibge)) grupos.set(ibge, { nome: (e as any).municipio || '', codigos: [] });
    grupos.get(ibge)!.codigos.push((e as any).codigo_inep);
  }

  const ibgesArr = Array.from(grupos.keys());
  const saebData: any[] = [];
  for (const lote of chunks(escolas.map((e: any) => e.codigo_inep), 500)) {
    const { data } = await sb
      .from('diag_saeb_snapshots')
      .select('codigo_inep, distribuicao, taxa_participacao, formacao_docente')
      .in('codigo_inep', lote);
    saebData.push(...(data || []));
  }
  const saebByInep = new Map<string, any[]>();
  for (const s of saebData || []) {
    const inep = (s as any).codigo_inep;
    if (!saebByInep.has(inep)) saebByInep.set(inep, []);
    saebByInep.get(inep)!.push(s);
  }
  const { data: icaData } = await sb
    .from('diag_ica_snapshots')
    .select('municipio_ibge, ano, rede, taxa')
    .in('municipio_ibge', ibgesArr)
    .order('ano', { ascending: false });
  const icaByIbge = new Map<string, { ano: number; taxa: number | null }>();
  for (const i of icaData || []) {
    const ibge = (i as any).municipio_ibge;
    if (icaByIbge.has(ibge)) continue;
    if ((i as any).rede === 'MUNICIPAL' || !icaByIbge.has(ibge)) {
      icaByIbge.set(ibge, { ano: (i as any).ano, taxa: (i as any).taxa });
    }
  }

  const out: RankingMunicipio[] = [];
  for (const [ibge, grupo] of grupos.entries()) {
    let sumPct01 = 0, sumPart = 0, sumForm = 0;
    let cntPct = 0, cntPart = 0, cntForm = 0;
    for (const inep of grupo.codigos) {
      const snaps = saebByInep.get(inep) || [];
      for (const s of snaps) {
        const dist = s.distribuicao || {};
        const pct = (Number(dist['0'] || 0) + Number(dist['1'] || 0));
        if (Number.isFinite(pct)) { sumPct01 += pct; cntPct++; }
        if (s.taxa_participacao != null) { sumPart += Number(s.taxa_participacao); cntPart++; }
        if (s.formacao_docente != null) { sumForm += Number(s.formacao_docente); cntForm++; }
      }
    }
    const ica = icaByIbge.get(ibge);
    out.push({
      ibge,
      nome: grupo.nome,
      totalEscolas: grupo.codigos.length,
      pctNivel01Avg: cntPct > 0 ? sumPct01 / cntPct : null,
      taxaParticipacaoAvg: cntPart > 0 ? sumPart / cntPart : null,
      formacaoDocenteAvg: cntForm > 0 ? sumForm / cntForm : null,
      icaTaxa: ica?.taxa || null,
      icaAno: ica?.ano || null,
    });
  }
  return out;
}

export async function listAllScopes(): Promise<{
  escolas: { inep: string; updatedAt: string }[];
  municipios: { ibge: string; updatedAt: string }[];
  estados: { uf: string; updatedAt: string }[];
}> {
  const sb = createSupabaseAdmin();
  const [escolas, scopes] = await Promise.all([
    fetchAllRows<{ codigo_inep: string; atualizado_em: string | null }>(() => sb
      .from('diag_escolas')
      .select('codigo_inep, atualizado_em')
      .order('codigo_inep', { ascending: true })),
    listMunicipiosEstadosSitemap(),
  ]);
  return {
    escolas: escolas.map((e) => ({ inep: e.codigo_inep, updatedAt: e.atualizado_em || '' })),
    municipios: scopes.municipios,
    estados: scopes.estados,
  };
}

export async function countRadarSchools(): Promise<number> {
  const sb = createSupabaseAdmin();
  return countRows(() => sb
    .from('diag_escolas')
    .select('codigo_inep', { count: 'exact', head: true }));
}

export async function listSitemapEscolas(offset: number, limit: number): Promise<{ inep: string; updatedAt: string }[]> {
  const sb = createSupabaseAdmin();
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep, atualizado_em')
    .order('codigo_inep', { ascending: true })
    .range(offset, offset + Math.max(0, limit - 1));
  return (escolas || []).map((e: any) => ({ inep: e.codigo_inep, updatedAt: e.atualizado_em }));
}

export async function listMunicipiosEstadosSitemap(): Promise<{
  municipios: { ibge: string; updatedAt: string }[];
  estados: { uf: string; updatedAt: string }[];
}> {
  const sb = createSupabaseAdmin();
  const rows = await fetchAllRows<{
    municipio_ibge: string | null;
    uf: string | null;
    atualizado_em: string | null;
  }>(() => sb
    .from('diag_escolas')
    .select('municipio_ibge, uf, atualizado_em')
    .not('municipio_ibge', 'is', null));
  // Dedup municípios e UFs
  const muniMap = new Map<string, string>();
  const ufMap = new Map<string, string>();
  for (const m of rows) {
    const ibge = (m as any).municipio_ibge;
    const uf = (m as any).uf;
    const ts = (m as any).atualizado_em || '';
    if (ibge && (!muniMap.has(ibge) || muniMap.get(ibge)! < ts)) muniMap.set(ibge, ts);
    if (uf && (!ufMap.has(uf) || ufMap.get(uf)! < ts)) ufMap.set(uf, ts);
  }
  return {
    municipios: Array.from(muniMap.entries()).map(([ibge, ts]) => ({ ibge, updatedAt: ts })),
    estados: Array.from(ufMap.entries()).map(([uf, ts]) => ({ uf, updatedAt: ts })),
  };
}
