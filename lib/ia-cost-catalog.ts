/**
 * Catálogo de chamadas de IA do projeto e seus custos estimados.
 *
 * `scaleType` define a unidade de escala da chamada:
 *   - 'colab'         → escala por colaborador no ciclo Mentor IA (14 sems)
 *   - 'conteudo'      → escala por peça de conteúdo AUTORADA na biblioteca
 *                       (micro_conteudos é reusada entre colaboradores; gerar é
 *                       um custo de setup/autoria, não por colaborador)
 *   - 'pagina_radar'  → escala por escola/município único analisado no Radar (cache por dadosHash)
 *   - 'lead_radar'    → escala por lead capturado no Radar (PDF gerado)
 *   - 'empresa'       → setup one-time por empresa (rodada única)
 *
 * Estimativas de tokens são aproximadas (sistema + histórico médio + output).
 * Ajuste conforme uso real for observado.
 *
 * Custos de MIDIA:
 *   - TTS (Gemini): por TOKEN — texto de entrada (inTokens) + tokens de ÁUDIO
 *     na saída (outTokens), que é o custo dominante. Preço in $1 / out $20 por 1M.
 *   - Render de vídeo Veo (por segundo de footage): usa `flatUsd` (custo fixo em
 *     USD por execução), somado em calcCost.
 *   - `costMultiplier` aplica desconto operacional conhecido (ex.: batch API).
 */

// Preços por 1M tokens (USD) — revisados em jul/2026.
// ⚠️ gpt-5.4 estava $10/$30 aqui (superestimava ~4x/2x); corrigido para o preço
// OFICIAL da doc OpenAI ($2,50/$15, cached $0,25) em 12/07/2026.
export const MODELS = {
  // Anthropic
  'claude-opus-5':              { label: 'Claude Opus 5',       inUsd: 5,    outUsd: 25 },
  // Sonnet 5 a preço INTRO (até 31/08/2026). GA = $3/$15. O ledger reflete o que
  // pagamos hoje; a projeção GA do piloto de custo é calculada à parte.
  'claude-sonnet-5':            { label: 'Claude Sonnet 5 (intro)', inUsd: 2, outUsd: 10 },
  // ── Linhas históricas (ledger pré-ago/2026) — manter p/ custo retroativo ──
  'claude-opus-4-8':            { label: 'Claude Opus 4.8',     inUsd: 5,    outUsd: 25 },
  'claude-opus-4-7':            { label: 'Claude Opus 4.7',     inUsd: 5,    outUsd: 25 },
  'claude-opus-4-6':            { label: 'Claude Opus 4.6',     inUsd: 5,    outUsd: 25 },
  'claude-sonnet-4-6':          { label: 'Claude Sonnet 4.6',   inUsd: 3,    outUsd: 15 },
  'claude-haiku-4-5':          { label: 'Claude Haiku 4.5',    inUsd: 1,    outUsd: 5 },
  'claude-haiku-4-5-20251001': { label: 'Claude Haiku 4.5',    inUsd: 1,    outUsd: 5 },
  // Google
  'gemini-3.6-flash':      { label: 'Gemini 3.6 Flash',      inUsd: 1.50, outUsd: 9 },
  'gemini-3.1-flash-lite':     { label: 'Gemini 3.1 Flash Lite',      inUsd: 0.25, outUsd: 1.50 },
  'gemini-3.5-flash':     { label: 'Gemini 3.5 Flash',      inUsd: 1.50, outUsd: 9 },
  'gemini-3.1-pro-preview': { label: 'Gemini 3.1 Pro',      inUsd: 2,    outUsd: 12 },
  'gemini-3.1-pro':       { label: 'Gemini 3.1 Pro',        inUsd: 2,    outUsd: 12 },
  // OpenAI
  'gpt-5.6-luna':               { label: 'GPT 5.6 Luna',        inUsd: 1,    outUsd: 6 },
  'gpt-5.6-sol':                { label: 'GPT 5.6 Sol',         inUsd: 5,    outUsd: 30 },
  'gpt-5.6-terra':              { label: 'GPT 5.6 Terra',       inUsd: 2.5,  outUsd: 15 },
  'gpt-5.5':                    { label: 'GPT 5.5',             inUsd: 12,   outUsd: 36 },
  'gpt-5.4':                    { label: 'GPT 5.4',             inUsd: 2.5,  outUsd: 15 },
  // Snapshot datado = o único id de 5.4 full que a chave do projeto acessa
  // (o alias puro retorna model_not_found desde ~jul/2026). Mesmo preço.
  'gpt-5.4-2026-03-05':         { label: 'GPT 5.4',             inUsd: 2.5,  outUsd: 15 },
  'gpt-5.4-mini':               { label: 'GPT 5.4 Mini',        inUsd: 1,    outUsd: 4 },
  'gpt-5.1':                    { label: 'GPT 5.1 (fallback)',  inUsd: 5,    outUsd: 15 },
  // Moonshot (provider kimi no ai-client). Reasoning: o out inclui o thinking.
  'kimi-k3':                    { label: 'Kimi K3',             inUsd: 3,    outUsd: 15 },
  // Embeddings (sem custo de output)
  'voyage-3-large':             { label: 'Voyage-3-large (embed)', inUsd: 0.18, outUsd: 0 },
  // TTS — por token. Input = texto; Output = tokens de áudio (custo dominante).
  'gemini-3.1-flash-tts':       { label: 'Gemini 3.1 Flash TTS (áudio)', inUsd: 1, outUsd: 20 },
};

