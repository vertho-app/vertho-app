'use server';

import { findColabByEmail } from '@/lib/authz';
import { createSupabaseAdmin } from '@/lib/supabase';
import { callAI } from '@/actions/ai-client';
import { derivarArquetipo, derivarTagsExecutivas, insightsHardcoded } from '@/lib/disc-arquetipos';
import { buildInsightsExecutivosPrompt } from '@/lib/prompts/insights-executivos-prompt';

const INSIGHTS_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

const COLS = [
  'id', 'nome_completo', 'perfil_dominante', 'mapeamento_em',
  // DISC Natural
  'd_natural', 'i_natural', 's_natural', 'c_natural',
  // DISC Adaptado
  'd_adaptado', 'i_adaptado', 's_adaptado', 'c_adaptado',
  // Liderança
  'lid_executivo', 'lid_motivador', 'lid_metodico', 'lid_sistematico',
  // Tipo psicológico textual (legado, mas alimenta as tags executivas)
  'tp_introvertido_extrovertido', 'tp_sensor_intuitivo', 'tp_racional_emocional',
  // 16 Competências
  'comp_ousadia', 'comp_comando', 'comp_objetividade', 'comp_assertividade',
  'comp_persuasao', 'comp_extroversao', 'comp_entusiasmo', 'comp_sociabilidade',
  'comp_empatia', 'comp_paciencia', 'comp_persistencia', 'comp_planejamento',
  'comp_organizacao', 'comp_detalhismo', 'comp_prudencia', 'comp_concentracao',
  // Cache de insights
  'insights_executivos', 'insights_executivos_at',
].join(', ');

/**
 * Carrega todos os dados do perfil comportamental do colaborador:
 * DISC natural + adaptado, liderança, 16 competências e perfil dominante.
 */
export async function loadPerfilCIS(email) {
  if (!email) return { error: 'Nao autenticado' };

  const colab: any = await findColabByEmail(email, COLS);
  if (!colab) return { error: 'Colaborador nao encontrado' };

  // Resumo executivo: arquétipo + tags + insights (do cache OU fallback)
  const arquetipo = derivarArquetipo(colab.perfil_dominante);
  const tags = derivarTagsExecutivas(colab);

  let insights = null;
  let insightsCached = false;
  if (Array.isArray(colab.insights_executivos) && colab.insights_executivos.length) {
    insights = colab.insights_executivos;
    insightsCached = true;
  }

  return {
    colaborador: colab,
    arquetipo,
    tags,
    insights: insights || insightsHardcoded(colab.perfil_dominante),
    insightsCached,
  };
}

/**
 * Gera 3 insights executivos via LLM, salva em colaboradores.insights_executivos
 * com timestamp. Reusa cache se < 30 dias e `force` for false.
 */
export async function gerarInsightsExecutivos(email, opts: any = {}) {
  try {
    if (!email) return { error: 'Não autenticado' };

    const colab: any = await findColabByEmail(email, COLS);
    if (!colab) return { error: 'Colaborador não encontrado' };

    const force = !!opts.force;
    if (!force && Array.isArray(colab.insights_executivos) && colab.insights_executivos_at) {
      const age = Date.now() - new Date(colab.insights_executivos_at).getTime();
      if (age < INSIGHTS_CACHE_MAX_AGE_MS) {
        return { insights: colab.insights_executivos, cached: true };
      }
    }

    const arquetipo = derivarArquetipo(colab.perfil_dominante);
    const tags = derivarTagsExecutivas(colab);
    const prompt = buildInsightsExecutivosPrompt({ colab, arquetipo, tags });
    const system = 'Você é um consultor sênior de desenvolvimento humano. Responda APENAS com JSON válido no formato { "insights": ["...", "...", "..."] }, sem markdown nem comentários.';

    const { getModelForTask } = await import('@/lib/ai-tasks');
    const model = await getModelForTask(colab.empresa_id, 'insights_executivos');
    const raw = await callAI(system, prompt, { model }, 800);
    const cleaned = String(raw || '').replace(/```json\s*/gi, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[gerarInsightsExecutivos] parse error:', cleaned.slice(0, 300));
      return { error: 'Erro ao interpretar resposta do modelo' };
    }

    const insights = Array.isArray(parsed?.insights)
      ? parsed.insights.filter(s => typeof s === 'string' && s.trim()).slice(0, 3)
      : null;

    if (!insights || insights.length < 1) {
      return { error: 'Nenhum insight retornado pelo modelo' };
    }

    const sb = createSupabaseAdmin();
    await sb.from('colaboradores')
      .update({ insights_executivos: insights, insights_executivos_at: new Date().toISOString() })
      .eq('id', colab.id);

    return { insights, cached: false };
  } catch (err) {
    console.error('[gerarInsightsExecutivos]', err);
    return { error: err?.message || 'Erro ao gerar insights' };
  }
}
