/**
 * Catálogo centralizado de todas as situações do projeto que chamam IA.
 * Cada tarefa pode ter um modelo configurado por empresa (sys_config.ai.modelos)
 * ou herdar do modelo padrão.
 */

export const AI_TASKS = [
  { key: 'recepcao_paciente', label: 'Recepção — paciente simulado', fase: 'Treinamento' },
  { key: 'recepcao_avaliacao', label: 'Recepção — avaliação do atendimento', fase: 'Treinamento' },
  // ── Fase 1 — Diagnóstico ─────────────────────────────────
  { key: 'ia1_top10', label: 'IA1 — Top 10 competências', fase: 'Fase 1' },
  { key: 'ia2_gabarito', label: 'IA2 — Perfil Ideal', fase: 'Fase 1' },
  { key: 'ia3_cenarios', label: 'IA3 — Geração de cenários', fase: 'Fase 1' },
  { key: 'ia3_check', label: 'IA3 — Validação (check dual)', fase: 'Fase 1' },

  // ── Fase 2 — Avaliação ───────────────────────────────────
  // 🔴 27/08: era `ia4_avaliar`, e o código sempre rodou `ia4_avaliacao`.
  // A tela de configuração itera AI_TASKS e grava `ai.modelos[task.key]`,
  // então o modelo que o operador escolhia para a IA4 ia para uma chave que
  // `resolveTaskModel` nunca consultava: escolha silenciosamente descartada.
  // Latente (nenhum tenant tem override hoje), mas na tela que o operador usa.
  { key: 'ia4_avaliacao', label: 'IA4 — Avaliar respostas', fase: 'Fase 2' },
  { key: 'ia4_check', label: 'IA4 — Validação (check dual)', fase: 'Fase 2' },
  { key: 'pdi_individual', label: 'PDI Individual', fase: 'Fase 2' },
  { key: 'relatorio_gestor', label: 'Relatório Gestor', fase: 'Fase 2' },
  { key: 'relatorio_rh', label: 'Relatório RH', fase: 'Fase 2' },
  // 27/08: o check que faltava no bloco C. Os artefatos IRREVERSÍVEIS (PDF que
  // vai para a pessoa) eram os únicos sem 2ª IA — e o exercício de custo nasceu
  // justamente dessa frase, para depois otimizar modelos DENTRO do buraco.
  { key: 'pdi_check', label: 'PDI Individual — Auditor (check dual)', fase: 'Fase 2' },

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
  // 27/08: a etiqueta `arguicao` PARTIDA em duas. Ela cobria operações de
  // naturezas diferentes — turno de conversa (curto por desenho, teto 2.048) e
  // avaliação final em JSON (teto 4.096) — e o auditor de tetos reportava a
  // divergência sem poder resolvê-la: o p95 da task era mistura de duas coisas.
  //
  // ⚠️ E nenhuma das duas estava aqui. `arguicao` etiquetava o ledger sem
  // constar do catálogo, então não era roteável por `getModelForTask` nem
  // aparecia na tela de modelos: rodava no FALLBACK_GLOBAL sem ninguém ter
  // decidido isso. Declarar torna a escolha visível — o valor abaixo é o
  // incumbente, não uma troca.
  { key: 'arguicao_turno', label: 'Arguição — Turno da conversa', fase: 'Temporadas' },
  { key: 'arguicao_avaliacao', label: 'Arguição — Avaliação final (evidências)', fase: 'Temporadas' },

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

  // ── 27/08: 20 tarefas que RODAVAM sem constar do catálogo ──────────────
  // A tela de configuração itera AI_TASKS: task ausente daqui é modelo que o
  // operador NÃO consegue escolher. Estavam todas nessa situação — incluindo
  // `sem14_check` e `acumulada_check`, que constam de DUAL_IA_PARES.
  // Declarar não troca nada: o modelo efetivo segue vindo de
  // DEFAULT_TASK_MODELS ou do FALLBACK_GLOBAL. Só torna a escolha possível.
  // Guard: tests/unit/security/taskkey-declarada-guard.test.ts
  { key: 'conversa_fase3', label: 'Chat de avaliação — turno da conversa', fase: 'Fase 3' },
  { key: 'chat_fase3_eval', label: 'Chat de avaliação — avaliador final', fase: 'Fase 3' },
  { key: 'chat_fase3_audit', label: 'Chat de avaliação — auditor (check dual)', fase: 'Fase 3' },
  { key: 'evidencias_socratic', label: 'Chat socrático — extração de evidências', fase: 'Temporadas' },
  { key: 'tira_duvidas', label: 'Tira-Dúvidas da semana', fase: 'Temporadas' },
  { key: 'sem13_qualitativa', label: 'Semana 13 — avaliação qualitativa', fase: 'Temporadas' },
  { key: 'sem14_scorer', label: 'Semana 14 — scorer do fechamento', fase: 'Temporadas' },
  { key: 'sem14_check', label: 'Semana 14 — check (dual)', fase: 'Temporadas' },
  { key: 'acumulada_primaria', label: 'Avaliação acumulada — primária', fase: 'Temporadas' },
  { key: 'acumulada_check', label: 'Avaliação acumulada — check (dual)', fase: 'Temporadas' },
  { key: 'kit_nucleo', label: 'Kit — núcleo conceitual do tema', fase: 'Kit' },
  { key: 'kit_desafio', label: 'Kit — desafio da semana', fase: 'Kit' },
  // A tarefa integrada quando a semana entrega 2 descritores da MESMA
  // competência (27/08/2026). É task à parte de `kit_desafio` de propósito: o
  // custo dela tem outro denominador — a matriz por PAR é ~2,5× a por descritor
  // — e misturar as duas no ledger esconderia justamente isso.
  { key: 'kit_desafio_semana', label: 'Kit — tarefa da semana (2 descritores)', fase: 'Kit' },
  { key: 'conteudo_layout_plan', label: 'Conteúdo — plano de layout do PDF', fase: 'Conteúdos' },
  { key: 'conteudo_expansao_pdf', label: 'Conteúdo — expansão para o PDF', fase: 'Conteúdos' },
  { key: 'escola_brief', label: 'Brief da escola (contexto institucional)', fase: 'Conteúdos' },
  { key: 'evolucao_plenaria', label: 'Evolução — plenária', fase: 'Fase 5' },
  { key: 'reavaliacao_chat', label: 'Reavaliação — chat', fase: 'Fase 5' },
  { key: 'beto', label: 'BETO — assistente do colaborador', fase: 'Assistentes' },
  { key: 'sim_aluno', label: 'Simulador — aluno', fase: 'Simulador' },
  { key: 'chat_simulador', label: 'Simulador — chat', fase: 'Simulador' },
  { key: 'copiloto_pesquisa_empresa', label: 'Copiloto PACE — pesquisa pública', fase: 'Copiloto' },
  { key: 'copiloto_planejamento', label: 'Copiloto PACE — planejamento da conversa', fase: 'Copiloto' },
  { key: 'copiloto_ao_vivo', label: 'Copiloto PACE — leitura ao vivo', fase: 'Copiloto' },
  // 28/08: as três abaixo já rodavam com taskKey no código sem estarem aqui —
  // invisíveis na tela de modelos e sem pino declarado (taskkey-declarada-guard).
  { key: 'copiloto_memoria_conversa', label: 'Copiloto PACE — memória da conversa', fase: 'Copiloto' },
  { key: 'copiloto_pesquisa_social_oficial', label: 'Copiloto PACE — pesquisa redes oficiais', fase: 'Copiloto' },
  { key: 'copiloto_pesquisa_noticias_externas', label: 'Copiloto PACE — pesquisa notícias externas', fase: 'Copiloto' },
  { key: 'copiloto_pesquisa_pessoas', label: 'Copiloto PACE — quem responde por pessoas', fase: 'Copiloto' },
  { key: 'copiloto_pesquisa_pessoa', label: 'Copiloto PACE — pessoa da reunião em profundidade', fase: 'Copiloto' },
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
  recepcao_paciente: 'claude-sonnet-4-6',
  recepcao_avaliacao: 'claude-sonnet-4-6',
  copiloto_pesquisa_empresa: 'gpt-5.5',
  copiloto_planejamento:     'gpt-5.6-terra',
  copiloto_ao_vivo:          'gemini-3.7-flash',
  // 28/08: incumbentes tornados explícitos — as chamadas já resolvem modelo
  // inline (env COPILOTO_RESEARCH_MODEL || 'gpt-5.5' nas duas pesquisas,
  // COPILOTO_MEMORY_MODEL || 'gpt-5.6-terra' na memória), então o pino espelha
  // o que já roda. Sem estas linhas o custo caía sem rótulo no ledger e a task
  // não aparecia na tela de modelos.
  copiloto_memoria_conversa:          'gpt-5.6-terra',
  copiloto_pesquisa_social_oficial:   'gpt-5.5',
  copiloto_pesquisa_noticias_externas: 'gpt-5.5',
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
  // 27/08: as duas entram por TROCA de modelo, e as duas eram invisiveis antes
  // — nao estavam em DEFAULT_TASK_MODELS, entao caiam no FALLBACK_GLOBAL
  // (sonnet-4-6) sem ninguem ter decidido isso.
  //
  // `pulse_classify` fecha o par com `pulse_audit` (Terra/OpenAI): Gemini e
  // Google, entao cross-familia continua valendo. Extracao utilitaria de saida
  // curta — metade do input e 2,4x menos no output pelo catalogo.
  pulse_classify:      'gemini-3.7-flash',
  // `conteudo_tags`: classificacao de conteudo, saida curta, sem auditor a
  // jusante e sem nota derivada. Bloco F2.
  conteudo_tags:       'gemini-3.7-flash',
  // Incumbentes tornados explícitos (antes: FALLBACK_GLOBAL por omissão).
  arguicao_turno:      'claude-sonnet-4-6',
  arguicao_avaliacao:  'claude-sonnet-4-6',
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
  // Terra porque o gerador é Claude: auditor NUNCA da mesma família.
  pdi_check:           'gpt-5.6-terra',
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
  'pdi_check',
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
/**
 * Resolução SEM a trava de Dual-IA — só para comparar as duas pontas de um par
 * sem recursão. Nunca use isto para decidir o modelo de uma chamada.
 */
function resolverBruto(sysConfig: any, taskKey: string): string {
  const ai = sysConfig?.ai || {};
  return ai.modelos?.[taskKey]
    || (ai.modelo_padrao && !PINNED_TASKS.has(taskKey) ? ai.modelo_padrao : null)
    || DEFAULT_TASK_MODELS[taskKey]
    || FALLBACK_GLOBAL;
}

/** O parceiro de par de uma task (gerador ↔ auditor), ou null. */
function parceiroDual(taskKey: string): string | null {
  for (const par of DUAL_IA_PARES) {
    if (par.gerador === taskKey) return par.auditor;
    if (par.auditor === taskKey) return par.gerador;
  }
  return null;
}

export function resolveTaskModel(sysConfig, taskKey) {
  const ai = sysConfig?.ai || {};
  const especifico = ai.modelos?.[taskKey];
  if (especifico) return especifico;
  const base = DEFAULT_TASK_MODELS[taskKey] || FALLBACK_GLOBAL;

  if (ai.modelo_padrao && !PINNED_TASKS.has(taskKey)) {
    // 🔴 27/08/2026 — o pino do AUDITOR não bastava.
    //
    // Todo auditor está pinado; NENHUM gerador estava (só `ia4_avaliacao`).
    // Como `modelo_padrao` sobrescreve qualquer task não pinada, bastava o
    // tenant escolher no dropdown um modelo da família do auditor para os dois
    // caírem juntos. Medido: **8 dos 10 pares** cediam a um `modelo_padrao`
    // OpenAI — ia3, cenarios_b, acumulada, sem14, modulo_base, pulse… O efeito
    // não é falhar: é a segunda opinião virar eco, sem erro e sem log.
    //
    // A saída NÃO foi pinar os oito — isso tiraria do tenant a escolha de
    // modelo em metade do produto. A invariante passa a ser CALCULADA: se o
    // padrão do tenant colidir com a família do parceiro, ele é ignorado
    // AQUI e a task fica no seu default. Quem cede é o gerador; o auditor
    // segura o pino, porque é ele que existe para ser independente.
    const parceiro = parceiroDual(taskKey);
    if (parceiro) {
      try {
        if (familiaDoModelo(ai.modelo_padrao) === familiaDoModelo(resolverBruto(sysConfig, parceiro))) {
          console.warn(
            `[ai-tasks] modelo_padrao "${ai.modelo_padrao}" ignorado em "${taskKey}": cairia na mesma `
            + `família de "${parceiro}" e o Dual-IA viraria eco. Mantido "${base}". `
            + `Para forçar, configure ai.modelos.${taskKey} explicitamente.`,
          );
          return base;
        }
      } catch {
        // Família desconhecida: não dá para provar que é seguro, então não é.
        return base;
      }
    }
    return ai.modelo_padrao;
  }
  return base;
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
  { gerador: 'pdi_individual',    auditor: 'pdi_check',           onde: 'lib/relatorios/individual-core.ts' },
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
    porque: 'app/api/chat/route.ts escolhe o auditor por const hardcoded (DEFAULT_VALIDADOR) e o eval por '
      + 'sys_config.ai.modelo_padrao — nenhum dos dois passa por resolveTaskModel, então editar '
      + 'DEFAULT_TASK_MODELS/PINNED_TASKS NÃO move este par. '
      + '🔴 26/08/2026: este comentário dizia "gemini-3.1-flash-lite" e estava ERRADO desde 05/08 — o valor '
      + 'é gpt-5.6-terra. Um painel externo leu daqui e repetiu o id morto, que é como doc velho ensina o '
      + 'errado. Pior que o id: a conclusão que ele sustentava. Com o auditor em Terra (OpenAI), o par só é '
      + 'cross-família enquanto modelo_padrao for Claude — e modelo_padrao é um dropdown de admin. Escolher '
      + 'qualquer GPT ali põe gerador e auditor na MESMA família, sem erro, sem log e sem teste (este par '
      + 'está fora da tabela, logo fora do ai-dual-familia). Guarda: chat-dual-familia.test.ts.',
  },
];

