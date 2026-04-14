/**
 * Catálogo centralizado de todas as situações do projeto que chamam IA.
 * Cada tarefa pode ter um modelo configurado por empresa (sys_config.ai.modelos)
 * ou herdar do modelo padrão.
 */

export const AI_TASKS = [
  // ── Fase 1 — Diagnóstico ─────────────────────────────────
  { key: 'ia1_top10', label: 'IA1 — Top 10 competências', fase: 'Fase 1' },
  { key: 'ia2_gabarito', label: 'IA2 — Perfil Ideal', fase: 'Fase 1' },
  { key: 'ia3_cenarios', label: 'IA3 — Geração de cenários', fase: 'Fase 1' },
  { key: 'ia3_check', label: 'IA3 — Validação (check dual)', fase: 'Fase 1' },

  // ── Fase 2 — Avaliação ───────────────────────────────────
  { key: 'ia4_avaliar', label: 'IA4 — Avaliar respostas', fase: 'Fase 2' },
  { key: 'ia4_check', label: 'IA4 — Validação (check dual)', fase: 'Fase 2' },
  { key: 'pdi_individual', label: 'PDI Individual', fase: 'Fase 2' },
  { key: 'relatorio_gestor', label: 'Relatório Gestor', fase: 'Fase 2' },
  { key: 'relatorio_rh', label: 'Relatório RH', fase: 'Fase 2' },

  // ── Perfil Comportamental (DISC) ─────────────────────────
  { key: 'relatorio_comportamental', label: 'Relatório Comportamental (textos LLM)', fase: 'Perfil' },
  { key: 'insights_executivos', label: 'Insights executivos (resumo)', fase: 'Perfil' },

  // ── Fase 3 — Motor de Temporadas ─────────────────────────
  { key: 'temporada_desafio', label: 'Desafios semanais', fase: 'Temporadas' },
  { key: 'temporada_cenario', label: 'Cenários de aplicação (sem 4, 8, 12)', fase: 'Temporadas' },
  { key: 'temporada_reflexao', label: 'Chat socrático (conteúdo)', fase: 'Temporadas' },
  { key: 'temporada_feedback', label: 'Chat analítico (aplicação)', fase: 'Temporadas' },
  { key: 'temporada_qualitativa', label: 'Avaliação qualitativa (sem 13)', fase: 'Temporadas' },
  { key: 'temporada_rubrica', label: 'Cenário + pontuação final (sem 14)', fase: 'Temporadas' },
  { key: 'temporada_extracao', label: 'Extração estruturada (JSON dos chats)', fase: 'Temporadas' },

  // ── Banco de Conteúdos ───────────────────────────────────
  { key: 'conteudo_video', label: 'Gerar roteiro de vídeo', fase: 'Conteúdos' },
  { key: 'conteudo_podcast', label: 'Gerar roteiro de podcast', fase: 'Conteúdos' },
  { key: 'conteudo_texto', label: 'Gerar artigo (markdown)', fase: 'Conteúdos' },
  { key: 'conteudo_case', label: 'Gerar estudo de caso', fase: 'Conteúdos' },
  { key: 'conteudo_tags', label: 'Sugerir tags (auto-classificação)', fase: 'Conteúdos' },

  // ── Fase 5 — Reavaliação ─────────────────────────────────
  { key: 'cenarios_b', label: 'Geração de Cenários B', fase: 'Fase 5' },
  { key: 'evolucao_fusao', label: 'Evolução (fusão 3 fontes)', fase: 'Fase 5' },
];

export const MODELOS_DISPONIVEIS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'gpt-5.4', label: 'GPT 5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT 5.4 mini' },
];

/**
 * Resolve o modelo configurado para uma tarefa:
 *   1. sys_config.ai.modelos[taskKey] (específico)
 *   2. sys_config.ai.modelo_padrao (fallback empresa)
 *   3. 'claude-sonnet-4-6' (default absoluto)
 */
export function resolveTaskModel(sysConfig, taskKey) {
  const ai = sysConfig?.ai || {};
  const especifico = ai.modelos?.[taskKey];
  if (especifico) return especifico;
  return ai.modelo_padrao || 'claude-sonnet-4-6';
}

/**
 * Helper server-side: busca sys_config da empresa e retorna o modelo
 * configurado pra uma tarefa específica. Use em server actions.
 */
export async function getModelForTask(empresaId, taskKey) {
  if (!empresaId) return 'claude-sonnet-4-6';
  try {
    const { createSupabaseAdmin } = await import('@/lib/supabase');
    const sb = createSupabaseAdmin();
    const { data } = await sb.from('empresas')
      .select('sys_config').eq('id', empresaId).maybeSingle();
    return resolveTaskModel(data?.sys_config, taskKey);
  } catch {
    return 'claude-sonnet-4-6';
  }
}
