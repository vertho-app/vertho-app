# Catálogo de Prompts da IA — Vertho Mentor IA

> Revisão: 2026-08-25 | Total: **105** prompts/famílias catalogados (**70** já documentados + **35** encontrados nesta auditoria)
>
> Roteador universal: `actions/ai-client.ts` (`callAI` single-turn + `callAIChat` multi-turn). Default = `claude-sonnet-4-6`; OpenAI, Gemini e **Kimi** (`kimi*`, OpenAI-compatible) pelo mesmo wrapper.
> Prompt caching automático: `system` > 4000 chars → `cache_control: ephemeral`. Prefixo grande e estável de lote → `options.cachedUserPrefix` (2º breakpoint).
> Extended thinking: `options.thinking = true` (budget 32k-65k tokens). Reasoning effort: `options.reasoningEffort` (kimi-k3, gpt-5.x).
> Streaming: automático quando `maxTokens > 8192`.
> Geração em lote: `lib/ai-batch.ts` — Batch API da Anthropic **e** da OpenAI (−50%).
>
> **Modelos por tarefa (estado em 25/08):** o fallback global continua `claude-sonnet-4-6`; `ia4_avaliacao`, `pdi_individual`, `relatorio_gestor` e `relatorio_rh` estão pinned em **Claude Sonnet 5**; `conteudo_video` usa **Claude Opus 5**; e os auditores `ia3_check`, `ia4_check`, `cenarios_b_check`, `acumulada_check`, `sem14_check`, `pulse_audit` e `modulo_base_auditor` estão pinned em **GPT 5.6 Terra**. Override explícito por task continua prevalecendo.
>
> **Regeneração nunca destrói a campeã (23/07):** nos cenários A e B, "regenerar com feedback" gera a candidata em memória, audita e **só aplica se a nota for ≥ a atual** (`travaRegeneracao`). O prompt de regeneração tem regras anti-inflação — o gerador tende a responder crítica **adicionando** conteúdo.

## Legenda Documental

| Badge | Significado |
|-------|-------------|
| **`ATIVO`** | Prompt em uso na produção atual |
| **`LEGADO`** | Prompt mantido por compatibilidade ou referência, não mais o caminho principal |
| **`WRAPPER`** | Reusa prompt de outro item, possivelmente com appendix adicional |
| **`AUXILIAR`** | Prompt de suporte (simulação, proxy, helper) — não é prompt de negócio principal |

| Campo | Significado |
|-------|-------------|
| **Prompt documentado como: `resumo_editorial`** | O texto abaixo é uma síntese do prompt real. Consulte o arquivo-fonte para o texto literal completo |
| **Prompt documentado como: `literal`** | O texto abaixo é o prompt literal do código (pode ter sido abreviado para caber no catálogo) |
| **Prompt documentado como: `reuso`** | Este item reutiliza o prompt de outro item, indicado no campo "Reusa prompt de" |
| **Prompt documentado como: `appendix`** | Este item adiciona instruções extras sobre um prompt existente |

## Índice

