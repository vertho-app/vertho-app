# Radar Vertho — README operacional

Plataforma pública (`radar.vertho.ai`) que organiza indicadores oficiais
do INEP por escola e município, com leitura contextualizada por IA e
captação de leads via PDF.

Spec: `Vertho_Radar_Spec_v2_2.docx` · Decisões: `decisions.md`.

---

## TL;DR

- **Pra você**: `app.vertho.ai/admin/radar` (ingestão), `app.vertho.ai/admin/radar/funnel` (analytics)
- **Pro público**: `radar.vertho.ai` (busca, escola, município, estado, comparar, metodologia)
- **Stack**: Next 16 + Supabase + Claude Sonnet 4.6 + QStash + Resend, tudo no monorepo
- **V1 piloto**: microrregião de Irecê/BA (19 municípios)
- **Migrations rodadas**: 054–061 (rodar via `node scripts/...` ou Supabase Studio)

---

## Quick reference

### Rotas públicas (`radar.vertho.ai`)

| Rota | O que mostra |
|---|---|
| `/` | Home com busca + 3 stats reais (escolas, municípios distintos, snapshots Saeb) |
| `/escola/[inep]` | Saeb da escola + Censo (4 scores de infra + 12 recursos) + IA narrativa via Suspense + CTA lead + "Citar" |
| `/municipio/[ibge]` | ICA municipal por rede + lista de escolas + IA + CTA lead + "Citar" |
| `/estado/[uf]` | Stats UF + microrregiões + Top/Bottom 10 Saeb e Top 10 ICA |
| `/comparar?escolas=A,B` | Lado a lado de até 4 escolas; URL compartilhável; "melhor" destacado |
| `/metodologia` | Fontes, escala de níveis, INSE, limites, LGPD |
| `/sitemap.xml` | Sitemap-index com chunks de 5000 URLs |
| `/robots.txt` | Permite tudo em `/`, bloqueia `/admin/`, `/dashboard/`, `/api/` |

### Rotas admin (`app.vertho.ai`)

| Rota | O que faz |
|---|---|
| `/admin/radar` | Ingestão: upload Saeb XLSX, ICA XLSX/CSV, Censo CSV; runs recentes |
| `/admin/radar/funnel` | Funil 6 etapas (visitas → cliques → leads → PDFs → contatos → convertidos) com taxas, custo IA, breakdown e top visitados (filtros 7/30/90d) |

### API

| Endpoint | Quem chama |
|---|---|
| `POST /api/radar/lead-pdf` | QStash (assinado, fail-closed em prod sem keys) |

---

## Como subir os dados de um piloto novo

Tudo via `/admin/radar`. Você precisa de 3 arquivos (todos vêm do INEP):

1. **XLSX Saeb** — gerado pelo `saeb_pipeline` Python (scrape de boletins)
2. **XLSX ICA** — `resultados_e_metas_municipios.xlsx` (microdados públicos)
3. **CSV Censo Escolar** — pré-filtrado por microrregião (script local)

### 1. Saeb

Rode o `saeb_pipeline` localmente em `C:\Users\rdnav\Downloads\saeb_pipeline`:

```bash
# Em Escolas.txt liste os códigos INEP (8 dígitos)
python pipeline.py
# Gera saeb_<municipio>_<data>.xlsx com 3 abas: escolas, distribuicoes, falhas
```

No `/admin/radar`, mantenha **"Restringir piloto à microrregião de Irecê"** ligado e clique **"Selecionar XLSX Saeb"**. O parser:

- Faz upsert em `diag_escolas` por `codigo_inep`
- Cria snapshots em `diag_saeb_snapshots` por (INEP, ano, etapa, disciplina)
- Deriva `municipio_ibge` via lookup quando o XLSX não traz (Saeb pipeline não gera IBGE)
- Linhas fora de Irecê são **skipped** (com a flag ligada)
- Cada upload gera um run em `diag_ingest_runs`
- **Refresh automático das materialized views** ao final (best-effort)

### 2. ICA

XLSX oficial do INEP `resultados_e_metas_municipios.xlsx` (~14KB, 5471 municípios). Detecta automaticamente a aba "Divulgação Alfabet Municipio" e o header técnico (CO_MUNICIPIO, NO_TP_REDE, PC_ALUNO_ALFABETIZADO, etc).

Em `/admin/radar` → **"Selecionar arquivo ICA"** (aceita também CSV).

### 3. Censo Escolar (infra-estrutura)

CSV completo do Censo tem ~165MB e não cabe em server action. **Duas opções:**

**A) Upload direto via CLI (recomendado pra base nacional):**

