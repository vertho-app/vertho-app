/**
 * DNA Organizacional — agregação do diagnóstico coletivo de competências.
 *
 * Consolida `descriptor_assessments` de uma empresa num retrato anônimo:
 * distribuição N1-N4 por competência/descritor, médias, gaps e forças.
 * Puro (sem IA, sem Next) — recebe um SupabaseClient. A camada narrativa
 * (lib/dna-organizacional/narrative) e o PDF consomem este output.
 *
 * Mapa nível → N: inicial=N1 (gap), em_desenvolvimento=N2, proficiente=N3
 * (meta), avancado=N4 (referência). Fallback por nota quando nível ausente.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isInternalEmail } from '@/lib/internal-emails';

export type NBucket = 'n1' | 'n2' | 'n3' | 'n4';
export interface Dist { n1: number; n2: number; n3: number; n4: number }
export interface DistPct extends Dist { total: number }

export interface DescritorStat {
  descritor: string;
  media: number;
  totalColabs: number;
  pct: Dist; // percentuais 0-100 por nível
}
export interface CompetenciaStat {
  nome: string;
  media: number;
  prioridade: boolean;
  pct: Dist; // distribuição agregada da competência
  descritores: DescritorStat[];
  forca?: { descritor: string; nivelPct: number; bucket: NBucket };
  oportunidade?: { descritor: string; n1pct: number };
}
export interface DnaAggregate {
  totalColaboradores: number;
  avaliados: number;
  participacaoPct: number;
  totalAvaliacoes: number;
  distGeral: DistPct; // contagens absolutas + total
  distGeralPct: Dist; // percentuais
  competencias: CompetenciaStat[];
  topGaps: { competencia: string; descritor: string; n1pct: number; media: number }[];
  forcas: { competencia: string; descritor: string; bucket: NBucket; pct: number }[];
  semDados: boolean;
}

const NIVEL_BUCKET: Record<string, NBucket> = {
  inicial: 'n1', em_desenvolvimento: 'n2', proficiente: 'n3', avancado: 'n4',
};
function bucketOf(nivel: string | null, nota: number | null): NBucket {
  if (nivel && NIVEL_BUCKET[nivel]) return NIVEL_BUCKET[nivel];
  const n = Math.max(1, Math.min(4, Math.floor(Number(nota) || 1)));
  return (['n1', 'n1', 'n2', 'n3', 'n4'][n] || 'n1') as NBucket;
}
const PRIORIDADE_MEDIA = 2.0; // média abaixo disso = competência prioritária

// Remove prefixo de código (ex.: "G09.6 — ", "V02.4 - ") pra deduplicar
// descritores que aparecem com e sem código no mesmo diagnóstico.
function normalizeDescritor(s: string): string {
  return String(s || '').replace(/^[A-Z]?\d+(\.\d+)*\s*[—–-]\s*/, '').trim();
}

function pct(d: Dist): Dist {
  const t = d.n1 + d.n2 + d.n3 + d.n4 || 1;
  return { n1: Math.round((d.n1 / t) * 100), n2: Math.round((d.n2 / t) * 100), n3: Math.round((d.n3 / t) * 100), n4: Math.round((d.n4 / t) * 100) };
}

