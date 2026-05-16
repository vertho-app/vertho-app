'use server';

/**
 * Potencial por Cidade — visão UNIFICADA (uso interno comercial).
 *
 * NÃO funde os 2 motores: faz merge dos agregados-município que cada um
 * já produz, pela chave municipio_ibge. Zero mudança nos engines.
 *
 *  - Empresas: radarempresas_cidades_agg  (snapshot mensal; ibge 6 díg)
 *  - Escolas : diag_mv_mercado_municipio   (MV live; ibge 7 díg)
 *              + calcularMercadoScores (MESMO lib do tool de escolas —
 *              sem drift). Não uso loadMercadoMunicipios porque ela é
 *              limitada a 1000 linhas pelo cap do Supabase.
 *
 * Chave: radarempresas 6 díg (355030), escolas 7 díg (3550308). 7→6 =
 * slice(0,6) (dígito verificador). Ambas as fontes paginadas via
 * .range() (o cap 1000 do Supabase quebrava o merge). Scores LADO A
 * LADO — não há score combinado (unidades/modelos distintos).
 */
import { requireAdminSupabase } from '@/lib/admin-supabase';
import { requireAdminAction } from '@/lib/auth/action-context';
import { calcularMercadoScores } from '@/lib/mercado-potencial/scoring';

export interface PotencialFiltros {
  uf?: string;
  municipioBusca?: string;
  precoProf?: number;       // escolas (passa pro lib de scoring)
  precoGestor?: number;
  // empresas: TAM = head_estimado_b2b × pctEscopo × precoPessoa
  pctEscopo?: number;       // % do quadro em desenvolvimento (default 0.15)
  precoPessoa?: number;     // R$/pessoa/mês (default 300)
}

export interface PotencialCidadeRow {
  municipio_ibge: string;          // 6 díg (chave unificada)
  municipio: string;
  uf: string;
  emp: {
    n_priorizados: number;         // excl. educacao_privada (não dup. escola)
    n_abordar: number;
    n_redes: number;
    score_medio: number | null;
    total_ativos: number;
    tam_empresas: number | null;   // R$/mês estimado (head_b2b×escopo×preço)
    xlsx_path: string | null;
  } | null;
  esc: {
    qt_escolas: number;
    qt_professores: number;
    qt_gestores: number;
    tam_mensal: number;            // mentor_ia + onboarding
    score: number | null;          // score_completo ?? score_base
  } | null;
  tam_total: number | null;        // tam_empresas + tam_escolas (somável)
}

const cap = (s: string) =>
  s.toLowerCase().replace(/(^|\s|-)\p{L}/gu, (m) => m.toUpperCase());

// paginação .range() — contorna o cap de 1000 linhas do Supabase
async function fetchAll(makeQuery: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadPotencialCidades(
  f: PotencialFiltros = {},
): Promise<{ ok: true; rows: PotencialCidadeRow[]; total: number } | { error: string }> {
  await requireAdminAction();
  const sb = await requireAdminSupabase();
  const busca = f.municipioBusca?.trim();
  const pctEscopo = f.pctEscopo ?? 0.15;   // 15% do quadro em desenvolvimento
  const precoPessoa = f.precoPessoa ?? 300; // R$/pessoa/mês

  try {
    // ── Empresas (radarempresas_cidades_agg, ibge 6 díg) — paginado ──────
    const emp = await fetchAll((from, to) => {
      let q = sb.from('radarempresas_cidades_agg')
        .select('municipio_ibge, municipio_nome, uf, total_ativos, n_priorizados, n_priorizados_b2b, head_estimado_b2b, n_abordar, n_redes, score_medio, xlsx_path')
        .order('municipio_ibge', { ascending: true }).range(from, to);
      if (f.uf) q = q.eq('uf', f.uf);
      if (busca) q = q.ilike('municipio_nome', `%${busca}%`);
      return q;
    });
    const empMap = new Map<string, any>();
    for (const r of emp) empMap.set(String(r.municipio_ibge), r);

    // ── Escolas (diag_mv_mercado_municipio, ibge 7 díg) — paginado ───────
    const esc = await fetchAll((from, to) => {
      let q = sb.from('diag_mv_mercado_municipio')
        .select('municipio_ibge, municipio, uf, qt_escolas, qt_professores, qt_docs_0_24, qt_docs_jovens, qt_docs_pos, qt_gestores, inse_medio, pct_inse_oficial')
        .order('municipio_ibge', { ascending: true }).range(from, to);
      if (f.uf) q = q.eq('uf', f.uf);
      if (busca) q = q.ilike('municipio', `%${busca}%`);
      return q;
    });
    const escMap = new Map<string, any>();
    for (const r of esc) {
      const sc = calcularMercadoScores(r, f as any); // MESMO lib do tool
      escMap.set(String(r.municipio_ibge).slice(0, 6), { ...r, ...sc });
    }

    // ── Merge (união das chaves) ──────────────────────────────────────────
    const keys = new Set<string>([...empMap.keys(), ...escMap.keys()]);
    const rows: PotencialCidadeRow[] = [];
    for (const k of keys) {
      const e = empMap.get(k);
      const s = escMap.get(k);
      // empresas exclui educacao_privada (não dup. escola); cai pro total
      // antigo se o pipeline ainda não emitiu *_b2b (graceful).
      const headB2b = e?.head_estimado_b2b != null ? Number(e.head_estimado_b2b) : null;
      const tamEmp = headB2b != null ? Math.round(headB2b * pctEscopo * precoPessoa) : null;
      const tamEsc = s ? Number(s.tam_mensal_mentor_ia || 0) + Number(s.tam_mensal_onboarding || 0) : 0;
      rows.push({
        municipio_ibge: k,
        municipio: s ? cap(String(s.municipio)) : cap(String(e?.municipio_nome || '')),
        uf: e?.uf || s?.uf || '',
        emp: e ? {
          n_priorizados: Number(e.n_priorizados_b2b ?? e.n_priorizados ?? 0),
          n_abordar: Number(e.n_abordar || 0),
          n_redes: Number(e.n_redes || 0),
          score_medio: e.score_medio != null ? Number(e.score_medio) : null,
          total_ativos: Number(e.total_ativos || 0),
          tam_empresas: tamEmp,
          xlsx_path: e.xlsx_path || null,
        } : null,
        esc: s ? {
          qt_escolas: Number(s.qt_escolas || 0),
          qt_professores: Number(s.qt_professores || 0),
          qt_gestores: Number(s.qt_gestores || 0),
          tam_mensal: tamEsc,
          score: s.score_completo ?? s.score_base ?? null,
        } : null,
        tam_total: (tamEmp != null || s)
          ? (tamEmp ?? 0) + tamEsc
          : null,
      });
    }

    rows.sort((a, b) =>
      (b.tam_total ?? -1) - (a.tam_total ?? -1)
      || (b.emp?.n_priorizados ?? -1) - (a.emp?.n_priorizados ?? -1));

    return { ok: true, rows, total: rows.length };
  } catch (e: any) {
    return { error: e.message };
  }
}
