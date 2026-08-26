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
  /** Recorte por cargo (só no agregado da REDE; os DNAs aninhados não o têm). */
  porCargo?: DnaPorCargo[];
  /**
   * "Profissionais referência" AGREGADOS e ANÔNIMOS: quantas pessoas distintas
   * atingiram N3/N4, por (cargo × competência). Existe para o relatório poder
   * reconhecer quem já está no nível SEM identificar ninguém — o documento
   * promete, no próprio corpo, que "nenhum profissional é identificado".
   * Contagem de PESSOAS distintas, não de avaliações.
   */
  referencias?: { cargo: string; competencia: string; pessoas: number; bucketTopo: NBucket }[];
}

export interface DnaPorCargo {
  cargo: string;
  avaliados: number;
  dna: DnaAggregate;
}

const NIVEL_BUCKET: Record<string, NBucket> = {
  inicial: 'n1', em_desenvolvimento: 'n2', proficiente: 'n3', avancado: 'n4',
};
function bucketOf(nivel: string | null, nota: number | null): NBucket {
  if (nivel && NIVEL_BUCKET[nivel]) return NIVEL_BUCKET[nivel];
  const n = nivelDaNota(nota);
  return (['n1', 'n1', 'n2', 'n3', 'n4'][n] || 'n1') as NBucket;
}
const PRIORIDADE_MEDIA = 2.0; // média abaixo disso = competência prioritária

// Normalização de descritor (strip de código prefixo/sufixo + chave canônica)
// veio de lib/descritores — fonte única compartilhada com o persist da IA4.
// Histórico do bug (2 rodadas no MESMO dia, 20/07/2026): a IA4 persiste o nome
// ecoado pelo modelo, que alternou "COO03_D6 — Busca de apoio" e
// "Busca de apoio (COO03_D6)" — cada variante virava linha nova na tabela.
export { stripCodigoDescritor, chaveDescritor } from '@/lib/descritores';
import { stripCodigoDescritor, chaveDescritor } from '@/lib/descritores';
import { nivelDaNota } from '@/lib/nivel-regua';

function pct(d: Dist): Dist {
  const t = d.n1 + d.n2 + d.n3 + d.n4 || 1;
  return { n1: Math.round((d.n1 / t) * 100), n2: Math.round((d.n2 / t) * 100), n3: Math.round((d.n3 / t) * 100), n4: Math.round((d.n4 / t) * 100) };
}

const MIN_POR_CARGO_DNA = 3; // cargos com menos avaliados que isso não viram seção

