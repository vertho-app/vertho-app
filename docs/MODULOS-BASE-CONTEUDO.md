# Módulos-Base de Conteúdo — Spec

> Status: **proposta consolidada** (frente 1 de 3 — frente 2: schema + admin; frente 3: integração com o engine).
>
> Última revisão: 2026-05-28.

## Pra que serve

Fonte **canônica e versionada** por `(competência × descritor × transição de nível)` que a IA consome como **matéria-prima pedagógica** pra gerar texto/podcast/vídeo (e demais formatos) personalizados por cargo, contexto, DISC e preferência de aprendizagem do colaborador.

**É**: matéria-prima.

**Não é**: régua de maturidade, conteúdo gerado, roteiro final, variação por DISC, rubrica avaliativa, trilha por cargo.

## Escopo

- **Platform-level (Vertho)**. Não tem `empresa_id`. Todo módulo publicado é visível a todos os tenants.
- **i18n nativa** desde o início — variantes por locale (`pt-BR`, `pt-PT`, `es-ES`, `en-US`) agrupadas pelo mesmo módulo conceitual (`grupo_id`).
- **Múltiplos variantes pedagógicos** podem coexistir pra mesma transição de nível (engine resolve com critério explícito).

---

## Cabeçalho (Identificação)

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `id` | uuid | sim | PK desta variante de locale |
| `grupo_id` | uuid | sim | identifica o módulo conceitual entre locales (todas as traduções compartilham este id) |
| `locale` | enum | sim | `pt-BR` / `pt-PT` / `es-ES` / `en-US` |
| `competencia_base_id` | uuid | sim | FK → `competencias_base` (catálogo canônico Vertho). **O descritor e os textos da régua (N1-N4) estão embedded na própria linha de `competencias_base`** (colunas `descritor_completo`, `n1_gap`, `n2_desenvolvimento`, `n3_meta`, `n4_referencia`), então o módulo aponta só pra competência — não há tabela separada de descritores. |
| `nivel_entrada` | enum | sim | `N1` / `N2` / `N3` (onde o colab está) |
| `nivel_destino` | enum | sim | `N2` / `N3` / `N4` (aonde queremos levar; `> nivel_entrada`) |
| `titulo` | string ≤ 120 | sim | título interno (não é título do vídeo) |
| `finalidade` | text ≤ 400 | sim | "o que esse módulo precisa permitir que a IA ensine" |
| `contexto_pedagogico` | string ≤ 80 | não | ex.: `educacao-infantil`, `fundamental-1`, `equipe-comercial`, `transversal` |
| `tags` | string[] | não | livre, multi (filtragem auxiliar) |
| `preferido` | bool | sim (default `false`) | flag pro engine escolher entre múltiplos variantes da mesma transição |
| `status` | enum | sim | `rascunho` / `revisao` / `publicado` / `obsoleto` |
| `versao` | int | sim | inteiro crescente; nova versão preserva histórico |
| `substitui_modulo_id` | uuid | não | quando é nova versão de um anterior; cria cadeia auditável |
| `created_by` / `reviewed_by` / `published_by` | text (email) | — | auditoria |
| `created_at` / `updated_at` / `published_at` | timestamptz | — | auditoria |

### Regras

- `(grupo_id, locale)` **único** — cada grupo tem no máximo 1 variante por locale.
- `(competencia_base_id, nivel_entrada, nivel_destino)` **NÃO único** — múltiplos grupos podem coexistir (variantes pedagógicas).
- No máximo 1 variante por grupo com `preferido = true`.
- Status/versão são **por variante de locale** (pt-BR pode estar publicado enquanto en-US é rascunho).
- Cabeçalho conceitual (competência base, níveis) deve continuar **igual entre variantes do mesmo grupo**.

---

## Bloco 1 — Conteúdo central

Ancora o que a IA **não pode perder** ao gerar conteúdo. Vira o `system prompt` do gerador.

```jsonc
{
  "conteudo_central": {
    "ideia_principal": "...",        // markdown, 3-5 linhas (~300-500 chars)
    "explicacao_expandida": "...",   // markdown, 400-1200 palavras
    "principios": [                  // 5-8 itens
      {
        "nome": "...",               // ≤ 60 chars
        "explicacao": "...",         // 1-2 frases
        "implicacao_pratica": "..."  // 1 frase aplicada ao trabalho real
      }
    ],
    "sintese_executiva": "..."       // markdown, 5-8 linhas (~400-600 chars)
  }
}
```

---

## Bloco 2 — Conteúdo aplicável

Matéria-prima reutilizável. Vai no `user prompt` do gerador, **filtrada** pelo `contexto_pedagogico` do tenant + cargo/contexto do colab.

