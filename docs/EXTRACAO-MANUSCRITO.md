# Extração de Manuscrito → Módulos-Base

Pipeline que transforma um manuscrito autoral em DOCX (~150-170 páginas, um por
competência) em Módulos-Base de conteúdo, em lote.

Esta spec **substitui** `PROMPT-EXTRACAO-MANUSCRITO.md`, que foi escrita contra um
modelo mental do banco que não corresponde ao schema real. As divergências estão
listadas no fim, para quem tiver lido a versão anterior.

Status: **pipeline completo, verificado ponta a ponta em produção.** O SED08
(18 módulos) foi importado, auditado e aprovado. Falta dirigir a tela por um
humano — o E2E entrou pelo lado do serviço.

- `lib/manuscrito-parser.ts` — conferido contra SED08 e SED05 (54/54 microblocos
  cada) e contra um DOCX não-manuscrito (falha alto, como deve).
- `lib/modulo-base-autor.ts` / `lib/manuscrito-modulos.ts` — prompt e persistência,
  compartilhados entre a action e a task.
- `actions/manuscrito-batch.ts` — `analisarManuscrito` (preview, zero IA) e
  `enqueueManuscritoBatch`.
- `trigger/gerar-modulos-manuscrito.ts` — 18 chamadas num batch Claude (−50%).

- `app/admin/vertho/modulos-base/importar-manuscrito/page.tsx` — upload, preview
  (matriz descritor × transição) e progresso.
- `lib/modulo-base-auditor.ts` / `lib/modulo-base-refino.ts` — auditoria Dual-IA e
  refino, também em `lib/` pelo mesmo motivo (tasks não importam `'use server'`).

> ⚠️ Tasks do Trigger.dev **não sobem no `git push`**. Depois de deployar a Vercel,
> rodar `npx trigger.dev deploy` manualmente, ou o enqueue falha no dispatch. O
> path `C:\GAS\Vertho App` tem espaço e quebra o CLI — receita robocopy+junction
> na memória do projeto. Task deployada em 09/07, versão `20260709.1` (9 tasks).

---

## 1. A descoberta que define a arquitetura

**O nível de maturidade está codificado no número do microbloco.** Nenhuma IA
precisa separar o conteúdo por nível — a autora já o etiquetou.

Amostra SED08 (Ibipeba), 54 microblocos, 6 descritores:

| Faixa | MBs | Verbo da ação | Coluna da régua |
|---|---|---|---|
| N1 | 1–12 | "Reconhecer o gap" / "Identificar evidências mínimas" | `n1_gap` |
| N2 | 13–24 | "Estruturar rotina" / "Aplicar critério" | `n2_desenvolvimento` |
| N3 | 25–36 | "Conduzir com consistência" / "Aprimorar a prática" | `n3_meta` |
| N4 | 37–48 | "Transformar em referência" / "Transferir método" | `n4_referencia` |
| síntese | 49–54 | "Consolidar em ciclo real" | — (1 por descritor) |

Dentro de uma faixa, os MBs avançam de descritor em descritor:

```
MB          = (faixa−1) × tamanhoFaixa + (descritor−1) × mbsPorFaixa + k
MB(síntese) = 4 × tamanhoFaixa + descritor
tamanhoFaixa = nDescritores × mbsPorFaixa
```

O parser **deriva** `mbsPorFaixa` da contagem (não assume 2) e depois **confere a
numeração inteira** contra a fórmula. Um MB fora do lugar é erro fatal, não aviso:
significa que a convenção mudou, e qualquer fatiamento seria silenciosamente errado.

### 1.1 `mbsPorFaixa` é POR DESCRITOR (14/08)

A fórmula acima descreve o SED08, em que todo descritor recebeu 2 MBs por faixa.
**Isso não é regra**: no DIR08 (Gerenciamento de Conflitos) a autora escreveu 2 por
faixa + síntese em "Postura diante do conflito" (9 MBs) e 1 por faixa sem síntese em
"Acompanhamento" (4) — 9, 8, 5 e 4 no mesmo manuscrito. Cada descritor fecha sozinho
em `(4 faixas × k) [+1 síntese]`, que é a única invariante real; exigir o mesmo `k`
de todos era restrição inventada, e ela **barrava material legítimo** com
"A convenção do manuscrito não é uniforme".

