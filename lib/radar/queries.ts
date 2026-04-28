import { createSupabaseAdmin } from '@/lib/supabase';

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

export type MunicipioIdebAggregate = {
  ano: number;
  etapa: '5_EF' | '9_EF' | '3_EM' | string;
  idebAvg: number | null;
  rendimentoAvg: number | null;
  notaSaebAvg: number | null;
  totalEscolas: number;
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
  ideb: IdebSnapshot[];
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

  const [saebRes, censoRes, idebRes, sarespRes, pddeRes] = await Promise.all([
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
    sb.from('diag_ideb_snapshots')
      .select('codigo_inep, municipio_ibge, uf, rede, ano, etapa, ideb, meta, indicador_rendimento, nota_saeb')
      .eq('codigo_inep', codigoInep)
      .in('ano', [2019, 2021, 2023])
      .order('etapa', { ascending: true })
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
    ideb: (idebRes.data || []) as any,
    saresp: (sarespRes.data || []) as any,
    pdde: (pddeRes.data || []) as any,
  };
}

export async function getMunicipio(ibge: string): Promise<{
  ibge: string;
  nome: string;
  uf: string;
  ica: IcaSnapshot[];
  ideb: MunicipioIdebAggregate[];
  totalEscolas: number;
  redes: Record<string, number>;
  fundeb: FundebRepasse[];
  pddeMunicipal: PddeMunicipal[];
  vaar: VaarSnapshot | null;
  receitaPrevista: FundebReceitaPrevista | null;
} | null> {
  const sb = createSupabaseAdmin();
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep, nome, municipio, uf, rede')
    .eq('municipio_ibge', ibge);

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

  if (!escolas || escolas.length === 0) {
    // Pode ainda não ter escolas mas ter ICA/FUNDEB
    const { data: icaOnly } = await sb
      .from('diag_ica_snapshots')
      .select('municipio_ibge, uf, rede, ano, alunos_avaliados, alfabetizados, taxa, total_estado, total_brasil')
      .eq('municipio_ibge', ibge)
      .order('ano', { ascending: false });
    if (!icaOnly?.length && !fundebRes.data?.length) return null;
    return {
      ibge,
      nome: '',
      uf: icaOnly?.[0]?.uf || (fundebRes.data?.[0] as any)?.uf || '',
      ica: (icaOnly || []) as any,
      ideb: [],
      totalEscolas: 0,
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

  const { data: ica } = await sb
    .from('diag_ica_snapshots')
    .select('municipio_ibge, uf, rede, ano, alunos_avaliados, alfabetizados, taxa, total_estado, total_brasil')
    .eq('municipio_ibge', ibge)
    .order('ano', { ascending: false });
  const { data: idebRows } = await sb
    .from('diag_ideb_snapshots')
    .select('ano, etapa, codigo_inep, ideb, indicador_rendimento, nota_saeb')
    .eq('municipio_ibge', ibge)
    .in('ano', [2019, 2021, 2023])
    .order('etapa', { ascending: true })
    .order('ano', { ascending: false });

  return {
    ibge,
    nome: escolas[0].municipio,
    uf: escolas[0].uf,
    ica: (ica || []) as any,
    ideb: aggregateMunicipioIdeb((idebRows || []) as any),
    totalEscolas: escolas.length,
    redes,
    fundeb: (fundebRes.data || []) as any,
    pddeMunicipal: (pddeRes.data || []) as any,
    vaar: (vaarRes.data as any) || null,
    receitaPrevista: (receitaRes.data as any) || null,
  };
}

function aggregateMunicipioIdeb(rows: Array<{
  ano: number;
  etapa: string;
  codigo_inep: string;
  ideb: number | null;
  indicador_rendimento: number | null;
  nota_saeb: number | null;
}>): MunicipioIdebAggregate[] {
  const groups = new Map<string, {
    ano: number;
    etapa: string;
    escolas: Set<string>;
    idebSum: number;
    idebCount: number;
    rendSum: number;
    rendCount: number;
    notaSum: number;
    notaCount: number;
  }>();
  for (const row of rows) {
    const key = `${row.etapa}:${row.ano}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ano: row.ano,
        etapa: row.etapa,
        escolas: new Set<string>(),
        idebSum: 0,
        idebCount: 0,
        rendSum: 0,
        rendCount: 0,
        notaSum: 0,
        notaCount: 0,
      });
    }
    const group = groups.get(key)!;
    if (row.codigo_inep) group.escolas.add(row.codigo_inep);
    if (row.ideb != null) { group.idebSum += Number(row.ideb); group.idebCount++; }
    if (row.indicador_rendimento != null) { group.rendSum += Number(row.indicador_rendimento); group.rendCount++; }
    if (row.nota_saeb != null) { group.notaSum += Number(row.nota_saeb); group.notaCount++; }
  }
  return Array.from(groups.values())
    .map((group) => ({
      ano: group.ano,
      etapa: group.etapa,
      idebAvg: group.idebCount > 0 ? group.idebSum / group.idebCount : null,
      rendimentoAvg: group.rendCount > 0 ? group.rendSum / group.rendCount : null,
      notaSaebAvg: group.notaCount > 0 ? group.notaSum / group.notaCount : null,
      totalEscolas: group.escolas.size,
    }))
    .sort((a, b) => a.etapa.localeCompare(b.etapa) || b.ano - a.ano);
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

  // Microrregiões e redes ainda agregam no Node (volume baixo)
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep, microrregiao, rede')
    .eq('uf', uf);

  if (!escolas || escolas.length === 0) return null;

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
    const { count: snapshots } = await sb
      .from('diag_saeb_snapshots')
      .select('id', { count: 'exact', head: true })
      .in('codigo_inep', escolas.map((e: any) => e.codigo_inep));
    return {
      uf,
      totalEscolas: escolas.length,
      totalMunicipios: ibges.size,
      totalSnapshots: snapshots || 0,
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
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep, municipio, municipio_ibge')
    .eq('uf', uf)
    .not('municipio_ibge', 'is', null);
  if (!escolas?.length) return [];

  const grupos = new Map<string, { nome: string; codigos: string[] }>();
  for (const e of escolas) {
    const ibge = (e as any).municipio_ibge;
    if (!ibge) continue;
    if (!grupos.has(ibge)) grupos.set(ibge, { nome: (e as any).municipio || '', codigos: [] });
    grupos.get(ibge)!.codigos.push((e as any).codigo_inep);
  }

  const ibgesArr = Array.from(grupos.keys());
  const { data: saebData } = await sb
    .from('diag_saeb_snapshots')
    .select('codigo_inep, distribuicao, taxa_participacao, formacao_docente')
    .in('codigo_inep', escolas.map((e: any) => e.codigo_inep));
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
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep, atualizado_em');
  const { data: rows } = await sb
    .from('diag_escolas')
    .select('municipio_ibge, uf, atualizado_em')
    .not('municipio_ibge', 'is', null);
  // Dedup municípios e UFs
  const muniMap = new Map<string, string>();
  const ufMap = new Map<string, string>();
  for (const m of rows || []) {
    const ibge = (m as any).municipio_ibge;
    const uf = (m as any).uf;
    const ts = (m as any).atualizado_em || '';
    if (ibge && (!muniMap.has(ibge) || muniMap.get(ibge)! < ts)) muniMap.set(ibge, ts);
    if (uf && (!ufMap.has(uf) || ufMap.get(uf)! < ts)) ufMap.set(uf, ts);
  }
  return {
    escolas: (escolas || []).map((e: any) => ({ inep: e.codigo_inep, updatedAt: e.atualizado_em })),
    municipios: Array.from(muniMap.entries()).map(([ibge, ts]) => ({ ibge, updatedAt: ts })),
    estados: Array.from(ufMap.entries()).map(([uf, ts]) => ({ uf, updatedAt: ts })),
  };
}
