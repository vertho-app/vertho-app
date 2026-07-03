# Vertho Mentor IA — Passo a Passo End-to-End

Processo completo do zero até o Evolution Report, intercalando as atividades do **Admin/RH** (preparação + acompanhamento) e do **Colaborador** (jornada de 14 semanas).

---

## Fase 0 — Setup da Empresa e Colaboradores

### 1. Criar empresa
**Admin** · `/admin/dashboard` → botão **"+ Nova Empresa"**
- Preencher: nome, slug (subdomínio), segmento (educacional/corporativo), logo
- A empresa recebe um subdomínio `{slug}.vertho.ai`
- **Vincular ao Vercel é manual**: após criar a empresa, abrir `/admin/empresas/{id}/configuracoes` → aba Branding → botão **"Vincular ao Vercel"** (auto-registro foi removido em 2026-04 após bug com Ibipeba)

### 2. Cadastrar colaboradores
**Admin** · `/admin/empresas/{id}` → **Fase 0 · Cadastro · Colaboradores & Cargos**
- Adicionar manualmente ou importar planilha
- Cada colab: nome, email, cargo, **área/depto** (`area_depto`, aliases: `area`, `departamento`, `setor`, `depto`), role (colaborador/gestor/rh)
- Tabela com **ordenação por coluna** (clique no header)
- **Danger zone** (limpar competências/colaboradores) disponível na própria página da empresa
- Lixeira (`/admin/lixeira`) permite restaurar registros excluídos

### 2b. (Alternativa) Cadastro externo / autosvc
**Admin** · `/admin/empresas/{id}/perfil-externo`
- Gera link público para preenchimento direto pelo colaborador (autosvc piloto, migration 079)

### 3. Cadastrar cargos e competências
**Admin** · `/admin/competencias?empresa={id}`
- Importar CSV com cabeçalho: `nome,cod_comp,pilar,cargo,descricao,cod_desc,nome_curto,descritor_completo,n1_gap,n2_desenvolvimento,n3_meta,n4_referencia`
- **Cada linha = 1 descritor**. Uma competência com 6 descritores → 6 linhas com mesmo `nome` e `nome_curto` diferentes
- A régua n1-n4 é usada na avaliação final (sem 14) para ancorar a pontuação

### 3.5 (Opcional) Popular Base de Conhecimento (RAG)
**Admin Vertho** · `/admin/vertho/knowledge-base?empresa={id}`
- Botão **"Popular base inicial"** cria 6 docs seed (régua, modos de missão, privacidade, etc.)
- Upload de PDFs/DOCX com políticas internas, valores, manuais (até 4MB por arquivo)
- Cada doc é fragmentado por seção, indexado em FTS PT-BR + embedding Voyage (voyage-3-large, 1024d)
- Enriquece respostas da IA com contexto da empresa (Tira-Dúvidas, Evidências socrático, Missão feedback, Relatórios Gestor/RH)

### 4. (Opcional) Preferências de aprendizagem
**Colaborador** · `/dashboard/perfil` ou mapeamento comportamental
- Colab ranqueia formatos: vídeo, texto, áudio, case
- Salvo nas colunas `pref_*` de `colaboradores`

---

## Fase 1 — Diagnóstico (Fit v2)

### 5. Rodar IA1 — Top 10 competências por cargo
**Admin** · `/admin/empresas/{id}` → **Fase 1 · IA1 — Top 10**
- IA analisa descrição do cargo + competências disponíveis
- Salva as 10 competências prioritárias por cargo em `top10_cargos`
- A partir de 2026 (migration 052), cada item carrega `aderencia_cargo` (0-1), `aderencia_mercado` (0-1) e `motivo` (frase curta)
- **Match cargo-colab é case+accent insensitive** (ex: "Coordenação Pedagógica" = "coordenacao pedagogica")

### 5b. Votação dos colaboradores nas Top 10
**Colaborador** · `/dashboard/votacao`
- Card "Votação aberta" aparece **antes** de "Foco da semana" no dashboard
- Cada colab vota nas top 10 do próprio cargo, gerando ranking de relevância percebida
- Persiste em `votacao_competencias` (migration 053)
- **Admin** vê resultados em `/admin/empresas/{id}/votacao`

### 6. Validar Top 5
**Admin** · `/admin/cargos` → revisar/editar o Top 5 de cada cargo
- Define a lista final que cada colab responderá

### 7. Rodar IA2 — Gabarito
**Admin** · Fase 1 · **IA2 — Gabarito**
- Gera `descricao` enriquecida de cada competência do Top 5

### 8. Rodar IA3 — Cenários + Check
**Admin** · Fase 1 · **IA3 — Cenários + Check**
- Gera 5 cenários A (situacionais) por cargo × competência
- Dual-IA valida a qualidade dos cenários