Duas consequências práticas:

- **A faixa sai da posição do MB dentro do SEU descritor**, com `k` próprio. Um
  descritor de 4 MBs mapeia 1→N1, 2→N2, 3→N3, 4→N4; um de 9 mapeia 2 por faixa + síntese.
- **A numeração global vira testemunha independente** e o parser exige que as duas
  leituras concordem: o rank do MB entre todos os de faixa tem de cair na mesma faixa
  que a posição indicou. Sem isso, a atribuição é cega — um MB deslocado viraria
  conteúdo de N3 rotulado como N4, gerando o módulo da transição errada **sem sintoma
  na tela**. Divergência é erro (é construção: há humano para corrigir), com o MB e os
  dois vereditos na mensagem. Testes: `tests/unit/manuscrito-parser.test.ts`
  (validados por mutação — desligar a conferência derruba exatamente os 2 casos).

### 1.2 O código da competência pode divergir do catálogo

O manuscrito se identifica pelo código do material autoral (`DIR08`); a matriz do
tenant pode usar outro (`C007`, em Macaé). `resolverDescritores` aceita `codCompAlvo`
para declarar o mapeamento — **explícito, nunca inferido por semelhança de nome**:
errar aqui grava 24 módulos ancorados na competência errada, e o sintoma só aparece
semanas depois, no conteúdo entregue. O casamento dos descritores em si continua
**por ordem de `cod_desc`**, com o `nome_curto` como conferência (divergência = aviso).
Linhas sem `cod_desc` são ignoradas: são o registro pré-matriz da competência,
preservado porque `respostas.competencia_id` aponta para ele.

## 2. Um módulo = um par de faixas adjacentes + a síntese

A transição N2→N3 precisa do ponto de partida (faixa N2) e do destino (faixa N3).
A faixa do meio é compartilhada por duas transições — o destino de um módulo é o
ponto de partida do seguinte.

```
N1→N2  =  faixa N1 + faixa N2 + síntese   (~64k chars)
N2→N3  =  faixa N2 + faixa N3 + síntese
N3→N4  =  faixa N3 + faixa N4 + síntese
```

**3 transições × 6 descritores = 18 módulos por manuscrito.** Doze competências
(SED01–SED12) = 216 módulos para o cargo.

A síntese entra nas três. Testado por ablação: ela **não** infla a profundidade do
módulo mais básico (princípios saem isomórficos com e sem ela; a distância léxica
para o módulo seguinte não se move). O que ela faz é ancorar o
`exemplos_universais.complexo` no ciclo integrado que a autora escreveu.

### Evidência de que o fatiamento funciona

Sobreposição léxica entre os três módulos de um descritor cresce
monotonicamente com a fonte compartilhada:

| Par | Faixas em comum | Sobreposição |
|---|---|---|
| N1→N2 × N3→N4 | nenhuma | 3,1% |
| N1→N2 × N2→N3 | N2 | 5,1% |
| N2→N3 × N3→N4 | N3 | 7,7% |

Zero princípios repetidos entre módulos (24 princípios, 24 nomes distintos).

---

## 3. Arquitetura