```jsonc
{
  "conteudo_aplicavel": {
    "situacoes_tipicas": [           // 4-6 itens
      {
        "contexto": "...",
        "desafio": "...",
        "risco_comum": "...",
        "boa_abordagem": "..."
      }
    ],
    "exemplos_universais": {         // sem nomes próprios, sem cargo específico
      "simples": "...",
      "intermediario": "...",
      "complexo": "...",
      "aplicacao_inadequada": "...",
      "aplicacao_adequada": "..."
    },
    "erros_comuns": [                // 4-8 itens
      {
        "erro": "...",
        "por_que_acontece": "...",
        "impacto": "...",
        "como_corrigir": "..."
      }
    ],
    "repertorio_linguagem": {
      "frases_uteis": ["..."],
      "perguntas_poderosas": ["..."],
      "abertura": ["..."],
      "conducao_situacao_dificil": ["..."],
      "fechamento_com_compromisso": ["..."],
      "frases_a_evitar": ["..."]
    },
    "boas_praticas": [               // 4-8 itens
      {
        "o_que_fazer": "...",
        "por_que": "...",
        "como_aplicar": "...",
        "evidencia_boa_aplicacao": "..."
      }
    ]
  }
}
```

---

## Bloco 3 — Guarda-corpos pra IA

Define o que é negociável e o que é intocável. Anexado ao `system prompt` de qualquer formato.

```jsonc
{
  "guarda_corpos": {
    "preservar": ["..."],            // conceitos / limites que NÃO podem mudar
    "evitar": ["..."],               // anti-padrões; viram "Nunca..." no prompt
    "pode_adaptar_livremente": [     // ex.:
      "cargo",
      "contexto institucional",
      "formato",
      "tom",
      "exemplos concretos"
    ],
    "nao_pode_adaptar": [            // ex.:
      "conceito central",
      "profundidade pedagógica",
      "princípios",
      "limites éticos"
    ],
    "cuidados_eticos": ["..."],      // ex.: "não fazer diagnóstico psicológico"
    "cuidados_linguagem": ["..."]    // ex.: "não usar DISC como rótulo determinista"
  }
}
```

---

## Bloco 4 — Adaptação por formato

Orientação específica de **como esse módulo deve ser usado** em cada formato suportado.

```jsonc
{
  "adaptacao_por_formato": {
    "texto":           "...",  // texto de apoio: estrutura, profundidade, comprimento sugerido
    "podcast_roteiro": "...",  // roteiro: abertura, narrativa, ganchos, fechamento
    "video_roteiro":   "..."   // roteiro de vídeo: estrutura cena-a-cena, abertura, recursos visuais
  }
}
```

> **Importante**: por hora, apenas 3 formatos têm adaptador específico (`texto`, `podcast_roteiro`, `video_roteiro`). Outros formatos que o engine gera (case, desafio, simulação, perguntas socráticas, missão prática, checklist) **continuam funcionando** consumindo o módulo via Blocos 1+2+3 — só não têm orientação específica de formato neste bloco. Adicionamos novos campos em `adaptacao_por_formato` no futuro se virar prioridade.

---

## Workflow de status

```
rascunho ──(submit)──→ revisao ──(aprovar)──→ publicado ──(nova versão)──→ obsoleto
   ↑                                              │
   └───── (rejeitar / pedir ajuste) ──────────────┘
```

- **Rascunho** pode ser criado pela IA (`rascunharModuloBase`) ou direto por humano.
- **Revisão** é leitura de outro humano da Vertho (Juliane revisa Samuel e vice-versa).
- **Publicado** entra no consumo pelo engine.
- **Obsoleto** sai do consumo mas fica no histórico; `substitui_modulo_id` aponta pro sucessor.
- Apenas admins Vertho podem mover de `revisao` → `publicado`.

---

## i18n — workflow prático

- Quem cria começa por **uma variante** (geralmente pt-BR).
- Pra adicionar outro locale: ação "criar tradução" duplica o módulo do mesmo `grupo_id`, com locale novo, status `rascunho`. A IA pode rascunhar a tradução (usando este spec + variante de origem como referência).
- Quem revisa pode atualizar uma variante **sem mexer nas outras**, mas:
  - Cabeçalho conceitual (competência, descritor, níveis) **deve continuar igual** entre variantes do mesmo grupo (validação no schema).
  - Mudança "conceitual" (princípios, guarda-corpos) numa variante implica **revisar as outras** — UI do admin avisa, não bloqueia.

---

## Caminhos de criação

Um módulo pode ser criado por **3 caminhos**, todos resultam em `status = rascunho`:

