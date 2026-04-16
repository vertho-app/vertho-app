# Relatório de Arquitetura — Vertho Mentor IA

Análise completa do projeto em `C:/GAS/Vertho App`, com foco no estado atual pós-implementação do **Motor de Temporadas** (fases A, B, C, D completas — 14 semanas end-to-end + Evolution Report + Dashboard Gestor + Painéis Admin Vertho).

- **Stack**: Next.js 16.2.4 (App Router, Turbopack) + React 19 + Supabase (Postgres + Storage + Auth + pgvector) + Tailwind v4 + Bunny Stream + Anthropic Claude / Gemini / OpenAI + Voyage (embeddings) + read-excel-file (planilhas) + Resend (email)
- **Hospedagem**: Vercel (com Vercel Cron e serverless)
- **Multi-tenant**: subdomínio → middleware injeta `x-tenant-slug` em header + cookie `vertho-tenant-slug`
- **Linguagem**: TypeScript (strict: false, allowJs) com `tsconfig.json` — migração concluída (backend + frontend 100% TS)

---

## 1. Estrutura de Pastas

Existem **dois repositórios git aninhados**:

- `C:/GAS/Vertho App/.git` — repo pai (contém `supabase/migrations`, `gas-antigo/`, `docs/`)
- `C:/GAS/Vertho App/nextjs-app/.git` — repo da aplicação Next.js

```
C:/GAS/Vertho App/
├── .claude/                       (config Claude Code local)
├── .env.local                     (1,2 KB — env do repo pai)
├── .vercel/
├── docs/                          (documentação avulsa)
├── gas-antigo/                    (scripts .gs legado + PDFs de referência)
│   ├── PDI_Descritor_Colaborador.pdf
│   ├── Relatorio RH.pdf
│   └── Relatório do Gestor.pdf
├── supabase/
│   └── migrations/                (43 arquivos .sql, 001 → 043)
└── nextjs-app/                    (aplicação principal — 2º repo git)
    ├── .env.example  (819 B)
    ├── .env.local    (1,6 KB)
    ├── .mcp.json
    ├── ARQUITETURA.md  (doc oficial de arquitetura)
    ├── middleware.js   (3,1 KB — tenant resolver — fica .js por design do Next)
    ├── next.config.mjs (com Sentry wrapper + experimental.serverActions.bodySizeLimit 50MB)
    ├── vercel.json     (3 crons)
    ├── package.json    (913 B)
    ├── package-lock.json (268 KB)
    ├── postcss.config.mjs
    ├── playwright.config.js
    ├── sentry.client.config.js
    ├── sentry.edge.config.js
    ├── sentry.server.config.js
    ├── tsconfig.json                 (substitui jsconfig.json; strict:false, allowJs, checkJs:false)
    ├── app/           (App Router — páginas .tsx, layouts .tsx, API routes .ts)
    │   ├── admin/...          (painel admin/RH)
    │   │   ├── vertho/        (painéis Admin Vertho)
    │   │   │   ├── evidencias/        (actions.ts + page.tsx)
    │   │   │   ├── avaliacao-acumulada/ (actions.ts + page.tsx)
    │   │   │   ├── auditoria-sem14/   (actions.ts + page.tsx)
    │   │   │   ├── simulador-custo/   (page.tsx)
    │   │   │   └── knowledge-base/    (NOVO — CRUD RAG per-tenant: actions.ts + page.tsx)
    │   ├── api/...            (rotas server: bunny, chat, cron, webhooks, temporada…)
    │   │   ├── temporada/
    │   │   │   ├── reflection/route.ts         (c/ grounding RAG ativo)
    │   │   │   ├── tira-duvidas/route.ts       (c/ grounding RAG ativo)
    │   │   │   ├── missao/route.ts
    │   │   │   ├── evaluation/route.ts         (sem 14 wizard)
    │   │   │   └── concluida/pdf/route.ts
    │   │   ├── capacitacao-recomendada/route.ts
    │   │   └── gestor/plenaria/pdf/route.ts
    │   ├── dashboard/...      (UI do colaborador — .tsx)
    │   │   ├── temporada/
    │   │   │   ├── page.tsx
    │   │   │   ├── semana/[week]/page.tsx
    │   │   │   ├── sem14/page.tsx            (wizard 4 perguntas)
    │   │   │   └── concluida/page.tsx        (Evolution Report)
    │   │   └── gestor/
    │   │       └── equipe-evolucao/         (actions.ts + page.tsx)
    │   ├── login/ page.tsx + login-form.tsx
    │   ├── layout.tsx / page.tsx
    │   ├── globals.css / global-error.tsx / not-found.tsx
    │   └── actions/beto.ts, manutencao.ts
    ├── actions/        (41 arquivos .ts — server actions)
    │   ├── avaliacao-acumulada.ts
    │   ├── simulador-temporada.ts
    │   ├── temporada-concluida.ts
    │   ├── evolution-report.ts
    │   ├── relatorios.ts                  (c/ grounding RAG em gerarRelatorioGestor + gerarRelatorioRH)
    │   └── ... (demais actions)
    ├── lib/            (45 arquivos .ts — helpers + engines)
    │   ├── season-engine/            (Motor de Temporadas)
    │   │   ├── build-season.ts
    │   │   ├── select-descriptors.ts
    │   │   ├── week-gating.ts
    │   │   └── prompts/
    │   │       ├── analytic.ts              (feedback analítico, 10 turnos)
    │   │       ├── challenge.ts
    │   │       ├── scenario.ts
    │   │       ├── socratic.ts              (Evidências, 6 turnos, DISC, c/ grounding RAG)
    │   │       ├── tira-duvidas.ts          (c/ grounding RAG)
    │   │       ├── missao.ts
    │   │       ├── missao-feedback.ts       (c/ grounding RAG)
    │   │       ├── acumulado.ts
    │   │       ├── evolution-qualitative.ts (12 turnos, 6 etapas)
    │   │       ├── evolution-scenario.ts
    │   │       ├── evolution-scenario-check.ts
    │   │       ├── simulador-temporada.ts
    │   │       ├── case-study.ts, text-content.ts, video-script.ts, podcast-script.ts
    │   ├── ia-cost-catalog.ts               (catálogo chamadas IA x modelos x presets, inclui RAG)
    │   ├── embeddings.ts                    (NOVO — Wrapper Voyage / OpenAI)
    │   ├── rag.ts                           (NOVO — kb_search_hybrid + formatação grounding)
    │   ├── rag-ingest.ts                    (NOVO — parser PDF/DOCX → chunks → embedding)
    │   ├── rag-seed.ts                      (NOVO — 6 docs seed)
    │   ├── temporada-concluida-pdf.ts
    │   ├── plenaria-equipe-pdf.ts
    │   ├── fit-v2/                   (engine do Fit v2 — .ts)
    │   ├── prompts/                  (behavioral-report, fit-executive, insights — .ts)
    │   ├── supabase/mapCISProfile.ts
    │   ├── authz.ts, tenant-resolver.ts, tenant-db.ts, supabase.ts, supabase-browser.ts, ui-resolver.ts
    │   ├── versioning.ts, notifications.ts, pdf-assets.ts, logger.ts, pii-masker.ts
    │   ├── disc-arquetipos.ts, competencias-base.ts, avatar-presets.ts, preferencias-config.ts
    │   ├── markdown-to-pdf.ts, parse-spreadsheet.ts (read-excel-file v8), ai-tasks.ts
    ├── components/      (20 componentes .tsx)
    │   ├── beto-chat.tsx, mic-input.tsx (forwardRef + stop on send), page-shell.tsx
    │   ├── preferencias-ranking.tsx, video-modal.tsx
    │   ├── dashboard/ ManagerView.tsx, RHView.tsx
    │   └── pdf/ (8 componentes .tsx + styles.ts — @react-pdf/renderer)
    ├── migrations/     (pasta vazia/legado local)
    ├── scripts/        (auto-backup-diario.ps1, backup-project.ps1, checkpoint.ps1, smoke-test.js, backfill-embeddings.js, dados/)
    ├── docs/           (envs-importantes.md, rag-architecture.md, checklists, rotina-antifalha.md)
    ├── public/         (assets; inclui report-package excluída da análise)
    └── tests/          (Playwright — 86 specs)
```

