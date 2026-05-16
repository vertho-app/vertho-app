'use server';

/**
 * Potencial por Cidade — visão UNIFICADA (uso interno comercial).
 *
 * NÃO funde os 2 motores: faz merge dos agregados-município que cada um
 * já produz, pela chave municipio_ibge. Zero mudança nos engines.
 *
 *  - Empresas: radarempresas_cidades_agg  (snapshot mensal; ibge 6 díg)
 *  - Escolas : loadMercadoMunicipios()    (MV live; ibge 7 díg)
 *
 * Chave: radarempresas usa IBGE 6 díg (ex. 355030), escolas 7 díg
 * (3550308). 7→6 = LEFT(...,6) (dígito verificador). Scores ficam
 * LADO A LADO — não há score combinado (unidades/modelos distintos).
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { loadMercadoMunicipios } from '@/app/admin/vertho/mercado-potencial/actions';

export interface PotencialFiltros {
  uf?: string;
  municipioBusca?: string;
  precoProf?: number;
  precoGestor?: number;
}

export interface PotencialCidadeRow {
  municipio_ibge: string;          // 6 díg (chave unificada)
  municipio: string;
  uf: string;
  emp: {
    n_priorizados: number;
    n_abordar: number;
    n_redes: number;
    score_medio: number | null;
    total_ativos: number;
    xlsx_path: string | null;
  } | null;
  esc: {
    qt_escolas: number;
    qt_professores: number;
    qt_gestores: number;
    tam_mensal: number;            // mentor_ia + onboarding
    score: number | null;          // score_completo ?? score_base
  } | null;
}

const cap = (s: string) =>
  s.toLowerCase().replace(/(^|\s|-)\p{L}/gu, (m) => m.toUpperCase());

export async function loadPotencialCidades(
  f: PotencialFiltros = {},
): Promise<{ ok: true; rows: PotencialCidadeRow[]; total: number } | { error: string }> {
  await requireAdminAction();
  const sb = await requireAdminSupabase();

  // ── Empresas (radarempresas_cidades_agg, ibge 6 díg) ───────────────────
  let qe = sb.from('radarempresas_cidades_agg')
    .select('municipio_ibge, municipio_nome, uf, total_ativos, n_priorizados, n_abordar, n_redes, score_medio, xlsx_path')
    .limit(6000);
  if (f.uf) qe = qe.eq('uf', f.uf);
  if (f.municipioBusca?.trim()) qe = qe.ilike('municipio_nome', `%${f.municipioBusca.trim()}%`);
  const { data: emp, error: ee } = await qe;
  if (ee) return { error: `empresas: ${ee.message}` };

  const empMap = new Map<string, any>();
  for (const r of emp || []) empMap.set(String(r.municipio_ibge), r);

  // ── Escolas (reusa loadMercadoMunicipios — scoring consistente) ────────
  const esc = await loadMercadoMunicipios({
    uf: f.uf ? [f.uf] : undefined,
    municipioBusca: f.municipioBusca,
    precoProf: f.precoProf,
    precoGestor: f.precoGestor,
  });
  if ('error' in esc) return { error: `escolas: ${esc.error}` };

  const escMap = new Map<string, any>();
  for (const r of esc.rows as any[]) {
    const k6 = String(r.id).slice(0, 6); // 7→6 díg
    escMap.set(k6, r);
  }

  // ── Merge (união das chaves) ───────────────────────────────────────────
  const keys = new Set<string>([...empMap.keys(), ...escMap.keys()]);
  const rows: PotencialCidadeRow[] = [];
  for (const k of keys) {
    const e = empMap.get(k);
    const s = escMap.get(k);
    rows.push({
      municipio_ibge: k,
      municipio: s ? cap(String(s.nome)) : cap(String(e?.municipio_nome || '')),
      uf: e?.uf || s?.uf || '',
      emp: e ? {
        n_priorizados: Number(e.n_priorizados || 0),
        n_abordar: Number(e.n_abordar || 0),
        n_redes: Number(e.n_redes || 0),
        score_medio: e.score_medio != null ? Number(e.score_medio) : null,
        total_ativos: Number(e.total_ativos || 0),
        xlsx_path: e.xlsx_path || null,
      } : null,
      esc: s ? {
        qt_escolas: Number(s.qt_escolas || 0),
        qt_professores: Number(s.qt_professores || 0),
        qt_gestores: Number(s.qt_gestores || 0),
        tam_mensal: Number(s.tam_mensal_mentor_ia || 0) + Number(s.tam_mensal_onboarding || 0),
        score: s.score_completo ?? s.score_base ?? null,
      } : null,
    });
  }

  // default: maior potencial de empresas primeiro, depois escolas
  rows.sort((a, b) =>
    (b.emp?.n_priorizados ?? -1) - (a.emp?.n_priorizados ?? -1)
    || (b.esc?.score ?? -1) - (a.esc?.score ?? -1));

  return { ok: true, rows, total: rows.length };
}
