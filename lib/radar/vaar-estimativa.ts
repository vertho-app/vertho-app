import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Estimativa de VAAR pra municípios não-beneficiários.
 *
 * Metodologia: usa a razão entre `complementacao_vaar` e
 * (`complementacao_vaaf` + `complementacao_vaat`) entre municípios
 * beneficiários da MESMA UF como proxy de "VAAR esperado dado o porte
 * de complementação federal já recebida". Mediana é robusta a outliers;
 * P25-P75 fornece intervalo plausível.
 *
 * Limitações:
 * - Pressupõe que o município já recebe VAAF e/ou VAAT (i.e. é elegível
 *   à complementação da União).
 * - Não considera a magnitude da evolução de aprendizagem que o município
 *   teria de demonstrar — apenas estima o valor se ele atendesse aos
 *   critérios e fosse classificado entre os beneficiários.
 * - Anual: deve ser recomputada a cada ano novo de receita prevista.
 */

type Quartis = { p25: number; p50: number; p75: number; n: number };
type CachePayload = {
  ano: number;
  geral: Quartis;
  porUf: Map<string, Quartis>;
  expiraEm: number;
};

let CACHE: CachePayload | null = null;
const TTL_MS = 1000 * 60 * 60 * 12; // 12h

function quartis(arr: number[]): Quartis {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  const at = (q: number) => s[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
  return { p25: at(0.25), p50: at(0.5), p75: at(0.75), n };
}

async function carregarCache(): Promise<CachePayload> {
  if (CACHE && CACHE.expiraEm > Date.now()) return CACHE;
  const sb = createSupabaseAdmin();

  const { data: anoRow } = await sb
    .from('diag_fundeb_vaar')
    .select('ano')
    .order('ano', { ascending: false })
    .limit(1)
    .maybeSingle();
  const ano: number = (anoRow as any)?.ano || new Date().getFullYear();

  // Pega beneficiários do ano
  const { data: benef } = await sb
    .from('diag_fundeb_vaar')
    .select('municipio_ibge, uf')
    .eq('ano', ano)
    .eq('beneficiario', true);

  const ibges = (benef || []).map((b: any) => b.municipio_ibge);
  if (ibges.length === 0) {
    const empty: Quartis = { p25: 0, p50: 0, p75: 0, n: 0 };
    CACHE = { ano, geral: empty, porUf: new Map(), expiraEm: Date.now() + TTL_MS };
    return CACHE;
  }

  // Receita do mesmo ano para esses municípios
  const { data: receitas } = await sb
    .from('diag_fundeb_receita_prevista')
    .select('municipio_ibge, complementacao_vaaf, complementacao_vaat, complementacao_vaar')
    .eq('ano', ano)
    .in('municipio_ibge', ibges);

  const ufByIbge = new Map<string, string>();
  for (const b of (benef as any[]) || []) ufByIbge.set(b.municipio_ibge, b.uf);

  const ratiosGlobal: number[] = [];
  const ratiosByUf = new Map<string, number[]>();
  for (const r of (receitas as any[]) || []) {
    const base = (r.complementacao_vaaf || 0) + (r.complementacao_vaat || 0);
    if (base <= 0 || !r.complementacao_vaar || r.complementacao_vaar <= 0) continue;
    const ratio = r.complementacao_vaar / base;
    ratiosGlobal.push(ratio);
    const uf = ufByIbge.get(r.municipio_ibge);
    if (uf) {
      if (!ratiosByUf.has(uf)) ratiosByUf.set(uf, []);
      ratiosByUf.get(uf)!.push(ratio);
    }
  }

  const geral = quartis(ratiosGlobal);
  const porUf = new Map<string, Quartis>();
  for (const [uf, arr] of ratiosByUf.entries()) {
    if (arr.length >= 5) porUf.set(uf, quartis(arr));
  }

  CACHE = { ano, geral, porUf, expiraEm: Date.now() + TTL_MS };
  return CACHE;
}

export type VaarEstimativa = {
  ano: number;
  estimativaP50: number;
  estimativaP25: number;
  estimativaP75: number;
  baseComplementacao: number;
  metodologiaBase: 'uf' | 'global';
  amostraTamanho: number;
  ufRatio: number;
};

/**
 * Estima quanto o município receberia de VAAR caso se habilitasse e
 * fosse classificado como beneficiário, baseado em municípios beneficiários
 * da mesma UF (ou nacional se UF tem amostra < 5).
 *
 * Retorna null se não há base pra estimar (município não recebe complementação
 * federal VAAF/VAAT, ou não há receita prevista cadastrada).
 */
export async function estimarVaar(args: {
  uf: string;
  complementacaoVaaf: number | null;
  complementacaoVaat: number | null;
}): Promise<VaarEstimativa | null> {
  const base = (args.complementacaoVaaf || 0) + (args.complementacaoVaat || 0);
  if (base <= 0) return null;

  const cache = await carregarCache();
  if (cache.geral.n === 0) return null;

  const ufQuartis = cache.porUf.get(args.uf);
  const usar = ufQuartis || cache.geral;

  return {
    ano: cache.ano,
    estimativaP50: base * usar.p50,
    estimativaP25: base * usar.p25,
    estimativaP75: base * usar.p75,
    baseComplementacao: base,
    metodologiaBase: ufQuartis ? 'uf' : 'global',
    amostraTamanho: usar.n,
    ufRatio: usar.p50,
  };
}

export async function getVaarEstimativaCacheInfo() {
  const c = await carregarCache();
  return {
    ano: c.ano,
    n_geral: c.geral.n,
    p50_geral: c.geral.p50,
    ufs_cobertas: c.porUf.size,
  };
}
