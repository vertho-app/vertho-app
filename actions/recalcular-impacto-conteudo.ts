'use server';

import { createSupabaseAdmin } from '@/lib/supabase';
import { getUserContext } from '@/lib/authz';

/**
 * Recalcula `impacto_medio_delta` e `impacto_amostras` de cada micro_conteudo.
 *
 * Método:
 *   1. Pra cada trilha CONCLUÍDA, olha temporada_plano e vê quais
 *      conteúdos (conteudo.core_id) cada semana usou, e qual foi o
 *      delta do descritor daquela semana (evolution_report).
 *   2. Agrega deltas por micro_conteudo.id → média = impacto.
 *   3. Persiste em micro_conteudos.{impacto_medio_delta, impacto_amostras}.
 *
 * Impacto baixo (<5 amostras) é marcado mas ranking ignora até amostra suficiente.
 *
 * Admin-only. Chamar via botão ou cron mensal.
 */
export async function recalcularImpactoConteudo(email: string) {
  const ctx = await getUserContext(email);
  if (!ctx?.isPlatformAdmin) return { error: 'Acesso restrito à Vertho' };

  const sb = createSupabaseAdmin();

  // 1. Todas as trilhas concluídas com evolution_report + temporada_plano
  const { data: trilhas } = await sb.from('trilhas')
    .select('id, temporada_plano, evolution_report')
    .eq('status', 'concluida')
    .not('evolution_report', 'is', null);

  if (!trilhas?.length) return { ok: true, processadas: 0, mensagem: 'Sem trilhas concluídas' };

  // 2. Agrega delta por conteudo_id
  // conteudoStats: { [coreId]: { deltas: [Δ, Δ, Δ], descritor, ... } }
  const conteudoStats: Record<string, { deltas: number[] }> = {};
  for (const t of trilhas) {
    const plano = Array.isArray(t.temporada_plano) ? t.temporada_plano : [];
    const report = t.evolution_report || {};
    const descritoresReport = report.descritores || [];
    for (const semana of plano) {
      if (semana.tipo !== 'conteudo') continue;
      const coreId = semana.conteudo?.core_id;
      if (!coreId) continue;
      const descRep = (descritoresReport as any[]).find((d: any) => d.descritor === semana.descritor);
      if (!descRep || descRep.nota_pos == null || descRep.nota_pre == null) continue;
      const delta = Number(descRep.nota_pos) - Number(descRep.nota_pre);
      if (isNaN(delta)) continue;
      if (!conteudoStats[coreId]) conteudoStats[coreId] = { deltas: [] };
      conteudoStats[coreId].deltas.push(delta);
    }
  }

  // 3. Calcula média + amostras e persiste
  let atualizados = 0;
  for (const [coreId, stats] of Object.entries(conteudoStats)) {
    const amostras = stats.deltas.length;
    const media = stats.deltas.reduce((a, b) => a + b, 0) / amostras;
    await sb.from('micro_conteudos').update({
      impacto_medio_delta: Number(media.toFixed(2)),
      impacto_amostras: amostras,
      impacto_atualizado_em: new Date().toISOString(),
    }).eq('id', coreId);
    atualizados++;
  }

  return {
    ok: true,
    trilhasAnalisadas: trilhas.length,
    conteudosAtualizados: atualizados,
    amostrasPorConteudo: Object.fromEntries(
      Object.entries(conteudoStats).map(([id, s]) => [id, s.deltas.length])
    ),
  };
}