export const MODEL_IDS = Object.keys(MODELS);

/**
 * Custo em USD a partir de tokens REAIS (ledger de IA). Fonte única usada pelo
 * wrapper (callAI) e pelo batch. cache read = 0,1× input; write = 1,25× (TTL
 * 5min). Batch API = −50%: passe `batch: true`. Retorna null se o modelo não
 * está no catálogo (a linha do ledger fica sem custo, sinalizando gap).
 */
export function costFromTokens(
  modelId: string,
  t: { inTokens: number; outTokens: number; cacheRead?: number; cacheWrite?: number },
  opts: { batch?: boolean } = {},
): number | null {
  const m = (MODELS as Record<string, { inUsd: number; outUsd: number }>)[modelId];
  if (!m) return null;
  const usd =
    (t.inTokens * m.inUsd +
      t.outTokens * m.outUsd +
      (t.cacheRead || 0) * m.inUsd * 0.1 +
      (t.cacheWrite || 0) * m.inUsd * 1.25) / 1_000_000;
  return opts.batch ? usd * 0.5 : usd;
}

export const SCALE_LABEL = {
  colab: 'por colaborador',
  conteudo: 'por peça de conteúdo autorada',
  extracao: 'por vídeo extraído (módulo-base)',
  video_gerado: 'por vídeo gerado (Módulo-Base → HeyGen+Remotion)',
  pagina_radar: 'por escola/município único (Radar)',
  lead_radar: 'por lead PDF (Radar)',
  empresa: 'one-time por empresa',
};

/**
 * Cada item: chamada de IA executada N vezes por unidade de escala.
 * `inTokens`/`outTokens` são MÉDIAS por execução.
 * `exec` = nº típico de execuções por unidade da `scaleType`.
 */
