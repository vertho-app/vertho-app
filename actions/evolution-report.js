'use server';

import { createSupabaseAdmin } from '@/lib/supabase';

/**
 * Classifica convergência de um descritor comparando nota_pre (início da temporada),
 * nota_pos (cenário sem 14) e nível_percebido (qualitativo sem 13).
 */
function classificarConvergencia({ nota_pre, nota_pos, nivel_percebido }) {
  const delta = nota_pos - nota_pre;
  const qualitativaPositiva = nivel_percebido != null && nivel_percebido > nota_pre;

  if (delta >= 0.5 && qualitativaPositiva) return 'evolucao_confirmada';
  if (delta >= 0.2 || qualitativaPositiva) return 'evolucao_parcial';
  if (delta < -0.2) return 'regressao';
  return 'estagnacao';
}

/**
 * Consolida semana 13 (qualitativa) + semana 14 (quantitativa) num Evolution Report.
 * Salva em trilhas.evolution_report e marca status='concluida'.
 */
export async function gerarEvolutionReport(trilhaId) {
  try {
    const sb = createSupabaseAdmin();
    const { data: trilha } = await sb.from('trilhas')
      .select('id, colaborador_id, descritores_selecionados')
      .eq('id', trilhaId).maybeSingle();
    if (!trilha) return { success: false, error: 'Trilha não encontrada' };

    const { data: prog13 } = await sb.from('temporada_semana_progresso')
      .select('reflexao').eq('trilha_id', trilhaId).eq('semana', 13).maybeSingle();
    const { data: prog14 } = await sb.from('temporada_semana_progresso')
      .select('feedback').eq('trilha_id', trilhaId).eq('semana', 14).maybeSingle();

    const qualitativa = prog13?.reflexao?.evolucao_percebida || [];
    const quantitativa = prog14?.feedback?.avaliacao_por_descritor || [];
    const descritores = Array.isArray(trilha.descritores_selecionados) ? trilha.descritores_selecionados : [];

    const consolidado = descritores.map(d => {
      const q = qualitativa.find(x => x.descritor === d.descritor) || {};
      const n = quantitativa.find(x => x.descritor === d.descritor) || {};
      const nota_pre = n.nota_pre ?? d.nota_atual ?? 1.5;
      const nota_pos = n.nota_pos ?? q.nivel_percebido ?? nota_pre;
      return {
        descritor: d.descritor,
        nota_pre, nota_pos,
        nivel_percebido: q.nivel_percebido ?? null,
        antes: q.antes || null,
        depois: q.depois || null,
        justificativa_cenario: n.justificativa || null,
        convergencia: classificarConvergencia({ nota_pre, nota_pos, nivel_percebido: q.nivel_percebido }),
      };
    });

    const evolution_report = {
      descritores: consolidado,
      insight_geral: prog13?.reflexao?.insight_geral || null,
      proximo_passo: prog13?.reflexao?.proximo_passo || null,
      resumo_avaliacao: prog14?.feedback?.resumo_avaliacao || null,
      nota_media_pos: prog14?.feedback?.nota_media_pos || null,
      resumo: {
        confirmadas: consolidado.filter(c => c.convergencia === 'evolucao_confirmada').length,
        parciais: consolidado.filter(c => c.convergencia === 'evolucao_parcial').length,
        estagnacoes: consolidado.filter(c => c.convergencia === 'estagnacao').length,
        regressoes: consolidado.filter(c => c.convergencia === 'regressao').length,
      },
    };

    await sb.from('trilhas').update({
      evolution_report,
      evolution_generated_at: new Date().toISOString(),
      status: 'concluida',
    }).eq('id', trilhaId);

    return { success: true, evolution_report };
  } catch (err) {
    console.error('[VERTHO] gerarEvolutionReport:', err);
    return { success: false, error: err?.message };
  }
}
