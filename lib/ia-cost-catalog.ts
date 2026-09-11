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

// Preços por 1M tokens (USD) — revisados em 10/09/2026 nas tabelas oficiais.
// Fontes: developers.openai.com/api/docs/pricing, ai.google.dev/gemini-api/docs/pricing,
// platform.claude.com/docs/en/about-claude/pricing e docs.voyageai.com/docs/pricing.
// Preço de lançamento com data de término fica marcado junto ao modelo: não se
// projeta o preço futuro dentro da conta atual.
export const MODELS = {
  // Anthropic
  'claude-opus-5':              { label: 'Claude Opus 5',       inUsd: 5,    outUsd: 25 },
  // Sonnet 5 a $2/$10 — preço PADRÃO, não introdutório. Conferido na doc oficial
  // de pricing em 12/08/2026, que declara textualmente: o intro anunciado até
  // 31/08/2026 "is now the standard price" e o aumento p/ $3/$15 em 01/09/2026
  // "will not occur". Qualquer conta que projetava "+X% quando acabar o intro"
  // está morta: o custo medido é o custo definitivo.
  // (Batch = 50% → $1/$5; cache read 0,1× → $0,20 — ambos saem dos multiplicadores.)
  'claude-sonnet-5':            { label: 'Claude Sonnet 5',      inUsd: 2,    outUsd: 10 },
  // ── Linhas históricas (ledger pré-ago/2026) — manter p/ custo retroativo ──
  'claude-opus-4-8':            { label: 'Claude Opus 4.8',     inUsd: 5,    outUsd: 25 },
  'claude-opus-4-7':            { label: 'Claude Opus 4.7',     inUsd: 5,    outUsd: 25 },
  'claude-opus-4-6':            { label: 'Claude Opus 4.6',     inUsd: 5,    outUsd: 25 },
  'claude-sonnet-4-6':          { label: 'Claude Sonnet 4.6',   inUsd: 3,    outUsd: 15 },
  'claude-haiku-4-5':          { label: 'Claude Haiku 4.5',    inUsd: 1,    outUsd: 5 },
  'claude-haiku-4-5-20251001': { label: 'Claude Haiku 4.5',    inUsd: 1,    outUsd: 5 },
  // Google
  // 3.8, 3.7 e 3.6 Flash estão no preço promocional oficial até 31/12/2026. A tabela
  // do Google anuncia $1,50/$7,50 a partir de 01/01/2027; revisar nessa data.
  'gemini-3.8-flash':      { label: 'Gemini 3.8 Flash',      inUsd: 0.75, outUsd: 3.75 },
  // Históricos + fallbacks de rollout: não remover enquanto houver linhas no ledger.
  'gemini-3.7-flash':      { label: 'Gemini 3.7 Flash',      inUsd: 0.75, outUsd: 3.75 },
  'gemini-3.6-flash':      { label: 'Gemini 3.6 Flash',      inUsd: 0.75, outUsd: 3.75 },
  'gemini-3.1-flash-lite':     { label: 'Gemini 3.1 Flash Lite',      inUsd: 0.25, outUsd: 1.50 },
  'gemini-3.5-flash':     { label: 'Gemini 3.5 Flash',      inUsd: 1.50, outUsd: 9 },
  'gemini-3.1-pro-preview': { label: 'Gemini 3.1 Pro',      inUsd: 2,    outUsd: 12 },
  'gemini-3.1-pro':       { label: 'Gemini 3.1 Pro',        inUsd: 2,    outUsd: 12 },
  // OpenAI
  'gpt-5.6-luna':               { label: 'GPT 5.6 Luna',        inUsd: 0.2,  outUsd: 1.2 },
  // Sol está no desconto oficial até 21/11/2026; revisar quando a promoção acabar.
  'gpt-5.6-sol':                { label: 'GPT 5.6 Sol',         inUsd: 4,    outUsd: 20 },
  'gpt-5.6-terra':              { label: 'GPT 5.6 Terra',       inUsd: 2,    outUsd: 12 },
  'gpt-5.5':                    { label: 'GPT 5.5',             inUsd: 5,    outUsd: 30 },
  'gpt-5.4':                    { label: 'GPT 5.4',             inUsd: 2.5,  outUsd: 15 },
  // Snapshot datado = o único id de 5.4 full que a chave do projeto acessa
  // (o alias puro retorna model_not_found desde ~jul/2026). Mesmo preço.
  'gpt-5.4-2026-03-05':         { label: 'GPT 5.4',             inUsd: 2.5,  outUsd: 15 },
  'gpt-5.4-mini':               { label: 'GPT 5.4 Mini',        inUsd: 0.75, outUsd: 4.5 },
  'gpt-5.1':                    { label: 'GPT 5.1 (fallback)',  inUsd: 1.25, outUsd: 10 },
  // Moonshot (provider kimi no ai-client). Reasoning: o out inclui o thinking.
  'kimi-k3':                    { label: 'Kimi K3',             inUsd: 3,    outUsd: 15, cacheReadUsd: 0.30 },
  // xAI (provider xai no ai-client). Preço LIDO da própria API em 24/08/2026
  // (`GET /v1/language-models`), não de tabela de terceiro: prompt 20000 e
  // completion 60000, na unidade de 1e-10 USD/token → $2 e $6 por 1M.
  // A xAI cobra o DOBRO quando o prompt alcança 200k tokens. O cálculo abaixo
  // seleciona a faixa longa para a requisição inteira, exatamente como a tabela
  // oficial: $4/$1/$12 (input/cache/output) em vez de $2/$0,50/$6.
  'grok-4.6':                   {
    label: 'Grok 4.6', inUsd: 2, outUsd: 6, cacheReadUsd: 0.50,
    longContextThresholdTokens: 200_000,
    longContextInUsd: 4, longContextCacheReadUsd: 1, longContextOutUsd: 12,
  },
  // ── Ligados em 25/08/2026 (rota em `lib/ai-provedores.ts`, chamada real 200) ──
  // Alibaba — Qwen3.8-Max (03/08/2026): 1M de contexto, multimodal, ~21 tok/s.
  // ⚠️ LENTO e VERBOSO: desqualificado para célula interativa, bom para lote.
  'qwen3.8-max':                { label: 'Qwen3.8 Max',         inUsd: 2,    outUsd: 6, cacheReadUsd: 0.25 },
  // Meta Superintelligence Labs — Muse Spark 1.3 (02/09/2026): 1M de contexto.
  // Id confirmado em 11/09/2026 no GET /v1/models da própria Meta Model API;
  // preço padrão mantido em $1,25/$4,25 e cache read em $0,15 por 1M.
  'muse-spark-1.3':             { label: 'Muse Spark 1.3',      inUsd: 1.25, outUsd: 4.25, cacheReadUsd: 0.15 },
  // Histórico do ledger anterior à troca para 1.3.
  // Muse Spark 1.2 (05/08/2026): 1M de contexto.
  // ⚠️ Modelo de RACIOCÍNIO, e o raciocínio sai DENTRO de `completion_tokens`:
  // medido em 25/08, gastou 125 tokens de raciocínio para responder "OK" — ou
  // seja, o custo real por tarefa é bem acima do que $4,25/1M sugere numa conta
  // feita só sobre o texto visível. Com teto apertado devolve 200 + conteúdo
  // VAZIO (por isso o `conteudoOuFalhaAlto` em ai-client).
  'muse-spark-1.2':             { label: 'Muse Spark 1.2',      inUsd: 1.25, outUsd: 4.25, cacheReadUsd: 0.15 },
  // Qwen usa aqui o cache implícito da rota internacional ($0,25/MTok). O cache
  // explícito de $0,17/MTok não é criado pelo wrapper atual. Spark usa o tier
  // standard (sem treinamento nos dados), cujo cache custa $0,15/MTok.
  // Embeddings (sem custo de output)
  'voyage-3-large':             { label: 'Voyage-3-large (embed)', inUsd: 0.18, outUsd: 0 },
  // TTS — por token. Input = texto; Output = tokens de áudio (custo dominante).
  'gemini-3.1-flash-tts':       { label: 'Gemini 3.1 Flash TTS (áudio)', inUsd: 1, outUsd: 20 },
  // ⚠️ O id que a API cobra tem o sufixo `-preview` (é o default de
  // `GEMINI_TTS_MODEL` em `lib/gemini-tts.ts`, e o `modelVersion` que a resposta
  // devolve). `costFromTokens` faz lookup EXATO: sem esta entrada, toda linha de
  // TTS no ledger nasceria com `cost_usd = null` — instrumentar o custo e não
  // conseguir somá-lo. A entrada sem sufixo fica porque é a que o catálogo de
  // features (`defaultModel`) referencia. Mesmo preço nas duas.
  // Medido em 29/08/2026, sonda nos dois backends: ~25 tok/s de áudio no Vertex,
  // ~32 tok/s no AI Studio, para o MESMO texto (~2,9s de fala).
  'gemini-3.1-flash-tts-preview': { label: 'Gemini 3.1 Flash TTS (áudio)', inUsd: 1, outUsd: 20 },
  // Produção desde 05/09/2026 (ver lib/gemini-tts.ts): GA, metade do preço do 3.1 e
  // SEM a deriva medida. `gemini-2.5-flash-tts` é o id do Vertex; o `-preview-tts` é
  // o do AI Studio — os dois precisam existir aqui porque o lookup é EXATO.
  'gemini-2.5-flash-tts':         { label: 'Gemini 2.5 Flash TTS (áudio)', inUsd: 0.5, outUsd: 10 },
  'gemini-2.5-flash-preview-tts': { label: 'Gemini 2.5 Flash TTS (áudio)', inUsd: 0.5, outUsd: 10 },
  'gemini-2.5-pro-tts':           { label: 'Gemini 2.5 Pro TTS (áudio)', inUsd: 1, outUsd: 20 },
};