export const CALLS = [
  // ── DIAGNÓSTICO (uma vez por colab) ──
  {
    id: 'ia4-avaliacao',
    fase: 'Diagnóstico',
    scaleType: 'colab',
    nome: 'IA4 — Avaliação de cenários A',
    descricao: 'Avalia respostas do colab aos cenários iniciais, gera níveis por descritor.',
    inTokens: 3500,
    outTokens: 1200,
    exec: 5,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'ia4-check',
    fase: 'Diagnóstico',
    scaleType: 'colab',
    nome: 'Check IA4 (auditoria 2ª IA)',
    descricao: 'Auditor cross-LLM que verifica se IA4 foi defensável.',
    inTokens: 4500,
    outTokens: 600,
    exec: 5,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.ia4_check)
    critical: true,
  },

  // ── PERFIL DISC (uma vez por colab, cacheado 30 dias) ──
  {
    id: 'relatorio-disc-textos',
    fase: 'Perfil DISC',
    scaleType: 'colab',
    nome: 'Relatório Comportamental — textos LLM',
    descricao: 'Gera os textos interpretativos do relatório DISC (5 páginas) a partir do perfil CIS. Cache 30 dias em colaboradores.report_texts.',
    inTokens: 3000,
    outTokens: 2500,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'insights-executivos',
    fase: 'Perfil DISC',
    scaleType: 'colab',
    nome: 'Insights Executivos',
    descricao: '3-4 insights curtos a partir do perfil DISC + competências. Cache 30 dias em colaboradores.insights_executivos.',
    inTokens: 2000,
    outTokens: 600,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },

  // ── GERAÇÃO DA TEMPORADA (uma vez por colab) ──
  {
    id: 'desafio',
    fase: 'Geração Temporada',
    scaleType: 'colab',
    nome: 'Desafio semanal (conteúdo)',
    descricao: 'Gera texto do desafio pra cada semana de conteúdo.',
    inTokens: 600,
    outTokens: 200,
    exec: 12,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'missao',
    fase: 'Geração Temporada',
    scaleType: 'colab',
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
    scaleType: 'colab',
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
    scaleType: 'colab',
    nome: 'Evidências (mentor socrático)',
    descricao: 'Conversa de reflexão sem. Cada turno IA. Inclui grounding RAG (~4 chunks da knowledge_base).',
    inTokens: 2800,
    outTokens: 250,
    exec: 6 * 12,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'evidencias-extracao',
    fase: 'Temporada',
    scaleType: 'colab',
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
    scaleType: 'colab',
    nome: 'Tira-Dúvidas',
    descricao: 'Chat reativo com colab (média 3 perguntas/sem). Contexto: definição do descritor + conteúdo recebido na semana (corpo do micro-conteúdo) + Módulo-Base + grounding RAG. Modelo Sonnet 4.6.',
    inTokens: 4200,
    outTokens: 400,
    exec: 3 * 12,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'beto-mentor',
    fase: 'Temporada',
    scaleType: 'colab',
    nome: 'BETO — mentor (dashboard)',
    descricao: 'Chat mentor no painel do colab. Contexto: doutrina DISC/Jung + perfil comportamental real + conhecimento da competência em foco + pílula da semana. Modelo Sonnet 4.6. Uso opcional/variável (estimativa ~10 mensagens/ciclo).',
    inTokens: 4000,
    outTokens: 300,
    exec: 10,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
    opcional: true,
  },

  // ── EMBEDDING (grounding RAG) ──
  {
    id: 'rag-query-embed',
    fase: 'RAG',
    scaleType: 'colab',
    nome: 'Embedding de query (grounding)',
    descricao: 'Vetoriza cada query antes do kb_search_hybrid. 1 call por chamada com grounding (tira-dúvidas + evidências + missão + relatórios).',
    inTokens: 100,
    outTokens: 0,
    exec: 36 + 6 * 12 + 10 * 3,
    defaultModel: 'voyage-3-large',
    critical: false,
  },

  // ── TEMPORADA — MISSÃO PRÁTICA (sems 4/8/12) ──
  {
    id: 'missao-feedback',
    fase: 'Temporada',
    scaleType: 'colab',
    nome: 'Missão Feedback (análise 10 turnos)',
    descricao: 'IA analisa relato do colab + aprofunda por descritor. Inclui grounding RAG (~4 chunks).',
    inTokens: 3600,
    outTokens: 300,
    exec: 10 * 3,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'missao-extracao',
    fase: 'Temporada',
    scaleType: 'colab',
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
    scaleType: 'colab',
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
    scaleType: 'colab',
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
    scaleType: 'colab',
    nome: 'IA Acumuladora (nota por descritor)',
    descricao: 'Lê 13 semanas de evidências agregadas e pontua 1-4 por descritor ancorada na régua. Cega pra nota inicial (anti-viés).',
    inTokens: 5000,
    outTokens: 1000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'acumulada-check',
    fase: 'Acumulada',
    scaleType: 'colab',
    nome: 'Check Acumuladora (auditoria)',
    descricao: 'Auditor cross-LLM em 4 dimensões (ancoragem/consistência/justificativa/sem-evidência).',
    inTokens: 6500,
    outTokens: 600,
    exec: 1,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.acumulada_check)
    critical: true,
  },

  // ── SEM 14 ──
  {
    id: 'sem14-scorer',
    fase: 'Sem 14',
    scaleType: 'colab',
    nome: 'Scorer da avaliação final',
    descricao: 'Pontua resposta ao cenário B triangulando: cenário + resposta + régua + acumulada estruturada + evidências brutas.',
    inTokens: 8000,
    outTokens: 1200,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'sem14-check',
    fase: 'Sem 14',
    scaleType: 'colab',
    nome: 'Check scorer sem 14',
    descricao: 'Auditor cross-LLM da avaliação final (4 dimensões, com foco em triangulação).',
    inTokens: 9000,
    outTokens: 700,
    exec: 1,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.sem14_check)
    critical: true,
  },

  // ── RELATÓRIOS (opcionais — Evolution Report já cobre o caso padrão) ──
  {
    id: 'pdi',
    fase: 'Relatórios',
    scaleType: 'colab',
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
    scaleType: 'colab',
    nome: 'Relatório Individual (legado)',
    descricao: 'Síntese do ciclo pra RH/gestor (legado — tela HTML já substitui). Opcional.',
    inTokens: 3500,
    outTokens: 2000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
    opcional: true,
  },

  // ── SETUP DA EMPRESA (one-time por empresa) ──
  {
    id: 'tagging-conteudos',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'Tagging IA — banco de conteúdos',
    descricao: 'Sparkles em /admin/conteudos sugere competência/descritor/cargo por conteúdo importado do Bunny ou criado manual.',
    inTokens: 1500,
    outTokens: 400,
    exec: 50,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'ppp-extracao',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'PPP — extração 10 seções',
    descricao: 'Lê PPP da escola (Jina/Firecrawl/.docx via mammoth) e estrutura em 10 seções. Multi-escola dentro da empresa.',
    inTokens: 8000,
    outTokens: 4000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'ia1-top10',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'IA1 — Top 10 por cargo',
    descricao: 'Gera Top 10 competências por cargo. Inclui aderencia_cargo, aderencia_mercado, motivo. Roda 1× por cargo da empresa.',
    inTokens: 4000,
    outTokens: 2000,
    exec: 4,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'ia2-gabarito',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'IA2 — Gabarito',
    descricao: 'Gera descrição enriquecida de cada competência do Top 5.',
    inTokens: 1500,
    outTokens: 1500,
    exec: 4 * 5,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'ia3-cenarios',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'IA3 — Cenários A (gerador)',
    descricao: '5 cenários A por cargo × competência (1ª IA, geradora).',
    inTokens: 3000,
    outTokens: 2000,
    exec: 4 * 5,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'ia3-cenarios-check',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'IA3 — Cenários A (check)',
    descricao: 'Auditor cross-LLM dos cenários A — checa coerência com competência e qualidade pedagógica.',
    inTokens: 3500,
    outTokens: 600,
    exec: 4 * 5,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.ia3_check)
    critical: false,
  },
  {
    id: 'cenarios-b',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'Cenários B (gerador)',
    descricao: 'Geração do banco de cenários B usados na sem 14. 1× por competência da empresa (1ª IA, geradora).',
    inTokens: 3000,
    outTokens: 2500,
    exec: 4 * 5,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'cenarios-b-check',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'Cenários B (check)',
    descricao: 'Auditor cross-LLM dos cenários B — valida estrutura (4 perguntas P1-P4) + ancoragem na régua n1-n4.',
    inTokens: 3500,
    outTokens: 600,
    exec: 4 * 5,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.cenarios_b_check)
    critical: false,
  },

  // ── GERAÇÃO DE CONTEÚDO (biblioteca micro_conteudos, reusada entre colabs) ──
  // Escala por PEÇA autorada. units = nº de conteúdos daquele formato.
  {
    id: 'conteudo-texto',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Artigo (texto) — geração',
    descricao: 'Gera artigo markdown (mín. 8.000 caracteres) por competência×descritor×nível. Reusado entre colaboradores.',
    inTokens: 700,
    outTokens: 2500,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'conteudo-case',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Estudo de caso — geração',
    descricao: 'Gera case narrativo (mín. 8.000 caracteres). Reusado entre colaboradores.',
    inTokens: 700,
    outTokens: 2500,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'conteudo-podcast-roteiro',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Podcast — roteiro (LLM)',
    descricao: 'Gera roteiro de podcast (3-5 min) com bloco de narração para TTS.',
    inTokens: 800,
    outTokens: 1300,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'conteudo-podcast-tts',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Podcast — síntese de voz (TTS)',
    descricao: 'Gera o áudio MP3 da narração (~3-4 min). Gemini TTS por token: input = texto (~750 tok); output = áudio (~5.000 tok ≈ 210s × ~25 tok/s), que domina o custo.',
    inTokens: 750,
    outTokens: 5000,
    exec: 1,
    defaultModel: 'gemini-3.1-flash-tts',
    critical: false,
  },
  // (Fluxo de vídeo via Veo descontinuado — substituído pela fase "Vídeo do
  //  Módulo-Base" abaixo, com avatar HeyGen + Remotion.)
  {
    id: 'conteudo-personalizacao',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Personalização DISC+PPP (PDF)',
    descricao: 'Camada extra por (conteúdo × arquétipo DISC), anexada ao PDF. Cacheada por arquétipo. exec=4 arquétipos por conteúdo personalizado.',
    inTokens: 3000,
    outTokens: 2000,
    exec: 4,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
    opcional: true,
  },

  // ── VÍDEO GERADO a partir do MÓDULO-BASE (avatar HeyGen + cenas Remotion + narração TTS própria) ──
  // Escala por VÍDEO gerado (3-5 min). Custo dominante passa a ser o avatar,
  // porque render em produção usa Hetzner (custo fixo amortizado). O roteiro
  // Opus entra no custo com Batch API (50% off) + prompt caching/prompting como
  // upside operacional quando vários roteiros compartilham o mesmo system prompt.
  {
    id: 'video-modulo-roteiro',
    fase: 'Vídeo do Módulo-Base',
    scaleType: 'video_gerado',
    nome: 'Roteiro de vídeo (LLM)',
    descricao: 'Transforma o Módulo-Base em roteiro de 6–12 cenas (3–5 min, JSON). Opus 5 + extended thinking via Batch API (50% off) → ~$0,054/roteiro em lote (síncrono ~$0,11). ~4,5k tok in + ~3,5k tok out.',
    inTokens: 4500,
    outTokens: 3500,
    costMultiplier: 0.5,
    exec: 1,
    defaultModel: 'claude-opus-5',
    critical: false,
  },
  {
    id: 'video-modulo-narracao',
    fase: 'Vídeo do Módulo-Base',
    scaleType: 'video_gerado',
    nome: 'Narração das cenas (TTS)',
    descricao: 'Narração própria (Gemini TTS, voz Vindemiatrix) das N cenas, ~4 min de áudio, dirigida por tipo de cena. Medido: ~$0,12 por vídeo. Serve às cenas animadas e ao lip-sync do avatar.',
    inTokens: 0,
    outTokens: 0,
    flatUsd: 0.12,
    exec: 1,
    defaultModel: 'gemini-3.1-flash-tts',
    critical: false,
  },
  {
    id: 'video-modulo-whisper',
    fase: 'Vídeo do Módulo-Base',
    scaleType: 'video_gerado',
    nome: 'Alinhamento de legenda (Whisper)',
    descricao: 'OpenAI whisper-1 (ASR) sobre a narração (~4 min) p/ timing por palavra (legendas + animações sincronizadas). $0,006/min → ~$0,025 por vídeo. Degrada com graça p/ heurística se ausente.',
    inTokens: 0,
    outTokens: 0,
    flatUsd: 0.025,
    exec: 1,
    defaultModel: 'gemini-3.1-flash-lite',
    critical: false,
  },
  {
    id: 'video-modulo-avatar',
    fase: 'Vídeo do Módulo-Base',
    scaleType: 'video_gerado',
    nome: 'Avatar falante (HeyGen)',
    descricao: 'Clipes de avatar (intro + outro, ~28s) com lip-sync da nossa narração. MEDIDO no billing HeyGen: $0,0167/s = $1,00/min exato (linear, sem taxa fixa) → ~$0,47 por vídeo. É a MAIOR linha (~64% do deck). Escala com a duração da fala do avatar. OPCIONAL: sem avatar o custo cai todo este valor.',
    inTokens: 0,
    outTokens: 0,
    flatUsd: 0.47,
    exec: 1,
    defaultModel: 'gemini-3.1-flash-lite',
    critical: false,
    opcional: true,
  },
  {
    id: 'video-modulo-render',
    fase: 'Vídeo do Módulo-Base',
    scaleType: 'video_gerado',
    nome: 'Render Remotion (Hetzner)',
    descricao: 'Render Remotion 720p/30fps → Bunny em CX33 ($0,016/h, 4 vCPU shared) paralelo+efêmero (1 deck/box, boxes morrem após o lote). MEDIDO: deck ~4,4min @720p = ~2,3h de render → ~$0,037; com a composição otimizada (fundo chapado + sem backdrop-blur, −40%) = ~$0,022/vídeo. 1080p ~2,25×. Trigger.dev (~$5-6/vídeo) só como override de teste. GPU/RunPod NÃO compensa (CX33 é barato demais/h).',
    inTokens: 0,
    outTokens: 0,
    flatUsd: 0.022,
    exec: 1,
    defaultModel: 'gemini-3.1-flash-lite',
    critical: false,
  },

  // ── EXTRAÇÃO DE VÍDEO → MÓDULO-BASE (matéria-prima canônica, reusada) ──
  // Escala por VÍDEO extraído. Áudio→texto (Gemini) + detecção + estruturação
  // dos 4 blocos (Sonnet). Auditoria é opcional (só ao submeter à revisão).
  {
    id: 'extracao-audio-texto',
    fase: 'Extração de Vídeo',
    scaleType: 'extracao',
    nome: 'Vídeo → texto-base (Gemini áudio)',
    descricao: 'yt-dlp/ffmpeg extrai o áudio e o Gemini destila o texto-base. Input ESCALA com a duração (~1.920 tok/min de áudio; base: vídeo de 10 min = 19.200 tok). Output = texto-base (~1.800 tok). Vídeos longos: ver fase de chunking.',
    inTokens: 19200,
    outTokens: 1800,
    exec: 1,
    defaultModel: 'gemini-3.6-flash',
    critical: false,
  },
  {
    id: 'extracao-deteccao',
    fase: 'Extração de Vídeo',
    scaleType: 'extracao',
    nome: 'Detecção de competência + níveis',
    descricao: 'Mapeia o conteúdo ao catálogo canônico (competencias_base) + transição N→N. Input = catálogo (~200 comps) + texto-base; output = JSON curto.',
    inTokens: 4500,
    outTokens: 800,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'extracao-estrutura',
    fase: 'Extração de Vídeo',
    scaleType: 'extracao',
    nome: 'Estruturação dos 4 blocos (IA-autora)',
    descricao: 'Estrutura o texto-base no Módulo-Base (conteúdo central + aplicável + guarda-corpos + adaptação por formato). Custo dominante da extração; independe da duração do vídeo.',
    inTokens: 5000,
    outTokens: 8000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'extracao-auditor',
    fase: 'Extração de Vídeo',
    scaleType: 'extracao',
    nome: 'Auditoria Dual-IA (ao submeter à revisão)',
    descricao: 'IA-auditora (GPT 5.6 Luna desde a Onda 0) valida os 4 blocos quando o módulo é submetido à revisão. Opcional — só conta se publicar via workflow.',
    inTokens: 9000,
    outTokens: 2000,
    exec: 1,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.modulo_base_auditor)
    critical: false,
    opcional: true,
  },

  // ── RADAR VERTHO (público radar.vertho.ai) ──
  {
    id: 'radar-narrativa-escola',
    fase: 'Radar',
    scaleType: 'pagina_radar',
    nome: 'Narrativa pública — Escola',
    descricao: 'Resumo + pontos atenção/destaque + perguntas pedagógicas a partir de Saeb/Ideb/ENEM/SARESP/Censo. Cache por dadosHash em diag_analises_ia.',
    inTokens: 3000,
    outTokens: 800,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'radar-narrativa-municipio',
    fase: 'Radar',
    scaleType: 'pagina_radar',
    nome: 'Narrativa pública — Município',
    descricao: 'Resumo + pontos a partir de ICA/ENEM/FUNDEB/PDDE. Cache por dadosHash.',
    inTokens: 2500,
    outTokens: 700,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'radar-proposta-pdf',
    fase: 'Radar',
    scaleType: 'lead_radar',
    nome: 'Proposta PDF — escola/município',
    descricao: 'Gera resumo executivo + 3 pontos críticos com competência Vertho + leitura SAEB/infra/recursos pra PDF do lead. Worker QStash + Resend. Cache por dadosHash.',
    inTokens: 4500,
    outTokens: 3000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'radarbett-narrativa',
    fase: 'Radar',
    scaleType: 'pagina_radar',
    nome: 'Radarbett — narrativa Bett',
    descricao: 'Variante Bett 2026 da narrativa pública (radarbett.vertho.ai), output mais curto (600 tok max).',
    inTokens: 2500,
    outTokens: 500,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
];