### 1. Form web (humano direto)
Admin Vertho preenche os campos diretamente no formulário em `/admin/vertho/modulos-base/[id]`. Usa o template em `TEMPLATE-MODULO-BASE.md` como guia.

### 2. IA-as-autor (rascunho assistido)
Action `rascunharModuloBase({ competencia_base_id, nivel_entrada, nivel_destino, locale, contexto_pedagogico?, modulo_referencia_id? })`:

1. Carrega a competência canônica (`competencias_base`) incluindo descritor + textos da régua (n_entrada → n_destino).
2. Se `modulo_referencia_id` informado (caso de tradução), carrega-o como referência de origem.
3. Manda pro LLM com:
   - este spec como guia,
   - as descrições/régua da competência,
   - amostra de módulos já publicados como exemplos.
4. Saída **validada contra o JSON schema** do corpo (parsing tolerante + 1 retry).
5. Persistido como `status = rascunho` atribuído ao autor logado.
6. Humano abre, edita o que quiser, manda pra revisão.

### 3. Import de `.docx`
Action `importarModuloDocx({ arquivo, competencia_base_id, nivel_entrada, nivel_destino, locale, contexto_pedagogico? })`:

1. Extrai texto do `.docx` usando `mammoth` (converte pra markdown/texto preservando headings e listas).
2. Manda pro LLM **o texto extraído + este spec + a competência canônica de destino**.
3. IA estrutura o conteúdo do docx no JSON dos 4 blocos (mesmo schema da `rascunharModuloBase`). Trata o docx como **fonte de matéria-prima**, não como já-estruturado — porque docs em formato livre raramente respeitam 100% o template.
4. Saída validada e persistida como `status = rascunho`.
5. Anexa preview com aviso de campos não-confiáveis (ex.: "extraído com baixa confiança de [seção X]") pra revisão humana.

> O output dos caminhos 2 e 3 é **sempre rascunho** — nunca publica direto. A revisão humana é obrigatória.

---

## Como o engine consome (resolução)

Pra cada conteúdo a gerar `(colab, semana, competencia_foco, formato, locale)`:

1. **Resolve** módulos-base publicados em `(competencia_base_id, nivel_entrada=N atual do colab, nivel_destino=N+1)`. A `competencia_foco` do colab/semana já aponta pra `competencias_base` (ou faz `competencias.cod_comp ↔ competencias_base.cod_comp`).
2. **Filtra por locale** do colab. Sem hit → fallback pra `pt-BR`.
3. Se nenhum módulo existir mesmo após fallback → **fallback completo** pro prompt atual do engine (backward compatible — nada quebra enquanto módulos vão sendo escritos).
4. Se múltiplos variantes (grupos) sobram, **ordena por**:
   1. `preferido = true` (admin Vertho marcou um como padrão).
   2. Match exato de `contexto_pedagogico` com o contexto institucional do tenant.
   3. Maior interseção de `tags` com o contexto do colab.
   4. `published_at` mais recente (desempate).
5. Injeta no prompt:
   - **System**: `ideia_principal` + `principios` + `guarda_corpos.preservar` + `guarda_corpos.evitar` + `cuidados_eticos` + `cuidados_linguagem`.
   - **User**: `exemplos_universais` + `repertorio_linguagem` + `boas_praticas` (filtrados por contexto) + dados do colab (cargo, DISC, learn_prefs) para adaptação de tom.
   - Se `formato ∈ {texto, podcast_roteiro, video_roteiro}`: anexa `adaptacao_por_formato[formato]` ao system prompt.
6. **Logar telemetria**: qual módulo foi escolhido, por qual critério, qual formato. Permite refinar a heurística depois.

> DISC e preferências de aprendizagem **continuam vindo do colab** — o módulo-base é DISC-neutro.

---

## Delimitações (o que NÃO entra)

- Variações por DISC (módulo é neutro; tom é decidido no gerador).
- Trilhas por cargo (trilha é decidida pelo engine, não pelo módulo).
- Roteiros finais de vídeo/podcast (são saída, não entrada).
- Rubricas avaliativas extensas (a régua de maturidade já cobre).
- Conteúdo por tenant (tenant tem RAG/conteúdos próprios; módulo-base é compartilhado entre todos).

---

## Próximas frentes (depois deste spec)

- **Frente 2 — schema + admin**: tabela `modulos_base_conteudo` (platform-level) + CRUD em `/admin/vertho/modulos-base` + action `rascunharModuloBase`.
- **Frente 3 — integração com o engine**: modificar prompts em `lib/season-engine/prompts/` pra consumir módulo-base quando existir (com fallback ao comportamento atual).