```bash
cd nextjs-app
node scripts/import-censo.mjs "C:/Users/.../Tabela_Escola_2025.csv"
# Streaming linha-a-linha → upsert em batches de 200 direto no Supabase
# Lê SUPABASE_URL + SERVICE_ROLE_KEY do .env.local
# Mostra progresso (linhas/s) em tempo real
```

Flags:
- `--limit=10000` → testa com primeiras 10k linhas
- `--ano=2025` → força um ano específico

**B) Filtrar antes pra subir via /admin/radar (apenas subsets pequenos):**

```bash
node scripts/filter-censo-irece.mjs "C:/Users/.../Tabela_Escola_2025.csv"
# gera Tabela_Escola_2025_irece.csv (~5MB) ao lado do input
```

Em `/admin/radar` → **"Selecionar CSV (subset)"**. Insere em `diag_censo_infra`:
- 213 indicadores `IN_*` em JSONB
- 32 quantidades `QT_*` em JSONB
- 4 scores 0-100 calculados via `lib/radar/censo-scores.ts`: básica (água/luz/esgoto), pedagógica (biblioteca/lab/quadra), acessibilidade (rampas/sinais), conectividade (internet/banda larga)

Página da escola passa a mostrar cards de infra logo após o hero.

---

## Como o lead → PDF funciona

```
Visitante clica "Receba diagnóstico Vertho em PDF"
   ↓
Modal LGPD coleta: nome, email, cargo, organização
   ↓
capturarLead() — 3 camadas de defesa:
   • valida que escopo (escola/município) existe na base
   • rate limit 10/hora por ip_hash
   • dedup idempotente: mesmo (email × scope) nas últimas 24h retorna o lead existente
   ↓
Insere em diag_leads (status: pendente)
   ↓
Tracking: registra evento lead_submit em diag_eventos
   ↓
QStash publish → /api/radar/lead-pdf (assíncrono, signed)
   ↓
Worker (com fail-closed em prod sem signing keys):
  1. Lê lead
  2. Monta payload (escola/município + IA proposta com cache)
  3. Renderiza PDF via @react-pdf/renderer (RadarPropostaPDF, 7 páginas)
  4. Upload pro bucket privado diag-relatorios em {scope_type}/{scope_id}/{leadId}.pdf
  5. Cria signed URL (30 dias)
  6. Atualiza lead (status: pronto)
  7. Envia email Resend com PDF anexado + botão de download
```

**Custo IA por lead**: ~$0.06 sem cache. Cache hit em municípios populares cai pra ~$0.012.

---

## Tabelas

| Tabela | O que guarda | Migration |
|---|---|---|
| `diag_escolas` | Cadastro de escolas (INEP, nome, município, INSE, etapas) | 054 (+ 055: nullable IBGE/UF) |
| `diag_saeb_snapshots` | Saeb por (INEP, ano, etapa, disciplina) com distribuição cumulativa + comparativos similares/UF/BR | 054 |
| `diag_ica_snapshots` | ICA por (município, rede, ano) com benchmarks UF/BR | 054 |
| `diag_censo_infra` | Censo Escolar — 213 IN_* + 32 QT_* + 4 scores agregados + lat/long (DOUBLE PRECISION) | 056 + 057 |
| `diag_analises_ia` | Cache de narrativas IA por `(scope, prompt_version, dados_hash)` | 054 |
| `diag_leads` | Captação com consentimento LGPD + status do PDF + dados de origem | 054 |
| `diag_ingest_runs` | Observabilidade de cada upload (sucesso/falha/skipped + erros) | 054 |
| `diag_eventos` | Tracking append-only: views, cliques no CTA, leads, citações, etc | 061 |

### Materialized views (migration 060)

| MV | O que pré-computa |
|---|---|
| `diag_mv_escola_saeb_agg` | % nos níveis 0-1, taxa participação, formação docente — médias por escola |
| `diag_mv_municipio_saeb_agg` | Mesmas agregações + total de escolas, agrupadas por município. Usada em `/estado/[uf]` |
| `diag_mv_municipio_ica_recent` | ICA mais recente por município (DISTINCT ON ano) |
| `diag_mv_estado_stats` | Stats por UF (total escolas/municípios/snapshots) |

Refresh automático após cada ingestão (best-effort) via `SELECT refresh_diag_mvs()`.

### RPCs

| RPC | Pra que serve |
|---|---|
| `refresh_diag_mvs()` | REFRESH CONCURRENTLY de todas as MVs |
| `diag_count_municipios_distintos()` | COUNT(DISTINCT municipio_ibge) — usado na home |
| `diag_funil_resumo(dias)` | Agregação do funil por tipo de evento |
| `diag_funil_top_visitados(dias, lim)` | Top escolas/municípios visitados (humanos vs bots) |