/**
 * Mapa check → primary. Cada par é dual-IA: o primário gera, o check audita.
 * Os presets aplicam pareamento cross-família automaticamente via crossLlmCheck.
 */
const CHECK_PRIMARIES = {
  'ia4-check': 'ia4-avaliacao',
  'acumulada-check': 'acumulada-primaria',
  'sem14-check': 'sem14-scorer',
  'ia3-cenarios-check': 'ia3-cenarios',
  'cenarios-b-check': 'cenarios-b',
};

/**
 * Pareia modelo primário ao auditor de FAMÍLIA DIFERENTE com força similar.
 * Garante que o auditor não compartilhe vieses do primário.
 *   Sonnet 4.6/5    ↔ GPT 5.6 Terra
 *   Gemini 3.6 Flash ↔ GPT 5.6 Luna
 *   Opus 5 / Sol    ↔ GPT 5.6 Sol / Opus 5
 */
function crossLlmCheck(primaryModel) {
  const map = {
    'claude-opus-5':     'gpt-5.6-sol',
    'claude-sonnet-4-6': 'gpt-5.6-terra',
    'claude-sonnet-5':   'gpt-5.6-terra',
    'gemini-3.6-flash':  'gpt-5.6-luna',
    'gpt-5.6-sol':       'claude-opus-5',
    'gpt-5.6-terra':     'claude-sonnet-4-6',
    'gpt-5.6-luna':      'gemini-3.6-flash',
  };
  return map[primaryModel] || primaryModel;
}

