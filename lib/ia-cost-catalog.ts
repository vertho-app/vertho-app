/**
 * Catálogo de todas as chamadas de IA do projeto que escalam por colaborador.
 * Chamadas one-time por empresa (IA1/IA2/IA3/Cenários B) ficam fora — não
 * escalam com o número de colabs.
 *
 * Estimativas de tokens são aproximadas (sistema + histórico médio + output).
 * Ajuste conforme uso real for observado.
 */

// Preços por 1M tokens (USD) — valores aproximados nov/2025. Atualize se mudar.
export const MODELS = {
  'claude-opus-4-6':           { label: 'Claude Opus 4.6',    inUsd: 15, outUsd: 75 },
  'claude-sonnet-4-6':         { label: 'Claude Sonnet 4.6',  inUsd: 3,  outUsd: 15 },
  'claude-haiku-4-5-20251001': { label: 'Claude Haiku 4.5',   inUsd: 1,  outUsd: 5 },
  'gemini-3-flash-preview':    { label: 'Gemini 3 Flash',     inUsd: 0.3, outUsd: 1.5 },
  'gemini-3.1-pro-preview':    { label: 'Gemini 3.1 Pro',     inUsd: 1.5, outUsd: 5 },
  'gpt-5.4':                   { label: 'GPT 5.4',            inUsd: 10, outUsd: 30 },
  'gpt-5.4-mini':              { label: 'GPT 5.4 Mini',       inUsd: 1,  outUsd: 4 },
  // Embedding (sem custo de output)
  'voyage-3-large':            { label: 'Voyage-3-large (embed)', inUsd: 0.18, outUsd: 0 },
};

export const MODEL_IDS = Object.keys(MODELS);

/**
 * Cada item: chamada de IA que é executada N vezes por colab.
 * inTokens/outTokens são MÉDIAS por execução.
 * exec = número de execuções típicas por colab no ciclo completo.
 */