### Bucket Storage

`diag-relatorios` — **privado** (migration 058), MIME pdf-only, 10MB max. Acesso 100% via signed URL de 30 dias.

---

## Customização do prompt de IA

Os prompts vivem em:
- `lib/radar/ia-narrativa.ts` (narrativa pública das páginas)
- `lib/radar/proposta-pdf-data.ts` (proposta do PDF)

Cada um tem um `PROMPT_VERSION_*` que faz parte da chave de cache. Pra forçar regeneração de TODAS as análises após mudar o prompt:

1. Bump a versão (ex: `radar-narrativa-v1` → `radar-narrativa-v2`)
2. Deploy
3. Próximas visitas regeram com o prompt novo, salvam em cache nova chave

A versão antiga fica em `diag_analises_ia` como histórico (não é apagada).

### IA bot-aware

`getNarrativaEscola/Municipio` aceitam `{ generateIfMissing: false }`. O server component `NarrativaIA` lê o `User-Agent` via `headers()` e detecta bots/crawlers (regex em `lib/radar/ia-narrativa.ts::isLikelyBot`). Bots **nunca disparam geração** — leem cache se houver, senão veem fallback + leitura determinística. Humanos disparam normal e enchem o cache.

---

## Adicionar mais municípios

Para expandir além de Irecê:

1. Edite `lib/radar/microrregiao-irece.ts` (ou crie `lib/radar/microrregiao-<x>.ts` com a mesma estrutura)
2. Atualize `IRECE_IBGE` em `scripts/filter-censo-irece.mjs` (ou clone o script com novos IBGEs)
3. Rode o `saeb_pipeline` com a nova `Escolas.txt`
4. Filtre o Censo com o script novo
5. Suba os 3 arquivos via `/admin/radar`

Para abrir cobertura nacional (V2): desligar a flag de restrição no `/admin/radar` faz o importador aceitar qualquer município.

---

## Observabilidade

### Funnel dashboard (UI)

`https://app.vertho.ai/admin/radar/funnel` — visualização das 6 etapas do funil:

1. **Visitas (humanos)** — pages views excluindo bots
2. **Cliques no CTA "Receber PDF"** — `cta_lead_click`
3. **Leads capturados** — `diag_leads` no período
4. **PDFs prontos** — `pdf_status='pronto'`
5. **Contatos feitos** — equipe Vertho fez contato
6. **Convertidos** — virou conversa comercial

Mostra também: custo IA acumulado, total de análises, breakdown de eventos por tipo, top 15 mais visitados (humanos vs total).

### Queries SQL úteis

```sql
-- Runs recentes
SELECT * FROM diag_ingest_runs ORDER BY iniciado_em DESC LIMIT 20;

-- Leads pendentes ou em erro
SELECT * FROM diag_leads
 WHERE pdf_status IN ('pendente','processando','erro')
 ORDER BY criado_em DESC;

-- Custo IA acumulado
SELECT modelo, COUNT(*), SUM(custo_usd)
  FROM diag_analises_ia GROUP BY modelo;

-- Top eventos do dia (humanos)
SELECT tipo, COUNT(*) FROM diag_eventos
 WHERE NOT is_bot AND criado_em > now() - interval '24 hours'
 GROUP BY tipo ORDER BY COUNT(*) DESC;

-- Refresh manual das MVs
SELECT refresh_diag_mvs();
```

### Logs

- **Worker PDF**: Vercel → Functions → `/api/radar/lead-pdf` → Logs
- **Server actions**: Vercel → Functions → mesmo deploy
- **Sentry**: erros capturados automaticamente

---

## Performance / escala

| Item | Estado | Threshold pra otimizar |
|---|---|---|
| Busca por nome | pg_trgm + GIN ✅ | escala até dezenas de mi |
| Rankings UF | Materialized views ✅ | refresh após cada ingestão |
| Sitemap | Chunks de 5000 ✅ | Next gera sitemap-index automaticamente |
| Cache IA | Chave (scope, prompt_version, dados_hash) ✅ | invalidação só se dados mudarem |
| IA × bot crawler | Bot só lê cache ✅ | sem geração espontânea por crawler |
| Stats home | RPC `diag_count_municipios_distintos` ✅ | escala SQL |

---

## Migrations a aplicar (em ordem)

```
054-diag-schema.sql                       # tabelas + bucket
055-diag-municipio-ibge-nullable.sql      # IBGE/UF/municipio nullable
056-diag-censo-infra.sql                  # tabela do Censo (idempotente)
057-diag-censo-latlong-double.sql         # lat/long DOUBLE PRECISION
058-diag-relatorios-private.sql           # bucket privado + drop policy
059-diag-pg-trgm.sql                      # pg_trgm + GIN indexes
060-diag-materialized-views.sql           # MVs + RPCs de refresh/count
061-diag-eventos.sql                      # tracking + RPCs do funil
```