### 9. Fit v2 + Envios
**Admin** · Fase 1 · **Fit v2** → avalia fit DISC×competência por colab
**Admin** · Fase 1 · **Envios** → dispara WhatsApp/email com link personalizado

### 10. Colaborador responde diagnóstico
**Colaborador** · link recebido por WhatsApp/email → `/dashboard/assessment`
- Responde cenários da IA3 (chat com simulação)
- Mapeamento comportamental (DISC): `/dashboard/perfil-comportamental/mapeamento`
  - A tela de instruções abre com um **vídeo de instruções** (capa clicável → player com tracking de view). Ao concluir o mapeamento, o colab é levado à tela de resultado, que gera relatório + insights e pré-gera o PDF (16 competências) em background.

---

## Fase 2 — Avaliação e Trilhas

### 11. IA4 avalia respostas
**Admin** · Fase 2 · **IA4 — Avaliar + Check**
- IA lê respostas do colab e pontua cada competência (nivel_ia4 de 1-4)
- Segundo modelo valida (dual-IA)

### 12. Competências Foco
**Admin** · Fase 2 · **Competências Foco**
- Sistema calcula a competência **âncora** de cada colab (menor fit × maior gap)
- No default **Regular DUO**, uma 2ª competência é resolvida (`sys_config.competencias_regular_duo` ou top-2 do cargo via `top10_cargos`, âncora em 1º)
- Salvo em `trilhas.competencia_foco` (âncora, compat) + `trilhas.competencias_foco TEXT[]` (as 2 comps)

### 13. Assessment inicial de descritores
**Admin** · `/admin/assessment-descritores?empresa={id}`
- Grid colab × descritor da competência foco
- Admin/RH entra nota 1-4 (granularidade 0.1) para cada descritor
- Se deixar vazio, o motor usa default 1.5 (gap moderado)

### 14. Gerar PDI individual (opcional)
**Admin** · Fase 2 · **Relatórios · Gerar PDI**
- Gera PDF individual com diagnóstico e plano de desenvolvimento
- `resumo_geral` sempre objeto, `plano_30_dias` sempre `{foco, acoes}`, `estudo_recomendado` sempre objetos

---

## Fase 3 — Motor de Temporadas

### 15. Popular o banco de micro-conteúdos
**Admin** · `/admin/conteudos`

**Via Bunny Stream:**
- Botão **"Importar do Bunny"** → traz todos vídeos da library com tags vazias
- Em cada linha, clicar Sparkles → IA sugere competência/descritor/nível/cargo
- Revisar e aplicar

**Via upload manual:**
- Botão **"Adicionar manual"** → modal aceita áudio/PDF (storage) ou texto/case (inline markdown)

**Via geração IA:**
- Botão **"Gerar com IA"** → escolhe formato (artigo, case, roteiro vídeo, roteiro podcast)
- Competência/descritor/cargo via dropdown

**Coluna "Taxa"**: % de conclusão por conteúdo (atualizada automaticamente). Motor prioriza vídeos com taxa maior.

### 16. Gerar temporadas para os colaboradores
**Admin** · `/admin/empresas/{id}` → **Fase 3 · Temporadas · Gerar Temporadas**
- Roda lote para todos os colabs da empresa
- Para cada colab:
  0. **Resolve o modo do programa** (`resolverModoColab`): `colaboradores.programa_modo` (override individual, Configurações → Equipe) → `sys_config.programa_modo` (default da empresa) → Regular DUO. O rótulo resolvido é **carimbado** em `trilhas.programa_modo` — o runtime da trilha lê do carimbo (trocar o default depois não afeta trilha em andamento). Modo `piloto` desvia pro fluxo próprio (ver "Fluxo alternativo: Modo Piloto" abaixo)
  1. Busca as competências da trilha (passo 12) — 2 no default DUO, 1 no `regular_single`
  2. Busca descritores cadastrados (passo 13) — assessment por competência
  3. **Seleção de descritores nos 9 slots** (sem 1-3, 5-7, 9-11), por gap decrescente, 2 semanas se nota<=1.5:
     - **DUO** (`selectDescriptorsDuo`): 3 blocos de 3 → `[1,2,3]` Comp A, `[5,6,7]` Comp B, `[9,10,11]` reforço da comp de maior gap; cada descritor sai com `.competencia`
     - **single** (`selectDescriptors`): tudo na competência foco
     - Fallback sem viés: cargo sem 2 comps ou 2ª comp sem assessment → cai pro single
  4. `buildSeason` monta 14 semanas:
     - Conteúdo (9 slots): resolve formato_core conforme prioridade do colab + taxa_conclusao; no DUO a semana roteia pra comp do descritor
     - Prática (sem 4, 8, 12): gera missão + cenário em paralelo via Claude — no DUO, **integradoras das 2 comps** (complexidade crescente)
     - Avaliação (sem 13, 14): reservadas; acumulada (sem 13) avalia **por competência** no DUO
  5. Salva em `trilhas.temporada_plano` (JSONB)
  6. Admin define `trilhas.data_inicio` (DATE) para controlar liberação por calendário