export const CALLS = [
  // ── DIAGNÓSTICO (uma vez por colab) ──
  {
    id: 'ia4-avaliacao',
    fase: 'Diagnóstico',
    nome: 'IA4 — Avaliação de cenários A',
    descricao: 'Avalia respostas do colab aos cenários iniciais, gera níveis por descritor.',
    inTokens: 3500,   // cenário + resposta + régua
    outTokens: 1200,  // JSON com avaliação por descritor
    exec: 5,          // ~5 competências top × 1 cenário A
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'ia4-check',
    fase: 'Diagnóstico',
    nome: 'Check IA4 (auditoria 2ª IA)',
    descricao: 'Auditor que verifica se IA4 foi defensável.',
    inTokens: 4500,
    outTokens: 600,
    exec: 5,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },

  // ── GERAÇÃO DA TEMPORADA (uma vez por colab) ──
  {
    id: 'desafio',
    fase: 'Geração Temporada',
    nome: 'Desafio semanal (conteúdo)',
    descricao: 'Gera texto do desafio pra cada semana de conteúdo.',
    inTokens: 600,
    outTokens: 200,
    exec: 12, // 12 semanas de conteúdo (1-12 exceto 4/8/12)
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'missao',
    fase: 'Geração Temporada',
    nome: 'Missão Prática',
    descricao: 'Gera a missão integrando 3 descritores para sems 4/8/12.',
    inTokens: 800,
    outTokens: 400,
    exec: 3,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'cenario-fallback',
    fase: 'Geração Temporada',
    nome: 'Cenário escrito (fallback)',
    descricao: 'Fallback pra missão se colab recusar. Gera cenário complexidade variável.',
    inTokens: 800,
    outTokens: 600,
    exec: 3,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },

  // ── TEMPORADA — CONVERSAS SEMANAIS ──
  {
    id: 'evidencias-socratic',
    fase: 'Temporada',
    nome: 'Evidências (mentor socrático)',
    descricao: 'Conversa de reflexão sem. Cada turno IA. Inclui grounding RAG (~4 chunks da knowledge_base).',
    inTokens: 2800, // system + histórico crescente médio + grounding (~800 tok)
    outTokens: 250,
    exec: 6 * 12, // 6 turnos IA × 12 sems de conteúdo
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'evidencias-extracao',
    fase: 'Temporada',
    nome: 'Extração estruturada (por sem)',
    descricao: 'Extrai insight, qualidade, desafio_realizado do transcript.',
    inTokens: 1500,
    outTokens: 400,
    exec: 12,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'tira-duvidas',
    fase: 'Temporada',
    nome: 'Tira-Dúvidas',
    descricao: 'Chat reativo com colab (média 3 perguntas/sem). Inclui grounding RAG (~5 chunks).',
    inTokens: 2000, // 1200 base + ~800 grounding
    outTokens: 250,
    exec: 3 * 12, // 3 perguntas × 12 sems de conteúdo (estimativa)
    defaultModel: 'claude-haiku-4-5-20251001',
    critical: false,
  },

  // ── EMBEDDING (grounding RAG) ──
  {
    id: 'rag-query-embed',
    fase: 'RAG',
    nome: 'Embedding de query (grounding)',
    descricao: 'Vetoriza cada query antes do kb_search_hybrid. 1 call por chamada com grounding (tira-dúvidas + evidências + missão + relatórios).',
    inTokens: 100, // query média ~100 tokens
    outTokens: 0,  // embedding não tem output
    exec: 36 + 6 * 12 + 10 * 3, // tira-dúvidas + evidências + missão feedback ≈ 138/colab
    defaultModel: 'voyage-3-large',
    critical: false,
  },

  // ── TEMPORADA — MISSÃO PRÁTICA (sems 4/8/12) ──
  {
    id: 'missao-feedback',
    fase: 'Temporada',
    nome: 'Missão Feedback (análise 10 turnos)',
    descricao: 'IA analisa relato do colab + aprofunda por descritor. Inclui grounding RAG (~4 chunks).',
    inTokens: 3600, // 2800 base + ~800 grounding
    outTokens: 300,
    exec: 10 * 3,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'missao-extracao',
    fase: 'Temporada',
    nome: 'Extração por missão',
    descricao: 'JSON com avaliação por descritor ao fim de cada missão.',
    inTokens: 2500,
    outTokens: 500,
    exec: 3,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },

  // ── SEM 13 QUALITATIVA ──
  {
    id: 'sem13-qualitativa',
    fase: 'Sem 13',
    nome: 'Conversa qualitativa (12 turnos)',
    descricao: 'Mentor de encerramento percorre descritores + microcaso.',
    inTokens: 3000,
    outTokens: 400,
    exec: 12,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'sem13-extracao',
    fase: 'Sem 13',
    nome: 'Extração qualitativa (antes/depois)',
    descricao: 'JSON com evolucao_percebida por descritor.',
    inTokens: 3500,
    outTokens: 900,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },

  // ── AVALIAÇÃO ACUMULADA (fim sem 13, auto-trigger) ──
  {
    id: 'acumulada-primaria',
    fase: 'Acumulada',
    nome: 'IA Acumuladora (nota por descritor)',
    descricao: 'Lê 13 semanas de evidências agregadas e pontua 1-4 por descritor ancorada na régua. Cega pra nota inicial (anti-viés).',
    inTokens: 5000, // régua + evidências agregadas das 13 sems
    outTokens: 1000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'acumulada-check',
    fase: 'Acumulada',
    nome: 'Check Acumuladora (auditoria)',
    descricao: '2ª IA audita a acumulada em 4 dimensões (ancoragem/consistência/justificativa/sem-evidência).',
    inTokens: 6500,
    outTokens: 600,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },

  // ── SEM 14 ──
  {
    id: 'sem14-scorer',
    fase: 'Sem 14',
    nome: 'Scorer da avaliação final',
    descricao: 'Pontua resposta ao cenário B triangulando: cenário + resposta + régua + acumulada estruturada + evidências brutas.',
    inTokens: 8000, // ficou pesado: régua + acumulada JSON + evidências + cenário + resposta + regras de ponderação
    outTokens: 1200,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'sem14-check',
    fase: 'Sem 14',
    nome: 'Check scorer sem 14',
    descricao: '2ª IA audita a avaliação final (4 dimensões, com foco em triangulação).',
    inTokens: 9000,
    outTokens: 700,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },

  // ── RELATÓRIOS ──
  // (evolution-report não usa IA — é consolidação programática dos JSONs já extraídos.)
  {
    id: 'pdi',
    fase: 'Relatórios',
    nome: 'PDI Individual',
    descricao: 'Plano de desenvolvimento individual gerado por IA (opcional).',
    inTokens: 3000,
    outTokens: 1500,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
    opcional: true,
  },
  {
    id: 'relatorio-individual',
    fase: 'Relatórios',
    nome: 'Relatório Individual (legado)',
    descricao: 'Síntese do ciclo pra RH/gestor (legado — tela HTML já substitui). Opcional.',
    inTokens: 3500,
    outTokens: 2000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
    opcional: true,
  },
];

