# Vertho Mentor IA — Passo a Passo End-to-End

Processo completo do zero até o Evolution Report, intercalando as atividades do **Admin/RH** (preparação + acompanhamento) e do **Colaborador** (jornada de 14 semanas).

---

## Fase 0 — Setup da Empresa e Colaboradores

### 1. Criar empresa
**Admin** · `/admin/dashboard` → botão **"+ Nova Empresa"**
- Preencher: nome, slug (subdomínio), segmento (educacional/corporativo), logo
- A empresa recebe um subdomínio `{slug}.vertho.com.br`

### 2. Cadastrar colaboradores
**Admin** · `/admin/empresas/{id}` → **Fase 0 · Cadastro · Colaboradores & Cargos**
- Adicionar manualmente ou importar planilha
- Cada colab: nome, email, cargo, área/depto, role (colaborador/gestor/rh)

### 3. Cadastrar cargos e competências
**Admin** · `/admin/competencias?empresa={id}`
- Importar CSV com cabeçalho: `nome,cod_comp,pilar,cargo,descricao,cod_desc,nome_curto,descritor_completo,n1_gap,n2_desenvolvimento,n3_meta,n4_referencia`
- **Cada linha = 1 descritor**. Uma competência com 6 descritores → 6 linhas com mesmo `nome` e `nome_curto` diferentes
- A régua n1-n4 é usada na avaliação final (sem 14) para ancorar a pontuação

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

---

## Fase 2 — Avaliação e Trilhas

### 11. IA4 avalia respostas
**Admin** · Fase 2 · **IA4 — Avaliar + Check**
- IA lê respostas do colab e pontua cada competência (nivel_ia4 de 1-4)
- Segundo modelo valida (dual-IA)

### 12. Competências Foco
**Admin** · Fase 2 · **Competências Foco**
- Sistema calcula qual competência cada colab vai desenvolver (menor fit × maior gap)
- Salvo em `trilhas.competencia_foco`

### 13. Assessment inicial de descritores
**Admin** · `/admin/assessment-descritores?empresa={id}`
- Grid colab × descritor da competência foco
- Admin/RH entra nota 1-4 (granularidade 0.1) para cada descritor
- Se deixar vazio, o motor usa default 1.5 (gap moderado)

### 14. Gerar PDI individual (opcional)
**Admin** · Fase 2 · **Relatórios · Gerar PDI**
- Gera PDF individual com diagnóstico e plano de desenvolvimento

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
  1. Busca competência foco (passo 12)
  2. Busca descritores cadastrados (passo 13)
  3. `selectDescriptors` aloca nos 9 slots (sem 1-3, 5-7, 9-11) por gap decrescente; 2 semanas se nota<=1.5
  4. `buildSeason` monta 14 semanas:
     - Conteúdo (9 slots): resolve formato_core conforme prioridade do colab + taxa_conclusao
     - Prática (sem 4, 8, 12): gera missão + cenário em paralelo via Claude
     - Avaliação (sem 13, 14): reservadas
  5. Salva em `trilhas.temporada_plano` (JSONB)
  6. Admin define `trilhas.data_inicio` (DATE) para controlar liberação por calendário

### 17. Admin revisa as temporadas geradas
**Admin** · `/admin/temporadas?empresa={id}`
- Ver cada colab: plano de 14 semanas, descritores selecionados, status
- **Ações por temporada**: Pausar / Retomar / Arquivar / Regerar semana
- **Detalhe**: abre modal com transcripts completos, insights, avaliações IA
- **Simulador**: botão "SIM" roda simulação completa (1 semana/chamada, 4 perfis, Haiku, barra de progresso)

---

## Fase 4 — Jornada do Colaborador (14 semanas)

### 18. Colab acessa sua temporada
**Colaborador** · `/dashboard/temporada`
- Vê timeline com 14 cards (status: concluída/em andamento/bloqueada)
- **Gate duplo**: semana N libera em `data_inicio + (N-1)*7 dias @ 03:00 BRT` **E** anterior concluída
- Helper: `lib/season-engine/week-gating.js`

### 19. Semanas de Conteúdo (sem 1-3, 5-7, 9-11)
**Colaborador** · `/dashboard/temporada/semana/{N}`

**Fluxo de cada semana:**
1. **Conteúdo**: vídeo (Bunny embed) / áudio (player HTML5) / texto/case (markdown)
   - Switch de formato se existem outros disponíveis
   - Vídeo: progresso >80% marca automático como consumido via postMessage
   - Botão **"Marcar como realizado"** como fallback (gate: só libera após clicar link)
2. **Desafio da semana**: 1 micro-ação observável gerada por Claude (card destacado)
3. **Tira-Dúvidas** (NOVO): chat reativo sobre o conteúdo da semana
   - Guard-rail no descritor da semana (não divaga)
   - Modelo: Haiku 4.5
   - Sem limite de turnos, não altera status da semana
   - Persiste em `temporada_semana_progresso.tira_duvidas` JSONB
   - API: `POST /api/temporada/tira-duvidas`
4. **Evidências** (socrática, 6 turnos IA + 6 colab):
   - Turn 1: abertura + pergunta aberta
   - Turn 2: aprofundamento de contexto
   - Turn 3: motivações/decisões
   - Turn 4: aprendizado/percepção
   - Turn 5: integração + pattern
   - Turn 6: fechamento com bullets Desafio / Insight / Compromisso
   - **Tom adaptado ao perfil DISC** do colab
   - **Regra anti-alucinação**: IA não inventa dados do colab
   - **Input por voz** disponível (Web Speech API, botão microfone)
