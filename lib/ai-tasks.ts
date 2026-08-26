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
  { key: 'cenarios_lote_check', label: 'Cenários — Relatório de auditoria em lote', fase: 'Fase 5' },
  { key: 'evolucao_fusao', label: 'Evolução (fusão 3 fontes)', fase: 'Fase 5' },

  // ── Pulso de Desenvolvimento (Dual-IA) ───────────────────
  { key: 'pulse_classify', label: 'Pulso — Classificador de texto aberto', fase: 'Pulso' },
  { key: 'pulse_audit',    label: 'Pulso — Auditor (verifica classificação)', fase: 'Pulso' },

  // ── Vertho Master Content (módulos-base) ─────────────────
  { key: 'modulo_base_autor',   label: 'Módulo-Base — Rascunho assistido / Import docx', fase: 'Vertho' },
  { key: 'modulo_base_auditor', label: 'Módulo-Base — Auditor (valida o que a autora gerou)', fase: 'Vertho' },
  { key: 'descritor_reancoragem', label: 'Descritores — Reancoragem de avaliação livre à régua oficial', fase: 'Vertho' },

  // ── Development Blueprint (Dual-IA) ──────────────────────
  // Ausentes até 25/08/2026. Os dois taskKeys já existiam nos call-sites
  // (`blueprint_gerar`, `blueprint_audit`) e etiquetavam o ledger, mas nenhum
  // dos dois estava aqui nem em DEFAULT_TASK_MODELS — então os DOIS caíam no
  // FALLBACK_GLOBAL e o auditor auditava o gerador com o MESMO modelo. Não era
  // entrada errada na tabela: era par que nunca passou por tabela nenhuma.
  { key: 'blueprint_gerar', label: 'Blueprint — Gerador (PDI + trilha)', fase: 'Blueprint' },
  { key: 'blueprint_audit', label: 'Blueprint — Auditor semântico (check dual)', fase: 'Blueprint' },
];

/**
 * Modelos selecionáveis na tela de configuração de IA da empresa.
 *
 * Revisto em 25/08/2026 para bater com a rodada de avaliação (AA Intelligence
 * Index + arena.ai). Agrupado por família, porque a regra que mais restringe a
 * escolha aqui é a Dual-IA: auditor nunca da mesma família do gerador.
 *
 * Três regras para entrar nesta lista, todas travadas pelo guard em
 * `tests/unit/ai-dual-familia.test.ts`:
 *   1. ter preço em `lib/ia-cost-catalog.ts` — sem isso `costFromTokens` devolve
 *      null e a linha do ledger nasce sem custo;
 *   2. ter rota em `lib/ai-provedores.ts` — o último caso do dispatch é
 *      `callClaude`, então id sem rota vira erro etiquetado como Anthropic;
 *   3. o id ser o da PRÓPRIA API. Conferidos em 25/08 com as chaves do projeto:
 *      `qwen3.8-max` (dashscope-intl), `muse-spark-1.2` (api.meta.ai — NÃO
 *      `meta/muse-spark-1.2`, que é o id do OpenRouter) e `kimi-k3` (moonshot).
 *
 * ⚠️ Ter a chave na Vercel é a 4ª condição, e ela NÃO é verificável daqui: o
 * guard roda em node, não enxerga o ambiente de destino. `QWEN_API_KEY` e
 * `META_MODEL_API_KEY` foram para production em 25/08 junto com esta lista.
 * Modelo novo aqui exige conferir `vercel env ls production` na mesma passada.
 */