/**
 * Presets de modelos por uso. "best" usa Opus em tudo crítico,
 * "balanced" usa Sonnet no crítico e Haiku no leve, "cheap" usa Haiku
 * em quase tudo (exceto onde erro grave é inaceitável).
 */
export const PRESETS = {
  best: {
    label: 'Melhor (Opus)',
    desc: 'Máxima qualidade. Opus 4.6 em tudo que for avaliativo.',
    model: (call) => {
      if (call.fase === 'RAG') return call.defaultModel;
      return call.critical ? 'claude-opus-4-6' : 'claude-sonnet-4-6';
    },
  },
  balanced: {
    label: 'Custo-benefício (Sonnet+Haiku)',
    desc: 'Sonnet no crítico (scoring, avaliação, extração). Haiku nas conversas reativas (Tira-Dúvidas) e gerações simples.',
    model: (call) => {
      if (call.fase === 'RAG') return call.defaultModel;
      if (call.critical) return 'claude-sonnet-4-6';
      if (call.id === 'tira-duvidas' || call.id === 'desafio') return 'claude-haiku-4-5-20251001';
      return 'claude-sonnet-4-6';
    },
  },
  cheap: {
    label: 'Barata (Haiku + Sonnet onde obrigatório)',
    desc: 'Haiku 4.5 em tudo que for conversacional. Sonnet só em scorers finais (sem 14 + check). Risco maior de erros pequenos.',
    model: (call) => {
      if (call.fase === 'RAG') return call.defaultModel;
      const mustBeSonnet = ['sem14-scorer', 'sem14-check', 'acumulada-primaria', 'acumulada-check', 'ia4-avaliacao', 'ia4-check'];
      if (mustBeSonnet.includes(call.id)) return 'claude-sonnet-4-6';
      return 'claude-haiku-4-5-20251001';
    },
  },
};

/**
 * Calcula custo de uma chamada (input + output) × execuções × colab.
 * @param {Object} call - item do CALLS
 * @param {string} modelId
 * @param {number} nColabs
 * @returns { usd, inTokens, outTokens, totalTokens }
 */
export function calcCost(call, modelId, nColabs = 1) {
  const m = MODELS[modelId];
  if (!m) return null;
  const inTok = call.inTokens * call.exec * nColabs;
  const outTok = call.outTokens * call.exec * nColabs;
  const usd = (inTok / 1_000_000) * m.inUsd + (outTok / 1_000_000) * m.outUsd;
  return { usd, inTokens: inTok, outTokens: outTok, totalTokens: inTok + outTok };
}
