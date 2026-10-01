# RAG / Grounding — arquitetura

O grounding busca trechos da `knowledge_base` da empresa antes de chamar a IA. O modelo recebe o material no bloco `Contexto da empresa`, com instrução de usá-lo apenas quando relevante.

## Consumidores

- `app/api/temporada/tira-duvidas/route.ts`: consulta com a pergunta do colaborador, até cinco trechos.
- `app/api/temporada/reflection/route.ts`: Evidências socráticas e feedback da Missão Prática; consulta estável com competência e descritor, até quatro trechos.
- O painel `/admin/vertho/knowledge-base` permite CRUD, upload, seed e preview da busca.

O embedding também serve à seleção de módulos-base em `lib/season-engine/modulo-base-integration.ts`. Esse caminho calcula cosseno sobre descritor e título, preservando a prioridade do nome idêntico, escopo de empresa/cargo e demais critérios pedagógicos. Não passa pela `knowledge_base` nem pelas RPCs de RAG.

## Busca e isolamento

`lib/rag.ts::retrieveContext(empresaId, query, k)` exige empresa, limita a consulta a 500 caracteres e tenta combinar FTS em português com similaridade vetorial por Reciprocal Rank Fusion (RRF). Falhas de embeddings ou da RPC caem para `kb_search` (FTS), com log. Sem resultados, o bloco de contexto fica vazio.

O backend usa service-role: a autenticação nas rotas e o filtro explícito `p_empresa_id` em **ambas** as buscas SQL são necessários. As funções são `SECURITY INVOKER`. A RPC nova só concede execução a `service_role`; RLS e permissões das funções anteriores permanecem.

São recuperados até três vezes os candidatos necessários, limitados a 30, e depois retornados até `k` trechos. Fragmentos de índice contendo apenas título, nível e código de módulo, ou capa de manuscrito, são descartados. Não há regra geral de tamanho mínimo: uma instrução curta pode oferecer contexto útil.

## Modelos e migração Voyage 4

`lib/embeddings.ts` usa `EMBEDDING_PROVIDER=voyage|openai|none`; o padrão sem configuração é `none`. Voyage usa `voyage-4-large` e OpenAI usa `text-embedding-3-small`, ambos com saída de 1024 dimensões. Voyage diferencia `input_type=document` e `query`. O cache de documentos inclui modelo e texto, para não reutilizar um vetor de outra geração.

Voyage 3 e Voyage 4 têm espaços vetoriais incompatíveis, apesar da mesma dimensão. A migration `272-voyage-4-hybrid.sql` mantém dois acervos:

| Acervo | Colunas de vetor e metadados | Consulta |
|---|---|---|
| KB legado | `embedding`, `embedding_model`, `embedding_at` | `kb_search_hybrid` |
| KB Voyage 4 | `embedding_v4`, `embedding_v4_model`, `embedding_v4_at` | `kb_search_hybrid_v4` |
| Módulos legado Voyage 3 | `descritor_embedding` | query Voyage 3 |
| Módulos Voyage 4 | `descritor_embedding_v4`, `descritor_embedding_v4_model`, `descritor_embedding_v4_at` | query Voyage 4 |

A RPC nova filtra o modelo `voyage/voyage-4-large`. O resolver de módulos só usa vetores da geração da query, com dimensões iguais; caso faltem, mantém match exato e tokens. A migration também corrige a ambiguidade de `id`/`score` que fazia a RPC legada falhar e cair para FTS.

O índice novo é HNSW com cosine. O pgvector 0.8 permite busca iterativa para preencher os candidatos após filtrar a empresa. A função habilita `hnsw.iterative_scan=strict_order`. Os dados atuais são pequenos; medir plano e recall antes de ajustar parâmetros para bases maiores.

Ao editar título/conteúdo da KB ou título/descritor do módulo, triggers invalidam o vetor Voyage 4, inclusive quando o escritor é uma release antiga. Ingestão e publicação geram os novos vetores sem bloquear a criação/publicação. A gravação compara a fonte/versão para evitar aplicar um embedding a conteúdo que mudou durante a chamada à API.

### Operação e rollback

1. Aplicar a migration via `scripts/apply-migration.mjs`, depois de salvar backup.
2. Preparar e preencher os vetores novos sem sobrescrever os antigos.
3. Validar recuperação e isolamento no banco; publicar web e workers que empacotam a biblioteca.

Rollback: publicar a release anterior ou configurar `VOYAGE_EMBEDDING_MODEL=voyage-3-large` e redeployar os consumidores. Os vetores antigos continuam disponíveis; manter as colunas novas e a correção da RPC legada. Conteúdo criado só com Voyage 4 pode exigir backfill legado se o rollback precisar de cobertura semântica completa.

Backfill de pendências da KB:

```sh
npm run backfill:embeddings -- --dry
npm run backfill:embeddings -- --empresa <uuid> --limit 50
```

O script em TypeScript faz paginação, salva backup local em `backups/` antes de escrever e atualiza somente fontes ainda iguais e sem vetor. `--dry` não chama a API. Para módulos, a publicação em `lib/modulos-base/publicar.ts` gera o embedding.

## Ingestão

`lib/rag-ingest.ts` extrai PDF/DOCX/texto e separa por seção com tamanho máximo e overlap. `lib/rag-seed.ts` popula documentos iniciais de forma idempotente. `ingestDoc` insere o documento e tenta gerar o embedding em background; falhas mantêm o documento elegível ao FTS.

## Avaliação e reranker

O experimento de 01/10/2026 comparou 516 trechos e 48 consultas autoradas. No rótulo amplo de capítulo/conteúdo, a precisão nos cinco primeiros foi 81,7% com Voyage 3 e 86,7% com Voyage 4. Após remover trechos curtos no experimento, Voyage 4 chegou a 88,8%; adicionar `rerank-3-lite` resultou em 89,2%, com cerca de 400 ms adicionais. A amostra não demonstrou ganho estatístico conclusivo e não avalia as respostas finais da IA. Dados dos tenants e resultados detalhados ficam fora do repositório público.

O reranker permanece desativado. Não há chamada adicional de reranking no fluxo de produção. Reavaliar com perguntas reais e rótulos de resposta antes de adicioná-lo.

Preços publicados na avaliação: Voyage 4 large US$ 0,12/1 milhão de tokens; Voyage 3 large US$ 0,18. Fontes: [embeddings Voyage](https://docs.voyageai.com/docs/embeddings), [preços](https://docs.voyageai.com/docs/pricing), [pgvector](https://github.com/pgvector/pgvector).