/**
 * Auditor do chat da fase 3, garantido CROSS-FAMÍLIA contra o gerador.
 *
 * Por que existe (26/08/2026): `app/api/chat/route.ts` resolvia o gerador por
 * `sys_config.ai.modelo_padrao` (dropdown do admin) e o auditor por uma const
 * fixa em `gpt-5.6-terra`. O par só era cross-família ENQUANTO o admin deixasse
 * o padrão em Claude — escolher qualquer GPT na tela punha gerador e auditor na
 * mesma família, sem erro, sem log e sem teste, porque este par está em
 * `PARES_FORA_DA_TABELA` e portanto fora do `ai-dual-familia`.
 *
 * A invariante do Dual-IA não pode depender de o operador não clicar na opção
 * errada. Aqui ela passa a ser calculada.
 */
export function auditorCrossFamilia(modeloGerador: string, preferido: string, alternativas: string[]): string {
  const fam = familiaDoModelo(modeloGerador);
  if (familiaDoModelo(preferido) !== fam) return preferido;
  const alt = alternativas.find((m) => familiaDoModelo(m) !== fam);
  if (!alt) {
    throw new Error(
      `auditorCrossFamilia: gerador "${modeloGerador}" (${fam}) e nenhum auditor de outra família em `
      + `[${[preferido, ...alternativas].join(', ')}]. Dual-IA exige famílias distintas — adicione uma alternativa.`,
    );
  }
  return alt;
}

