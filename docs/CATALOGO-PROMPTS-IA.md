# Catálogo de Prompts da IA — Vertho Mentor IA

> Todas as chamadas `callAI` / `callAIChat` do projeto Vertho Mentor IA (Next.js), com system prompt, inputs e uso.
> Roteador universal: `actions/ai-client.ts` (`callAI` single-turn + `callAIChat` multi-turn). Roteia por prefixo do modelo: `gemini*` → Gemini, `gpt*|o1|o3|o4` → OpenAI, default → Claude (Anthropic SDK). Modelo default = `claude-sonnet-4-6`.
> Prompt caching automático: se `system` tem mais de 4000 chars → `cache_control: ephemeral` (economia 90% em chamadas subsequentes dentro de 5 min).
> Extended thinking: habilitado quando `options.thinking = true` (budget 32k-65k tokens).
> Streaming: automático quando `maxTokens > 8192`.
> Revisão: 2026-04-17

## Índice

1. [Fase 1 — Parametrização (IA1/IA2/IA3 + Check)](#fase-1--parametrização-ia1ia2ia3--check)
2. [Fase 3 — Avaliação IA4 (Mapeamento)](#fase-3--avaliação-ia4-mapeamento)
3. [Chat Fase 3 — Entrevista + Avaliação + Auditoria](#chat-fase-3--entrevista--avaliação--auditoria)
4. [Check IA4 (Auditor Gemini)](#check-ia4-auditor-gemini)
5. [Fase 5 — Cenário B + Reavaliação + Fusão + Plenária](#fase-5--cenário-b--reavaliação--fusão--plenária)
6. [Motor de Temporadas (14 semanas)](#motor-de-temporadas-14-semanas)
7. [Relatórios (Individual / Gestor / RH)](#relatórios-individual--gestor--rh)
8. [PPP / Dossiê Corporativo](#ppp--dossiê-corporativo)
9. [Perfil Comportamental (Dashboard)](#perfil-comportamental-dashboard)
10. [FIT v2 (Leitura Executiva)](#fit-v2-leitura-executiva)
11. [Conteúdos e Tagging](#conteúdos-e-tagging)
12. [Simuladores](#simuladores)
13. [Fase 4 (PDI legado)](#fase-4-pdi-legado)
14. [Outros (Cenário B legado, Evolução Granular, Tutor Evidência)](#outros-cenário-b-legado-evolução-granular-tutor-evidência)

---

## Fase 1 — Parametrização (IA1/IA2/IA3 + Check)

### 1.1 IA1 — Top 10 competências por cargo

- **Arquivo**: `actions/fase1.ts::rodarIA1` (build em `buildSystemPromptSelecao` + `buildUserPrompt`)
- **Modelo default**: Claude Sonnet 4.6 (configurável via `aiConfig.model`)
- **Max tokens**: 4096
- **Trigger**: Admin clica em "IA1 — Top 10" em `/admin/empresas/{id}` (Fase 1). Só chama IA se o cargo tem >10 competências (senão seleciona todas direto).
- **Grounding RAG**: Não. Usa contexto do PPP via `buscarContextoPPP` (extração salva em `ppp_escolas.extracao`).
- **Thinking**: Não.
- **Loop**: Sim — para cada cargo distinto com >10 competências.
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

- **Arquivo**: `actions/fase1.ts::rodarIA2`
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 6000
- **Trigger**: Admin clica em "IA2 — Gabarito CIS" em `/admin/empresas/{id}` (Fase 1). Exige IA1 rodada antes.
- **Grounding RAG**: Não. Usa contexto do PPP.
- **Loop**: Sim — 1 chamada por cargo.
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

- **Arquivo**: `actions/fase1.ts::rodarIA3Uma` (build em `buildIA3SystemPrompt` + `buildIA3UserPrompt`)
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 64000 (streaming)
- **Trigger**: Admin executa fila de cenários em `/admin/empresas/{id}` → `listarFilaIA3` → `rodarIA3Uma` por item. 1 competência × cargo por chamada (processamento unitário p/ caber em timeout Vercel Hobby).
- **Grounding RAG**: Não. Usa PPP.
- **Loop**: Sim — fila de competências Top 5 do cargo.
- **System prompt** (~2000 chars, resumo):
  ```text
  Você é um especialista com 20 anos em avaliação de competências em organizações brasileiras.
  TAREFA: Crie UM cenário situacional + 4 perguntas temáticas para a competência descrita.

  REGRAS DE CONSTRUÇÃO:
  1. ESTRUTURA: 250-400 palavras, 1 tensão + 1 complicador, máx 2 stakeholders, máx 900 chars contexto
  2. REALISMO: Vocabulário e siglas da organização, nomes brasileiros
  3. DECISÃO FORÇADA (REGRA DE OURO): Se pode responder sem abrir mão de nada → cenário NÃO funciona
     - P1: ESCOLHA — trade-off real
     - P2: COMO — execução com resistência
     - P3: TENSÃO HUMANA
     - P4: SUSTENTABILIDADE
  4. COBERTURA DE DESCRITORES: Cada pergunta 2-3 descritores. As 4 juntas cobrem TODOS.
  5. DILEMA ÉTICO EMBUTIDO: caminho fácil conflita com valor organizacional (emerge naturalmente)
  6. Perguntas ABERTAS, máx 200 chars cada

  Retorne APENAS JSON: {cenario:{titulo,contexto}, perguntas:[{numero,texto,descritores_primarios,o_que_diferencia_niveis}], dilema_etico:{valor_testado,caminho_facil,caminho_etico}}
  ```
- **Inputs no user prompt**:
  - Empresa (nome, segmento)
  - Cargo (nome, descrição, entregas, stakeholders, tensões)
  - Competência (cod_comp, nome, descrição)
  - Descritores com níveis N1-N4 (gap/em desenvolvimento/meta/referência)
  - Valores organizacionais + regra de dilema ético
  - Perfil CIS ideal do cargo (tela3 estilos + tela4 faixas DISC)
  - Contexto PPP (até 3000 chars)
- **Output esperado**: JSON `{ cenario, perguntas[], dilema_etico }`.
- **Consumido por**: `banco_cenarios` (alternativas[]). Usado por IA4 (Fase 3) para avaliar respostas.

### 1.4 IA3 — Regenerar cenário (com feedback)

- **Arquivo**: `actions/fase1.ts::regenerarCenario`
- **Idêntico a IA3** (mesmo system prompt `buildIA3SystemPrompt`), mas com appendix no user prompt:
  ```text
  FEEDBACK DA REVISÃO ANTERIOR (CORRIJA ESTES PONTOS): {cen.justificativa_check}\n{cen.sugestao_check}
  ```
- **Trigger**: Admin clica em "Regerar" em cenário com status_check='revisar'.
- **Max tokens**: 64000.
- **Consumido por**: Atualiza `banco_cenarios` (limpa campos de check).

### 1.5 Check Cenário (Auditor — Gemini)

- **Arquivo**: `actions/fase1.ts::checkCenarioUm`
- **Modelo default**: `gemini-3-flash-preview` (parâmetro `modelo`)
- **Max tokens**: 4096
- **Trigger**: Admin clica em "Check" em cenário individual OU lote. Usa IA diferente da que gerou (cross-validation).
- **System prompt** (inline):
  ```text
  Voce e um avaliador especialista em Assessment Comportamental.
  Avalie o cenario e as perguntas com base em 5 dimensoes (20pts cada, total 100):

  1. ADERENCIA A COMPETENCIA (20pts): avalia a competencia indicada? descritores cobertos?
  2. REALISMO CONTEXTUAL (20pts): cenarios criveis para cargo/empresa? usa vocabulario PPP?
  3. CONTENCAO (20pts): contexto max ~900 chars? max 2 tensoes? max 2 stakeholders? perguntas max ~200 chars?
  4. FORCA DE DECISAO (20pts): P1 escolha? P2 como com obstaculo? P3 tensao humana? P4 acompanhamento?
  5. PODER DISCRIMINANTE (20pts): resposta N2 diferente de N3? nao permite resposta vaga?

  ERROS GRAVES (forca nota max 60):
  - Pergunta fechada (sim/nao)
  - Cenario com 4+ tensoes simultaneas
  - Contexto com 5+ stakeholders nomeados
  - Pergunta que permite resposta generica sem escolha
  - Competencia avaliada nao e a indicada

  Nota >= 90 = aprovado. Nota < 90 = revisar com sugestao concreta.

  Retorne APENAS JSON: {"nota":85,"erro_grave":false,"dimensoes":{aderencia,realismo,contencao,decisao,discriminante},"justificativa":"...","sugestao":"...","alertas":[]}
  ```
- **Inputs no user prompt**:
  - Cargo, competência
  - Cenário (título, contexto)
  - Perguntas (P1-P4)
  - Descritores (D1-Dn com nome curto)
  - Contexto PPP resumido (500 chars)
- **Output esperado**: JSON `{ nota, erro_grave, dimensoes, justificativa, sugestao, alertas }`.
- **Consumido por**: Atualiza `banco_cenarios` com `nota_check`, `status_check`, `dimensoes_check`, `justificativa_check`, `sugestao_check`, `alertas_check`. Feedback volta pra regeneração.

---

## Fase 3 — Avaliação IA4 (Mapeamento)

### 2.1 IA4 — Motor de Avaliação de Competências (constante `IA4_SYSTEM`)

- **Arquivo**: `actions/fase3.ts::rodarIA4` (system prompt em `IA4_SYSTEM` no topo do arquivo)
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 64000 (streaming)
- **Trigger**: Admin executa "Rodar IA4" em `/admin/empresas/{id}`. Avalia TODAS as respostas de colaboradores pendentes (`avaliacao_ia IS NULL`).
- **Grounding RAG**: Não. Usa PPP extraction.
- **Loop**: Sim — 1 chamada por resposta (4 respostas por colab × cenários Top 5).
- **Retry**: Sim — 1 retry se a primeira resposta não for JSON válido (adiciona instrução ao user prompt).
- **System prompt** (>4000 chars, beneficia cache. Resumo):
  ```text
  Voce e o Motor de Avaliacao de Competencias da Vertho Mentor IA.
  Sua tarefa e avaliar as 4 respostas de um profissional a um cenario situacional,
  classificando-o nos 4 niveis de maturidade usando a regua fornecida, e gerar feedback personalizado.

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
  7. CONFIANCA 0-100 (<70 = evidência insuficiente)

  === TRAVA ANTI-REBAIXAMENTO ===
  N1 = postura excludente/passiva/ignora a competencia.
  Se demonstra ações concretas em qualquer descritor, nivel minimo é N2.

  === PROCESSO 2 ETAPAS ===
  ETAPA 1 (por R1-R4): identifica descritores cobertos, extrai evidencias textuais, compara com regua, atribui nota_decimal 1.00-4.00 (2 casas), confianca 0-100
  ETAPA 2 (consolidacao): media por descritor, nivel=floor(media), travas (critico N1 → max N2; 3+ N1 → N1), feedback positivo/construtivo

  === ANTI-ALUCINACAO ===
  PROIBIDO inventar nomes ou situações não mencionados.
  Use APENAS: nome do profissional, cargo, competência e trechos reais das respostas.

  CAMPOS OBRIGATORIOS: feedback (nunca vazio), pontos_fortes (≥1), gaps_prioritarios (todos <3)

  Retorne APENAS JSON: {profissional, cargo, competencia, avaliacao_por_resposta:{R1,R2,R3,R4}, consolidacao:{notas_por_descritor, media_descritores, nivel_geral, gap, confianca_geral, travas_aplicadas}, descritores_destaque:{pontos_fortes, gaps_prioritarios}, feedback}
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
- **Output esperado**: JSON grande conforme schema acima.
- **Consumido por**: `respostas` (avaliacao_ia JSONB, nivel_ia4, nota_ia4, pontos_fortes, pontos_atencao, feedback_ia4). Também popula `descriptor_assessments` (alimentando o motor de temporadas).

### 2.2 IA4 — Re-avaliação com feedback do check

- **Arquivo**: `actions/fase3.ts::reavaliarResposta`
- **System prompt**: Mesmo `IA4_SYSTEM` de 2.1.
- **Max tokens**: 64000.
- **Trigger**: Admin clica em "Reavaliar" em resposta com `status_ia4 = 'revisar'`.
- **Appendix no user prompt**:
  ```text
  === FEEDBACK DA AUDITORIA ANTERIOR (CORRIJA ESTES PONTOS) ===
  {check.justificativa}\n{check.revisao}
  ```
- **Consumido por**: Atualiza `respostas` limpando campos de check antigos.

---

## Chat Fase 3 — Entrevista + Avaliação + Auditoria

### 3.1 Entrevistadora Mentor IA (conversa fase 3)

- **Arquivo**: `app/api/chat/route.ts::buildSystemPrompt` (usado via `callAIChat`)
- **Modelo default**: `claude-sonnet-4-6` (configurável via `empresas.sys_config.ai.modelo_padrao`)
- **Max tokens**: 1024
- **Trigger**: Colaborador envia mensagem em tela de chat Fase 3 (POST `/api/chat`).
- **Multi-turn**: Sim — mantém histórico em `mensagens_chat`. Máx 10 turnos ou confiança >= 80 com ≥2 evidências.
- **Grounding RAG**: Não.
- **System prompt** (~3500 chars, resumo):
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

  ## 4 DIMENSOES (SEM ordem fixa): SITUACAO, ACAO, RACIOCINIO, AUTOSSENSIBILIDADE

  ## COMO APROFUNDAR
  Precisa de ≥2 evidencias EXPLICITAS para encerrar.
  - Evidencia explicita = acao concreta que ELE fez/faria (1a pessoa)

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
  {proximo_passo, razao, dimensao_explorada, dimensoes_cobertas, evidencias_coletadas:[{trecho,indicador,tipo}], confianca, aprofundamentos_feitos}
  [/META]
  ```
- **Inputs no user prompt (via messages array)**:
  - Histórico completo da conversa (role+content) + mensagem atual do colab
- **Output esperado**: Mensagem visível + bloco `[META]` JSON.
- **Consumido por**: `mensagens_chat` (com meta em metadata). Se encerrar → chama 3.2 (eval).

### 3.2 Avaliador IA4 do Chat (evalPrompt)

- **Arquivo**: `app/api/chat/route.ts::encerrarSessao` (evalPrompt inline)
- **Modelo default**: `claude-sonnet-4-6` (ou configurado em `sys_config.ai.modelo_padrao`)
- **Max tokens**: 32768
- **Trigger**: Ao encerrar sessão de chat Fase 3 (critério: confiança ≥80 + 2 evidências OU 10 turnos).
- **System prompt** (apenas `system` — user vazio, tudo no prompt único, ~3500 chars):
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

  ## NOTA DECIMAL: .00-.25 atende minimo / .26-.50 com lacunas / .51-.75 atende bem / .76-.99 quase proximo

  ## TRAVAS:
  1. Descritor critico N1 → nivel_geral MAXIMO N2
  2. 3+ descritores N1 → nivel_geral = N1
  3. Na duvida entre dois niveis → escolha INFERIOR

  ## FEEDBACK: cite comportamentos REAIS, 3-5 paragrafos, sem DISC/CIS/jargao, tom acolhedor

  Retorne APENAS bloco [EVAL]:
  [EVAL]
  {competencia, consolidacao:{nivel_geral, nota_decimal, gap, confianca_geral, travas_aplicadas}, descritores_destaque:{pontos_fortes, gaps_prioritarios}, evidencias[], feedback, recomendacoes_pdi[{descritor_foco, nivel_atual, nivel_meta, acao, por_que_importa, barreira_provavel}], nivel, nota_decimal, lacuna}
  [/EVAL]
  ```
- **Inputs**: Tudo embutido no prompt (user vazio): evidências, histórico, régua, competência.
- **Output esperado**: Bloco `[EVAL]` JSON.
- **Consumido por**: `sessoes_avaliacao.rascunho_avaliacao`. Versionado via `prompt_version_id`.

### 3.3 Auditor Gemini do Chat (auditPrompt)

- **Arquivo**: `app/api/chat/route.ts::encerrarSessao` (auditPrompt inline)
- **Modelo default**: `gemini-3-flash-preview`
- **Max tokens**: 65536
- **Trigger**: Após 3.2 (eval completa).
- **System prompt** (inline, em português):
  ```text
  Você é um auditor de qualidade de avaliações comportamentais.

  COMPETÊNCIA AVALIADA: {nome} | RÉGUA: {gabarito}
  RASCUNHO DA AVALIAÇÃO (feita por outro modelo de IA): {...}
  EVIDÊNCIAS ORIGINAIS: {...}

  Audite esta avaliação em 6 critérios e retorne APENAS um bloco [AUDIT]:
  [AUDIT]
  {status:"aprovado|corrigido|reprovado", criterios:{evidencias, nivel, nota, lacuna, alucinacoes, vies}, justificativa, avaliacao_corrigida}
  [/AUDIT]

  Se status="corrigido", preencha avaliacao_corrigida com a estrutura do rascunho mas ajustada.
  Se status="aprovado", avaliacao_corrigida deve ser null.
  ```
- **Output esperado**: Bloco `[AUDIT]` JSON.
- **Consumido por**: Se `status=corrigido` → usa `avaliacao_corrigida`, senão mantém rascunho. Persiste em `sessoes_avaliacao.validacao_audit` + `avaliacao_final`.

### 3.4 Chat Simulador (proxy genérico)

- **Arquivo**: `app/api/chat-simulador/route.ts`
- **Modelo default**: `claude-sonnet-4-6` (configurável via body)
- **Max tokens**: 4096
- **Trigger**: UI de playground/simulador admin chama POST com `{ system, messages, model }`.
- **System prompt**: Fornecido pelo cliente (default: `"Voce e um assistente util."`).
- **Inputs**: messages array (multi-turn) vindos do cliente.
- **Output esperado**: Texto livre.
- **Consumido por**: Response direto ao cliente (não persiste).

---

## Check IA4 (Auditor Gemini)

### 4.1 CHECK IA4 — Auditor de avaliações

- **Arquivo**: `actions/check-ia4.ts::checkAvaliacoes` + `checarUmaResposta` (constante `CHECK_SYSTEM`)
- **Modelo default**: `gemini-3-flash-preview` (configurável)
- **Max tokens**: 8192
- **Trigger**: Admin clica "Check IA4" em `/admin/empresas/{id}` → itera respostas com `status_ia4 IS NULL`.
- **Loop**: Sim — 1 chamada por resposta avaliada.
- **System prompt** (~2500 chars):
  ```text
  Voce e um auditor de qualidade de Assessment Comportamental.
  Verificar se a avaliacao gerada por uma IA e ACEITAVEL — nao perfeita.

  FILOSOFIA:
  - NAO esta refazendo a avaliacao. Esta verificando se e RAZOAVEL.
  - Diferencas de +-1 nivel em descritores individuais sao ACEITAVEIS.
  - Foco em ERROS GRAVES: nivel errado, feedback generico, matematica errada.
  - Nivel geral dentro de +-1 da regua → coerencia BOA.
  - Imperfeitas mas razoaveis → 85-95. Nota < 70 só pra erros objetivos.

  4 DIMENSOES (25pts cada = 100pts):
  1. EVIDENCIAS E NIVEIS (25pts)
     - Descritores tem evidencia textual? Nivel dentro de +-1 → 20-25pts
     - Penalize APENAS se: N3+ sem evidencia concreta, ou claramente N1 avaliada como N3+
  2. COERENCIA DA CONSOLIDACAO (25pts)
     - media→nivel_geral arredondado pra baixo? Travas aplicadas? GAP correto?
  3. FEEDBACK + ESPECIFICIDADE (25pts)
     - Feedback menciona algo especifico? ERRO GRAVE (max 60): feedback 100% generico
  4. DESENVOLVIMENTO (25pts)
     - Gaps acionaveis? NAO sugere recursos externos (livros/podcasts)? Se sim, -5pts

  Nota >= 90 = Aprovado | < 90 = Revisar
  ERRO GRAVE = nota maxima 60

  Retorne APENAS JSON: {nota, status, erro_grave, dimensoes:{evidencias_niveis, consolidacao, feedback_especificidade, desenvolvimento}, justificativa, revisao, alertas}
  ```
- **Inputs no user prompt**:
  - Colaborador (nome, cargo) + perfil DISC
  - Competência
  - Respostas R1-R4
  - Régua N1-N4 por descritor
  - Cenário + Perguntas
  - Avaliação a auditar (JSON inteiro da IA4)
- **Output esperado**: JSON de auditoria.
- **Consumido por**: `respostas.status_ia4` ('aprovado'|'revisar') + `respostas.payload_ia4` (JSON check).

---

## Fase 5 — Cenário B + Reavaliação + Fusão + Plenária

### 5.1 Gerar Cenário B (lote)

- **Arquivo**: `actions/fase5.ts::buildCenBPrompts` (usado em `gerarCenariosBLote` e `regenerarCenarioB`)
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 4096
- **Temperature**: 0.4 (fiel ao GAS)
- **Trigger**: Admin "Gerar Cenários B" → cria 1 cenário B por competência×cargo que tem cenário A.
- **Loop**: Sim — itera cenários A.
- **System prompt** (~800 chars):
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
  1. REALISMO CONTEXTUAL — elementos reais, nomes brasileiros, contexto específico
  2. ESTRUTURA DO DILEMA — situação concreta, tensão real, não extrema
  3. PODER DISCRIMINANTE — respostas em 4 níveis (N1-N4)
  4. DIVERSIDADE vs CENÁRIO A — situação-gatilho OBRIGATORIAMENTE diferente
  5. DILEMA ÉTICO EMBUTIDO — tensão ética sutil
  </REGRAS>

  Responda APENAS com JSON válido.
  ```
- **Inputs no user prompt**:
  - Competência (nome, descrição), cargo
  - Descritores (régua N1-N4)
  - Contexto PPP (valores)
  - Cenário A original (título, descrição) — "NÃO repetir"
  - Feedback extra (em regenerarCenarioB: `justificativa_check` + `sugestao_check`)
- **Output esperado**: JSON `{ titulo, descricao, p1, p2, p3, p4, faceta_avaliada, referencia_avaliacao:{nivel_1..4}, dilema_etico_embutido:{valor_testado, caminho_facil, caminho_etico} }`.
- **Consumido por**: `banco_cenarios` com `tipo_cenario = 'cenario_b'`.

### 5.2 Check Cenário B

- **Arquivo**: `actions/fase5.ts::CHECK_CEN_B_SYSTEM` (constante) + `runCheckOnCenB`
- **Modelo default**: `gemini-3-flash-preview`
- **Max tokens**: 4096
- **Temperature**: 0.4
- **System prompt**: Harmonizado com check cenário A (5 dimensões × 20pts). Idêntico ao 1.5 mas focado em cenário B.
- **Trigger**: Inline após geração lote (se `checkModel` informado), ou standalone `checkCenarioBUm` / `checkCenariosBLote`.
- **Output/Consumido**: Mesmos campos `nota_check`, `status_check`, etc em `banco_cenarios`.

### 5.3 Reavaliação conversacional (sessão 8 turnos)

- **Arquivo**: `actions/fase5.ts::buildReavSystemPrompt` + `processarReavaliacao`
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

- **Arquivo**: `actions/fase5.ts::extrairDadosReavaliacao`
- **Max tokens**: 4096
- **Temperature**: 0.4
- **System prompt** (inline, curto):
  ```text
  Analise a conversa de reavaliação e extraia dados qualitativos por descritor.
  Use os códigos de descritores fornecidos (D1, D2...).
  Responda APENAS com JSON válido.
  ```
- **Inputs no user prompt**:
  - Competência, colaborador (nome, cargo), nível baseline, perfil DISC
  - Descritores da competência (códigos + nomes)
  - Conversa completa formatada (COLAB: / MENTOR:)
- **Output esperado**: JSON `{ resumo_qualitativo, evidencias_por_descritor[{descritor, nome_descritor, evidencia_relatada, nivel_percebido, confianca, citacao_literal}], gaps_persistentes[], consciencia_do_gap, conexao_cis, recomendacao_ciclo2 }`.
- **Consumido por**: `reavaliacao_sessoes.extracao_qualitativa` (mantendo `_contexto_sessao`).

### 5.5 Evolução com Fusão de 3 Fontes

- **Arquivo**: `actions/fase5.ts::gerarEvolucaoFusao`
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 64000
- **Temperature**: 0.4
- **Trigger**: Admin "Gerar Evolução" — por colaborador×competência.
- **Loop**: Sim.
- **System prompt** (~1800 chars):
  ```text
  Você é o Mentor IA do programa Vertho. Sua tarefa é analisar a EVOLUÇÃO de um colaborador comparando avaliação inicial com reavaliação, usando até 3 fontes de dados.

  ## FONTES
  1. Cenário A — diagnóstico inicial (nível, nota, descritores, feedback IA)
  2. Cenário B — reavaliação situacional
  3. Conversa Semana 15 — reavaliação qualitativa (relatado)

  ## ANÁLISE POR DESCRITOR
  1. Delta numérico (B - A)
  2. Evidência DEMONSTRADA no cenário B
  3. Evidência RELATADA na conversa
  4. Cruze as 3 fontes → classificação

  ## CONVERGÊNCIA
  | EVOLUCAO_CONFIRMADA | Delta + evidência B + relato convergente |
  | EVOLUCAO_PARCIAL | Delta em 1-2 fontes OU evidência fraca |
  | SEM_EVOLUCAO | Sem delta + sem evidência + sem relato |
  | EVOLUCAO_INVISIVEL | Sem delta MAS evidência qualitativa forte |

  ## CONSCIÊNCIA DO GAP (alta/media/baixa)
  ## CONEXÃO CIS (DISC)
  ## TRILHA — EFETIVIDADE

  Responda APENAS com JSON válido.
  ```
- **Inputs no user prompt**:
  - Empresa, colaborador (nome, cargo, perfil DISC)
  - Competência + descritores
  - FONTE 1: Cenário A (nivel, avaliacao_ia JSON completo)
  - FONTE 2: Cenário B (nivel, avaliacao_ia)
  - FONTE 3: Extração Sem15 (sem `_contexto_sessao`)
  - Trilha: pct, semana, cursos concluídos
- **Output esperado**: JSON `{ resumo_executivo, evolucao_por_descritor[{descritor, nome, nivel_a, nivel_b, delta, evidencia_cenario_b, evidencia_conversa, citacao_colaborador, convergencia, conexao_cis, confianca}], ganhos_qualitativos, consciencia_do_gap, trilha_efetividade:{semanas_concluidas, cursos_concluidos, correlacao}, recomendacao_ciclo2:{descritores_foco, justificativa, formato_sugerido, conexao_cis}, feedback_colaborador }`.
- **Consumido por**: `relatorios` tipo='evolucao' (upsert).

### 5.6 Plenária de Evolução Institucional

- **Arquivo**: `actions/fase5.ts::gerarPlenariaEvolucao`
- **Max tokens**: 64000
- **Temperature**: 0.4
- **Trigger**: Admin "Gerar Plenária" — agrega todos os relatórios de evolução (anônimo).
- **System prompt** (~1200 chars):
  ```text
  Você é o Motor de Plenária de Evolução do programa Vertho Mentor IA.
  Analise dados AGREGADOS de evolução de um grupo após 14 semanas de capacitação.

  ## ESTRUTURA (6 seções):
  1. VISÃO GERAL DA EVOLUÇÃO — delta médio, % que avançou, descritores com mais evolução
  2. ANÁLISE POR CARGO
  3. ANÁLISE POR COMPETÊNCIA
  4. CONVERGÊNCIA DE EVIDÊNCIAS (confirmada/parcial/sem/invisível)
  5. GAPS PERSISTENTES — ALERTA INSTITUCIONAL
  6. RECOMENDAÇÕES PARA CICLO 2

  ## REGRAS:
  - Dados ANÔNIMOS — NUNCA cite nomes
  - Estatísticas e %, não casos individuais
  - Tom institucional, construtivo, orientado a ação
  - CELEBRE AVANÇOS ANTES de apontar gaps

  Responda APENAS com JSON válido.
  ```
- **Inputs no user prompt**: Delta médio, convergências %, por cargo, por competência, gaps persistentes top 10.
- **Output esperado**: JSON com as 6 seções.
- **Consumido por**: `relatorios` tipo='plenaria_evolucao'.

### 5.7 Relatório RH Manual (pós-ciclo)

- **Arquivo**: `actions/fase5.ts::gerarRelatorioRHManual`
- **Max tokens**: 8000
- **Temperature**: 0.4
- **System prompt** (curto):
  ```text
  Você é um consultor estratégico de RH. Gere relatório analítico pós-desenvolvimento. Responda APENAS com JSON válido.
  ```
- **Inputs**: Empresa, RH anterior, Evolução agregada.
- **Output**: JSON `{ resumo_executivo, roi_desenvolvimento, evolucao_organizacional, gaps_resolvidos, gaps_persistentes, recomendacoes_estrategicas, proximos_ciclos }`.
- **Consumido por**: `relatorios` tipo='rh_manual'.

### 5.8 Relatório Plenária (formal)

- **Arquivo**: `actions/fase5.ts::gerarRelatorioPlenaria`
- **Max tokens**: 4096
- **System prompt**: `"Transforme dados da plenária em relatório formal. Responda APENAS com JSON válido."`
- **Output**: JSON com pauta, resultados, deliberações, encaminhamentos.
- **Consumido por**: `relatorios` tipo='plenaria_relatorio'.

### 5.9 Dossiê do Gestor (executivo)

- **Arquivo**: `actions/fase5.ts::gerarDossieGestor`
- **Max tokens**: 8000
- **System prompt**: `"Compile em dossiê executivo. JSON válido."`
- **Output**: JSON `{ titulo, sumario_executivo, diagnostico_inicial, evolucao, roi, recomendacoes, conclusao }`.
- **Consumido por**: `relatorios` tipo='dossie_gestor'.

### 5.10 Check Cenários (lote geral)

- **Arquivo**: `actions/fase5.ts::checkCenarios`
- **Max tokens**: 64000
- **System prompt**: `"Verifique qualidade dos cenários. JSON válido."`
- **Inputs**: Até 20 cenários em lote (JSON.stringify).
- **Output**: JSON `{ total, aprovados, com_ressalvas, reprovados, detalhes[] }`.

---

## Motor de Temporadas (14 semanas)

### 6.1 Prompt Desafio Semanal (conteúdo)

- **Arquivo**: `lib/season-engine/prompts/challenge.ts::promptDesafio`
- **Callers**: `lib/season-engine/build-season.ts::montarSemanaConteudo`, `actions/temporadas.ts::regerarSemana`
- **Max tokens**: 300
- **Trigger**: Geração de temporada (semanas 1-12 de conteúdo, exceto 4/8/12) ou regenerar semana.
- **System prompt** (inline, com progressão por nível):
  ```text
  Você é um designer instrucional especializado em micro-ações práticas para desenvolvimento de competências em adultos. Cria desafios curtos, observáveis e que cabem na rotina semanal de um profissional.
  ```
- **Inputs no user prompt**:
  - Cargo, setor/contexto, competência, descritor, nível atual (1-4 com label)
  - Semana (1-12)
  - Progressão por nível (1-4): complexidade do desafio escala com o nível atual
  - Regras: 1 ação concreta, observável, 2-3 frases, sem "Esta semana..."
- **Output esperado**: JSON `{ desafio_texto, acao_observavel, criterio_de_execucao, por_que_cabe_na_semana }`.
- **Validação**: `parseDesafioResponse` — valida campos obrigatórios do JSON.
- **Consumido por**: `trilhas.temporada_plano[].conteudo.desafio_texto`.

### 6.2 Prompt Cenário (aplicação — sems 4/8/12)

- **Arquivo**: `lib/season-engine/prompts/scenario.ts::promptCenario`
- **Callers**: `lib/season-engine/build-season.ts::montarSemanaAplicacao`, `actions/temporadas.ts::regerarSemana`
- **Max tokens**: 800
- **System prompt** (com 3 níveis de complexidade):
  ```text
  Você é um designer de casos para desenvolvimento de competências executivas. Cria cenários situacionais realistas que forçam o profissional a fazer escolhas difíceis (não apenas "conversar com todos").
  ```
- **Inputs no user prompt**:
  - Cargo, setor, competência, descritores avaliados
  - Complexidade (simples|intermediario|completo) → 3 níveis com regras específicas por nível
  - Regras: teste do "conversaria com todos" falha, stakeholders nomeados, contexto ancorado, não dar resposta
- **Output esperado**: JSON `{ contexto, tensao_central, fator_complicador, stakeholders, tradeoff_testado, armadilha_resposta_generica, pergunta, complexidade_aplicada }`.
- **Validação**: `parseCenarioResponse` + `cenarioToMarkdown` (converte JSON → markdown para exibição).
- **Consumido por**: `trilhas.temporada_plano[].cenario.texto`.

### 6.3 Prompt Missão Prática (aplicação — modo prática)

- **Arquivo**: `lib/season-engine/prompts/missao.ts::promptMissao`
- **Callers**: `lib/season-engine/build-season.ts::montarSemanaAplicacao`, `actions/temporadas.ts::regerarSemana`
- **Max tokens**: 500
- **System prompt**:
  ```text
  Você é um designer de missões práticas de desenvolvimento. Sua missão integra descritores comportamentais em uma única tarefa que o profissional executa no trabalho real durante a semana — não em resposta escrita.
  ```
- **Inputs**: Cargo, setor, competência, 3 descritores a integrar.
- **Regras**: 1 tarefa concreta, observável, viável em 1 semana, integra 3 descritores.
- **Output esperado**: JSON `{ missao_texto, acao_principal, contexto_de_aplicacao, criterio_de_execucao, integracao_descritores, por_que_cabe_na_semana }`.
- **Validação**: `parseMissaoResponse` + `missaoToMarkdown` (converte JSON → markdown para exibição).
- **Consumido por**: `trilhas.temporada_plano[].missao.texto`.

### 6.4 Socrático — Conversa semanal (sems de conteúdo)

- **Arquivo**: `lib/season-engine/prompts/socratic.ts::promptSocratic`
- **Callers**: `app/api/temporada/reflection/route.ts` (send/init), `actions/simulador-temporada.ts::simularSocratico`
- **Max tokens**: 2000
- **Multi-turn**: Sim (`callAIChat`). Max 6 turnos IA.
- **Grounding RAG**: Sim — `groundingContext` passado via parâmetro (vem de `retrieveContext` no route).
- **Trigger**: Colab abre chat de reflexão semanal.
- **System prompt** (~3500 chars, dinâmico por turn 1-6, 10 princípios inegociáveis):
  ```text
  Você é um mentor de desenvolvimento de competências, com postura socrática (curiosa, não-diretiva, acolhedora). Sua força está em FAZER PERGUNTAS que levem {nome} a perceber coisas por conta própria.

  10 PRINCÍPIOS INEGOCIÁVEIS:
  1-5. Nunca julga, nunca aconselha, nunca usa jargão, sempre PT-BR, UMA pergunta por turno
  6-10. Anti-vago por turno, DISC como facilitador (não determina conteúdo), grounding disciplinado

  ANTI-VAGO POR TURNO: cada turno tem regra específica de rejeição de resposta vaga/teórica.

  DISC COMO FACILITADOR: perfil adapta TOM e GATILHOS, nunca conteúdo da conversa.

  GROUNDING DISCIPLINADO:
  - Só usa trecho RAG se conversa pedir
  - Cite fonte se usar
  - Nunca invente fato a partir do grounding
  - Sem grounding → não mencione

  CONTEXTO: {nome} ({cargo}), DISC: {perfil}, Competência: {competencia}, Descritor: {descritor}, Desafio: "{desafio}"
  {groundingContext}

  PROGRESSÃO 6 TURNOS:
  TURN 1 ABERTURA | TURN 2 CONTEXTO | TURN 3 MOTIVAÇÃO | TURN 4 INSIGHT | TURN 5 GENERALIZAÇÃO | TURN 6 FECHAMENTO (bullets ✅ Desafio | 📝 Insight | 🎯 Compromisso)
  ```
- **Inputs (messages)**: Histórico completo da conversa.
- **Output**: Mensagem IA no formato do turn atual.
- **Consumido por**: `temporada_semana_progresso.reflexao.transcript_completo`.

### 6.5 Analytic — Feedback sobre cenário escrito (modo cenário)

- **Arquivo**: `lib/season-engine/prompts/analytic.ts::promptAnalytic`
- **Caller**: `app/api/temporada/reflection/route.ts` (tipoConversa='analytic')
- **Max tokens**: 2000
- **Max turnos IA**: 10
- **Multi-turn**: Sim.
- **System prompt** (~2500 chars, dinâmico por turn 1-10, 8 princípios):
  ```text
  Você é um avaliador-mentor que dá feedback analítico construtivo sobre a resposta de {nome} a um cenário escrito.

  8 PRINCÍPIOS:
  1. Perguntas ABERTAS, UMA por turn. PROIBIDO falsas dicotomias, binárias, indutivas
  2. ANTI-ALUCINAÇÃO REFORÇADO: Só afirme o que está LITERALMENTE na resposta. Nunca pressuponha. Se precisa → pergunte
  3-8. Grounding disciplinado, DISC facilitador, anti-vago por turno, fechamento estruturado

  CONTEXTO: {nome} ({cargo}), {competencia}, Descritores: {d1, d2, d3}
  Cenário: {cenario}

  PROGRESSÃO 10 TURNOS:
  1 APARIÇÃO | 2 LACUNAS | 3 CRITÉRIO | 4 CONSEQUÊNCIA | 5 PROFUNDIDADE | 6 CONSISTÊNCIA | 7 INTEGRAÇÃO | 8-9 APROFUNDAMENTO | 10 FECHAMENTO (3 bullets por descritor)
  ```
- **Inputs (messages)**: Histórico.
- **Output**: Mensagem.
- **Consumido por**: `temporada_semana_progresso.feedback.transcript_completo`.

### 6.6 Missão Feedback — Feedback sobre relato de missão (modo prática)

- **Arquivo**: `lib/season-engine/prompts/missao-feedback.ts::promptMissaoFeedback`
- **Caller**: `app/api/temporada/reflection/route.ts` (tipoConversa='missao_feedback')
- **Max tokens**: 2000
- **Max turnos IA**: 10
- **Grounding RAG**: Sim (`groundingContext`).
- **System prompt** (~2500 chars, 8 princípios):
  ```text
  Você é um avaliador-mentor analisando a EVIDÊNCIA REAL do colaborador — ele executou uma missão prática na semana e está relatando.

  8 PRINCÍPIOS:
  1. ANTI-ALUCINAÇÃO: NUNCA afirme/pressuponha fatos que {nome} NÃO disse. Pergunte primeiro
  2. ANTI-RELATO-BONITO: relato genérico/bonito sem ação concreta → confronte com elegância
  3. GROUNDING DISCIPLINADO: cite fonte RAG se usar, nunca invente a partir do grounding
  4-8. UMA pergunta por turn, DISC facilitador, fechamento estruturado, sem jargão

  CONTEXTO: {nome} ({cargo}), {competencia}, Descritores: {d1, d2, d3}
  MISSÃO: {missao}
  COMPROMISSO assumido: "{compromisso}"
  {groundingContext}

  PROGRESSÃO 10 TURNOS:
  1 EXECUÇÃO | 2 CONTEXTO | 3 CRITÉRIO | 4 CONSEQUÊNCIA | 5 CONEXÃO DESCRITORES | 6-9 APROFUNDAMENTO | 10 SÍNTESE/FECHAMENTO
  ```
- **Consumido por**: `temporada_semana_progresso.feedback.transcript_completo`.

### 6.7 Extração estruturada pós-conversa (semanal)

- **Arquivo**: `app/api/temporada/reflection/route.ts::extrairDadosEstruturados`
- **Max tokens**: 2000 (socratic) / 3000 (analytic+missao)
- **System prompt**: `EXTRATOR_SYSTEM` constante com 5 princípios anti-alucinação.
- **System prompt socratic**:
  ```text
  EXTRATOR_SYSTEM (5 princípios) — extraia APENAS o que foi dito. Nunca infira além da conversa.
  ```
- **System prompt analytic/missao_feedback**:
  ```text
  EXTRATOR_SYSTEM (5 princípios) — extraia APENAS o que foi dito. Nunca infira além da conversa.
  ```
- **Inputs user prompt (socratic)**: Conversa formatada. Output: `{ sinais_extraidos: { exemplo_concreto, autopercepcao, compromisso_especifico }, limites_da_conversa, desafio_realizado, relato_resumo, insight_principal, compromisso_proxima, qualidade_reflexao }`.
- **Inputs user prompt (analytic/missao_feedback)**: Conversa + schema `{ avaliacao_por_descritor[{descritor, nota, observacao, forca_evidencia, trecho_sustentador, limite}], sintese_bloco, alertas_metodologicos }`.
- **Consumido por**: Merge em `reflexao` ou `feedback` do progresso.

### 6.8 Tira-Dúvidas (tutor reativo)

- **Arquivo**: `lib/season-engine/prompts/tira-duvidas.ts::promptTiraDuvidas`
- **Caller**: `app/api/temporada/tira-duvidas/route.ts`
- **Modelo**: `claude-haiku-4-5-20251001` (hardcoded — rápido+barato)
- **Max tokens**: 1500
- **Multi-turn**: Sim. Sem limite rígido de turnos (rate limit 10/dia).
- **Grounding RAG**: Sim — `retrieveContext` com query = última pergunta, top 5 chunks.
- **System prompt** (~3500 chars, 7 princípios + grounding disciplinado):
  ```text
  Você é o Tira-Dúvidas, tutor especializado em "{competencia}", com foco EXCLUSIVO no descritor da semana: "{descritor}".
  Ajudar {nome} ({cargo}) a compreender, praticar e aplicar esse descritor no trabalho.

  ## 1. ESCOPO ABSOLUTO NO DESCRITOR
  Só responde dentro do descritor "{descritor}" da competência "{competencia}".
  Dentro: definição, comportamentos, exemplos, erros comuns, microexercícios, feedback de situação real
  Fora: outros descritores/competências, políticas internas, jurídico/médico/psicológico, avaliação formal
  Se fora: 1) recusa educada 2) explica 3) redireciona

  ## 2-7. PRINCÍPIOS: base de conhecimento, objetivo (clareza > aplicação), estilo, formato (4-8 frases + 1 pergunta), segurança, feedback de situação, exercícios

  ## GROUNDING DISCIPLINADO (6 regras):
  1. Cite fonte se usar trecho RAG
  2. Nunca invente a partir do grounding
  3. Sem grounding → não mencione
  4. Nunca misture grounding com opinião
  5. Confiança máxima grounding = média
  6. Grounding genérico → descarte

  ## DISC: função separada blocoDisc() — gera bloco de personalização por perfil

  ## CONTEXTO: {conteudoResumo}
  {groundingContext}
  ```
- **Modelo**: `claude-haiku-4-5-20251001` (hardcoded — mantido).
- **Inputs (messages)**: Histórico completo.
- **Consumido por**: `temporada_semana_progresso.tira_duvidas.transcript_completo` + `ia_usage_log`.

### 6.9 Evolution Qualitative — Conversa sem 13 (fechamento temporada)

- **Arquivo**: `lib/season-engine/prompts/evolution-qualitative.ts::promptEvolutionQualitative` + `promptEvolutionQualitativeExtract`
- **Callers**: `app/api/temporada/evaluation/route.ts` (sem=13), `actions/simulador-temporada.ts::simularQualitativa`
- **Max tokens**: 4000 (conversa), 8000 (extração)
- **Max turnos IA**: 12
- **System prompt** (~4000 chars, dinâmico por turn 1-12, 10 princípios + anti-inflação):
  ```text
  Você é o mentor de encerramento da trilha da competência "{competencia}".

  Conversa final após 12 semanas. Consolidar aprendizagem, identificar evidências REAIS de evolução, verificar nível atual, sustentar desenvolvimento.

  10 PRINCÍPIOS:
  1-5. Nunca afirme sem evidência, nunca conclua domínio, nunca revele régua, nunca invente, perguntas abertas
  6. ANTI-INFLAÇÃO: "acho que melhorei" ≠ evidência. Confronte relato genérico
  7. ANTI-VAGO POR TURNO: cada turno tem regra específica de rejeição de resposta teórica, superficialmente positiva ou de autoestima inflada
  8-10. DISC facilitador, grounding disciplinado, fechamento estruturado

  ## CONTEXTO: {nome} ({cargo}), DISC: {perfil}, Competência + Descritores, Insights das sems 1-12

  TURNS 1-12 (mantidos):
  1 ABERTURA | 2 RETROSPECTIVA | 3-5 EVIDÊNCIA REAL | 6 MICROCASO | 7-8 FOLLOW-UPS | 9-10 INTEGRAÇÃO | 11 MAIOR AVANÇO | 12 SÍNTESE FINAL
  ```
- **Consumido por**: `temporada_semana_progresso.reflexao.transcript_completo` (sem 13).

#### 6.9.1 Extração qualitativa (após sem 13)

- **Arquivo**: `lib/season-engine/prompts/evolution-qualitative.ts::promptEvolutionQualitativeExtract`
- **7 princípios**: anti-alucinação, ancoragem literal, confiança calibrada, limites explícitos
- **System**: Extrator com princípios — retorna JSON estruturado com campos de confiança por descritor.
- **Output**: JSON `{ evolucao_percebida[{descritor, antes, depois, nivel_percebido, evidencia, confianca (0-1), citacoes_literais, limites_da_leitura}], insight_geral, maior_avanco, ponto_atencao, microcaso_justificativa, consciencia_do_gap, dificuldades_persistentes, ganhos_qualitativos, limites_gerais_da_conversa }`.
- **Validação**: `validateEvolutionExtract` — valida campos obrigatórios + ranges de confiança.
- **Consumido por**: Merge em `reflexao` da sem 13.

### 6.10 Avaliação Acumulada (IA1 fim sem 13)

- **Arquivo**: `lib/season-engine/prompts/acumulado.ts::promptAvaliacaoAcumulada`
- **Caller**: `actions/avaliacao-acumulada.ts::gerarAvaliacaoAcumulada` (disparado automaticamente fim sem 13)
- **Max tokens**: 8000
- **PII masking**: Sim — nome do colab vira alias, evidências passam pelo sanitizador.
- **System prompt** (~2000 chars, 7 princípios):
  ```text
  Você é um avaliador CRITERIOSO. Sua tarefa: ler as evidências acumuladas de 13 semanas de desenvolvimento de {nome} sobre "{competencia}" e atribuir NOTA POR DESCRITOR 1.0-4.0 ancorada EXCLUSIVAMENTE na RÉGUA.

  7 PRINCÍPIOS:
  1. CEGA PARA NOTA INICIAL — NÃO conhece nota prévia, APENAS evidências + régua
  2. Pontua o PADRÃO (múltiplas semanas), não momento único
  3. N3+ exige CONSISTÊNCIA (2-3 referências coerentes)
  4. N1 basta 1 semana clara — dúvida puxa pra baixo
  5. GRANULARIDADE 0.1 (ex: 1.8, 2.3, 2.7)
  6. Sem registro → "sem_evidencia" + nota null
  7. Justificativa com forca_do_padrao, trechos_sustentadores, limites_da_base

  Retorne APENAS JSON válido, sem markdown.
  ```
- **Inputs user**: Competência, nome colab, régua completa N1-N4 por descritor, evidências agregadas das 13 semanas.
- **Output**: JSON `{ avaliacao_acumulada[{descritor, nota_acumulada, nivel_rubrica, quantidade_referencias, tendencia, justificativa, forca_do_padrao, trechos_sustentadores, limites_da_base}], nota_media_acumulada, resumo_geral, descritores_mais_consistentes, descritores_mais_frageis }`.
- **Validação**: `validateAvaliacaoAcumulada` — valida campos + ranges.
- **Consumido por**: `temporada_semana_progresso.feedback.acumulado.primaria` (sem 13).

### 6.11 Avaliação Acumulada Check (IA2)

- **Arquivo**: `lib/season-engine/prompts/acumulado.ts::promptAvaliacaoAcumuladaCheck`
- **Max tokens**: 6000
- **System prompt** (~1500 chars, 6 critérios ponderados = 100pts):
  ```text
  Você é um auditor de qualidade de avaliação acumulada. Verifica se pontuação da outra IA ao "padrão da temporada" é DEFENSÁVEL.

  FILOSOFIA: NÃO refaça. Verifique se é RAZOÁVEL.

  6 CRITÉRIOS PONDERADOS (total 100pts):
  1. ANCORAGEM NA RÉGUA
  2. CONSISTÊNCIA DO PADRÃO
  3. QUALIDADE DA JUSTIFICATIVA
  4. TRATAMENTO SEM EVIDÊNCIA
  5. COERÊNCIA INTERNA
  6. LIMITES RECONHECIDOS

  3-STATUS: aprovado | aprovado_com_ajustes | revisar
  FLAG erro_grave: se detectado, nota máxima 60.
  ```
- **Output**: JSON `{ nota_auditoria, status:"aprovado|aprovado_com_ajustes|revisar", erro_grave:bool, ajustes_sugeridos[{descritor, nota_acumulada_sugerida, motivo}], alertas[], resumo_auditoria }`.
- **Validação**: `validateAvaliacaoAcumuladaCheck`.
- **Consumido por**: `feedback.acumulado.auditoria`.

### 6.12 Evolution Scenario Score (sem 14 — scorer final)

- **Arquivo**: `lib/season-engine/prompts/evolution-scenario.ts::promptEvolutionScenarioScore`
- **Caller**: `app/api/temporada/evaluation/route.ts` (sem=14), `app/admin/vertho/auditoria-sem14/actions.ts::regerarScoringComFeedback`
- **Max tokens**: 10000
- **PII masking**: Sim (nome do colab, resposta, evidências).
- **System prompt** (~3000 chars, 9 princípios):
  ```text
  Você é um avaliador rigoroso e CRITERIOSO. A avaliação da semana 14 é o PONTO DE CHEGADA — você NUNCA pontua só pela resposta ao cenário. Pontua pela TRIANGULAÇÃO.

  9 PRINCÍPIOS:
  1. Ancore EXCLUSIVAMENTE na RÉGUA
  2. GRANULARIDADE 0.1
  3. Regressão possível — não force evolução
  4. Nomeie delta
  5-9. Anti-alucinação, grounding, limites, trecho literal obrigatório, DISC no tom

  4 ESTADOS DE PONDERAÇÃO cenário×acumulado:
  1. CONSISTENTE (≤0.5 diff): nota_pos = nível consolidado
  2. DIVERGENTE CENÁRIO SUPERIOR: puxa pra perto do acumulado
  3. DIVERGENTE CENÁRIO INFERIOR: puxa pra perto do acumulado
  4. SEM EVIDÊNCIA ACUMULADA: usa só cenário + régua

  REGRAS DURAS (mantidas):
  - 4.0 só se acumulado E cenário. Acumulado N1-2 → nota_pos ≤ 2.5. Acumulado N3 consistente → nota_pos ≥ 2.5

  resumo_avaliacao SEMPRE objeto: { mensagem_geral, evidencias_citadas, principal_avanco, principal_ponto_de_atencao }

  DEVOLUTIVA: Tom DISC: {tom específico D/I/S/C}
  - Cite 1+ evidência das 13 sems além do cenário
  - Conteúdo NÃO muda por perfil — só a forma
  ```
- **Inputs user**: Competência, cenário, resposta do colab, régua com nota_atual por descritor, avaliação acumulada primária (se houver), evidências das 13 semanas.
- **Output**: JSON `{ avaliacao_por_descritor[{descritor, nota_pre, nota_cenario, nota_pos, delta, classificacao, nivel_rubrica, consistencia_com_acumulado, justificativa, trecho_cenario, evidencia_acumulada, limites_da_leitura}], nota_media_pre, nota_media_cenario, nota_media_pos, delta_medio, resumo_avaliacao:{mensagem_geral, evidencias_citadas, principal_avanco, principal_ponto_de_atencao} }`.
- **Validação**: `validateEvolutionScenarioScore` — valida campos + resumo_avaliacao como objeto.
- **Consumido por**: `temporada_semana_progresso.feedback` (sem 14) + Evolution Report.

### 6.13 Evolution Scenario Check (audit sem 14)

- **Arquivo**: `lib/season-engine/prompts/evolution-scenario-check.ts::promptEvolutionScenarioCheck`
- **Max tokens**: 8000
- **System prompt** (~2000 chars, 8 princípios):
  ```text
  Você é um auditor de qualidade de avaliação de competências. Verifica se avaliação primária é RAZOÁVEL — não perfeita.

  8 PRINCÍPIOS: foco em erros graves, ±0.5 aceitável, triangulação obrigatória

  6 CRITÉRIOS PONDERADOS (total 100pts):
  1. ANCORAGEM NA RÉGUA
  2. COERÊNCIA DO DELTA
  3. JUSTIFICATIVA
  4. TRIANGULAÇÃO COM ACUMULADO
  5. QUALIDADE DO RESUMO
  6. LIMITES RECONHECIDOS

  3-STATUS: aprovado | aprovado_com_ajustes | revisar
  FLAG erro_grave: se detectado, nota máxima 60.
  ```
- **Output**: JSON `{ nota_auditoria, status:"aprovado|aprovado_com_ajustes|revisar", erro_grave:bool, ajustes_sugeridos[{descritor, nota_pos_sugerida, motivo}], alertas[], resumo_auditoria, ponto_mais_confiavel, ponto_mais_fragil }`.
- **Validação**: `validateEvolutionScenarioCheck`.
- **Consumido por**: `feedback.auditoria`.

---

## Relatórios (Individual / Gestor / RH)

### 7.1 Relatório Individual — PDI (RELATORIO_IND_SYSTEM)

- **Arquivo**: `actions/relatorios.ts::gerarRelatorioIndividual` (constante `RELATORIO_IND_SYSTEM`)
- **Modelo default**: Claude Sonnet 4.6
- **Max tokens**: 64000 (streaming)
- **Trigger**: Admin gera relatórios individuais (único ou lote).
- **Grounding RAG**: Não direto.
- **System prompt** (~2000 chars):
  ```text
  Voce e um especialista em desenvolvimento de profissionais da plataforma Vertho.
  Gere um PDI (Plano de Desenvolvimento Individual) completo, entregue ao COLABORADOR como devolutiva pessoal + plano de acao.

  DIRETRIZES DE TOM:
  1. SANDWICH: Acolher antes de diagnosticar
  2. LINGUAGEM ACESSIVEL, tom humano, sem jargao excessivo
  3. TOM COACH: firme mas nunca punitivo ("tende a...", "um risco e...")
  4. RECONHECER CONTEXTO antes de apontar gaps
  5. SCRIPTS PRONTOS em cada recomendacao
  6. METAS EM PRIMEIRA PESSOA com horizonte
  7. NAO mencione scores DISC numericos
  8. Niveis SEMPRE NUMERICOS (1-4). Nivel 3 = META
  9. SEMPRE inclua TODAS competencias do input (mesmo 'pendente' com flag=true)
  10. Competencias com gap (nivel<3): plano de 30 dias detalhado
  11. Se CURSOS RECOMENDADOS: INCLUA-OS no plano e estudo recomendado

  FORMATO JSON: {acolhimento, resumo_geral:{leitura, principais_forcas, principal_ponto_de_atencao}, perfil_comportamental:{descricao, pontos_forca, pontos_atencao}, resumo_desempenho[], competencias[{nome, nivel, nota_decimal, flag, descritores_desenvolvimento, fez_bem, melhorar, feedback, plano_30_dias:{foco, acoes}, dicas_desenvolvimento, estudo_recomendado:[{titulo, formato, por_que_ajuda, url}], checklist_tatico}], alertas_metodologicos, mensagem_final}
  ```
- **Inputs no user prompt**:
  - Colaborador (nome, cargo)
  - Empresa (nome, segmento)
  - Perfil CIS formatado (DISC, dominante, liderança)
  - Atenção: N competências esperadas, M pendentes (flag=true)
  - Dados por competência: {competencia, nivel, nota_decimal, pontos_fortes, gaps, feedback}
  - Conteúdos recomendados (trilha): nome, competência, formato, nível, URL
- **Output**: JSON PDI completo.
- **Consumido por**: `relatorios` tipo='individual' + renderização PDF via `RelatorioIndividual.tsx` em `/storage/relatorios-pdf/{empresa}/individual-*.pdf`.

### 7.2 Relatório Gestor (RELATORIO_GESTOR_SYSTEM)

- **Arquivo**: `actions/relatorios.ts::gerarRelatorioGestor`
- **Max tokens**: 64000
- **Grounding RAG**: **Sim** — `retrieveContext(empresaId, 'valores cultura organizacional políticas desenvolvimento pessoas', 4)`.
- **Trigger**: Admin gera relatórios por gestor (agrupa por `gestor_email`).
- **Loop**: Sim — 1 chamada por gestor.
- **System prompt** (~1200 chars):
  ```text
  Voce e um especialista em desenvolvimento de equipes da plataforma Vertho.
  Gere um RELATORIO DO GESTOR consolidado.
  Tom: profissional, estrategico, acionavel.

  REGRAS:
  - Niveis NUMERICOS (1-4). Nunca "Gap", "Em Desenvolvimento"
  - DISC como hipotese ("pode indicar", "tende a favorecer")
  - Maximo 3 acoes por horizonte (gestor vive no caos)
  - Conecte TUDO ao impacto nos resultados
  - NUNCA sugira quadros publicos de acompanhamento individual
  - Celebre evolucao com forca

  FORMATO JSON: {resumo_executivo:{leitura_geral, principal_avanco, principal_ponto_de_atencao}, destaques_evolucao, ranking_atencao[{nome, competencia, nivel, urgencia, motivo, risco_se_nao_agir}], analise_por_competencia[{competencia, media_nivel, distribuicao, padrao_observado, acao_gestor, impacto_se_nao_agir}], perfil_disc_equipe:{descricao, forca_coletiva, risco_coletivo}, acoes:{esta_semana, proximas_semanas, medio_prazo}, mensagem_final}
  ```
- **Inputs user**: Empresa, gestor (nome, email), total equipe, DISC distribuição, grounding block (valores/cultura da empresa), dados detalhados da equipe.
- **Consumido por**: `relatorios` tipo='gestor' + PDF.

### 7.3 Relatório RH (RELATORIO_RH_SYSTEM)

- **Arquivo**: `actions/relatorios.ts::gerarRelatorioRH`
- **Max tokens**: 64000
- **Grounding RAG**: **Sim** — `retrieveContext(empresaId, 'valores cultura organizacional políticas treinamento desenvolvimento estrategia', 5)`.
- **System prompt** (~2000 chars):
  ```text
  Voce e um especialista em desenvolvimento organizacional da plataforma Vertho.
  Gere um RELATORIO CONSOLIDADO DE RH.
  Tom: analitico, estrategico, orientado a decisoes de investimento em pessoas.

  REGRAS:
  - Niveis NUMERICOS (1-4)
  - DISC como hipotese
  - Conecte TUDO ao impacto nos resultados
  - Treinamentos ESPECIFICOS com carga horaria e custo relativo
  - Maximo 3 acoes por horizonte
  - Para cada treinamento: prioridade se orcamento curto
  - Risco identificado → acao concreta (retencao, plano B)
  - Para CADA cargo: 1 competencia foco priorizada (mais alavancadora) com justificativa quanti+quali

  FORMATO JSON: {resumo_executivo:{leitura_geral, principal_avanco, principal_ponto_de_atencao}, indicadores:{total_avaliados, media_geral, pct_nivel_1..4}, visao_por_cargo[], competencias_criticas[], competencia_foco_por_cargo[{cargo, competencia_recomendada, justificativa, expectativa_impacto, horizonte_sugerido}], treinamentos_sugeridos[{titulo, custo, prioridade, entra_se_orcamento_curto}], perfil_disc_organizacional:{descricao, forca_coletiva, risco_coletivo}, decisoes_chave[], plano_acao:[arrays], mensagem_final}
  ```
- **Inputs user**: Empresa, indicadores gerais, DISC organizacional, grounding block, por cargo, registros individuais.
- **Consumido por**: `relatorios` tipo='rh' + PDF.

---

## PPP / Dossiê Corporativo

### 8.1 Extração PPP Educacional

- **Arquivo**: `actions/ppp.ts::buildPromptEducacional` (chamado por `extrairPPP`)
- **Modelo default**: Configurável (default `claude-sonnet-4-6`)
- **Max tokens**: 16000
- **Trigger**: Admin sobe PPP educacional (URLs/textos) em `/admin/empresas/{id}/ppp`.
- **System prompt** (~1200 chars, 9 princípios):
  ```text
  Voce e um especialista em analise de documentos educacionais e institucionais brasileiros.
  Sua tarefa e extrair de um PPP ou documento institucional as informacoes necessarias para contextualizar cenarios de avaliacao de competencias.

  9 PRINCÍPIOS:
  1. Extraia APENAS o que esta explicito ou claramente implicito
  2. Nao invente. Se nao existir → "Nao declarado no documento"
  3. REGRA DE CONCISAO: Max 5 frases curtas por secao. Listas max 8 itens
  4-9. Anti-alucinação, ancoragem literal, confiança, limites, completude, _metadata_extracao opcional

  OBRIGATORIO entregar da secao 1 ate 10 completas.

  Responda APENAS com JSON valido.
  ```
- **Inputs user**: Instituição, documento (até 60000 chars), schema JSON com 10 seções: perfil_instituicao, comunidade_contexto, identidade, praticas_descritas, inclusao_diversidade, gestao_participacao, infraestrutura_recursos, desafios_metas, vocabulario, competencias_priorizadas, valores_institucionais. Campo `_metadata_extracao` opcional.
- **Consumido por**: `ppp_escolas.extracao` (usado por IA1/IA2/IA3 Fase 1).

### 8.2 Extração PPP Corporativo (Dossiê)

- **Arquivo**: `actions/ppp.ts::buildPromptCorporativo`
- **Max tokens**: 16000
- **System prompt** (~2000 chars):
  ```text
  Voce e um especialista em extracao de contexto corporativo para geracao de cenarios.

  MISSAO: Extrair Dossie de Contexto Operacional.

  REGRAS DE SEGURANCA:
  1. NUNCA trate hipotese como fato
  2. NUNCA preencha processos internos sem evidencia
  3. NUNCA assuma cultura real a partir do site (imagem publica ≠ realidade)
  4. NUNCA invente tensoes
  5. Separe "contexto publico" de "dinamica operacional real"
  6. Job postings como PISTA, nao verdade

  7 PRINCÍPIOS: nunca hipótese como fato, nunca processos sem evidência, nunca cultura real do site, nunca invente tensões, separe público de operacional, job postings como pista, confiança calibrada.

  CLASSIFICACAO DE CONFIANCA: alta (documento interno) | media (implicito) | baixa (site/release)
  CLASSIFICACAO DE ORIGEM: documento_interno | site_institucional | release_noticia | nao_identificado

  Cada secao: conteudo + origem + confianca.
  Se sem info: conteudo=null, confianca="baixa".
  competencias_priorizadas e valores_institucionais com origem/confiança nested por item.
  ```
- **Inputs user**: Empresa, material (até 60000 chars), schema com 16+ seções (perfil_organizacional, mercado_stakeholders, identidade_cultura, operacao_processos, modelo_pessoas, governanca_decisao, tecnologia_recursos, desafios_estrategia, vocabulario_corporativo, tensoes_dilemas, cadencia_rituais, stakeholders_por_area, casos_recentes, perfil_forca_trabalho, reconhecimento_punicao, comunicacao_interna, maturidade_cultural, competencias_priorizadas, valores_institucionais, _metadata).
- **Consumido por**: Mesmo `ppp_escolas.extracao`.

### 8.3 Enriquecimento via Web

- **Arquivo**: `actions/ppp.ts::enriquecerViaWeb`
- **Max tokens**: 8000
- **Trigger**: Opcional (`enriquecerWeb = true`) após 8.2. Busca no Google + site institucional e preenche lacunas.
- **System prompt** (8 princípios):
  ```text
  Voce e um especialista em enriquecimento de contexto corporativo.
  Recebera Dossie + info publica da web.

  MISSAO: Preencher APENAS lacunas indicadas.

  8 PRINCÍPIOS:
  1. NAO altere info ja extraida do material interno — ela tem prioridade
  2. NAO invente processos internos nem cultura real
  3. Tudo da web → origem "site_institucional"|"release_noticia"
  4. Confianca MAX para web = "media". Nunca "alta"
  5. Web generica ou duvidosa → NAO inclua. Melhor lacuna que dado ruim
  6. Inferencia → hipotese_controlada
  7. Output estruturado com justificativa por seção
  8. Seções mantidas com lacuna explicitamente listadas

  Responda APENAS com JSON.
  ```
- **Inputs user**: Dossiê atual, lacunas a preencher, fontes web scrappadas.
- **Output**: JSON `{ secoes_enriquecidas[{secao, conteudo, origem, confianca, justificativa}], secoes_mantidas_com_lacuna[{secao, motivo}] }`.
- **Consumido por**: Merge seções no dossiê final.

---

## Perfil Comportamental (Dashboard)

### 9.1 Relatório Comportamental (Textos narrativos)

- **Arquivo**: `app/dashboard/perfil-comportamental/relatorio/relatorio-actions.ts::gerarTextosLLM` (prompt em `lib/prompts/behavioral-report-prompt.js`)
- **Modelo**: Via `getModelForTask(empresaId, 'relatorio_comportamental')`
- **Max tokens**: 4096
- **Trigger**: Colaborador abre `/dashboard/perfil-comportamental/relatorio` (ou regenerar). Cache 30 dias.
- **System prompt** (10 princípios):
  ```text
  Você é um analista comportamental sênior. Responda APENAS com JSON válido, sem markdown nem comentários.

  10 princípios: ancoragem nos dados, anti-absoluto, linguagem acessível, tom profissional, campos extras obrigatórios.
  ```
- **Inputs user**: Output de `buildBehavioralReportPrompt(raw)` — dados DISC (natural + adaptado), liderança, 16 competências. (Prompt construtor em `lib/prompts/behavioral-report-prompt.js`.)
- **Output**: JSON com textos narrativos para PDF comportamental. Campos extras: `relacoes_e_comunicacao`, `modo_de_trabalho`, `frases_chave`. Campos existentes mantidos.
- **Consumido por**: `colaboradores.report_texts` + renderização PDF (`RelatorioComportamental.tsx`) em `relatorios-pdf`.

### 9.2 Insights Executivos

- **Arquivo**: `app/dashboard/perfil-comportamental/perfil-comportamental-actions.ts::gerarInsightsExecutivos` (prompt em `lib/prompts/insights-executivos-prompt.js`)
- **Modelo**: Via `getModelForTask(empresaId, 'insights_executivos')`
- **Max tokens**: 800
- **System prompt** (7 princípios):
  ```text
  Você é um consultor sênior de desenvolvimento humano. Responda APENAS com JSON válido no formato { "insights": ["...", "...", "..."] }, sem markdown nem comentários.

  7 princípios: ancoragem nos dados, anti-genérico, linguagem executiva.
  Estrutura obrigatória: insight 1 = força, insight 2 = risco, insight 3 = oportunidade.
  ```
- **Inputs user**: Output de `buildInsightsExecutivosPrompt({ colab, arquetipo, tags })`.
- **Output**: JSON com 3 insights narrativos curtos (força/risco/oportunidade).
- **Consumido por**: `colaboradores.insights_executivos` (cache 30 dias).

---

## FIT v2 (Leitura Executiva)

### 10.1 Leitura Executiva do Fit

- **Arquivo**: `actions/fit-v2.ts::gerarLeituraExecutivaFit` (prompt em `lib/prompts/fit-executive-prompt.js`)
- **Modelo default**: Claude Sonnet 4.6 (default do callAI)
- **Max tokens**: 800
- **Trigger**: Admin clica em drill-down de fit em `/admin/fit`. Cache 30 dias.
- **System prompt** (7 princípios):
  ```text
  Você é um consultor sênior de desenvolvimento humano. Responda apenas com o texto final, sem markdown nem aspas.

  7 princípios: interação pessoa×cargo (não perfil isolado), anti-absoluto ("tende a", "pode indicar"), ancoragem nos dados, linguagem executiva.
  ```
- **Inputs user**: Output de `buildFitExecutivePrompt({ resultado, cargoNome })` — resultado completo do cálculo de fit.
- **Output**: Texto livre (leitura executiva com foco na interação pessoa×cargo).
- **Consumido por**: `fit_resultados.leitura_executiva_ai` + `leitura_executiva_ai_at`.

---

## Conteúdos e Tagging

### 11.1 Video Script

- **Arquivo**: `lib/season-engine/prompts/video-script.ts::promptVideoScript`
- **Caller**: `actions/conteudos.ts::gerarConteudoIA` (formato='video')
- **Modelo**: Via `getModelForTask(empresaId, 'conteudo_video')`
- **Max tokens**: 4096
- **System prompt** (7 princípios):
  ```text
  Você é roteirista especializado em micro-aprendizagem (vídeo de 3-5 min). Linguagem conversa entre colegas, não palestra. Frases curtas (máx 20 palavras). Português brasileiro natural. Zero markdown, zero indicações de câmera, zero emojis.

  7 princípios: tom conversa, frases curtas, PT-BR natural, sem jargão, ancoragem no descritor, sem teoria pura, aplicação prática.
  ```
- **Inputs user**: Competência, descritor, nível (1-4 label), cargo, contexto, duração target.
- **Estrutura obrigatória**: 4 blocos (GANCHO / CONCEITO / EXEMPLO / CHAMADA).
- **Output**: Texto corrido (roteiro para gravação externa/HeyGen).
- **Consumido por**: `micro_conteudos.conteudo_inline`.

### 11.2 Podcast Script

- **Arquivo**: `lib/season-engine/prompts/podcast-script.ts::promptPodcastScript`
- **Caller**: Mesmo, formato='audio'
- **Max tokens**: 4096
- **System prompt** (9 princípios):
  ```text
  Você é roteirista de podcast de desenvolvimento profissional. Tom conversa íntima. Usa "eu" e "você" — nunca "nós". Storytelling > explicação. Pausas naturais (reticências = 1s). Zero markdown, zero emojis.

  9 princípios: tom íntimo, storytelling, pausas, sem jargão, ancoragem, aplicação, sem teoria pura, PT-BR, duração calibrada.
  ```
- **Inputs user**: Mesmos + duração (3-5 min).
- **Estrutura obrigatória**: 4 blocos (ABERTURA / CONCEITO / APROFUNDAMENTO / PROVOCAÇÃO).
- **Output**: Texto corrido para narração (ElevenLabs voice clone).
- **Consumido por**: `micro_conteudos`.

### 11.3 Text Content (Artigo markdown)

- **Arquivo**: `lib/season-engine/prompts/text-content.ts::promptTextContent`
- **Caller**: Mesmo, formato='texto'
- **System prompt** (8 princípios):
  ```text
  Você é autor de artigos práticos de desenvolvimento profissional. Prosa com respiro — não lista de bullets. Parágrafos curtos (3-4 linhas), negrito em conceitos-chave (máx 5), linguagem brasileira profissional mas acessível. Formato final: markdown.

  8 princípios: prosa > bullets, parágrafos curtos, ancoragem no descritor, aplicação prática, sem teoria pura, PT-BR, acessível, conceitos-chave em negrito.
  ```
- **Inputs user**: Competência, descritor, nível, cargo.
- **Estrutura obrigatória**: 5 blocos (TÍTULO / SITUAÇÃO / CONCEITO / FRAMEWORK / PARA REFLETIR).
- **Output**: Markdown 800-1200 palavras.
- **Consumido por**: `micro_conteudos.conteudo_inline` + PDF via `renderMarkdownPDF`.

### 11.4 Case Study (Estudo de Caso)

- **Arquivo**: `lib/season-engine/prompts/case-study.ts::promptCaseStudy`
- **Caller**: Mesmo, formato='case'
- **System prompt** (7 princípios):
  ```text
  Você é autor de estudos de caso narrativos. Case imersivo e vivencial — o colaborador NÃO aprende um conceito, ele VIVE a situação e tira suas próprias conclusões. Não é explicativo, é experiencial. Tensão dramática. Formato markdown.

  7 princípios: imersivo, vivencial, tensão dramática, sem explicação, descritor nunca nomeado, PT-BR, ancoragem no cargo.
  ```
- **Inputs user**: Competência, descritor, nível (dificuldade), cargo, estrutura [TÍTULO/CONTEXTO/DESENVOLVIMENTO/DESFECHO/Perguntas].
- **Regra crítica**: Descritor NUNCA é mencionado pelo nome — aparece nas ações.
- **Output**: Markdown 600-1000 palavras.
- **Consumido por**: Igual `text`.

### 11.5 Sugerir Tags IA (Classificação de conteúdos)

- **Arquivo**: `actions/conteudos.ts::sugerirTagsIA`
- **Modelo**: Via `getModelForTask(empresaId, 'conteudo_tags')`
- **Max tokens**: 1000
- **Trigger**: Admin em `/admin/conteudos` → "Sugerir tags" em conteúdo não classificado.
- **System prompt** (6 princípios):
  ```text
  Você é um especialista em desenvolvimento de competências. Analise o conteúdo abaixo e sugira tags para classificá-lo no banco de micro-conteúdos. Responda APENAS com JSON válido, sem markdown.

  6 princípios: vocabulário controlado (só competências da lista), ancoragem no conteúdo, sem inventar tags, confiança calibrada (enum alta/media/baixa), raciocínio transparente, sem chute.
  ```
- **Inputs user**: Título, descrição, formato, duração, lista de 50 competências disponíveis (controlled vocabulary).
- **Output**: JSON `{ competencia, descritor, nivel_min, nivel_max, contexto, cargo, setor, tipo_conteudo, confianca:"alta|media|baixa", raciocinio }`.
- **Consumido por**: Sugestão para admin aprovar/aplicar via `aplicarTagsIA`.

---

## Simuladores

### 12.1 Simulador de Respostas (Fase 3)

- **Arquivo**: `actions/simulador-conversas.ts::simularUmaResposta`
- **Max tokens**: 4096
- **Trigger**: Admin/dev usa em `/admin/empresas/{id}/simulador` pra gerar respostas fictícias pros cenários (testar pipeline IA4 sem precisar de colabs reais). Distribuição: 30% fraco (N1-2), 50% médio (N2-3), 20% forte (N3-4).
- **System prompt** (inline, dinâmico por nível, 7 princípios):
  ```text
  Você vai simular as respostas de um colaborador a 4 perguntas de um cenário de avaliação de competências.

  COLABORADOR: {nome} | CARGO: {cargo} | COMPETÊNCIA: {nome}
  CENÁRIO: {descricao}

  7 PRINCÍPIOS: realismo, tom natural, coerência com perfil, sem linguagem acadêmica, variação por nível, ancoragem no cargo, sem sair do personagem.

  3 PERFIS DE RESPOSTA:
  - FRACO N1/2: vagas, genéricas, "acho que sim", "depende", 2-3 frases, hesitações
  - MÉDIO N2/3: alguma substância mas inconsistentes, exemplos genéricos, 3-5 frases
  - FORTE N3/4: detalhadas, exemplos concretos, reflexão, 4-7 frases, plano de ação

  Retorne APENAS JSON: {"r1","r2","r3","r4"}
  ```
- **Inputs user**: 4 perguntas do cenário formatadas.
- **Consumido por**: `respostas` (para testar IA4).

### 12.2 Simulador de Temporada — Colab (Haiku)

- **Arquivos**: `lib/season-engine/prompts/simulador-temporada.ts::promptSimuladorColab` + `promptSimuladorCompromisso`
- **Caller**: `actions/simulador-temporada.ts` (várias funções: `simularSocratico`, `simularMissaoPratica`, `simularQualitativa`, `simularSem14Ate`)
- **Modelo**: `claude-haiku-4-5-20251001` (hardcoded via `SIM_MODEL` — rápido+barato)
- **Max tokens**: 500-2500 (varia por cenário)
- **Trigger**: Admin da Vertho (platform admin) usa em `/admin/vertho/simulador-temporada` pra simular 14 semanas de uma trilha completa.
- **System prompt** (~1500 chars, 8 princípios):
  ```text
  Você está SIMULANDO um colaborador numa plataforma de desenvolvimento. Retorne APENAS a próxima fala do colab — sem aspas, sem prefixo.

  8 PRINCÍPIOS: primeira pessoa, tom natural, PT-BR, coerência perfil×semana, nunca sair do personagem, variação de comprimento, ancoragem no cargo, sem metalinguagem.

  4 PERFIS DE EVOLUÇÃO:
  - evolucao_confirmada: evolução clara (sems 1-4 superficial, 5-8 exemplos, 9-13 articulado com evidências)
  - evolucao_parcial: alguns descritores claros, outros difíceis; reflexões mistas
  - estagnacao: reflexões genéricas ("foi legal"), pouco concreto, mas engajado
  - regressao: começou bem, foi ficando curto, desinteresse nas últimas

  5 TIPOS DE CHAT suportados: socratic, missao_feedback, analytic, qualitativa_fechamento, cenario_final
  ```
- **Inputs user**: Competência, descritor, cargo, semana, tipo de chat, desafio/missão/cenário se houver, histórico recente (6 msgs).
- **Output**: Fala do colab.
- **Loop**: Sim — 1 chamada por turn colab na simulação.
- **Consumido por**: Persistido em `temporada_semana_progresso` como se fosse colab real.

### 12.3 Simulador de Compromisso (missão prática)

- **Arquivo**: `lib/season-engine/prompts/simulador-temporada.ts::promptSimuladorCompromisso`
- **Max tokens**: 500
- **System prompt** (7 princípios): Similar ao 12.2 mas gera só o compromisso inicial da semana de missão prática (1-2 frases). Perfil→compromisso mapping (cada perfil de evolução gera compromisso coerente com seu arco).
- **Consumido por**: `temporada_semana_progresso.feedback.compromisso`.

### 12.4 Extração pós-simulação (simulador)

- **Arquivo**: `actions/simulador-temporada.ts` — várias chamadas inline
- **System**: `SIM_EXTRACTOR_SYSTEM` — constante alinhada com 6.7 (EXTRATOR_SYSTEM). Mesmos princípios anti-alucinação.
- **Reusa**: Mesmo esquema do 6.7 (socratic: sinais_extraidos/limites_da_conversa; analytic: avaliacao_por_descritor com forca_evidencia).
- **Consumido por**: `reflexao` ou `feedback`.

---

## Fase 4 (PDI legado)

### 13.1 Gerar PDIs

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

### 14.1 Gerar Cenário B (legado / DISC-aware)

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

### 14.2 Evolução Granular (por descritor)

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

### 14.3 Tutor Evidência (Avaliar evidência submetida — legado Fase 4 GAS)

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

### 14.4 Auditoria Sem 14 — Regerar com Feedback

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

### 14.5 Auditoria Sem 14 — Check com Feedback

- **Arquivo**: `app/admin/vertho/auditoria-sem14/actions.ts` (segunda chamada em `regerarScoringComFeedback`)
- **Reusa**: 6.13 (`promptEvolutionScenarioCheck`).
- **Max tokens**: 8000.

---

## Resumo Estatístico

**Total de prompts catalogados: 59**

Por categoria:

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
| Dashboard Perfil | 2 | comportamental, insights |
| FIT v2 | 1 | leitura executiva |
| Conteúdos/Tagging | 5 | vídeo, podcast, texto, case, tags |
| Simuladores | 4 | respostas, colab temporada, compromisso, extração sim |
| Fase 4 | 1 | PDI legado |
| Outros | 5 | cenárioB legado, evolução granular, tutor evidência, regerar sem14, check sem14 com feedback |

## Notas de Integração

### Prompts com Grounding RAG ativo
- **Tira-Dúvidas** (`app/api/temporada/tira-duvidas/route.ts`): `retrieveContext(empresaId, message, 5)` → top 5 chunks
- **Reflection/Socrático/Missão Feedback** (`app/api/temporada/reflection/route.ts`): query = competência + descritor + últimas 2 msgs colab, top 4 chunks
- **Relatório Gestor** (`actions/relatorios.ts::gerarRelatorioGestor`): query fixa "valores cultura organizacional políticas desenvolvimento pessoas", top 4 chunks
- **Relatório RH** (`actions/relatorios.ts::gerarRelatorioRH`): query fixa "valores cultura organizacional políticas treinamento desenvolvimento estrategia", top 5 chunks

### Prompts com PII Masking (LGPD)
- **Avaliação Acumulada** (`actions/avaliacao-acumulada.ts`): mascara nome, sanitiza evidências, desmascara output
- **Reflection Sem 13 qualitativa** (`app/api/temporada/evaluation/route.ts`): mascara histórico + insights anteriores
- **Evolution Scenario Score Sem 14** (`app/api/temporada/evaluation/route.ts`): mascara nome + resposta + evidências
- **Tira-Dúvidas** (`app/api/temporada/tira-duvidas/route.ts`): mascara histórico, desmascara output
- **Reflection semanal** (`app/api/temporada/reflection/route.ts`): mascara histórico + compromisso

### Prompts com Retry
- **IA4** (`actions/fase3.ts::rodarIA4`): 1 retry se primeira resposta não for JSON válido, com appendix "Retorne APENAS o JSON, sem texto antes ou depois"

### Prompts com Streaming (automático em `callAI` se `maxTokens > 8192`)
- IA3 (64000), IA4 (64000), Relatórios (64000), Fusão (64000), Plenária (64000), Cenário B legado (32768), Evolução Granular (32768), Evaluation chat (32768), Chat audit (65536)

### Prompts que rodam em loop (processamento batch)
- IA1 (1 por cargo), IA2 (1 por cargo), IA3 (1 por competência×cargo via fila), IA4 (1 por resposta, com retry), Check IA4 (1 por resposta), Cenários B lote, Reavaliação, Evolução Fusão (1 por colab×competência), Relatórios Individuais (1 por colab), Relatório Gestor (1 por gestor), PDIs (1 por colab), Simulador temporada (1 por turn × 14 semanas), Conteúdos lote (1 por descritor).

### Modelos não-default hardcoded
- **Gemini** `gemini-3-flash-preview`: Check IA4, Check Cenário (A/B), Audit Chat Fase 3
- **Claude Haiku** `claude-haiku-4-5-20251001`: Tira-Dúvidas, Simulador temporada (colab)
- Demais: usam default `claude-sonnet-4-6` ou configuração `getModelForTask(empresaId, taskKey)` (ai-tasks table).

### Prompts não catalogados (intencionalmente)
- Extract helpers inline curtos (schemas JSON sem lógica própria)
- Chamadas a embeddings Voyage/OpenAI (fora do escopo — não são chat/completion)
- Prompts do roteador interno (`ai-client.ts` em si)

### Observações
- O arquivo `lib/prompts/` contém 3 construtores de prompt (`.js`): `behavioral-report-prompt.js`, `fit-executive-prompt.js`, `insights-executivos-prompt.js`. Não foram lidos em detalhe aqui — são funções puras que montam o `user` prompt. Os system prompts usados com eles estão documentados nas seções 7.1, 9.1, 9.2, 10.1.
- O prompt de Check Cenário B de Fase 5 é idêntico ao de Cenário A — harmonizado no refactor.
- `fase5.ts::checkCenarios` é um dossie rudimentar/antigo; produção usa `checkCenarioUm`/`checkCenarioBUm`.
