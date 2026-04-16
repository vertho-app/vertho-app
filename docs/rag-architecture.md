# RAG / Grounding — arquitetura

## Por que

Até aqui, toda IA respondia só com conhecimento do modelo base. Problemas:

- **Hallucinação**: modelo inventa política da empresa que não existe
- **Sem contexto tenant**: respostas genéricas, sem valores ou glossário do cliente
- **Drift**: mudou regulamento? IA não sabe até retrain

Grounding resolve: antes de responder, IA recebe trechos curados da **base de conhecimento daquela empresa**. Respostas viram **citáveis** e **auditáveis**.

## Estado atual

### Backend
- `migrations/041-knowledge-base.sql` — tabela `knowledge_base` per-tenant (RLS)
  - Coluna `tsv` auto-gerada (tsvector PT-BR, peso A título + B conteúdo)
  - `kb_search(empresa_id, query, limit)` — FTS por `ts_rank`
- `migrations/042-pgvector.sql` — habilita pgvector
  - `embedding VECTOR(1024)` (migration 043; era 1536 em 042) + `embedding_model` + `embedding_at`
  - Índice IVFFLAT cosine
  - `kb_search_semantic(empresa_id, query_emb, limit)` — busca semântica
  - `kb_search_hybrid(empresa_id, query, query_emb, limit, k=60)` — RRF (FTS+vector)

### Retrieval
- `lib/rag.ts`
  - `retrieveContext(empresaId, query, k=5)` — tenta híbrido se embedding ativo, senão FTS
  - `formatGroundingBlock(chunks)` — formata como bloco injetável no prompt
  - `ingestDoc(...)` — best-effort gera embedding em background após insert
  - `listDocs(empresaId)`, `deactivateDoc(empresaId, id)` — admin
- `lib/embeddings.ts`
  - `embedText(t)` / `embedQuery(t)` — provider via `EMBEDDING_PROVIDER` env
  - Suporta `openai` (text-embedding-3-small, 1536d) e `voyage` (voyage-3-large, 1536 output)
  - `none` (default) — desabilita embeddings, retrieval fica em FTS puro

### Ingestão
- `lib/rag-ingest.ts`
  - `parsePdf(buffer)` (pdf-parse), `parseDocx(buffer)` (mammoth), `parseDocument(buffer, hint)`
  - `chunkBySection(text)` — detecta headings + split por max chars com overlap
- `lib/rag-seed.ts`
  - `SEED_TEMPLATE` — 6 docs base (temporada, evidências, tira-dúvidas, régua, modos, privacidade)
  - `seedKnowledgeBase(empresaId)` — idempotente

### Aplicação (grounding ativo)
- `/api/temporada/tira-duvidas` — query = pergunta do colab
- `/api/temporada/reflection` (Evidências socrático e Missão Prática feedback)
  query = competência + descritor + últimas mensagens
- `actions/relatorios.js::gerarRelatorioGestor` + `gerarRelatorioRH` (Plenária)
  query = "valores cultura organizacional políticas..."

### Painel
- `/admin/vertho/knowledge-base` — CRUD + Upload PDF/DOCX/TXT/MD + preview de busca + seed botão

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

- [x] Painel admin `/admin/vertho/knowledge-base` pra RH alimentar
- [x] Seed automático (botão "Popular base inicial")
- [x] Parser de PDF/docx → chunks
- [x] Chunk size calibrado (~3200 chars ≈ 800 tokens com overlap 200)
- [x] Backfill embeddings em rows pré-existentes (`scripts/backfill-embeddings.js`)
- [ ] Pré-warmup do índice IVFFLAT após backfill (REINDEX + ANALYZE) — manual no SQL editor, sugerido ao fim do script
- [ ] Upgrade `lists` no índice IVFFLAT quando passar de 10k rows

## Como ativar embeddings (semântico + híbrido)

A infra está **pronta**. Pra ativar:

### 1. Configurar provider via env
```bash
# .env.local ou Vercel env
EMBEDDING_PROVIDER=voyage   # ou 'openai'
VOYAGE_API_KEY=...          # ou OPENAI_API_KEY se openai
```

| Provider | Modelo | Dim | Custo /1M tokens | Nota |
|---|---|---|---|---|
| OpenAI | `text-embedding-3-small` | 1024 (via `dimensions` param) | $0.02 | Mais barato |
| Voyage | `voyage-3-large` | 1024 nativo | ~$0.18 | Anthropic recomenda |

### 2. Backfill (rows existentes)
```bash
node scripts/backfill-embeddings.js --dry              # checa quantos faltam
node scripts/backfill-embeddings.js                    # roda em todas as empresas
node scripts/backfill-embeddings.js --empresa <uuid>   # só uma empresa
node scripts/backfill-embeddings.js --limit 50         # só 50 rows (teste)
```
Após o backfill, rodar no SQL editor:
```sql
REINDEX INDEX idx_kb_embedding;
ANALYZE knowledge_base;
```
Novos docs criados após ativação ganham embedding automático via `ingestDoc` (background, best-effort).

### 3. Sem mudança em callers
`retrieveContext()` detecta automaticamente se embedding está disponível e usa híbrido (RRF). Se quebrar, cai pra FTS silenciosamente.

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