---

## 2. Stack e Dependências

### package.json

```json
"scripts": {
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "migrate:legacy": "node scripts/migracao_legado.js",
  "backfill:embeddings": "node scripts/backfill-embeddings.js",
  "test": "npx playwright test",
  "smoke": "node scripts/smoke-test.js"
}
```

| Pacote | Versão | Uso |
|---|---|---|
| `next` | ^16.2.4 | App Router com Turbopack (patch bump: CVE DoS Server Components) |
| `react` / `react-dom` | 19.2.4 | UI |
| `typescript` | ^5.9 | TypeScript (tsc --noEmit) |
| `@supabase/supabase-js` | 2.49.4 | Client SDK |
| `@anthropic-ai/sdk` | 0.81.0 | Claude (modelo padrão `claude-sonnet-4-6`) |
| `@sentry/nextjs` | 10.47.0 | Monitoramento (silent build) |
| `@upstash/qstash` | 2.10.1 | Fila de mensagens (WhatsApp, jobs agendados) |
| `@react-pdf/renderer` | 4.4.0 | PDFs (Individual, Gestor, RH, Comportamental, Evolution, Plenária) |
| `pdfjs-dist` | 5.6.205 | Extração/leitura de PDFs |
| `read-excel-file` | ^8 | Parser de planilhas (substitui `xlsx`, que tinha 2 CVEs high) |
| `resend` | ^6.12 | SDK Email (Resend) — antes era usado via fetch dinamicamente |
| `react-markdown` | 10.1.0 | Renderizar markdown da IA |
| `lucide-react` | 1.7.0 | Ícones |
| `tailwindcss` + `@tailwindcss/postcss` | 4.0.0 | Estilos (v4) |
| `@playwright/test` | 1.59.1 | Testes E2E |

**Embedding provider** (Voyage, antes OpenAI) — configurado via `EMBEDDING_PROVIDER` + `VOYAGE_API_KEY`. Modelo: `voyage-3-large` (1024d nativo).

**npm audit**: 0 vulnerabilities.

Node pinned: `engines.node: ">=20.0.0 <25.0.0"`.

### next.config.mjs
- `experimental.serverActions.bodySizeLimit = '50mb'` (Next 16 compat — movido de `serverActions` para `experimental`)
- `outputFileTracingIncludes` para PNGs usados por `fs.readFileSync` em server components/API
- Wrapped em `withSentryConfig` (sem upload de source maps)

### vercel.json — 3 Crons
- `0 5 * * *` → `/api/cron?action=cleanup_sessoes`
- `0 11 * * 1` → `/api/cron?action=trigger_segunda`
- `0 11 * * 4` → `/api/cron?action=trigger_quinta`