export async function aggregateDna(sb: SupabaseClient, empresaId: string): Promise<DnaAggregate> {
  const { data: rawRows, error: assessmentsError } = await sb
    .from('descriptor_assessments')
    .select('colaborador_id, competencia, descritor, nota, nivel, assessment_date')
    .eq('empresa_id', empresaId);
  if (assessmentsError) throw new Error(`DNA: carregar avaliações: ${assessmentsError.message}`);
  // exclui contas internas @vertho.ai das estatísticas (colab interno → fora)
  const { data: colabs, error: colaboradoresError } = await sb.from('colaboradores')
    .select('id, email, cargo, role').eq('empresa_id', empresaId);
  if (colaboradoresError) throw new Error(`DNA: carregar colaboradores: ${colaboradoresError.message}`);
  // A conta de RH administra o programa; não participa do diagnóstico. Se ela
  // entrar no denominador, o DNA diz "3 de 7" enquanto o panorama (corretamente)
  // conta 6 participantes. Contas internas seguem fora pela mesma razão.
  const excluidosIds = new Set((colabs || [])
    .filter((x: any) => x.role === 'rh' || isInternalEmail(x.email))
    .map((x: any) => x.id as string));
  const totalColaboradores = (colabs || []).length - excluidosIds.size;
  const rows = (rawRows || []).filter((r: any) => !excluidosIds.has(r.colaborador_id));

  if (!rows || !rows.length) {
    return {
      totalColaboradores: totalColaboradores || 0, avaliados: 0, participacaoPct: 0, totalAvaliacoes: 0,
      distGeral: { n1: 0, n2: 0, n3: 0, n4: 0, total: 0 }, distGeralPct: { n1: 0, n2: 0, n3: 0, n4: 0 },
      competencias: [], topGaps: [], forcas: [], semDados: true,
    };
  }

  // dedup: 1 avaliação por (colaborador, competência, descritor) — mais recente.
  // Agrupa pela chave CANÔNICA e guarda o rótulo legível (só sem o código).
  const latest = new Map<string, any>();
  for (const r of rows) {
    const descritor = stripCodigoDescritor(r.descritor);
    const k = `${r.colaborador_id}|${r.competencia}|${chaveDescritor(r.descritor)}`;
    const prev = latest.get(k);
    if (!prev || String(r.assessment_date || '') > String(prev.assessment_date || '')) latest.set(k, { ...r, descritor });
  }
  const assess = [...latest.values()];

  const geral = computeDna(assess, totalColaboradores);

  // Recorte por cargo: cada avaliação herda o cargo do seu colaborador.
  const cargoById = new Map<string, string>();
  const totalPorCargo = new Map<string, number>();
  for (const col of colabs || []) {
    if (excluidosIds.has((col as any).id)) continue;
    const cg = (((col as any).cargo as string) || '').trim() || '(sem cargo)';
    cargoById.set((col as any).id, cg);
    totalPorCargo.set(cg, (totalPorCargo.get(cg) || 0) + 1);
  }
  const porGrupo = new Map<string, any[]>();
  for (const a of assess) {
    const cg = cargoById.get(a.colaborador_id) || '(sem cargo)';
    if (!porGrupo.has(cg)) porGrupo.set(cg, []);
    porGrupo.get(cg)!.push(a);
  }
  const porCargo: DnaPorCargo[] = [...porGrupo.entries()]
    .map(([cargo, arr]) => ({ cargo, avaliados: new Set(arr.map((a) => a.colaborador_id)).size, arr }))
    .filter((g) => g.avaliados >= MIN_POR_CARGO_DNA)
    .sort((a, b) => b.avaliados - a.avaliados)
    .map((g) => ({ cargo: g.cargo, avaliados: g.avaliados, dna: computeDna(g.arr, totalPorCargo.get(g.cargo) || g.avaliados) }));

  // Referências anônimas: pessoas DISTINTAS em N3/N4 por (cargo × competência).
  // Agregado, nunca nominal — ver o comentário de `referencias` na interface.
  const refPessoas = new Map<string, Set<string>>();
  const refTopo = new Map<string, NBucket>();
  for (const a of assess) {
    const b = bucketOf(a.nivel, a.nota);
    if (b !== 'n3' && b !== 'n4') continue;
    const cg = cargoById.get(a.colaborador_id) || '(sem cargo)';
    const k = `${cg}|||${a.competencia}`;
    if (!refPessoas.has(k)) refPessoas.set(k, new Set());
    refPessoas.get(k)!.add(a.colaborador_id);
    if (b === 'n4' || refTopo.get(k) !== 'n4') refTopo.set(k, b);
  }
  const referencias = [...refPessoas.entries()]
    .map(([k, set]) => {
      const [cargo, competencia] = k.split('|||');
      return { cargo, competencia, pessoas: set.size, bucketTopo: refTopo.get(k) || ('n3' as NBucket) };
    })
    .sort((a, b) => b.pessoas - a.pessoas)
    .slice(0, 8);

  return { ...geral, porCargo, referencias };
}

/** Agrega uma lista de avaliações (já dedupada) num DnaAggregate. Puro. */
function computeDna(assess: any[], totalColaboradores: number): DnaAggregate {
  const avaliados = new Set(assess.map((a) => a.colaborador_id)).size;
  const distGeral: Dist = { n1: 0, n2: 0, n3: 0, n4: 0 };

  // agrupa por competência → descritor. A chave é CANÔNICA (sem código, sem
  // acento, minúscula) e o `label` guarda o texto legível para exibir — agrupar
  // pelo texto cru era o que fazia o mesmo descritor virar duas linhas.
  const byComp = new Map<string, Map<string, { label: string; dist: Dist; notas: number[] }>>();
  for (const a of assess) {
    const b = bucketOf(a.nivel, a.nota);
    distGeral[b]++;
    if (!byComp.has(a.competencia)) byComp.set(a.competencia, new Map());
    const dmap = byComp.get(a.competencia)!;
    const dk = chaveDescritor(a.descritor);
    if (!dmap.has(dk)) dmap.set(dk, { label: stripCodigoDescritor(a.descritor), dist: { n1: 0, n2: 0, n3: 0, n4: 0 }, notas: [] });
    const d = dmap.get(dk)!;
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
    for (const [, d] of dmap) {
      const descritor = d.label;
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