```
Upload DOCX (base64 via server action; 260KB → 0,36MB, cabe no bodySizeLimit)
  │
  1) PARSE — lib/manuscrito-parser.ts          [FEITO]  custo zero, 0 IA
  │    mammoth.extractRawText  → microblocos (regex do cabeçalho)
  │    mammoth.convertToHtml   → tabela de recursos do apêndice
  │    corta a cauda (Síntese/Bibliografia/Apêndice)
  │    valida a numeração; agrupa por descritor; monta as 3 transições
  │
  2) PREVIEW — matriz 6×3 na UI, antes de comprometer custo de IA
  │
  3) AUTHOR — 18 chamadas Sonnet 4.6, em ia_jobs + task Trigger + Batch API
  │    enqueueManuscritoBatch → gerar-modulos-manuscrito → submitClaudeBatch
  │    idempotente por (competência, nivel_entrada, nivel_destino, locale)
  │
  4) AUDIT — auditarModuloBase (GPT-5.4), Dual-IA cross-provider
  │
  5) PERSISTIR em modulos_base_conteudo (status='rascunho')
  │
  6) BÔNUS — recursos do apêndice → micro_conteudos sugeridos
```

### Por que job, e não server action

Medido em produção: **220 segundos por chamada**. 18 × 220s = **66 minutos**.
Não existe versão disso que caiba no teto de uma server action da Vercel.

O molde já existe e é o mesmo formato: `ia_jobs` (mig 172) + `enqueueIA2Batch`
(`actions/ia-pipeline-batch.ts`) + task `gerar-ia2-batch` chamando
`submitClaudeBatch` (`lib/ai-batch.ts`) com fallback síncrono por item. O
progresso da UI é polling de `ia_jobs.progress`, como a tela do IA2 já faz.

---

## 4. O que falta construir

### 4.1 Autoria a partir de fatia — **FEITO**

`modulos_base_conteudo` aceita `competencia_base_id` **ou** `competencia_id`
(polimórfico desde a mig 149). E o núcleo de autoria polimórfico **já existia**:
`estruturarEInserirModulo` (`lib/modulos-base/pipeline.ts`, sem guard) resolve os dois
catálogos via `carregarCompetenciaEmpresa`/`carregarCompetenciaBase`, recebe um
texto-base e insere o rascunho. É o mesmo caminho que a extração de vídeo usa.

Isso importa porque o SED08 **não está no catálogo canônico**: `competencias_base`
tem 24 competências, todas com um único descritor. O SED08 vive em `competencias`,
empresa Secretaria Municipal de Ibipeba/BA, com `cod_desc` de `SED08_D1` a
`SED08_D6` — casando exatamente com os cabeçalhos do manuscrito (6/6, em ordem,
conferido também no SED05).

O que faltava era só o wrapper exportado com guard, hoje
`criarModuloBaseDeManuscrito` (`content.manage`): recebe a competência e a
transição já resolvidas pelo parser, sem detecção nem inferência, e tagueia como
`importado-manuscrito`.

> ⚠️ `estruturarEInserirModulo` é **sem guard de propósito** — por isso vive em
> `lib/`, não num arquivo `'use server'` (onde todo export vira endpoint HTTP
> público e um núcleo sem guard exportado seria um IDOR). O padrão da casa
> (ver `_auditarModuloCore`) é: núcleo em `lib/` sem guard, wrappers exportados
> como actions com `requireAdminAction`.

### 4.2 Termo canônico no prompt — **FEITO, fix validado**

A autora alterna "o técnico" e "o acompanhador" **aleatoriamente**, dentro do mesmo
descritor. Não é um problema do módulo mais avançado; aparece em qualquer transição.

Fix, no bloco `## PÚBLICO` de `montarUserPrompt`:

```
- TERMO CANÔNICO: refira-se ao profissional SEMPRE como "{termo}".
  Não alterne sinônimos (ex.: "acompanhador", "supervisor", "monitor").
```

Medido: `"acompanhador"` cai de 24 ocorrências para 1; `"o técnico"` sobe de 7
para 67. O termo **não está no banco** (`cargo` = "Gestão Educacional", o
manuscrito diz "técnico"; e o próprio SED08 escreve "Gestor Educacional" no
cabeçalho enquanto o SED05 escreve "Gestão Educacional") → é campo do import,
default `comp.cargo`, passado como `termoCanonico`.

### 4.3 Limite do texto-fonte — **FEITO**

