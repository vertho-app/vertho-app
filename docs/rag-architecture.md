# RAG / Grounding — arquitetura

## Por que

Até aqui, toda IA respondia só com conhecimento do modelo base. Problemas:

- **Hallucinação**: modelo inventa política da empresa que não existe
- **Sem contexto tenant**: respostas genéricas, sem valores ou glossário do cliente
- **Drift**: mudou regulamento? IA não sabe até retrain

Grounding resolve: antes de responder, IA recebe trechos curados da **base de conhecimento daquela empresa**. Respostas viram **citáveis** e **auditáveis**.

## Estado atual (MVP)

### Backend
- `migrations/041-knowledge-base.sql` — tabela `knowledge_base` per-tenant (RLS)
- Coluna `tsv` auto-gerada (tsvector PT-BR, peso A título + B conteúdo)
- Função SQL `kb_search(empresa_id, query, limit)` retorna top-k por `ts_rank`

### Retrieval
- `lib/rag.js`
  - `retrieveContext(empresaId, query, k=5)` — chama `kb_search`
  - `formatGroundingBlock(chunks)` — formata como bloco injetável no prompt
  - `ingestDoc({ empresaId, titulo, conteudo, categoria })` — admin adiciona
  - `listDocs(empresaId)` — painel lista
  - `deactivateDoc(empresaId, id)` — soft delete

### Aplicação
- `/api/temporada/tira-duvidas` — busca trechos, injeta em `## Contexto da empresa`
- Prompt instrui: "use APENAS se relevante, cite brevemente o título"
- Falha silenciosa: se retrieval quebra, segue sem grounding (melhor do que bloquear)

## Fluxo de uma pergunta (tira-dúvidas)

```
colab manda pergunta
   │
   ▼
route descobre empresa_id do colab
   │
   ▼
retrieveContext(empresaId, pergunta, 5)
   │
   ▼ SQL: kb_search
   │
   ▼ top-5 chunks ranqueados por FTS
   │
   ▼
formatGroundingBlock → "## Contexto da empresa\n### Regulamento\n..."
   │
   ▼
promptTiraDuvidas injeta no system
   │
   ▼
Claude responde usando DESCRITOR + CONTEXTO da empresa
```

## Isolamento per-tenant

**Invariante crítico**: `retrieveContext` exige `empresaId`. Sem default, sem fallback global. Se alguém chamar sem passar → throw.

RLS + function `kb_search` (SECURITY DEFINER, mas filtra por `p_empresa_id` explícito) garantem que nenhum conteúdo de tenant A vaza pra tenant B.

## Como popular a base (hoje — manual)

```sql
INSERT INTO knowledge_base (empresa_id, titulo, conteudo, categoria)
VALUES (
  '<uuid-empresa>',
  'Banco de horas',
  'Saldo máximo 40h. Compensação em até 6 meses. Horas noturnas contam 20% a mais.',
  'regulamento'
);
```

## TODO curto prazo

- [ ] Painel admin `/admin/vertho/knowledge-base` pra RH alimentar
- [ ] Seed automático em empresa nova (values, glossário, FAQ base)
- [ ] Parser de PDF/docx → chunks (80% dos docs empresa estão em PDF)
- [ ] Chunk size calibrado (500-800 tokens? testar recall)

## Upgrade path: semântico (pgvector)

FTS funciona pra match lexical. Perde em sinônimos, paráfrases e multilíngue. Upgrade:

### 1. Instalar pgvector
```sql
CREATE EXTENSION vector;
ALTER TABLE knowledge_base ADD COLUMN embedding VECTOR(1536);
CREATE INDEX idx_kb_embedding ON knowledge_base
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### 2. Escolher provider
| Provider | Dim | Custo /1M tokens | Nota |
|---|---|---|---|
| Voyage AI (`voyage-3`) | 1024 | $0.06 | Anthropic recomenda |
| OpenAI (`text-embedding-3-small`) | 1536 | $0.02 | Mais barato |
| Cohere (`embed-multilingual-v3`) | 1024 | $0.10 | Forte em PT-BR |

### 3. Backfill + gerar em insert
```js
// lib/embeddings.js (TODO)
export async function embedText(text) { ... }

// Em ingestDoc:
const emb = await embedText(titulo + '\n' + conteudo);
await sb.from('knowledge_base').insert({ ..., embedding: emb });
```

### 4. Mudar `kb_search`
Substituir `ts_rank` por `embedding <=> query_embedding` (cosine distance). `lib/rag.js` não precisa mudar — mesma assinatura.

### 5. Híbrido (ideal)
Combinar FTS + vector (ex: RRF — Reciprocal Rank Fusion). Pega o melhor dos dois.

## Pitfalls conhecidos

- **Chunking ruim**: se o doc inteiro vira 1 row, FTS perde precisão. Quebrar por seção/parágrafo (TODO)
- **Query curta**: "banco de horas?" → FTS PT-BR tem stemmer mas perde stopwords. Normal.
- **Sem results**: prompt diz "IGNORE contexto se não relevante" — modelo lida bem
- **Cache**: Claude prompt caching do system NÃO ajuda aqui porque o grounding muda a cada request. Caching só atinge parte fixa do system (as 7 seções de regras). ~80% hit.

## Aplicações futuras (mesma API)

Plug-and-play em qualquer prompt que beneficie de contexto da empresa:

- Evidências (prompt socrático) — citar valores da empresa ao comparar comportamento
- Missão Prática (cenário escrito) — gerar cenários que usem linguagem/cultura interna
- Plenária do gestor — sugerir falas alinhadas com comunicação interna
- Tira-Dúvidas (atual) ✅

Padrão: sempre `retrieveContext(empresaId, <query contextual>, k)` + `formatGroundingBlock(chunks)` injetado no system.