### 17. Admin revisa as temporadas geradas
**Admin** · `/admin/temporadas?empresa={id}`
- Ver cada colab: plano de 14 semanas, descritores selecionados, status
- **Ações por temporada**: Pausar / Retomar / Arquivar / Regerar semana
- **Prontidão piloto**: botão no header valida, por colaborador em modo piloto, formato-core dos top-4 descritores (bloqueador se nenhum conteúdo utilizável) e Cenário B do cargo (bloqueador do fechamento) — rodar ANTES de liberar a degustação
- **Detalhe**: abre modal com transcripts completos, insights, avaliações IA
- **Simulador**: botão "SIM" roda simulação completa (1 semana/chamada, 4 perfis, Haiku, barra de progresso)

---

## Fase 4 — Jornada do Colaborador (14 semanas)

### 18. Colab acessa sua temporada
**Colaborador** · `/dashboard/temporada`
- Vê timeline com 14 cards (status: concluída/em andamento/bloqueada)
- **Gate duplo**: semana N libera em `data_inicio + (N-1)*7 dias @ 03:00 BRT` **E** anterior concluída
- Helper: `lib/season-engine/week-gating.ts`

### 19. Semanas de Conteúdo (sem 1-3, 5-7, 9-11)
**Colaborador** · `/dashboard/temporada/semana/{N}`

**Fluxo de cada semana:**
1. **Conteúdo**: vídeo (Bunny embed) / áudio (player HTML5) / texto/case (markdown)
   - Switch de formato se existem outros disponíveis
   - Vídeo: progresso >80% marca automático como consumido via postMessage
   - Botão **"Marcar como realizado"** como fallback (gate: só libera após clicar link)
2. **Desafio da semana**: 1 micro-ação observável gerada por Claude (card destacado, JSON estruturado: `{desafio_texto, acao_observavel, criterio_de_execucao, por_que_cabe_na_semana}`)
3. **Tira-Dúvidas** (NOVO): chat reativo sobre o conteúdo da semana
   - Guard-rail no descritor da semana (não divaga)
   - Modelo: Haiku 4.5
   - Sem limite de turnos, não altera status da semana
   - Persiste em `temporada_semana_progresso.tira_duvidas` JSONB
   - API: `POST /api/temporada/tira-duvidas`
4. **Evidências** (socrática, 6 turnos IA + 6 colab):
   - **10 princípios** de condução socrática
   - **6 turnos com progressão explícita** (abertura → aprofundamento → motivações → aprendizado → integração → fechamento)
   - Turn 6: fechamento com bullets Desafio / Insight / Compromisso
   - **Grounding RAG disciplinado**: regras explícitas de uso do contexto recuperado
   - **Tom adaptado ao perfil DISC** do colab
   - **Regra anti-alucinação**: IA não inventa dados do colab
   - **Input por voz** disponível (Web Speech API, botão microfone)
5. Ao finalizar Evidências → próxima semana liberada (respeitando gate calendário)

### 20. Semanas de Prática (sem 4, 8, 12) — Missão Prática
**Colaborador** · `/dashboard/temporada/semana/{4|8|12}`

**Fluxo (substitui cenário escrito como default):**
1. **Cenário apresentado**: JSON estruturado com `cenarioToMarkdown` para renderização
2. **Missão Prática apresentada**: JSON estruturado com `missaoToMarkdown` para renderização
   - Colab aceita missão + declara compromisso
   - API: `POST /api/temporada/missao` (set_modo + compromisso)
3. **Execução**: colab executa a missão na vida real durante a semana
4. **Relato**: colab retorna e relata o que aconteceu
5. **Feedback IA** (10 turnos via `prompts/missao-feedback.ts`):
   - IA analisa o relato, explora aprendizados, conecta com descritores
   - **Anti-alucinação** e **anti-relato-bonito**: IA questiona relatos genéricos
6. **Fallback "Não consegui"**: se colab declara que não executou a missão
   - Cai para cenário escrito (feedback analítico, 10 turnos via `prompts/analytic.ts`)
   - Complexidade aumenta: simples → intermediário → completo
   - Cobre descritores dos blocos anteriores

**Dados extraídos:** avaliação por descritor, síntese do bloco, salvos em `temporada_semana_progresso.feedback`

### 21. Semana 13 — Conversa de Fechamento Qualitativa
**Colaborador** · `/dashboard/temporada/semana/13`

- Conversa socrática aberta com IA (**12 turnos**, era 8)
- **6 etapas**:
  1. **Abertura**: acolhimento e retomada da jornada
  2. **Retrospectiva**: percorre descritores trabalhados ("Como se sente hoje vs início?")
  3. **3 Evidências**: escolhe e aprofunda 3 momentos marcantes
  4. **Microcaso**: IA apresenta cenário curto + 2 follow-ups
  5. **Integração de descritores**: 2 ângulos diferentes
  6. **Maior avanço + síntese final**