`montarUserPrompt` truncava o texto-fonte em 60.000 chars fixos, e as fatias têm
~64.000 — cortava ~7% do fim de **cada** módulo. Agora o limite é parâmetro
(`limiteFonte`), com 80.000 no caminho do manuscrito e 60.000 de default nos
demais.

### 4.4 Job e rastreabilidade — **FEITO, sem tabela nova**

A spec original pedia uma tabela `manuscritos_importados`. Não é preciso: `ia_jobs`
(mig 172) **já nasceu com `fase` aberto a outras fases**, e guarda tudo que aquela
tabela guardaria — `params` (cod_comp, cargo, título, termo canônico, `parse_stats`,
`recursos`, `created_by`), `progress` (done/total/current/resultados), `result_ids`
(módulos criados), `status`, `error`.

Ganho de brinde: o polling da tela é o `statusIAJob`/`cancelIAJob` que
`actions/ia-pipeline-batch.ts` já expõe para o IA2. Nada de clonar.

O DOCX viaja em `params.docxBase64` (~360KB) e a task **re-parseia**. O parser é
determinístico, então re-parsear é mais barato e mais seguro que serializar as 18
fatias de ~65k chars no jsonb. A task **descarta o base64** ao concluir. Nada de
Storage.

### 4.5 UI — `/admin/vertho/modulos-base/importar-manuscrito`

- **Upload**: só `.docx`. Rejeitar PDF ("o print-to-PDF perde a camada de texto").
- **Preview**: stats, avisos, e a **matriz descritor × transição** — que é, de
  graça, um mapa de cobertura do manuscrito. Campo do termo canônico. Botão
  "Gerar 18 Módulos-Base".
- **Progresso**: polling de `ia_jobs.progress`. Ao final, tabela com veredito da
  auditoria e link para cada módulo.

### 4.6 Auditoria Dual-IA — **FEITA, e o gate foi consertado**

A task audita 100% dos módulos gerados (GPT-5.4, ~US$0,10 cada) e promove
`rascunho → revisão` quem recebe veredito. Fica **fora do batch** de propósito:
`submitClaudeBatch` só fala Claude, e ser cross-provider é o ponto do Dual-IA.
Best-effort — falhar ali não invalida o conteúdo, o módulo só fica sem nota.

No caminho, descobrimos que **o veredito estava sendo decidido pelo próprio
modelo, e ele violava a régua**: 7 módulos com problema de gravidade ALTA saíram
como `aprovado_com_ressalvas` (que é publicável), e 3 chegaram a produção. Agora
`nota` e `veredito` são derivados em código a partir dos `problemas`. Ver
`docs/MODULOS-BASE-CONTEUDO.md`.

### 4.7 Bônus: recursos do apêndice

30 recursos curados, com link, extraídos e validados. `formatoDoRecurso()` já mapeia
para o CHECK de `micro_conteudos.formato` (`video|audio|texto|case|pdf`).

Atenção: `micro_conteudos` **não tem coluna `status`** — tem `ativo boolean`. Um
recurso sugerido entra com `ativo = false`.

---

## 5. Custo (medido, não estimado)

Por chamada Sonnet 4.6, com ~65k chars de fonte. Tudo abaixo é **medido**:

| | tokens | custo | fatia |
|---|---|---|---|
| Entrada | 20.351 | $0,061 | 31% |
| Saída (JSON do módulo) | 9.085 | $0,136 | **69%** |
| **Total** | | **$0,197** | |

**Prompt caching não ajuda.** A entrada é ~30% do custo, e as três fatias de um
descritor são disjuntas — não há prefixo literal comum para cachear.

| | Síncrono | Com Batch |
|---|---|---|
| Autoria (18 × Sonnet) | $3,55 | $1,77 |
| Auditoria (18 × GPT-5.4, ~$0,10 cada) | $1,80 | $0,90¹ |
| **Por manuscrito** | **$5,35** | **~$2,67** |
| Cargo inteiro (12 comps, 216 módulos) | ~$64 | **~$32** |

¹ Depende do `submitOpenAIBatch`, ainda não escrito. Hoje a auditoria roda síncrona.