export const MODEL_IDS = Object.keys(MODELS);

/**
 * Modelos de texto homologados para comparação manual no centro FinOps.
 * O catálogo completo continua acima para precificar histórico, embeddings,
 * TTS e fallbacks; eles não precisam poluir o seletor de cenários.
 */
export const COST_SIMULATOR_MODEL_IDS = [
  'claude-sonnet-5',
  'claude-opus-5',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'muse-spark-1.3',
  'gemini-3.8-flash',
  'kimi-k3',
] as const satisfies ReadonlyArray<keyof typeof MODELS>;

type ModelPrice = {
  label: string;
  inUsd: number;
  outUsd: number;
  cacheReadUsd?: number;
  cacheWriteUsd?: number;
  longContextThresholdTokens?: number;
  longContextInUsd?: number;
  longContextCacheReadUsd?: number;
  longContextOutUsd?: number;
};

/**
 * A Responses API cobra a busca web separadamente dos tokens do modelo:
 * US$ 10 / 1.000 chamadas. O wrapper soma esta parcela no ledger a partir dos
 * itens `web_search_call` realmente devolvidos — uma resposta sem busca custa 0.
 */
export const OPENAI_WEB_SEARCH_USD_PER_CALL = 10 / 1000;

export function openAIWebSearchToolCost(output: unknown): number {
  if (!Array.isArray(output)) return 0;
  const calls = output.filter((item) => item && typeof item === 'object' && (item as any).type === 'web_search_call').length;
  return calls * OPENAI_WEB_SEARCH_USD_PER_CALL;
}

