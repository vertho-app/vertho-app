import { Suspense } from 'react';
import { CompararClient } from './client';

export const dynamic = 'force-dynamic';

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ escolas?: string; ibges?: string }>;
}) {
  const sp = await searchParams;
  const escolas = (sp.escolas || '').split(',').filter((c) => /^\d{8}$/.test(c)).slice(0, 4);
  const ibges = (sp.ibges || '').split(',').filter((c) => /^\d{7}$/.test(c)).slice(0, 4);

  // Carrega dados básicos das escolas/municípios pré-populados
  const escolasData = escolas.length > 0 ? await loadEscolas(escolas) : [];
  const municipiosData = ibges.length > 0 ? await loadMunicipios(ibges) : [];

  return (
    <Suspense>
      <CompararClient
        escolasData={escolasData}
        municipiosData={municipiosData}
        modo={escolasData.length > 0 ? 'escolas' : municipiosData.length > 0 ? 'municipios' : 'inicial'}
      />
    </Suspense>
  );
}

async function loadEscolas(codigos: string[]) {
  const { createSupabaseAdmin } = await import('@/lib/supabase');
  const sb = createSupabaseAdmin();
  const { data: escolas } = await sb
    .from('diag_escolas')
    .select('codigo_inep, nome, municipio, uf, rede, inse_grupo')
    .in('codigo_inep', codigos);

  if (!escolas?.length) return [];

  // Pega o Saeb 9_EF mais recente de cada (proxy editorial)
  const { data: saeb } = await sb
    .from('diag_saeb_snapshots')
    .select('codigo_inep, ano, etapa, disciplina, distribuicao, media_proficiencia')
    .in('codigo_inep', codigos)
    .eq('etapa', '9_EF')
    .order('ano', { ascending: false });

  const saebPorEscola = new Map<string, any[]>();
  for (const s of (saeb || [])) {
    const arr = saebPorEscola.get(s.codigo_inep) || [];
    if (arr.length < 4) { arr.push(s); saebPorEscola.set(s.codigo_inep, arr); }
  }

  // Mantém a ordem dos códigos passados na URL
  return codigos.map((cod) => {
    const e = escolas.find((x: any) => x.codigo_inep === cod);
    if (!e) return null;
    const ss = saebPorEscola.get(cod) || [];
    const lp = ss.find((s: any) => s.disciplina === 'LP');
    const mat = ss.find((s: any) => s.disciplina === 'MAT');
    const pctN01 = (snap: any) => {
      if (!snap?.distribuicao) return null;
      return Number(snap.distribuicao['0'] || 0) + Number(snap.distribuicao['1'] || 0);
    };
    return {
      ...e,
      saeb_ano: ss[0]?.ano ?? null,
      saeb_lp: lp?.media_proficiencia ?? null,
      saeb_mat: mat?.media_proficiencia ?? null,
      pct_n01_lp: pctN01(lp),
      pct_n01_mat: pctN01(mat),
    };
  }).filter(Boolean);
}

async function loadMunicipios(ibges: string[]) {
  const { createSupabaseAdmin } = await import('@/lib/supabase');
  const sb = createSupabaseAdmin();
  // Conta escolas + nome
  const { data: escolasMun } = await sb
    .from('diag_escolas')
    .select('municipio_ibge, municipio, uf')
    .in('municipio_ibge', ibges);
  const porIbge = new Map<string, { nome: string; uf: string; total: number }>();
  for (const e of (escolasMun || [])) {
    const cur = porIbge.get(e.municipio_ibge) || { nome: e.municipio, uf: e.uf, total: 0 };
    cur.total++;
    porIbge.set(e.municipio_ibge, cur);
  }
  // ICA mais recente
  const { data: ica } = await sb
    .from('diag_ica_snapshots')
    .select('municipio_ibge, ano, taxa, rede')
    .in('municipio_ibge', ibges)
    .order('ano', { ascending: false });
  const icaPorIbge = new Map<string, any>();
  for (const i of (ica || [])) {
    if (!icaPorIbge.has(i.municipio_ibge) && i.taxa != null) icaPorIbge.set(i.municipio_ibge, i);
  }
  return ibges.map((ibge) => {
    const m = porIbge.get(ibge);
    if (!m) return null;
    const ic = icaPorIbge.get(ibge);
    return {
      ibge,
      nome: m.nome,
      uf: m.uf,
      total: m.total,
      ica_taxa: ic?.taxa ?? null,
      ica_ano: ic?.ano ?? null,
      ica_rede: ic?.rede ?? null,
    };
  }).filter(Boolean);
}