export async function aggregateDna(sb: SupabaseClient, empresaId: string): Promise<DnaAggregate> {
  const { data: rawRows } = await sb
    .from('descriptor_assessments')
    .select('colaborador_id, competencia, descritor, nota, nivel, assessment_date')
    .eq('empresa_id', empresaId);
  // exclui contas internas @vertho.ai das estatísticas (colab interno → fora)
  const { data: colabs } = await sb.from('colaboradores').select('id, email').eq('empresa_id', empresaId);
  const internalIds = new Set((colabs || []).filter((x: any) => isInternalEmail(x.email)).map((x: any) => x.id as string));
  const totalColaboradores = (colabs || []).length - internalIds.size;
  const rows = (rawRows || []).filter((r: any) => !internalIds.has(r.colaborador_id));

  const empty = (): DnaAggregate => ({
    totalColaboradores: totalColaboradores || 0, avaliados: 0, participacaoPct: 0, totalAvaliacoes: 0,
    distGeral: { n1: 0, n2: 0, n3: 0, n4: 0, total: 0 }, distGeralPct: { n1: 0, n2: 0, n3: 0, n4: 0 },
    competencias: [], topGaps: [], forcas: [], semDados: true,
  });
  if (!rows || !rows.length) return empty();

  // dedup: 1 avaliação por (colaborador, competência, descritor) — mais recente
  const latest = new Map<string, any>();
  for (const r of rows) {
    const descritor = normalizeDescritor(r.descritor);
    const k = `${r.colaborador_id}|${r.competencia}|${descritor}`;
    const prev = latest.get(k);
    if (!prev || String(r.assessment_date || '') > String(prev.assessment_date || '')) latest.set(k, { ...r, descritor });
  }
  const assess = [...latest.values()];

  const avaliados = new Set(assess.map((a) => a.colaborador_id)).size;
  const distGeral: Dist = { n1: 0, n2: 0, n3: 0, n4: 0 };

  // agrupa por competência → descritor
  const byComp = new Map<string, Map<string, { dist: Dist; notas: number[] }>>();
  for (const a of assess) {
    const b = bucketOf(a.nivel, a.nota);
    distGeral[b]++;
    if (!byComp.has(a.competencia)) byComp.set(a.competencia, new Map());
    const dmap = byComp.get(a.competencia)!;
    if (!dmap.has(a.descritor)) dmap.set(a.descritor, { dist: { n1: 0, n2: 0, n3: 0, n4: 0 }, notas: [] });
    const d = dmap.get(a.descritor)!;
    d.dist[b]++;
    d.notas.push(Number(a.nota) || (['', '1', '2', '3', '4'][['n1', 'n2', 'n3', 'n4'].indexOf(b) + 1] as any) || 1);
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  const competencias: CompetenciaStat[] = [];
  const topGaps: DnaAggregate['topGaps'] = [];
  const forcas: DnaAggregate['forcas'] = [];

  for (const [nome, dmap] of byComp) {
    const compDist: Dist = { n1: 0, n2: 0, n3: 0, n4: 0 };
    const compNotas: number[] = [];
    const descritores: DescritorStat[] = [];
    for (const [descritor, d] of dmap) {
      (Object.keys(d.dist) as NBucket[]).forEach((k) => (compDist[k] += d.dist[k]));
      compNotas.push(...d.notas);
      const p = pct(d.dist);
      const totalColabs = d.dist.n1 + d.dist.n2 + d.dist.n3 + d.dist.n4;
      const media = avg(d.notas);
      descritores.push({ descritor, media: Math.round(media * 100) / 100, totalColabs, pct: p });
      topGaps.push({ competencia: nome, descritor, n1pct: p.n1, media: Math.round(media * 100) / 100 });
      if (p.n3 + p.n4 > 0) forcas.push({ competencia: nome, descritor, bucket: p.n4 >= p.n3 ? 'n4' : 'n3', pct: p.n3 + p.n4 });
    }
    descritores.sort((a, b) => b.pct.n1 - a.pct.n1); // pior gap primeiro
    const media = Math.round(avg(compNotas) * 100) / 100;
    const cp = pct(compDist);
    const oport = descritores[0] ? { descritor: descritores[0].descritor, n1pct: descritores[0].pct.n1 } : undefined;
    const best = [...descritores].sort((a, b) => (b.pct.n3 + b.pct.n4) - (a.pct.n3 + a.pct.n4) || b.media - a.media)[0];
    const forca = best && (best.pct.n3 + best.pct.n4 > 0 || best.media > media)
      ? { descritor: best.descritor, nivelPct: best.pct.n3 + best.pct.n4, bucket: (best.pct.n4 >= best.pct.n3 ? 'n4' : 'n3') as NBucket }
      : undefined;
    competencias.push({ nome, media, prioridade: media < PRIORIDADE_MEDIA, pct: cp, descritores, forca, oportunidade: oport });
  }

  competencias.sort((a, b) => a.media - b.media); // prioritárias (menor média) primeiro
  topGaps.sort((a, b) => b.n1pct - a.n1pct || a.media - b.media);
  forcas.sort((a, b) => b.pct - a.pct);

  const total = distGeral.n1 + distGeral.n2 + distGeral.n3 + distGeral.n4;
  return {
    totalColaboradores: totalColaboradores || avaliados,
    avaliados,
    participacaoPct: totalColaboradores ? Math.round((avaliados / totalColaboradores) * 100) : 100,
    totalAvaliacoes: assess.length,
    distGeral: { ...distGeral, total },
    distGeralPct: pct(distGeral),
    competencias,
    topGaps: topGaps.slice(0, 8),
    forcas: forcas.slice(0, 8),
    semDados: false,
  };
}