- **DISC adaptado** ao perfil do colab
- **10 princípios anti-inflação** na condução
- **Regra anti-alucinação**
- Ao final, Claude extrai via JSON:
  - `evolucao_percebida[]`: para cada descritor, antes/depois/nivel_percebido com **confiança 0-1** e **citações literais**
  - `maior_avanco`
  - `ponto_atencao`
  - `microcaso_resposta_qualidade`
- Prompt: `prompts/evolution-qualitative.ts`

### 22. Avaliação Acumulada (auto-trigger ao fim da sem 13)
**Sistema** (automático, sem interação do colab)

- Dispara automaticamente quando sem 13 é concluída
- **1a IA** lê 13 semanas e pontua 1-4 por descritor
  - **Cega para nota inicial** (anti-viés de ancoragem)
  - max_tokens 8000
- **2a IA** audita a avaliação (max_tokens 6000)
- **`validateAvaliacaoAcumulada`**: valida estrutura, `forca_do_padrao`, **3-status check** (forte/moderado/fraco)
- Resultado persiste em `temporada_semana_progresso.feedback.acumulado` da sem 13
- Prompt: `prompts/acumulado.ts`
- Action: `actions/avaliacao-acumulada.ts`

### 23. Semana 14 — Avaliação Final (Cenário B)
**Colaborador** · `/dashboard/temporada/sem14`

- **Cenário B SEMPRE do `banco_cenarios`** (sem fallback IA)
- **4 perguntas sequenciais** do campo `alternativas.p1..p4`:
  1. SITUACAO — Como interpreta o contexto
  2. ACAO — O que faria concretamente
  3. RACIOCINIO — Por que essa abordagem
  4. AUTOSSENSIBILIDADE — O que pode dar errado / pontos cegos
- **UX wizard** idêntica ao mapeamento DISC (steps, não chat)
- **Scorer triangula**: cenário + acumulada + evidências 13 semanas
  - Check por 2a IA
  - `resumo_avaliacao` SEMPRE objeto (nunca string)
  - **`validateEvolutionScenarioScore`**: valida estrutura + **6 critérios check**
  - Ponderação explícita: consistente / divergente cenário superior / divergente cenário inferior
  - Gera **4 notas por descritor**: pré, acumulada, cenário, final
  - `nota_cenario` isolada + `nota_pos` triangulada
- **DISC** usado apenas no tom da devolutiva (não influencia nota)
- **Evolution Report** gerado automaticamente ao concluir

### 24. Temporada Concluída + Evolution Report
**Colaborador** · `/dashboard/temporada/concluida`

- `actions/evolution-report.ts` consolida sems 13+14 → `trilhas.evolution_report`
- **Tela com 5 blocos**:
  1. **Hero**: resumo da jornada, competência foco, status geral
  2. **Comparativo por descritor**: nota pré → pós + delta + classificação
  3. **Momentos Insight**: frases marcantes das reflexões semanais
  4. **Missões**: resultado das missões práticas (sem 4/8/12)
  5. **Avaliação Final**: 4 notas por descritor + síntese
- **PDF individual** via `/api/temporada/concluida/pdf` (gerado por `lib/temporada-concluida-pdf.ts`)
- Classificação de cada descritor:
  - Evolução confirmada: nota_pos >= nota_pre + 0.5 **e** qualitativa positiva
  - Evolução parcial: nota_pos >= nota_pre + 0.2 **ou** qualitativa positiva
  - Estagnação: delta entre -0.2 e +0.2
  - Regressão: nota_pos < nota_pre - 0.2

---

## Fase 5 — Consolidação para o Gestor

### 25. Dashboard do Gestor — Equipe Evolução
**Gestor/RH** · `/dashboard/gestor/equipe-evolucao`

- Lista de liderados com:
  - Delta por descritor
  - Status: evolução confirmada / parcial / estagnação / regressão
- Filtros + ordenação
- Click-through: modal com detalhe completo do colab
- PDF individual por colab: `resumo_executivo` sempre objeto, `risco_se_nao_agir` incluído
- Botão **"Equipe"** na top bar (visível para gestor/RH)

### 26. Plenária PDF (Relatório RH)
**Gestor/RH** · `/api/gestor/plenaria/pdf`

- PDF consolidado do time inteiro
- Gerado por `lib/plenaria-equipe-pdf.ts`
- `resumo_executivo` sempre objeto, `perfil_disc` sempre `forca_coletiva/risco_coletivo`
- Visão agregada: quem evoluiu, quem estagnou, padrões por competência

### 27. Evolution Report da empresa (Admin)
**Admin** · `/admin/evolucao?empresa={id}`

