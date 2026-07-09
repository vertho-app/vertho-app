# Development Blueprint — design (Fase 1)

> Fonte única de desenvolvimento por colaborador: um objeto estruturado gerado
> **uma vez**, do qual o **PDI** e a **trilha** são renderizações. Elimina o drift
> residual (mesmo com a Fase 0, PDI e trilha ainda geram conteúdo/ações por
> caminhos separados). Ver memória `project_pdi_trilha_coerencia`.

## Estado atual (pós Fase 0)

- **Coerência de competências** já resolvida: `cargos_empresa.competencias_foco`
  (fonte única, `lib/foco-cargo.ts::focoDoCargo`) é lida pelo PDI
  (`gerarRelatorioIndividual`) e pela trilha (`gerarTemporadaRegularDuo`). Gate:
  foco é obrigatório pro PDI.
- **Ainda separado:** as AÇÕES do PDI (sprint) e o CONTEÚDO/missões da trilha
  são gerados por IAs distintas. Nada garante que a "ação principal" do PDI seja
  a mesma coisa que a missão da semana 4 da trilha. A página "vira trilha" do PDI
  hoje é **computada** (estrutura do modo), não o binding real.

## O que a Fase 1 adiciona

Um passo `gerarBlueprint(colaborador)` que roda **depois do IA4** (assessments
prontos) e **antes de `rel-ind` e `temporadas`**, produz o blueprint e o persiste.
Depois: PDI e trilha **consomem** o blueprint em vez de gerar do zero.

```
IA4 (descriptor_assessments) + foco do cargo
        ↓
  gerarBlueprint  ──►  development_blueprints (jsonb, versionado)
        ↓                         ↓
      PDI (rel-ind)           trilha (temporadas)
   render executivo        semanas/missões/avaliação
   (sprint = objetivos)    (cada semana → ação do PDI)
```

## Schema (adaptado do spec do usuário ao código)

`lib/blueprint/types.ts` — `DevelopmentBlueprint`:

```ts
type DevelopmentBlueprint = {
  spec_version: number;                 // versiona a régua (congela histórico), como scoring
  colaborador: { nome; cargo; contexto; perfil_comportamental? };
  foco_geral: { tese_de_desenvolvimento; mensagem_central; risco_se_nao_desenvolver; impacto_esperado };
  competencias: Array<{
    nome; nivel_atual: 'N1'|'N2'|'N3'|'N4'; prioridade: 'alta'|'media'|'baixa'; leitura;
    descritores_foco: Array<{ id; nome; gap_observado; comportamento_esperado; evidencia_esperada }>;
    // == o SPRINT do PDI sai daqui ==
    objetivos_30_dias: Array<{ id; objetivo; acao_principal; acao_apoio?; evidencia_de_execucao; criterio_de_sucesso; ritual? }>;
    conteudos_recomendados: Array<{ tema; formato_preferencial; objetivo }>;
    missoes_sugeridas: Array<{ semana_sugerida; titulo; descricao; evidencia_a_coletar }>;
  }>;
  trilha: {
    duracao_semanas: 14|10;
    semanas: Array<{
      semana; tipo: 'conteudo'|'missao'|'reflexao'|'avaliacao';
      competencia_foco: string[]; descritores_foco: string[];
      objetivo_da_semana; conexao_com_pdi;        // ← id do objetivo_30_dias que esta semana sustenta
      evidencia_esperada; criterio_de_sucesso;
    }>;
  };
};
```

Regra dura: **toda semana aponta ≥1 `objetivo_30_dias.id`** (`conexao_com_pdi`).

## Storage

Migração nova: `development_blueprints (id, empresa_id, colaborador_id, blueprint jsonb, spec_version int, gerado_em timestamptz)`, RLS service-role-only (como `ia_jobs`). Multi-tenant por `empresa_id` + `tenantDb`. Latest por colaborador.

## Consumo

- **PDI** (`gerarRelatorioIndividual`): deixa de gerar as ações por conta própria.
  O `sprint` de cada competência = `objetivos_30_dias` do blueprint; a página
  "vira trilha" passa a mostrar o **binding real** (`trilha.semanas[].conexao_com_pdi`),
  não a timeline computada. Mantém uma passada leve de humanização (acolhimento/tom).
- **Trilha** (`gerarTemporada`/`buildSeason`): consome `blueprint.trilha.semanas`
  (competências, descritores, missões, objetivo por semana) em vez de rodar
  `selectDescriptorsDuo` do zero. Cada semana carrega a `acao_pdi_relacionada`.

## Auditoria de coerência (2ª IA)

