'use server';

// Portal do Representante — benchmark de conversão por segmento (MVP 4).
//
// Puramente DADOS (não IA): a partir das oportunidades fechadas, calcula por
// segmento a taxa de conversão, o ticket médio e o ciclo médio. O RC vê os
// PRÓPRIOS números; o admin vê o CANAL. Dá ao RC uma âncora para priorizar
// segmentos e calibrar expectativa.
import { createSupabaseAdmin } from '@/lib/supabase';
import { requireRepresentativeOrAdminAction } from '@/lib/sales/permissions';

export type SegmentBenchmark = {
  segmento: string;
  ganhas: number;
  perdidas: number;
  emAberto: number;
  conversao: number | null;   // ganhas / (ganhas + perdidas)
  ticketMedio: number | null; // média do estimated_value das ganhas
  cicloMedioDias: number | null; // média (fechamento - criação) das ganhas
};

/**
 * Benchmark por segmento. `escopo`: 'meu' (RC) usa o próprio funil; 'canal'
 * (só admin) agrega tudo. RC sempre vê 'meu'.
 */
export async function getBenchmarkSegmento(escopo: 'meu' | 'canal' = 'meu') {
  const ctx = await requireRepresentativeOrAdminAction();
  const sb = createSupabaseAdmin();

  let q = sb.from('sales_opportunities')
    .select('status, estimated_value, created_at, updated_at, account:sales_accounts (segment)');
  // RC: sempre próprio. Admin: 'meu' não faz sentido → usa canal.
  if (ctx.kind === 'representative') q = q.eq('representante_id', ctx.rep.id);
  const { data, error } = await q;
  if (error) return { success: false as const, error: error.message };

  const bySeg = new Map<string, { ganhas: any[]; perdidas: number; abertas: number }>();
  for (const o of (data || []) as any[]) {
    const seg = o.account?.segment || 'sem_segmento';
    if (!bySeg.has(seg)) bySeg.set(seg, { ganhas: [], perdidas: 0, abertas: 0 });
    const g = bySeg.get(seg)!;
    if (o.status === 'won') g.ganhas.push(o);
    else if (o.status === 'lost') g.perdidas += 1;
    else if (o.status === 'open') g.abertas += 1;
  }

  const rows: SegmentBenchmark[] = [...bySeg.entries()].map(([segmento, g]) => {
    const fechadas = g.ganhas.length + g.perdidas;
    const ticket = g.ganhas.length
      ? g.ganhas.reduce((s, o) => s + (Number(o.estimated_value) || 0), 0) / g.ganhas.length : null;
    const ciclos = g.ganhas
      .map((o) => (new Date(o.updated_at).getTime() - new Date(o.created_at).getTime()) / (24 * 60 * 60 * 1000))
      .filter((d) => isFinite(d) && d >= 0);
    const ciclo = ciclos.length ? ciclos.reduce((s, d) => s + d, 0) / ciclos.length : null;
    return {
      segmento,
      ganhas: g.ganhas.length,
      perdidas: g.perdidas,
      emAberto: g.abertas,
      conversao: fechadas ? g.ganhas.length / fechadas : null,
      ticketMedio: ticket != null ? Math.round(ticket) : null,
      cicloMedioDias: ciclo != null ? Math.round(ciclo) : null,
    };
  }).sort((a, b) => (b.ganhas + b.perdidas + b.emAberto) - (a.ganhas + a.perdidas + a.emAberto));

  return { success: true as const, rows, escopo: ctx.kind === 'admin' ? 'canal' : escopo };
}