Pra rodar via Supabase Management API (com `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` no `.env.local`):

```bash
# Script ad-hoc — ver exemplo no histórico do Claude session
node /tmp/run-migrations.mjs
```

Ou cole arquivo por arquivo no SQL editor do Supabase Studio.

---

## Segurança operacional

- **Worker `/api/radar/lead-pdf`**: fail-closed em produção se signing keys QStash ausentes (segue tolerante em dev/preview pra facilitar testes locais)
- **Bucket `diag-relatorios`**: privado (migration 058), acesso 100% via signed URL 30d
- **IA bot-aware**: User-Agent de crawler nunca dispara IA — só lê cache se existir
- **`capturarLead`**:
  - Valida que scope_id (INEP/IBGE) existe em `diag_escolas` ou `diag_ica_snapshots`
  - Rate limit 10/h por `ip_hash`
  - Dedup idempotente por `(email × scope)` em 24h (retorna o lead existente)
  - Validações de tamanho (email <200, scope formato regex)
- **Auth admin**: `requireAdminAction()` em todas as rotas `/admin/radar/*`

---

## Features da V1 (estado atual)

- ✅ Páginas de escola, município e UF
- ✅ Comparativo lado a lado de até 4 escolas (URL compartilhável)
- ✅ Censo Escolar — 4 scores agregados + 213 IN_* + 32 QT_* em JSONB
- ✅ Saeb por escola + ICA municipal
- ✅ IA narrativa em escola e município (cache + Suspense + bot-aware)
- ✅ Lead → PDF assíncrono via QStash + Resend (validação, rate limit, dedup)
- ✅ "Citar este Radar" (ABNT/APA/BibTeX) — facilitador de backlinks
- ✅ Sitemap-index com chunks dinâmicos, robots.txt, schema.org
- ✅ pg_trgm + GIN indexes pra busca rápida
- ✅ Materialized views pra rankings UF
- ✅ Funnel dashboard interno (`/admin/radar/funnel`)
- ✅ Cobertura: microrregião de Irecê/BA (19 municípios)

## Adiamentos conhecidos

- Auto-fetch INEP (scraper integrado) — V1.5+ (parser depende de OCR; investigação de API JSON do INEP não rendeu)
- RAG grounding em fontes oficiais — V1.5+
- Follow-up D+1/D+7 do lead — após validar conversão piloto
- Migração `middleware.js` → `proxy.ts` (Next 17, quando virar warning real)

V1 é deliberadamente enxuto pra **provar conversão** (3+ leads/mês virando conversa comercial) antes de escalar.

---

## Estrutura do código (referência rápida)

```
nextjs-app/
  app/radar/                                # rotas públicas
    page.tsx, layout.tsx, sitemap.ts, robots.ts, not-found.tsx
    actions.ts                              # buscarEscolasMunicipios + capturarLead + registrarEventoClient
    escola/[inep]/page.tsx
    municipio/[ibge]/page.tsx
    estado/[uf]/page.tsx
    comparar/page.tsx + _picker + _tabela
    metodologia/page.tsx
    _components/                            # radar-header, indicator-card, narrativa-ia, infra-card, lead-cta, citar-button
  app/admin/radar/                          # admin (auth-protected)
    page.tsx                                # ingestão
    actions.ts                              # ingestSaeb/Ica/Censo + loadRadarStats + seed
    funnel/page.tsx                         # dashboard analytics
  app/api/radar/lead-pdf/route.ts           # worker QStash → PDF → Resend

  lib/radar/
    queries.ts                              # getEscola, getMunicipio, getEstadoStats, getRankingMunicipiosUf, getEscolasCompactas
    ia-narrativa.ts                         # cache (scope, prompt_version, dados_hash) + isLikelyBot
    proposta-pdf-data.ts                    # IA da proposta do PDF
    leitura-deterministica.ts               # textos sem IA (fallback SEO)
    saeb-importer.ts, ica-importer.ts, censo-importer.ts
    censo-scores.ts                         # 4 dimensões de score do Censo
    eventos.ts                              # registrarEvento server-side
    microrregiao-irece.ts                   # lista canônica IBGE 29009
    hash.ts                                 # stableJsonHash pra cache IA

  components/pdf/RadarPropostaPDF.tsx       # 7 páginas, reusa PdfCover/PdfBackCover

  scripts/filter-censo-irece.mjs            # filtra Censo CSV nacional → microrregião

  migrations/054 a 061                      # SQL versionado
```