function applyPreset(call, primaryFn) {
  // RAG (embeddings) e Geração de Conteúdo (TTS/Veo/serviços fixos) têm modelo
  // determinado pelo serviço, não pelo preset de qualidade da avaliação.
  if (call.fase === 'RAG' || call.fase === 'Geração de Conteúdo' || call.fase === 'Extração de Vídeo' || call.fase === 'Vídeo do Módulo-Base') return call.defaultModel;
  const primaryId = CHECK_PRIMARIES[call.id];
  if (primaryId) {
    const primaryCall = CALLS.find((c) => c.id === primaryId);
    if (primaryCall) return crossLlmCheck(primaryFn(primaryCall));
  }
  return primaryFn(call);
}

/**
 * Presets de modelos por uso. Todos aplicam pareamento cross-LLM nos checks
 * automaticamente — auditor sempre é de família diferente do primário.
 *   - premium: Opus 5 em tudo crítico, Sonnet 4.6 no resto.
 *   - balanced: Sonnet 4.6 no crítico, Gemini 3.6 Flash no resto.
 *   - cheap: Gemini 3.6 Flash em quase tudo, Sonnet 4.6 só em scorers finais.
 * Sonnet 5 ficou FORA dos defaults (piloto: tokens +40-68% e truncamento de
 * JSON — docs/CUSTO-QUALIDADE.md Resultado 3); segue selecionável nos dropdowns.
 */