`auditarBlueprint(blueprint, pdi, trilha)` — checklist do usuário: toda ação do
PDI aparece na trilha? semana fora das foco? conteúdo que não serve a uma ação?
missão coleta evidência do descritor certo? exigência compatível com N1? cenário
final mede o que o PDI prometeu? Falhou → marca drift (e, opcionalmente, re-gera).

## Rollout em estágios (cada um = 1 commit, do menor risco ao maior)

- **Estágio 1 — Fundação (baixo risco, aditivo):** `types.ts` + migração
  `development_blueprints` + `gerarBlueprint` (IA, de foco+assessments+DISC) +
  estágio `blueprint` no runner do pipeline + tela/JSON de inspeção. PDI e trilha
  **não mudam ainda**. Entregável: blueprints gerados, salvos e inspecionáveis.
- **Estágio 2 — PDI consome:** `rel-ind` deriva o sprint + o binding "vira trilha"
  do blueprint. Fallback: sem blueprint → comportamento atual (backward-compat).
- **Estágio 3 — Trilha consome (maior risco, motor maduro) — ✅ FEITO (atrás de flag):**
  Atrás da flag `BLUEPRINT_DRIVES_TRILHA=1`, `gerarTemporadaRegularDuo` lê o
  blueprint (`development_blueprints` via `tdb`) e o adapter puro
  `lib/blueprint/to-descriptors.ts::blueprintToTrilhaInputs` converte
  `blueprint.trilha.semanas` em `SelectedDescriptor[]` (semanas_ids das semanas de
  conteúdo do config) + `bindingPorSemana` (objetivo + ação do PDI por semana). O
  `buildSeason` ganhou um caminho ADITIVO de "semana de conteúdo do blueprint"
  (renderiza N entregas dos `descritores_foco` na ordem SEQUENCIAL do blueprint —
  comp A → comp B → integra, 2 descritores/semana da mesma comp inclusive) e
  carimba o binding do PDI em TODA semana (tipos: `SemanaPlan & BlueprintBindingSemana`).
  O `ProgramaConfig` segue autoritativo sobre missão/avaliação (protege
  fechamento/arguição/scoring). Match de descritor é TOLERANTE (tira prefixo
  `CÓDIGO —` + acentos; emite o nome do assessment pra busca de `micro_conteudos`
  seguir idêntica). Sem blueprint / adapter não-aproveitável / flag off → fallback
  `selectDescriptorsDuo` (byte-igual ao paralelo atual). Validado E2E na Elizângela
  (Ibipeba): 14 sem, missões 4/8/12 e avaliação 13/14 intactas, binding em todas,
  9/9 semanas de conteúdo com 2 entregas, estrutura sequencial honrada; flag off
  reproduz o paralelo sem binding. **Flag resolvida por env `BLUEPRINT_DRIVES_TRILHA=1`
  (global) OU `empresas.sys_config.blueprint_drives_trilha === true` (por empresa,
  p/ piloto)** — toggle na tela de Configurações da empresa (aba Programa). Ainda
  OFF por padrão. A UI da trilha já exibe o binding (Frente A, ver abaixo).
- **Estágio 4 — Auditoria — ✅ FEITO (auditarBlueprint):** `lib/blueprint/audit.ts`
  (puro) = camada ESTRUTURAL (6 checks determinísticos por PRESENÇA nominal: toda
  ação do PDI sustentada? refs de objetivo existem? semana órfã? fora do foco?
  calendário bate? carga N1≤2?) + camada SEMÂNTICA (2ª IA adversarial: a trilha
  cobre o que promete? missão coleta a evidência certa? exigência cabe em N1? a
  avaliação mede o prometido? genérico? tom clínico?). `actions/blueprint.ts::
  auditarBlueprint` orquestra (estrutural + IA → `montarRelatorioAuditoria` com
  drift/score) e PERSISTE em `development_blueprints.auditoria/auditado_em`
  (mig 176). Lote `auditarBlueprintsLote` + botão "Auditar Blueprint" no runner
  (grupo Relatórios). `drift` = ≥1 `fail`; score = (pass + 0,5·warn)/total. Falha
  da 2ª IA não derruba a auditoria (estrutural sozinho vale). Validado na Elizângela:
  6/6 estrutural pass, 6 warns semânticos concretos (ex.: descritor "Limites
  profissionais" sem missão que colete a evidência; avaliação 13/14 com descritor
  da competência ERRADA; densidade de linguagem clínica), score 75, drift=false.
- **Estágio 4b (pendente) — PDI 2 níveis:** separar PDI **executivo** (humano) do
  **estruturado** (o blueprint, pra engine). Não iniciado.

