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
} | null> {
  const sb = createSupabaseAdmin();
  const { data: escola } = await sb
    .from('diag_escolas')
    .select('*')
    .eq('codigo_inep', codigoInep)
    .single();
  if (!escola) return null;
  const [saebRes, censoRes] = await Promise.all([
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
  ]);
  return {
    escola: escola as any,
    saeb: (saebRes.data || []) as any,
    censo: (censoRes.data as any) || null,
  };
}

export async function getMunicipio(ibge: string): Promise<{
  ibge: string;
  nome: string;
  uf: string;
  ica: IcaSnapshot[];
  totalEscolas: number;
  redes: Record<string, number>;
} | null> {
  const sb = createSupabaseAdmin();
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep, nome, municipio, uf, rede')
    .eq('municipio_ibge', ibge);

  if (!escolas || escolas.length === 0) {
    // Pode ainda não ter escolas mas ter ICA
    const { data: icaOnly } = await sb
      .from('diag_ica_snapshots')
      .select('municipio_ibge, uf, rede, ano, alunos_avaliados, alfabetizados, taxa, total_estado, total_brasil')
      .eq('municipio_ibge', ibge)
      .order('ano', { ascending: false });
    if (!icaOnly?.length) return null;
    return {
      ibge,
      nome: '',
      uf: icaOnly[0].uf,
      ica: icaOnly as any,
      totalEscolas: 0,
      redes: {},
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

  return {
    ibge,
    nome: escolas[0].municipio,
    uf: escolas[0].uf,
    ica: (ica || []) as any,
    totalEscolas: escolas.length,
    redes,
  };
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

export async function listAllScopes(): Promise<{
  escolas: { inep: string; updatedAt: string }[];
  municipios: { ibge: string; updatedAt: string }[];
}> {
  const sb = createSupabaseAdmin();
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep, atualizado_em');
  const { data: municipios } = await sb
    .from('diag_escolas')
    .select('municipio_ibge, atualizado_em')
    .not('municipio_ibge', 'is', null);
  // Dedup municípios
  const muniMap = new Map<string, string>();
  for (const m of municipios || []) {
    const ibge = (m as any).municipio_ibge;
    if (!ibge) continue;
    const ts = (m as any).atualizado_em || '';
    if (!muniMap.has(ibge) || muniMap.get(ibge)! < ts) muniMap.set(ibge, ts);
  }
  return {
    escolas: (escolas || []).map((e: any) => ({ inep: e.codigo_inep, updatedAt: e.atualizado_em })),
    municipios: Array.from(muniMap.entries()).map(([ibge, ts]) => ({ ibge, updatedAt: ts })),
  };
}