1. [Fase 1 — Parametrização (IA1/IA2/IA3 + Check)](#fase-1--parametrização-ia1ia2ia3--check)
2. [Fase 3 — Avaliação IA4 (Mapeamento)](#fase-3--avaliação-ia4-mapeamento)
3. [Chat Fase 3 — Entrevista + Avaliação + Auditoria](#chat-fase-3--entrevista--avaliação--auditoria)
4. [Check IA4 (Auditor 2ª IA)](#check-ia4-auditor-2ª-ia)
5. [Fase 5 — Cenário B + Reavaliação + Fusão + Plenária](#fase-5--cenário-b--reavaliação--fusão--plenária)
6. [Motor de Temporadas (duração configurável)](#motor-de-temporadas-duração-configurável)
7. [Relatórios (Individual / Gestor / RH)](#relatórios-individual--gestor--rh)
8. [PPP / Dossiê Corporativo](#ppp--dossiê-corporativo)
9. [Perfil Comportamental (Dashboard)](#perfil-comportamental-dashboard)
10. [FIT v2 (Leitura Executiva)](#fit-v2-leitura-executiva)
11. [Conteúdos e Tagging](#conteúdos-e-tagging)
12. [Kit Semanal (competência × descritor × DISC)](#kit-semanal-conteúdo-por-competência--descritor--disc)
13. [Simuladores](#simuladores)
14. [Fase 4 (PDI legado)](#fase-4-pdi-legado)
15. [Outros (Cenário B legado, Evolução Granular, Tutor Evidência)](#outros-cenário-b-legado-evolução-granular-tutor-evidência)
16. [Módulos-Base de Conteúdo (Vertho Master)](#módulos-base-de-conteúdo-vertho-master)
17. [Development Blueprint](#development-blueprint)
18. [Pulso de Desenvolvimento](#pulso-de-desenvolvimento)
19. [Modo Cena (experimental)](#modo-cena-experimental)
20. [Diagnósticos, seleção e assistentes](#diagnósticos-seleção-e-assistentes)
21. [Radar Vertho](#radar-vertho)
22. [Prompts multimodais e mídia](#prompts-multimodais-e-mídia)

---

## Fase 1 — Parametrização (IA1/IA2/IA3 + Check)

### 1.1 IA1 — Top 10 competências por cargo
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase1.ts::rodarIA1` (build em `buildSystemPromptSelecao` + `buildUserPrompt`)
- **Modelo default**: Claude Sonnet 4.6 (configurável via `aiConfig.model`)
- **Max tokens**: 8192
- **Trigger**: Admin clica em "IA1 — Top 10" em `/admin/empresas/{id}` (Fase 1). Só chama IA se o cargo tem >10 competências (senão seleciona todas direto).
- **Grounding RAG**: Não. Usa contexto do PPP via `buscarContextoPPP` (extração salva em `ppp_escolas.extracao`).
- **Thinking**: Não.
- **Loop**: Sim — para cada cargo distinto com >10 competências.
- **Retry**: 1 nova chamada quando a resposta não contém a quantidade mínima de competências válidas da lista.
- **System prompt**:
  ```text
  Você é a IA de parametrização da Vertho.
  Sua tarefa: SELECIONAR as competências MAIS RELEVANTES para o cargo "{cargoAlvo}" da lista abaixo.

  IMPORTANTE:
  - Selecione APENAS da lista fornecida — NÃO invente competências.
  - A lista tem {total} competências.
  - {total <= 10 ? Selecione TODAS as {total}. Não omita nenhuma. : Selecione exatamente 10.}

  Retorne APENAS JSON válido, sem markdown:
  {"top10":[{"id":"COD","nome":"Nome exato da lista","justificativa":"Frase específica."},...]}

  REGRAS:
  1. Selecione exatamente {maxSel} competências.
  2. Use "id" e "nome" EXATAMENTE como aparecem na lista.
  3. A justificativa DEVE citar elemento específico do cargo.

  LISTA DE COMPETÊNCIAS (id | nome | pilar | descrição): ...
  ```
- **Inputs no user prompt**:
  - Empresa (nome, segmento)
  - Cargo (nome, área, descrição, principais entregas, stakeholders, decisões recorrentes, tensões)
  - Valores organizacionais (lista)
  - Contexto cultural do cargo
  - Contexto PPP (até 4000 chars — seções relevantes: perfil, identidade, desafios, vocabulário, etc.)
- **Output esperado**: JSON `{ "top10": [{ id, nome, justificativa }] }`
- **Consumido por**: Persistido em `top10_cargos`. Consumido por Fase 2 (IA2) e pelo gerador de cenários (IA3).

### 1.2 IA2 — Gabarito CIS/DISC ideal por cargo
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase1.ts::rodarIA2`
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 8192
- **Trigger**: Admin clica em "IA2 — Gabarito CIS" em `/admin/empresas/{id}` (Fase 1). Exige IA1 rodada antes.
- **Grounding RAG**: Não. Usa contexto do PPP.
- **Loop**: Sim — 1 chamada por cargo.
- **Retry**: 1 nova chamada se o JSON não traz `gabarito`; há também caminho Batch/Trigger em `trigger/gerar-ia2-batch.ts` com fallback síncrono equivalente.
- **Insumo "valores" (corrigido em 26/07, `062dca13`)**: `buscarValores` (`lib/ia2-gabarito.ts`) deixou de pegar `ppp_escolas.valores` do PPP mais recente e passa a **consolidar os valores de TODAS as escolas** da empresa por frequência (`consolidarValoresDaRede`, determinístico, teto de 10, ordem estável porque o prompt é cacheado). Antes, numa rede como Ibipeba (11 PPPs, 86 valores), o gabarito de **todos os cargos do município** era ancorado nos valores de uma escola sorteada pela data de extração. O `buscarContextoPPP` tinha o mesmo defeito com insumo maior — **fechado em 27/07** (F-I10 do `docs/FMEA-PIPELINE.md`): resolve por número de PPPs (1 → seções curadas, idêntico ao anterior; N → síntese municipal consolidada, compartilhada com o Kit).
- **System prompt** (~2200 chars, resumo):
  ```text
  Você é um especialista em avaliação comportamental CIS/DISC.
  Sua tarefa: gerar o GABARITO COMPORTAMENTAL IDEAL para o cargo descrito.
  O gabarito tem 4 telas. Retorne APENAS JSON válido.

  HIERARQUIA DE FONTES:
  1. DESCRIÇÃO DO CARGO E CONTEXTO DA EMPRESA — fonte primária
  2. SINAIS EXPLÍCITOS DO TEXTO
  3. CONHECIMENTO COMPORTAMENTAL — apenas para refinar, nunca sobrescrever
  4. REGRA DE OURO: Nunca use conhecimento genérico para sobrescrever sinais claros.

  REGRAS DE DIFERENCIAÇÃO:
  - Cargos diferentes DEVEM ter perfis diferentes
  - Pelo menos 2 dos 4 fatores DISC devem diferir entre cargos na mesma empresa

  TELA 1: Características do perfil ideal (pares de opostos) — 20 características da lista PARES_DISC
  TELA 2: 6-10 Sub-competências CIS (das 16: Ousadia, Comando, Objetividade, ...) com faixas
  TELA 3: Estilo Liderança (Executor, Motivador, Metódico, Sistemático — soma = 100)
  TELA 4: Faixas DISC (min/max) para D, I, S, C

  FORMATO JSON: { "gabarito": {tela1, tela2, tela3, tela4}, "raciocinio_estruturado": {sinais_do_caso, leitura_principal, diferenciais_vs_outros_cargos} }
  ```
- **Inputs no user prompt**:
  - Empresa (nome, segmento)
  - Cargo (nome, descrição, entregas, stakeholders, decisões, tensões)
  - Valores organizacionais
  - Top competências selecionadas (IA1)
  - Contexto PPP (até 2000 chars)
  - Instruções: identificar 3-5 sinais explícitos, formar hipótese-base, garantir diferenciação entre cargos.
- **Output esperado**: JSON com `gabarito` (4 telas) + `raciocinio_estruturado`.
- **Consumido por**: Persistido em `cargos_empresa.gabarito` + `cargos_empresa.raciocinio_ia2`. Usado por IA3 (cenários) e FIT v2.

### 1.3 IA3 — Gerar cenários contextuais
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/ia3-cenarios.ts::rodarIA3UmaCore` (prompts em `buildIA3SystemPrompt` + `buildIA3UserPrompt`; wrappers/gates em `actions/fase1.ts` e execução em lote em `trigger/gerar-ia3-batch.ts`)
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 6144
- **Trigger**: Admin executa fila de cenários em `/admin/empresas/{id}` → `listarFilaIA3` → `rodarIA3Uma` por item. 1 competência × cargo por chamada (processamento unitário p/ caber em timeout Vercel Hobby).
- **Grounding RAG**: Não. Usa PPP.
- **Loop**: Sim — fila de competências Top 5 do cargo.
- **Retry**: 1 nova chamada quando a validação estrutural acusa JSON/cobertura inválida; a correção enumera os erros detectados em código.
- **System prompt** (~2000 chars, resumo):
  ```text
  Você é um especialista com 20 anos em avaliação de competências em organizações brasileiras.
  TAREFA: Crie UM cenário situacional + 4 perguntas temáticas para a competência descrita.

  REGRAS DE CONSTRUÇÃO:
  1. DECISÃO FORÇADA (REGRA DE OURO): Se pode responder sem abrir mão de nada → cenário NÃO funciona
     - P1: ESCOLHA — trade-off real
     - P2: COMO — execução com resistência
     - P3: TENSÃO HUMANA
     - P4: SUSTENTABILIDADE
  2. FACETA ESPECÍFICA: testar um aspecto explícito da competência, não a competência genérica
  3. TRADE-OFF CENTRAL: uma escolha difícil e com custo no centro do caso
  4. PODER DISCRIMINANTE: N1 deve ser visivelmente diferente de N3; clichê deve falhar
  5. COBERTURA: cada pergunta cobre 2-3 descritores; as quatro juntas cobrem todos
  6. REALISMO: situação plausível, vocabulário organizacional e um dado concreto
  7. DILEMA ÉTICO EMBUTIDO: caminho fácil conflita com valor, sem moralizar
  8. SOBRIEDADE: máx 2 stakeholders, 2 tensões, contexto ≤900 chars e pergunta ≤200 chars
  9. ANONIMIZAÇÃO: nunca nomear escola, rede, secretaria ou cidade real/inventada

  Retorne APENAS JSON com cenario enriquecido, 4 perguntas diagnósticas e mapa_cobertura_descritores.
  ```
- **Inputs no user prompt**:
  - Empresa (nome, segmento)
  - Cargo (nome, descrição, entregas, stakeholders, tensões)
  - Competência (cod_comp, nome, descrição)
  - Descritores com níveis N1-N4 (gap/em desenvolvimento/meta/referência)
  - Valores organizacionais + regra de dilema ético
  - Perfil CIS ideal do cargo (tela3 estilos + tela4 faixas DISC)
  - Contexto PPP (até 3000 chars)
- **Output esperado**: JSON com `cenario{titulo, contexto, faceta_testada_principal, tradeoff_testado, fator_complicador, stakeholders_centrais[], dilema_etico, armadilha_de_resposta_generica, confianca_cenario, riscos_do_cenario[]}`, quatro `perguntas[{numero, texto, objetivo_diagnostico, descritores_primarios[], o_que_diferencia_niveis, resposta_generica_falha_porque}]` e `mapa_cobertura_descritores`.
- **Inconsistência observada no contrato atual**: o exemplo do campo `contexto` ainda diz “250-400 palavras”, mas a regra de sobriedade, o prompt de regeneração e o auditor usam **≤900 caracteres**. `validarRespostaIA3` verifica quantidade de perguntas, cobertura e confiança, mas não impõe esse comprimento; portanto o limite depende hoje do gerador/auditor.
- **Consumido por**: `banco_cenarios` (alternativas[]). Usado por IA4 (Fase 3) para avaliar respostas.

### 1.4 IA3 — Regenerar cenário (com feedback)
> `WRAPPER` · Prompt documentado como: `reuso` (de 1.3 com appendix de feedback)

- **Arquivo**: `lib/ia3-cenarios.ts::regenerarCenarioIA3ComTrava` (wrapper em `actions/fase1.ts`)
- **Idêntico a IA3** (mesmo system prompt `buildIA3SystemPrompt`), mas com appendix no user prompt:
  ```text
  FEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS): {cen.justificativa_check}\n{cen.sugestao_check}
  ```
- **Trigger**: Admin clica em "Regerar" em cenário com status_check='revisar'.
- **Max tokens**: 6144.
- **Consumido por**: gera a candidata em memória, audita com 1.5 e só atualiza `banco_cenarios` quando `nota_candidata >= nota_atual`; a versão campeã não é destruída.

### 1.5 Check Cenário (Auditor 2ª IA)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/ia3-cenarios.ts::montarCheckIA3Prompt` + `checkCenarioIA3Core` (wrapper em `actions/fase1.ts`)
- **Modelo default**: `gpt-5.6-terra`, pinned pela task `ia3_check`; override explícito por task/modelo é aceito.
- **Max tokens**: 4096
- **Trigger**: Admin clica em "Check" em cenário individual OU lote. Usa IA diferente da que gerou (cross-validation).
- **System prompt** (inline):
  ```text
  Voce e um avaliador especialista em Assessment Comportamental.
  Avalie o cenario e as perguntas com base em 7 dimensoes (total 100):

  1. ADERENCIA A COMPETENCIA (15pts)
  2. COBERTURA DE DESCRITORES (15pts)
  3. REALISMO CONTEXTUAL (15pts)
  4. CONTENCAO E SOBRIEDADE (10pts)
  5. CLAREZA DO TRADE-OFF (15pts)
  6. PODER DISCRIMINANTE (20pts) — dimensão mais importante
  7. AUDITABILIDADE (10pts)

  ERROS GRAVES (forca nota max 60):
  - Pergunta fechada (sim/nao)
  - Cenario com 4+ tensoes simultaneas
  - Contexto com 5+ stakeholders nomeados
  - Pergunta que permite resposta generica sem escolha
  - Competencia avaliada nao e a indicada

  Nota >= 90 = aprovado; 80-89 = aprovado_com_ressalvas; abaixo de 80 = revisar.

  Retorne APENAS JSON: {"nota":85,"erro_grave":false,"dimensoes":{aderencia_competencia,cobertura_descritores,realismo_contextual,contencao_sobriedade,clareza_tradeoff,poder_discriminante,auditabilidade},"justificativa":"...","sugestao":"...","alertas":[]}
  ```
- **Inputs no user prompt**:
  - Cargo, competência
  - Cenário (título, contexto)
  - Perguntas (P1-P4)
  - Descritores (D1-Dn com nome curto)
  - Contexto PPP resumido (500 chars)
- **Output esperado**: JSON `{ nota, erro_grave, dimensoes, ponto_mais_forte, ponto_mais_fraco, descritores_sem_cobertura, perguntas_com_risco, justificativa, sugestao, alertas }`; nota/status são normalizados em código.
- **Consumido por**: Atualiza `banco_cenarios` com `nota_check`, `status_check`, `dimensoes_check`, `justificativa_check`, `sugestao_check`, `alertas_check`. Feedback volta pra regeneração.

---

## Fase 3 — Avaliação IA4 (Mapeamento)

### 2.1 IA4 — Motor de Avaliação de Competências (constante `IA4_SYSTEM`)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/ia4-avaliacao.ts::avaliarUmaRespostaCore` (system prompt em `IA4_SYSTEM`; wrapper/gates em `actions/fase3.ts`; lote em `trigger/gerar-ia4-batch.ts`)
- **Modelo default**: `claude-sonnet-5`, pinned pela task `ia4_avaliacao` (override explícito por task continua valendo)
- **Max tokens**: 16000 (streaming no caminho Claude)
- **Trigger**: Admin executa "Rodar IA4" em `/admin/empresas/{id}`. Avalia TODAS as respostas de colaboradores pendentes (`avaliacao_ia IS NULL`).
- **Grounding RAG**: Não. Usa PPP extraction.
- **Loop**: Sim — 1 chamada por resposta (4 respostas por colab × cenários Top 5).
- **Retry**: Sim — 1 retry se a primeira resposta não for JSON válido (adiciona instrução ao user prompt).
- **System prompt** (>4000 chars, beneficia cache. Resumo):
  ```text
  Voce e o Motor de Avaliacao de Competencias da Vertho Mentor IA.
  Sua tarefa e avaliar as 4 respostas de um profissional a um cenario situacional
  e gerar INSUMOS auditaveis. Media, travas, gap e nivel geral sao calculados em codigo.

  === FILOSOFIA (MODELO TEMATICO) ===
  - 1 cenário padronizado + 4 perguntas temáticas
  - Nivel 3 é META. Abaixo = GAP. O perfil CIS NÃO influencia a NOTA — só o FEEDBACK.

  === REGRAS INVIOLÁVEIS ===
  1. AVALIE SOMENTE COM BASE NA REGUA FORNECIDA
  2. EVIDENCIA OU NAO CONTA ("eu faria..." genérico não é evidência)
  3. RESPOSTA VAGA/CURTA/GENERICA → máximo N1
  4. NA DUVIDA ENTRE DOIS NIVEIS → ESCOLHER O INFERIOR
  5. RESPOSTA SEM ACAO CONCRETA → tende a N2-N3, não N4
  6. LIMITACOES GRAVES pesam mais que pontos positivos
  7. CONFIANCA 0.0-1.0; sustentação insuficiente deve ser explícita

  === TRAVA ANTI-REBAIXAMENTO ===
  Ausência de menção não é automaticamente N1. N1 exige postura excludente,
  passiva ou que ignora a competência; ação concreta impede rebaixamento indevido.

  === PROCESSO 3 ETAPAS ===
  ETAPA 1 (por R1-R4): descritores, evidencias com origem R1-R4, limites, nota_decimal e confianca 0-1
  ETAPA 2 (por descritor): agrega evidencias, sugere nota/nivel e sustentacao forte|fraca|insuficiente
  ETAPA 3: feedback especifico e recomendacoes praticas; consolidacao numerica fica fora do modelo

  O CENARIO NAO E EVIDENCIA: nenhuma frase do enunciado pode sustentar nota da pessoa.

  === ANTI-ALUCINACAO ===
  PROIBIDO inventar nomes ou situações não mencionados.
  Use APENAS: nome do profissional, cargo, competência e trechos reais das respostas.

  CAMPOS OBRIGATORIOS: feedback (nunca vazio), pontos_fortes (≥1), gaps_prioritarios (todos <3)

  Retorne APENAS JSON: {profissional, cargo, competencia, avaliacao_por_resposta, avaliacao_por_descritor, insumos_consolidacao, descritores_destaque, feedback, recomendacoes_pdi}
  ```
- **Inputs no user prompt**:
  - Profissional (nome completo, cargo)
  - Empresa (nome, segmento)
  - Perfil CIS formatado (D/I/S/C, dominante, liderança %, 16 competências)
  - Contexto PPP (até 2000 chars)
  - Competência (código, nome)
  - Descritores com régua N1/N2/N3/N4 completa
  - Cenário (título, contexto)
  - Perguntas com descritores primários e diferenciação por nível
  - 4 Respostas (R1, R2, R3, R4)
- **Output esperado**: JSON de insumos por resposta e por descritor. `consolidarNotasIA4` deriva em código média, nível, gap e travas; `normalizarNiveisDaAvaliacao` propaga a régua única para destaques/PDI.
- **Consumido por**: `respostas` (avaliacao_ia JSONB, nivel_ia4, nota_ia4, pontos_fortes, pontos_atencao, feedback_ia4). Também popula `descriptor_assessments` (alimentando o motor de temporadas).

### 2.2 IA4 — Re-avaliação com feedback do check
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/ia4-reavaliacao.ts::IA4_REVIEW_SYSTEM` + `reavaliarRespostaCore` (wrapper em `actions/fase3.ts`)
- **Modelo default**: `claude-sonnet-5`, pela mesma task pinned `ia4_avaliacao`.
- **System prompt**: prompt próprio de **revisão controlada**; não reutiliza mais `IA4_SYSTEM`.
- **Max tokens**: 16000.
- **Trigger**: Admin clica em "Reavaliar" em resposta com `status_ia4 = 'revisar'`.
- **Princípios**:
  ```text
  Preserve o que era defensável; corrija só o que a auditoria apontou e as
  respostas sustentam. Para cada ponto decida corrigir, corrigir_parcialmente,
  manter ou nao_aplicavel. O cenário nunca é evidência. Toda mudança de nota
  precisa de justificativa explícita.
  ```
- **Output**: `{ avaliacao_revisada, tratamento_do_feedback:{itens,mudancas_relevantes,pontos_preservados} }`; a consolidação e a normalização de níveis são reaplicadas em código.
- **Consumido por**: Atualiza `respostas`, preserva `avaliacao_anterior` e limpa os campos de check para nova auditoria.

---

## Chat Fase 3 — Entrevista + Avaliação + Auditoria

### 3.1 Entrevistadora Mentor IA (conversa fase 3)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `app/api/chat/route.ts::buildSystemPrompt` (usado via `callAIChat`)
- **Modelo default**: `claude-sonnet-4-6` (configurável via `empresas.sys_config.ai.modelo_padrao`)
- **Max tokens**: 1024
- **Trigger**: Colaborador envia mensagem em tela de chat Fase 3 (POST `/api/chat`).
- **Multi-turn**: Sim — mantém histórico em `mensagens_chat`. Máx 10 turnos ou confiança >= 80 com ≥2 evidências.
- **Grounding RAG**: Não.
- ⚠️ **NUNCA EXECUTADO em produção** (medido 31/07): `sessoes_avaliacao` e `mensagens_chat` com **0 registros**. A tela existe (`/dashboard/assessment/chat`) e a rota está ligada, mas o fluxo 3.1→3.2→3.3 nunca rodou ponta a ponta. Antes de otimizar custo/modelo aqui, **rode uma vez** — e veja F-P4 do FMEA para o que caminho nunca percorrido costuma esconder.
- ⚠️ **Sem `taskKey` até 31/07** → o custo caía em `untagged` (que sozinho é 78% do ledger). Agora etiquetado como `conversa_fase3`.
- **System prompt** (~6-7k chars com a régua embutida — acima do limiar de 4000, portanto **cacheado**; encolher abaixo disso desliga o `cache_control` automático). Resumo:
  ```text
  ## PAPEL
  Voce e a Mentor IA, ENTREVISTADORA comportamental da Vertho.
  Seu UNICO objetivo e COLETAR EVIDENCIAS comportamentais.
  Voce NAO e coach, mentora, consultora ou professora. Voce FAZ PERGUNTAS e ESCUTA.

  ## TOM E ESTILO
  - Empatica, profissional, curiosa, neutra
  - Maximo 1 frase de transicao + 1 pergunta
  - Trate como VOCE (2a pessoa)
  - Portugues brasileiro

  ## PROIBICOES ABSOLUTAS
  1. NUNCA JULGUE (nem positiva nem negativamente)
  2. NUNCA DE SUGESTOES, EXEMPLOS OU DICAS
  3. NUNCA FACA PERGUNTAS INDUTIVAS (se contem 'ou', 'por exemplo', opcoes → REFORMULE)
  4. NUNCA PROMETA QUE E A ULTIMA PERGUNTA
  5. NUNCA revele nota, nivel ou avaliacao
  6. NUNCA mencione diagnostico, PDI, DISC ou dados internos
  7. NUNCA invente cenarios
  8. NUNCA assuma comportamentos nao mencionados
  9. NUNCA deixe virar mentoria, coaching ou aconselhamento

  ## 5 DIMENSOES (SEM ordem fixa):
  SITUACAO, ACAO, RACIOCINIO, CONSEQUENCIA, AUTOPERCEPÇÃO

  ## FORCA DA EVIDENCIA (classificacao pedida no prompt)
  FRACA = intencao vaga, generico, sem 1a pessoa, sem contexto
  MODERADA = acao descrita, sem detalhe de contexto ou resultado
  FORTE = acao concreta + contexto + resultado

  ## COMO APROFUNDAR
  NAO encerre com <2 evidencias FORTES, evidencias em ≤2 dimensoes,
  sem autopercepção, so "eu faria" sem exemplo real, ou confianca <70%.

  ## CONTEXTO
  COMPETENCIA: {comp.nome}
  DESCRICAO: {comp.descricao}
  CENARIO: {cenario.titulo + descricao}
  REGUA DE MATURIDADE (interna — NUNCA exponha): {gabarito}

  ## ESTADO DA SESSAO
  FASE ATUAL: {cenario|aprofundamento|contraexemplo|encerramento}
  INSTRUCAO: {...}
  TURNO: {n} de 10, CONFIANCA: {0-100}%, APROFUNDAMENTOS: {n}

  ## BLOCO [META] — OBRIGATORIO EM TODA RESPOSTA (invisivel ao colab)
  [META]
  {
    "proximo_passo": "aprofundar|contraexemplo|encerrar",
    "razao": "...",
    "dimensao_explorada": "situacao|acao|raciocinio|consequencia|autopercepção",
    "dimensoes_cobertas": ["situacao", "acao"],
    "evidencias_coletadas": [
      { "trecho": "...", "tipo": "<uma das 5 dimensoes>",
        "forca": "fraca|moderada|forte", "indicador": "aspecto da regua" }
    ],
    "lacunas_abertas": ["..."],
    "risco_de_encerramento_prematuro": true,
    "confianca": 0-100,
    "aprofundamentos_feitos": n
  }
  [/META]
  A mensagem visivel vem ANTES do bloco.
  ```
- **Inputs no user prompt (via messages array)**:
  - Histórico completo da conversa (role+content) + mensagem atual do colab
- **Output esperado**: Mensagem visível + bloco `[META]` JSON.
- **Consumido por**: `mensagens_chat` (com meta em metadata). Se encerrar → chama 3.2 (eval).
- 🔑 **Como `decidirFase` (`route.ts:441`) realmente consome o META** — encerra só com **todas** estas condições: `evidencias >= 2` **E** `forca='forte' >= 2` **E** `dimensoes_cobertas >= 3` incluindo autopercepção **E** `confianca >= 80` **E** `risco_de_encerramento_prematuro !== true`; ou teto de 10 turnos. Ou seja, `forca`, `lacunas_abertas` e `risco_de_encerramento_prematuro` **não são decorativos** — sem eles o gate não fecha. Aceita `autossensibilidade` como sinônimo legado de `autopercepção` (`:450`), mas o prompt pede `autopercepção`.
- ⚠️ **`evidencias_coletadas` é CUMULATIVA**, não incremental: a IA vê o histórico inteiro e reemite a lista completa a cada turno, e a rota **substitui** (`:236`) em vez de concatenar — concatenar duplicaria. Quem for extrair o META numa chamada separada precisa reproduzir essa semântica: o input pode ser só "estado + última mensagem", mas o **output continua tendo que ser a lista inteira**.
- 📌 **Divergência corrigida em 31/07:** este verbete dizia "4 DIMENSOES ... AUTOSSENSIBILIDADE" e um `evidencias_coletadas:[{trecho,indicador,tipo}]` sem `forca`, sem `lacunas_abertas` e sem `risco_de_encerramento_prematuro`. Uma proposta de redesenho foi escrita a partir deste texto e teria perdido a dimensão CONSEQUENCIA e os três campos que fecham o gate de encerramento. Ao mexer no 3.1, **leia `buildSystemPrompt` e `decidirFase`**, não só este resumo.

### 3.2 Avaliador IA4 do Chat (evalPrompt)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `app/api/chat/route.ts::encerrarSessao` (evalPrompt inline)
- **Modelo default**: `claude-sonnet-4-6` (ou configurado em `sys_config.ai.modelo_padrao`)
- **Max tokens**: **8192** (o catálogo dizia 32768 até 31/07 — o código sempre foi 8192, `route.ts:602` e o versionamento `:593`)
- **taskKey**: `chat_fase3_eval` · **prompt version**: `avaliacao_ia4_conversacional`
- **Trigger**: Ao encerrar sessão de chat Fase 3 — o critério real é o de `decidirFase` (5 condições simultâneas, ver 3.1), não "confiança ≥80 + 2 evidências".
- 🔑 **A IA NÃO CONSOLIDA — e isso é explícito no prompt** ("NÃO calcule média, nível geral, gap ou travas — isso é feito em código", `:544` e `:590`). Ela devolve **por descritor**; média, nível geral, gap, lacuna e travas são derivados em código (`:610-649`), mesma disciplina do `derivarVeredito` da auditoria dual.
- **System prompt** (apenas `system` — user vazio, tudo no prompt único):
  ```text
  Voce e o avaliador final de competencias comportamentais da Vertho.

  COMPETENCIA: {nome} | DESCRICAO: {...} | REGUA: {gabarito}

  EVIDENCIAS COLETADAS DURANTE A CONVERSA: {...}
  HISTORICO COMPLETO DA CONVERSA: {...}

  ## NIVEIS (N1-N4):
  N1 (Gap/Emergente): funcional mas limitada, generica, reativa, sem 1a pessoa
  N2 (Em Desenvolvimento): intencao sem metodo ou consistencia
  N3 (Proficiente/Meta): acoes concretas, estruturadas, resultado
  N4 (Referencia): multiplas dimensoes, multiplicacao, impacto institucional

  ## REGRAS
  1. Base EXCLUSIVA na regua e nas evidencias textuais
  2. EVIDENCIA ou NAO CONTA — intencao nao e evidencia
  3. NA DUVIDA → nivel inferior
  4. N3 exige acao concreta + contexto + resultado
  5. N4 exige multiplas evidencias robustas + visao sistemica
  6. Conversa elegante mas pouco concreta → nota E confianca DEVEM cair
  7. NUNCA invente fatos

  ## PROCESSO (por descritor da regua)
  Extrair evidencias → classificar tipo e forca → limites da conversa →
  nota_sugerida (1.00-4.00) e nivel_sugerido (1-4). Depois, feedback citando
  trechos REAIS. NAO calcular media/nivel geral/gap/travas.

  Retorne APENAS bloco [EVAL]:
  [EVAL]
  {
    "competencia": "...",
    "avaliacao_por_descritor": [
      { "descritor": "...",
        "evidencias": [{"trecho","tipo","forca","fonte"}],
        "limites_da_conversa": ["..."],
        "nota_sugerida": 2.33, "nivel_sugerido": 2, "confianca": 0.75, "racional": "..." }
    ],
    "insumos_consolidacao": {descritores_fortes, descritores_frageis,
                             descritores_sem_sustentacao, alertas_metodologicos},
    "descritores_destaque": {pontos_fortes[], gaps_prioritarios[]},
    "feedback": {resumo_geral, mensagem_positiva, mensagem_construtiva},
    "recomendacoes_pdi": [{"descritor_foco", "acao"}]
  }
  [/EVAL]
  tipo: situacao_real | acao_concreta | raciocinio | consequencia |
        autopercepção | intencao_sem_execucao      forca: fraca|moderada|forte
  ```
- **Inputs**: Tudo embutido no prompt (user vazio): evidências, histórico, régua, competência.
- **Output esperado**: Bloco `[EVAL]` JSON (formato acima).
- 🔑 **Consolidação EM CÓDIGO (`route.ts:610-649`)** — o que a IA não faz:
  - `media_descritores` = média das `nota_sugerida`; `nivel_geral = floor(media)`;
  - `gap = max(0, 3 - nivel_geral)` e `lacuna = -gap`; `confianca_geral` = média das confianças ×100;
  - **três travas**, nesta ordem: `>3 descritores N1` → teto N1; senão `≥1 N1 e nivel>2` → teto N2; e um **piso** — `algum descritor ≥N3 e nivel<2` → mínimo N2.
  - ⚠️ O catálogo dizia "**3+** descritores N1 → N1". O código é `nN1 > 3`, ou seja **4 ou mais**. Com exatamente 3 aplica-se a trava de teto N2, não a de N1.
  - ⚠️ A trava de **piso** (N3 → mínimo N2) não estava documentada e não tem equivalente no prompt: é só código.
  - `feedback` é objeto no JSON e vira **string** por compatibilidade (`:652`).
- **Consumido por**: `sessoes_avaliacao.rascunho_avaliacao`. Versionado via `prompt_version_id`.

### 3.3 Auditor Gemini do Chat (auditPrompt)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `app/api/chat/route.ts::encerrarSessao` (auditPrompt inline)
- **Modelo default**: **`gemini-3.1-flash-lite`** (`DEFAULT_VALIDADOR`, `route.ts:15`) — o catálogo dizia `gemini-3-flash-preview` até 31/07. Provider diferente do 3.2 de propósito: é a cross-validation.
- **Max tokens**: **8192** (o catálogo dizia 65536)
- **taskKey**: `chat_fase3_audit` · **prompt version**: `auditoria_gemini_conversacional`
- **Trigger**: Após 3.2 (eval completa).
- **System prompt** (inline, em português):
  ```text
  Você é um auditor de qualidade de avaliações comportamentais.

  COMPETÊNCIA AVALIADA: {nome} | RÉGUA: {gabarito}
  RASCUNHO DA AVALIAÇÃO (feita por outro modelo de IA): {...}
  EVIDÊNCIAS ORIGINAIS: {...} | HISTÓRICO DA CONVERSA: {...}

  ## 6 CRITÉRIOS
  1. ANCORAGEM EM EVIDÊNCIA      (ok|ajustar|erro_grave) — nota alta sem trecho = ajustar
  2. COERÊNCIA NÍVEL × NOTA      (ok|ajustar) — coerente com a nota e as TRAVAS aplicadas
  3. PRUDÊNCIA CONVERSACIONAL    (ok|ajustar|erro_grave) — N3+ sem ação concreta = erro grave
  4. ALUCINAÇÃO / EXTRAPOLAÇÃO   (ok|ajustar|erro_grave)
  5. ESPECIFICIDADE DO FEEDBACK  (ok|ajustar) — genérico ("boa comunicação") = ajustar
  6. QUALIDADE DAS RECOMENDAÇÕES (ok|ajustar) — proporcionais à força da evidência

  ERROS GRAVES: N3+ sem evidência concreta · fato inventado · feedback que
  contradiz as evidências → status "reprovado" ou "corrigido" com nota reduzida

  [AUDIT]
  {
    "status": "aprovado|corrigido|reprovado", "erro_grave": false,
    "criterios": { ancoragem_evidencia, coerencia_nivel_nota,
                   prudencia_conversacional, alucinacao_extrapolacao,
                   especificidade_feedback, qualidade_recomendacoes },
    "ponto_mais_confiavel": "...", "ponto_mais_fragil": "...",
    "descritores_com_risco": [...],
    "tipo_de_erro_predominante": "extrapolação|falta_prudencia|generico|nenhum",
    "justificativa": "...", "mudancas_aplicadas": [...],
    "alertas_residuais": [...], "avaliacao_corrigida": null
  }
  [/AUDIT]
  Prefira rigor metodológico a elegância.
  ```
- ⚠️ Os nomes dos 6 critérios no catálogo estavam errados (`{evidencias, nivel, nota, lacuna, alucinacoes, vies}`): **`lacuna` e `vies` não existem**, e faltavam prudência conversacional, especificidade do feedback e qualidade das recomendações. Também faltavam 7 campos do bloco (`erro_grave`, `ponto_mais_confiavel`, `ponto_mais_fragil`, `descritores_com_risco`, `tipo_de_erro_predominante`, `mudancas_aplicadas`, `alertas_residuais`).
- **Output esperado**: Bloco `[AUDIT]` JSON.
- **Consumido por**: Se `status=corrigido` → usa `avaliacao_corrigida`, senão mantém rascunho. Persiste em `sessoes_avaliacao.validacao_audit` + `avaliacao_final`. 🔑 Se a correção vier com `avaliacao_por_descritor`, o código **re-consolida** (`:788`) — as travas do 3.2 são reaplicadas sobre a versão corrigida, então o auditor não consegue burlar o teto/piso escrevendo um `nivel_geral` à mão.

### 3.4 Chat Simulador (proxy genérico)
> `AUXILIAR` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `app/api/chat-simulador/route.ts`
- **Modelo default**: `claude-sonnet-4-6` — o `model` do body só é aceito se estiver na **allowlist** `ALLOWED_MODELS` (11 modelos); qualquer outro valor cai no default, silenciosamente.
- **Max tokens**: 4096 · **taskKey**: `chat_simulador`
- **Trigger**: UI de playground/simulador admin chama POST com `{ system, messages, model }`.
- **System prompt**: Fornecido pelo cliente, **truncado em `MAX_SYSTEM_CHARS = 16000`** (default: `"Voce e um assistente util."`).
- 🔒 **É um proxy de LLM — e por isso tem quatro gates**: `csrfCheck` → **`requireAdmin`** (platform admin, não "autenticado": antes aceitava qualquer usuário logado, o que era um proxy de LLM aberto = abuso de custo) → `aiLimiter` por e-mail → allowlist de modelo. Ao mexer aqui, nenhum desses sai: o valor que o cliente escolhe (modelo, tamanho do system) é decisão de custo do servidor.
- **Inputs**: messages array (multi-turn) vindos do cliente.
- **Output esperado**: Texto livre.
- **Consumido por**: Response direto ao cliente (não persiste).

---

## Check IA4 (Auditor 2ª IA)

### 4.1 CHECK IA4 — Auditor de avaliações
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/check-ia4-core.ts` (constante `CHECK_SYSTEM`) — actions em `actions/check-ia4.ts::listarPendentesCheck` + `checarUmaResposta`
- **Modelo default**: `gpt-5.6-terra`, pinned pela task `ia4_check`; override explícito por task é aceito.
- **Max tokens**: 8192
- **Trigger**: Admin clica "Check IA4" em `/admin/empresas/{id}` → lista as respostas com `status_ia4 IS NULL` e audita **uma por request**.
- **Loop**: Sim — 1 chamada por resposta avaliada, **iterada no CLIENTE**. O lote inteiro numa action existe só headless (`checkAvaliacoesCore`, via `scripts/_run-check-ia4.ts`): dentro de um request ele estoura o `maxDuration` de 300s — em 11/08/2026, 14 de 72 checadas e 504 na rota.
- **System prompt atual** (checklist binário; a IA não escreve nota/status):
  ```text
  Você é auditor de qualidade de Assessment Comportamental da Vertho.
  Verifique item a item se a avaliação de outra IA é DEFENSÁVEL.

  Você NÃO dá nota. Para cada verificação semântica (A1, A2, D1, D2, E1,
  E2, F1, F2), responda {"ok":true|false,"obs":"..."}.
  A2 (evidência inventada) é fatal. Na dúvida, marque false e explique.

  Coerência de origem da evidência (A3), níveis (B1/B2), média (C1) e
  travas/gap (C2) são verificadas deterministicamente em código.

  Retorne APENAS JSON: {verificacoes, ponto_mais_confiavel,
  ponto_mais_fragil, descritores_com_risco, tipo_de_erro_predominante,
  justificativa, mudancas_sugeridas, alertas}
  ```
- **Inputs no user prompt**:
  - Colaborador (nome, cargo) + perfil DISC
  - Competência
  - Respostas R1-R4
  - Régua N1-N4 por descritor
  - Cenário + Perguntas
  - Avaliação a auditar (JSON inteiro da IA4)
- **Output esperado**: checklist semântico. O servidor funde os itens de IA com 5 checks determinísticos, soma os pesos até 100 e deriva `aprovado|revisar`; o modelo não controla diretamente nota nem veredito.
- **Consumido por**: `respostas.status_ia4` ('aprovado'|'revisar') + `respostas.payload_ia4` (JSON check).

---

## Fase 5 — Cenário B + Reavaliação + Fusão + Plenária

### 5.1 Gerar Cenário B (lote)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/cenarios-b.ts::buildCenBPrompts` (usado em `gerarCenariosBLote` e `regenerarCenarioB`)
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 6144
- **Temperature**: 0.4 (fiel ao GAS)
- **Trigger**: Admin "Gerar Cenários B" → cria 1 cenário B por competência×cargo que tem cenário A.
- **Loop**: Sim — itera cenários A.
- **System prompt** (resumo atual):
  ```text
  <PAPEL>
  Você é um especialista em avaliação de competências comportamentais com 20 anos de experiência.
  Cria cenários situacionais que funcionam como instrumentos diagnósticos.
  Empresa: {nome} ({segmento})
  </PAPEL>

  <TAREFA>
  Crie um CENÁRIO B complementar ao cenário A já existente.
  O cenário B usa a MESMA competência mas com situação-gatilho DIFERENTE.
  </TAREFA>

  <REGRAS>
  1. MESMA COMPETÊNCIA, OUTRA SITUAÇÃO-GATILHO — diferença estrutural, não cosmética
  2. COMPLEMENTARIDADE — observar uma faceta relevante diferente da principal do A
  3. UTILIDADE PARA TRIANGULAÇÃO — reduzir resposta ensaiada sem perder comparabilidade
  4. REALISMO CONTEXTUAL — máx. 2 stakeholders, sem teatralidade
  5. TRADE-OFF real — se responder bem sem escolher, o instrumento falhou
  6. PODER DISCRIMINANTE — resposta genérica deve falhar
  7. P1 situação · P2 ação · P3 raciocínio · P4 autossensibilidade
  8. DILEMA ÉTICO sutil
  </REGRAS>

  Responda APENAS com JSON válido.
  ```
- **Inputs no user prompt**:
  - Competência (nome, descrição), cargo
  - Descritores (régua N1-N4)
  - Contexto PPP (valores)
  - Cenário A original (título, descrição) — "NÃO repetir"
  - Feedback extra (em regenerarCenarioB: `justificativa_check` + `sugestao_check`)
- **Output esperado**: JSON com cenário/perguntas + `faceta_avaliada`, `facetas_secundarias`, `diferenca_estrutural_vs_cenario_a`, `por_que_essa_variacao_importa`, `tradeoff_testado`, `armadilha_de_resposta_generica`, `objetivo_diagnostico`, régua N1-N4, dilema ético, confiança e riscos.
- **Consumido por**: `banco_cenarios` com `tipo_cenario = 'cenario_b'`.

### 5.2 Check Cenário B
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/cenarios-b.ts::CHECK_CEN_B_SYSTEM` + `avaliarCenB`
- **Modelo default**: `gpt-5.6-terra`, pinned pela task `cenarios_b_check`.
- **Max tokens**: 4096
- **Temperature**: 0.4
- **System prompt**: auditoria própria em 8 dimensões: aderência (15), diferença estrutural vs A (15), complementaridade (10), realismo (10), trade-off (15), poder discriminante (15), adequação das perguntas à semana final (10) e utilidade para triangulação (10). Erro grave limita a nota a 60 em código.
- **Trigger**: Inline após geração lote (se `checkModel` informado), ou standalone `checkCenarioBUm` / `checkCenariosBLote`.
- **Output/Consumido**: Mesmos campos `nota_check`, `status_check`, etc em `banco_cenarios`.

### 5.3 Reavaliação conversacional (sessão 8 turnos)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/reavaliacao.ts::buildReavSystemPrompt` + `processarReavaliacao`
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 4096
- **Temperature**: 0.4
- **Trigger**: Colaborador abre conversa de reavaliação pós-14 semanas. Mantém histórico em `reavaliacao_sessoes`.
- **Multi-turn**: Sim (`callAIChat`). Máx 8 turnos ou `[META]{"encerrar":true}[/META]`.
- **System prompt** (~2000 chars, resumo):
  ```text
  Você é o Mentor IA do programa Vertho. Está conduzindo uma conversa de reavaliação com {nome} após {N} semanas de capacitação.

  ## OBJETIVO
  Investigar o que MUDOU NA PRÁTICA — não teoria aprendida. Buscar evidências concretas de mudança comportamental.

  ## SABE SOBRE ESTE COLAB
  - Competência, nível baseline, cargo, DISC (perfil + D/I/S/C)
  - Trilha: {pct}% concluída, semana {X}/14
  - Pontos fortes identificados, gaps prioritários
  - Descritores (nome + código)

  ## ROTEIRO (6 etapas)
  1. ACOLHIMENTO
  2. MUDANÇA GERAL (pergunta aberta, sem direcionar)
  3. EVIDÊNCIA CONCRETA
  4. DESCRITOR ESPECÍFICO (gap principal)
  5. DIFICULDADE PERSISTENTE
  6. ENCERRAMENTO

  ## REGRAS INVIOLÁVEIS
  1. Tom MENTOR: curioso, acolhedor, não julgador
  2. NUNCA revele nível ou nota inicial
  3. NUNCA cite descritores por código (D1, D2...)
  4. FATOS > opiniões ("o que FEZ" > "o que ACHA")
  5. Resposta teórica → redirecione pra prática
  6. Máx 8 turnos
  7. Use [META]{"turno":N,"encerrar":false}[/META] ao fim

  Você NÃO está avaliando. Está coletando evidências.
  ```
- **Inputs (messages)**: Histórico completo da conversa.
- **Output**: Mensagem + bloco `[META]`. Quando encerra, dispara extração (5.4).
- **Consumido por**: `reavaliacao_sessoes.historico`.

### 5.4 Extração qualitativa (após encerrar reavaliação)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/reavaliacao.ts::extrairDadosReavaliacao`
- **Max tokens**: 8192
- **Temperature**: 0.4
- **System prompt** (resumo editorial do prompt real):
  O prompt completo está em `actions/fase5/reavaliacao.ts::extrairDadosReavaliacao`. Princípios-chave:
  1. Extrair APENAS o que foi dito ou claramente sustentado — não completar lacunas.
  2. Fala teórica não vale como evidência forte; exemplo concreto pesa mais.
  3. Se não houver base suficiente, reduzir a confiança.
  4. Não forçar um descritor a ter evidência se a conversa não o cobrir.
  5. `nivel_percebido` é leitura qualitativa provisória, não avaliação final.
  6. DISC/CIS é contexto, não destino.
  7. Toda evidência relevante deve ter citação curta de sustentação.
  8. Força da evidência: `fraca` (abstrata/genérica), `moderada` (concreta mas incompleta), `forte` (concreta + coerente + ação + consequência).
  9. Também extrai sinais `[META]` acumulados na conversa, quando disponíveis.
- **Inputs no user prompt**:
  - Competência, colaborador (nome, cargo), nível baseline, perfil DISC
  - Descritores da competência (códigos + nomes)
  - Sinais [META] coletados durante a conversa (se disponíveis)
  - Conversa completa formatada (COLABORADOR: / MENTOR:)
- **Output**: JSON com campos: `resumo_qualitativo{leitura_geral, sinal_mais_forte, limite_mais_relevante}`, `evidencias_por_descritor[{descritor, nome_descritor, evidencia_relatada, nivel_percebido, confianca(0-1), forca_da_evidencia, citacao_literal, limite_da_evidencia}]`, `gaps_persistentes[{gap, sinal}]`, `ganhos_qualitativos[]`, `consciencia_do_gap{nivel, justificativa}`, `conexao_cis{leitura, cuidados_de_interpretacao[]}`, `recomendacao_ciclo2{descritores_foco[], justificativa, tipo_de_trabalho_sugerido[]}`, `alertas_metodologicos[]`.
- **Consumido por**: `reavaliacao_sessoes.extracao_qualitativa` (mantendo `_contexto_sessao`).

### 5.5 Evolução com Fusão de 3 Fontes
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/evolucao.ts::gerarEvolucaoFusao`
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 8192 (system alocado 64000 no select, mas callAI recebe 8192)
- **Temperature**: 0.4
- **Trigger**: Admin "Gerar Evolução" — por colaborador×competência.
- **Loop**: Sim.
- **System prompt** (resumo editorial do prompt real):
  O prompt completo está em `actions/fase5/evolucao.ts::gerarEvolucaoFusao`. Princípios-chave:
  1. Evidência demonstrada (Cenário B) pesa mais que relato (conversa).
  2. Relato qualitativo forte pode complementar ou revelar "evolução invisível".
  3. Fala bonita mas abstrata NÃO confirma evolução.
  4. Ausência de delta não impede leitura qualitativa (com prudência).
  5. NÃO inventar mudança, impacto ou comportamento.
  6. DISC/CIS NÃO altera nota — serve apenas como leitura contextual.
  7. Se as fontes conflitam, explicitar o conflito e reduzir a confiança.
  Análise por descritor: nível A, nível B, delta, evidência demonstrada + força, evidência relatada + força, citação, dificuldade persistente, convergência, conexão CIS, confiança + limites.
  Convergência: `EVOLUCAO_CONFIRMADA`, `EVOLUCAO_PARCIAL`, `SEM_EVOLUCAO`, `EVOLUCAO_INVISIVEL`.
  Consciência do gap: `alta` (reconhece + cita ações), `media` (reconhece parcialmente), `baixa` (não reconhece ou externaliza).
- **Inputs no user prompt**:
  - Empresa, colaborador (nome, cargo, perfil DISC)
  - Competência + descritores
  - FONTE 1: Cenário A (nivel, avaliacao_ia JSON completo)
  - FONTE 2: Cenário B (nivel, avaliacao_ia)
  - FONTE 3: Extração Sem15 (sem `_contexto_sessao`)
  - Trilha: pct_conclusao, semana_atual, cursos concluídos
- **Output**: JSON com campos: `resumo_executivo`, `evolucao_por_descritor[{descritor, nome, nivel_a, nivel_b, delta, evidencia_cenario_b, forca_evidencia_cenario_b, evidencia_conversa, forca_evidencia_conversa, citacao_colaborador, dificuldade_persistente, convergencia, conexao_cis, confianca(0-1), limites_da_leitura[]}]`, `ganhos_qualitativos[]`, `gaps_persistentes[{gap, sinal, fonte_principal}]`, `consciencia_do_gap{nivel, justificativa}`, `trilha_efetividade{semanas_concluidas, cursos_concluidos, correlacao, justificativa}`, `recomendacao_ciclo2{descritores_foco[], justificativa, formato_sugerido, conexao_cis}`, `feedback_colaborador{mensagem_positiva, mensagem_construtiva, proximo_passo}`, `alertas_metodologicos[]`.
- **Consumido por**: `relatorios` tipo='evolucao' (upsert).

### 5.6 Plenária de Evolução Institucional
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/evolucao.ts::gerarPlenariaEvolucao`
- **Max tokens**: 8192
- **Temperature**: 0.4
- **Trigger**: Admin "Gerar Plenária" — agrega todos os relatórios de evolução (anônimo).
- **System prompt** (resumo editorial do prompt real):
  O prompt completo está em `actions/fase5/evolucao.ts::gerarPlenariaEvolucao`. Princípios-chave:
  1. Dados são ANÔNIMOS — NUNCA citar nomes ou casos identificáveis.
  2. Usar estatísticas, percentuais, tendências e padrões.
  3. CELEBRAR avanços ANTES de apontar gaps.
  4. Ser construtivo, claro e orientado a ação.
  5. Não superinterprete sinais fracos — dizer quando é tendência, não certeza.
  6. Evitar frases genéricas que serviriam para qualquer empresa.
  7. Explicitar limites da leitura (amostra pequena, pouca diferença, etc.).
  6 seções obrigatórias: VISAO_GERAL, ANALISE_POR_CARGO, ANALISE_POR_COMPETENCIA, CONVERGENCIA_DE_EVIDENCIAS, GAPS_PERSISTENTES, RECOMENDACOES_CICLO_2.
- **Inputs no user prompt**: Empresa, total analisados, delta médio, descritores que subiram (%), convergências (CONFIRMADA/PARCIAL/SEM/INVISIVEL com %), por cargo (delta, descritores, colabs), por competência, gaps persistentes top 10.
- **Output**: JSON com campos: `visao_geral_da_evolucao{resumo_executivo, delta_medio, percentuais_convergencia{...}, descritores_com_maior_evolucao[], leitura_geral}`, `analise_por_cargo[{cargo, principais_avancos[], gaps_mais_frequentes[], leitura}]`, `analise_por_competencia[{competencia, sinais_de_avanco[], pontos_de_atencao[], leitura}]`, `convergencia_de_evidencias{leitura, pontos_fortes_do_processo[], limites_do_processo[]}`, `gaps_persistentes_alerta_institucional{top_gaps[], leitura, riscos_se_nada_mudar[]}`, `recomendacoes_para_ciclo_2{prioridades_por_competencia[], prioridades_por_cargo[], formatos_sugeridos[], acoes_recomendadas[]}`, `alertas_metodologicos[]`, `limites_da_leitura[]`.
- **Consumido por**: `relatorios` tipo='plenaria_evolucao'.

### 5.7 Relatório RH Manual (pós-ciclo)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/relatorios-envios.ts::gerarRelatorioRHManual`
- **Max tokens**: 8192
- **Temperature**: 0.4
- **System prompt** (resumo editorial do prompt real):
  O prompt completo está em `actions/fase5/relatorios-envios.ts::gerarRelatorioRHManual`. Princípios-chave:
  1. Relatório executivo, analítico e útil para decisão de RH — NÃO resumo genérico, comemoração ou marketing.
  2. Comparar diagnóstico anterior (relatório RH baseline) com evolução observada.
  3. Produzir leitura estratégica sobre: o que mudou, o que permaneceu, o que vale sustentar, o que precisa entrar no próximo ciclo.
  4. Ser estratégico e orientado a decisão.
  5. Não forçar impacto onde a base for fraca.
  6. Celebrar avanços reais, sem inflar conclusões.
  7. Diferenciar claramente gap resolvido, mitigado e persistente.
  8. Toda recomendação relevante deve ter conexão com os dados.
  9. Quando houver limitação metodológica, explicitar.
- **Inputs**: Empresa, relatório RH anterior (baseline, até 3000 chars), plenária de evolução (até 3000 chars), evolução agregada anônima (cargo, competência, resumo, convergências, gaps, ganhos por colaborador).
- **Output**: JSON com campos: `resumo_executivo{leitura_geral, principal_ganho, principal_lacuna_remanescente}`, `roi_desenvolvimento{leitura, sinais_de_retorno[], limites_da_inferencia[]}`, `evolucao_organizacional{sintese, ganhos_mais_consistentes[], evidencias_agregadas[]}`, `gaps_resolvidos[{gap, o_que_mudou, grau_resolucao}]`, `gaps_persistentes[{gap, por_que_permanece, risco_organizacional}]`, `recomendacoes_estrategicas[{recomendacao, horizonte, justificativa}]` (max 5), `proximos_ciclos{focos_prioritarios[], publicos_prioritarios[], formatos_recomendados[], criterio_de_priorizacao}`, `alertas_metodologicos[]`.
- **Consumido por**: `relatorios` tipo='rh_manual'.

### 5.8 Relatório Plenária (formal)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/relatorios-envios.ts::gerarRelatorioPlenaria`
- **Max tokens**: 8192
- **Temperature**: 0.4
- **System prompt** (resumo editorial do prompt real):
  O prompt completo está em `actions/fase5/relatorios-envios.ts::gerarRelatorioPlenaria`. Princípios-chave:
  1. Documento formal, executivo e acionável — NÃO ata literal, transcrição ou texto genérico.
  2. Manter anonimato dos participantes e dados individuais.
  3. Diferenciar claramente dado apresentado de decisão tomada.
  4. Não inventar consenso, fala ou encaminhamento.
  5. Organizar o relatório com clareza institucional.
  6. Ser formal, mas sem burocracia excessiva.
  7. O relatório deve ser útil para leitura posterior e memória do ciclo.
  8. Valorizar avanços reais sem esconder gaps importantes.
- **Inputs**: Empresa (nome, segmento, data), dados da plenária de evolução (até 5000 chars), relatório RH como contexto estratégico (até 2000 chars).
- **Output**: JSON com campos: `identificacao{titulo, empresa, competencia_ou_escopo, periodo_referente, data_relatorio}`, `pauta{objetivo_da_plenaria, topicos_principais[]}`, `resultados_apresentados{visao_geral, destaques_positivos[], pontos_de_atencao[]}`, `leitura_institucional{interpretacao_geral, tensoes_relevantes[], implicacoes_para_o_negocio_ou_operacao[]}`, `deliberacoes[{deliberacao, justificativa}]` (max 6), `encaminhamentos[{encaminhamento, responsavel_tipo, horizonte, objetivo}]` (max 8), `fechamento_executivo{sintese_final, proximo_marco_sugerido}`, `alertas_metodologicos[]`.
- **Consumido por**: `relatorios` tipo='plenaria_relatorio'.

### 5.9 Dossiê do Gestor (executivo)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/relatorios-envios.ts::gerarDossieGestor`
- **Max tokens**: 8192
- **Temperature**: 0.4
- **System prompt** (resumo editorial do prompt real):
  O prompt completo está em `actions/fase5/relatorios-envios.ts::gerarDossieGestor`. Princípios-chave:
  1. Documento executivo, claro e útil para o gestor entender o time e agir — NÃO resumo bonito, marketing ou relatório individual.
  2. Comparar diagnóstico inicial e evolução observada.
  3. Não forçar conclusões positivas.
  4. Diferenciar avanço consistente de ganho parcial.
  5. O ROI deve ser prudente e gerencial, não fictício.
  6. Toda recomendação deve ter conexão com os dados.
  7. O dossiê deve ajudar o gestor a agir, não apenas a entender.
  8. Sem linguagem genérica que serviria para qualquer equipe.
- **Inputs**: Empresa (nome, segmento), plenária de evolução (até 3000 chars), relatório RH (até 2000 chars), relatórios por tipo (colaborador, cargo, resumo — até 4000 chars).
- **Output**: JSON com campos: `titulo`, `sumario_executivo{leitura_geral, principal_ganho_do_ciclo, principal_alerta_para_gestao}`, `diagnostico_inicial{fotografia_da_equipe, forcas_iniciais[], riscos_iniciais[], implicacao_gerencial_inicial}`, `evolucao{sintese, avancos_consistentes[{tema, evidencia}], ganhos_parciais[{tema, limite}], gaps_que_permanecem[{gap, risco_para_gestao}]}`, `roi{leitura, ganhos_para_a_gestao[], limites_do_retorno[]}`, `recomendacoes[{recomendacao, horizonte, objetivo, justificativa}]` (max 6), `conclusao{fechamento, proximo_passo_recomendado}`, `alertas_metodologicos[]`.
- **Consumido por**: `relatorios` tipo='dossie_gestor'.

### 5.10 Check Cenários (lote geral)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase5/relatorios-envios.ts::checkCenarios`
- **Modelo default**: `gemini-3.6-flash` quando não há modelo explícito.
- **Max tokens**: 8192
- **Temperature**: 0.4
- **System prompt** (resumo editorial do prompt real):
  O prompt completo está em `actions/fase5/relatorios-envios.ts::checkCenarios`. Princípios-chave:
  1. Auditar se cada cenário realmente funciona como instrumento prático e discriminante — NÃO apenas revisar texto ou procurar "cenários bonitos".
  2. Realismo contextual, dilema concreto e poder discriminante importam.
  3. Perguntas genéricas enfraquecem o cenário.
  4. Texto bonito não compensa fraqueza metodológica.
  5. Cenário com baixa utilidade prática não deve ser aprovado.
  6. Toda ressalva ou reprovação deve gerar orientação clara de correção.
  7. Sinais de problema: situação abstrata demais, contexto pouco plausível, conflito fraco, pergunta óbvia/moralizante, "conversaria com todos" resolve fácil, baixa diferença entre respostas fortes/fracas, descritor mal testado, excesso de didatismo, cenários muito parecidos no lote.
- **Inputs**: Até 20 cenários em lote com: id, titulo, cargo, competencia, contexto_resumido, faceta, tradeoff, armadilha, qtd perguntas.
- **Output**: JSON com campos: `total`, `aprovados`, `com_ressalvas`, `reprovados`, `detalhes[{cenario_id, titulo, status, nota_geral(0-10), dimensoes{aderencia_competencia, realismo_contextual, dilema_e_tensao, poder_discriminante, qualidade_perguntas, risco_de_generico, prontidao_para_uso}, forcas[], problemas[], ajustes_sugeridos[], justificativa_curta}]`, `leitura_do_lote{padroes_positivos[], padroes_de_risco[], recomendacao_editorial}`, `alertas_metodologicos[]`. Regras: aprovado >= 7, com_ressalvas 5-6.9, reprovado < 5.

---

## Motor de Temporadas (duração configurável)

> **Modos atuais:** a mesma cadeia atende Regular/DUO (14 sem), Onboarding (10), Jornada (7) e Piloto (2 semanas de evidência + fechamento). Duração e marcos vêm do plano/carimbo da trilha (`programa_modo` + `programa_config`), não de literais `14`. Os prompts de fechamento recebem `semanaFinal` e `semanasEvidencia`.

### 6.1 Prompt Desafio Semanal (conteúdo)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/challenge.ts::promptDesafio`
- **Callers**: `lib/season-engine/build-season.ts::montarSemanaConteudo`, `actions/temporadas.ts::regerarSemana`
- **Max tokens**: 400
- **Trigger**: Geração de temporada (semanas 1-12 de conteúdo, exceto 4/8/12) ou regenerar semana.
- **System prompt** (resumo editorial do prompt real em `challenge.ts`):
  Você é um designer instrucional da Vertho especializado em micro-ações práticas para desenvolvimento de competências em adultos. Princípios-chave:
  1. O desafio deve ser UMA ação principal, observável, que cabe na rotina da semana
  2. Coerente com cargo/contexto e ligada ao descritor; não pode ser genérico
  3. Proporcional ao nível atual (N1=ação simples/baixo risco, N2=critério/repetição, N3=refinamento/adaptação, N4=influência/multiplicação)
  4. Curto (2-3 frases), concreto, viável, singular (nunca 2 tarefas), sem jargão/tom professoral/slogan
  5. Sem "Esta semana...", sem depender de grande projeto ou autorização complexa
- **Inputs no user prompt**: Cargo, setor/contexto, competência, descritor, nível atual (1-4 com label de progressão), semana (1-12).
- **Output**: JSON `{ desafio_texto, acao_observavel, criterio_de_execucao, por_que_cabe_na_semana }`. Validação: `parseDesafioResponse` — valida strings min 5 chars + max 4 frases em desafio_texto.
- **Consumido por**: `trilhas.temporada_plano[].conteudo.desafio_texto`.

### 6.2 Prompt Cenário (aplicação — sems 4/8/12)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/scenario.ts::promptCenario`
- **Callers**: `lib/season-engine/build-season.ts::montarSemanaAplicacao`, `actions/temporadas.ts::regerarSemana`
- **Max tokens**: 800
- **System prompt** (resumo editorial do prompt real em `scenario.ts`):
  Você é um designer de casos para desenvolvimento de competências executivas na Vertho. Cria cenário de APLICACAO PRATICA (fallback quando colab nao executa missao real). Principios-chave:
  1. Cenario realista para o cargo/contexto, com tensao central clara
  2. Forca decisao, priorizacao ou criterio; teste do "conversaria com todos" deve falhar
  3. Nao permite resposta generica como solucao suficiente; nao da a resposta no enunciado
  4. Max 2 stakeholders principais; proporcional a complexidade pedida
  5. 3 niveis de complexidade: simples (direto, 1 tensao), intermediario (fator complicador relevante), completo (tradeoff sofisticado, pressao contextual forte)
  6. Sem excesso de subtramas, sem moral embutida, sem pergunta fechada
- **Inputs no user prompt**: Cargo, setor/contexto, competencia, descritores avaliados, complexidade (simples|intermediario|completo).
- **Output**: JSON `{ contexto, tensao_central, fator_complicador, stakeholders[], tradeoff_testado, armadilha_resposta_generica, pergunta, complexidade_aplicada, por_que_essa_complexidade_faz_sentido }`. Validacao: `parseCenarioResponse` — valida campos + stakeholders max 2. Renderizacao: `cenarioToMarkdown`.
- **Consumido por**: `trilhas.temporada_plano[].cenario.texto`.

### 6.3 Prompt Missão Prática (aplicação — modo prática)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/missao.ts::promptMissao`
- **Callers**: `lib/season-engine/build-season.ts::montarSemanaAplicacao`, `actions/temporadas.ts::regerarSemana`
- **Max tokens**: 600
- **System prompt** (resumo editorial do prompt real em `missao.ts`):
  Voce e um designer de missoes praticas de desenvolvimento da Vertho. Cria UMA missao pratica de trabalho real para semanas 4, 8, 12. Principios-chave:
  1. A missao e uma ACAO REAL no trabalho (nao resposta escrita, nao cenario hipotetico, nao reflexao)
  2. Integra 3 descritores de forma organica em uma unica experiencia pratica (nao subtarefas artificiais)
  3. Executavel em ate 1 semana, plausivel para o cargo/contexto
  4. Gera evidencia observavel para relato posterior
  5. Nao pode ser generica, nao pode virar checklist de tarefas independentes
  6. Curta (max 3 frases), concreta, especifica, sem jargao/tom professoral/slogan
- **Inputs**: Cargo, setor/contexto, competencia, descritores a integrar.
- **Cobertura (regra de 28/07)**: os descritores passados ao prompt são os do **bloco que acabou de fechar** — alocados em semanas de conteúdo desde a missão anterior (corte por `semanas_ids` em `descritoresEntreguesNaMissao`, `build-season.ts`): semana 4 → semanas 1-3, semana 8 → semanas 5-7. Só a última missão (semana 12) é cumulativa (as 9 semanas). Antes, a semana 4 já cobrava o bloco que só começava na semana 5 (medido no Ibipeba: missão integrando Autocuidado sem nenhum conteúdo dele entregue).
- **Output**: JSON `{ missao_texto, acao_principal, contexto_de_aplicacao, criterio_de_execucao, integracao_descritores[{descritor, como_aparece}], por_que_cabe_na_semana }`. Validacao: `parseMissaoResponse` — valida strings min 5 chars + max 4 frases + integracao_descritores obrigatorio. Renderizacao: `missaoToMarkdown`.
- **Consumido por**: `trilhas.temporada_plano[].missao.texto`.

### 6.4 Socrático — Conversa semanal (sems de conteúdo)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/socratic.ts::promptSocratic`
- **Callers**: `app/api/temporada/reflection/route.ts` (send/init), `lib/season-engine/simulador-core.ts::simularSocratico`
- **Max tokens**: 2000
- **Multi-turn**: Sim (`callAIChat`). Max 6 turnos IA.
- **Grounding RAG**: Sim — `groundingContext` passado via parâmetro (vem de `retrieveContext` no route).
- **Trigger**: Colab abre chat de reflexão semanal.
- **System prompt** (resumo editorial do prompt real em `socratic.ts`):
  Voce e um mentor de desenvolvimento de competencias da Vertho, com postura socratica: curiosa, acolhedora, respeitosa e nao-diretiva. Sua forca esta em FAZER PERGUNTAS que levem a pessoa a perceber algo por conta propria. Principios-chave:
  1. Nunca julga (nem positiva nem negativamente); nunca da conselho direto ou resposta pronta
  2. Nunca usa jargao de coaching; sempre portugues brasileiro natural, informal mas respeitoso
  3. UMA pergunta por turno (exceto fechamento); conversa curta, leve e util
  4. Nunca substitua o pensamento do colaborador; nunca elogie de forma avaliativa
  5. Nunca transforme a conversa em avaliacao formal
  6. DISC adapta TOM e GATILHOS (funcao `estiloPorPerfil` gera tom/gatilhos/evitar por D/I/S/C), nunca o conteudo
  7. Anti-vago: cada turno tem regra especifica para rejeitar respostas vagas/genericas (pedir exemplo concreto, situacao especifica, contraste antes/depois)
  8. Grounding disciplinado: use apenas se a conversa naturalmente pedir, como apoio breve, conectado ao que a pessoa ja trouxe

  PROGRESSAO 6 TURNOS:
  T1 ABERTURA (cumprimento + 1 pergunta aberta, max 60 palavras) | T2 CONTEXTO CONCRETO (detalhes da situacao, max 50 palavras) | T3 MOTIVACAO (por que agiu assim, max 50 palavras) | T4 INSIGHT (o que percebeu/aprendeu, max 50 palavras) | T5 GENERALIZACAO (transferencia para outras situacoes, max 50 palavras) | T6 FECHAMENTO OBRIGATORIO (sem perguntas, bullets: Desafio realizado/parcial/nao + Insight + Compromisso, max 100 palavras)
- **Inputs (messages)**: Historico completo da conversa + contexto DISC + groundingContext.
- **Output**: Mensagem IA no formato do turn atual (texto livre, nao JSON).
- **Consumido por**: `temporada_semana_progresso.reflexao.transcript_completo`.

### 6.5 Analytic — Feedback sobre cenário escrito (modo cenário)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/analytic.ts::promptAnalytic`
- **Caller**: `app/api/temporada/reflection/route.ts` (tipoConversa='analytic')
- **Max tokens**: 2000
- **Max turnos IA**: 10
- **Multi-turn**: Sim.
- **System prompt** (resumo editorial do prompt real em `analytic.ts`):
  Voce e um avaliador-mentor da Vertho que conduz conversa de feedback analitico sobre a resposta de um colaborador a um cenario escrito. Nao esta fazendo avaliacao formal nem dando a resposta certa; esta ajudando a enxergar pontos fortes e lacunas. Principios-chave:
  1. So afirme o que esta LITERALMENTE na resposta; se algo nao estiver, pergunte antes de assumir
  2. Nunca invente intencao, criterio, acao ou consequencia
  3. Nunca transforme em correcao professoral; nunca de resposta pronta ou gabarito
  4. Nunca use perguntas binarias, indutivas ou falsas dicotomias
  5. UMA pergunta por turno (exceto fechamento); tom respeitoso, analitico e construtivo
  6. Anti-vago: peca exemplo concreto, explicitacao do criterio, consequencia da escolha
  7. Proibido: "voce deveria...", "o certo seria...", "a melhor resposta e..."

  PROGRESSAO 10 TURNOS:
  T1-2 O QUE APARECEU (cite trechos literais, peca elaboracao) | T3 LACUNAS/FRAGILIDADES (pergunte se considerou, nao afirme) | T4 RACIOCINIO/CRITERIO | T5 CONSEQUENCIA (foco d1) | T6 PROFUNDIDADE d2 | T7 PROFUNDIDADE d3 | T8 CONSISTENCIA (teste coerencia interna) | T9 INTEGRACAO FINAL | T10 FECHAMENTO OBRIGATORIO (3 bullets: O que ja mostra / O que ficou pouco sustentado / Proximo ponto, max 150 palavras, sem gabarito, sem perguntas)
- **Inputs (messages)**: Historico completo + cenario + descritores cobertos.
- **Output**: Mensagem IA no formato do turn atual (texto livre).
- **Consumido por**: `temporada_semana_progresso.feedback.transcript_completo`.

### 6.6 Missão Feedback — Feedback sobre relato de missão (modo prática)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/missao-feedback.ts::promptMissaoFeedback`
- **Caller**: `app/api/temporada/reflection/route.ts` (tipoConversa='missao_feedback')
- **Max tokens**: 2000
- **Max turnos IA**: 10
- **Grounding RAG**: Sim (`groundingContext`).
- **System prompt** (resumo editorial do prompt real em `missao-feedback.ts`):
  Voce e um avaliador-mentor da Vertho analisando a EVIDENCIA REAL trazida por um colaborador sobre a execucao de uma missao pratica no trabalho. Principios-chave:
  1. So afirme o que o colaborador disse explicitamente; pergunte antes de assumir
  2. REGRA ANTI-ALUCINACAO: proibido pressuponha fatos nao narrados literalmente
  3. Nunca invente acao, criterio, consequencia ou impacto; nunca transforme em aula/mentoria diretiva
  4. UMA pergunta por turno (exceto fechamento); perguntas abertas e neutras
  5. Anti-relato-bonito: relato generico sem pratica concreta -> puxe de volta para fato, acao, consequencia
  6. Grounding disciplinado: use apenas se a conversa realmente pedir, como apoio breve
  7. Proibido: assumir exito sem evidencia, elogiar genericamente, dar gabarito

  PROGRESSAO 10 TURNOS:
  T1 O QUE FOI FEITO | T2 CONTINUACAO | T3 CONTEXTO/CRITERIO (d1) | T4 ADAPTACAO (d1) | T5 CONSEQUENCIA (d2) | T6 CONSEQUENCIA cont (d2) | T7 CONEXAO DESCRITORES (d3) | T8 PONTOS PARCIAIS | T9 SINTESE PRATICA | T10 FECHAMENTO (3 bullets: O que a pratica demonstrou / O que ficou parcial / Proximo ponto, max 150 palavras)
- **Consumido por**: `temporada_semana_progresso.feedback.transcript_completo`.

### 6.7 Extração estruturada pós-conversa (semanal)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `app/api/temporada/reflection/route.ts::extrairDadosEstruturados`
- **Max tokens**: 2000 (socratic) / 3000 (analytic+missao)
- **System prompt** (resumo editorial de `EXTRATOR_CORE_SYSTEM` em `reflection/route.ts`):
  Voce e um extrator de dados estruturados da Vertho. Nao avalia, nao aconselha, nao completa lacunas. Extrai o que a conversa realmente sustenta. 10 principios-chave:
  1. Extraia somente o que foi dito ou claramente sustentado
  2. Nao invente comportamento, avanco, execucao ou insight
  3. Fala articulada nao e prova; exemplo concreto com acao+consequencia vale mais
  4. Se faltar base, reduza confianca/forca em vez de inventar
  5. Intencao sem execucao = evidencia fraca; autocritica sem mudanca = sinal, nao prova
  6. Toda leitura deve ter trecho/parafrase de sustentacao
  7. Se descritor nao tiver base, explicite; output util para merge/avaliacao/relatorio
  Forca: fraca (abstrata) | moderada (concreta mas incompleta) | forte (acao+criterio+consequencia)
- **Output (socratic)**: JSON `{ desafio_realizado:"sim|parcial|nao", relato_resumo, insight_principal, compromisso_proxima, qualidade_reflexao:"alta|media|baixa", citacao_chave, sinais_extraidos:{exemplo_concreto, autopercepcao, compromisso_especifico, conexao_com_pratica}, limites_da_conversa[] }`. Validacao: `validateExtracaoSocratic`.
- **Output (analytic/missao_feedback)**: JSON `{ avaliacao_por_descritor[{descritor, nota:1.0-4.0, forca_evidencia, observacao, trecho_sustentador, limite}], sintese_bloco, alertas_metodologicos[] }`. Validacao: `validateExtracaoAnalytic`.
- **Consumido por**: Merge em `reflexao` ou `feedback` do progresso.

### 6.8 Tira-Dúvidas (tutor reativo)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/tira-duvidas.ts::promptTiraDuvidas`
- **Caller**: `app/api/temporada/tira-duvidas/route.ts`
- **Modelo**: `claude-sonnet-4-6` (hardcoded atualmente na rota)
- **Max tokens**: 1500
- **Multi-turn**: Sim. Sem limite rígido de turnos (rate limit 10/dia).
- **Grounding RAG**: Sim — `retrieveContext` com query = última pergunta, top 5 chunks.
- **System prompt** (resumo editorial do prompt real em `tira-duvidas.ts`):
  Voce e o Tira-Duvidas da Vertho, tutor especializado na competencia, com foco EXCLUSIVO no descritor da semana. Principios-chave:
  1. ESCOPO ABSOLUTO: so responde dentro do descritor da semana (definicao, comportamentos, exemplos, erros comuns, microexercicios, situacoes reais do cargo)
  2. Fora do escopo (outros descritores, politicas internas, juridico/medico/psicologico, avaliacao formal): recusa educada + explica + redireciona
  3. Responda com base na definicao do descritor + conteudo da semana + contexto do cargo + base curada
  4. Nunca invente politica, regra, exemplo ou fato; quando a base nao sustentar, seja honesto
  5. Clareza e aplicacao pratica valem mais do que resposta longa (4-8 frases, tom de conversa)
  6. Pode dar exemplos e microexercicios, sempre conectados ao descritor; nao divague para outras competencias
  7. DISC adapta a FORMA (funcao `blocoDisc`: D=direto, I=caloroso, S=gradual, C=analitico), nunca a essencia
  8. Grounding como base principal: nao despeje conteudo inteiro, responda primeiro ao perguntado, se base fraca diga isso
  9. Saudacao vaga ("oi"): apresente-se e ofereca ajuda focada no descritor
- **Inputs (messages)**: Histórico completo.
- **Consumido por**: `temporada_semana_progresso.tira_duvidas.transcript_completo` + `ia_usage_log`.

### 6.9 Evolution Qualitative — Conversa na semana de acumulado (fechamento)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/evolution-qualitative.ts::promptEvolutionQualitative` + `promptEvolutionQualitativeExtract`
- **Callers**: `app/api/temporada/evaluation/route.ts` quando `semana = programaConfig.semanaAcumulada` (13 Regular/DUO, 9 Onboarding e 6 Jornada; Piloto não tem esta conversa) e `lib/season-engine/simulador-core.ts::simularQualitativa`.
- **Max tokens**: 4000 (conversa), 8000 (extração)
- **Max turnos IA**: 12
- **System prompt** (resumo editorial do prompt real em `evolution-qualitative.ts`):
  Voce e o mentor de encerramento da trilha da competencia. Conduz a conversa final da temporada apos 12 semanas. Nao e auditor frio, nem coach generico, nem avaliador formal; ajuda a reconhecer com honestidade o que mudou e o que precisa amadurecer. Principios-chave:
  1. Nunca afirme fatos nao ditos literalmente; nunca afirme evolucao sem evidencia concreta
  2. "Acho que melhorei" nao e evidencia -- peca o que aconteceu; fala bonita nao conta como avanco
  3. Intencao sem exemplo nao sustenta evolucao; nunca conclua dominio total so porque a trilha terminou
  4. Nunca revele niveis/nota/regua; nunca invente insights/comportamentos/exemplos
  5. Se colab se subestimar: ajude a nomear comportamentos que ELE relatou; se superestimar: confronte pedindo evidencia
  6. Perguntas abertas e neutras, 1 por turno (exceto T12); DISC adapta tom (funcao `estiloPorPerfil`)

  PROGRESSAO 12 TURNOS:
  T1 ABERTURA (mensagem quase fixa) | T2 RETROSPECTIVA | T3-5 EVIDENCIA REAL (3 exemplos, confronte super/subestimacao) | T6 MICROCASO (4-6 linhas, forca escolha real, sem gabarito) | T7-8 FOLLOW-UPS do microcaso | T9-10 INTEGRACAO DOS DESCRITORES | T11 MAIOR AVANCO | T12 SINTESE FINAL (sintese evolucao com evidencias literais + ponto atencao + frase fechamento DISC, max 180 palavras, sem plano de acao/proximos passos)
- **Consumido por**: `temporada_semana_progresso.reflexao.transcript_completo` na `semanaAcumulada` do programa.
- **Divergência ainda presente no prompt**: `promptEvolutionQualitative` continua dizendo “após 12 semanas” e a extração se apresenta como “semana 13”. Diferentemente do scorer 6.12/6.13, esse par ainda não recebe a duração configurada; em Onboarding/Jornada, o fluxo roda na semana correta, mas a redação interna permanece a do programa regular.

#### 6.9.1 Extracao qualitativa (apos sem 13)

- **Arquivo**: `lib/season-engine/prompts/evolution-qualitative.ts::promptEvolutionQualitativeExtract`
- **System prompt** (resumo editorial do prompt real em `evolution-qualitative.ts`):
  Voce e o extrator qualitativo da Vertho para a semana 13. Analisa a conversa final e transforma em dados estruturados sobre evolucao percebida e evidencias qualitativas por descritor. Principios-chave:
  1. Extraia somente o que foi dito ou claramente sustentado; nao invente evolucao/maturidade/impacto
  2. Diferencie percepcao subjetiva de evidencia concreta; dificuldade persistente e informacao valiosa
  3. Microcaso bem respondido e sinal util, mas nao substitui evidencia real vivida
  4. Teoria aprendida ou fala articulada nao bastam para sustentar evolucao pratica
  5. Forca: fraca (abstrata/vaga) | moderada (concreta mas incompleta) | forte (concreta+coerente+acao/criterio/consequencia)
- **Output**: JSON `{ evolucao_percebida[{descritor, antes, depois, nivel_percebido:1.0-4.0, forca_evidencia, confianca:0.0-1.0, evidencia, citacoes_literais[], limites_da_leitura[]}], insight_geral, maior_avanco, ponto_atencao, microcaso_resposta_qualidade:"alta|media|baixa", microcaso_justificativa, consciencia_do_gap:"alta|media|baixa", dificuldades_persistentes[], ganhos_qualitativos[], alertas_metodologicos[], limites_gerais_da_conversa[] }`. Validacao: `validateEvolutionExtract`.
- **Consumido por**: Merge em `reflexao` da sem 13.

### 6.10 Avaliação Acumulada (IA1 — `programaConfig.semanaAcumulada`)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/acumulado.ts::promptAvaliacaoAcumulada`
- **Caller**: `lib/season-engine/avaliacao-acumulada-core.ts::gerarAvaliacaoAcumuladaCore(trilhaId, opts?: {empresaId})` (headless, desde 23/07 — a action `actions/avaliacao-acumulada.ts::gerarAvaliacaoAcumulada` virou wrapper sempre gatado que delega pro core) — auto-trigger no fim da sem 13 (rota `/evaluation`, regular, via `after()`) e no fim da sem 2 (rota `/reflection`, **piloto**). O `opts.empresaId` prova o tenant (B5) — a função rejeita trilha de outro tenant. **Piloto (M8, 06/07, `1d1279eb`)**: SAIU do `after()` → task **Trigger.dev `acumulada-piloto`** (retry + status rastreável); o fechamento (sem 3) faz **GATE** nesse status (`{processando}` 202 + polling no `sem14`) e **self-heal inline** se travar; **fallback `after()`** se o Trigger estiver indisponível. Regular/onboarding seguem em `after()` (fix 02/07, `7fcbe88`+`dc0ffe2` — a IIFE solta morria no freeze pós-response da Vercel). Caller admin (tela auditoria) passa pelo gate da action; simulador chama o core direto.
- **Max tokens**: 8000
- **PII masking**: Sim — nome do colab vira alias, evidências passam pelo sanitizador.
- **System prompt** (resumo editorial do prompt real em `acumulado.ts`):
  Voce e um avaliador criterioso da Vertho. Le as evidencias acumuladas de 13 semanas e atribui leitura ACUMULADA por descritor, ancorada EXCLUSIVAMENTE na regua. Principios-chave:
  1. CEGA PARA NOTA INICIAL -- nao conhece nota previa nem score previo, apenas evidencias + regua
  2. Leitura deve refletir PADRAO, consistencia e recorrencia -- nao impressao geral
  3. N1: limitacao clara/recorrente; N2: sinais iniciais/parciais sem consistencia; N3: consistencia em varias semanas com 2+ referencias; N4: padrao forte, recorrente e robusto
  4. Duvida puxa para baixo; se nao houver base, marque sem_evidencia
  5. Granularidade 0.1 (ex: 1.8, 2.3, 2.7) -- nao arredonde para 0.5
  6. Fala articulada nao equivale a evidencia forte; uma semana boa nao basta para padrao alto
  7. Nao infira alem dos registros
- **Inputs user**: Competencia, nome colab, regua completa N1-N4 por descritor, evidencias agregadas das 13 semanas.
- **Output**: JSON `{ avaliacao_acumulada[{descritor, nota_acumulada:1.0-4.0|null, nivel_rubrica:"lacuna|em_desenvolvimento|meta|referencia|sem_evidencia", quantidade_referencias, tendencia:"subindo|estavel|oscilando|descendo|sem_evidencia", forca_do_padrao:"fraca|moderada|forte", justificativa, trechos_sustentadores[], limites_da_base[]}], nota_media_acumulada, resumo_geral, descritores_mais_consistentes[], descritores_mais_frageis[], alertas_metodologicos[] }`. Validacao: `validateAvaliacaoAcumulada`.
- **Consumido por**: `temporada_semana_progresso.feedback.acumulado.primaria` (na semana `programaConfig.semanaAcumulada` — 13 regular, 2 piloto). No piloto, a evidência de semana de conteúdo cobre TODOS os `descritores_cobertos` (2 entregas/semana; flag `evidenciaPorCobertos`).

### 6.11 Avaliação Acumulada Check (IA2)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/acumulado.ts::promptAvaliacaoAcumuladaCheck`
- **Modelo default**: `gpt-5.6-terra`, pinned pela task `acumulada_check`.
- **Max tokens**: 6000
- **System prompt** (resumo editorial do prompt real em `acumulado.ts`):
  Voce e um auditor de qualidade da avaliacao acumulada da Vertho. Audita se a avaliacao feita por outra IA ao final da semana 13 esta metodologicamente DEFENSAVEL como leitura do padrao da temporada. Nao refaz a avaliacao; verifica se se sustenta com base em regua, evidencias acumuladas, padrao das 13 semanas e consistencia interna. Principios-chave:
  1. Leitura acumulada precisa refletir padrao, nao impressao geral
  2. N3+ sem consistencia suficiente deve ser penalizado
  3. sem_evidencia deve ser usado quando a base nao sustentar leitura defensavel
  4. Justificativa generica e fragilidade real
  5. Tendencia, nota e quantidade de referencias precisam conversar entre si
  6 CRITERIOS PONDERADOS (total 100pts):
  1. ANCORAGEM NA REGUA (20pts) | 2. CONSISTENCIA DO PADRAO (20pts) | 3. COERENCIA NOTA/TENDENCIA/REFERENCIAS (20pts) | 4. QUALIDADE DA JUSTIFICATIVA (15pts) | 5. TRATAMENTO AUSENCIA DE EVIDENCIA (15pts) | 6. PRUDENCIA METODOLOGICA (10pts)
  ERROS GRAVES: nota maxima 60 (N3/N4 com base insuficiente, justificativa 100% generica, tendencia incompativel, etc.)
- **Output**: JSON `{ nota_auditoria:0-100, status:"aprovado|aprovado_com_ajustes|revisar", erro_grave:bool, criterios:{ancoragem_regua, consistencia_padrao, coerencia_nota_tendencia_referencias, qualidade_justificativa, tratamento_ausencia_evidencia, prudencia_metodologica}, ajustes_sugeridos[{descritor, nota_acumulada_sugerida, motivo}], ponto_mais_confiavel, ponto_mais_fragil, alertas[], resumo_auditoria }`. Validacao: `validateAvaliacaoAcumuladaCheck`.
- **Consumido por**: `feedback.acumulado.auditoria`.

### 6.12 Evolution Scenario Score (sem 14 — scorer final)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/evolution-scenario.ts::promptEvolutionScenarioScore`
- **Execução**: `lib/season-engine/fechamento-scorer.ts::pontuarFechamento`; callers em `app/api/temporada/evaluation/route.ts` (sem = `semanaCenarioB` da config: 14 regular · 10 onboarding · **3 piloto**) e `app/admin/vertho/auditoria-sem14/actions.ts::regerarScoringComFeedback`.
- **Params de régua temporal** (02/07): `semanaFinal`/`semanasEvidencia` (defaults 14/13 = regular byte-idêntico) + `notaPrograma` (piloto injeta contexto: "demonstra o método, NÃO mede evolução; janela curta não é falha do colaborador")
- **Pós-processamento piloto-only**: após `validateEvolutionScenarioScore`, o branch piloto aplica `aplicarTravaPiloto` (lib/season-engine/piloto-trava.ts): `nota_pos = max(bruto, baseline)`, `nota_pos_bruto`+`piso_aplicado` preservados, `spec_version='piloto-v1'` no snapshot — o prompt e o output dos demais modos ficam intocados
- **Max tokens**: 10000
- **PII masking**: Sim (nome do colab, resposta, evidências).
- **System prompt** (resumo editorial do prompt real em `evolution-scenario.ts`):
  Voce e um avaliador rigoroso e criterioso da Vertho. Calcula a AVALIACAO FINAL da semana 14 por TRIANGULACAO entre nota pre (baseline), avaliacao acumulada das 13 semanas, resposta ao cenario e evidencias acumuladas. Principios-chave:
  1. Ancore EXCLUSIVAMENTE na regua de maturidade; granularidade 0.1
  2. Regressao e possivel -- nao force evolucao; evidencia demonstrada pesa mais que fala bonita
  3. Resposta ao cenario NAO invalida automaticamente o acumulado; acumulado forte NAO pode ser ignorado por cenario fraco isolado
  4. Cenario muito bom mas isolado NAO pode gerar nota inflada sem sustentacao
  5. DISC altera so o tom da devolutiva (funcao `tomDevolutivaPorPerfil`), nunca a nota
  6. Toda justificativa deve citar evidencia do cenario + evidencia acumulada + leitura da regua
  4 ESTADOS DE PONDERACAO cenario x acumulado:
  1. CONSISTENTE (diff <=0.5): nota_pos = nivel consolidado
  2. DIVERGENTE CENARIO SUPERIOR: puxa pra perto do acumulado (+0.3-0.5 se cenario robusto)
  3. DIVERGENTE CENARIO INFERIOR: puxa pra perto do acumulado (-0.3-0.5 se cenario claramente fraco)
  4. SEM EVIDENCIA ACUMULADA: use cenario + regua com prudencia
  REGRAS DURAS: 4.0 so se acumulado E cenario sustentarem; Acumulado N1-2 -> nota_pos <=2.5; Acumulado N3 consistente (3+ semanas) -> nota_pos >=2.5
- **Inputs user**: Competencia, cenario, resposta do colab, regua com nota_atual por descritor, avaliacao acumulada primaria (se houver), evidencias das 13 semanas.
- **Output**: JSON `{ avaliacao_por_descritor[{descritor, nota_pre, nota_acumulada, nota_cenario, nota_pos, delta, classificacao:"evoluiu|manteve|regrediu", nivel_rubrica, consistencia_com_acumulado:"consistente|divergente_cenario_superior|divergente_cenario_inferior|sem_evidencia_acumulada", justificativa, trecho_cenario, evidencia_acumulada, limites_da_leitura[]}], nota_media_pre, nota_media_acumulada, nota_media_cenario, nota_media_pos, delta_medio, resumo_avaliacao:{mensagem_geral, evidencias_citadas[], principal_avanco, principal_ponto_de_atencao}, alertas_metodologicos[] }`. Validacao: `validateEvolutionScenarioScore`.
- **Consumido por**: `temporada_semana_progresso.feedback` (semana do fechamento) + Evolution Report (`gerarEvolutionReport(trilhaId, internal?)` — variante piloto SEM delta/convergência; report automático da rota usa `internal=true`).

### 6.13 Evolution Scenario Check (audit sem 14)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/evolution-scenario-check.ts::promptEvolutionScenarioCheck`
- **Execução**: `lib/season-engine/fechamento-scorer.ts::pontuarFechamento`, logo depois do scorer primário.
- **Modelo default**: `gpt-5.6-terra`, pinned pela task `sem14_check`.
- **Params de régua temporal** (02/07): `semanaFinal`/`semanasEvidencia` (defaults 14/13 = regular byte-idêntico; piloto = 3/2)
- **Max tokens**: 8000
- **System prompt** (resumo editorial do prompt real em `evolution-scenario-check.ts`):
  Voce e um auditor de qualidade da avaliacao final da semana 14 da Vertho. Audita se a avaliacao final triangulada por descritor esta metodologicamente DEFENSAVEL. Nao refaz a avaliacao; verifica se a leitura final se sustenta com base em regua, nota pre, avaliacao acumulada, resposta ao cenario, evidencias das 13 semanas e consistencia interna da triangulacao. Principios-chave:
  1. A sem 14 e TRIANGULACAO, nao correcao de prova
  2. Evidencia demonstrada no cenario pesa, mas nao pode apagar o acumulado
  3. Acumulado forte nao pode ser ignorado por cenario fraco isolado; cenario bom mas isolado nao pode inflar nota
  4. Justificativa generica e fragilidade real; regressao e possivel mas precisa ser bem sustentada
  5. DISC nunca altera nota; apenas o tom da devolutiva
  6. Filosofia: busque DEFENSABILIDADE, nao perfeicao absoluta; diferencas <=0.5 podem ser aceitaveis
  6 CRITERIOS PONDERADOS (total 100pts):
  1. ANCORAGEM NA REGUA (20pts) | 2. COERENCIA DO DELTA (15pts) | 3. QUALIDADE DA JUSTIFICATIVA (15pts) | 4. TRIANGULACAO COM ACUMULADO (20pts) | 5. PRUDENCIA METODOLOGICA (15pts) | 6. COERENCIA INTERNA DA DEVOLUTIVA (15pts)
  ERROS GRAVES: nota maxima 60 (4.0 sem sustentacao, nota_pos igual cenario ignorando acumulado, delta incompativel, justificativa 100% generica, regressao forte sem base, devolutiva que contradiz a triangulacao)
- **Output**: JSON `{ nota_auditoria:0-100, status:"aprovado|aprovado_com_ajustes|revisar", erro_grave:bool, criterios:{ancoragem_regua, coerencia_delta, qualidade_justificativa, triangulacao_com_acumulado, prudencia_metodologica, coerencia_devolutiva}, ajustes_sugeridos[{descritor, nota_pos_sugerida, motivo}], ponto_mais_confiavel, ponto_mais_fragil, alertas[], resumo_auditoria }`. Validacao: `validateEvolutionScenarioCheck`.
- **Consumido por**: `feedback.auditoria`.

### 6.14 Arguição — defesa oral do fechamento (2º instrumento)
> `ATIVO` (LIGADO em TODOS os modos) · Fases A→D concluídas 03/07

Depois das 4 perguntas fixas do Cenário B (a "tese escrita"), a IA conduz uma **defesa oral** por turnos — sonda a resposta pra expor profundidade ou fragilidade que o texto não captura. Triangulação de método: o cenário escrito (resposta preparada) vs. a sustentação ao vivo. A conversa **modula a nota** (não soma) via regra de CÓDIGO. Gate por modo (`arguicao:{ativa,maxTurnos}` em `programa-config.ts`) — todos **LIGADOS**: Piloto 4 turnos, Regular DUO/single 8, Onboarding 6.

**(a) Condução da arguição** — `lib/season-engine/arguicao.ts::buildArguicaoSystemPrompt` (via `abrirArguicao`/`turnoArguicao`)
- **Caller**: `app/api/temporada/evaluation/route.ts` — `action:'send'` da 4ª resposta ABRE a arguição (quando `programaConfig.arguicao.ativa`); `action:'arguir'` conduz cada turno.
- **Modelo**: default do chat · **Max tokens**: 2048 · **Temperature**: 0.4
- **PII masking**: Sim, em-voo (`ArguicaoPII`) — histórico persistido CRU (o colab reabre e vê o próprio texto/nome); mascara só o payload da IA (nome→alias + email/tel/CPF); reply/citações voltam despersonalizados. Payload à IA é SÓ `{role,content}` (a API rejeita campos extras como `turn`).
- **System prompt** (resumo): Mentor conduz a defesa oral da resposta ao cenário. NÃO ensina/avalia/dá nota; SONDA — testa se o critério se justifica, se o raciocínio aguenta variação do cenário, onde há profundidade não escrita e qual o limite reconhecido. 1 pergunta por turno; microacolhimento ok, elogio/interpretação proibidos; nunca cita código de descritor; parte SEMPRE da resposta dada. Bloco `[META]` obrigatório (turno, sondagem_atual, evidencias_coletadas, risco_de_encerramento_prematuro, encerrar). Encerra por: teto de turnos, `encerrar:true`, ou evidências suficientes + sondagem=encerramento sem risco de corte prematuro. Piloto herda proibição de falar em "evolução" (é sustentação, não evolução — janela de 2 semanas).
- **Output visível**: fala do Mentor (sem o `[META]`). **Estado**: `feedback.arguicao={historico,turno,concluida}`.

**(b) Extração de evidências** — `lib/season-engine/arguicao.ts::extrairEvidenciasArguicao`
- **Quando**: ao concluir a arguição (uma chamada). **Max tokens**: 4096 · **Temperature**: 0.2 · **PII**: conversa mascarada; citações desmascaradas no retorno.
- **System prompt** (resumo): extrator fiel/prudente — por descritor, marca se a defesa CONFIRMOU o escrito, APROFUNDOU (revelou profundidade nova), FRAGILIZOU (não sustentou sob sondagem) ou ficou SEM SINAL; toda evidência com citação curta; teoria não vale como forte; NÃO produz nota. **EXATAMENTE uma entrada por descritor** (evita duplicatas conflitantes).
- **Output**: JSON `{ resumo:{leitura_geral, sustentacao_mais_forte, fragilidade_mais_relevante}, evidencias_por_descritor[{descritor, sustentou:"confirmou|aprofundou|fragilizou|sem_sinal", citacao, forca:"fraca|moderada|forte"}] }`. Persistido em `feedback.arguicao.extracao`.

**(c) Fusão na nota (CÓDIGO, sem IA)** — `lib/season-engine/fusao-arguicao.ts::fundirArguicao`
- O `ajuste_arguicao` NÃO vem de IA — é DERIVADO da classificação (`sustentou×forca`) por MAPA determinístico: aprofundou +0,2/0,35/0,5; fragilizou simétrico; confirmou/sem_sinal 0 — tudo dentro de ±0,5 (clamp de salvaguarda). Por descritor: `nota_base_cenario`=nota do scorer; `nota_pos=clamp(base+ajuste,1,4)`; recalcula médias e delta. Descritor DUPLICADO na extração → mantém o ajuste de MENOR magnitude (conservador, independe da ordem).
- **Ordem no fechamento**: scorer (6.12) → **fusão** → trava piloto. `pontuarFechamento` recebe `evidenciasArguicao` e funde ENTRE scorer e trava. Carimba `nota_base_cenario`+`ajuste_arguicao`+`sustentacao_arguicao` por descritor.
- **Amarração**: ao concluir a arguição, a rota dispara `finalizarComScorer()` (mesmo núcleo do `send` da 4ª resposta) — a nota sai já fundida. UI: tela `sem14` troca do formulário para modo CHAT turn-by-turn.

---

## Relatórios (Individual / Gestor / RH)

### 7.1 Relatório Individual — PDI (RELATORIO_IND_SYSTEM)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/relatorio-individual-prompt.ts::RELATORIO_IND_SYSTEM` + `buildRelatorioIndividualPrompt`; execução headless em `lib/relatorios/individual-core.ts` e wrapper em `actions/relatorios.ts`.
- **Modelo default**: `claude-sonnet-5`, pinned pela task `pdi_individual`.
- **Max tokens**: 64000 (streaming)
- **Trigger**: Admin gera relatórios individuais (único ou lote).
- **Grounding RAG**: Não direto.
- **System prompt** (resumo editorial do prompt real em `actions/relatorios.ts`):
  "Você é um especialista em desenvolvimento de profissionais da plataforma Vertho." Gera PDI completo entregue ao COLABORADOR como devolutiva pessoal + plano de ação. Princípios-chave:
  1. SANDWICH: acolher antes de diagnosticar
  2. Linguagem acessível, humana, sem jargão excessivo
  3. Firme mas nunca punitivo ("tende a...", "há sinais de...", "um risco é...")
  4. Reconhecer contexto antes de apontar gaps; ser honesto sem desmotivar
  5. Evitar frases genéricas que serviriam para qualquer pessoa; fazer a pessoa se sentir compreendida e orientada
  6. Níveis SEMPRE numéricos (1-4). Nível 3 = META
  7. Nunca mencione scores DISC numéricos — descreva em linguagem acessível; DISC/CIS como leitura contextual, não diagnóstico fechado
  8. SEMPRE inclua TODAS as competências do input, inclusive pendentes (flag=true)
  9. Competências com nível < 3: plano de 30 dias detalhado por semana (1a pessoa, concreto, com scripts prontos, progressão de prática)
  10. Competências nível 3-4: foco em manutenção/refinamento/multiplicação, não plano pesado
  11. Competências pendentes (flag=true): "Aguardando avaliação — ações a definir", evitar falsa precisão
  12. Se CONTEÚDOS RECOMENDADOS fornecidos: distribuir ao longo das semanas do plano e conectar ao gap
  13. Metas em primeira pessoa com horizonte claro
  14. Não invente comportamento, resultado ou contexto não sustentado pelos dados

- **Output**: JSON `{ acolhimento, resumo_geral:{leitura, principais_forcas, principal_ponto_de_atencao}, perfil_comportamental:{descricao, pontos_forca, pontos_atencao}, resumo_desempenho[{competencia, nivel, nota_decimal, leitura}], competencias[{nome, nivel, nota_decimal, flag, descritores_desenvolvimento, fez_bem, melhorar, feedback, plano_30_dias:{semana_1..4:{foco, acoes}}, dicas_desenvolvimento, estudo_recomendado[{titulo, formato, por_que_ajuda, url}], checklist_tatico}], mensagem_final, alertas_metodologicos }`. Pós-processo: `overlay` força nivel/nota_decimal dos dados reais sobre output da IA.
- **Inputs no user prompt**:
  - Colaborador (nome, cargo)
  - Empresa (nome, segmento)
  - Perfil CIS formatado (DISC, dominante, liderança)
  - Atenção: N competências esperadas, M pendentes (flag=true)
  - Dados por competência: {competencia, nivel, nota_decimal, pontos_fortes, gaps, feedback}
  - Conteúdos recomendados (trilha): nome, competência, formato, nível, URL
- **Consumido por**: `relatorios` tipo='individual' + renderização PDF via `RelatorioIndividual.tsx` em `/storage/relatorios-pdf/{empresa}/individual-*.pdf`.

### 7.2 Relatório Gestor (RELATORIO_GESTOR_SYSTEM)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/relatorios/prompts.ts::RELATORIO_GESTOR_SYSTEM`; execução em `actions/relatorios.ts::gerarRelatorioGestor`
- **Modelo default**: `claude-sonnet-5`, pinned pela task `relatorio_gestor`.
- **Max tokens**: 64000
- **Grounding RAG**: **Sim** — `retrieveContext(empresaId, 'valores cultura organizacional políticas desenvolvimento pessoas', 4)`.
- **Trigger**: Admin gera relatórios por gestor (agrupa por `gestor_email`).
- **Loop**: Sim — 1 chamada por gestor.
- **System prompt** (resumo editorial do prompt real em `actions/relatorios.ts`):
  "Você é um especialista em desenvolvimento de equipes da plataforma Vertho." Gera relatório do gestor consolidado, estratégico e acionável. Princípios-chave:
  1. Níveis NUMÉRICOS (1-4). Nunca rótulos vagos
  2. DISC é hipótese contextual ("pode indicar", "tende a favorecer"), nunca diagnóstico fechado
  3. Conecte tudo ao impacto nos resultados e na gestão do time
  4. O gestor vive no caos: máximo 3 ações por horizonte
  5. Nunca sugira quadros públicos de acompanhamento individual
  6. Celebre evolução com força antes de apontar atenção
  7. Não invente comportamento, risco ou intenção não sustentados pelos dados
  8. Ações realistas para rotina de gestor
  9. Não use linguagem genérica que serviria para qualquer equipe
  10. ranking_atencao com risco_se_nao_agir concreto, não alarmista
  11. analise_por_competencia com impacto_se_nao_agir conectado à gestão

- **Output**: JSON `{ resumo_executivo:{leitura_geral, principal_avanco, principal_ponto_de_atencao}, destaques_evolucao[{nome, competencia, nivel, motivo_destaque}], ranking_atencao[{nome, competencia, nivel, urgencia, motivo, risco_se_nao_agir}], analise_por_competencia[{competencia, media_nivel, distribuicao:{n1,n2,n3,n4}, padrao_observado, acao_gestor, impacto_se_nao_agir}], perfil_disc_equipe:{descricao, forca_coletiva, risco_coletivo}, acoes:{esta_semana, proximas_semanas, medio_prazo}, mensagem_final, alertas_metodologicos }`.
- **Inputs user**: Empresa, gestor (nome, email), total equipe, DISC distribuição, grounding block (valores/cultura da empresa), dados detalhados da equipe (nome, cargo, disc_dominante, competências com nível).
- **Consumido por**: `relatorios` tipo='gestor' + PDF.

### 7.3 Relatório RH (RELATORIO_RH_SYSTEM)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/relatorios/prompts.ts::RELATORIO_RH_SYSTEM`; execução em `actions/relatorios.ts::gerarRelatorioRH`
- **Modelo default**: `claude-sonnet-5`, pinned pela task `relatorio_rh`.
- **Max tokens**: 64000
- **Grounding RAG**: **Sim** — `retrieveContext(empresaId, 'valores cultura organizacional políticas treinamento desenvolvimento estrategia', 5)`.
- **System prompt** (resumo editorial do prompt real em `actions/relatorios.ts`):
  "Você é um especialista em desenvolvimento organizacional da plataforma Vertho." Gera relatório consolidado de RH, analítico e orientado a decisão. Princípios-chave:
  1. Níveis NUMÉRICOS (1-4)
  2. DISC é hipótese contextual, não diagnóstico fechado
  3. Conecte tudo ao impacto organizacional real
  4. Treinamentos específicos e priorizados (com carga horária, custo, formato, `entra_se_orcamento_curto`)
  5. Cada risco identificado deve vir com ação concreta
  6. Para cada cargo: UMA competência foco mais alavancadora (com justificativa quanti+quali e horizonte)
  7. Não invente causalidade que os dados não sustentam
  8. Seja estratégico mas pé no chão
  9. Máximo 3 ações por horizonte
  10. Evitar linguagem genérica que serviria para qualquer empresa

- **Output**: JSON `{ resumo_executivo:{leitura_geral, principal_forca_organizacional, principal_risco_organizacional}, indicadores:{total_avaliados, total_avaliacoes, media_geral, pct_nivel_1..4}, visao_por_cargo[{cargo, media_nivel, principais_forcas, principais_riscos, leitura}], competencias_criticas[{competencia, criticidade, justificativa, impacto_organizacional}], competencia_foco_por_cargo[{cargo, competencia_recomendada, justificativa, expectativa_impacto, horizonte_sugerido}], treinamentos_sugeridos[{titulo, competencia, publico, custo, prioridade, carga_horaria, formato, justificativa, entra_se_orcamento_curto}], perfil_disc_organizacional:{descricao, forca_coletiva, risco_coletivo}, decisoes_chave[{colaborador, situacao, acao, criterio_reavaliacao}], plano_acao:{curto_prazo, medio_prazo, longo_prazo}, mensagem_final, alertas_metodologicos }`.
- **Inputs user**: Empresa, indicadores gerais (total avaliados, média, distribuição N1-N4), DISC organizacional, grounding block, dados por cargo, registros individuais (nome, cargo, competência, nível).
- **Consumido por**: `relatorios` tipo='rh' + PDF.

---

## PPP / Dossiê Corporativo

### 8.1 Extração PPP Educacional
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/ppp.ts::buildPromptEducacional` (chamado por `extrairPPP`)
- **Modelo default**: Configurável (default `claude-sonnet-4-6`)
- **Max tokens**: 16000
- **Trigger**: Admin sobe PPP educacional (URLs/textos) em `/admin/empresas/{id}/ppp`.
- **System prompt** (resumo editorial do prompt real em `actions/ppp.ts`):
  "Você é um especialista em análise de documentos educacionais e institucionais brasileiros." Extrai contexto estruturado de PPP para uso em prompts de avaliação e desenvolvimento. Princípios-chave:
  1. Extraia apenas o que está explícito ou claramente implícito no documento
  2. Nunca invente contexto, cultura ou prática institucional. Se não houver base: "Não declarado no documento"
  3. Não transforme ideal declarado em prática consolidada sem sustentação
  4. Máximo 5 frases curtas por seção; listas com máximo 8 itens
  5. Entregue obrigatoriamente todas as seções
  6. Priorize o que ajuda a entender como a instituição funciona
  7. Evite abstrações vazias e pedagogês ornamental
  8. Registre competências priorizadas apenas quando houver base documental clara
  9. `_metadata_extracao` opcional mas recomendado (sinais_fortes, limites_do_documento, alertas_de_interpretacao)

- **Output**: JSON `{ perfil_instituicao:{nome, tipo, segmento, porte, localizacao}, comunidade_contexto, identidade:{missao, visao, principios, concepcao}, praticas_descritas[{nome, descricao, frequencia}], inclusao_diversidade, gestao_participacao, infraestrutura_recursos:{espacos, tecnologia, limitacoes}, desafios_metas:{desafios, metas}, vocabulario[{termo, significado}], competencias_priorizadas[{nome, justificativa, relevancia}], valores_institucionais[], _metadata_extracao }`.
- **Inputs user**: Instituição, documento (até 60000 chars), schema JSON com todas as seções.
- **Consumido por**: `ppp_escolas.extracao` (usado por IA1/IA2/IA3 Fase 1).

### 8.2 Extração PPP Corporativo (Dossiê)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/ppp.ts::buildPromptCorporativo`
- **Max tokens**: 16000
- **System prompt** (resumo editorial do prompt real em `actions/ppp.ts`):
  "Você é um especialista em extração de contexto corporativo para geração de cenários e avaliações da Vertho." Transforma materiais corporativos em Dossiê de Contexto Operacional estruturado. Princípios-chave:
  1. Nunca trate hipótese como fato. Se não está no material, marque como lacuna
  2. Nunca preencha processos internos, cultura real ou dinâmica operacional sem evidência
  3. Nunca assuma cultura real a partir do site institucional — sites refletem imagem pública, não realidade operacional
  4. Nunca invente tensões internas, conflitos ou erros sem base documental
  5. Separe claramente "contexto público" de "dinâmica operacional real"
  6. Job postings e descrições de cargo são PISTA, não verdade absoluta
  7. Quando faltar base, use conteudo: null e confianca: "baixa"
  8. Seções descritivas: máximo 5 frases curtas. Listas: máximo 8 itens
  9. Classificação obrigatória por seção: confianca (alta/media/baixa) + origem (documento_interno/site_institucional/release_noticia/nao_identificado)
  10. Priorize o que ajuda a entender a empresa de verdade; capture vocabulário e tensões úteis para cenários

- **Output**: JSON com 19 seções (cada uma com conteudo + origem + confianca): `{ perfil_organizacional, mercado_stakeholders, identidade_cultura, operacao_processos, modelo_pessoas, governanca_decisao, tecnologia_recursos, desafios_estrategia, vocabulario_corporativo, tensoes_dilemas, cadencia_rituais, stakeholders_por_area, casos_recentes, perfil_forca_trabalho, reconhecimento_punicao, comunicacao_interna, maturidade_cultural, competencias_priorizadas, valores_institucionais, _metadata_extracao }`.
- **Inputs user**: Empresa, material (até 60000 chars), schema JSON com todas as seções.
- **Consumido por**: Mesmo `ppp_escolas.extracao`.

### 8.3 Enriquecimento via Web
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/ppp.ts::enriquecerViaWeb`
- **Max tokens**: 8000
- **Trigger**: Opcional (`enriquecerWeb = true`) após 8.2. Busca no Google + site institucional e preenche lacunas.
- **System prompt** (resumo editorial do prompt real em `actions/ppp.ts`):
  "Você é um especialista em enriquecimento prudente de contexto corporativo da Vertho." Preenche APENAS lacunas do dossiê corporativo com base em informações públicas da web. Princípios-chave:
  1. Informação de documento interno sempre tem prioridade. Não altere nem sobrescreva o que já foi extraído
  2. Não invente processo, cultura, tensão ou stakeholder interno
  3. Tudo que vier da web deve ter origem pública explícita
  4. A confiança máxima para web é "media". Nunca "alta"
  5. Se a web não trouxer base boa, mantenha a lacuna. Melhor lacuna do que dado ruim
  6. Nunca trate marketing institucional como prova de dinâmica operacional real
  7. Classificações: origem (site_institucional/release_noticia/nao_identificado), confianca (media/baixa)
  8. Seções mantidas com lacuna devem ser explicitamente listadas com motivo

- **Output**: JSON `{ secoes_enriquecidas[{secao, conteudo, origem, confianca, justificativa_enriquecimento}], secoes_mantidas_com_lacuna[{secao, motivo}], alertas_metodologicos }`.
- **Inputs user**: Dossiê atual (até 8000 chars), lacunas a preencher, fontes web scrappadas (Google search + site institucional).
- **Consumido por**: Merge seções no dossiê final. Registra `_metadata_extracao.fontes_web` e `secoes_enriquecidas_web`.

---

## Perfil Comportamental (Dashboard)

### 9.1 Relatório Comportamental (Textos narrativos)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/relatorio-comportamental/relatorio-core.ts::gerarTextosLLM` (caller em `app/dashboard/perfil-comportamental/relatorio/relatorio-actions.ts`; prompt em `lib/prompts/behavioral-report-prompt.js`)
- **Modelo**: Via `getModelForTask(empresaId, 'relatorio_comportamental')`
- **Max tokens**: 4096
- **Trigger**: Colaborador abre `/dashboard/perfil-comportamental/relatorio` (ou regenerar). Cache 30 dias.
- **System prompt** (resumo editorial do prompt real em `lib/prompts/behavioral-report-prompt.js`):
  "Você é um analista comportamental sênior da Vertho." Gera devolutiva narrativa de perfil comportamental. Princípios-chave:
  1. DISC é tendência, não sentença. Nunca linguagem determinista ("você é...", "sempre vai...")
  2. Nunca trate score como verdade absoluta
  3. Nunca invente traços que os dados não sustentam
  4. O texto deve ser útil para o colaborador, não apenas bonito
  5. Evite jargão técnico desnecessário e frases genéricas que servem para qualquer pessoa
  6. NÃO explique a teoria DISC — apenas aplique-a
  7. Considere a COMBINAÇÃO dos fatores, não cada um isoladamente
  8. Tom positivo e construtivo; use primeiro nome; textos curtos e diretos
  9. Diferencie: força natural vs risco de excesso; adaptação vs tensão interna; maturidade vs padrão automático
  10. Não cite score numérico no texto final; não use termos clínicos

- **Output**: JSON `{ sintese_perfil, quadrante_D:{titulo_traco, descricao}, quadrante_I, quadrante_S, quadrante_C, top5_forcas[{competencia, frase}], top5_desenvolver[{competencia, frase}], lideranca_sintese, lideranca_trabalhar, pontos_desenvolver_pressao[6 itens], relacoes_e_comunicacao, modo_de_trabalho, frases_chave[2-4] }`.
- **Inputs user**: Output de `buildBehavioralReportPrompt(raw)` — nome, perfil dominante, DISC natural, liderança (4 estilos %), tipo psicológico e 16 competências naturais. Inclui referência interna DISC por faixa.
- **Consumido por**: `colaboradores.report_texts` + renderização PDF (`RelatorioComportamental.tsx`) em `relatorios-pdf`.

### 9.2 Insights Executivos
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `app/dashboard/perfil-comportamental/perfil-comportamental-actions.ts::gerarInsightsExecutivos` (prompt em `lib/prompts/insights-executivos-prompt.js`)
- **Modelo**: Via `getModelForTask(empresaId, 'insights_executivos')`
- **Max tokens**: 1500 (era 800 até 2026-05-27 — subido para não truncar os 3 insights e invalidar o JSON)
- **System prompt** (resumo editorial do prompt real em `lib/prompts/insights-executivos-prompt.js`):
  "Você é um consultor sênior de desenvolvimento humano da Vertho." Gera 3 insights executivos curtos e úteis. Princípios-chave:
  1. DISC é tendência, não sentença. Nunca linguagem determinista
  2. Nunca cite score numérico
  3. Nunca produza frases genéricas que servem para qualquer pessoa
  4. Cada insight deve cumprir função diferente: 1=FORCA/ALAVANCA, 2=RISCO/EXCESSO, 3=OPORTUNIDADE PRATICA
  5. Seja claro, humano e direto. Evite jargão técnico de DISC — fale em comportamento real
  6. Cada insight: 1-2 linhas (max ~25 palavras), tom acionável, comece com verbo ou prática concreta
  7. Marque 2-3 palavras-chave por insight com **negrito**
  8. Os insights devem ser tão específicos ao perfil que não funcionariam para outro perfil

- **Output**: JSON `{ "insights": ["frase 1", "frase 2", "frase 3"] }`.
- **Robustez (2026-05-27)**: parsing tolerante (`extractInsights` — tenta JSON do texto limpo, depois o primeiro `{...}` embutido, depois array cru; aceita `{insights:[...]}` ou array direto) + **1 retry** em falha de parse/chamada. Antes, qualquer preâmbulo/markdown/JSON truncado derrubava o `JSON.parse` e os insights ficavam `null` silenciosamente.
- **Inputs user**: Output de `buildInsightsExecutivosPrompt({ colab, arquetipo, tags })` — nome, arquétipo, perfil dominante, tags, DISC natural (D/I/S/C), liderança (4 estilos %).
- **Consumido por**: `colaboradores.insights_executivos` (cache 30 dias). Geração disparada lazy ao abrir `/dashboard/perfil-comportamental` (email da sessão) **e** na pré-geração pós-mapeamento (via `colabId`).

### 9.3 Devolutiva comportamental em voz — roteiro
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/prompts/devolutiva-comportamental.ts::promptDevolutivaComportamental`; caller em `app/dashboard/perfil-comportamental/relatorio/relatorio-actions.ts`.
- **Modelo**: via `getModelForTask(empresaId, 'devolutiva_comportamental')`. **Max tokens**: 1500.
- **Tarefa**: BETO escreve um roteiro oral pessoal, de 2-3 minutos, em seções `[NARRAÇÃO]`, usando primeiro nome, arquétipo, combinação DISC, liderança, forças, riscos de excesso e contexto do cargo/empresa.
- **Regras**: DISC como tendência, sem scores falados, sem diagnóstico, sem promessas deterministas; texto natural para áudio, sem listas/tabelas e sem repetir o relatório escrito.
- **Output/consumo**: roteiro textual → `extractNarration` → Gemini TTS (22.3) → MP3 salvo por empresa e disponibilizado no dashboard/WhatsApp.

---

## FIT v2 (Leitura Executiva)

### 10.1 Leitura Executiva do Fit
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fit-v2.ts::gerarLeituraExecutivaFit` (prompt em `lib/prompts/fit-executive-prompt.js`)
- **Modelo default**: Claude Sonnet 4.6 (default do callAI)
- **Max tokens**: 800
- **Trigger**: Admin clica em drill-down de fit em `/admin/fit`. Cache 30 dias.
- **System prompt** (resumo editorial do prompt real em `lib/prompts/fit-executive-prompt.js`):
  "Você é um consultor sênior de desenvolvimento humano da Vertho." Gera leitura executiva curta sobre resultado de FIT entre pessoa e cargo. Princípios-chave:
  1. Fit é contextual, não destino. Nunca linguagem determinista
  2. Nunca reduza a pessoa ao score
  3. Nunca trate o resultado como verdade absoluta
  4. Explique a interação entre pessoa e cargo, não só um dos lados
  5. Seja curto, claro e útil. Evite jargão técnico e frases vazias
  6. A leitura deve cobrir: principal fator que favorece o fit, principal tensão/desalinhamento, implicação prática, cautela metodológica
  7. 4-6 linhas (max ~90 palavras), parágrafo corrido, sem bullet points
  8. NÃO repita números do Fit mais de uma vez — interprete-os
  9. NÃO use "perfil ideal", "incompatível" ou linguagem absoluta

- **Output**: Texto livre (parágrafo corrido, sem markdown, sem aspas).
- **Inputs user**: Output de `buildFitExecutivePrompt({ resultado, cargoNome })` — fit_final/100, classificação, recomendação do modelo, scores por bloco (com peso), top gaps (com faixa ideal e tratabilidade), top forças, alertas de excesso.
- **Consumido por**: `fit_resultados.leitura_executiva_ai` + `leitura_executiva_ai_at`.

---

## Conteúdos e Tagging

### 11.1 Video Script
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/video-script.ts::promptVideoScript`
- **Caller**: `actions/conteudos.ts::gerarConteudoIA` (formato='video')
- **Modelo**: Via `getModelForTask(empresaId, 'conteudo_video')`
- **Max tokens**: 4096
- **System prompt** (resumo editorial do prompt real em `lib/season-engine/prompts/video-script.ts`):
  "Você é roteirista de micro-aprendizagem da Vertho, especializado em vídeos curtos de desenvolvimento profissional." Princípios-chave:
  1. Linguagem oral e natural em português brasileiro
  2. Frases curtas, com boa respiração (max ~20 palavras quando possível)
  3. Nada de markdown, emojis ou indicações de câmera/cena/edição
  4. O texto deve ser gravável do jeito que sair
  5. Conversa entre colegas, não palestra; tom curioso, não autoritário
  6. Densidade prática > densidade teórica; sem repetir a mesma ideia de três jeitos
  7. Exemplo coerente com cargo/contexto; descritor na prática, não só definição
  8. Personagens nomeados quando houver storytelling
  9. Roteiro com começo forte e final claro

- **Output**: Texto corrido (roteiro para gravação externa/HeyGen). Sem seções numeradas, sem bullets, sem títulos técnicos.
- **Inputs user**: Competência, descritor, nível (com label FUNDAMENTOS/REFINAMENTO/MAESTRIA), cargo, contexto, duração target (~palavras). Estrutura obrigatória: 4 blocos naturais (GANCHO ~40 palavras / CONCEITO ~150 / EXEMPLO PRATICO ~200 / CHAMADA FINAL ~60). Nunca citar nome do descritor no gancho.
- **Consumido por**: `micro_conteudos.conteudo_inline`.

### 11.2 Podcast Script
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/podcast-script.ts::promptPodcastScript`
- **Caller**: Mesmo, formato='audio'
- **Max tokens**: 4096
- **System prompt** (resumo editorial do prompt real em `lib/season-engine/prompts/podcast-script.ts`):
  "Você é roteirista de podcast de desenvolvimento profissional da Vertho." Princípios-chave:
  1. Linguagem oral e natural em português brasileiro
  2. Tom íntimo e próximo. Use "eu" e "você" — nunca "nós" ou "a gente"
  3. Storytelling > explicação seca
  4. Frases curtas e com boa respiração. Pausas leves com reticências (...) com moderação
  5. Nada de markdown, emojis ou indicação de câmera/edição. Texto pronto para narração
  6. Diferença do vídeo: áudio é pra quem está caminhando, dirigindo; sem visual, mais narrativo e reflexivo
  7. Sem tom professoral, sem autoajuda vazia, sem jargão desnecessário
  8. Densidade prática > densidade teórica
  9. O descritor deve aparecer na prática, não só na definição

- **Output**: Texto corrido para narração (ElevenLabs voice clone). Sem seções numeradas, sem bullets.
- **Inputs user**: Competência, descritor, nível (FUNDAMENTOS/REFINAMENTO/MAESTRIA), cargo, contexto, duração (~palavras). Estrutura obrigatória: 4 blocos naturais (ABERTURA ~60 palavras / CONCEITO ~180 / APROFUNDAMENTO ~220 / PROVOCACAO FINAL ~60). Nunca citar nome do descritor na abertura.
- **Consumido por**: `micro_conteudos`.

### 11.3 Text Content (Artigo markdown)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/text-content.ts::promptTextContent`
- **Caller**: Mesmo, formato='texto'
- **System prompt** (resumo editorial do prompt real em `lib/season-engine/prompts/text-content.ts`):
  "Você é autor sênior de conteúdos de desenvolvimento profissional da Vertho, especializado em textos fáceis de transformar em publicação editorial premium." Princípios-chave:
  1. O conteúdo será usado num PDF visual → precisa de ÂNCORAS EDITORIAIS (frases fortes, exemplos nomeáveis, perguntas, ferramentas, contrastes)
  2. Linguagem brasileira profissional, clara e humana; parágrafos curtos com respiro
  3. Markdown limpo. No máximo 5 trechos em negrito
  4. Densidade prática > teoria; específico ao cargo/contexto/descritor
  5. Não inventar estatísticas, leis, normas ou evidências
  6. Sem jargão excessivo, sem tom infantil/professoral/publicitário, sem "---"

- **Output**: Markdown ≥8.000 caracteres (~1.400-1.800 palavras). Funciona em tela e PDF. Sem cercas de código.
- **Inputs user**: Competência, descritor, nível (FUNDAMENTOS/REFINAMENTO/MAESTRIA), cargo, contexto. Estrutura obrigatória COM headers de seção (ajudam o planner editorial 11.6 a identificar funções): `# Título` provocativo / `## Contexto` (cena reconhecível) / `## Conceito` (o que é / o que NÃO é / por que importa / problema que resolve / 1 frase de pull quote) / `## Exemplo aplicado` (problema→risco→leitura→ação→consequência, personagem fictício) / `## Ferramenta prática` (3-6 passos em lista numerada) / `## Aplicação no cotidiano` (cuidados, riscos, ação da semana + 1 frase de destaque) / `## Para refletir` (3-5 perguntas em bullets). Âncoras mínimas: ≥2 frases para pull quote, ≥1 exemplo, ≥1 ferramenta numerada, ≥1 comparação implícita.
- **Consumido por**: `micro_conteudos.conteudo_inline` + PDF via `renderConteudoFinalPDF` (passando antes pelo planejador editorial 11.6).

### 11.4 Case Study (Estudo de Caso)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/case-study.ts::promptCaseStudy`
- **Caller**: Mesmo, formato='case'
- **System prompt** (resumo editorial do prompt real em `lib/season-engine/prompts/case-study.ts`):
  "Você é autor de estudos de caso narrativos da Vertho." Cria estudo de caso imersivo e vivencial. Princípios-chave:
  1. O descritor NUNCA é mencionado pelo nome no texto
  2. O aprendizado vem da experiência da situação, não da explicação
  3. A narrativa precisa ter tensão real. O contexto deve ser plausível para o cargo
  4. O leitor precisa sair pensando, não apenas "entendendo o conceito"
  5. O desfecho não pode matar toda ambiguidade de forma artificial
  6. Sem tom professoral, sem moral da história explícita, sem melodrama
  7. Máximo 3 personagens. Detalhes sensoriais (escritório, horário, pressão)
  8. Linguagem brasileira profissional, acessível. Markdown limpo
  9. Dificuldade escala com nível: SITUACOES CLARAS (N1-1.5), DILEMAS AMBIGUOS (N2-2.5), CASOS COMPLEXOS (N3+)

- **Output**: Markdown 600-1000 palavras. Sem cercas de código.
- **Inputs user**: Competência, descritor (nunca citado pelo nome), nível (dificuldade), cargo, contexto. Estrutura obrigatória: TITULO (# [Nome do protagonista] e [o desafio]) / CONTEXTO (2-3 paragrafos) / DESENVOLVIMENTO (3-4 paragrafos, descritor nas ações e escolhas) / DESFECHO (1-2 paragrafos, realista) / ## Suas perguntas (3 perguntas abertas em bullets, a última convida a identificar onde o comportamento apareceu).
- **Consumido por**: Igual `text`.

### 11.5 Sugerir Tags IA (Classificação de conteúdos)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/conteudos.ts::sugerirTagsIA`
- **Modelo**: Via `getModelForTask(empresaId, 'conteudo_tags')`
- **Max tokens**: 1000
- **Trigger**: Admin em `/admin/conteudos` → "Sugerir tags" em conteúdo não classificado.
- **System prompt** (resumo editorial do prompt real em `actions/conteudos.ts`):
  "Você é um especialista em classificação de conteúdos de desenvolvimento profissional da Vertho." Princípios-chave:
  1. Use apenas a lista de competências fornecida. Nunca invente competência fora do vocabulário
  2. Não force encaixe quando a base estiver fraca
  3. Prefira prudência a falsa precisão
  4. Classifique pelo que o conteúdo REALMENTE entrega, não pelo que o título promete
  5. Se a descrição for vaga, reduza a confiança
  6. Vocabulário controlado: competência deve vir EXATAMENTE da lista fornecida

- **Output**: JSON `{ competencia, descritor, nivel_min, nivel_max, contexto, cargo, setor, tipo_conteudo, confianca:"alta|media|baixa", raciocinio }`.
- **Inputs user**: Título, descrição, formato, duração, lista de competências disponíveis com descritores (controlled vocabulary, até 30 competências com até 5 descritores cada).
- **Consumido por**: Sugestão para admin aprovar/aplicar via `aplicarTagsIA`.

### 11.6 PDF Editorial Layout Planner (Diretor de arte)
> `ATIVO` desde 2026-05-29 · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/conteudo-layout-plan.ts::PLAN_SYSTEM` (planejador `planLayout`).
- **Caller**: `actions/conteudos.ts::gerarConteudoFinal` (PDF premium do "conteúdo final").
- **Modelo**: Via `getModelForTask(empresaId, taskKey)` — `conteudo_case` (formato=case) ou `conteudo_texto` (demais). Sem empresa → default `claude-sonnet-4-6`.
- **Max tokens**: 8000
- **Temperatura**: 0.3 (única chamada que passa `options.temperature`).
- **System prompt** (resumo editorial do prompt real em `lib/conteudo-layout-plan.ts`):
  "Você é um DIRETOR DE ARTE EDITORIAL sênior da Vertho." Transforma o conteúdo já escrito numa publicação editorial premium (A4 vertical, 5-8 páginas, cada página com uma função editorial distinta). Princípios-chave:
  1. **REGRA ABSOLUTA**: nunca reescreve, resume, inventa ou remove texto — apenas classifica e organiza, referenciando blocos por `id`
  2. Cada página tem um papel (`contexto`, `conceito`, `exemplo`, `comparativo`, `ferramenta`, `aplicacao`, `reflexao`, `corpo`)
  3. Tratamentos visuais por bloco: heading, paragraph, pullquote, synthesis, bullets, numberedCards, flow, checklist, caseCard (card de caso/exemplo), reflectionCards + comparison (lado a lado). Roles: contexto/conceito/exemplo/comparativo/ferramenta/aplicacao/cuidados/sintese/reflexao/corpo
  4. `pullquoteText`: trecho VERBATIM (substring normalizada ≥12 chars) destacado de um parágrafo, de forma aditiva (não remove o original)
  5. **COBERTURA**: todo bloco deve aparecer em ≥1 item estrutural (o `sanitize()` reanexa blocos esquecidos)
  6. `heroImage` em EXATAMENTE uma página (dispara a imagem conceitual de seção)
  7. **Nenhuma página interna só de texto**: cada página interna precisa de ≥1 recurso visual (pull quote, synthesis, cards, flow, checklist, reflectionCards, comparison ou heroImage); páginas fracas se fundem, páginas densas se quebram (alvo 5-8 págs); ferramenta prática = página mais visual
- **Output**: JSON `LayoutPlan` `{ summary, pages:[{ role, heroImage?, items:[{ as, ref|refs|left|right, text? }] }] }`. Pós-processado por `sanitize()`: valida refs no range, deduplica refs estruturais, valida `pullquoteText` como substring, reanexa blocos esquecidos, mantém só o primeiro `heroImage`. Nunca lança — retorna `null` → fallback flat.
- **Inputs user**: título, competência, descritor, formato + blocos atômicos serializados (id + kind + texto) extraídos por `parseBlocks` (integridade por id: a IA escolhe só o layout, o texto é puxado verbatim pelo renderer).
- **Consumido por**: `renderConteudoFinalPDF` (`lib/conteudo-final-pdf.tsx`) — renderiza cada `PagePlan` puxando o texto verbatim por id do `byId` Map.

### 11.7 Expansão mínima de PDF (garantirMinimoPdf)
> `ATIVO` desde 2026-05-29 · Prompt documentado como: `transcrito`

- **Arquivo**: `actions/conteudos.ts::garantirMinimoPdf` (helper interno; `MIN_PDF_CHARS = 8000`).
- **Caller**: `gerarConteudoIA` (após gerar texto/case) e `gerarConteudoFinal` (antes de planejar/renderizar).
- **Modelo**: reusa o mesmo modelo/aiConfig do conteúdo original (texto ou case).
- **Max tokens**: `MIN_PDF_CHARS` (8000).
- **System prompt**: reusa o `system` do prompt-autor original (11.3 texto ou 11.4 case) — mantém estilo/tom/formato.
- **User prompt** (resumo): expansão por **VALOR editorial, não por volume**. Cada parágrafo novo deve acrescentar nuance/exemplo/aplicação/risco/cuidado/comparação/pergunta; se não acrescentar, não escrever. PRESERVA tema, público, tom, estrutura de seções e markdown (não cria seções novas — o helper não conhece o formato, então não impõe estrutura que quebraria um estudo de caso). Meta ≥8000 chars **quando o tema justificar sem repetição**; senão prioriza qualidade. Sem inventar dados/leis/estatísticas.
- **Output**: markdown enriquecido (alvo ≥8000 chars). Só substitui se o resultado for maior que o original; em erro retorna o original (não-fatal).
- **Inputs user**: o markdown curto + contagem de caracteres.
- **Consumido por**: pipeline do PDF (garante volume mínimo para uma publicação de várias páginas antes do planejador 11.6).

### 11.8 Roteiro de vídeo do Módulo-Base (gerador automático HeyGen+Remotion)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/video/roteiro-prompt.ts::buildRoteiroPrompt`
- **Caller**: `lib/video/gerar-roteiro.ts::gerarRoteiroDeModulo` (chamado por `actions/gerar-video.ts`)
- **Modelo**: `claude-opus-5` com thinking adaptativo (default da task `conteudo_video` em `lib/ai-tasks.ts`)
- **Max tokens**: 16000 (thinking + texto compartilham o teto na geração 5)
- **O que faz**: transforma um Módulo-Base num ROTEIRO TÉCNICO de vídeo de 3-5 min em JSON. Estrutura: `avatar_intro` + miolo de 6-12 cenas + `avatar_outro`. 13 templates de cena: `avatar_intro`, `avatar_outro`, `concept_reveal`, `comparison_motion`, `icon_story`, `steps_flow`, `stat_highlight`, `quote_spotlight`, `scenario_card`, `maturity_ladder`, `myth_truth`, `definition_card`, `reflection_prompt`. Avatar ~30s (intro 26-30 + outro 22-26 palavras) p/ custo HeyGen ~$0,51/deck. O `avatar_intro` **não cumprimenta** (abre direto no gancho) — a saudação nominal "Olá, {nome}" é prependada por pessoa fora do deck. Doc dos templates: `docs/GERADOR-VIDEO-MODULO.md` (seção Templates de cena); pipeline completo (áudio/master/saudação/render): `docs/GERADOR-VIDEO-MODULO.md`.
- **Personalização por célula**: recebe **cargo** (bloco de contexto), **PPP** (brief da escola) e **DISC dominante**. O DISC ajusta SÓ o **tom da narração**; o deck visual é **invariante por perfil** (campos `deck_invariant` / `disc_sensitive_fields` na saída).
- **System prompt** (resumo editorial; prompt completo em `docs/PROMPT-ROTEIRO-VIDEO.md`). Princípios-chave:
  1. Few-shot de narração (exemplos de fala que viram TTS)
  2. Anti-eco acadêmico — transforma prosa densa do módulo em fala oral gravável
  3. Alvo por contagem de palavras por cena (campo `estimated_words`) para casar com a duração
  4. `source_anchor` padronizado (enum: `IDEIA_PRINCIPAL`, `PRINCIPIOS:<nome>`, `ERROS_COMUNS`, `BOAS_PRATICAS`, `SITUACOES_TIPICAS`, `CARGO`, `PPP`...) — rastreia de onde cada cena saiu
  5. Cobertura mínima do módulo (todas as partes essenciais entram no roteiro)
  6. Salvaguardas LGPD (sem nomes/dados reais, sem invenção)
- **Output**: JSON `VideoRoteiro` `{ title, theme, deck_invariant, scenes[] }`. Cada cena: `type` (1 dos 13 templates) + `narration` + `key_idea` + `source_anchor` + `estimated_words` + campos visuais do template. A `narration` é a **fonte canônica de TTS e legendas**.
- **Inputs user**: Módulo-Base (4 blocos) + cargo + PPP da escola + DISC dominante + duração-alvo.
- **Consumido por**: pipeline de vídeo (`trigger/gerar-video-modulo.ts` para TTS/assets, `lib/video/montar-inputprops.ts` + Remotion para o deck, HeyGen para o avatar).

### 11.9 Camada de personalização do PDF final (DISC + PPP)
> `ATIVO` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/season-engine/prompts/personalizacao.ts::buildPersonalizacaoPrompt`; caller em `actions/conteudos.ts::gerarConteudoFinalPersonalizado`.
- **Modelo default**: resolvido pela task `conteudo_personalizacao` (sem pin próprio, cai no fallback global `claude-sonnet-4-6`). **Max tokens**: 2000. **Temperature**: 0.5.
- **Tarefa**: acrescenta ao conteúdo-núcleo, sem reescrevê-lo, uma seção `## Para o seu perfil: {arquétipo}` e, quando existe brief, `## No contexto da sua escola`.
- **Regras**: DISC e PPP funcionam como lentes de aplicação; não explicar DISC, citar siglas/scores ou inventar dados da escola. Cada seção tem 1-2 parágrafos curtos e, opcionalmente, 2-4 ações. O núcleo curricular permanece invariável.
- **Inputs**: competência, descritor, arquétipo DISC, descrição do arquétipo, brief estruturado da escola e até 12.000 caracteres do conteúdo já pronto.
- **Output/consumo**: somente o markdown das seções adicionais; o caller concatena ao núcleo, planeja o layout e gera/cacheia o PDF personalizado por conteúdo × empresa × arquétipo × assinatura de contexto.

---

## Kit Semanal (conteúdo por competência × descritor × DISC)

> Lacuna coberta em 27/07/2026: o Kit é hoje o principal caminho de conteúdo entregue na trilha e
> não estava no catálogo. O contrato é "**todos os formatos dizem a mesma coisa**": um NÚCLEO neutro
> por tema, um DESAFIO por perfil, e cada formato recebe o núcleo como appendix. Doc funcional:
> `docs/KIT-SEMANAL.md`.

### 12.1 Kit — Núcleo conceitual do tema (brief)
> `ATIVO` · Prompt documentado como: `literal`

- **Arquivo**: `lib/season-engine/kit/brief.ts::gerarKitBrief` (persistido em `kit_briefs`, idempotente por tema via `resolverOuCriarBrief`).
- **Caller**: `actions/kits.ts` (individual e lote por DISC).
- **Modelo**: herdado do `aiConfig`/`model` do caller. **Max tokens**: 1500. Até **3 tentativas** — se o JSON não parsear, reforça "SOMENTE JSON" e repete; falha 3× lança.
- **System prompt**: "Você é designer instrucional da Vertho. Destile o NÚCLEO CONCEITUAL de um tema… a espinha que TODOS os formatos (vídeo, podcast, texto, estudo de caso) vão expressar para 'dizer a mesma coisa'." O núcleo é **NEUTRO de perfil (não personaliza por DISC) e NEUTRO de formato**.
- **Output**: JSON `{ideia_central, pontos_chave[3], exemplo_ancora}` — 1 frase-síntese, exatamente 3 pilares, 1 situação concreta sem nome próprio.
- **Inputs user**: competência, descritor, faixa de nível (1-4), cargo, contexto + **matéria-prima canônica** do Módulo-Base quando existir ("preserve as bases") + `pppBrief` como *lente de aplicação, sem citar o nome da instituição*.
- **Consumido por**: 12.2 (desafio) e 12.3 (appendix de cada formato).

### 12.2 Kit — Desafio da semana por perfil DISC
> `ATIVO` · Prompt documentado como: `literal`

- **Arquivo**: `lib/season-engine/kit/brief.ts::gerarKitDesafio` (uma chamada por letra DISC).
- **Modelo**: mesmo do brief.
- **System prompt**: micro-ação **prática e observável** (não conteúdo, não dica, não reflexão), 2-3 frases, viável na semana, singular. `LENTE_DISC[disc]` define **por onde a ação engaja** aquele perfil — e há regra explícita: **nunca citar DISC, siglas ou o nome do perfil no texto**.
- **Output**: JSON `{desafio_texto, acao_observavel, criterio_de_execucao, por_que_cabe_na_semana}`.
- ⚠️ **É este desafio que a pessoa vê** — o `conteudo.desafio_texto` gravado na semana é placeholder, substituído na leitura pelo overlay do kit.

### 12.3 Kit — Appendix de enriquecimento por formato
> `ATIVO` · Prompt documentado como: `appendix`

- **Arquivo**: `lib/season-engine/kit/enrich.ts` — **não é prompt próprio**: injeta um bloco no system dos autores de conteúdo (11.1 vídeo, 11.2 podcast, 11.3 texto, 11.4 case).
- **O que injeta**: a espinha compartilhada (ideia central obrigatória, os 3 pontos-chave a cobrir, o exemplo-âncora), a **lente de arquétipo DISC** (tom/exemplos/enquadramento, de novo com a proibição de citar o perfil), e o **desafio ao qual o conteúdo deve conduzir** — com um fecho específico por formato (`COMO_FECHA`).
- **Efeito**: 4 formatos de uma mesma célula ficam coerentes entre si e distintos por perfil, sem reescrever os prompts-autores.

### 12.4 Contexto municipal consolidado (empresa-rede)
> `ATIVO` · Prompt documentado como: `literal`

- **Arquivo**: `lib/season-engine/kit/contexto-empresa.ts::resolverContextoEmpresa`.
- **Modelo**: herdado do `aiConfig`. **Max tokens**: 1200 (saída cortada em 2500 chars).
- **Quando roda**: só quando a empresa tem **N PPPs** (1 por escola). Com 1 PPP, usa direto — sem chamada de IA. Resultado cacheado em `empresas.kit_contexto`, invalidado quando entra PPP mais novo; falha na síntese cai no PPP mais recente **sem cachear**.
- **System prompt**: "Você consolida o CONTEXTO PEDAGÓGICO MUNICIPAL de uma rede de ensino a partir dos PPPs de várias escolas. Extraia o que é COMPARTILHADO pela rede…, ignorando idiossincrasias de escolas específicas." Máximo 20 escolas, 1200 chars cada; **proibido citar nomes de escolas**.
- **Por que existe**: pegar "o PPP mais recente" numa rede aplica **uma escola sorteada** ao município inteiro. Esse é o modo de falha **F-I10** (`docs/FMEA-PIPELINE.md`), fechado em **9 sites** (26-27/07) e agora protegido por guard de CI (`tests/unit/security/ppp-rede-guard.test.ts`).
- **Quem mais consome agora**: além do Kit — `buscarContextoPPP` (IA1/IA2/IA3, só quando a empresa tem **N** PPPs), IA4, Cenário B do fechamento e o PDF personalizado. Todos compartilham o cache `empresas.kit_contexto` — **uma** síntese por rede, e a mesma lente na régua, no cenário, no kit e no PDF.

### 12.5 Paleta de marca a partir do site do cliente
> `ATIVO` desde 2026-07-22 · Prompt documentado como: `literal`

- **Arquivo**: `lib/site-palette.ts::SYSTEM_PALETA` (fetch da página com guarda anti-SSRF antes).
- **Caller**: aba **Branding** da configuração da empresa ("Puxar cores").
- **Max tokens**: 500.
- **System prompt**: descreve a **anatomia da tela de login** (gradiente de fundo, título, botão em gradiente com texto branco, links de destaque) e manda mapear as cores encontradas nos **7 slots** do `ui_config`. Regras: usar as cores **de marca** (cinza/preto/branco são estrutura), fundo escuro e sóbrio, `primary_color_end` = mesmo matiz mais escuro, e **"fidelidade à marca vence estética própria — não 'melhore' a cor do cliente"**.
- **Output**: JSON com os 7 hex + `racional` de 1 frase.
- **Salvaguarda em CÓDIGO, não no prompt**: o contraste é verificado e corrigido depois da IA — o modelo escolhe a paleta, o código garante que ela é legível.

---

## Simuladores

### 13.1 Simulador de Respostas (Fase 3)
> `AUXILIAR` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/simulador-conversas.ts::simularUmaResposta`
- **Max tokens**: 4096
- **Trigger**: Admin/dev usa em `/admin/empresas/{id}/simulador` pra gerar respostas fictícias pros cenários (testar pipeline IA4 sem precisar de colabs reais). Distribuição: 30% fraco (N1-2), 50% médio (N2-3), 20% forte (N3-4).
- **System prompt** (resumo editorial do prompt real em `actions/simulador-conversas.ts`):
  "Você vai simular as respostas de um colaborador fictício a 4 perguntas de um cenário de avaliação de competências." Princípios-chave:
  1. Escreva sempre em primeira pessoa. Português brasileiro natural
  2. Não use linguagem acadêmica. Não mencione nível, rubrica, competência ou descritor
  3. As respostas devem soar humanas, não "treinadas para avaliação"
  4. As 4 respostas devem variar naturalmente entre si
  5. Mesmo respostas fortes devem parecer de pessoa real
  6. R1-R4 precisam responder à lógica de cada pergunta; P4 tende a trazer mais consciência de limite
  7. Usar situações plausíveis para o cargo

  3 perfis de resposta:
  - FRACO (N1-2): vago, genérico, hesitação plausível ("acho", "tentaria"), 2-4 frases, sem caricatura
  - MEDIO (N2-3): alguma substância mas inconsistente, critério parcial, 3-5 frases, ambiguidade real
  - FORTE (N3-4): ação concreta, critério claro, adaptação, 4-7 frases, ainda humano

- **Output**: JSON `{ r1, r2, r3, r4 }`.
- **Inputs user**: Colaborador (nome, cargo), competência, perfil-alvo (fraco/medio/forte + nível N1-N4), cenário (descrição), 4 perguntas (P1-P4). Distribuição: 30% fraco, 50% médio, 20% forte.
- **Consumido por**: `respostas` (para testar IA4).

### 13.2 Simulador de Temporada — Colab (Haiku)
> `AUXILIAR` · Prompt documentado como: `resumo_editorial`

- **Arquivos**: `lib/season-engine/prompts/simulador-temporada.ts::promptSimuladorColab` + `promptSimuladorCompromisso`
- **Caller**: `lib/season-engine/simulador-core.ts` (funções `simularSocratico`, `simularMissaoPratica`, `simularQualitativa`, `simularSem14Ate`; a action `actions/simulador-temporada.ts` delega ao core)
- **Modelo**: `claude-haiku-4-5-20251001` (hardcoded via `SIM_MODEL` — rápido+barato)
- **Max tokens**: 500-2500 (varia por cenário)
- **Trigger**: Admin da Vertho (platform admin) usa em `/admin/vertho/simulador-temporada` pra simular 14 semanas de uma trilha completa.
- **System prompt** (resumo editorial do prompt real em `lib/season-engine/prompts/simulador-temporada.ts`):
  "Você está SIMULANDO um colaborador fictício dentro de uma plataforma de desenvolvimento profissional da Vertho." Princípios-chave:
  1. Responda sempre em primeira pessoa. Português brasileiro natural
  2. Retorne APENAS a próxima fala do colaborador. Sem aspas, prefixos ou explicações
  3. Nunca saia do personagem. Nunca mencione nível, competência, descritor, rubrica ou avaliação
  4. A fala precisa ser coerente com a semana, o tipo de conversa e o perfil de evolução
  5. O colaborador simulado deve soar humano, não idealizado
  6. 2-5 frases por fala, variando. Cite situações plausíveis do cargo quando fizer sentido
  7. Nem toda fala precisa ser brilhante. Pequenas hesitações e imperfeições são bem-vindas

  4 perfis de evolução (detalhados por arco semanal):
  - evolucao_confirmada: sems 1-4 superficial mas engajado, 5-8 exemplos melhores, 9-13 articulado com evidências
  - evolucao_parcial: avanços em certos pontos, oscila, reflexões variam em profundidade
  - estagnacao: participa com honestidade, concretude baixa, respostas genéricas ("foi legal"), sem mal humor
  - regressao: começa com energia, vai ficando curto e menos implicado, perde fôlego

  5 tipos de chat com adaptação: socratic, missao_feedback, analytic, qualitativa_fechamento, cenario_final

- **Output**: Texto livre (fala do colab).
- **Inputs user**: Competência, descritor, cargo, semana/14, tipo de chat, perfil de evolução, desafio/missão/cenário, histórico recente (6 msgs), turn do colab.
- **Loop**: Sim — 1 chamada por turn colab na simulação.
- **Consumido por**: Persistido em `temporada_semana_progresso` como se fosse colab real.

### 13.3 Simulador de Compromisso (missão prática)
> `AUXILIAR` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/prompts/simulador-temporada.ts::promptSimuladorCompromisso`
- **Max tokens**: 500
- **System prompt** (resumo editorial do prompt real em `lib/season-engine/prompts/simulador-temporada.ts`):
  "Você está SIMULANDO um colaborador fictício em uma plataforma de desenvolvimento profissional da Vertho." Gera APENAS o compromisso inicial da semana de missão prática. Princípios-chave:
  1. Escreva em primeira pessoa. Português brasileiro natural
  2. Retorne APENAS a fala do colaborador. Sem aspas, prefixos ou explicações
  3. Nunca saia do personagem. Nunca mencione nível, competência, descritor ou rubrica
  4. O compromisso deve soar humano, não idealizado
  5. 1-2 frases curtas. Mencione situação concreta da rotina do cargo
  6. Pode ter cautela ou realismo. Não soar perfeito demais nem fraco demais
  7. Não repetir a missão com outras palavras. Não virar checklist

  Perfil afeta compromisso: evolucao_confirmada (claro, específico), evolucao_parcial (boa intenção com hesitação), estagnacao (presente mas genérico), regressao (curto, menos convicto).

- **Output**: Texto livre (1-2 frases do compromisso).
- **Consumido por**: `temporada_semana_progresso.feedback.compromisso`.

### 13.4 Extração pós-simulação (simulador)
> `AUXILIAR` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `lib/season-engine/simulador-core.ts` — constante `SIM_EXTRACTOR_SYSTEM`, várias chamadas inline
- **System prompt** (resumo editorial do prompt real em `lib/season-engine/simulador-core.ts`):
  "Você é um extrator de dados estruturados da Vertho." Analisa conversa SIMULADA e transforma em JSON estruturado fiel. Princípios-chave:
  1. Extraia somente o que foi efetivamente dito ou claramente sustentado
  2. Não invente comportamento, avanço, execução ou insight
  3. Diferencie fala articulada de evidência concreta — fala bonita não é prova
  4. Exemplo concreto com ação e consequência vale mais do que opinião ou intenção
  5. Se faltar base, reduza confiança ou força da evidência
  6. Preserve ambiguidade quando existir — ela é útil para stress test
  7. Não infle qualidade ou nota sem sustentação. O output deve expor fragilidades reais
  8. Força da evidência: fraca (abstrata/genérica), moderada (concreta mas incompleta), forte (concreta + coerente + ação + consequência)

  Atenção: conversa SIMULADA para teste do motor. Preservar qualidade real, não "embelezar".

- **Output (socratic)**: JSON `{ desafio_realizado, relato_resumo, insight_principal, compromisso_proxima, qualidade_reflexao, sinais_extraidos:{exemplo_concreto, autopercepcao, compromisso_especifico}, limites_da_conversa }`.
- **Output (missao_feedback)**: JSON `{ avaliacao_por_descritor[{descritor, nota, forca_evidencia, observacao, trecho_sustentador, limite}], sintese_bloco, alertas_metodologicos }`.
- **Consumido por**: `reflexao` ou `feedback`.

---

## Fase 4 (PDI legado)

### 14.1 Gerar PDIs
> `LEGADO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/fase4.ts::gerarPDIs`
- **Max tokens**: 6000
- **Trigger**: Admin "Gerar PDIs" em Fase 4.
- **Loop**: Sim — 1 por colaborador.
- **System prompt**:
  ```text
  Você é um especialista em desenvolvimento de pessoas e PDI.
  Crie um plano de desenvolvimento individual prático e acionável.
  Responda APENAS com JSON válido.
  ```
- **Inputs user**: Empresa, colaborador (nome, cargo), relatório de competências (JSON inteiro).
- **Output**: JSON `{ colaborador, objetivos[{competencia, nivel_atual, nivel_meta, acoes[{acao, prazo, tipo}], indicadores_sucesso}], cronograma_semanas, checkpoints }`.
- **Consumido por**: `pdis.conteudo`.

---

## Outros (Cenário B legado, Evolução Granular, Tutor Evidência)

### 15.1 Gerar Cenário B (legado / DISC-aware)
> `LEGADO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/cenario-b.ts::gerarCenarioB`
- **Max tokens**: 32768
- **Trigger**: `sessoes_avaliacao` individual gera cenário B adaptado ao DISC. (Alternativa ao 5.1 que é lote por empresa.)
- **System prompt** (~1200 chars):
  ```text
  <PAPEL>
  Especialista em avaliacao de competencias com 20 anos de experiencia.
  Cria cenarios situacionais que funcionam como instrumentos diagnosticos.
  </PAPEL>

  <TAREFA>
  Crie CENARIO B complementar ao cenario A. Mesma competencia, situacao-gatilho DIFERENTE.
  </TAREFA>

  <REGRAS>
  1. REALISMO CONTEXTUAL (nomes brasileiros)
  2. ESTRUTURA DO DILEMA (concreta, tensao real, nao extrema)
  3. PODER DISCRIMINANTE (N1-N4)
  4. DIVERSIDADE vs CENARIO A (situacao gatilho OBRIGATORIAMENTE diferente)
  </REGRAS>

  Responda APENAS com JSON valido.
  ```
- **Inputs user**: Competência (nome, descrição, gabarito), perfil DISC completo, cenário A original, avaliação da sessão anterior (lacunas a focar).
- **Output**: JSON `{ descricao, personagens, situacao_gatilho, pergunta_aprofund_1, pergunta_aprofund_2, pergunta_raciocinio, pergunta_cis, objetivo_conversacional, referencia_avaliacao:{nivel_1..4}, faceta_avaliada, dilema_etico_embutido }`.
- **Consumido por**: `banco_cenarios`.

### 15.2 Evolução Granular (por descritor)
> `ATIVO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/evolucao-granular.ts::gerarEvolucaoDescritores`
- **Max tokens**: 32768
- **System prompt** (7 princípios):
  ```text
  Voce e um especialista em avaliacao de competencias comportamentais com profundo conhecimento da metodologia DISC.
  Sua tarefa e analisar a evolucao de um colaborador entre avaliacao inicial e reavaliacao, descritor por descritor.

  7 princípios: ancoragem na régua, granularidade 0.1, convergência controlada (5 estados), escala 1-4, anti-inflação, limites explícitos, recomendação acionável.

  CONVERGÊNCIA CONTROLADA (5 estados):
  EVOLUCAO_CONFIRMADA | EVOLUCAO_PARCIAL | SEM_EVOLUCAO | EVOLUCAO_INVISIVEL | REGRESSAO

  Responda APENAS com JSON valido, sem texto adicional.
  ```
- **Inputs user**: Competência (nome, descrição, gabarito), perfil DISC, avaliação inicial, reavaliação, cenário B.
- **Output**: Array JSON `[{descritor, nivel_inicial, nivel_reavaliacao, delta, evidencia_cenario_B, convergencia, convergencia_detalhe, conexao_CIS, recomendacao}]`.
- **Consumido por**: `evolucao_descritores` (upsert).

### 15.3 Tutor Evidência (Avaliar evidência submetida — legado Fase 4 GAS)
> `LEGADO` · Prompt documentado como: `resumo_editorial`

- **Arquivo**: `actions/tutor-evidencia.ts::avaliarEvidencia`
- **Max tokens**: 1024
- **Trigger**: Colaborador submete evidência semanal na antiga Fase 4.
- **System prompt** (~800 chars):
  ```text
  Voce e o tutor da Vertho avaliando uma evidencia de pratica semanal.
  Avalie em 5 criterios (0-2pts cada, total 0-10):

  1. CONCRETUDE: acao concreta?
  2. AUTENTICIDADE: experiencia REAL?
  3. REFLEXAO: compreensao do PORQUE?
  4. IMPACTO: resultado/consequencia?
  5. APLICACAO: proximos passos?

  Tom: acolhedor, motivacional. Adaptado ao DISC:
  - Alto D: direto, resultados
  - Alto I: inspirador, impacto
  - Alto S: encorajador, processo
  - Alto C: detalhado, qualidade

  Responda APENAS com JSON valido.
  ```
- **Inputs user**: Colaborador, cargo, DISC, competência, semana, pílula da semana, evidência.
- **Output**: JSON `{ criterios:{concretude, autenticidade, reflexao, impacto, aplicacao}, pontos_total, feedback, qualidade }`.
- **Consumido por**: `capacitacao.evidencia_avaliacao` + pontos.

### 15.4 Auditoria Sem 14 — Regerar com Feedback
> `ATIVO` · Prompt documentado como: `appendix (sobre 6.12)`

- **Arquivo**: `app/admin/vertho/auditoria-sem14/actions.ts::regerarScoringComFeedback`
- **Max tokens**: 10000 (scorer) + 8000 (check)
- **Reusa prompts**: 6.12 (`promptEvolutionScenarioScore`) + 6.13 (`promptEvolutionScenarioCheck`) — com appendix no system:
  ```text
  SCORER APPENDIX (7 regras): nome correto, não use personagens do cenário, corrija problemas apontados, mantenha ancoragem na régua, limites explícitos, trecho obrigatório, resumo_avaliacao como objeto.

  CHECK APPENDIX (8 regras segunda rodada): verifique se scorer corrigiu, aplique critérios mais rigorosos na segunda rodada, erro_grave flag, ponto_mais_confiavel/fragil.

  ## FEEDBACK DA AUDITORIA ANTERIOR:
  {auditoriaAnterior.nota_auditoria, resumo, alertas, ajustes_sugeridos}
  ```
- **Trigger**: Platform admin Vertho em `/admin/vertho/auditoria-sem14` → "Regerar com feedback".
- **Consumido por**: Substitui `feedback` + preserva `auditoria_anterior` + dispara regen do Evolution Report.

### 15.5 Auditoria Sem 14 — Check com Feedback
> `ATIVO` · Prompt documentado como: `appendix (sobre 6.13)`

- **Arquivo**: `app/admin/vertho/auditoria-sem14/actions.ts` (segunda chamada em `regerarScoringComFeedback`)
- **Reusa**: 6.13 (`promptEvolutionScenarioCheck`).
- **Max tokens**: 8000.

---

## Módulos-Base de Conteúdo (Vertho Master)

### 16.1 Rascunhar Módulo-Base (autor assistido + import docx)
> `ATIVO` desde 2026-05-28 · Frente 2/3 dos Módulos-Base (ver `docs/MODULOS-BASE-CONTEUDO.md`).

- **Arquivo**: prompt em `lib/modulo-base-autor.ts` (`SYSTEM_AUTOR`, `montarUserPrompt`). Callers: `actions/modulos-base.ts::rascunharModuloBase`, `importarModuloDocx`, `criarModuloBaseDeManuscrito`, e a task `trigger/gerar-modulos-manuscrito.ts`. Moveu pra `lib/` porque um `'use server'` não pode ser importado por tasks sem virar endpoint HTTP.
- **Modelo**: Via `getModelForTask(null, 'modulo_base_autor')` — default `claude-sonnet-4-6`, configurável.
- **Max tokens**: 64000 (output). Sonnet 4.6/4.7 aguenta — necessário porque docs do template podem ter conteúdo expandido em todos os 4 blocos. Antes era 6000 e truncava no fim do JSON em docs grandes.
- **Slice do docx no input**: 60000 chars (~15k tokens) — bem dentro do 1M context.
- **System prompt** (resumo editorial):
  "Você é um designer instrucional sênior da Vertho. Preencha um Módulo-Base seguindo o template oficial. Regras intransponíveis:
  1. É matéria-prima pedagógica, NÃO roteiro final, NÃO régua, NÃO aula
  2. Sem nomes próprios reais. Sem leis/normas/estatísticas inventadas. Sem diagnóstico psicológico. Sem DISC determinista
  3. Exemplos universais (sem cargo específico salvo contexto exclusivo)
  4. Linguagem clara, aplicada, profissional. Sem jargão excessivo
  Formato de saída: APENAS JSON válido, sem markdown."
- **User prompt** (`montarUserPrompt`): nome+pilar+segmento da competência canônica + descritor completo + textos N_entrada/N_destino da régua + público/termo canônico/cargo + contexto pedagógico + evidências esperadas + referência opcional + texto-fonte opcional (teto default 60k chars) + schema JSON. Faixas fechadas: 5-6 princípios, 4-5 situações, 4-5 erros e 4-5 boas práticas; repertório linguístico com 6 categorias obrigatórias.
- **Output**: JSON com `{ conteudo_central, conteudo_aplicavel, guarda_corpos, adaptacao_por_formato }`.
- **Robustez**: parsing tolerante (`extractCorpo` — texto limpo → primeiro `{...}` embutido) + **1 retry**.
- **Validação**: `validarCorpo` verifica campos obrigatórios e mínimos (ideia, explicação, ≥3 princípios, ≥3 situações, preservar+evitar presentes). Avisos são persistidos pra revisão humana — não bloqueiam o INSERT.
- **Workflow**: output sempre vira `status='rascunho'`. Publicação exige aprovação da IA-auditora (16.2) — padrão Dual-IA, não mais revisão humana cruzada.
- **Consumido por**: tabela `modulos_base_conteudo` (platform-level, sem `empresa_id`).

### 16.2 IA-Auditora de Módulo-Base (padrão Dual-IA)
> `ATIVO` desde 2026-05-28 · Substitui a regra de revisão humana cruzada (criador-vs-aprovador).

- **Arquivo**: prompt em `lib/modulo-base-auditor.ts` (`SYSTEM_AUDITOR`, `auditarModuloCore`). Disparada por `submeterRevisao`; pelo botão "Reauditar"; dentro do refino; e ao fim da task de manuscrito. ⚠️ O modelo **não** devolve mais `nota`/`veredito` — só `problemas`. A conversão é `derivarVeredito()`, em código.
- **Modelo**: Via `getModelForTask(null, 'modulo_base_auditor')` — default **`gpt-5.6-terra`**, pinned. Modelo diferente da autora (Claude) de propósito.
- **Max tokens**: 16000 (output) — confortável pra veredito + lista detalhada de problemas com gravidade.
- **System prompt** (resumo editorial):
  "Você é IA-auditora de Módulos-Base. Valide RIGOROSAMENTE contra spec e guarda-corpos. NÃO suavize. 9 critérios:
  1. ESTRUTURA — 4 blocos completos, mínimos de princípios/situações/erros/boas práticas
  2. NÃO É RÉGUA de maturidade (problema grave se for)
  3. NÃO É AULA final pro colaborador (matéria-prima, não conteúdo)
  4. EXEMPLOS UNIVERSAIS (sem cargo específico, sem nomes próprios)
  5. NADA INVENTADO (leis, normas, estatísticas)
  6. SEM diagnóstico psicológico; SEM DISC determinista
  7. AUTO-CONSISTÊNCIA com os guarda_corpos do próprio módulo
  8. PROFUNDIDADE adequada (não stubs)
  9. LINGUAGEM clara e aplicada
  O modelo NÃO calcula nota nem veredito: apenas acha defeitos reais, classifica gravidade e cita o campo afetado."
- **User prompt**: contexto da competência canônica + descritor + transição + locale + título + finalidade + JSON completo dos 4 blocos do módulo a auditar.
- **Output da IA**: JSON `{ problemas:[{categoria,descricao,gravidade,campo_afetado}], recomendacoes, confianca }`.
- **Nota/veredito em código** (`derivarVeredito`): parte de 10 e desconta 2,5 por alta, 0,6 por média e 0,1 por baixa; qualquer alta impõe teto 4,9; estrutura completa sem alta tem piso 7,0. `reprovado` se alta ou nota <5; `aprovado` se nota ≥9 e sem média; demais = `aprovado_com_ressalvas`.
- **Robustez**: parsing tolerante + 1 retry; aceita array `problemas` vazio. Eventuais `nota/veredito` sugeridos pelo modelo são ignorados para a decisão e preservados apenas para medição.
- **Persistência**: `modulos_base_conteudo.auditoria_ia` JSONB + `auditado_em` + `auditado_por_modelo` + `auditado_em_versao`. Gate da publicação: módulo só pode ir pra `publicado` se veredito é aprovado/aprovado_com_ressalvas E `auditado_em_versao = versao atual` (edição após auditoria invalida).

### 16.3 Refinador (autora consome feedback da auditora — fecha o loop Dual-IA)
> `ATIVO` desde 2026-05-28 · Loop manual disparado pelo autor humano (decisão B — controle do humano sobre quantas iterações).

- **Arquivo**: `lib/modulo-base-refino.ts` (`montarPromptRefinador`, `refinarModuloCore`); wrapper com guard em `actions/modulos-base.ts::refinarComFeedback`.
- **Modelo**: a **MESMA IA-autora** (16.1) — `getModelForTask(null, 'modulo_base_autor')`, default Claude Sonnet 4.6. Consistência de estilo entre versões.
- **Max tokens**: 64000 (mesmos do autor original).
- **System prompt**: reutiliza o `SYSTEM_AUTOR` (16.1).
- **User prompt** (`montarPromptRefinador`):
  - Contexto da competência canônica + descritor + transição N→N (com textos n_entrada e n_destino da régua).
  - JSON completo dos 4 blocos da versão atual (rejeitada/com ressalvas).
  - **Feedback estruturado da auditora**: problemas **ordenados por gravidade** (alta → média → baixa) + lista de recomendações.
  - Instruções de refinamento: corrigir ALTA (obrigatório); ajustar média/baixa (recomendado); **preservar o que não foi apontado** (não regerar do zero); manter consistência conceitual; respeitar mínimos do spec.
- **Pós-processamento**: persiste os 4 blocos refinados, **incrementa `versao`**, e dispara `auditarModuloBase` (16.2) automaticamente sobre a nova versão. Retorna nova auditoria pra UI.
- **Fluxo end-to-end**: humano clica "Refinar com IA" → autora regera com feedback → auditora avalia versão nova → veredito mostrado. Humano decide se publica, refina de novo, ou edita manualmente.

### 16.4 Segmentador de material longo em Módulos-Base
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/modulos-base/pipeline.ts::SEG_SYSTEM` + `segmentarEEstruturarExtracao`.
- **Modelo**: mesmo contexto da task `modulo_base_autor`. **Max tokens**: 32000 por trecho; timeout 180s, sem retry do wrapper.
- **Tarefa**: divide transcrição/material longo em seções temáticas, mapeia cada seção para uma competência canônica e emite blocos delimitados que alimentam o autor 16.1.
- **Regras**: preservar conteúdo-fonte, não misturar temas sem unidade, não inventar competência/descritor e escolher o catálogo controlado fornecido.

### 16.5 Detector de metadados de DOCX
> `AUXILIAR` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `actions/modulos-base.ts::detectarMetadadosDocx`.
- **Modelo**: task `modulo_base_autor`. **Max tokens**: 800.
- **Input**: primeiros 4.000 chars do DOCX + até 200 competências oficiais.
- **Output**: JSON com competência detectada/match/confiança, transição N1→N2/N2→N3/N3→N4, locale, título, finalidade e contexto pedagógico; usa `null` quando não há base.

### 16.6 Detector de metadados de vídeo/texto-base
> `AUXILIAR` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `actions/modulos-base.ts::detectarMetadadosDeTexto`.
- **Modelo**: task `modulo_base_autor`. **Max tokens**: 800.
- **Input**: título do vídeo + primeiros 5.000 chars do texto-base + catálogo de competências.
- **Output**: competência canônica, confiança, descritor granular, transição de nível, contexto pedagógico, título e finalidade. Confiança <0,4 força `null` para a competência.

---

## Development Blueprint

### 17.1 Gerador de Blueprint (PDI + trilha como fonte única)
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/blueprint/prompt.ts::BLUEPRINT_SYSTEM` + `buildBlueprintPrompt`; núcleo em `lib/blueprint/core.ts`; lote em `trigger/gerar-blueprint-batch.ts`.
- **Modelo default**: `claude-sonnet-4-6` (configurável). **Max tokens**: 64000.
- **Trigger**: geração individual/headless ou lote de colaboradores com 100% das competências foco mapeadas.
- **Tarefa**: gerar uma única estrutura JSON da qual derivam PDI e trilha, mantendo ligação nominal entre objetivo de 30 dias, semanas, missões, evidência esperada e critério de sucesso.
- **Regras centrais**: não inventar comportamento; ações ancoradas em artefatos/rotinas reais do cargo; evidência **contável** (quantificador explícito); carga compatível com nível; calendário parametrizado pelo programa da empresa; níveis finais sobrescritos pelos cálculos autoritativos em código.
- **Output**: `DevelopmentBlueprint` com colaborador, foco geral, competências, objetivos de 30 dias e `trilha.semanas[]`; validações duras rejeitam semana sem `conexao_com_pdi`.

### 17.2 Auditor semântico de Blueprint
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/blueprint/audit.ts::buildBlueprintAuditPrompt`; chamada em `lib/blueprint/core.ts::auditarBlueprintCore`.
- **Modelo default**: `claude-sonnet-4-6` salvo override. **Max tokens**: 4000.
- **Tarefa**: 2ª camada adversarial sobre seis checks semânticos: cobre o que promete, missão↔evidência, exigência↔nível, avaliação mede o prometido, conteúdo genérico e tom/saúde.
- **Output**: checks `pass|warn|fail` com ids fixos e evidência concreta. O servidor funde com checks estruturais determinísticos; denominador fixo impede auditoria parcial de inflar o score.

---

## Pulso de Desenvolvimento

> ⛔ **Bloco OFF-LINE desde 31/08/2026** (`lib/blocos-offline.ts`). Os dois
> prompts abaixo **não são chamados por ninguém**: os únicos call-sites eram
> `actions/pulse/classify.ts`, que hoje recusa na entrada. Ficam catalogados
> porque `lib/pulse/dual-ai.ts` está preservado — mas não entram em conta de
> custo, não precisam de eval e não devem ser tomados como referência de
> "prompt em produção" ao escrever um novo.

### 18.1 Classificador de texto aberto do Pulso
> `ATIVO` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/pulse/dual-ai.ts::CLASSIFY_SYSTEM`.
- **Modelo default**: `claude-sonnet-4-6`. **Max tokens**: 512.
- **Tarefa/output**: classifica resposta curta em no máximo 3 chaves da taxonomia fechada, sentimento, evidência curta sem PII e confiança `low|medium|high`. Não diagnostica burnout, doença ou assédio.

### 18.2 Auditor da classificação do Pulso
> `ATIVO` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/pulse/dual-ai.ts::AUDIT_SYSTEM`.
- **Modelo default**: `gpt-5.6-terra`, pinned pela task `pulse_audit`. **Max tokens**: 512.
- **Tarefa/output**: compara texto original e classificação, retorna concordância, divergências, confiança ajustada e nota curta. A confiança final é resolvida em código e o texto bruto não é persistido na classificação.

---

## Modo Cena (experimental)

> **Estado:** núcleo headless criado em 24/08/2026; ainda não existe rota, action ou tela de produção. O consumidor atual é o harness interno `scripts/_cena-fase0.ts`. Os seis prompts abaixo estão catalogados como `EXPERIMENTAL`, não `ATIVO`.

### 19.1 Derivação da persona do interlocutor
> `EXPERIMENTAL` · Prompt documentado como: `resumo_editorial` · **Novo em 24/08/2026**

- **Arquivo**: `lib/season-engine/cena/prompts.ts::promptPersona`; modelo `claude-opus-5`; max tokens 4000; effort médio.
- **Tarefa**: deriva do cenário quem está do outro lado, sua agenda legítima, o que nunca aceita, condição única observável para ceder, tom e primeira fala já em tensão.

### 19.2 Interlocutor em personagem (multi-turn)
> `EXPERIMENTAL` · Prompt documentado como: `resumo_editorial` · **Novo em 24/08/2026**

- **Arquivo**: `buildInterlocutorSystemEstavel` + appendix volátil `buildInstrucaoDoBeat`; execução em `lib/season-engine/cena/core.ts::turnoCena`.
- **Modelo**: `claude-opus-5`; max tokens 4000/turno; até 16 turnos; effort médio.
- **Tarefa**: sustenta personagem resistente, uma reação/pergunta por vez, sem ensinar nem revelar a avaliação. O próximo beat é escolhido em código e entra em `systemSuffix`; `[META]` informa movimento/cessão, mas não decide o encerramento.

### 19.3 Guarda de integridade da cena
> `EXPERIMENTAL` · Prompt documentado como: `literal` · **Novo em 24/08/2026**

- **Arquivo**: `promptGuarda` / `checarGuarda`.
- **Modelo**: `grok-4.6`; max tokens 1500; effort baixo.
- **Output**: `ok|quebra_de_papel|impropria|vazia`; protege contra prompt injection/cola sem confundir firmeza na dramatização com impropriedade.

### 19.4 Juiz independente de beat
> `EXPERIMENTAL` · Prompt documentado como: `literal` · **Novo em 24/08/2026**

- **Arquivo**: `promptJuizDeBeat` / `julgarBeat`.
- **Modelo**: `grok-4.6`; max tokens 1500; effort baixo.
- **Tarefa**: leitor sem agenda decide se um sinal específico apareceu na janela de 6 mensagens. O sinal pode estar repartido entre turnos e pode ser positivo ou negativo; retorna apenas `{cumprido, porque}`.

### 19.5 Extrator de evidências da cena
> `EXPERIMENTAL` · Prompt documentado como: `resumo_editorial` · **Novo em 24/08/2026**

- **Arquivo**: `promptExtracao` / `extrairCena`.
- **Modelo**: `claude-opus-5`; max tokens 10000; effort alto.
- **Tarefa**: por momento/turno/beat, classifica `demonstrou|tentou|falhou|sem_sinal`, força e citação literal. Não dá nota; `consolidarCena` faz a conta em código e preserva trajetórias como falhou→recuperou.

### 19.6 Triagem de adequação da competência ao formato Cena
> `EXPERIMENTAL` · Prompt documentado como: `literal` · **Novo em 24/08/2026**

- **Arquivo**: `promptTriagemAdequacao` / `triarAdequacaoCena`.
- **Modelo**: `claude-opus-5`; max tokens 6000; effort alto.
- **Tarefa/output**: julga descritor por descritor se o comportamento aparece numa conversa resistente (`sim|parcial|nao`) e retorna veredito `adequada|parcial|inadequada`, evitando forçar competências intrapessoais num conflito artificial.

---

## Diagnósticos, seleção e assistentes

### 20.1 Extrator estruturado de descrição de cargo
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/cargo-extracao/prompts.ts` + `extrator.ts`; caller em `actions/cargo-extracao.ts`.
- **Modelo**: `gemini-3.6-flash` (env `GEMINI_CARGO_MODEL`). **Max tokens**: 16384; structured output nativo; até 3 tentativas.
- **Tarefa**: PDF/texto → campos canônicos consumidos pela IA2. Só extrai o que o documento sustenta; cada valor leva confiança e trecho literal; lacunas geram perguntas dirigidas para revisão humana.

### 20.2 Brief visual da escola a partir do PPP
> `ATIVO` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/escola-brief.ts::resumirPPP`.
- **Modelo**: `gemini-3.6-flash`. **Max tokens**: 2000.
- **Tarefa/output**: reduz até 60k chars de PPP aos campos `etapas`, `rede`, `contexto`, `ambientes`, `identidade` e `tom` que guiam estética/narração de vídeo; ignora burocracia, metas e marco legal sem tradução visual.

### 20.3 Narrativa do DNA Organizacional
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/dna-organizacional/narrative.ts::gerarNarrativaDna`.
- **Modelo default**: `claude-sonnet-4-6`; max tokens 4096; temperatura 0,6.
- **Tarefa/output**: transforma agregado anônimo de competências em intro, 3 forças, leitura geral, padrões, 3 prioridades, 3 ações de 30 dias, referências por contagem/cargo e fecho. Nunca inventa números nem identifica pessoas.

### 20.4 Narrativas de adequação pessoa-cargo
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/adequacao-cargo/narrative.ts::gerarNarrativasAdequacao`.
- **Modelo default**: roteador global/configurado; max tokens 2500; chunks de até 12 pessoas.
- **Tarefa**: 2-3 frases por pessoa, estritamente ancoradas nos `DRIVERS` calculados. Respeita tipo/direção da régua (`floor|ceiling|target`) e severidade; não interpreta DISC bruto que não seja driver nem oferece desenvolvimento a requisito eliminatório bloqueado.

### 20.5 Perfil de vaga por competências
> ⛔ `OFF-LINE desde 31/08/2026` (`lib/blocos-offline.ts`) — bloco Seleção de
> pessoas. `gerarPerfilVaga` recusa na entrada; nunca chegou a rodar em
> produção (0 vagas com perfil ideal fechado).
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `actions/selecao.ts::gerarPerfilVaga`.
- **Modelo default**: `claude-sonnet-4-6`. **Max tokens**: 1200.
- **Tarefa/output**: escolhe 8-12 competências relevantes do catálogo fornecido para a vaga e devolve JSON de ids/nomes/justificativas; não pode criar competência fora da lista.

### 20.6 BETO — mentor geral do colaborador
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `app/actions/beto.ts::SYSTEM_PROMPT_BASE` + `chatWithBeto`.
- **Modelo**: `claude-sonnet-4-6`. **Max tokens**: 500. Multi-turn.
- **Tarefa**: mentor acolhedor com contexto autenticado do colaborador (perfil, cargo, empresa), respostas curtas e práticas; não substitui avaliação formal nem aconselhamento médico/psicológico.

### 20.7 Assistente comercial — preparação de reunião
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `actions/sales/ai-assistant.ts::prepararReuniao`; system compartilhado do assistente comercial.
- **Modelo default**: `claude-sonnet-4-6`. **Max tokens**: 2200.
- **Grounding**: oportunidade/conta + materiais aprovados de playbook, diagnóstico e objeções.
- **Output**: resumo de contexto, 4-6 perguntas diagnósticas, objeções prováveis/respostas e próximo passo.

### 20.8 Assistente comercial — fortalecer proposta
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `actions/sales/ai-assistant.ts::assistirProposta`; mesmo system de 20.7.
- **Max tokens**: 2200. **Grounding**: playbook, objeções e cases aprovados.
- **Output**: proposta de valor específica, escopo, pontos comerciais e objeções prováveis; proibido inventar números, cases ou promessas.

### 20.9 Assistente comercial — análise de objeção
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `actions/sales/ai-assistant.ts::analisarObjecao`; mesmo system de 20.7.
- **Max tokens**: 1600. **Grounding**: materiais aprovados de objeções/playbook.
- **Output**: 2-3 respostas consultivas, pergunta de retorno e dica de postura/timing.

---

## Radar Vertho

### 21.1 Narrativa pública de escola — Radar clássico
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/radar/ia-narrativa.ts::getNarrativaEscola`.
- **Modelos**: `claude-sonnet-4-6` → fallback `gpt-5.1`. **Max tokens**: 1400; temperatura 0,4; cache por hash/version.
- **Tarefa/output**: JSON com resumo, destaques, atenções e perguntas pedagógicas usando apenas dados estruturados (Saeb, Ideb, ENEM comparável, Censo, SARESP, PDDE), sempre distinguindo dado de hipótese.

### 21.2 Narrativa pública de município — Radar clássico
> `ATIVO` · Prompt documentado como: `reuso` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/radar/ia-narrativa.ts::getNarrativaMunicipio`; reusa o system de 21.1.
- **Inputs próprios**: ICA, escolas/redes, ENEM municipal, FUNDEB e PDDE. Mesmo modelo/teto/cache e mesmo schema de saída.

### 21.3 Glimpse de escola — Radar Bett 2026
> ⛔ `OFF-LINE desde 31/08/2026` (`lib/blocos-offline.ts`) · Prompt documentado como: `resumo_editorial`
>
> Os call-sites eram `app/radarbett/escola/[inep]` e `/municipio/[ibge]`, hoje em
> 404. `lib/radar/ia-narrativa-radarbett.ts` segue no repo, mas ninguém o chama —
> não confundir com 21.1/21.2, que são do Radar clássico e continuam ATIVOS.

- **Arquivo**: `lib/radar/ia-narrativa-radarbett.ts::getNarrativaRadarbettEscola`.
- **Modelos**: `claude-sonnet-4-6` → fallback `gpt-5.6-luna`. **Max tokens**: 600; temperatura 0,4; cache.
- **Output**: um parágrafo institucional de até 380 caracteres, com ano/fonte, comparação justa por INSE/microrregião e foco pedagógico/gestão, sem promoção nem alarmismo.

### 21.4 Glimpse de município — Radar Bett 2026
> ⛔ `OFF-LINE desde 31/08/2026` — ver 21.3.
> `ATIVO` · Prompt documentado como: `reuso` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/radar/ia-narrativa-radarbett.ts::getNarrativaRadarbettMunicipio`; reusa system/modelos de 21.3.
- **Inputs próprios**: ICA, Ideb agregado oficial, ENEM, FUNDEB, VAAR, receita prevista e PDDE; leitor-alvo é gestor da rede municipal.

### 21.5 Proposta pública em PDF do Radar
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/radar/proposta-pdf-data.ts::SYSTEM_PROPOSTA`.
- **Modelos**: `claude-sonnet-4-6` → fallback OpenAI configurado. **Max tokens**: 3500; temperatura 0,5; cache/versionamento.
- **Tarefa/output**: proposta técnico-pedagógica com resumo, leituras Saeb/Ideb/infra/recursos, 1-3 pontos críticos com gravidade+dado+fonte+impacto+competência Vertho, perguntas e próximos passos 30/60/90 dias. Nunca inventa dado para completar três pontos.

---

## Prompts multimodais e mídia

### 22.1 Extração densa de conteúdo de vídeo
> `ATIVO` · Prompt documentado como: `resumo_editorial` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/gemini-video.ts::buildSystem`; caller em `actions/extracao-video.ts`.
- **Modelo**: `gemini-3.6-flash`. **Max tokens**: 65536; até 3 tentativas.
- **Tarefa/output**: vídeo/áudio → JSON com título, resumo, `texto_base` markdown denso e proporcional à duração, pontos-chave e competência/descritor sugeridos. A regra central é **não resumir**: preservar definições, argumentos, exemplos, dados, passos, ressalvas e ordem do vídeo.

### 22.2 Transcrição/ tradução de áudio de vídeo longo
> `ATIVO` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `trigger/extracao-video.ts::transcreverBloco`.
- **Modelo**: `gemini-3.5-flash`. **Max tokens**: 8192 por bloco de até 15 min; até 20 blocos.
- **Tarefa**: transcrever fielmente, corrigindo só hesitações/ruído, sem resumir nem inventar; traduz para o locale de saída quando necessário. A transcrição concatenada alimenta 16.4.

### 22.3 Direção de voz — narração/devolutiva/vídeo
> `ATIVO` · Prompt documentado como: `appendix` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/gemini-tts.ts::generateNarrationAudio`; estilos específicos de vídeo em `trigger/gerar-video-modulo.ts`.
- **Modelo**: `gemini-3.1-flash-tts-preview` (AI Studio ou Vertex).
- **Prompt**: direção de voz + trecho da narração. Default: português do Brasil, voz acolhedora/segura/íntima, ritmo moderado e pausas reflexivas; vídeo sobrescreve por tipo de cena. Pausas após perguntas são inseridas deterministicamente, não por SSML.

### 22.4 Direção de voz — podcast single/multi-speaker
> `ATIVO` · Prompt documentado como: `appendix` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/gemini-tts.ts::generatePodcastAudio`.
- **Modelo**: mesmo de 22.3.
- **Prompt**: single-speaker feminino acolhedor ou diálogo `Mentor` masculino consultivo + `Campo` feminino prático, com turn-taking natural; vinhetas de marca são adicionadas depois por DSP, fora da IA.

### 22.5 Imagem editorial de capa
> `ATIVO` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/openai-image.ts::buildCoverPrompt` / `generateCoverImage`.
- **Modelo**: `gpt-image-2`; 1024×1536; qualidade medium.
- **Prompt**: metáfora visual específica ao tema, editorial premium em navy/cyan, cena à direita e 45% de espaço negativo à esquerda; sem texto, logos, pessoas ou clichês de estrada/xadrez.

### 22.6 Imagem editorial de seção
> `ATIVO` · Prompt documentado como: `literal` · **Ausente até 25/08/2026**

- **Arquivo**: `lib/openai-image.ts::buildSectionPrompt` / `generateSectionImage`.
- **Modelo**: `gpt-image-2`; 1536×1024; qualidade medium.
- **Prompt**: mesma identidade editorial, mas composição horizontal distribuída para banda interna; sem área vazia obrigatória e sem texto/logos/pessoas.

---

## Resumo Estatístico

**Total: 105 prompts/famílias.** A base anterior tinha 70; a auditoria de 25/08 encontrou **35 ausentes**: 27 ativos, 2 auxiliares e 6 experimentais (Modo Cena).

Por categoria (esta tabela é a fonte da contagem):

| Seção | Qtd | Detalhes |
|---|---|---|
| Fase 1 (IA1/IA2/IA3/regenera/check) | 5 | 1.1–1.5 |
| Fase 3 (IA4) | 2 | eval + reavaliação |
| Chat Fase 3 | 4 | entrevistadora + eval + audit + proxy |
| Check IA4 | 1 | auditor |
| Fase 5 | 10 | cenárioB ×2, reav, extração, fusão, plenária, rh manual, plenária formal, dossiê, check lote |
| Motor Temporadas | 13 | desafio, cenário, missão, socrático, analytic, missão feedback, extração (1 prompt, 2 modos), tira-dúvidas, qualitativa, extract qualitativa, acumulada, acumulada check, scorer sem14, check sem14 |
| Relatórios | 3 | individual, gestor, RH |
| PPP | 3 | educacional, corporativo, enriquecimento web |
| Dashboard Perfil | 3 | comportamental, insights, devolutiva em voz |
| FIT v2 | 1 | leitura executiva |
| Conteúdos/Tagging | 9 | video script, podcast, texto, case, tags, planner editorial PDF, expansão mínima PDF, roteiro vídeo Módulo-Base, camada de personalização DISC+PPP |
| **Kit Semanal** | **5** | núcleo/brief, desafio por DISC, appendix de enriquecimento, contexto municipal consolidado, paleta do site |
| Simuladores | 4 | respostas, colab temporada, compromisso, extração sim |
| Fase 4 | 1 | PDI legado |
| Outros | 5 | cenárioB legado, evolução granular, tutor evidência, regerar sem14, check sem14 com feedback |
| Módulos-Base | 6 | autor, auditor, refinador, segmentador, metadados DOCX, metadados vídeo |
| Development Blueprint | 2 | gerador + auditor semântico |
| ⛔ Pulso | 2 | classificador + auditor — **OFF-LINE 31/08/2026**, sem call-site |
| Modo Cena | 6 | persona, interlocutor, guarda, juiz de beat, extrator, triagem |
| Diagnósticos/seleção/assistentes | 9 | cargo, brief escola, DNA, adequação, ⛔vaga, BETO, comercial ×3 |
| Radar | 5 | escola/município clássico, ⛔escola/município Bett, proposta PDF |
| Multimodal/mídia | 6 | extração vídeo, transcrição, TTS ×2, imagem ×2 |
| **TOTAL** | **105** | **70 anteriores + 35 incorporados nesta revisão** |
| ⛔ *dos quais inativos* | *5* | *Pulso ×2, vaga, Bett ×2 — blocos off-line (31/08/2026). O total acima **não** foi reduzido: eles seguem catalogados, mas não rodam, não custam e não servem de modelo para prompt novo.* |

## Notas de Integração

### Prompts com Grounding RAG ativo
- **Tira-Dúvidas** (`app/api/temporada/tira-duvidas/route.ts`): `retrieveContext(empresaId, message, 5)` → top 5 chunks
- **Reflection/Socrático/Missão Feedback** (`app/api/temporada/reflection/route.ts`): query = competência + descritor + últimas 2 msgs colab, top 4 chunks
- **Relatório Gestor** (`actions/relatorios.ts::gerarRelatorioGestor`): query fixa "valores cultura organizacional políticas desenvolvimento pessoas", top 4 chunks
- **Relatório RH** (`actions/relatorios.ts::gerarRelatorioRH`): query fixa "valores cultura organizacional políticas treinamento desenvolvimento estrategia", top 5 chunks
- **Assistente comercial** (`actions/sales/ai-assistant.ts`): materiais aprovados em `sales_materials` (playbook, diagnóstico, objeções e cases), filtrados por segmento.

### Prompts com PII Masking (LGPD)
- **Avaliação Acumulada** (`lib/season-engine/avaliacao-acumulada-core.ts`): mascara nome, sanitiza evidências, desmascara output
- **Reflection Sem 13 qualitativa** (`app/api/temporada/evaluation/route.ts`): mascara histórico + insights anteriores
- **Evolution Scenario Score Sem 14** (`app/api/temporada/evaluation/route.ts`): mascara nome + resposta + evidências
- **Tira-Dúvidas** (`app/api/temporada/tira-duvidas/route.ts`): mascara histórico, desmascara output
- **Reflection semanal** (`app/api/temporada/reflection/route.ts`): mascara histórico + compromisso

### Prompts com Retry
- **IA1**: 1 retry se vierem competências válidas insuficientes.
- **IA2**: 1 retry se faltar `gabarito`/JSON válido.
- **IA3**: 1 retry com a lista de erros da validação estrutural.
- **IA4** (`lib/ia4-avaliacao.ts`): 1 retry se a primeira resposta não for JSON válido.
- **Módulo-Base autor/auditor**: até 2 tentativas; extrator de cargo e extração de vídeo: até 3.

### Prompts com Streaming (automático em `callAI` se `maxTokens > 8192`)
- IA4 (16000), relatórios Individual/Gestor/RH (64000), Blueprint (64000), autor/refinador de Módulo-Base (64000), segmentador de Módulo-Base (32000), roteiro de vídeo (16000), PPP educacional (16000), Cenário B legado (32768), Evolução Granular (32768) e extrator do Modo Cena (10000).

### Prompts que rodam em loop (processamento batch)
- IA1 (1/cargo), IA2 (1/cargo), IA3 (1/competência×cargo), IA4 e Check IA4 (1/resposta), Cenários B, Reavaliação, Evolução Fusão (1/colaborador×competência), relatórios individuais/gestor, Blueprint (1/colaborador), módulos de manuscrito (1/transição×descritor), simulação de temporada (1/turno×duração do programa), Modo Cena (guarda+juiz+interlocutor por turno) e conteúdos por descritor.

### Modelos não-default hardcoded
- **Chat audit Fase 3**: `gemini-3.1-flash-lite`.
- **Simulador temporada (colaborador fictício)**: `claude-haiku-4-5-20251001`.
- **Tira-Dúvidas**: `claude-sonnet-4-6` hardcoded na rota.
- **Modo Cena experimental**: `claude-opus-5` (papéis pesados) + `grok-4.6` (guarda/juiz).
- **Multimodal**: Gemini 3.6 Flash (extrações/brief), Gemini 3.5 Flash (transcrição longa), Gemini 3.1 Flash TTS Preview e GPT Image 2.
- **Pins por task**: Sonnet 5 nas quatro saídas longas; GPT 5.6 Terra nos auditores; Opus 5 no roteiro de vídeo. Consulte `lib/ai-tasks.ts`.

### Prompts não catalogados (intencionalmente)
- Schemas/appendices inline que apenas repetem contrato já catalogado e não fazem chamada própria
- Chamadas a embeddings Voyage/OpenAI (fora do escopo — não são chat/completion)
- Transcrição Whisper sem instrução textual própria e prompts descartáveis em `scripts/`/fixtures
- Prompts do roteador interno (`ai-client.ts` em si)

### Observações
- `lib/prompts/` contém quatro construtores de negócio: relatório comportamental, insights executivos, FIT e devolutiva em voz (9.1-9.3 e 10.1).
- Check Cenário B **não** é mais idêntico ao A: tem 8 dimensões próprias de complementaridade/triangulação.
- `actions/fase5/relatorios-envios.ts::checkCenarios` continua um check geral simplificado; produção individual usa os cores de IA3/Cenário B.
- `AI_TASKS` em `lib/ai-tasks.ts` é o catálogo da tela de configuração de modelos, **não** um inventário completo dos prompts. Há inclusive uma divergência de chave: a lista expõe `ia4_avaliar`, enquanto os call sites e `DEFAULT_TASK_MODELS` usam `ia4_avaliacao`; por isso esta revisão adotou as chamadas reais como fonte de verdade.