export const MODELOS_DISPONIVEIS = [
  // ── Anthropic ──
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  // O 4.6 estava FORA do dropdown, e isso deixava sem porta a saída que o
  // comentário de PINNED_TASKS promete: "o override EXPLÍCITO por task segue
  // valendo — é a saída para voltar ao 4.6 numa empresa específica sem tocar no
  // código". Ele é o FALLBACK_GLOBAL e o default da maioria das tasks; não poder
  // selecioná-lo tornava a reversão um deploy em vez de uma configuração.
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  // ── OpenAI ──
  { id: 'gpt-5.6-sol', label: 'GPT 5.6 Sol' },
  { id: 'gpt-5.6-terra', label: 'GPT 5.6 Terra' },
  { id: 'gpt-5.6-luna', label: 'GPT 5.6 Luna' },
  // ── Google ──
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  // 3.6 fica: ainda é o default de tarefas vivas (extrator de cargo, brief da
  // escola, extração de vídeo). Tirar daqui tornaria inselecionável um modelo
  // que segue em produção.
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  // ── Demais famílias (a diversidade é o ativo: é ela que viabiliza o par
  //    cross-família quando o gerador não é Claude) ──
  { id: 'qwen3.8-max', label: 'Qwen3.8 Max' },
  { id: 'muse-spark-1.2', label: 'Muse Spark 1.2' },
  // Kimi K3 tinha rota (`kimi`), preço e chave na Vercel desde antes, mas nunca
  // esteve nesta lista — dava para pagar por ele e não dava para escolhê-lo.
  { id: 'kimi-k3', label: 'Kimi K3' },
  { id: 'grok-4.6', label: 'Grok 4.6' },
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
  // Sonnet 5 NÃO virou default (piloto: tokens +40-68%, truncava JSON das
  // extrações — docs/CUSTO-QUALIDADE.md Resultado 3); segue selecionável.
  modulo_base_autor:   'claude-sonnet-4-6',
  // ── TODAS as dupla-checagens (2ª IA auditando a 1ª) em GPT 5.6 Terra ──
  // Decisão do Rodrigo 22/07: padroniza os auditores no Terra ($2,50/$15) —
  // cross-família OpenAI auditando o Sonnet, qualidade acima do Luna ($1/$6,
  // Onda 0) e 4× mais barato que o gpt-5.4 ($10/$30) que ia3/ia4 usavam.
  // O veredito continua derivado EM CÓDIGO, não pedido ao modelo.
  modulo_base_auditor: 'gpt-5.6-terra',
  // Classificação curta (paráfrase → item de régua): saída pequena, o 4.6 basta.
  descritor_reancoragem: 'claude-sonnet-4-6',
  acumulada_check:     'gpt-5.6-terra',
  sem14_check:         'gpt-5.6-terra',
  ia3_check:           'gpt-5.6-terra',
  ia4_check:           'gpt-5.6-terra',
  cenarios_b_check:    'gpt-5.6-terra',
  pulse_audit:         'gpt-5.6-terra',
  // Blueprint (25/08/2026): o auditor semântico (`lib/blueprint/audit.ts`) roda
  // sobre o que `BLUEPRINT_SYSTEM` gerou. Sem esta linha os dois lados caíam em
  // `claude-sonnet-4-6` — auditoria da mesma família, que é o único modo de
  // falha que o padrão Dual-IA existe para impedir. Travado pelo guard em
  // `tests/unit/ai-dual-familia.test.ts`.
  blueprint_audit:     'gpt-5.6-terra',
  // Relatório de auditoria em lote da tela de Fase 5 (`rh-check`). Estava fora
  // da padronização de 22/07 porque não tinha taskKey — e por isso rodava em
  // Gemini enquanto o check por-cenário rodava em Terra, dando ao admin dois
  // vereditos opostos sobre os mesmos cenários.
  cenarios_lote_check: 'gpt-5.6-terra',
  // Roteiro de vídeo — peça criativa de alta alavancagem (reaproveitada por
  // célula): Opus 5 + extended thinking ($5/$25) pela
  // aderência a muitas regras + fidelidade pedagógica. Thinking é ativado no
  // callClaudeBatch (lib/video/gerar-roteiro.ts).
  conteudo_video:      'claude-opus-5',
  // ── Tarefas de SAÍDA LONGA em Claude Sonnet 5 (12/08/2026) ──
  // `Medido:` no ledger, 90d, mesmo `source` dos dois lados. O sinal do Sonnet 5
  // INVERTE com o tamanho da saída, porque o thinking cobra um pedágio quase fixo
  // por chamada: ele dilui em resposta longa e domina em resposta curta.
  //   ia4_avaliacao  out 6.212 → 8.115 tok ... $0,10029 → $0,09131  (−9%, n=77/15)
  //   pdi (eval)     out 8.908 → 10.348 ..... $0,161   → $0,127    (−21%)
  // ...contra o outro lado da curva, que fica no 4.6 de propósito:
  //   missao_feedback     out 104 → 428 ...... +14%
  //   evidencias_socratic out  69 → 144 ...... +0,5%
  //   sim_extracao_socratic out 441 → 1.184 .. +41%
  // Ponto de virada ≈ 1.500–2.000 tokens de saída no 4.6.
  //
  // 🔴 Pré-requisito, não detalhe: teto FOLGADO. O modo de falha do Sonnet 5 aqui
  // é truncar JSON onde `max_tokens` é apertado — medido em produção, não só no
  // piloto: `sim_extracao_qualitativa` bateu no teto de 4.000 em 8 de 8 chamadas
  // (o 4.6, zero). A IA4 só entra nesta lista porque o teto subiu para 16k em
  // 12/08 — com os 8.192 antigos, o Sonnet 5 já produziu 10.754 tokens e teria
  // truncado. Ao trazer uma task nova para cá, confira o teto ANTES.
  //
  // ⚠️ Qualidade de ESCRITA segue sem veredito: no eval de 07-08/08 nenhum critério
  // automático separou os modelos, e a leitura cega dos 9 PDIs anonimizados
  // (artefato e8161cfa) nunca foi feita. O que decidiu aqui foi custo + robustez.
  ia4_avaliacao:       'claude-sonnet-5',
  pdi_individual:      'claude-sonnet-5',
  relatorio_gestor:    'claude-sonnet-5',
  relatorio_rh:        'claude-sonnet-5',
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
  'blueprint_audit',
  // As 4 de saída longa acima. Pinadas porque, SEM isto, a troca para Sonnet 5
  // seria config morta: as 10 empresas têm `modelo_padrao: claude-sonnet-4-6`, que
  // vence o default por-task na precedência (medido em 12/08 — nenhuma tem override
  // de `ia4_avaliacao`). Mudar só o DEFAULT_TASK_MODELS não mudaria uma chamada
  // sequer, e o painel registraria a "troca" sem que ela existisse. Mesma classe do
  // override de ia3/ia4_check que era ignorado pelo runner (22/07).
  // O override EXPLÍCITO por task segue valendo — é a saída para voltar ao 4.6 numa
  // empresa específica sem tocar no código.
  'ia4_avaliacao',
  'pdi_individual',
  'relatorio_gestor',
  'relatorio_rh',
  // Sem este pin o guard `ai-dual-familia` fica VERMELHO — e com razão: o
  // `modelo_padrao` das 11 empresas é `claude-sonnet-4-6`, que venceria o default
  // por-task e devolveria o auditor à família do gerador. Foi assim que o guard
  // pegou o erro ao registrar esta task (26/08).
  'cenarios_lote_check',
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

/**
 * Valida os modelos declarados num `sys_config` antes de gravar. Devolve a lista
 * de problemas — vazia quando está tudo certo.
 *
 * Régua: **tem preço E tem rota**, não "está no dropdown".
 * O dropdown é curadoria; a régua é o que faz a chamada funcionar. Existe modelo
 * legítimo fora da lista (`gpt-5.4-2026-03-05`, `gemini-3.1-flash-lite`, o Haiku
 * do simulador), e travar no dropdown proibiria configurá-los sem motivo.
 *
 * ⚠️ O QUE ESTA VALIDAÇÃO **NÃO** PEGA — e por isso ela não basta sozinha:
 * o caso real de 25/08/2026 foi `gpt-5.4` configurado na ACME Demo. O id era
 * válido no dia em que foi gravado e **morreu no provedor** depois. Validação de
 * escrita só enxerga o instante da escrita; drift do provedor é invisível para
 * ela. Quem pega aquilo é o R14 do health-check (`checarModelosConfigurados`),
 * que pergunta ao provedor de forma recorrente. Esta função é a rede contra
 * digitação e id inventado; aquela é a rede contra o tempo.
 */
export async function validarModelosDoSysConfig(sysConfig: any): Promise<string[]> {
  // `await import` e não import estático: este módulo é lido por componente de
  // CLIENTE (a tela de configurações importa AI_TASKS/MODELOS_DISPONIVEIS), e o
  // estático arrastaria o catálogo de custo inteiro para o bundle do browser.
  // Mesmo padrão que `getModelForTask` já usa aqui embaixo com o supabase.
  const { MODELS } = await import('@/lib/ia-cost-catalog');
  const { modeloTemRota } = await import('@/lib/ai-provedores');

  const ai = sysConfig?.ai || {};
  const declarados: Array<{ onde: string; modelo: unknown }> = [];
  if (ai.modelo_padrao) declarados.push({ onde: 'modelo_padrao', modelo: ai.modelo_padrao });
  for (const [task, modelo] of Object.entries(ai.modelos || {})) declarados.push({ onde: task, modelo });

  const problemas: string[] = [];
  for (const { onde, modelo } of declarados) {
    // Vazio = "sem override", e é assim que o RUNTIME já lê: `resolveTaskModel`
    // faz `if (especifico)`, então string vazia cai no default por task. Recusar
    // aqui o que o runtime aceita sem dano seria a validação divergindo do
    // consumidor — e travaria um save por um valor inofensivo.
    if (modelo === '' || modelo === null || modelo === undefined) continue;
    if (typeof modelo !== 'string' || !modelo.trim()) {
      problemas.push(`${onde}: modelo precisa ser texto (recebido: ${typeof modelo})`);
      continue;
    }
    if (!modeloTemRota(modelo)) {
      problemas.push(`${onde}: "${modelo}" não tem rota no ai-client — a chamada iria para a Anthropic e falharia etiquetada como Anthropic`);
    } else if (!MODELS[modelo]) {
      problemas.push(`${onde}: "${modelo}" não tem preço em ia-cost-catalog — a linha do ledger nasceria sem custo`);
    }
  }
  return problemas;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Invariante Dual-IA: auditor NUNCA da mesma família do gerador
 * ────────────────────────────────────────────────────────────────────────────
 * Por que isto vive AQUI e não em `lib/ia-cost-catalog.ts`:
 *
 * O catálogo de custo já tinha a regra implementada (`crossLlmCheck`, mapa
 * bidirecional gerador↔auditor, aplicado por `applyPreset`). Só que os únicos
 * consumidores dele são `app/admin/vertho/orcamento` e `.../simulador-custo` —
 * duas TELAS DE SIMULAÇÃO. Nada em `ai-client.ts`, `ai-tasks.ts`, actions ou
 * triggers lê aquilo. A regra estava escrita onde não decidia nada, e foi
 * exatamente por isso que `blueprint_audit` pôde nascer auditando
 * `blueprint_gerar` com o mesmo `claude-sonnet-4-6`: o par nunca passou por
 * `crossLlmCheck`, porque `crossLlmCheck` não está no caminho de execução.
 *
 * Aqui a regra fica onde o modelo é DECIDIDO (`resolveTaskModel`), e o guard em
 * `tests/unit/ai-dual-familia.test.ts` a executa contra os pares reais.
 */

/** Família (vendor) de um id de modelo. Fail-closed: id desconhecido lança. */
export function familiaDoModelo(modelId: string): string {
  const m = String(modelId || '');
  if (m.startsWith('claude')) return 'anthropic';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai';
  if (m.startsWith('gemini')) return 'google';
  if (m.startsWith('grok')) return 'xai';
  if (m.startsWith('kimi')) return 'moonshot';
  if (m.startsWith('qwen')) return 'alibaba';
  if (m.startsWith('muse')) return 'meta';
  // Fail-closed de propósito: devolver 'desconhecida' faria um id novo passar no
  // guard por ser "diferente" de tudo — falso NEGATIVO no único check que existe.
  throw new Error(`familiaDoModelo: família desconhecida para "${m}". Adicione o prefixo aqui ANTES de usar o modelo.`);
}

/**
 * Pares Dual-IA cujos DOIS lados resolvem o modelo por `resolveTaskModel`.
 * Chaves conferidas contra os `taskKey:` reais dos call-sites (25/08/2026).
 */
export const DUAL_IA_PARES: Array<{ gerador: string; auditor: string; onde: string }> = [
  { gerador: 'ia3_cenarios',      auditor: 'ia3_check',           onde: 'lib/ia3-cenarios.ts' },
  { gerador: 'ia4_avaliacao',     auditor: 'ia4_check',           onde: 'lib/check-ia4-core.ts' },
  { gerador: 'cenarios_b',        auditor: 'cenarios_b_check',    onde: 'actions/fase5/cenarios-b.ts' },
  { gerador: 'acumulada_primaria',auditor: 'acumulada_check',     onde: 'lib/season-engine/avaliacao-acumulada-core.ts' },
  { gerador: 'sem14_scorer',      auditor: 'sem14_check',         onde: 'lib/season-engine/fechamento-scorer.ts' },
  { gerador: 'modulo_base_autor', auditor: 'modulo_base_auditor', onde: 'lib/modulo-base-auditor.ts' },
  { gerador: 'pulse_classify',    auditor: 'pulse_audit',         onde: 'actions/pulse/classify.ts' },
  { gerador: 'blueprint_gerar',   auditor: 'blueprint_audit',     onde: 'lib/blueprint/core.ts' },
  { gerador: 'ia3_cenarios',      auditor: 'cenarios_lote_check', onde: 'actions/fase5/relatorios-envios.ts' },
];

/**
 * Pares Dual-IA que o guard NÃO cobre, e por quê.
 *
 * Existe para que o verde do guard não seja lido como cobertura que ele não tem.
 * O teste confirma que estes taskKeys continuam FORA da tabela — se alguém os
 * trouxer para `DEFAULT_TASK_MODELS`, o teste manda mover o par para
 * `DUAL_IA_PARES` em vez de deixar a exceção envelhecer em silêncio.
 */
export const PARES_FORA_DA_TABELA: Array<{ gerador: string; auditor: string; porque: string }> = [
  {
    gerador: 'chat_fase3_eval',
    auditor: 'chat_fase3_audit',
    porque: 'app/api/chat/route.ts escolhe o auditor por const hardcoded (DEFAULT_VALIDADOR = gemini-3.1-flash-lite) '
      + 'e o eval por sys_config.ai.modelo_padrao — nenhum dos dois passa por resolveTaskModel. '
      + 'Cross-família HOJE (Claude vs Google), mas por acidente de hardcode, não por invariante travado.',
  },
];