## Frente A — UI da trilha exibe o binding do PDI (✅ FEITO)

A metade que faltava do Estágio 3: o binding (`objetivo_da_semana`/`conexao_com_pdi`/
`acao_pdi`) já ia no `temporada_plano`, mas o render da trilha não mostrava. A tela de
detalhe da semana (`app/dashboard/temporada/semana/[week]/page.tsx`) ganhou um bloco
"NO SEU PDI" (objetivo da semana + "Esta semana sustenta: <ação>"), só quando
`semana.acao_pdi` existe (backward-compat). i18n `SeasonWeek.pdi.*`. Verificado ao
vivo em prod. Timeline mantida limpa (todas as semanas bindam → selo em todas = ruído).

## Refinamentos pós-piloto Ibipeba (09/07)

- **Prompt do gerador endurecido** (`lib/blueprint/prompt.ts`): anti-clínico FORTE
  (lista de termos proibidos — "esgotamento/sobrecarga/regulação emocional/bem-estar"
  — + reformular p/ prática de trabalho); semanas de avaliação medem UMA competência
  (13→comp1, 14→comp2) com descritores/evidência do próprio blueprint e evidência
  OBSERVÁVEL (não autoavaliação/portfólio); N1 integra COM ANDAIME; anti-genérico
  (ação cita artefato/rotina do cargo).
- **Auditoria calibrada** (`lib/blueprint/audit.ts`): `tom-saude` julga o TEXTO
  AUTORAL, NÃO os NOMES de competência/descritor (vêm do modelo — o blueprint não os
  escolheu; ex.: "Autocuidado e resiliência emocional" é clínico mas não é culpa do
  blueprint) + reserva warn/fail p/ problema real. **Lição: auditar só o que o
  gerador CONTROLA (texto), não o INPUT (nomes).** Efeito medido: drift 8→0, score
  74→87 nos casos-problema.
- **PDI — sprint por ciclo + teoria:** "Plano de 30 dias" → **"Seu plano, ciclo a
  ciclo"** (o "30 dias" global conflitava com 14 sem sequenciais → cada competência
  mostra sua janela real "Ciclo N · Semanas X-Y", derivada do `trilha_mapa` excluindo
  a avaliação). Página "vira trilha" passou a mostrar **APRENDE** (temas de
  `conteudos_recomendados` do blueprint) + **PRÁTICA** (missão) por ciclo — o ritmo
  aprende→aplica. Novo campo persistido `conteudo.blueprint_conteudos`.
- **Fix storage do PDF:** slug do nome de arquivo vira ASCII (NFD + tira acento) —
  nome com acento quebrava o upload (`Invalid key` → `pdf_path` null), bloqueando a
  maioria dos nomes BR.

## Gating (segurança)

Cada export de `actions/blueprint.ts` e `actions/relatorios.ts` é um endpoint HTTP
(`'use server'`) → **nenhum aceita flag de bypass** (`internal`); o gate
`ai.audit.regenerate` roda sempre. Os LOTES aplicam o gate uma vez e chamam o núcleo
privado (`gerarBlueprintCore`/`auditarBlueprintCore` em `lib/blueprint/core`), que
revalida o tenant por colaborador (defesa em profundidade). NÃO recriar caminhos
`internal` sem gate (foram removidos de propósito). Geração headless por script usa
o caminho gated (rodar no app) ou o núcleo, não um bypass.

## Piloto Ibipeba — status (09/07)

- **37/37 blueprints** gerados + auditados com o prompt novo: **0 drift, score médio
  88** (8×92, 23×88, 6×83). Estrutura 100% pass.
- **1 PDI regenerado** (Elizângela, consumindo o blueprint, com sprint-por-ciclo +
  teoria) — exemplo verificado. **Os outros 36 PDIs ainda são pré-blueprint** (de
  08/07, sem `trilha_mapa`) → regenerar.
- **Falta pro go-live:** (2) regenerar os 36 PDIs; (3) ligar o toggle da Ibipeba
  (Config→Programa OU `sys_config.blueprint_drives_trilha=true`); (4) gerar as 37
  trilhas (flag só vale pra próxima geração). Não há trilha ativa (só a da Elizângela,
  0 progresso) → baixo risco. Decisão de produto do dono.

## Backward-compat / risco

Tudo aditivo: sem blueprint, PDI e trilha seguem como na Fase 0. O gate de foco
já garante o pré-requisito. O maior risco é o Estágio 3 (rewire do motor de
trilha) — fazer com validação E2E antes de ligar por padrão. `spec_version`
versiona o blueprint (congela histórico), como no scoring.
