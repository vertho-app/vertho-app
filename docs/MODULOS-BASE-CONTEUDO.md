# Módulos-Base de Conteúdo — Spec

> Status: **3 frentes entregues** (1 spec, 2 schema+admin, 3 integração engine).
>
> Última revisão: 2026-05-28.
>
> - Frente 1 (spec): `ce653ee`. Template copy-fill: `0634873`.
> - Frente 2 (schema migration 122 + admin Vertho + IA-as-autor + import docx): `cb921d0`.
> - Frente 3 (engine consome via `lib/season-engine/modulo-base-integration.ts`): este arquivo.

## Pra que serve

Fonte **canônica e versionada** por `(competência × descritor × transição de nível)` que a IA consome como **matéria-prima pedagógica** pra gerar texto/podcast/vídeo (e demais formatos) personalizados por cargo, contexto, DISC e preferência de aprendizagem do colaborador.

**É**: matéria-prima.

**Não é**: régua de maturidade, conteúdo gerado, roteiro final, variação por DISC, rubrica avaliativa, trilha por cargo.

## Escopo

- **Global (canônico)** OU **exclusivo de uma empresa**. `empresa_id` null = canônico (visível a todos os tenants); preenchido = exclusivo do tenant.
- **Competência POLIMÓRFICA** (mig 149): o módulo chaveia por `competencia_base_id` (catálogo canônico `competencias_base`) **OU** `competencia_id` (modelo da própria empresa, tabela `competencias`) — CHECK garante 1 dos 2. Empresas com pilares próprios fora do canônico (ex.: Empreendedorismo) extraem módulos chaveados por `competencia_id`. Ver `project_extracao_modulo_empresa` (memória).
- **i18n nativa** — variantes por locale (`pt-BR`, `pt-PT`, `es-ES`, `en-US`) agrupadas pelo mesmo módulo conceitual (`grupo_id`).
- **Múltiplos variantes** podem coexistir pra mesma transição de nível (engine resolve por score explícito).

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

## Checklist de publicação (absorvido do TEMPLATE em 27/07/2026)

> O `TEMPLATE-MODULO-BASE.md` (321 l) repetia a estrutura dos 4 blocos já especificada acima e
> mandava "copiar este arquivo e renomear pra modulo-<id>-<locale>.md" — fluxo aposentado: hoje o
> módulo nasce pelo **form do admin**, pela **IA-autora** ou pela **extração de material** (ver
> "Caminhos de criação"). O que ele tinha de exclusivo era este checklist, agora aqui.

### Checklist de revisão antes de publicar

Antes de mover de `rascunho` → `revisao`, confira:

- [ ] Cabeçalho completo (competência, descritor, níveis, locale, contexto pedagógico).
- [ ] `nivel_destino > nivel_entrada`.
- [ ] **Bloco 1**: ideia principal cabe em 3-5 linhas e sintetiza o conceito sem perder substância.
- [ ] **Bloco 1**: explicação expandida tem entre 400-1200 palavras e dá matéria-prima pra IA gerar consistentemente.
- [ ] **Bloco 1**: pelo menos 5 princípios, cada um com nome, explicação e implicação prática.
- [ ] **Bloco 1**: síntese executiva entre 5-8 linhas.
- [ ] **Bloco 2**: pelo menos 4 situações típicas (sem cargo específico, salvo se módulo for exclusivo).
- [ ] **Bloco 2**: 5 exemplos universais (simples, intermediário, complexo, inadequado, adequado) sem nomes próprios.
- [ ] **Bloco 2**: pelo menos 4 erros comuns com causa, impacto, correção.
- [ ] **Bloco 2**: repertório de linguagem nas 6 categorias (úteis, perguntas, abertura, condução, fechamento, evitar).
- [ ] **Bloco 2**: pelo menos 4 boas práticas com o quê / por quê / como / evidência.
- [ ] **Bloco 3**: listas de preservar/evitar/pode adaptar/não pode adaptar preenchidas.
- [ ] **Bloco 3**: cuidados éticos e de linguagem específicos do tema.
- [ ] **Bloco 4**: 3 adaptações por formato (texto, podcast, vídeo).
- [ ] Sem nomes próprios reais, sem dados inventados, sem leis/normas/estatísticas fabricadas.
- [ ] Sem diagnóstico psicológico, sem DISC como determinismo.
- [ ] Não escrito como "aula final pro colaborador" — é base de conhecimento pra IA.
- [ ] Não duplica a régua de maturidade — ênfase em conceito, repertório, exemplos, orientações.

