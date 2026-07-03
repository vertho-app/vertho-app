'use server';

import { requireAdminSupabase } from '@/lib/admin-supabase';

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
  void email;
  const sb = await requireAdminSupabase('ai.audit.regenerate');

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
      const entregas = Array.isArray(semana.conteudos_dia) && semana.conteudos_dia.length > 0
        ? semana.conteudos_dia
        : [{ descritor: semana.descritor, conteudo: semana.conteudo }];
      for (const entrega of entregas) {
        const coreId = entrega?.conteudo?.core_id;
        if (!coreId) continue;
        const descRep = (descritoresReport as any[]).find((d: any) => d.descritor === entrega.descritor);
        if (!descRep || descRep.nota_pos == null || descRep.nota_pre == null) continue;
        const delta = Number(descRep.nota_pos) - Number(descRep.nota_pre);
        if (isNaN(delta)) continue;
        if (!conteudoStats[coreId]) conteudoStats[coreId] = { deltas: [] };
        conteudoStats[coreId].deltas.push(delta);
      }
    }
  }

  // 3. Calcula média + amostras e persiste
  // Tenant da linha em LOTE (evita query por item no loop) — predicado explícito
  const coreIds = Object.keys(conteudoStats);
  const { data: linhasMc } = coreIds.length
    ? await sb.from('micro_conteudos').select('id, empresa_id').in('id', coreIds)
    : { data: [] as any[] };
  const tenantPorConteudo = new Map((linhasMc || []).map((l: any) => [l.id, l.empresa_id]));
  let atualizados = 0;
  for (const [coreId, stats] of Object.entries(conteudoStats)) {
    if (!tenantPorConteudo.has(coreId)) continue; // conteúdo não existe mais
    const amostras = stats.deltas.length;
    const media = stats.deltas.reduce((a, b) => a + b, 0) / amostras;
    const empresaLinha = tenantPorConteudo.get(coreId);
    let qImp = sb.from('micro_conteudos').update({
      impacto_medio_delta: Number(media.toFixed(2)),
      impacto_amostras: amostras,
      impacto_atualizado_em: new Date().toISOString(),
    }).eq('id', coreId);
    qImp = empresaLinha ? qImp.eq('empresa_id', empresaLinha) : qImp.is('empresa_id', null);
    await qImp;
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