Medido em produção: o SED08 inteiro (18 módulos, autoria em batch + auditoria
síncrona) levou ~10 min de autoria e saiu por ~US$3,60.

As alavancas, em ordem de retorno:

1. **Batch API (−50%) na autoria.** Zero custo de qualidade, e obrigatório de
   qualquer forma pelos 66 minutos.
2. **Faixa fechada no lugar de "Mínimo:"** — *já aplicado*. O prompt terminava com
   *"Mínimo: 5 princípios, 4 situações típicas..."*, e o modelo entregava
   consistentemente ~30% acima (7-9 princípios, 6 erros). Com a faixa fechada a
   saída caiu **15%** (10.684 → 9.085 tokens) sem perda de qualidade. O modelo
   encosta exatamente no teto de cada categoria — lê a faixa como alvo, não como
   limite. Apertar mais é possível, mas não testado.
3. **`submitOpenAIBatch`** — *pendente*. `submitClaudeBatch` só fala Claude; a
   auditoria GPT-5.4 cai no fallback síncrono. Cortaria ~US$0,90 por manuscrito.

Não trocar o Sonnet por Haiku, e **não reduzir a cobertura da auditoria**: ela
custa ~US$1,80 por manuscrito e agora reprova de verdade. Chegamos a implementar
auditoria por amostra e revertemos — estava otimizando o custo de um gate quebrado.

> Esta mudança de prompt é **global**: vale também para a extração de vídeo e para
> `rascunharModuloBase`. Módulos novos saem com 5-6 princípios em vez de 7-9.

Não trocar Sonnet por Haiku: a autora migrou de Gemini Flash para Sonnet 4.6 por
qualidade pedagógica. Economizar $2 num cargo inteiro não paga a regressão.

---

## 6. Pegadinhas

**A cauda.** A regra "o microbloco vai até o próximo cabeçalho ou até o fim do
documento" faz o **último** MB engolir Síntese + Bibliografia + Apêndice: 45.050
chars contra ~13.000 dos outros 53. O parser corta no heading da Síntese.

**`convertToMarkdown` é deprecado no mammoth.** Para os cabeçalhos, `extractRawText`
basta. Para a tabela do apêndice, só `convertToHtml` preserva `<table>`.

**Idempotência.** A chave natural é `(competencia_id, nivel_entrada, nivel_destino,
locale)`. Não há UNIQUE nela — só `(grupo_id, locale)`. Dedup no código, ou índice
parcial.

**`CHECK (nivel_destino > nivel_entrada)`** compara pela ordem do enum, então
permite N1→N4. A regra "sempre 1 nível de diferença" é de negócio; o parser a garante.

---

## 7. Divergências contra `PROMPT-EXTRACAO-MANUSCRITO.md`

| A spec original dizia | Realidade |
|---|---|
| Buscar descritor na tabela `descritores` | **Não existe.** `competencias_base` é 1 linha *por* descritor; a régua está embedded |
| Match manuscrito↔banco por nome/substring/manual | Desnecessário: `WHERE cod_comp='SED08'` devolve as 6 linhas |
| `rascunharModuloBase` já aceita texto de DOCX | Não aceita. Quem aceita é `importarModuloDocx` (órfão da UI) |
| 6 módulos, um por descritor | 18 — o manuscrito cobre as 4 faixas da régua |
| ~$1,40 por manuscrito | $5,42 síncrono / ~$2,35 otimizado |
| `mammoth.convertToMarkdown` | Deprecado. `convertToHtml` |
| Truncar o capítulo em 60k chars | Desnecessário: a fatia por transição tem ~64k. Subir o limite |
| Sequencial na UI, "2-3 min aceitáveis" | 66 minutos. Job + Trigger + Batch |
| "Não usar Batch API na v1" | Batch é o caminho, e paga −50% |
| Nível precisa ser inferido do conteúdo | Está codificado no número do MB |
| FK para `competencias_base(id)` | SED08 vive em `competencias` (Ibipeba) |