/**
 * Família do PARCEIRO Dual-IA de uma task (gerador ↔ auditor), ou null se a
 * task não faz parte de nenhum par.
 *
 * Serve ao fallback de provedor: quando o primário cai, o substituto não pode
 * aterrissar na família do parceiro, senão a segunda opinião vira eco. Resolve
 * pelos DEFAULTS, de propósito — isto roda na trilha de FALHA, onde uma ida ao
 * banco para ler `sys_config` é mais uma coisa que pode estar quebrada.
 */
export function familiaDoParceiroDual(taskKey: string): string | null {
  if (!taskKey) return null;
  for (const par of DUAL_IA_PARES) {
    const parceiro = par.gerador === taskKey ? par.auditor : par.auditor === taskKey ? par.gerador : null;
    if (!parceiro) continue;
    const modelo = DEFAULT_TASK_MODELS[parceiro];
    if (modelo) return familiaDoModelo(modelo);
  }
  return null;
}

/**
 * Escada de fallback de provedor, respeitando o Dual-IA.
 *
 * O knob `AI_FALLBACK_MODEL` é ÚNICO e global (default `gpt-5.6-terra`). Isso
 * quebra o Dual-IA no pior momento possível: num outage da Anthropic, um gerador
 * Claude cai para Terra — e Terra é exatamente o auditor de 6 dos 9 pares. A
 * auditoria seguiria rodando, com o mesmo modelo dos dois lados, sem erro e sem
 * aviso: o efeito não é falhar, é APROVAR o que deveria ser contestado.
 *
 * Aqui a escolha passa a excluir a família do parceiro. Se nada sobra, devolve
 * null — e quem chama falha em vez de fingir que auditou.
 */
export function fallbackRespeitandoDual(
  modeloPrimario: string,
  taskKey: string | undefined,
  preferido: string,
  escada: string[],
): string | null {
  const proibida = taskKey ? familiaDoParceiroDual(taskKey) : null;
  const famPrimario = familiaDoModelo(modeloPrimario);
  const serve = (m: string) => {
    const f = familiaDoModelo(m);
    return f !== famPrimario && (proibida === null || f !== proibida);
  };
  if (serve(preferido)) return preferido;
  return escada.find(serve) ?? null;
}