/**
 * Custo em USD a partir de tokens REAIS (ledger de IA). Fonte única usada pelo
 * wrapper (callAI) e pelo batch. Cache usa a tarifa específica do modelo quando
 * declarada; nos demais, read = 0,1× input e write = 1,25× (TTL 5min). Modelos
 * com tarifa por contexto escolhem a faixa pela soma dos tokens de prompt.
 * Batch API = −50%: passe `batch: true`. Retorna null se o modelo não está no
 * catálogo (a linha do ledger fica sem custo, sinalizando gap).
 */
export function costFromTokens(
  modelId: string,
  t: { inTokens: number; outTokens: number; cacheRead?: number; cacheWrite?: number },
  opts: { batch?: boolean } = {},
): number | null {
  const m = (MODELS as Record<string, ModelPrice>)[modelId];
  if (!m) return null;
  const promptTokens = t.inTokens + (t.cacheRead || 0) + (t.cacheWrite || 0);
  const longContext = m.longContextThresholdTokens !== undefined
    && promptTokens >= m.longContextThresholdTokens;
  const inputRate = longContext ? (m.longContextInUsd ?? m.inUsd) : m.inUsd;
  const outputRate = longContext ? (m.longContextOutUsd ?? m.outUsd) : m.outUsd;
  const cacheReadRate = longContext
    ? (m.longContextCacheReadUsd ?? m.cacheReadUsd ?? inputRate * 0.1)
    : (m.cacheReadUsd ?? inputRate * 0.1);
  const cacheWriteRate = m.cacheWriteUsd ?? inputRate * 1.25;
  const usd =
    (t.inTokens * inputRate +
      t.outTokens * outputRate +
      (t.cacheRead || 0) * cacheReadRate +
      (t.cacheWrite || 0) * cacheWriteRate) / 1_000_000;
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
    escala: { porCompetencia: 1 },
    taskKey: 'ia4_avaliacao',
    fase: 'Diagnóstico',
    scaleType: 'colab',
    nome: 'IA4 — Avaliação de cenários A',
    descricao: 'Avalia respostas aos cenários iniciais. Média real de 90 dias no Sonnet 5 (10/09/2026); uma execução por competência.',
    inTokens: 3060,
    outTokens: 11570,
    cacheReadTokens: 2670,
    cacheWriteTokens: 320,
    exec: 2,
    defaultModel: 'claude-sonnet-5',
    critical: true,
  },
  {
    id: 'ia4-check',
    escala: { porCompetencia: 1 },
    taskKey: 'ia4_check',
    fase: 'Diagnóstico',
    scaleType: 'colab',
    nome: 'Check IA4 (auditoria 2ª IA)',
    descricao: 'Auditor cross-LLM que verifica se IA4 foi defensável. Média real de 90 dias no Terra (10/09/2026).',
    inTokens: 8120,
    outTokens: 1610,
    cacheReadTokens: 2380,
    exec: 2,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.ia4_check)
    critical: true,
  },

  // ── PERFIL DISC (uma vez por colab, cacheado 30 dias) ──
  {
    id: 'relatorio-disc-textos',
    escala: { porCiclo: 1 },
    taskKey: 'relatorio_comportamental',
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
    escala: { porCiclo: 1 },
    taskKey: 'insights_executivos',
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
    escala: { porSemanaConteudo: 1 },
    taskKey: 'temporada_desafio',
    fase: 'Geração Temporada',
    scaleType: 'colab',
    nome: 'Desafio semanal (conteúdo)',
    descricao: 'Gera texto do desafio pra cada semana de conteúdo.',
    inTokens: 600,
    outTokens: 200,
    exec: 9,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'missao',
    escala: { porMissao: 1 },
    taskKey: 'temporada_cenario',
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
    escala: { porMissao: 1 },
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
    escala: { porSemanaConteudo: 6 },
    taskKey: 'evidencias_socratic',
    fase: 'Temporada',
    scaleType: 'colab',
    nome: 'Evidências (mentor socrático)',
    descricao: 'Conversa de reflexão semanal, com grounding RAG. Média real de 90 dias no Sonnet 4.6 (10/09/2026).',
    inTokens: 1010,
    outTokens: 75,
    cacheReadTokens: 650,
    cacheWriteTokens: 290,
    exec: 6 * 9,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'evidencias-extracao',
    escala: { porSemanaConteudo: 1 },
    taskKey: 'temporada_extracao',
    fase: 'Temporada',
    scaleType: 'colab',
    nome: 'Extração estruturada (por sem)',
    descricao: 'Extrai insight, qualidade, desafio_realizado do transcript.',
    inTokens: 1500,
    outTokens: 400,
    exec: 9,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'tira-duvidas',
    escala: { porSemanaConteudo: 3 },
    taskKey: 'tira_duvidas',
    fase: 'Temporada',
    scaleType: 'colab',
    nome: 'Tira-Dúvidas',
    descricao: 'Chat reativo com colab (média 3 perguntas/sem). Contexto: definição do descritor + conteúdo recebido na semana (corpo do micro-conteúdo) + Módulo-Base + grounding RAG. Modelo Sonnet 4.6.',
    inTokens: 4200,
    outTokens: 400,
    exec: 3 * 9,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'beto-mentor',
    escala: { porCiclo: 10 },
    taskKey: 'beto',
    fase: 'Temporada',
    scaleType: 'colab',
    nome: 'BETO — mentor (dashboard)',
    descricao: 'Chat mentor no painel do colab. Uso opcional/variável (~10 mensagens/ciclo); tokens e cache pela média real de 90 dias (10/09/2026).',
    inTokens: 130,
    outTokens: 100,
    cacheReadTokens: 1600,
    cacheWriteTokens: 950,
    exec: 10,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
    opcional: true,
  },

  // ── EMBEDDING (grounding RAG) ──
  {
    id: 'rag-query-embed',
    escala: { porSemanaConteudo: 10, porMissao: 10, porCiclo: 3 },
    fase: 'RAG',
    scaleType: 'colab',
    nome: 'Embedding de query (grounding)',
    descricao: 'Vetoriza cada query antes do kb_search_hybrid. 1 call por chamada com grounding (tira-dúvidas + evidências + missão + relatórios).',
    inTokens: 100,
    outTokens: 0,
    exec: 10 * 9 + 10 * 3 + 3,
    defaultModel: 'voyage-3-large',
    critical: false,
  },

  // ── TEMPORADA — MISSÃO PRÁTICA (sems 4/8/12) ──
  {
    id: 'missao-feedback',
    escala: { porMissao: 10 },
    taskKey: 'temporada_feedback',
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
    escala: { porMissao: 1 },
    taskKey: 'temporada_extracao',
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
    escala: { porQualitativa: 12 },
    taskKey: 'sem13_qualitativa',
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
    escala: { porQualitativa: 1 },
    taskKey: 'temporada_extracao',
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
    escala: { porCiclo: 1 },
    taskKey: 'acumulada_primaria',
    fase: 'Acumulada',
    scaleType: 'colab',
    nome: 'IA Acumuladora (nota por descritor)',
    descricao: 'Lê as evidências agregadas e pontua 1-4 por descritor. Média real de 90 dias no Sonnet 4.6 (10/09/2026).',
    inTokens: 6060,
    outTokens: 3230,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'acumulada-check',
    escala: { porCiclo: 1 },
    taskKey: 'acumulada_check',
    fase: 'Acumulada',
    scaleType: 'colab',
    nome: 'Check Acumuladora (auditoria)',
    descricao: 'Auditor cross-LLM em 4 dimensões. Média real de 90 dias no Terra (10/09/2026).',
    inTokens: 5140,
    outTokens: 1780,
    exec: 1,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.acumulada_check)
    critical: true,
  },

  // ── SEM 14 ──
  {
    id: 'sem14-scorer',
    escala: { porCiclo: 1 },
    taskKey: 'sem14_scorer',
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
    escala: { porCiclo: 1 },
    taskKey: 'sem14_check',
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
    escala: { porCiclo: 1 },
    taskKey: 'pdi_individual',
    fase: 'Relatórios',
    scaleType: 'colab',
    nome: 'PDI Individual',
    descricao: 'Plano de desenvolvimento individual. Média real de 90 dias no Sonnet 5 (10/09/2026).',
    inTokens: 3880,
    outTokens: 5820,
    cacheReadTokens: 2530,
    cacheWriteTokens: 690,
    exec: 1,
    defaultModel: 'claude-sonnet-5',
    critical: false,
    opcional: true,
  },
  {
    id: 'pdi-check',
    escala: { porCiclo: 1 },
    taskKey: 'pdi_check',
    fase: 'Relatórios',
    scaleType: 'colab',
    nome: 'PDI Individual — auditoria Dual-IA',
    descricao: 'Auditoria semântica cross-LLM que acompanha cada PDI. Média real de 90 dias no Terra (10/09/2026).',
    inTokens: 6500,
    outTokens: 1730,
    exec: 1,
    defaultModel: 'gpt-5.6-terra',
    critical: true,
    opcional: true,
  },
  {
    id: 'relatorio-individual',
    escala: { porCiclo: 1 },
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
    taskKey: 'conteudo_tags',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'Tagging IA — banco de conteúdos',
    descricao: 'Sparkles em /admin/conteudos sugere competência/descritor/cargo por conteúdo importado do Bunny ou criado manual.',
    inTokens: 1500,
    outTokens: 400,
    exec: 50,
    defaultModel: 'gemini-3.8-flash',
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
    taskKey: 'ia1_top10',
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
    taskKey: 'ia2_gabarito',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'IA2 — Gabarito',
    descricao: 'Gera descrição enriquecida de cada competência do Top 5. Média real de 90 dias no Sonnet 4.6 (10/09/2026).',
    inTokens: 2170,
    outTokens: 5110,
    cacheReadTokens: 2750,
    cacheWriteTokens: 800,
    exec: 4 * 5,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'ia3-cenarios',
    taskKey: 'ia3_cenarios',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'IA3 — Cenários A (gerador)',
    descricao: '5 cenários A por cargo × competência. Média real de 90 dias no Sonnet 4.6 (10/09/2026).',
    inTokens: 3230,
    outTokens: 2910,
    cacheReadTokens: 1400,
    cacheWriteTokens: 290,
    exec: 4 * 5,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'ia3-cenarios-check',
    taskKey: 'ia3_check',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'IA3 — Cenários A (check)',
    descricao: 'Auditor cross-LLM dos cenários A. Média real de 90 dias no Terra (10/09/2026).',
    inTokens: 2610,
    outTokens: 1420,
    cacheReadTokens: 90,
    exec: 4 * 5,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.ia3_check)
    critical: false,
  },
  {
    id: 'cenarios-b',
    taskKey: 'cenarios_b',
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
    taskKey: 'cenarios_b_check',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'Cenários B (check)',
    descricao: 'Auditor cross-LLM dos cenários B. Média real de 90 dias no Terra (10/09/2026).',
    inTokens: 2990,
    outTokens: 1550,
    exec: 4 * 5,
    defaultModel: 'gpt-5.6-terra', // 22/07: todas as checagens no Terra (DEFAULT_TASK_MODELS.cenarios_b_check)
    critical: false,
  },

  // ── GERAÇÃO DE CONTEÚDO (biblioteca micro_conteudos, reusada entre colabs) ──
  // Escala por PEÇA autorada. units = nº de conteúdos daquele formato.
  {
    id: 'conteudo-texto',
    taskKey: 'conteudo_texto',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Artigo (texto) — geração',
    descricao: 'Gera artigo markdown por competência×descritor×nível. Média real de 90 dias no Sonnet 4.6 (10/09/2026).',
    inTokens: 3250,
    outTokens: 2970,
    cacheWriteTokens: 2770,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'conteudo-case',
    taskKey: 'conteudo_case',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Estudo de caso — geração',
    descricao: 'Gera case narrativo. Média real de 90 dias no Sonnet 4.6 (10/09/2026).',
    inTokens: 3420,
    outTokens: 2450,
    cacheReadTokens: 30,
    cacheWriteTokens: 3060,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'conteudo-expansao-pdf',
    taskKey: 'conteudo_expansao_pdf',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'PDF — expansão editorial condicional',
    descricao: 'Roda quando texto/case fica abaixo do mínimo do PDF. Média real de 52 chamadas em 90 dias (10/09/2026); incluída como premissa conservadora de 1× por peça.',
    inTokens: 2610,
    outTokens: 3780,
    cacheReadTokens: 1370,
    cacheWriteTokens: 1840,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
    opcional: true,
  },
  {
    id: 'conteudo-layout-plan',
    taskKey: 'conteudo_layout_plan',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'PDF — plano editorial e paginação',
    descricao: 'Planeja o layout de cada texto/case antes do render. Média real de 536 chamadas em 90 dias (10/09/2026).',
    inTokens: 3770,
    outTokens: 665,
    cacheReadTokens: 1460,
    cacheWriteTokens: 1380,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'conteudo-podcast-roteiro',
    taskKey: 'conteudo_podcast',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Podcast — roteiro (LLM)',
    descricao: 'Gera roteiro de podcast (3-5 min). Média real de 90 dias no Sonnet 4.6 (10/09/2026).',
    inTokens: 4270,
    outTokens: 2140,
    cacheWriteTokens: 3070,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'conteudo-podcast-tts',
    taskKey: 'tts_podcast',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Podcast — síntese de voz (TTS)',
    descricao: 'Áudio MP3 (~3-4 min), voz Aoede no Gemini 2.5 Flash. Retakes agora rodam em série, só após reprovação; calibração de 143 takes projeta 1,22 tentativa média (máx. 3), ~US$ 0,06/episódio.',
    inTokens: 750,
    outTokens: 5250,
    exec: 1.22,
    defaultModel: 'gemini-2.5-flash-tts',
    critical: false,
  },
  {
    id: 'conteudo-podcast-personalizado-tts',
    taskKey: 'tts_podcast_personalizado',
    escala: { porSemanaConteudo: 1.22 },
    fase: 'Geração de Conteúdo',
    scaleType: 'colab',
    nome: 'Podcast personalizado — síntese sob demanda (TTS)',
    descricao: 'Podcast com o nome da pessoa, gerado ao abrir a pílula sem cache. Aoede/2.5 Flash; retakes em série e expectativa calibrada de 1,22 tentativa por episódio (máx. 3).',
    inTokens: 800,
    outTokens: 5500,
    exec: 11,
    defaultModel: 'gemini-2.5-flash-tts',
    critical: false,
  },
  {
    id: 'conteudo-podcast-pregerado-tts',
    taskKey: 'tts_podcast_pregerado',
    escala: { porSemanaConteudo: 1.22 },
    fase: 'Geração de Conteúdo',
    scaleType: 'colab',
    nome: 'Podcast personalizado — pré-aquecido em lote (TTS)',
    descricao: 'O mesmo áudio, gerado antes pela rota de pré-aquecimento. Retakes em série; expectativa calibrada de 1,22 tentativa por episódio. Substitui a linha sob demanda quando habilitado.',
    inTokens: 800,
    outTokens: 5500,
    exec: 11,
    defaultModel: 'gemini-2.5-flash-tts',
    critical: false,
    opcional: true,
  },
  {
    id: 'devolutiva-tts',
    taskKey: 'tts_devolutiva',
    escala: { porCiclo: 2.4 },
    fase: 'Diagnóstico',
    scaleType: 'colab',
    nome: 'Devolutiva comportamental em áudio (TTS, voz do Beto)',
    descricao: 'Áudio DISC (~3-4 min), voz Algieba no 2.5 Flash desde 07/09. Retakes em série; calibração do uso longo projeta 2,4 tentativas médias (máx. 5), ~US$ 0,08 por devolutiva.',
    inTokens: 500,
    outTokens: 3300,
    exec: 2.4,
    defaultModel: 'gemini-2.5-flash-tts',
    critical: false,
  },
  // (Fluxo de vídeo via Veo descontinuado — substituído pela fase "Vídeo do
  //  Módulo-Base" abaixo, com avatar HeyGen + Remotion.)
  {
    id: 'conteudo-personalizacao',
    taskKey: 'conteudo_personalizacao',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Personalização DISC+PPP (PDF)',
    descricao: 'Camada extra por conteúdo × arquétipo DISC. Média real de 90 dias no Sonnet 4.6 (10/09/2026); exec=4 arquétipos.',
    inTokens: 3830,
    outTokens: 610,
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
    taskKey: 'conteudo_video',
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
    taskKey: 'tts_video_cena',
    fase: 'Vídeo do Módulo-Base',
    scaleType: 'video_gerado',
    nome: 'Narração do vídeo (TTS, take único)',
    descricao: 'Desde 06/09/2026 o roteiro inteiro é UMA chamada (2.5 Flash, Aoede) cortada nas cenas pelo alinhamento (antes: 14-21 chamadas por cena no 3.1, US$ 0,10-0,13 por vídeo). Medido em 5 gerações de 06/09: US$ 0,046-0,050 quando o portão aprova o 1º take (3 de 5), US$ 0,094 quando refaz (2 de 5) → ~US$ 0,07 por vídeo. Fora do TTS o custo do vídeo não mudou: o HeyGen (US$ 0,47) domina.',
    inTokens: 0,
    outTokens: 0,
    flatUsd: 0.07,
    exec: 1,
    defaultModel: 'gemini-2.5-flash-tts',
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
    defaultModel: 'gemini-3.8-flash',
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
    taskKey: 'modulo_base_autor',
    fase: 'Extração de Vídeo',
    scaleType: 'extracao',
    nome: 'Estruturação dos 4 blocos (IA-autora)',
    descricao: 'Estrutura o texto-base no Módulo-Base. Média real de 90 dias no Sonnet 4.6 (10/09/2026).',
    inTokens: 14580,
    outTokens: 9700,
    cacheReadTokens: 610,
    cacheWriteTokens: 490,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'extracao-auditor',
    taskKey: 'modulo_base_auditor',
    fase: 'Extração de Vídeo',
    scaleType: 'extracao',
    nome: 'Auditoria Dual-IA (ao submeter à revisão)',
    descricao: 'IA-auditora no Terra valida os 4 blocos ao submeter à revisão. Média real de 90 dias (10/09/2026); opcional.',
    inTokens: 7440,
    outTokens: 790,
    cacheReadTokens: 1210,
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
    descricao: 'Gera resumo executivo + 3 pontos críticos com competência Vertho + leitura SAEB/infra/recursos pra PDF do lead. Worker QStash + provedor central de e-mail. Cache por dadosHash.',
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
 * Tarefas observadas que ainda NÃO têm denominador seguro para orçamento
 * (por pessoa, empresa, peça etc.). Elas entram apenas na comparação por
 * chamada do ledger. Médias ponderadas dos últimos 90 dias em 10/09/2026;
 * amostra mínima de 5 chamadas. Assim a tela ganha cobertura sem inventar uma
 * frequência e contaminar o total prospectivo.
 */
export const TASK_ONLY_ESTIMATES = [
  { taskKey: 'sim_aluno', inTokens: 1008, outTokens: 140, cacheReadTokens: 470, cacheWriteTokens: 0, sampleCalls: 2630 },
  { taskKey: 'copiloto_ao_vivo', inTokens: 1097, outTokens: 200, cacheReadTokens: 578, cacheWriteTokens: 0, sampleCalls: 2099 },
  { taskKey: 'kit_desafio_semana', inTokens: 1622, outTokens: 418, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 313 },
  { taskKey: 'recepcao_paciente', inTokens: 407, outTokens: 86, cacheReadTokens: 1550, cacheWriteTokens: 408, sampleCalls: 272 },
  { taskKey: 'blueprint_gerar', inTokens: 820, outTokens: 13979, cacheReadTokens: 3775, cacheWriteTokens: 604, sampleCalls: 220 },
  { taskKey: 'recepcao_avaliacao', inTokens: 794, outTokens: 2521, cacheReadTokens: 2316, cacheWriteTokens: 907, sampleCalls: 210 },
  { taskKey: 'blueprint_audit', inTokens: 4985, outTokens: 1765, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 168 },
  { taskKey: 'escola_brief', inTokens: 790, outTokens: 221, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 145 },
  { taskKey: 'kit_desafio', inTokens: 1376, outTokens: 343, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 68 },
  { taskKey: 'devolutiva_comportamental', inTokens: 1616, outTokens: 943, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 34 },
  { taskKey: 'kit_nucleo', inTokens: 1186, outTokens: 394, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 25 },
  { taskKey: 'copiloto_pesquisa_empresa', inTokens: 27691, outTokens: 4529, cacheReadTokens: 1629, cacheWriteTokens: 0, flatUsd: OPENAI_WEB_SEARCH_USD_PER_CALL, sampleCalls: 22 },
  { taskKey: 'copiloto_pesquisa_noticias_externas', inTokens: 32418, outTokens: 2230, cacheReadTokens: 1257, cacheWriteTokens: 0, flatUsd: OPENAI_WEB_SEARCH_USD_PER_CALL, sampleCalls: 22 },
  { taskKey: 'copiloto_planejamento', inTokens: 7462, outTokens: 3390, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 22 },
  { taskKey: 'copiloto_pesquisa_social_oficial', inTokens: 17083, outTokens: 1777, cacheReadTokens: 1455, cacheWriteTokens: 0, flatUsd: OPENAI_WEB_SEARCH_USD_PER_CALL, sampleCalls: 19 },
  { taskKey: 'arguicao_turno', inTokens: 4720, outTokens: 516, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 14 },
  { taskKey: 'copiloto_pesquisa_pessoa', inTokens: 18433, outTokens: 664, cacheReadTokens: 2121, cacheWriteTokens: 0, flatUsd: OPENAI_WEB_SEARCH_USD_PER_CALL, sampleCalls: 7 },
  { taskKey: 'descritor_reancoragem', inTokens: 1174, outTokens: 534, cacheReadTokens: 0, cacheWriteTokens: 0, sampleCalls: 6 },
  { taskKey: 'copiloto_pesquisa_pessoas', inTokens: 33253, outTokens: 1108, cacheReadTokens: 1485, cacheWriteTokens: 0, flatUsd: OPENAI_WEB_SEARCH_USD_PER_CALL, sampleCalls: 5 },
];

export const TASK_ESTIMATE_KEYS = [
  ...new Set([
    ...CALLS.map((call: any) => call.taskKey).filter(Boolean),
    ...TASK_ONLY_ESTIMATES.map((task) => task.taskKey),
  ]),
];

/**
 * Mapa check → primary. Cada par é dual-IA: o primário gera, o check audita.
 * Os presets aplicam pareamento cross-família automaticamente via crossLlmCheck.
 */
const CHECK_PRIMARIES = {
  'ia4-check': 'ia4-avaliacao',
  'pdi-check': 'pdi',
  'acumulada-check': 'acumulada-primaria',
  'sem14-check': 'sem14-scorer',
  'ia3-cenarios-check': 'ia3-cenarios',
  'cenarios-b-check': 'cenarios-b',
};

/**
 * Pareia modelo primário ao auditor de FAMÍLIA DIFERENTE com força similar.
 * Garante que o auditor não compartilhe vieses do primário.
 *   Sonnet 4.6/5    ↔ GPT 5.6 Terra
 *   Gemini 3.8 Flash ↔ GPT 5.6 Luna
 *   Opus 5 / Sol    ↔ GPT 5.6 Sol / Opus 5
 */
function crossLlmCheck(primaryModel) {
  const map = {
    'claude-opus-5':     'gpt-5.6-sol',
    'claude-sonnet-4-6': 'gpt-5.6-terra',
    'claude-sonnet-5':   'gpt-5.6-terra',
    'gemini-3.8-flash':  'gpt-5.6-luna',
    'gemini-3.7-flash':  'gpt-5.6-luna',
    'gemini-3.6-flash':  'gpt-5.6-luna',
    'gpt-5.6-sol':       'claude-opus-5',
    'gpt-5.6-terra':     'claude-sonnet-4-6',
    'gpt-5.6-luna':      'gemini-3.8-flash',
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
 *   - balanced: Sonnet 4.6 em primárias; checks em GPT 5.6 Terra.
 *   - cheap: Gemini 3.8 Flash em quase tudo, Sonnet 4.6 só em scorers finais.
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
    desc: 'Gemini 3.8 Flash em tudo conversacional. Sonnet 4.6 apenas em scorers finais (sem 14, acumulada, IA4, proposta Radar). Checks pareados em GPT 5.6 Terra/Luna. Risco maior de erros pequenos.',
    model: (call) => applyPreset(call, (c) => {
      const mustBeSonnet = ['sem14-scorer', 'acumulada-primaria', 'ia4-avaliacao', 'radar-proposta-pdf'];
      if (mustBeSonnet.includes(c.id)) return 'claude-sonnet-4-6';
      return 'gemini-3.8-flash';
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
  const cacheReadTok = (call.cacheReadTokens || 0) * call.exec * units;
  const cacheWriteTok = (call.cacheWriteTokens || 0) * call.exec * units;
  // Custo de mídia fixo (ex.: render Veo) — independe de tokens.
  const flat = (call.flatUsd || 0) * call.exec * units;
  // Cache write premium é uma operação explícita do Claude. Se o operador troca
  // a linha para outro provedor, esses tokens continuam sendo prompt, mas entram
  // como input normal; cache read usa a tarifa própria declarada em MODELS.
  const cacheWriteExplicito = modelId.startsWith('claude-') ? cacheWriteTok : 0;
  const inputSemCacheWrite = inTok + (modelId.startsWith('claude-') ? 0 : cacheWriteTok);
  const tokenBase = costFromTokens(modelId, {
    inTokens: inputSemCacheWrite,
    outTokens: outTok,
    cacheRead: cacheReadTok,
    cacheWrite: cacheWriteExplicito,
  }) || 0;
  const tokenUsd = tokenBase * (call.costMultiplier || 1);
  const usd = tokenUsd + flat;
  const totalInputTokens = inTok + cacheReadTok + cacheWriteTok;
  return {
    usd,
    inTokens: totalInputTokens,
    outTokens: outTok,
    cacheReadTokens: cacheReadTok,
    cacheWriteTokens: cacheWriteTok,
    totalTokens: totalInputTokens + outTok,
  };
}

/**
 * Estimativa de UMA chamada no modelo que aparece naquela linha do ledger.
 * Para tarefas escaláveis usa o catálogo prospectivo; para as demais usa a
 * média observada, sem fazê-las entrar nos totais de orçamento.
 */
export function custoEstimadoPorTask(taskKey: string, modelId: string): number | null {
  const escalaveis = CALLS.filter((call: any) => call.taskKey === taskKey && call.exec > 0);
  if (escalaveis.length > 0) {
    const custos = escalaveis
      .map((call) => {
        const custo = calcCost(call, modelId, 1);
        return custo ? custo.usd / call.exec : null;
      })
      .filter((custo): custo is number => custo !== null);
    return custos.length > 0 ? custos.reduce((soma, custo) => soma + custo, 0) / custos.length : null;
  }

  const observado = TASK_ONLY_ESTIMATES.find((task) => task.taskKey === taskKey);
  if (!observado) return null;
  return calcCost({ ...observado, exec: 1 }, modelId, 1)?.usd ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTO POR JORNADA — o mesmo catálogo lido pelas DIMENSÕES de cada modo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O `exec` de cada chamada `scaleType: 'colab'` é o número da jornada de
 * REFERÊNCIA (Regular DUO). Ele não serve para os outros modos: uma trilha de 7
 * semanas com 1 competência não paga o mesmo que uma de 14 com 2.
 *
 * Por isso cada chamada declara também `escala`: de que DIMENSÃO do programa o
 * `exec` depende. As dimensões saem de `lib/season-engine/programa-config.ts` —
 * a mesma constante que a engine usa para montar a trilha —, então mudar um modo
 * lá move o custo aqui sem ninguém reeditar número nenhum.
 *
 * `call.exec` é a referência do Regular DUO atual (9 semanas de conteúdo, 3
 * missões e 2 competências). `execNaJornada` recalcula as outras jornadas a
 * partir das dimensões reais, sem herdar números de desenhos antigos.
 */
export function execNaJornada(call, cfg) {
  const e = call.escala;
  if (!e) return call.exec;
  const semanasConteudo = cfg.slotsConteudo?.length || 0;
  const missoes = cfg.semanasMissao?.length || 0;
  const competencias = cfg.numCompetencias || 1;
  // Conversa qualitativa dedicada existe só onde o fechamento ocupa mais de uma
  // semana (Regular/DUO = [13, 14]). Piloto, Onboarding e Jornada fecham numa
  // semana só e não têm essa conversa — ver os comentários de cada PROGRAMA_*.
  const temQualitativa = (cfg.semanasAvaliacao?.length || 0) > 1 ? 1 : 0;
  return (
    (e.porSemanaConteudo || 0) * semanasConteudo +
    (e.porMissao || 0) * missoes +
    (e.porCompetencia || 0) * competencias +
    (e.porQualitativa || 0) * temQualitativa +
    (e.porCiclo || 0)
  );
}

/**
 * Custo de IA de UM colaborador na jornada descrita por `cfg`, no preset dado.
 * `incluirOpcionais: false` deixa de fora o que só roda sob demanda (BETO, PDI,
 * relatório legado) — útil para o piso da conta.
 */
export function custoColabNaJornada(cfg, modelFn, opts: { incluirOpcionais?: boolean } = {}) {
  const incluirOpcionais = opts.incluirOpcionais !== false;
  let usd = 0;
  const linhas: { id: string; nome: string; exec: number; usd: number }[] = [];
  for (const call of CALLS) {
    if (call.scaleType !== 'colab') continue;
    if (!incluirOpcionais && (call as any).opcional) continue;
    const exec = execNaJornada(call, cfg);
    if (exec <= 0) continue;
    const c = calcCost({ ...call, exec }, modelFn(call), 1);
    if (!c) continue;
    usd += c.usd;
    linhas.push({ id: call.id, nome: call.nome, exec, usd: c.usd });
  }
  return { usd, linhas };
}

/**
 * Infra fixa da PLATAFORMA — custo de existir, rateado entre todos os tenants.
 * Não entra no custo por empresa nem por colaborador: uma empresa nova de 100
 * pessoas quase não move estes números.
 *
 * Faixas conferidas em 10/09/2026 contra o que o projeto usa hoje. Não saem de
 * fatura: são a ordem de grandeza declarada, e é assim que devem ser lidas.
 */
export const INFRA_FIXA = [
  { servico: 'Vercel', papel: 'Hospedagem Next.js + crons', tipo: 'fixo', usdMes: [20, 20] },
  { servico: 'Supabase', papel: 'Postgres + Auth + Storage', tipo: 'fixo', usdMes: [25, 25] },
  { servico: 'WhatsApp Cloud API', papel: 'Cadência oficial (por conversa)', tipo: 'uso', usdMes: [0, 30] },
  { servico: 'Z-API', papel: 'WhatsApp legado (1 número)', tipo: 'fixo/número', usdMes: [20, 30] },
  { servico: 'Trigger.dev', papel: 'Jobs de fundo (vídeo, lotes)', tipo: 'uso', usdMes: [0, 20] },
  { servico: 'Hetzner', papel: 'Render Remotion (CX33 efêmero)', tipo: 'uso', usdMes: [1, 5] },
  { servico: 'HeyGen', papel: 'Avatar falante (se usar vídeo)', tipo: 'assinatura+uso', usdMes: [29, 89] },
  { servico: 'Bunny Stream', papel: 'Hosting/CDN de vídeo', tipo: 'uso', usdMes: [1, 10] },
  { servico: 'Sentry', papel: 'Erros em produção', tipo: 'free/fixo', usdMes: [0, 26] },
  { servico: 'Upstash QStash', papel: 'Fila de disparos', tipo: 'uso', usdMes: [0, 5] },
  { servico: 'Amazon SES / Resend', papel: 'E-mail transacional', tipo: 'uso/fallback', usdMes: [0, 20] },
  { servico: 'Gamma + domínio', papel: 'Site institucional + DNS', tipo: 'fixo', usdMes: [1, 12] },
];

/**
 * Integrações reais cujo preço depende de plano/fatura/uso ainda não conciliado.
 * Ficam visíveis na tela, mas FORA do total: zero inventado seria tão enganoso
 * quanto omiti-las, e uma faixa sem evidência contaminaria o orçamento inteiro.
 */
export const INFRA_NAO_PRECIFICADA = [
  { servico: 'Twilio SMS', papel: 'Fallback de OTP por SMS', motivo: 'custo por país/número; conciliar a fatura quando houver envio' },
  { servico: 'WaSender', papel: 'Failover do WhatsApp legado', motivo: 'assinatura depende da sessão efetivamente habilitada' },
  { servico: 'Jina / Firecrawl', papel: 'Scraping de PPP e pesquisa pública', motivo: 'free tier + fallback pago; falta conciliação do plano/uso' },
];

export function infraFixaTotal() {
  return INFRA_FIXA.reduce(
    (acc, s) => ({ min: acc.min + s.usdMes[0], max: acc.max + s.usdMes[1] }),
    { min: 0, max: 0 },
  );
}