5. Ao finalizar Evidências → próxima semana liberada (respeitando gate calendário)

### 20. Semanas de Prática (sem 4, 8, 12) — Missão Prática
**Colaborador** · `/dashboard/temporada/semana/{4|8|12}`

**Fluxo (substitui cenário escrito como default):**
1. **Missão Prática apresentada**: ação real para executar na semana
   - Colab aceita missão + declara compromisso
   - API: `POST /api/temporada/missao` (set_modo + compromisso)
2. **Execução**: colab executa a missão na vida real durante a semana
3. **Relato**: colab retorna e relata o que aconteceu
4. **Feedback IA** (10 turnos via `prompts/missao-feedback.js`):
   - IA analisa o relato, explora aprendizados, conecta com descritores
5. **Fallback "Não consegui"**: se colab declara que não executou a missão
   - Cai para cenário escrito (feedback analítico, 10 turnos via `prompts/analytic.js`)
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
- **Regra anti-alucinação**
- Ao final, Claude extrai via JSON:
  - `evolucao_percebida[]`: para cada descritor, antes/depois/nivel_percebido
  - `maior_avanco`
  - `ponto_atencao`
  - `microcaso_resposta_qualidade`
- Prompt: `prompts/evolution-qualitative.js`

### 22. Avaliação Acumulada (auto-trigger ao fim da sem 13)
**Sistema** (automático, sem interação do colab)

- Dispara automaticamente quando sem 13 é concluída
- **1a IA** lê 13 semanas e pontua 1-4 por descritor
  - **Cega para nota inicial** (anti-viés de ancoragem)
  - max_tokens 8000
- **2a IA** audita a avaliação (max_tokens 6000)
- Resultado persiste em `temporada_semana_progresso.feedback.acumulado` da sem 13
- Prompt: `prompts/acumulado.js`
- Action: `actions/avaliacao-acumulada.js`

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
  - Ponderação explícita: consistente / divergente cenário superior / divergente cenário inferior
  - Gera **4 notas por descritor**: pré, acumulada, cenário, final
  - `nota_cenario` isolada + `nota_pos` triangulada
- **DISC** usado apenas no tom da devolutiva (não influencia nota)
- **Evolution Report** gerado automaticamente ao concluir

### 24. Temporada Concluída + Evolution Report
**Colaborador** · `/dashboard/temporada/concluida`

- `actions/evolution-report.js` consolida sems 13+14 → `trilhas.evolution_report`
- **Tela com 5 blocos**:
  1. **Hero**: resumo da jornada, competência foco, status geral
  2. **Comparativo por descritor**: nota pré → pós + delta + classificação
  3. **Momentos Insight**: frases marcantes das reflexões semanais
  4. **Missões**: resultado das missões práticas (sem 4/8/12)
  5. **Avaliação Final**: 4 notas por descritor + síntese
- **PDF individual** via `/api/temporada/concluida/pdf` (gerado por `lib/temporada-concluida-pdf.js`)
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
- PDF individual por colab
- Botão **"Equipe"** na top bar (visível para gestor/RH)

### 26. Plenária PDF
**Gestor/RH** · `/api/gestor/plenaria/pdf`

- PDF consolidado do time inteiro
- Gerado por `lib/plenaria-equipe-pdf.js`
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

Todos com back button context-aware.

### 29. Arquivar e iniciar próxima temporada
**Admin** · `/admin/temporadas?empresa={id}` → filtro "Concluídas"
- Arquivar temporadas concluídas (liberam a trilha do colab para nova competência foco)
- `numero_temporada` não infla em regeneração
- Voltar ao passo 12 (nova competência foco) e repetir o ciclo

---

## Loops contínuos (rodam em background)

### Cron diário (5h)
`/api/cron?action=cleanup_sessoes`
- Limpa sessões antigas
- **Recalcula `taxa_conclusao`** de cada micro-conteúdo

### Taxa de conclusão alimenta o A/B testing
- `build-season` ordena conteúdos candidatos por `taxa_conclusao DESC`
- Conteúdos com alta taxa são servidos preferencialmente

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
| Evidências (socrática) | sem 1-3, 5-7, 9-11 | 6 | Claude Sonnet | DISC + anti-alucinação + perguntas abertas |
| Missão Feedback | sem 4, 8, 12 | 10 | Claude Sonnet | IA analisa relato da missão |
| Analítica (fallback) | sem 4, 8, 12 | 10 | Claude Sonnet | alterna pontos fortes ↔ provocações |
| Evolution qualitativa | sem 13 | 12 | Claude Sonnet | 6 etapas, microcaso, DISC |
| Avaliação Acumulada | pós sem 13 | — (single-shot) | Claude Sonnet + auditor | cega p/ nota inicial, max 8000+6000 tok |
| Evolution cenário | sem 14 | — (wizard 4 perguntas) | Claude Sonnet + auditor | triangulação + 4 notas, régua n1-n4 |
| Simulador | admin | 1 sem/chamada | Haiku | 4 perfis comportamentais |

---

**Tempo total estimado por colab**: 14 semanas × ~45 min/semana = ~10h de desenvolvimento ativo.