### Variáveis de ambiente (apenas NOMES; arquivos `.env.local` e `.env.example` existem — conteúdo não copiado)

Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
IA: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`
Embeddings: `EMBEDDING_PROVIDER` (voyage|openai), `VOYAGE_API_KEY`
WhatsApp (Z-API): `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
QStash: `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`
Email: `RESEND_API_KEY`
Scraping: `FIRECRAWL_API_KEY`
App: `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `ADMIN_EMAILS`
Sentry: `NEXT_PUBLIC_SENTRY_DSN`
Bunny: `BUNNY_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_WEBHOOK_SECRET`

Supabase CLI: **não há `supabase/config.toml`** — migrations rodadas manualmente.

---

## 3. Arquitetura do Código

### 3.1 App Router (páginas)

#### Dashboard (colaborador / gestor / RH)
| Rota | Propósito |
|---|---|
| `app/page.tsx` | Landing pública |
| `app/login/page.tsx` + `login-form.tsx` | Login via Supabase Auth |
| `app/dashboard/page.tsx` | Home bento-grid (KPIs ciclo semanal + carrossel Bunny) |
| `app/dashboard/layout.tsx` | Usa `connection()` e injeta `DashboardShell` |
| `app/dashboard/dashboard-shell.tsx` | Navegação lateral (Sidebar) e seleção RH/Gestor/Colab |
| `app/dashboard/home/page.tsx` | Home alternativa |
| `app/dashboard/perfil/page.tsx` | Perfil do colaborador + `perfil-actions.ts` |
| `app/dashboard/jornada/page.tsx` | Timeline das fases (1→5) |
| `app/dashboard/assessment/page.tsx` + `chat/page.tsx` | Motor Conversacional Fase 3 |
| `app/dashboard/evolucao/page.tsx` | Comparativo Cenário A × B |
| `app/dashboard/pdi/page.tsx` | PDI gerado pela IA |
| `app/dashboard/perfil-comportamental/page.tsx` + `mapeamento` + `relatorio` | CIS/DISC (tela1–tela4) |
| `app/dashboard/praticar/page.tsx` + `evidencia/page.tsx` | Fase 4 (pílulas/evidências) |
| `app/dashboard/temporada/page.tsx` | Timeline 14 semanas |
| `app/dashboard/temporada/semana/[week]/page.tsx` | Player + desafio + Tira-Dúvidas + Evidências/Analítico |
| `app/dashboard/temporada/sem14/page.tsx` | Wizard 4 perguntas (cenário B do banco) |
| `app/dashboard/temporada/concluida/page.tsx` | Temporada Concluída (5 blocos + PDF) |
| `app/dashboard/gestor/equipe-evolucao/page.tsx` | Dashboard gestor: delta + status por liderado |

#### Admin
| Rota | Propósito |
|---|---|
| `app/admin/layout.tsx` + `admin-guard.tsx` | Protege tudo via `isPlatformAdmin()` |
| `app/admin/dashboard/page.tsx` | Dashboard agregador |
| `app/admin/empresas/gerenciar/page.tsx`, `nova/page.tsx` | CRUD de empresas |
| `app/admin/empresas/[empresaId]/page.tsx` | Detalhe empresa |
| `app/admin/empresas/[empresaId]/configuracoes/page.tsx` | `ui_config`/`sys_config`/logo |
| `app/admin/empresas/[empresaId]/fase0..fase2/page.tsx` | Fluxos por fase |
| `app/admin/empresas/[empresaId]/relatorios/page.tsx` | Gerador de relatórios PDF |
| `app/admin/cargos/page.tsx`, `competencias/page.tsx` | Catálogo |
| `app/admin/assessment-descritores/page.tsx` | Grid colab × descritor (notas 1-4) |
| `app/admin/fit/page.tsx` | Fit v2 |
| `app/admin/preferencias-aprendizagem/page.tsx` | Rankings preferências |
| `app/admin/ppp/page.tsx` | Extração PPP escolas |
| `app/admin/simulador/page.tsx` | Simulador de conversas |
| `app/admin/top10/page.tsx` | IA1 top 10 |
| `app/admin/videos/page.tsx` | Analytics Bunny (views, heatmap, por colab) |
| `app/admin/whatsapp/page.tsx` | Envio em lote |
| `app/admin/platform-admins/page.tsx` | Gerenciar admins globais |
| `app/admin/conteudos/page.tsx` | Banco de micro-conteúdos (Bunny import + tagging IA) |
| `app/admin/temporadas/page.tsx` | Viewer das temporadas geradas + botão Simulador |
| `app/admin/evolucao/page.tsx` | Evolution Report agregado por empresa |
| `app/admin/relatorios/page.tsx` | Relatórios |
| `app/admin/vertho/evidencias/page.tsx` | Conversas socráticas 1-12, extração, transcript |
| `app/admin/vertho/avaliacao-acumulada/page.tsx` | Nota por descritor + auditoria + regerar |
| `app/admin/vertho/auditoria-sem14/page.tsx` | 4 notas (pré/acumulada/cenário/final) + delta + regerar |
| `app/admin/vertho/simulador-custo/page.tsx` | Calculadora interativa de custo IA |
| `app/admin/vertho/knowledge-base/page.tsx` | **NOVO — CRUD + Upload PDF/DOCX + seed + preview busca (RAG per-tenant)** |

### 3.2 Server Actions (`actions/**`)

| Arquivo | Propósito | Exports principais |
|---|---|---|
| `ai-client.ts` | Roteador universal Claude/Gemini/OpenAI | `callAI`, `callAIChat` |
| `assessment-descritores.ts` | CRUD assessment descritores | — |
| `automacao-envios.ts` | Agendador de envios | — |
| `avaliacao-acumulada.ts` | Auto-trigger pós sem 13, dual-IA, pontua 1-4 por descritor | — |
| `backup.ts` | Backup actions | — |
| `bunny-stats.ts` | Métricas Bunny Stream | `loadBunnyVideosStats`, `loadBunnyHeatmap`, `loadVideoWatchedPorColab`, `loadBunnyLibraryStats` |
| `cenario-b.ts` | Reavaliação cenário B | — |
| `check-ia4.ts` | Validação cruzada IA4 | — |
| `competencias.ts` / `competencias-base.ts` | CRUD competências | — |
| `conteudos.ts` | Banco de micro-conteúdos | `importarVideosBunny`, `listarConteudos`, `atualizarConteudo`, `deletarConteudo`, `sugerirTagsIA`, `aplicarTagsIA` |
| `conteudos-metrics.ts` | Métricas de conteúdos | — |
| `cron-jobs.ts` | Handlers de cron | `cleanupSessoes`, `triggerSegunda`, `triggerQuinta` |
| `dashboard-kpis.ts` | KPIs home | `loadHomeKpis` |
| `evolucao-granular.ts` | Evolução por descritor | — |
| `evolution-report.ts` | Consolida sems 13+14 → `trilhas.evolution_report` | — |
| `fase1.ts` (1055 linhas) | Diagnóstico, IA1 top10, IA2 gabarito | — |
| `fase2.ts` | Geração de cenários IA3 | — |
| `fase3.ts` | Motor conversacional | — |
| `fase4.ts` | Envios de pílulas + evidências | — |
| `fase5.ts` (1258 linhas) | PDI, reavaliação, plenárias | — |
| `fit-v2.ts` | Cálculo do Fit v2 | `calcularFitIndividual`, `salvarPerfilIdeal`, `loadPerfilIdeal` |
| `manutencao.ts` | Limpeza/manutenção | — |
| `onboarding.ts` | Onboarding de empresa | — |
| `ppp.ts` | Extração PPP (PDF/site/JSON) | — |
| `preferencias-aprendizagem.ts` | Ranking preferências | — |
| `relatorios.ts` / `relatorios-load.ts` | Geração relatórios PDF (gerarRelatorioGestor/RH com grounding RAG) | — |
| `simulador-conversas.ts` | Simulador admin | — |
| `simulador-disc.ts` | Simulador DISC | — |
| `simulador-temporada.ts` | Processa 1 semana/chamada, 4 perfis, evita timeout Vercel | — |
| `temporada-concluida.ts` | Monta dados da tela Concluída | — |
| `temporadas.ts` | Motor de Temporadas | `gerarTemporada`, `gerarTemporadasLote`, `loadTemporada`, `loadTemporadaPorEmail`, `listarTemporadasEmpresa`, `marcarConteudoConsumido` |
| `trilhas-load.ts` | Carregamento trilha | — |
| `tutor-evidencia.ts` | Tutor IA para evidências | — |
| `utils.ts` | Utilitários JSON/blocos | `extractJSON`, `extractBlock`, `stripBlocks` |
| `video-analytics.ts` | Analytics vídeos por colab | `loadUltimosVideosColab` |
| `video-tracking.ts` | Registro de views | — |
| `whatsapp.ts`, `whatsapp-lote.ts` | Envios Z-API | `enviarWhatsApp`, etc. |

### 3.3 Libraries (`lib/**`)

#### `lib/season-engine/` (Motor de Temporadas)
- **`select-descriptors.ts`** — Função pura: a partir de `descriptor_assessments`, aloca descritores em 9 slots `[1,2,3,5,6,7,9,10,11]`. Descritores com `gap >= 1.5` (nota <= 1.5) usam 2 semanas contíguas; demais 1 semana. Se sobrarem slots, eleva descritores já proficientes (>=3.0).
- **`build-season.ts`** — `buildSeason()` monta 14 semanas. Semanas de conteúdo (1-3, 5-7, 9-11): resolve `formato_core` + gera desafio via Claude. Semanas de prática (4, 8, 12): gera missão + cenário em paralelo. Semanas 13-14: avaliação.
- **`week-gating.ts`** — Gate duplo: calendário (`data_inicio + (N-1)*7 dias @ 03:00 BRT`) + anterior concluída.
- **`prompts/socratic.ts`** — Conversa socrática "Evidências" de **6 turnos**. Adaptação DISC, regra anti-alucinação, perguntas abertas. Fechamento com bullets Desafio/Insight/Compromisso. **Grounding RAG ativo**.
- **`prompts/analytic.ts`** — Feedback analítico de **10 turnos** para semanas de prática.
- **`prompts/tira-duvidas.ts`** — Chat reativo por semana (só conteúdo), guard-rail no descritor. Modelo Haiku 4.5. Sem limite de turnos, não altera status. **Grounding RAG ativo**.
- **`prompts/missao.ts`** — Prompt para missão prática (sem 4/8/12).
- **`prompts/missao-feedback.ts`** — IA analisa relato da missão (10 turnos). **Grounding RAG ativo**.
- **`prompts/acumulado.ts`** — 1a IA pontua 1-4 por descritor (cega pra nota inicial — anti-viés ancoragem). 2a IA audita. max_tokens 8000/6000.
- **`prompts/evolution-qualitative.ts`** — Conversa qualitativa sem 13: **12 turnos**. 6 etapas: abertura, retrospectiva, 3 evidências, microcaso (apresenta + 2 follow-ups), integração descritores (2 ângulos), maior avanço, síntese final. DISC adaptado. Anti-alucinação.
- **`prompts/evolution-scenario-check.ts`** — Check do cenário da sem 14 por 2a IA.
- **`prompts/simulador-temporada.ts`** — Simulador com 4 perfis comportamentais.
- **`prompts/challenge.ts`** — Desafio semanal (micro-ação observável).
- **`prompts/scenario.ts`** — Cenário situacional (força escolha real, com stakeholders nomeados).
- **`prompts/case-study.ts`**, `text-content.ts`, `video-script.ts`, `podcast-script.ts` — Geração de conteúdos.

#### `lib/ia-cost-catalog.ts`
- Catálogo de chamadas IA × modelos × 3 presets. Usado pelo simulador de custo admin.
- Novas entradas pós-grounding: 3 chamadas com +800 tokens input (`evidencias-socratic`, `tira-duvidas`, `missao-feedback`) + `rag-query-embed` (voyage-3-large @ 138 calls/colab × 100 tokens).
- `MODELS` inclui `voyage-3-large` (embed-only, outUsd: 0). Presets preservam Voyage pra RAG.

#### `lib/embeddings.ts` (NOVO)
- Wrapper universal de embeddings. Suporta `EMBEDDING_PROVIDER=voyage` (modelo `voyage-3-large` nativo 1024d) ou `EMBEDDING_PROVIDER=openai` (usa `text-embedding-3-small` com `dimensions: 1024`).

#### `lib/rag.ts` (NOVO)
- `kbSearchHybrid(empresaId, query, topK)` — chama `kb_search_hybrid` (RRF FTS+vector) e formata resultados para injeção em system prompt.

#### `lib/rag-ingest.ts` (NOVO)
- Parser PDF (via `pdf-parse`) e DOCX (via `mammoth`) → fragmenta por seção → gera embedding → upsert em `knowledge_base`.

#### `lib/rag-seed.ts` (NOVO)
- 6 docs base: temporada (visão geral), evidências (metodologia socrática), tira-dúvidas, régua de maturidade, modos de missão, privacidade.

#### `lib/temporada-concluida-pdf.ts`
- Gera PDF do Evolution Report individual.

#### `lib/plenaria-equipe-pdf.ts`
- Gera PDF consolidado do time (Plenária).

#### `lib/fit-v2/`
- `engine.ts` — Fit Final = Score Base × Fator Crítico × Fator Excesso; 4 blocos.
- `blocos.ts`, `classificacao.ts`, `gap-analysis.ts`, `penalizacoes.ts`, `ranking.ts`, `validacao.ts`.

#### `lib/prompts/`
- `behavioral-report-prompt.ts` — Prompt do relatório comportamental de 5 páginas.
- `fit-executive-prompt.ts` — Leitura executiva do Fit.
- `insights-executivos-prompt.ts` — Insights gerenciais.

#### Outros
- `authz.ts` — RBAC (`colaborador`/`gestor`/`rh` + `platform_admins`); `findColabByEmail` respeita tenant; `getDashboardView`.
- `tenant-resolver.ts` — `resolveTenant(slug)` com cache em memória TTL 5 min + cache negativo 60 s.
- `tenant-db.ts` — Helper multi-tenant DB.
- `supabase.ts` — `createSupabaseClient(req)` (anon) e `createSupabaseAdmin()` (service_role).
- `supabase-browser.ts` — Cliente client-side singleton (`getSupabase()`).
- `versioning.ts`, `logger.ts`, `notifications.ts`, `pdf-assets.ts`, `ui-resolver.ts`.
- `markdown-to-pdf.ts`, `parse-spreadsheet.ts` (read-excel-file v8), `ai-tasks.ts`.
- `pii-masker.ts`, `sentry-scrub-pii.ts` — Máscara de PII antes de enviar para LLMs/Sentry.

### 3.4 Componentes
- `page-shell.tsx` — `PageContainer`, `PageHero`, `GlassCard`, `SectionHeader` (padrão visual "Cinematic").
- `mic-input.tsx` — Usa Web Speech API nativa, pt-BR, contínuo. **forwardRef + stop on send**.
- `video-modal.tsx` — iframe do Bunny com tracking via `postMessage`.
- `beto-chat.tsx` — Chat do assistente "Beto" (hidden em semana pages).
- `preferencias-ranking.tsx` — UI drag/ranking das preferências de aprendizagem.
- `dashboard/ManagerView.tsx`, `dashboard/RHView.tsx` — Views por papel.
- `pdf/` — 8 componentes React-PDF (.tsx) + `styles.ts`.

---

## 4. Banco de Dados

### Tabelas por migration

| Migration | Tabelas criadas / alteradas |
|---|---|
| 001_codigo_js_tables | `empresas`, `colaboradores`, `cargos`, `competencias`, `banco_cenarios`, `respostas`, `envios_diagnostico`, `regua_maturidade`, `academia` |
| 002_academia_gestao_tables | `trilhas`, `fase4_envios`, `capacitacao`, `evolucao`, `evolucao_descritores` |
| 003_catalogo_cis_moodle | `catalogo_enriquecido`, `cis_referencia`, `cis_ia_referencia`, `moodle_catalogo` |
| 004_empresas_segmento | `empresas.segmento` (educacao/corporativo) |
| 005_ppp_escolas | `ppp_escolas` |
| 006_competencias_base | `competencias_base` (template global) |
| 007_competencias_base_cargo | `competencias_base.cargo` |
| 008_empresas_ui_config | `empresas.ui_config` JSONB |
| 009_empresas_slug | `empresas.slug` UNIQUE NOT NULL |
| 010_sessoes_avaliacao | `sessoes_avaliacao`, `mensagens_chat` |
| 011_empresas_sys_config | `empresas.sys_config` (AI model, keys, cadência) |
| 012_storage_logos | bucket `logos` + policies |
| 013_sessoes_validacao | `sessoes_avaliacao.rascunho_avaliacao`, `validacao_audit`, `modelo_avaliador`, `modelo_validador` |
| 014_sessoes_lacuna_numeric | `sessoes_avaliacao.lacuna` → NUMERIC |
| 015_rbac_explicito | `colaboradores.role`, `platform_admins` |
| 016_versionamento_prompts | `prompt_versions`, `competencias.versao_regua`, FKs em `sessoes_avaliacao`, `respostas` |
| 017_disc_adaptado_resultados | `colaboradores.d/i/s/c_adaptado`, `disc_resultados` |
| 018_disc_colunas_completas | 4 cols liderança + 16 competências DISC + preferências |
| 019_check_ia4 | constraints |
| 020_tabelas_faltantes | `relatorios`, `pdis`, `fase4_envios` (reforço), `trilhas_catalogo` |
| 021_competencias_base_cargos | seeds cargos |
| 022_relatorio_comportamental | `colaboradores.report_texts`, `report_generated_at`, 16 comp_*_adapt, etc. |
| 023_comportamental_pdf_path | `colaboradores.comportamental_pdf_path` |
| 024_fit_leitura_executiva_ai | `fit_resultados.leitura_executiva_ai` |
| 025_fit_resultados_unique | dedup + UNIQUE(empresa_id, colaborador_id) |
| 026_insights_executivos | `empresas.insights_executivos` |
| 027_foto_avatar | `colaboradores.foto_avatar` |
| 028_videos_watched | `videos_watched` (tracking Bunny) |
| 029_micro_conteudos | `micro_conteudos` (unificado para Motor de Temporadas) |
| 030_temporadas | `descriptor_assessments`, extends `trilhas` (temporada_plano, descritores_selecionados, numero_temporada), `temporada_semana_progresso` |
| 031_conteudos_bucket | bucket `conteudos` no storage |
| 032_evolution_report | `trilhas.evolution_report` JSONB |
| 033_competencias_base_alinhamento | alinhamento competências base |
| 034_cargos_eh_lideranca | `trilhas.data_inicio` DATE + cargos eh_lideranca |
| 035_trash_table | DROP `fase4_progresso`, `tutor_log` (legacy removido) |
| 036_backups_bucket | `temporada_semana_progresso.tira_duvidas` JSONB + backups bucket |
| 037_rls_tabelas | ENABLE RLS em 5 tabelas: `competencias`, `competencias_base`, `platform_admins`, `reavaliacao_sessoes`, `videos_watched` |
| 038_rate_limit_log | Tabela `rate_limit_log` (tracking de rate limit) |
| 039_checkpoint_gestor | Checkpoint intermediário do gestor |
| 040_impacto_conteudo | Tracking de impacto por micro-conteúdo |
| **041_knowledge_base** | **NOVO — Tabela `knowledge_base` + função `kb_search` (FTS PT-BR via tsvector com unaccent)** |
| **042_pgvector** | **NOVO — Extensão `pgvector` + coluna `embedding VECTOR(1536)` + funções `kb_search_semantic` (cosine) e `kb_search_hybrid` (RRF FTS+vector)** |
| **043_embedding_1024** | **NOVO — Dimensão reduzida 1536 → 1024 (requisito do voyage-3-large). Sem perda (base vazia no momento)** |

### Tabelas destacadas

**`empresas`** — `id`, `nome`, `slug` (UNIQUE), `segmento`, `ui_config` JSONB, `sys_config` JSONB, `insights_executivos`.

**`colaboradores`** — `id`, `empresa_id`, `email`, `nome_completo`, `cargo`, `area_depto`, `role` (colaborador/gestor/rh), `perfil_dominante` (Alto D/I/S/C), `d/i/s/c_natural`, `d/i/s/c_adaptado`, 6 valores, tipos psicológicos, 16 comp_* + 16 comp_*_adapt, 4 lid_*, índices comportamentais, preferências, `report_texts` JSONB, `disc_resultados` JSONB, `foto_avatar`, `comportamental_pdf_path`, `whatsapp`. Unique(empresa_id, email).

**`competencias_base`** (global) — segmento, cod_comp, nome, pilar, descricao, cod_desc, nome_curto, descritor_completo, `n1_gap`/`n2_desenvolvimento`/`n3_meta`/`n4_referencia`, cargo. **RLS habilitado (migration 037).**

**`competencias`** (por empresa) — mesmas colunas + `empresa_id`, `evidencias_esperadas`, `perguntas_alvo`, `versao_regua`. **RLS habilitado (migration 037).**

**`trilhas`** — `id`, `empresa_id`, `colaborador_id`, `email`, `competencia_foco` + `temporada_plano` JSONB (14 WeekPlan), `descritores_selecionados` JSONB, `numero_temporada` INT (não infla em regeneração), `data_inicio` DATE (migration 034), `evolution_report` JSONB (migration 032), `cursos` JSONB (legado).

**`descriptor_assessments`** — `colaborador_id`, `competencia`, `descritor`, `nota` (1.0-4.0, granularidade 0.1), `nivel` GENERATED, `origem`. UNIQUE(colab, competencia, descritor).

**`temporada_semana_progresso`** — `trilha_id`, `semana` (1-14), `tipo` (conteudo/aplicacao/avaliacao), `status`, `conteudo_consumido`, `reflexao` JSONB, `feedback` JSONB (cenário analítico + `feedback.acumulado` na sem 13), `tira_duvidas` JSONB (migration 036). UNIQUE(trilha_id, semana).

**`micro_conteudos`** — `empresa_id` (NULL = global), `titulo`, `formato` (video/audio/texto/case/pdf), `duracao_min`, `url`, `storage_path`, `bunny_video_id`, `conteudo_inline`, `competencia`, `descritor`, `nivel_min`/`nivel_max`, `tipo_conteudo`, `contexto`, `cargo`, `setor`, `apresentador`, `origem`, `ativo`, `taxa_conclusao`, `total_views`. RLS.

**`videos_watched`** — eventos do webhook Bunny. **RLS habilitado (migration 037).**

**`platform_admins`** — admins globais cross-tenant. **RLS habilitado (migration 037).**

**`fit_resultados`** — score, blocos, fatores; UNIQUE(empresa_id, colaborador_id); `leitura_executiva_ai`.

**`banco_cenarios`**, **`respostas`** — IA3/IA4 legado. Cenário B da sem 14 vem de `banco_cenarios` (SEMPRE, sem fallback IA).

**`sessoes_avaliacao`** + `mensagens_chat` — motor conversacional Fase 3.

**`relatorios`**, **`pdis`** — cache de outputs gerados.
**`prompt_versions`** — versionamento (tipo, hash SHA-256, modelo, conteúdo).

**`knowledge_base`** (NOVO — migrations 041/042/043) — base RAG per-tenant. `empresa_id`, `titulo`, `chunk_index`, `content` TEXT, `metadata` JSONB, `embedding VECTOR(1024)` (Voyage nativo). Três funções SQL: `kb_search` (FTS PT-BR tsvector), `kb_search_semantic` (cosine distance), `kb_search_hybrid` (RRF combinando FTS + vector). Consumida por `lib/rag.ts` em 4 superfícies.

**Tabelas removidas (migration 035):** `fase4_progresso`, `tutor_log`.

---

## 5. APIs e Endpoints

### API routes (`app/api/**/route.ts`)

| Rota | Método | Propósito |
|---|---|---|
| `/api/academia` | GET/POST | CRUD academia (cursos) |
| `/api/assessment` | POST | Avaliação via formulário legado |
| `/api/bunny-thumb/[videoId]` | GET | Proxy de thumbnail do Bunny |
| `/api/bunny-videos` | GET | Lista library (cache 5 min, filtra `status=4`) |
| `/api/capacitacao-recomendada` | GET | **NOVO — Multi-formato filtrando por competência foco** |
| `/api/cargos` | GET/POST | CRUD cargos |
| `/api/cenarios` | GET/POST | IA3 geração de cenários |
| `/api/chat` | POST | Chat genérico (Beto) |
| `/api/chat-simulador` | POST | Simulador admin de conversas |
| `/api/colaboradores` | GET/POST | CRUD colaboradores |
| `/api/content/search` | GET | Busca em `micro_conteudos` |
| `/api/cron` | GET | Handler dos Vercel Crons (auth via `CRON_SECRET`) |
| `/api/generate-narratives` | POST | Geração de narrativas IA |
| `/api/gestor/plenaria/pdf` | GET | **NOVO — PDF consolidado do time (Plenária)** |
| `/api/pdi` | GET/POST | PDI |
| `/api/ppp` | POST | Extração PPP |
| `/api/relatorios` | GET | Lista relatórios |
| `/api/relatorios/individual` | GET | Relatório individual |
| `/api/relatorios/pdf` | GET | PDF via @react-pdf/renderer |
| `/api/temporada/reflection` | POST | Chat socrático/analítico da semana (init/send) — **agora com grounding RAG** |
| `/api/temporada/tira-duvidas` | POST | Chat reativo por semana (Haiku 4.5) — **agora com grounding RAG** |
| `/api/temporada/missao` | POST | **NOVO — set_modo + compromisso para missão prática** |
| `/api/temporada/evaluation` | POST | Avaliação sem 14 (**expandido: wizard 4 perguntas + triangulação + 2a IA check**) |
| `/api/temporada/concluida/pdf` | GET | **NOVO — PDF do Evolution Report individual** |
| `/api/upload-logo` | POST | Upload para bucket `logos` |
| `/api/webhooks/bunny` | POST/GET | Recebe eventos do Bunny → `videos_watched` |
| `/api/webhooks/qstash` | POST | Jobs agendados (envios) |
| `/api/webhooks/qstash/whatsapp-cis` | POST | CIS via WhatsApp |

### Integrações externas via fetch/callAI
- **Anthropic Claude** — SDK oficial (`@anthropic-ai/sdk`), streaming quando `max_tokens > 8192`, suporta extended thinking.
- **Gemini** — `generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`.
- **OpenAI** — `api.openai.com/v1/chat/completions`.
- **Bunny Stream** — `video.bunnycdn.com/library/{lib}/videos`, `/heatmap`, `/statistics`.
- **Z-API** — `api.z-api.io/instances/{id}/token/{token}/send-text`.
- **QStash** — scheduler/queue.
- **Resend** — email.
- **Firecrawl** — scrape PPP.

### Autenticação e autorização
- **Supabase Auth** — email+senha; `sb.auth.getUser()` em todas as páginas dashboard.
- **`middleware.js`** — Extrai subdomínio, valida contra `ROOT_DOMAINS`, seta header `x-tenant-slug` + cookie. (Permanece `.js` por design do Next.)
- **`lib/authz.ts`** — RBAC com `findColabByEmail`, `getUserContext`, `getDashboardView`.
- **Admin panel** — `admin-guard.tsx` bloqueia não-platform-admins.
- **Cron** — `CRON_SECRET` no header Authorization.
- **Bunny webhook** — `BUNNY_WEBHOOK_SECRET` opcional.

---

## 6. Frontend / Interface

### Dashboard do colaborador
- **`home`** — Hero "Olá, {Nome}", bento grid, **Capacitação Recomendada multi-formato** (filtra por competência foco, não mais Bunny library inteira).
- **`temporada/page.tsx`** — Timeline 14 semanas. Cards coloridos por tipo. Labels: "Prática" (era "Aplicação"), "Evidências" (era "Mentor IA").
- **`temporada/semana/[week]`** — Player com switch de formato, desafio, **Tira-Dúvidas** (chat reativo), **Evidências** (socrático 6 turnos). "Marcar como realizado" (era "Marcar como assistido", gate: só libera após clicar link). Cenário: "CONTEXTO" (era "CENÁRIO"), sem título. Inputs chat → textarea com word-wrap. Beto hidden.
- **`temporada/sem14/page.tsx`** — Wizard 4 perguntas sequenciais (SITUACAO/ACAO/RACIOCINIO/AUTOSSENSIBILIDADE). Cenário B SEMPRE do banco_cenarios. UX idêntica ao mapeamento (steps, não chat).
- **`temporada/concluida/page.tsx`** — 5 blocos: hero, comparativo por descritor, momentos insight, missões, avaliação final. PDF via botão.
- **`gestor/equipe-evolucao`** (NOVO) — Lista liderados com delta + status (evolução confirmada/parcial/estagnação/regressão). Filtros + ordenação. Click-through modal com detalhe + PDF individual. Botão "Equipe" na top bar pra gestor/RH.

### Admin
- **`admin/temporadas`** — Cards + timeline + botão "SIM" para Simulador de Temporada com barra de progresso.
- **`admin/vertho/evidencias`** (NOVO) — Conversas socráticas sem 1-12, extração, transcript. Filtro `?empresa=`.
- **`admin/vertho/avaliacao-acumulada`** (NOVO) — Nota por descritor + auditoria + botão regerar. Filtro `?empresa=`.
- **`admin/vertho/auditoria-sem14`** (NOVO) — 4 notas (pré/acumulada/cenário/final) + delta + regerar com feedback. Filtro `?empresa=`.
- **`admin/vertho/simulador-custo`** — Calculadora interativa: catálogo de chamadas IA × modelos × 3 presets (inclui linha RAG/grounding).
- **`admin/vertho/knowledge-base`** (NOVO) — CRUD da base RAG per-tenant. Upload PDF/DOCX/TXT/MD (até 4MB), botão "Popular base inicial" (6 docs seed), preview de busca (FTS/vector/hybrid). Alimenta grounding em Tira-Dúvidas + Evidências + Missão Feedback + Relatórios Gestor/RH.
- Todos os painéis Vertho com back button context-aware.

### Design System
- **Tailwind v4** com `postcss.config.mjs`.
- Paleta: navy + teal/cyan.
- Componentes base em `page-shell.tsx`.
- Ícones: Lucide.
- PDFs: `@react-pdf/renderer`.

---

## 7. Integrações

(Sem alterações substanciais em relação ao estado anterior — Supabase, Anthropic, Gemini/OpenAI, Bunny, Z-API, QStash, Resend, Firecrawl, Sentry todos operacionais.)

**Legacy removido:**
- `actions/capacitacao.js` — removido (era integração Moodle).
- `/admin/empresas/[id]/fase3/` — removido.
- Botões "Iniciar Capacitação", "Avançar Semana", "Nudges", "Iniciar Reavaliação" — removidos.
- Tabelas `fase4_progresso` e `tutor_log` dropadas.

---

## 7.1 Novidades / Mudanças Recentes

- **Migração TypeScript 100%** — 41 actions + 45 libs + 30 API routes + 25 server actions + 51 páginas + 20 componentes convertidos para `.ts`/`.tsx`. `tsconfig.json` com `strict:false`, `allowJs:true`, `checkJs:false`. Script `npm run typecheck`. Apenas `middleware.js`, `sentry.*.config.js`, `playwright.config.js`, `next.config.mjs`, `postcss.config.mjs` permanecem `.js` (por design do Next). Bugs latentes capturados pela migração (ex.: `parse-spreadsheet` usando API v7 do xlsx contra pacote v8, comparações `string > number` em diversos pontos, atributo `style` duplicado em páginas admin/perfil).
- **RAG per-tenant** — pgvector 1024d + Voyage `voyage-3-large` (commit `8dc80df`). Grounding ativo em 4 superfícies: `/api/temporada/tira-duvidas`, `/api/temporada/reflection` (Evidências socrático + Missão Feedback), `actions/relatorios.ts::gerarRelatorioGestor` e `gerarRelatorioRH`. Migrations 041/042/043. Ingest via `lib/rag-ingest.ts` (PDF via pdf-parse, DOCX via mammoth). Seed via `lib/rag-seed.ts` (6 docs base). Backfill via `npm run backfill:embeddings`.
- **Painel `/admin/vertho/knowledge-base`** — CRUD + Upload (até 4MB) + seed + preview de busca.
- **Segurança** — `xlsx` removido (2 CVEs high sem fix) → `read-excel-file@^8`. Next.js 16.2.2 → 16.2.4 (patch CVE DoS Server Components). `resend@^6.12` formalmente adicionado. `npm audit: 0 vulnerabilities`.
- **Simulador de Custo atualizado** — entrada `rag-query-embed` + 3 chamadas com grounding (+800 tokens input cada). Modelo `voyage-3-large` (embed-only) no catálogo.
- **Docs** — novo `docs/rag-architecture.md` (ativar embeddings, backfill, pitfalls).

---

## 8. Estado do Projeto

### Funcionando end-to-end

- **Motor de Temporadas completo (14 semanas)**:
  1. Admin gera temporadas → `buildSeason` monta 14 semanas com missão + cenário em paralelo para sem 4/8/12.
  2. Week gating por calendário (`data_inicio + (N-1)*7 @ 03:00 BRT`) + anterior concluída.
  3. Semanas 1-3, 5-7, 9-11: conteúdo + desafio + Tira-Dúvidas (Haiku 4.5) + Evidências (socrático 6 turnos, DISC, anti-alucinação).
  4. Semanas 4, 8, 12: Missão Prática (aceita + compromisso → executa → relata → IA analisa 10 turnos). Fallback "Não consegui" → cenário escrito (analítico 10 turnos).
  5. Semana 13: Conversa qualitativa de fechamento (12 turnos, 6 etapas, microcaso). Extração: evolucao_percebida + maior_avanco + ponto_atencao + microcaso_resposta_qualidade.
  6. Avaliação Acumulada: auto-trigger pós sem 13. 1a IA pontua 1-4 cega. 2a IA audita.
  7. Semana 14: Cenário B SEMPRE do banco_cenarios. Wizard 4 perguntas. Scorer triangula (cenário + acumulada + evidências 13 sems). Check 2a IA. 4 notas por descritor.
  8. Evolution Report automático. Tela Concluída com 5 blocos + PDF.
- **Dashboard Gestor**: lista liderados com delta + status + modal + PDF individual.
- **Plenária PDF**: consolidado do time.
- **Painéis Admin Vertho**: evidências, avaliação acumulada, auditoria sem14, simulador de custo.
- **Simulador de Temporada**: processa 1 semana/chamada, 4 perfis, Haiku. Botão "SIM" com barra de progresso.
- **Fase 1 (Diagnóstico)** — formulários, IA1, IA2.
- **Fase 2 (Cenários IA3)** — geração + check.
- **Fase 3 (Motor Conversacional)** — sessões com validação multi-LLM.
- **Fase 5 (PDI + Evolução)** — cenário A × B.
- **Fit v2** — 4 blocos, fatores, ranking, leitura executiva.
- **Relatório Comportamental** — PDF 5 páginas.
- **Multi-tenant** — middleware + cache, RBAC com platform_admins.
- **Bunny analytics** — views, heatmap, views por colab.
- **Crons Vercel** — cleanup + segunda + quinta.
- **Capacitação recomendada** — multi-formato filtrando por competência foco.
- **Granularidade scoring 0.1** (era 0.5).
- **RLS habilitado** em competencias, competencias_base, platform_admins, reavaliacao_sessoes, videos_watched.

### Parcial / stubs
- **Áudio salvo** — MicInput transcreve ao vivo, mas **não há upload do áudio bruto para Storage**.
- **Webhook Bunny** — não recebe play/ended nativos; atribuição por colab via postMessage.
- **Fallback de conteúdo** — se `micro_conteudos` não tem formato, `formatoCore = 'texto'` com `fallback_gerado: true`.
- **Dashboard home** — `MOCK_FOCO` hard-coded.
- **`/admin/temporadas`** — exibe listagem mas não permite editar plano ou regerar semana individual.
- **Artigo PDF** — cabeçalho duplicado removido, subtítulo removido, '---' ignorado (fix recente).

### Planejado / não implementado
- Google Speech-to-Text — menção no env mas não há código (Web Speech API cobre).
- Áudio gravado salvo no Supabase Storage — schema prevê, sem fluxo de upload.
- Origens alternativas `ia_heygen_clone`, `ia_podcast` em `micro_conteudos` — enum existe mas nenhum writer popula.

---

## 9. Mapa de Integração

| Módulo | Dependências | Status |
|---|---|---|
| **Motor de Temporadas** (completo) | `lib/season-engine/`, `actions/temporadas.ts`, `actions/avaliacao-acumulada.ts`, `actions/evolution-report.ts`, `actions/temporada-concluida.ts`, `actions/simulador-temporada.ts`, 16 prompts, 6 API routes, 5 telas dashboard, migrations 029-036 | ✅ |
| **Dashboard Gestor** | `app/dashboard/gestor/equipe-evolucao/`, `actions.ts` | ✅ |
| **Painéis Admin Vertho** | 5 telas em `app/admin/vertho/` (evidências, avaliação acumulada, auditoria sem14, simulador custo, knowledge-base), `lib/ia-cost-catalog.ts` | ✅ |
| **RAG / Grounding per-tenant** | `knowledge_base` (migrations 041/042/043), `lib/embeddings.ts`, `lib/rag.ts`, `lib/rag-ingest.ts`, `lib/rag-seed.ts`, Voyage `voyage-3-large` 1024d, grounding em tira-dúvidas + reflection + relatórios gestor/RH | ✅ |
| **Evolution Report + PDF** | `actions/evolution-report.ts`, `lib/temporada-concluida-pdf.ts`, `app/dashboard/temporada/concluida/` | ✅ |
| **Plenária** | `lib/plenaria-equipe-pdf.ts`, `/api/gestor/plenaria/pdf` | ✅ |
| **Relatório Comportamental** | `colaboradores.report_texts`, prompt, 4 componentes PDF | ✅ |
| **Fit v2** | `lib/fit-v2/`, `actions/fit-v2.ts`, `/admin/fit` | ✅ |
| **Pipeline Bunny** | import → tagging IA → consumo via temporada | ✅ |

---

_Relatório atualizado em 2026-04-16. Credenciais em `.env.local` existem mas não foram extraídas._