- 4 KPIs agregados: total de confirmadas / parciais / estagnações / regressões (com %)
- Expansível por competência: cada descritor com barra horizontal + média pré→pós
- Lista de colabs avaliados com resumo
- Usado para decidir próximo ciclo de treinamento

### 28. Painéis Admin Vertho (platform admin only)

**`/admin/vertho/evidencias`** — Conversas socráticas sem 1-12, extração, transcript completo. Filtro `?empresa=`.

**`/admin/vertho/avaliacao-acumulada`** — Nota por descritor + auditoria + botão regerar. Filtro `?empresa=`.

**`/admin/vertho/auditoria-sem14`** — 4 notas (pré/acumulada/cenário/final) + delta + regerar com feedback. Filtro `?empresa=`.

**`/admin/vertho/simulador-custo`** — Calculadora interativa de custo IA: catálogo 20 chamadas, 7 modelos, 3 presets.

**`/admin/vertho/knowledge-base`** — CRUD da base de conhecimento RAG per-tenant. Upload PDF/DOCX/TXT/MD (até 4MB), botão "Popular base inicial" (6 docs seed), preview de busca. Alimenta grounding em Tira-Dúvidas + Evidências + Missão Feedback + Relatórios Gestor/RH.

Todos com back button context-aware.

### 29. Arquivar e iniciar próxima temporada
**Admin** · `/admin/temporadas?empresa={id}` → filtro "Concluídas"
- Arquivar temporadas concluídas (liberam a trilha do colab para nova competência foco)
- `numero_temporada` não infla em regeneração
- Voltar ao passo 12 (nova competência foco) e repetir o ciclo

---

## Fluxo alternativo: Modo Piloto (degustação de 2 semanas)

> `programa_modo='piloto'` (por colaborador ou empresa). O lead roda a jornada INTEIRA em 2 semanas — o fechamento demonstra o método, não mede evolução. Doc canônico: `docs/MODO-PILOTO.md`.

1. **Marcar o colaborador**: Configurações → Equipe → select "Piloto" (ou default da empresa na tab Programa)
2. **Prontidão**: `/admin/temporadas` → "Prontidão piloto" → resolver bloqueadores (conteúdo core dos top-4 descritores; Cenário B do cargo — gerar na Fase 4 do pipeline "Cenários B + Check")
3. **Gerar temporada** (mesmo botão do passo 16): 1 competência âncora, top-4 descritores por gap, 2 conteúdos/semana (sems 1-2), fechamento no slot 3 com **calendário espelhado na sem 2**
4. **Colaborador**: diagnóstico completo inalterado (DISC/mapeamento/DNA/Fit) → sems 1-2 com 2 conteúdos + reflexão socrática cada (a IA cobra os DOIS desafios) → ao concluir a sem 2, a acumulada single-comp roda automática em background
5. **Fechamento** (libera assim que a sem 2 conclui, sem esperar dia 14): wizard Cenário B (4 perguntas) → scorer com **trava de piso** (`nota_pos = max(bruto, baseline)`, bruto + `piso_aplicado` preservados, `spec_version='piloto-v1'`) → auditoria 2ª IA → Evolution Report variante piloto
6. **Relatório**: tela/PDF SEM delta antes→depois — competência como ponto de partida, fechamento como demonstração da avaliação
7. **Conversão**: fechou → trocar o modo do colaborador → regerar temporada (diagnóstico é reaproveitado; o plano piloto é sobrescrito na mesma trilha)

---

## Fluxo paralelo: Pulso de Desenvolvimento

> Pesquisa T0/T2 sobre o ambiente que sustenta a evolução. Independente das Fases 0-5 do Mentor IA — pode rodar em qualquer empresa, com ou sem trilha ativa. Mais detalhes em `ARQUITETURA.md` seção 18.

### P1. Criar ciclo de Pulso
**Admin** · `/admin/empresas/{id}/pulso` → botão **"+ Novo ciclo"**
- Nome (ex: "Piloto Macaé — 1º Semestre 2026") + descrição opcional
- Status inicial: `draft`

### P2. Disparar assignments T0
**Admin** · mesma página → card do ciclo → **"Disparar assignments"** no card T0
- Cria 1 `pulse_assignment` por colaborador ativo (exceto tutores)
- Idempotente — UK em (ciclo, colab, momento), reexecutar não duplica
- Status do ciclo passa pra `t0_aberto`
- O disparo cria assignments **mas não envia o link** — isso fica no passo P3

### P3. Enviar convites por WhatsApp/email
**Admin** · `/admin/empresas/{id}/pulso/{cicloId}/enviar`
- Toggle T0 / T2 + canal (WA / email / ambos)
- Editor de mensagem com placeholders `{{nome}}`, `{{empresa}}`, `{{link_pulso}}`
- Gera magic link pessoal (24h) via `sb.auth.admin.generateLink` com `redirectTo` apontando direto pro `/dashboard/pulso/{assignmentId}`
- Z-API com throttle 1.2s entre envios
- Idempotente — registra audit log `convite_enviado_*`, pula quem já recebeu (override com checkbox **Reenviar**)
- Stats em tempo real: total · enviados WA · enviados email · pendentes