export const PRESETS = {
  premium: {
    label: 'Premium (Opus 5)',
    desc: 'Máxima qualidade. Opus 5 em tudo crítico (avaliações, scorers), Sonnet 4.6 no resto. Checks em GPT 5.6 Sol/Terra (cross-família).',
    model: (call) => applyPreset(call, (c) => (c.critical ? 'claude-opus-5' : 'claude-sonnet-4-6')),
  },
  balanced: {
    label: 'Custo-benefício (Sonnet 4.6 + GPT 5.6 Terra)',
    desc: 'Sonnet 4.6 em todas as primárias (crítico e leve). Checks em GPT 5.6 Terra (cross-família). Sem Gemini Flash.',
    model: (call) => applyPreset(call, () => 'claude-sonnet-4-6'),
  },
  cheap: {
    label: 'Barata (Gemini Flash + Sonnet onde obrigatório)',
    desc: 'Gemini 3.6 Flash em tudo conversacional. Sonnet 4.6 apenas em scorers finais (sem 14, acumulada, IA4, proposta Radar). Checks pareados em GPT 5.6 Terra/Luna. Risco maior de erros pequenos.',
    model: (call) => applyPreset(call, (c) => {
      const mustBeSonnet = ['sem14-scorer', 'acumulada-primaria', 'ia4-avaliacao', 'radar-proposta-pdf'];
      if (mustBeSonnet.includes(c.id)) return 'claude-sonnet-4-6';
      return 'gemini-3.6-flash';
    }),
  },
};

/**
 * Calcula custo de uma chamada (input + output) × execuções × unidades.
 * @param call    item do CALLS
 * @param modelId id do modelo em MODELS
 * @param units   nº de unidades da scaleType (colabs / escolas Radar / leads / empresas)
 */
export function calcCost(call, modelId, units = 1) {
  const m = MODELS[modelId];
  if (!m) return null;
  const inTok = call.inTokens * call.exec * units;
  const outTok = call.outTokens * call.exec * units;
  // Custo de mídia fixo (ex.: render Veo) — independe de tokens.
  const flat = (call.flatUsd || 0) * call.exec * units;
  const tokenUsd = ((inTok / 1_000_000) * m.inUsd + (outTok / 1_000_000) * m.outUsd) * (call.costMultiplier || 1);
  const usd = tokenUsd + flat;
  return { usd, inTokens: inTok, outTokens: outTok, totalTokens: inTok + outTok };
}