Quando todos os checks passarem, mover pra `revisao` e atribuir a outro admin Vertho pra leitura cruzada.


## Workflow de status (Dual-IA)

```
rascunho ──(submit)──→ revisao ──(IA-auditora aprova + humano publica)──→ publicado ──→ obsoleto
                          ↑                  │
                          └─ (reprovado: corrige e re-submete)
```

- **Rascunho** pode ser criado pela IA-autora (`rascunharModuloBase`, `importarModuloDocx`) ou direto por humano.
- **Submeter pra revisão** dispara **automaticamente** a `auditarModuloBase` (IA-auditora, padrão Dual-IA já usado em IA4/Pulso/Cenários do projeto). Não há revisão humana cruzada obrigatória.
- **Modelos do par Dual-IA (default)**: **autora = Claude Sonnet 4.6**, **auditora = GPT-5.4**. Perspectivas diferentes, mesmo padrão de IA4+Check IA4 (Claude+Gemini) e Pulso classifier+auditor.
- A IA-auditora retorna **apenas** a lista de problemas (gravidade alta/média/baixa) + recomendações + confiança. **`veredito` e `nota` são DERIVADOS em código** por `derivarVeredito()` (`lib/modulo-base-auditor.ts`), não pedidos ao modelo. Persistido em `auditoria_ia` JSONB + `auditado_em` + `auditado_por_modelo` + `auditado_em_versao`.
  - Fórmula: `nota = 10 − 2,5×alta − 0,6×média − 0,1×baixa`. Qualquer problema **ALTA** ⇒ teto 4,9 e `reprovado`. Piso 7,0 só quando `validarCorpo` passa (estrutura completa). `aprovado` exige nota ≥ 9,0 e nenhum problema média/alta.
  - **Por quê (09/07/2026):** o modelo violava a própria régua. Reprocessando as 161 auditorias existentes, **7 módulos com problema ALTA tinham saído como `aprovado_com_ressalvas`** — e, como esse veredito é publicável, **3 chegaram a produção**, um deles com invenção factual. A nota, por sua vez, era aritmética pura (a fórmula previa a nota do modelo em 89% dos casos). Derivar em código fechou o vazamento (7 → 0) e custa zero. O palpite do modelo fica em `auditoria_ia.veredito_sugerido_pelo_modelo`, para medir o desvio.
- **Refinar com IA (loop manual, padrão B)**: quando reprovado/ressalvas, o autor humano clica em **"Refinar com IA"** no header → `refinarComFeedback` chama a **autora** de novo com um user prompt enriquecido com o feedback estruturado da auditora (problemas ordenados por gravidade + recomendações + JSON da versão atual). A autora corrige pontualmente, persiste a nova versão (versão+1) e a auditora roda automaticamente sobre o novo conteúdo. Loop dirigido pelo humano — quantas vezes ele quiser. Decisão B (manual) em vez de loop automático A pra dar controle ao autor e economizar IA quando o resultado já tá bom.
- **Reauditar (sem regerar)**: botão secundário pra re-rodar **só a auditora** sobre o conteúdo atual. Útil quando o autor editou os blocos manualmente e quer revalidar.
- **Publicar** exige: `veredito ∈ {aprovado, aprovado_com_ressalvas}` E `auditado_em_versao = versao atual` — é exatamente este gate que o veredito inflado furava (módulo não pode ter sido editado depois da auditoria). Qualquer admin Vertho pode publicar (não há regra de criador-vs-aprovador).
- **Reprovado**: módulo continua em `revisao` com a lista de problemas exposta na UI. Autor pode "Refinar com IA" (loop) ou editar manualmente e "Reauditar".
- **Obsoleto** sai do consumo mas fica no histórico; `substitui_modulo_id` aponta pro sucessor.