### P4. Colaborador responde
**Colaborador** · link recebido → `/dashboard/pulso/{assignmentId}`
- Tela intro com aviso de privacidade obrigatório
- 12 perguntas Likert 1-5 (uma por vez) + 1 aberta (opcional)
- Progresso visual + botão voltar + salvamento automático
- 6 dimensões: clareza, condições, liderança, segurança para aprender, aplicação prática, futuro e permanência
- Tela final: "Obrigado. Seu pulso foi registrado com segurança."

### P5. Fechar T0 (opcional)
**Admin** · botão **"Fechar momento"** no card T0
- Status do ciclo passa pra `em_jornada`
- Novas respostas são bloqueadas pra esse momento
- T0 fechado é pré-requisito pra abrir T2 depois

### P6. Dashboard agregado
**Gestor/RH/Admin** · `/admin/empresas/{id}/pulso/{cicloId}/dashboard`
- Cards: índice geral, respondentes T0/T2, delta, dimensão forte/crítica
- Filtros: empresa toda / por área / por cargo (apenas recortes com n≥7 aparecem)
- Gráfico por dimensão (barras T0 + T2 sobrepostas)
- Tabela com leitura automática + classificação (favorável / parcial / atenção / bloqueador)
- Sinais comportamentais (engagement IA, profundidade, completude) com guard n≥7
- Botões **"Classificar texto IA"** (Dual-IA), **"PDF Executivo"**, **"Complementar NR-1"** no header

### P7. Classificar respostas abertas (Dual-IA)
**Admin** · botão **"Classificar texto IA"** no dashboard
- Modelo 1 (Sonnet 4.6 default) classifica em taxonomia fechada de 12 temas: falta de tempo, falta de clareza, falta de apoio, ausência de feedback, sobrecarga, baixa autonomia, dificuldade de aplicação, insegurança para pedir ajuda, conflito de prioridades, reconhecimento, evolução percebida, aplicação prática concreta
- Modelo 2 (Gemini Flash default) audita: aprova ou aponta divergências, ajusta confidence
- Cap de 50 chamadas por execução; idempotente por `response_id`
- `final_confidence='low'` é ignorada na agregação
- Resultados aparecem em **PulseThemesCloud** com chips polarity-colored

### P8. Triangulação e recomendações
**Sistema** · ao abrir o dashboard
- Cruza dimensões × sinais × temas
- Gera aceleradores (dims ≥4 ou delta positivo), bloqueadores (dims <3), alertas (delta ≤-0.4), divergências (declarado vs comportamental), recomendações (por dimensão crítica)
- Linguagem cautelosa obrigatória ("Há sinais de…", "Os dados sugerem…")
- Confidence level: high (T0+T2 ≥7), medium (T0 ou T2 ≥7), low (insuficiente — não gera insight executivo)

### P9. Exportar PDFs
**Admin** · botões no header do dashboard
- **PDF Executivo** (`pulso_executivo`): capa + KPIs + dimensões + sinais + temas + triangulação + recomendações
- **PDF Complementar NR-1** (`pulso_complementar_nr1`): mesma base + disclaimer obrigatório destacado ("A Vertho não realiza diagnóstico técnico…") + mapeamento conceitual das 6 dimensões em linguagem organizacional
- Confirmação no NR-1 antes de gerar (alerta sobre uso correto)
- PDF é cacheado em `relatorios-pdf/{empresa_id}/...` e o registro fica em `relatorios` (mesmo padrão dos relatórios individuais/gestor/RH)
- Audit log em `pulse_audit_logs` para cada export

### P10. Repetir T2 (pós-jornada)
**Admin** · após período da jornada de desenvolvimento → reabrir ciclo → **"Disparar assignments T2"** → repetir P3-P9
- T2 captura a mesma estrutura de 12 perguntas em linguagem retrospectiva
- Delta T2-T0 fica disponível em todas as superfícies (dashboard, PDF executivo)

### Tabelas envolvidas

| Tabela | Função |
|---|---|
| `pulse_ciclos` | Ciclo de pulso por empresa |
| `pulse_assignments` | Convite por colab × momento |
| `pulse_responses` | Resposta a uma pergunta (Likert ou texto) |
| `pulse_classifications` | Saída Dual-IA (classifier + auditor + final_confidence) |
| `pulse_triangulations` | Cache do resultado consolidado por grupo |
| `pulse_audit_logs` | Logs de acesso, envios e bloqueios n<7 |
| `pulse_mv_aggregates` | MV com médias por grupo × dimensão × momento |

---

## Sites públicos (paralelos ao Mentor IA)

