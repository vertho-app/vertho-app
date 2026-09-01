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
 *   - 'reuniao'       → escala por reunião comercial do Copiloto PACE (pesquisa
 *                       + planejamento + leitura ao vivo + memória; o áudio entra
 *                       por Whisper LOCAL, sidecar sem custo de API)
 *   - 'simulacao'     → escala por colaborador SIMULADO no Simulador (ensaios de
 *                       pipeline/QA — custo de operação interna, não de cliente)
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
  // 3.7 Flash (lançado 13/08/2026). Preço LIDO da Artificial Analysis em
  // 25/08/2026: $0,75 in / $3,75 out, cached input com 90% de desconto — que é
  // exatamente o 0,1× que `costFromTokens` já aplica em cacheRead.
  // ⚠️ Uma fonte secundária afirma que este é preço INTRODUTÓRIO até 31/12/2026,
  // subindo para $1,50/$7,50 em janeiro. NÃO confirmado na doc oficial do Google
  // nem na AA. Fica registrado como pendência, não como fato: a lição do Sonnet 5
  // aqui embaixo é que projeção de mudança de preço envelhece mal nos dois
  // sentidos. Conferir na fonte oficial antes de qualquer conta de 2027.
  'gemini-3.7-flash':      { label: 'Gemini 3.7 Flash',      inUsd: 0.75, outUsd: 3.75 },
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
  // xAI (provider xai no ai-client). Preço LIDO da própria API em 24/08/2026
  // (`GET /v1/language-models`), não de tabela de terceiro: prompt 20000 e
  // completion 60000, na unidade de 1e-10 USD/token → $2 e $6 por 1M.
  // ⚠️ A xAI cobra o DOBRO acima de 200k tokens de contexto ($4/$12) e o cache
  // de prompt sai por $0,50/1M. Este catálogo é de faixa única: uma chamada de
  // contexto longo fica SUBESTIMADA aqui.
  'grok-4.6':                   { label: 'Grok 4.6',            inUsd: 2,    outUsd: 6 },
  // ── Ligados em 25/08/2026 (rota em `lib/ai-provedores.ts`, chamada real 200) ──
  // Alibaba — Qwen3.8-Max (03/08/2026): 1M de contexto, multimodal, ~21 tok/s.
  // ⚠️ LENTO e VERBOSO: desqualificado para célula interativa, bom para lote.
  'qwen3.8-max':                { label: 'Qwen3.8 Max',         inUsd: 2,    outUsd: 6 },
  // Meta Superintelligence Labs — Muse Spark 1.2 (05/08/2026): 1M de contexto.
  // ⚠️ Modelo de RACIOCÍNIO, e o raciocínio sai DENTRO de `completion_tokens`:
  // medido em 25/08, gastou 125 tokens de raciocínio para responder "OK" — ou
  // seja, o custo real por tarefa é bem acima do que $4,25/1M sugere numa conta
  // feita só sobre o texto visível. Com teto apertado devolve 200 + conteúdo
  // VAZIO (por isso o `conteudoOuFalhaAlto` em ai-client).
  'muse-spark-1.2':             { label: 'Muse Spark 1.2',      inUsd: 1.25, outUsd: 4.25 },
  // ⚠️ Cache dos dois: o `costFromTokens` aplica 0,1× fixo em cacheRead. No Qwen
  // o read implícito é $0,25/1M (0,125×) e o explícito $0,17 (0,085×); no Muse,
  // $0,15 (0,12×). A aproximação sub/superestima o cache em poucos centavos por
  // milhão — aceitável, mas não é exato como no Claude e no Gemini 3.7.
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
  reuniao: 'por reunião preparada/analisada (Copiloto PACE)',
  simulacao: 'por colaborador simulado (Simulador — QA interna)',
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
  {
    id: 'devolutiva-voz',
    fase: 'Perfil DISC',
    scaleType: 'colab',
    nome: 'Devolutiva em voz — roteiro',
    descricao: 'Roteiro da devolutiva narrada (insumo do áudio de voz do relatório comportamental). Cache como os demais textos DISC.',
    inTokens: 3000,
    outTokens: 1500,
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

  // ── ARGUIÇÃO DO FECHAMENTO (lib/season-engine/arguicao.ts; taskKey partida em 27/08) ──
  {
    id: 'arguicao-turno',
    fase: 'Sem 14',
    scaleType: 'colab',
    nome: 'Arguição — turno da conversa',
    descricao: 'Turno da arguição sobre o relato da missão no fechamento (teto 2.048 por desenho). Estimativa ~10 turnos por arguição.',
    inTokens: 2500,
    outTokens: 350,
    exec: 10,
    defaultModel: 'claude-sonnet-4-6', // pino em DEFAULT_TASK_MODELS (arguicao_turno)
    critical: true,
  },
  {
    id: 'arguicao-avaliacao',
    fase: 'Sem 14',
    scaleType: 'colab',
    nome: 'Arguição — avaliação final (evidências)',
    descricao: 'Extrai o JSON de evidências por descritor ao fechar a arguição (teto 4.096). 1× por colab no fechamento.',
    inTokens: 4000,
    outTokens: 1200,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6', // pino em DEFAULT_TASK_MODELS (arguicao_avaliacao)
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
    id: 'pdi-check',
    fase: 'Relatórios',
    scaleType: 'colab',
    nome: 'PDI — auditor (check dual)',
    descricao: 'Auditor cross-LLM do PDI (27/08: o bloco C — artefato irreversível que vai pra pessoa — era o único sem 2ª IA).',
    inTokens: 5000,
    outTokens: 800,
    exec: 1,
    defaultModel: 'gpt-5.6-terra', // pino + guard ai-dual-familia
    critical: true,
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
    id: 'escola-brief',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'Brief da escola (contexto institucional)',
    descricao: 'Destila o PPP (até 60k chars) no brief institucional que calibra kits e conteúdo. Gemini 3.6 Flash — pino das tarefas vivas de extração.',
    inTokens: 15000,
    outTokens: 1500,
    exec: 1,
    defaultModel: 'gemini-3.6-flash',
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
  {
    id: 'cenarios-lote-check',
    fase: 'Setup Empresa',
    scaleType: 'empresa',
    nome: 'Cenários — relatório de auditoria em lote',
    descricao: 'Veredito agregado da tela Fase 5 (rh-check). 27/08: antes sem taskKey rodava em Gemini enquanto o check por-cenário rodava em Terra — dois vereditos sobre os mesmos cenários. Pino Terra.',
    inTokens: 4000,
    outTokens: 1500,
    exec: 1,
    defaultModel: 'gpt-5.6-terra',
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
  {
    id: 'conteudo-layout-plan',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Plano de layout do PDF',
    descricao: 'Planeja o layout do PDF antes do render (teto 8.000). Medido 16/08: texto+case+layout+expansão = US$ 0,104/conteúdo.',
    inTokens: 3000,
    outTokens: 2000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'conteudo-expansao-pdf',
    fase: 'Geração de Conteúdo',
    scaleType: 'conteudo',
    nome: 'Expansão para o PDF',
    descricao: 'Expande o texto ao mínimo de caracteres do PDF. ⚠️ Roda ANTES do render (F-I18: pagou por PDF que não nascia — medido US$ 0,26 em 4 chamadas).',
    inTokens: 3500,
    outTokens: 4000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  // ── KIT SEMANAL (brief idempotente por tema em kit_briefs; desafio por arquétipo DISC) ──
  {
    id: 'kit-nucleo',
    fase: 'Kit Semanal',
    scaleType: 'conteudo',
    nome: 'Kit — núcleo conceitual do tema',
    descricao: 'Destila o núcleo DISC-neutro que todos os formatos da semana expressam (teto 1.500; até 3 tentativas p/ JSON válido). Idempotente por (competência×descritor×nível×cargo×contexto).',
    inTokens: 2000,
    outTokens: 400,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'kit-desafio',
    fase: 'Kit Semanal',
    scaleType: 'conteudo',
    nome: 'Kit — desafio da semana (por DISC)',
    descricao: 'Micro-ação prática sob a lente de cada arquétipo (teto 800). exec=4 arquétipos D/I/S/C.',
    inTokens: 1200,
    outTokens: 250,
    exec: 4,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'kit-desafio-semana',
    fase: 'Kit Semanal',
    scaleType: 'conteudo',
    nome: 'Kit — tarefa da semana (2 descritores)',
    descricao: 'Tarefa integrada quando a semana entrega 2 descritores da MESMA competência (matriz por PAR ~2,5× a por descritor — taskKey própria desde 27/08 por isso). Só conta nas semanas com par.',
    inTokens: 1500,
    outTokens: 400,
    exec: 1,
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
  // ── RadarBett: linha REMOVIDA em 01/09/2026 ──
  // Bloco off-line desde 31/08 (lib/blocos-offline.ts): descontinuado após a
  // feira, nenhuma das 7 rotas referenciada por link em lugar nenhum. Enquanto
  // desligado, narrativa Bett não é custo de plataforma. Religar o bloco =
  // ressuscitar a linha (histórico: git log -S radarbett-narrativa).

  // ── FASE 3 — CHAT DE AVALIAÇÃO (app/api/chat/route.ts) ──
  {
    id: 'conversa-fase3',
    fase: 'Fase 3',
    scaleType: 'colab',
    nome: 'Chat de avaliação — turno',
    descricao: 'Turno da conversa de avaliação com o colab (teto 1.024). Estimativa ~10 turnos por conversa.',
    inTokens: 3000,
    outTokens: 300,
    exec: 10,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'chat-fase3-eval',
    fase: 'Fase 3',
    scaleType: 'colab',
    nome: 'Chat de avaliação — avaliador final',
    descricao: 'Fecha a conversa com avaliação estruturada (teto 8.192). 1× por conversa.',
    inTokens: 6000,
    outTokens: 2000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'chat-fase3-audit',
    fase: 'Fase 3',
    scaleType: 'colab',
    nome: 'Chat de avaliação — auditor (check dual)',
    descricao: 'Auditor cross-LLM da avaliação final (teto 8.192). ⚠️ Sem pino em DEFAULT_TASK_MODELS: hoje cai no FALLBACK_GLOBAL (Sonnet 4.6, MESMA família do gerador) — fio solto apontado em 01/09 (docs/CUSTO-QUALIDADE.md).',
    inTokens: 7000,
    outTokens: 600,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },

  // ── FASE 5 — REAVALIAÇÃO (uma rodada por colab; actions/fase5/) ──
  {
    id: 'evolucao-fusao',
    fase: 'Fase 5',
    scaleType: 'colab',
    nome: 'Evolução — fusão 3 fontes',
    descricao: 'Funde as 3 fontes de evidência na síntese evolutiva (teto 8.192). 1× por reavaliação.',
    inTokens: 5000,
    outTokens: 1500,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: true,
  },
  {
    id: 'evolucao-plenaria',
    fase: 'Fase 5',
    scaleType: 'colab',
    nome: 'Evolução — plenária',
    descricao: 'Relatório de plenária da reavaliação (teto 8.192). 1× por reavaliação.',
    inTokens: 6000,
    outTokens: 2000,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'reavaliacao-chat',
    fase: 'Fase 5',
    scaleType: 'colab',
    nome: 'Reavaliação — chat (turno)',
    descricao: 'Turno do chat de reavaliação (teto 4.096). Estimativa ~8 turnos. ⚠️ O fechamento da conversa (callAI teto 8.192 no mesmo arquivo) segue SEM taskKey no ledger — fio solto 01/09.',
    inTokens: 3000,
    outTokens: 400,
    exec: 8,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },

  // ── DEVELOPMENT BLUEPRINT (PDI + trilha por colab; migrações 175/191) ──
  {
    id: 'blueprint-gerar',
    fase: 'Blueprint',
    scaleType: 'colab',
    nome: 'Blueprint — gerador (PDI + trilha)',
    descricao: 'Gera o blueprint do colaborador (teto folgado 64.000 — régua do teto 26/08: erre pra cima). Em LOTE pela Batch API (trigger/gerar-blueprint-batch) → −50%.',
    inTokens: 12000,
    outTokens: 10000,
    costMultiplier: 0.5,
    exec: 1,
    defaultModel: 'claude-sonnet-4-6',
    critical: false,
  },
  {
    id: 'blueprint-audit',
    fase: 'Blueprint',
    scaleType: 'colab',
    nome: 'Blueprint — auditor semântico (check dual)',
    descricao: 'Auditor cross-LLM do blueprint (teto 4.000→7.000 em 26/08; pino Terra + guard ai-dual-familia). Medido 30/08: US$ 3,21 de input frio, zero cache — system abaixo do mínimo cacheável.',
    inTokens: 8000,
    outTokens: 1500,
    exec: 1,
    defaultModel: 'gpt-5.6-terra',
    critical: true,
  },

  // ── COPILOTO PACE (vendas: pesquisa + planejamento + leitura ao vivo + memória) ──
  // Escala por REUNIÃO. O áudio entra por Whisper LOCAL (sidecar na máquina do
  // representante — docs/COPILOTO-WHISPER-LOCAL.md): só TEXTO chega à análise e o
  // sidecar não é custo de API (por isso não tem linha de preço aqui).
  // Research é OpenAI WEB SEARCH (gpt-5.5): o input inclui páginas lidas pela
  // ferramenta, então inTokens DOMINA e a estimativa é deliberadamente larga.
  {
    id: 'copiloto-pesquisa-publica',
    fase: 'Copiloto PACE',
    scaleType: 'reuniao',
    nome: 'Pesquisa pública — site/empresa',
    descricao: 'Web search do site e da empresa informados (teto 12.000). Roda quando há empresa ou site no briefing.',
    inTokens: 8000,
    outTokens: 5000,
    exec: 1,
    defaultModel: 'gpt-5.5',
    critical: false,
  },
  {
    id: 'copiloto-pesquisa-noticias',
    fase: 'Copiloto PACE',
    scaleType: 'reuniao',
    nome: 'Pesquisa notícias externas',
    descricao: 'Web search de notícias/sinais externos (teto 6.000). Dispara junto com a pesquisa pública.',
    inTokens: 6000,
    outTokens: 2500,
    exec: 1,
    defaultModel: 'gpt-5.5',
    critical: false,
  },
  {
    id: 'copiloto-pesquisa-social',
    fase: 'Copiloto PACE',
    scaleType: 'reuniao',
    nome: 'Pesquisa redes oficiais',
    descricao: 'Web search nos perfis oficiais informados (teto 6.000). Só roda com perfis declarados.',
    inTokens: 6000,
    outTokens: 2500,
    exec: 1,
    defaultModel: 'gpt-5.5',
    critical: false,
    opcional: true,
  },
  {
    id: 'copiloto-planejamento',
    fase: 'Copiloto PACE',
    scaleType: 'reuniao',
    nome: 'Planejamento — síntese do Play',
    descricao: 'Monta o Play + banco de reserva: briefing privado (até 30k chars) + pesquisa + 16 materiais aprovados + memória da conta (teto 12.000). Terra, reasoningEffort low.',
    inTokens: 12000,
    outTokens: 5000,
    exec: 1,
    defaultModel: 'gpt-5.6-terra',
    critical: false,
  },
  {
    id: 'copiloto-ao-vivo',
    fase: 'Copiloto PACE',
    scaleType: 'reuniao',
    nome: 'Leitura ao vivo (por atualização)',
    descricao: 'Lê as últimas 8 falas e devolve fase/sinal/perguntas (teto 700, timeout 8s, sem reasoning). Estimativa ~12 leituras por reunião de 1h (rate limit 24/min). Gemini 3.7 Flash.',
    inTokens: 3000,
    outTokens: 400,
    exec: 12,
    defaultModel: 'gemini-3.7-flash',
    critical: false,
  },
  {
    id: 'copiloto-memoria',
    fase: 'Copiloto PACE',
    scaleType: 'reuniao',
    nome: 'Memória da conversa',
    descricao: 'Consolida transcrição + CRM + histórico anterior na memória da conta (teto 7.000). 1× por conversa registrada. Terra, reasoningEffort low.',
    inTokens: 10000,
    outTokens: 2000,
    exec: 1,
    defaultModel: 'gpt-5.6-terra',
    critical: false,
  },

  // ── SIMULADOR (QA interna — o "aluno" é Haquia de propósito; mentor usa o modelo real) ──
  // As chamadas-mentor/extras do Simulador REUSAM os taskKeys reais dos fluxos
  // (simOpts com o taskKey da trilha) — quando a unidade é uma simulação, elas
  // já contam nas entradas de Temporada acima. Aqui só o OVERLAY do aluno
  // simulado (sim_aluno) e o chat interativo (chat_simulador).
  {
    id: 'sim-aluno',
    fase: 'Simulador (QA)',
    scaleType: 'simulacao',
    nome: 'Simulador — aluno simulado (turno)',
    descricao: 'Turnos do aluno simulado em Haiku 4.5 (barato de propósito). Medido 27/08: 2.570 chamadas, p95 13,5s, máx 94s — MAIOR consumidor de chamadas da base. Estimativa ~80 turnos por simulação completa.',
    inTokens: 1200,
    outTokens: 250,
    exec: 80,
    defaultModel: 'claude-haiku-4-5-20251001',
    critical: false,
  },
  {
    id: 'chat-simulador',
    fase: 'Simulador (QA)',
    scaleType: 'simulacao',
    nome: 'Simulador — chat interativo',
    descricao: 'Turnos do chat interativo do Simulador (app/api/chat-simulador). Mentor no modelo do braço; estimativa ~12 turnos por sessão.',
    inTokens: 2500,
    outTokens: 300,
    exec: 12,
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
  // 01/09: pares declarados junto com as entradas novas do catálogo
  'pdi-check': 'pdi',
  'blueprint-audit': 'blueprint-gerar',
  'chat-fase3-audit': 'chat-fase3-eval',
  'cenarios-lote-check': 'cenarios-b',
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
  // 01/09: Copiloto PACE e Simulador idem — modelos PINADOS por task/env
  // (COPILOTO_*_MODEL, SIM_MODEL), não escalonáveis por tier de qualidade.
  if (call.fase === 'RAG' || call.fase === 'Geração de Conteúdo' || call.fase === 'Extração de Vídeo' || call.fase === 'Vídeo do Módulo-Base' || call.fase === 'Copiloto PACE' || call.fase === 'Simulador (QA)') return call.defaultModel;
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