> **Por que Dual-IA e não revisão humana cruzada?** O projeto já segue esse padrão em fluxos que precisam de validação rápida e consistente (IA4 + Check IA4, classificador + auditor do Pulso, Cenários + Check Cenário). Substituir revisor humano por IA auditora torna o ciclo mais rápido e elimina o gargalo de "preciso achar outro admin Vertho disponível". A confiança vem de prompts de auditoria rigorosos (preserva, evita, critérios de gravidade) e da humanidade publicando — a IA só gate, não decide.

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
Admin Vertho preenche os campos diretamente no formulário em `/admin/vertho/modulos-base/[id]`. Os campos e os limites de cada bloco estão especificados acima; o checklist de publicação fecha a revisão.

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

### 3. Extração de vídeo/material (segmentação → N módulos)
Porta única em `/admin/vertho/modulos-base/extracao-video` (o botão "Importar .docx" foi APOSENTADO — `importarModuloDocx`/`detectarMetadadosDocx` ficaram dormentes). Aceita **YouTube/Vimeo/TED/LMS** (transcrição) e **PDF/DOCX/TXT** (inclusive livros longos).

1. **Async** via trigger.dev: `submeterMaterialAsync`/`extrairVideo` → tasks `estruturar-material`/`extrair-video`.
2. As tasks rodam a segmentação **IN-TASK** (`segmentarEEstruturarExtracao` em `lib/modulos-base/pipeline.ts`) — NÃO mais via a rota `/api/internal/modulo-from-video` (que tinha o teto de 800s da Vercel; virou wrapper fino). `maxDuration` 1h; caps env `EXTRACAO_MAX_JANELAS`/`EXTRACAO_MAX_SECOES` (default 60/80). Idempotente (não duplica no retry).
3. `criarModulosDeTranscricao` → `segmentarTranscricao` fatia o texto em janelas (map-reduce), a IA-autora (`SYSTEM_AUTOR`) estrutura cada seção nos 4 blocos. **Direcionador** opcional (pilar/competência).
   - **MODO EXCLUSIVO** (quando há direcionador): a extração é restrita ESTRITAMENTE ao escopo — o catálogo oferecido à IA contém SÓ as competências do pilar/competência escolhido (competência fixa a 1; só pilar fixa ao pilar inteiro), os fallbacks que "forçam" competência (re-tentativa sem direcionamento + fallback determinístico) são DESLIGADOS, e trechos fora do escopo são ignorados. Material não aderente → **0 módulos** + status **`vazio`** (mig 151, distinto de `error`/`done`; UI mostra "não aderente · 0 módulos"). Pilar/competência inexistente no catálogo → diag de configuração (não `vazio`).
4. **Escopo empresa**: o segmentador usa o catálogo de competências DA EMPRESA; o **descritor é escolhido da LISTA do modelo** (não texto livre — a IA copia um descritor real; `ancorarDescritor` é a rede de segurança). Módulo aponta p/ `competencia_id`.
5. Saída sempre `status = rascunho` — **já com nota da IA-auditora**: `criarModulosDeTranscricao` auto-audita os módulos criados (lotes de 4, best-effort; desligável por `EXTRACAO_AUTO_AUDITAR=0`). O módulo nasce com `auditoria_ia`/nota visível na lista, sem precisar reauditar à mão.

> O output dos caminhos 2 e 3 é **sempre rascunho** — nunca publica direto. A revisão humana (+ IA-auditora) é obrigatória.

---

## Como o engine consome (resolução)

`resolverModuloBaseParaConteudo(sb, {competenciaNome, descritor, nivelMin, locale, contexto_pedagogico, cargo, empresaId})`:

1. **Resolve a competência pelo NOME** nos DOIS catálogos: canônico (`competencias_base` → `competencia_base_id`) E o modelo da empresa (`competencias` → `competencia_id`, quando há `empresaId`).
2. **Candidatos**: módulos `publicado` em `(competência [base OU empresa], nivel_entrada, nivel_destino, locale)` + escopo (global + exclusivos do tenant). Sem hit no locale → fallback `pt-BR`. Sem nenhum → **fallback completo** pro prompt do engine (backward compatible).
3. **Escolha por SCORE ponderado** (não mais cascata):
   - **RELEVÂNCIA ao descritor da semana** (peso 100): **semântica via embedding** (`descritor_embedding vector(1024)` × `embedQuery(descritor)`, cosseno — pega paráfrase/sinônimo); cai p/ overlap de tokens sem embedding.
   - **EXCLUSIVO do tenant** (30) · **NOTA da IA-auditora** 0–10 (22) · **PREFERIDO** (10, empurrão não trunfo).
   - **FIT POR CARGO** (5, via `contexto_pedagogico`) · **ANTI-REPETIÇÃO** (−25 se o módulo já gerou conteúdo desta competência — `micro_conteudos.modulo_base_id`) · contexto/tags/recência (desempates).