### Radar Vertho (`radar.vertho.ai`)
Plataforma pública nacional de indicadores INEP por escola/município. Consulta sem cadastro; captação de leads via PDF assíncrono. Cobertura ~197k escolas.
- Admin: `/admin/radar` (ingestão Saeb/ICA/Censo) e `/admin/radar/funnel` (analytics).
- Doc detalhada: `docs/radar/README.md`.

### Radarbett (`radarbett.vertho.ai`)
Versão para o Bett 2026 — tipografia escopada (Plus Jakarta Sans + Fraunces) e CTA "Agendar conversa" abre WhatsApp direto (mensagem varia por contexto).
- **Modo teste pré-Bett ativo**: "Liberar leitura completa" libera imediatamente sem capturar lead. Reverter pós-evento (gating estrito).

---

## Loops contínuos (rodam em background)

### Cron diário (5h)
`/api/cron?action=cleanup_sessoes`
- Limpa sessões antigas
- **Recalcula `taxa_conclusao`** de cada micro-conteúdo

### Taxa de conclusão alimenta o A/B testing
- `build-season` ordena conteúdos candidatos por `taxa_conclusao DESC`
- Conteúdos com alta taxa são servidos preferencialmente

### Backfill de embeddings (quando trocar provider)
`npm run backfill:embeddings` — re-gera embeddings dos docs existentes em `knowledge_base` (útil ao trocar `EMBEDDING_PROVIDER` entre Voyage e OpenAI).

---

## Mapa rápido de onde cada coisa mora

| Recurso | Tabela | Tela Admin | Tela Colab |
|---|---|---|---|
| Empresas | `empresas` | `/admin/dashboard` | — |
| Colaboradores | `colaboradores` | `/admin/empresas/gerenciar` | `/dashboard/perfil` |
| Competências + descritores | `competencias` + `competencias_base` | `/admin/competencias` | — |
| Assessment inicial | `descriptor_assessments` | `/admin/assessment-descritores` | — |
| Fit resultados | `fit_resultados` | `/admin/fit` | `/dashboard/assessment` |
| Banco de conteúdos | `micro_conteudos` | `/admin/conteudos` | consumido via temporada |
| Temporadas | `trilhas` + `temporada_semana_progresso` | `/admin/temporadas` | `/dashboard/temporada` |
| Tira-Dúvidas | `temporada_semana_progresso.tira_duvidas` | — | `/dashboard/temporada/semana/{N}` |
| Missões Práticas | `temporada_semana_progresso.feedback` | — | `/dashboard/temporada/semana/{4\|8\|12}` |
| Avaliação Acumulada | `temporada_semana_progresso.feedback.acumulado` | `/admin/vertho/avaliacao-acumulada` | — |
| Evolution Reports | `trilhas.evolution_report` | `/admin/evolucao` | `/dashboard/temporada/concluida` |
| Cenários A/B | `banco_cenarios` | Fase 1 IA3 / Sem 14 | — |
| Equipe Evolução | — | — | `/dashboard/gestor/equipe-evolucao` |
| Evidências (admin) | — | `/admin/vertho/evidencias` | — |
| Auditoria sem 14 | — | `/admin/vertho/auditoria-sem14` | — |
| Simulador de custo | — | `/admin/vertho/simulador-custo` | — |

---

## Perfis de IA configurados

| Conversa | Onde | Turns IA | Modelo | Personalização |
|---|---|---|---|---|
| Tira-Dúvidas | sem 1-3, 5-7, 9-11 | ilimitado | Haiku 4.5 | guard-rail no descritor da semana |
| Evidências (socrática) | sem 1-3, 5-7, 9-11 | 6 | Sonnet 4.6 | DISC + anti-alucinação + perguntas abertas |
| Missão Feedback | sem 4, 8, 12 | 10 | Sonnet 4.6 | IA analisa relato da missão |
| Analítica (fallback) | sem 4, 8, 12 | 10 | Sonnet 4.6 | alterna pontos fortes ↔ provocações |
| Evolution qualitativa | sem 13 | 12 | Sonnet 4.6 | 6 etapas, microcaso, DISC |
| Avaliação Acumulada | pós sem 13 | — (single-shot) | Sonnet 4.6 + auditor | cega p/ nota inicial, max 8000+6000 tok |
| Evolution cenário | sem 14 | — (wizard 4 perguntas) | Sonnet 4.6 + auditor | triangulação + 4 notas, régua n1-n4 |
| Simulador | admin | 1 sem/chamada | Haiku | 4 perfis comportamentais |

---

---

## Notas de manutenção

