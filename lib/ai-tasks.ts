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
  { key: 'devolutiva_comportamental', label: 'Devolutiva em voz (roteiro)', fase: 'Perfil' },

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
  { key: 'conteudo_personalizacao', label: 'Personalizar PDF (DISC + PPP)', fase: 'Conteúdos' },
  { key: 'conteudo_tags', label: 'Sugerir tags (auto-classificação)', fase: 'Conteúdos' },

  // ── Fase 5 — Reavaliação ─────────────────────────────────
  { key: 'cenarios_b', label: 'Geração de Cenários B', fase: 'Fase 5' },
  { key: 'cenarios_b_check', label: 'Cenários B — Validação (check dual)', fase: 'Fase 5' },
  { key: 'evolucao_fusao', label: 'Evolução (fusão 3 fontes)', fase: 'Fase 5' },

  // ── Pulso de Desenvolvimento (Dual-IA) ───────────────────
  { key: 'pulse_classify', label: 'Pulso — Classificador de texto aberto', fase: 'Pulso' },
  { key: 'pulse_audit',    label: 'Pulso — Auditor (verifica classificação)', fase: 'Pulso' },

  // ── Vertho Master Content (módulos-base) ─────────────────
  { key: 'modulo_base_autor',   label: 'Módulo-Base — Rascunho assistido / Import docx', fase: 'Vertho' },
  { key: 'modulo_base_auditor', label: 'Módulo-Base — Auditor (valida o que a autora gerou)', fase: 'Vertho' },
];

export const MODELOS_DISPONIVEIS = [
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  // Snapshot datado: o alias puro `gpt-5.4` morreu p/ a chave do projeto (20/07).
  { id: 'gpt-5.4-2026-03-05', label: 'GPT 5.4' },
  { id: 'gpt-5.4-mini', label: 'GPT 5.4 mini' },
  { id: 'gpt-5.6-luna', label: 'GPT 5.6 Luna' },
  { id: 'gpt-5.6-terra', label: 'GPT 5.6 Terra' },
];

/**
 * Defaults por task quando não há config explícita no sys_config da empresa
 * (ou quando a task é platform-level, sem empresa associada).
 *
 * Padrão Dual-IA: a autora e a auditora usam modelos DIFERENTES de propósito,
 * pra ganhar perspectiva cruzada (mesmo padrão de IA4 + Check IA4 que usa
 * Gemini Flash auditando Claude, e do Pulso classifier + auditor).
 */
export const DEFAULT_TASK_MODELS: Record<string, string> = {
  // Módulos-Base — autora (extração/segmentação/estruturação) em Claude Sonnet 4.6
  // (24/06): qualidade pedagógica e aderência ao spec acima do Gemini Flash, que
  // entregava segmentação/estruturação mais rasa. Custo/latência maiores, aceitos
  // pela alavancagem (módulo-base é matéria-prima reaproveitada).
  modulo_base_autor:   'claude-sonnet-4-6',
  // ── TODAS as dupla-checagens (2ª IA auditando a 1ª) em GPT 5.6 Terra ──
  // Decisão do Rodrigo 22/07: padroniza os auditores no Terra ($2,50/$15) —
  // cross-família OpenAI auditando o Sonnet, qualidade acima do Luna ($1/$6,
  // Onda 0) e 4× mais barato que o gpt-5.4 ($10/$30) que ia3/ia4 usavam.
  // O veredito continua derivado EM CÓDIGO, não pedido ao modelo.
  modulo_base_auditor: 'gpt-5.6-terra',
  acumulada_check:     'gpt-5.6-terra',
  sem14_check:         'gpt-5.6-terra',
  ia3_check:           'gpt-5.6-terra',
  ia4_check:           'gpt-5.6-terra',
  cenarios_b_check:    'gpt-5.6-terra',
  pulse_audit:         'gpt-5.6-terra',
  // Roteiro de vídeo — peça criativa de alta alavancagem (reaproveitada por
  // célula): Opus 4.6 + extended thinking (mesmo preço do 4.8, $5/$25) pela
  // aderência a muitas regras + fidelidade pedagógica. Thinking é ativado no
  // callClaudeBatch (lib/video/gerar-roteiro.ts).
  conteudo_video:      'claude-opus-4-6',
};

const FALLBACK_GLOBAL = 'claude-sonnet-4-6';

/**
 * Tasks PINNED: imunes ao `modelo_padrao` genérico do tenant.
 *
 * Sem isto, uma empresa que setasse `sys_config.ai.modelo_padrao` (ex.: um
 * Flash barato pro chat) rebaixaria SILENCIOSAMENTE as auditorias críticas —
 * o genérico do tenant vencia o default por-task. O override EXPLÍCITO por
 * task (`ai.modelos[taskKey]`) continua valendo: quem configura a task
 * específica sabe o que está fazendo; o pin só barra o genérico.
 */
export const PINNED_TASKS = new Set([
  'modulo_base_auditor',
  'acumulada_check',
  'sem14_check',
  'ia3_check',
  'ia4_check',
  'cenarios_b_check',
  'pulse_audit',
]);

/**
 * Resolve o modelo configurado para uma tarefa:
 *   1. sys_config.ai.modelos[taskKey] (específico, configurável por empresa)
 *   2. sys_config.ai.modelo_padrao (fallback da empresa — IGNORADO se a task é pinned)
 *   3. DEFAULT_TASK_MODELS[taskKey] (default por task)
 *   4. 'claude-sonnet-4-6' (default absoluto)
 */
export function resolveTaskModel(sysConfig, taskKey) {
  const ai = sysConfig?.ai || {};
  const especifico = ai.modelos?.[taskKey];
  if (especifico) return especifico;
  if (ai.modelo_padrao && !PINNED_TASKS.has(taskKey)) return ai.modelo_padrao;
  return DEFAULT_TASK_MODELS[taskKey] || FALLBACK_GLOBAL;
}

/**
 * Helper server-side: busca sys_config da empresa e retorna o modelo
 * configurado pra uma tarefa específica. Use em server actions.
 *
 * empresaId null/undefined → usa o default da task (DEFAULT_TASK_MODELS) ou
 * o fallback global. Necessário pra tasks platform-level (módulos-base).
 */
export async function getModelForTask(empresaId, taskKey) {
  if (!empresaId) return DEFAULT_TASK_MODELS[taskKey] || FALLBACK_GLOBAL;
  try {
    const { createSupabaseAdmin } = await import('@/lib/supabase');
    const sb = createSupabaseAdmin();
    const { data } = await sb.from('empresas')
      .select('sys_config').eq('id', empresaId).maybeSingle();
    return resolveTaskModel(data?.sys_config, taskKey);
  } catch {
    return DEFAULT_TASK_MODELS[taskKey] || FALLBACK_GLOBAL;
  }
}