4. Injeta no prompt (system: ideia+princípios+guarda-corpos+adaptação; user: exemplos+repertório+situações+boas práticas). `criterio` logado (ex.: `descritor-semântico(0.63) · exclusivo-do-tenant · nota(8.4) · reuso(penalizado)`).

> DISC e preferências de aprendizagem **continuam vindo do colab** — o módulo-base é DISC-neutro. Embedding gerado na PUBLICAÇÃO (`aprovarPublicar`, `lib/embeddings`, OpenAI text-embedding-3-small, `EMBEDDING_PROVIDER`).

### Cobertura
`/admin/vertho/modulos-base/cobertura` (`coberturaPorDescritor`): matriz competência × descritor do modelo da empresa, mostra quantos módulos por célula (publicados/rascunhos + melhor nota) — pra ver o que falta produzir.

### Reauditoria em lote
A lista (`/admin/vertho/modulos-base`) tem seleção múltipla (checkbox por linha + selecionar-todos) e botão **"Reauditar selecionados (N)"** → `auditarModulosBaseEmLote` (concorrência 4). Útil pra renormalizar notas de módulos antigos depois de recalibrar a auditora, ou auditar um lote recém-extraído de uma vez. A nota de cada módulo aparece na coluna **Nota IA** (cor por faixa; `*` = auditoria de versão anterior).

---

## Delimitações (o que NÃO entra)

- Variações por DISC (módulo é neutro; tom é decidido no gerador).
- Trilhas por cargo (trilha é decidida pelo engine, não pelo módulo).
- Roteiros finais de vídeo/podcast (são saída, não entrada).
- Rubricas avaliativas extensas (a régua de maturidade já cobre).
- Conteúdo por tenant (tenant tem RAG/conteúdos próprios; módulo-base é compartilhado entre todos).

---

## Frentes entregues

- **Frente 1** — spec consolidada (este arquivo; o template copy-fill foi absorvido em 27/07).
- **Frente 2** — migration 122 (`modulos_base_conteudo`, ENUMs, índices, RLS), admin Vertho-only (`/admin/vertho/modulos-base` lista+form, modais "Rascunhar com IA" e "Importar .docx" via `mammoth`), `actions/modulos-base.ts` (CRUD + workflow com bloqueio criador≠aprovador + i18n + `rascunharModuloBase` + `importarModuloDocx`), task `modulo_base_autor` no `ai-tasks`.
- **Frente 3** — integração com o engine via `lib/season-engine/modulo-base-integration.ts`: `actions/conteudos.ts::gerarConteudoIA` resolve módulo publicado e enriquece system+user com seções canônicas. Fallback transparente: sem módulo OU erro no resolver, o engine cai pro comportamento anterior.
- **Frente 4 (23-24/06)** — extração escalada e seleção inteligente:
  - **Extração por modelo da EMPRESA** (mig 149): módulo polimórfico `competencia_base_id`/`competencia_id`; descritor ANCORADO no modelo (IA escolhe da lista).
  - **Botões unificados** (docx aposentado) + **direcionador** (pilar/competência) restaurado.
  - **Segmentação IN-TASK** (trigger, sem teto de 800s da Vercel); caps env; idempotente.
  - **Seleção inteligente** (mig 150): embeddings semânticos + nota da auditoria + anti-repetição (`micro_conteudos.modulo_base_id`) + fit por cargo.
  - **Tela de cobertura** por descritor.
  - **Qualidade**: `SYSTEM_AUTOR` proíbe vazar níveis/maturidade no conteúdo, manda distilar (não copiar forma de aula), calibra linguagem ao público. Levers pendentes: autora em Claude + loop de auto-revisão.
  - Detalhes e estado em `project_extracao_modulo_empresa` (memória).
