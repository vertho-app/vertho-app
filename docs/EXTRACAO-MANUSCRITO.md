# Extração de Manuscrito → Módulos-Base

Pipeline que transforma um manuscrito autoral em DOCX (~150-170 páginas, um por
competência) em Módulos-Base de conteúdo, em lote.

Esta spec **substitui** `PROMPT-EXTRACAO-MANUSCRITO.md`, que foi escrita contra um
modelo mental do banco que não corresponde ao schema real. As divergências estão
listadas no fim, para quem tiver lido a versão anterior.

Status: **Fase 1 (parser) pronta e validada** — `lib/manuscrito-parser.ts`.
Fases 2-4 pendentes.

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
  │    reusa montarUserPrompt(comp, ne, nd, ..., textoFonte)
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

### 4.1 Caminho polimórfico na autoria — **bloqueante**

`modulos_base_conteudo` aceita `competencia_base_id` **ou** `competencia_id`
(polimórfico desde a mig 149). Mas `rascunharModuloBase` e `importarModuloDocx`
(`actions/modulos-base.ts`) **só aceitam `competencia_base_id`**.

Isso bloqueia o SED08, que **não está no catálogo canônico**: `competencias_base`
tem 24 competências, todas com um único descritor. O SED08 vive em `competencias`,
empresa Secretaria Municipal de Ibipeba/BA, com `cod_desc` de `SED08_D1` a
`SED08_D6` — casando exatamente com os cabeçalhos do manuscrito.

Extrair um `_rascunharComTextoCore(sb, { competencia, ne, nd, textoFonte, ... })`
sem guard, no mesmo padrão que `_auditarModuloCore` já usa, e resolver a
competência via `carregarCompetenciaDoModulo` (que já é polimórfica).

### 4.2 Termo canônico no prompt — **defeito real, fix validado**

A autora alterna "o técnico" e "o acompanhador" **aleatoriamente**, dentro do mesmo
descritor. Não é um problema do módulo mais avançado; aparece em qualquer transição.

Fix, no bloco `## PÚBLICO` de `montarUserPrompt`:

```
- TERMO CANÔNICO: refira-se ao profissional SEMPRE como "{termo}".
  Não alterne sinônimos (ex.: "acompanhador", "supervisor", "monitor").
```

Medido: `"acompanhador"` cai de 24 ocorrências para 1; `"o técnico"` sobe de 7
para 67. O termo **não está no banco** (`cargo` = "Gestão Educacional", o
manuscrito diz "técnico") → vira campo do import, default `comp.cargo`.

### 4.3 Slice de 60k chars

`montarUserPrompt:653` trunca o texto-fonte em 60.000 chars. As fatias têm
~64.000. Corta ~7% do fim de **cada** módulo. Parametrizar o limite.

### 4.4 Tabela `manuscritos_importados`

Log de rastreabilidade. **FK para `competencias(id)`, não `competencias_base(id)`**
(ou só `cod_comp text` + `empresa_id`). Guarda `parse_stats`, `descritores_detectados`,
`modulos_gerados`, `recursos_extraidos`, `status`, `created_by`.

Não precisa de Storage: o DOCX é processado on-the-fly.

### 4.5 UI — `/admin/vertho/modulos-base/importar-manuscrito`

- **Upload**: só `.docx`. Rejeitar PDF ("o print-to-PDF perde a camada de texto").
- **Preview**: stats, avisos, e a **matriz descritor × transição** — que é, de
  graça, um mapa de cobertura do manuscrito. Campo do termo canônico. Botão
  "Gerar 18 Módulos-Base".
- **Progresso**: polling de `ia_jobs.progress`. Ao final, tabela com veredito da
  auditoria e link para cada módulo.

### 4.6 Bônus: recursos do apêndice

30 recursos curados, com link, extraídos e validados. `formatoDoRecurso()` já mapeia
para o CHECK de `micro_conteudos.formato` (`video|audio|texto|case|pdf`).

Atenção: `micro_conteudos` **não tem coluna `status`** — tem `ativo boolean`. Um
recurso sugerido entra com `ativo = false`.

---

## 5. Custo (medido, não estimado)

Por chamada Sonnet 4.6, com 65k chars de fonte:

| | tokens | custo | fatia |
|---|---|---|---|
| Entrada | 20.391 | $0,061 | 28% |
| Saída (JSON do módulo) | 10.684 | $0,160 | **72%** |
| **Total** | | **$0,222** | |

**Prompt caching não ajuda.** A entrada é 28% do custo, e as três fatias de um
descritor são disjuntas — não há prefixo literal comum para cachear.

| | Síncrono | Otimizado |
|---|---|---|
| Autoria (18 × Sonnet) | $3,99 | $1,63 |
| Auditoria (18 × GPT-5.4) | $1,44 | $0,72 |
| **Por manuscrito** | **$5,42** | **~$2,35** |
| Cargo inteiro (12 comps, 216 módulos) | ~$65 | **~$28** |

As três alavancas, em ordem de retorno:

1. **Batch API (−50%) na autoria.** Zero custo de qualidade, e obrigatório de
   qualquer forma pelos 66 minutos.
2. **Faixa fechada no lugar de "Mínimo:".** O prompt termina com *"Mínimo: 5
   princípios, 4 situações típicas, 4 erros comuns, 4 boas práticas"* — e o modelo
   entrega consistentemente ~30% acima (7-9 princípios, 6 erros). Trocar por "5 a 6
   princípios" corta ~20% da saída.
3. **`submitOpenAIBatch`.** `submitClaudeBatch` só fala Claude; a auditoria
   GPT-5.4 cai no fallback síncrono.

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