### 2026-05-14 — Pulso de Desenvolvimento + Macaé
- **Módulo Pulso de Desenvolvimento** entregue em 6 commits (`8468aa8`, `c9203d6`, `3cdcf19`, `54c84d3`, `71c625d`, `b7b072b`): pesquisa T0/T2 com 12 Likert + 1 aberta em 6 dimensões; dashboard agregado com guard n≥7 obrigatório; sinais comportamentais on-demand (sem nova MV/migration além da 097); Dual-IA (Sonnet classifica, Gemini audita) com taxonomia fechada de 12 temas; PDFs Executivo + Complementar NR-1 com disclaimer obrigatório; envio de convites por WhatsApp/email via magic link pessoal. Migrations 096-098.
- **Migração GAS → Supabase (Macaé)** (commits `e045cad`, `f604f9c`): empresa "Secretaria Municipal de Macaé/RJ" (slug `macae`), 59 colaboradores com DISC, 18 competências, 1 cargo, 51 PDIs migrados via Drive público (folder `PDIs Gerados Template`). Samuel Protetti setado como gestor (`gestor_email`) de todos os 58 colabs ativos. Telefones com prefixo `+` removidos.
- **Filtro DISC nos Envios** (commit `7fb613d`): filtro "Perfil DISC" (Todos / Com perfil / Sem perfil) em todas as 5 tabs de `/admin/whatsapp` (Magic Link, Email Convites, WhatsApp Convites, Email Relatórios, WhatsApp Relatórios). Aplicado client-side (contagem) e server-side (disparo).
- **Piloto Macaé pronto**: ciclo "Piloto Macaé — 1º Semestre 2026" criado, 59 assignments T0 criados, ciclo fechado intencionalmente (status `em_jornada`) aguardando autorização para disparo.

### 2026-05-03 — Bett 2026, votação, perfil externo
- **Radarbett** (`radarbett.vertho.ai`) shipado para o Bett: tipografia Plus Jakarta Sans + Fraunces escopada, "Agendar conversa" → WhatsApp direto, modo teste com unlock imediato (reverter pós-evento)
- **Votação de competências** (`/dashboard/votacao`, migration 053) com match case+accent insensitive em `actions/votacao.ts` e `actions/fase1.ts::loadTop10`
- **Perfil externo / autosvc** (migration 079) — onboarding piloto sem CSV
- **Vincular Vercel manual**: removido auto-registro em `criarNovaEmpresa` após bug Ibipeba; botão em Branding
- **PPP** suporta múltiplas escolas por empresa (chave de upsert por `nomeEscola`) e .docx via mammoth
- **CSV de colaboradores** importa `area_depto` (+ aliases) e tabela tem ordenação por coluna
- **Danger zone**: exclusão de competências e colaboradores em `/admin/empresas/{id}` + `/admin/lixeira`
- **Auth audit P1+P2**: `lib/auth/action-context.ts` aplicado em ~120 server actions; migration 081 restringe RLS de `diag_analises_ia`
- **ICA benchmarks oficiais MEC** em `lib/radar/ica-benchmarks-oficiais.ts` (Brasil 2025=66%, por UF 2023-2025); painel de qualidade dos dados (migration 082)

### 2026-04-19 — Design System Fase 1
- **Design System**: `docs/DESIGN-SYSTEM.md` com paleta oficial, tipografia, tokens
- **Paleta oficial**: navy `#0F2B54`, cyan `#34C5CC`, purple `#9E4EDD`, lilac `#E1AAEF`, purple-deep `#3B0A6D`
- **Tokens de fase** em `globals.css`: F1-F5 com cores dinâmicas via `data-phase` + `--phase-accent/deep/glow`
- **Fonte Instrument Serif** carregada em `layout.tsx` via `next/font/google` (`--font-serif`)
- **Componentes novos**: `UserAvatar` (monograma serif italic + borda de fase), `ContentThumb` (thumbnails temáticos)
- **Dashboard Home**: hero card com gradiente/glow por fase, `data-phase` propaga tokens CSS
- **PageHero**: eyebrow herda `var(--phase-accent)` em vez de cyan hardcoded

### 2026-04-17 — Segurança e Schema
- **Auth server-side**: 26 actions de dashboard corrigidas — identidade 100% via `getAuthenticatedEmailFromAction()` (cookies SSR)
- **243 testes de segurança** (17 arquivos) — regressão anti-identity-by-parameter
- **Stubs API removidos**: 8 rotas sem auth que retornavam `{status:'ok'}`
- **Schema**: migrations 048-051 (relatorios, capacitacao, unicidade NULL, evidencia_avaliacao)
- **Processo anti-drift**: `docs/SCHEMA-PROCESS.md`
- **Go-live checklist**: `docs/GO-LIVE-CHECKLIST.md`
- **Favicon**: `app/icon.svg` (navy + cyan da marca)
- **Remoção de legado**: `gas-antigo/`, `migrations-legacy/`, `migrate:legacy` script, stubs, compat legada de PDFs

---

**Tempo total estimado por colab**: 14 semanas × ~45 min/semana = ~10h de desenvolvimento ativo.
