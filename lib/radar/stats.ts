import type { SupabaseClient } from '@supabase/supabase-js';

type RadarCountStats = {
  escolas: number;
  municipios: number;
  saeb: number;
  ica: number;
  ideb: number;
  saresp: number;
  fundeb: number;
  pdde: number;
};

function mapRadarCountRow(row: any): RadarCountStats {
  return {
    escolas: Number(row?.escolas || 0),
    municipios: Number(row?.municipios || 0),
    saeb: Number(row?.saeb_snapshots || 0),
    ica: Number(row?.ica_snapshots || 0),
    ideb: Number(row?.ideb_snapshots || 0),
    saresp: Number(row?.saresp_snapshots || 0),
    fundeb: Number(row?.fundeb_repasses || 0),
    pdde: Number(row?.pdde_escola || 0) + Number(row?.pdde_municipal || 0),
  };
}

export async function loadRadarCountStats(sb: SupabaseClient): Promise<RadarCountStats> {
  const { data: mvRow } = await sb
    .from('diag_mv_radar_counts')
    .select('escolas, municipios, saeb_snapshots, ica_snapshots, ideb_snapshots, saresp_snapshots, fundeb_repasses, pdde_escola, pdde_municipal')
    .limit(1)
    .maybeSingle();

  if (mvRow) return mapRadarCountRow(mvRow);

  const [escolas, municipiosRpc, saeb, ica, ideb, saresp, fundeb, pdde, pddeMun] = await Promise.all([
    sb.from('diag_escolas').select('codigo_inep', { count: 'exact', head: true }),
    sb.rpc('diag_count_municipios_distintos'),
    sb.from('diag_saeb_snapshots').select('id', { count: 'exact', head: true }),
    sb.from('diag_ica_snapshots').select('id', { count: 'exact', head: true }),
    sb.from('diag_ideb_snapshots').select('id', { count: 'exact', head: true }),
    sb.from('diag_saresp_snapshots').select('codigo_inep', { count: 'exact', head: true }),
    sb.from('diag_fundeb_repasses').select('municipio_ibge', { count: 'exact', head: true }),
    sb.from('diag_pdde_repasses').select('codigo_inep', { count: 'exact', head: true }),
    sb.from('diag_pdde_municipal').select('municipio_ibge', { count: 'exact', head: true }),
  ]);

  let municipios = 0;
  if (typeof municipiosRpc.data === 'number') {
    municipios = municipiosRpc.data;
  } else {
    const { data } = await sb.from('diag_escolas').select('municipio_ibge').not('municipio_ibge', 'is', null);
    municipios = new Set((data || []).map((row: any) => row.municipio_ibge)).size;
  }

  return {
    escolas: escolas.count || 0,
    municipios,
    saeb: saeb.count || 0,
    ica: ica.count || 0,
    ideb: ideb.count || 0,
    saresp: saresp.count || 0,
    fundeb: fundeb.count || 0,
    pdde: (pdde.count || 0) + (pddeMun.count || 0),
  };
}
