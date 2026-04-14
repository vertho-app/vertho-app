'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Recalcula taxa_conclusao de todos os micro_conteudos core usados em trilhas.
 *
 * taxa_conclusao = (consumos / atribuições) × 100
 *   - atribuições: quantas vezes o conteúdo foi alocado como core em alguma semana
 *   - consumos: quantas dessas semanas têm conteudo_consumido=true no progresso
 */
export async function recalcularTaxaConclusao() {
  try {
    const sb = createSupabaseAdmin();

    const { data: trilhas } = await sb.from('trilhas')
      .select('id, temporada_plano')
      .not('temporada_plano', 'is', null);

    // Mapa: content_id → { atribuido: [{trilhaId, semana}] }
    const atribuicoes = {};
    for (const t of (trilhas || [])) {
      const plano = Array.isArray(t.temporada_plano) ? t.temporada_plano : [];
      for (const s of plano) {
        const contentId = s?.conteudo?.core_id;
        if (!contentId) continue;
        if (!atribuicoes[contentId]) atribuicoes[contentId] = [];
        atribuicoes[contentId].push({ trilhaId: t.id, semana: s.semana });
      }
    }

    const ids = Object.keys(atribuicoes);
    if (ids.length === 0) return { success: true, message: '0 conteúdos com atribuição', total: 0 };

    // Busca progresso em batch
    const { data: progresso } = await sb.from('temporada_semana_progresso')
      .select('trilha_id, semana, conteudo_consumido');
    const consumidoMap = new Set();
    for (const p of (progresso || [])) {
      if (p.conteudo_consumido) consumidoMap.add(`${p.trilha_id}::${p.semana}`);
    }

    // Calcula e atualiza
    let atualizados = 0;
    for (const id of ids) {
      const atrib = atribuicoes[id];
      const total = atrib.length;
      const consumidos = atrib.filter(a => consumidoMap.has(`${a.trilhaId}::${a.semana}`)).length;
      const taxa = total > 0 ? Math.round((consumidos / total) * 100) : null;
      const { error } = await sb.from('micro_conteudos')
        .update({ taxa_conclusao: taxa, total_views: consumidos })
        .eq('id', id);
      if (!error) atualizados++;
    }

    console.log(`[VERTHO] taxa_conclusao: ${atualizados}/${ids.length} conteúdos atualizados`);
    return { success: true, message: `${atualizados}/${ids.length} conteúdos atualizados`, total: atualizados };
  } catch (err) {
    console.error('[VERTHO] recalcularTaxaConclusao:', err);
    return { success: false, error: err?.message || 'Erro' };
  }
}
