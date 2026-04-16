# Relatório de Arquitetura — Vertho Mentor IA

Análise completa do projeto em `C:/GAS/Vertho App`, com foco no estado atual pós-implementação do **Motor de Temporadas** (fases A, B, C, D completas — 14 semanas end-to-end + Evolution Report + Dashboard Gestor + Painéis Admin Vertho).

- **Stack**: Next.js 16.2.2 (App Router, Turbopack) + React 19 + Supabase (Postgres + Storage + Auth) + Tailwind v4 + Bunny Stream + Anthropic Claude / Gemini / OpenAI
- **Hospedagem**: Vercel (com Vercel Cron e serverless)
- **Multi-tenant**: subdomínio → middleware injeta `x-tenant-slug` em header + cookie `vertho-tenant-slug`
- **Linguagem**: JavaScript puro (sem TypeScript) com `jsconfig.json`

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
│   └── migrations/                (36 arquivos .sql, 001 → 036)
└── nextjs-app/                    (aplicação principal — 2º repo git)
    ├── .env.example  (819 B)
    ├── .env.local    (1,6 KB)
    ├── .mcp.json
    ├── ARQUITETURA.md  (doc oficial de arquitetura)
    ├── middleware.js   (3,1 KB — tenant resolver)
    ├── next.config.mjs (com Sentry wrapper + experimental.serverActions.bodySizeLimit 50MB)
    ├── vercel.json     (3 crons)
    ├── package.json    (913 B)
    ├── package-lock.json (268 KB)
    ├── postcss.config.mjs
    ├── playwright.config.js
    ├── sentry.client.config.js
    ├── sentry.edge.config.js
    ├── sentry.server.config.js
    ├── jsconfig.json
    ├── app/           (App Router — páginas, layouts, API routes)
    │   ├── admin/...          (painel admin/RH)
    │   │   ├── vertho/        (painéis Admin Vertho — NOVO)
    │   │   │   ├── evidencias/        (actions.js + page.js)
    │   │   │   ├── avaliacao-acumulada/ (actions.js + page.js)
    │   │   │   ├── auditoria-sem14/   (actions.js + page.js)
    │   │   │   └── simulador-custo/   (page.js)
    │   ├── api/...            (rotas server: bunny, chat, cron, webhooks, temporada…)
    │   │   ├── temporada/
    │   │   │   ├── reflection/route.js
    │   │   │   ├── tira-duvidas/route.js    (NOVO)
    │   │   │   ├── missao/route.js          (NOVO)
    │   │   │   ├── evaluation/route.js      (expandido: sem 14 wizard)
    │   │   │   └── concluida/pdf/route.js   (NOVO)
    │   │   ├── capacitacao-recomendada/route.js (NOVO)
    │   │   └── gestor/plenaria/pdf/route.js    (NOVO)
    │   ├── dashboard/...      (UI do colaborador)
    │   │   ├── temporada/
    │   │   │   ├── page.js
    │   │   │   ├── semana/[week]/page.js
    │   │   │   ├── sem14/page.js            (NOVO — wizard 4 perguntas)
    │   │   │   └── concluida/page.js        (NOVO — Evolution Report)
    │   │   └── gestor/
    │   │       └── equipe-evolucao/         (NOVO — actions.js + page.js)
    │   ├── login/ page.js
    │   ├── layout.js / page.js
    │   ├── globals.css / global-error.js / not-found.js
    │   └── actions/beto.js, manutencao.js
    ├── actions/        (~40 arquivos — server actions)
    │   ├── avaliacao-acumulada.js     (NOVO)
    │   ├── simulador-temporada.js     (NOVO)
    │   ├── temporada-concluida.js     (NOVO)
    │   ├── evolution-report.js        (NOVO)
    │   └── ... (demais actions)
    ├── lib/            (helpers + engines)
    │   ├── season-engine/            (Motor de Temporadas)
    │   │   ├── build-season.js
    │   │   ├── select-descriptors.js
    │   │   ├── week-gating.js               (NOVO — gate calendário + anterior concluída)
    │   │   └── prompts/
    │   │       ├── analytic.js              (feedback analítico, 10 turnos)
    │   │       ├── challenge.js
    │   │       ├── scenario.js
    │   │       ├── socratic.js              (Evidências, 6 turnos, DISC, anti-alucinação)
    │   │       ├── tira-duvidas.js          (NOVO)
    │   │       ├── missao.js                (NOVO)
    │   │       ├── missao-feedback.js        (NOVO)
    │   │       ├── acumulado.js             (NOVO)
    │   │       ├── evolution-qualitative.js  (atualizado: 12 turnos, 6 etapas)
    │   │       ├── evolution-scenario.js
    │   │       ├── evolution-scenario-check.js (NOVO)
    │   │       ├── simulador-temporada.js   (NOVO)
    │   │       ├── case-study.js, text-content.js, video-script.js, podcast-script.js
    │   ├── ia-cost-catalog.js               (NOVO — catálogo 20 chamadas, 7 modelos)
    │   ├── temporada-concluida-pdf.js       (NOVO)
    │   ├── plenaria-equipe-pdf.js           (NOVO)
    │   ├── fit-v2/                   (engine do Fit v2)
    │   ├── prompts/                  (behavioral-report, fit-executive, insights)
    │   ├── supabase/mapCISProfile.js
    │   ├── authz.js, tenant-resolver.js, supabase.js, supabase-browser.js, ui-resolver.js
    │   ├── versioning.js, notifications.js, pdf-assets.js, logger.js
    │   ├── disc-arquetipos.js, competencias-base.js, avatar-presets.js, preferencias-config.js
    │   ├── markdown-to-pdf.js, parse-spreadsheet.js, ai-tasks.js
    ├── components/
    │   ├── beto-chat.js, mic-input.js (forwardRef + stop on send), page-shell.js
    │   ├── preferencias-ranking.js, video-modal.js
    │   ├── dashboard/ ManagerView.js, RHView.js
    │   └── pdf/ (8 componentes + styles.js — @react-pdf/renderer)
    ├── migrations/     (pasta vazia/legado local)
    ├── scripts/        (auto-backup-diario.ps1, backup-project.ps1, checkpoint.ps1, smoke-test.js, dados/)
    ├── public/         (assets; inclui report-package excluída da análise)
    └── tests/          (Playwright)
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
  "migrate:legacy": "node scripts/migracao_legado.js",
  "test": "npx playwright test",
  "smoke": "node scripts/smoke-test.js"
}
```

| Pacote | Versão | Uso |
|---|---|---|
| `next` | 16.2.2 | App Router com Turbopack |
| `react` / `react-dom` | 19.2.4 | UI |
| `@supabase/supabase-js` | 2.49.4 | Client SDK |
| `@anthropic-ai/sdk` | 0.81.0 | Claude (modelo padrão `claude-sonnet-4-6`) |
| `@sentry/nextjs` | 10.47.0 | Monitoramento (silent build) |
| `@upstash/qstash` | 2.10.1 | Fila de mensagens (WhatsApp, jobs agendados) |
| `@react-pdf/renderer` | 4.4.0 | PDFs (Individual, Gestor, RH, Comportamental, Evolution, Plenária) |
| `pdfjs-dist` | 5.6.205 | Extração/leitura de PDFs |
| `react-markdown` | 10.1.0 | Renderizar markdown da IA |
| `lucide-react` | 1.7.0 | Ícones |
| `tailwindcss` + `@tailwindcss/postcss` | 4.0.0 | Estilos (v4) |
| `@playwright/test` | 1.59.1 | Testes E2E |

Sem Node version pinada (nem `engines` nem `.nvmrc`).

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
| `app/page.js` | Landing pública |
| `app/login/page.js` + `login-form.js` | Login via Supabase Auth |
| `app/dashboard/page.js` | Home bento-grid (KPIs ciclo semanal + carrossel Bunny) |
| `app/dashboard/layout.js` | Usa `connection()` e injeta `DashboardShell` |
| `app/dashboard/dashboard-shell.js` | Navegação lateral (Sidebar) e seleção RH/Gestor/Colab |
| `app/dashboard/home/page.js` | Home alternativa |
| `app/dashboard/perfil/page.js` | Perfil do colaborador + `perfil-actions.js` |
| `app/dashboard/jornada/page.js` | Timeline das fases (1→5) |
| `app/dashboard/assessment/page.js` + `chat/page.js` | Motor Conversacional Fase 3 |
| `app/dashboard/evolucao/page.js` | Comparativo Cenário A × B |
| `app/dashboard/pdi/page.js` | PDI gerado pela IA |
| `app/dashboard/perfil-comportamental/page.js` + `mapeamento` + `relatorio` | CIS/DISC (tela1–tela4) |
| `app/dashboard/praticar/page.js` + `evidencia/page.js` | Fase 4 (pílulas/evidências) |
| `app/dashboard/temporada/page.js` | Timeline 14 semanas |
| `app/dashboard/temporada/semana/[week]/page.js` | Player + desafio + Tira-Dúvidas + Evidências/Analítico |
| `app/dashboard/temporada/sem14/page.js` | **NOVO — Wizard 4 perguntas (cenário B do banco)** |
| `app/dashboard/temporada/concluida/page.js` | **NOVO — Temporada Concluída (5 blocos + PDF)** |
| `app/dashboard/gestor/equipe-evolucao/page.js` | **NOVO — Dashboard gestor: delta + status por liderado** |

#### Admin
| Rota | Propósito |
|---|---|
| `app/admin/layout.js` + `admin-guard.js` | Protege tudo via `isPlatformAdmin()` |
| `app/admin/dashboard/page.js` | Dashboard agregador |
| `app/admin/empresas/gerenciar/page.js`, `nova/page.js` | CRUD de empresas |
| `app/admin/empresas/[empresaId]/page.js` | Detalhe empresa |
| `app/admin/empresas/[empresaId]/configuracoes/page.js` | `ui_config`/`sys_config`/logo |
| `app/admin/empresas/[empresaId]/fase0..fase2/page.js` | Fluxos por fase |
| `app/admin/empresas/[empresaId]/relatorios/page.js` | Gerador de relatórios PDF |
| `app/admin/cargos/page.js`, `competencias/page.js` | Catálogo |
| `app/admin/assessment-descritores/page.js` | Grid colab × descritor (notas 1-4) |
| `app/admin/fit/page.js` | Fit v2 |
| `app/admin/preferencias-aprendizagem/page.js` | Rankings preferências |
| `app/admin/ppp/page.js` | Extração PPP escolas |
| `app/admin/simulador/page.js` | Simulador de conversas |
| `app/admin/top10/page.js` | IA1 top 10 |
| `app/admin/videos/page.js` | Analytics Bunny (views, heatmap, por colab) |
| `app/admin/whatsapp/page.js` | Envio em lote |
| `app/admin/platform-admins/page.js` | Gerenciar admins globais |
| `app/admin/conteudos/page.js` | Banco de micro-conteúdos (Bunny import + tagging IA) |
| `app/admin/temporadas/page.js` | Viewer das temporadas geradas + botão Simulador |
| `app/admin/evolucao/page.js` | Evolution Report agregado por empresa |
| `app/admin/relatorios/page.js` | Relatórios |
| `app/admin/vertho/evidencias/page.js` | **NOVO — Conversas socráticas 1-12, extração, transcript** |
| `app/admin/vertho/avaliacao-acumulada/page.js` | **NOVO — Nota por descritor + auditoria + regerar** |
| `app/admin/vertho/auditoria-sem14/page.js` | **NOVO — 4 notas (pré/acumulada/cenário/final) + delta + regerar** |
| `app/admin/vertho/simulador-custo/page.js` | **NOVO — Calculadora interativa de custo IA** |

### 3.2 Server Actions (`actions/**`)

| Arquivo | Propósito | Exports principais |
|---|---|---|
| `ai-client.js` | Roteador universal Claude/Gemini/OpenAI | `callAI`, `callAIChat` |
| `assessment-descritores.js` | CRUD assessment descritores | — |
| `automacao-envios.js` | Agendador de envios | — |
| `avaliacao-acumulada.js` | **NOVO — Auto-trigger pós sem 13, dual-IA, pontua 1-4 por descritor** | — |
| `backup.js` | Backup actions | — |
| `bunny-stats.js` | Métricas Bunny Stream | `loadBunnyVideosStats`, `loadBunnyHeatmap`, `loadVideoWatchedPorColab`, `loadBunnyLibraryStats` |
| `cenario-b.js` | Reavaliação cenário B | — |
| `check-ia4.js` | Validação cruzada IA4 | — |
| `competencias.js` / `competencias-base.js` | CRUD competências | — |
| `conteudos.js` | Banco de micro-conteúdos | `importarVideosBunny`, `listarConteudos`, `atualizarConteudo`, `deletarConteudo`, `sugerirTagsIA`, `aplicarTagsIA` |
| `conteudos-metrics.js` | Métricas de conteúdos | — |
| `cron-jobs.js` | Handlers de cron | `cleanupSessoes`, `triggerSegunda`, `triggerQuinta` |
| `dashboard-kpis.js` | KPIs home | `loadHomeKpis` |
| `evolucao-granular.js` | Evolução por descritor | — |
| `evolution-report.js` | **NOVO — Consolida sems 13+14 → `trilhas.evolution_report`** | — |
| `fase1.js` (1055 linhas) | Diagnóstico, IA1 top10, IA2 gabarito | — |
| `fase2.js` | Geração de cenários IA3 | — |
| `fase3.js` | Motor conversacional | — |
| `fase4.js` | Envios de pílulas + evidências | — |
| `fase5.js` (1258 linhas) | PDI, reavaliação, plenárias | — |
| `fit-v2.js` | Cálculo do Fit v2 | `calcularFitIndividual`, `salvarPerfilIdeal`, `loadPerfilIdeal` |
| `manutencao.js` | Limpeza/manutenção | — |
| `onboarding.js` | Onboarding de empresa | — |
| `ppp.js` | Extração PPP (PDF/site/JSON) | — |
| `preferencias-aprendizagem.js` | Ranking preferências | — |
| `relatorios.js` / `relatorios-load.js` | Geração relatórios PDF | — |
| `simulador-conversas.js` | Simulador admin | — |
| `simulador-disc.js` | Simulador DISC | — |
| `simulador-temporada.js` | **NOVO — Processa 1 semana/chamada, 4 perfis, evita timeout Vercel** | — |
| `temporada-concluida.js` | **NOVO — Monta dados da tela Concluída** | — |
| `temporadas.js` | Motor de Temporadas | `gerarTemporada`, `gerarTemporadasLote`, `loadTemporada`, `loadTemporadaPorEmail`, `listarTemporadasEmpresa`, `marcarConteudoConsumido` |
| `trilhas-load.js` | Carregamento trilha | — |
| `tutor-evidencia.js` | Tutor IA para evidências | — |
| `utils.js` | Utilitários JSON/blocos | `extractJSON`, `extractBlock`, `stripBlocks` |
| `video-analytics.js` | Analytics vídeos por colab | `loadUltimosVideosColab` |
| `video-tracking.js` | Registro de views | — |
| `whatsapp.js`, `whatsapp-lote.js` | Envios Z-API | `enviarWhatsApp`, etc. |

### 3.3 Libraries (`lib/**`)

#### `lib/season-engine/` (Motor de Temporadas)
- **`select-descriptors.js`** — Função pura: a partir de `descriptor_assessments`, aloca descritores em 9 slots `[1,2,3,5,6,7,9,10,11]`. Descritores com `gap >= 1.5` (nota <= 1.5) usam 2 semanas contíguas; demais 1 semana. Se sobrarem slots, eleva descritores já proficientes (>=3.0).
- **`build-season.js`** — `buildSeason()` monta 14 semanas. Semanas de conteúdo (1-3, 5-7, 9-11): resolve `formato_core` + gera desafio via Claude. Semanas de prática (4, 8, 12): gera missão + cenário em paralelo. Semanas 13-14: avaliação.
- **`week-gating.js`** — **NOVO** — Gate duplo: calendário (`data_inicio + (N-1)*7 dias @ 03:00 BRT`) + anterior concluída.
- **`prompts/socratic.js`** — Conversa socrática "Evidências" de **6 turnos** (era 5). Adaptação DISC, regra anti-alucinação, perguntas abertas. Fechamento com bullets Desafio/Insight/Compromisso.
- **`prompts/analytic.js`** — Feedback analítico de **10 turnos** para semanas de prática.
- **`prompts/tira-duvidas.js`** — **NOVO** — Chat reativo por semana (só conteúdo), guard-rail no descritor. Modelo Haiku 4.5. Sem limite de turnos, não altera status.
- **`prompts/missao.js`** — **NOVO** — Prompt para missão prática (sem 4/8/12).
- **`prompts/missao-feedback.js`** — **NOVO** — IA analisa relato da missão (10 turnos).
- **`prompts/acumulado.js`** — **NOVO** — 1a IA pontua 1-4 por descritor (cega pra nota inicial — anti-viés ancoragem). 2a IA audita. max_tokens 8000/6000.
- **`prompts/evolution-qualitative.js`** — Conversa qualitativa sem 13: **12 turnos** (era 8). 6 etapas: abertura, retrospectiva, 3 evidências, microcaso (apresenta + 2 follow-ups), integração descritores (2 ângulos), maior avanço, síntese final. DISC adaptado. Anti-alucinação.
- **`prompts/evolution-scenario-check.js`** — **NOVO** — Check do cenário da sem 14 por 2a IA.
- **`prompts/simulador-temporada.js`** — **NOVO** — Simulador com 4 perfis comportamentais.
- **`prompts/challenge.js`** — Desafio semanal (micro-ação observável).
- **`prompts/scenario.js`** — Cenário situacional (força escolha real, com stakeholders nomeados).
- **`prompts/case-study.js`**, `text-content.js`, `video-script.js`, `podcast-script.js` — Geração de conteúdos.

#### `lib/ia-cost-catalog.js` (NOVO)
- Catálogo de 20 chamadas IA × 7 modelos × 3 presets. Usado pelo simulador de custo admin.

#### `lib/temporada-concluida-pdf.js` (NOVO)
- Gera PDF do Evolution Report individual.

#### `lib/plenaria-equipe-pdf.js` (NOVO)
- Gera PDF consolidado do time (Plenária).

#### `lib/fit-v2/`
- `engine.js` — Fit Final = Score Base × Fator Crítico × Fator Excesso; 4 blocos.
- `blocos.js`, `classificacao.js`, `gap-analysis.js`, `penalizacoes.js`, `ranking.js`, `validacao.js`.

#### `lib/prompts/`
- `behavioral-report-prompt.js` — Prompt do relatório comportamental de 5 páginas.
- `fit-executive-prompt.js` — Leitura executiva do Fit.
- `insights-executivos-prompt.js` — Insights gerenciais.

#### Outros
- `authz.js` — RBAC (`colaborador`/`gestor`/`rh` + `platform_admins`); `findColabByEmail` respeita tenant; `getDashboardView`.
- `tenant-resolver.js` — `resolveTenant(slug)` com cache em memória TTL 5 min + cache negativo 60 s.
- `supabase.js` — `createSupabaseClient(req)` (anon) e `createSupabaseAdmin()` (service_role).
- `supabase-browser.js` — Cliente client-side singleton (`getSupabase()`).
- `versioning.js`, `logger.js`, `notifications.js`, `pdf-assets.js`, `ui-resolver.js`.
- `markdown-to-pdf.js`, `parse-spreadsheet.js`, `ai-tasks.js`.

### 3.4 Componentes
- `page-shell.js` — `PageContainer`, `PageHero`, `GlassCard`, `SectionHeader` (padrão visual "Cinematic").
- `mic-input.js` — Usa Web Speech API nativa, pt-BR, contínuo. **forwardRef + stop on send**.
- `video-modal.js` — iframe do Bunny com tracking via `postMessage`.
- `beto-chat.js` — Chat do assistente "Beto" (hidden em semana pages).
- `preferencias-ranking.js` — UI drag/ranking das preferências de aprendizagem.
- `dashboard/ManagerView.js`, `dashboard/RHView.js` — Views por papel.
- `pdf/` — 8 componentes React-PDF + `styles.js`.

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
| **037** (planejada) | **ENABLE RLS em 5 tabelas: `competencias`, `competencias_base`, `platform_admins`, `reavaliacao_sessoes`, `videos_watched`** |

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

**Tabelas removidas (migration 035):** `fase4_progresso`, `tutor_log`.

---

## 5. APIs e Endpoints

### API routes (`app/api/**/route.js`)

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
| `/api/temporada/reflection` | POST | Chat socrático/analítico da semana (init/send) |
| `/api/temporada/tira-duvidas` | POST | **NOVO — Chat reativo por semana (Haiku 4.5)** |
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
- **`middleware.js`** — Extrai subdomínio, valida contra `ROOT_DOMAINS`, seta header `x-tenant-slug` + cookie.
- **`lib/authz.js`** — RBAC com `findColabByEmail`, `getUserContext`, `getDashboardView`.
- **Admin panel** — `admin-guard.js` bloqueia não-platform-admins.
- **Cron** — `CRON_SECRET` no header Authorization.
- **Bunny webhook** — `BUNNY_WEBHOOK_SECRET` opcional.

---

## 6. Frontend / Interface

### Dashboard do colaborador
- **`home`** — Hero "Olá, {Nome}", bento grid, **Capacitação Recomendada multi-formato** (filtra por competência foco, não mais Bunny library inteira).
- **`temporada/page.js`** — Timeline 14 semanas. Cards coloridos por tipo. Labels: "Prática" (era "Aplicação"), "Evidências" (era "Mentor IA").
- **`temporada/semana/[week]`** — Player com switch de formato, desafio, **Tira-Dúvidas** (chat reativo), **Evidências** (socrático 6 turnos). "Marcar como realizado" (era "Marcar como assistido", gate: só libera após clicar link). Cenário: "CONTEXTO" (era "CENÁRIO"), sem título. Inputs chat → textarea com word-wrap. Beto hidden.
- **`temporada/sem14/page.js`** (NOVO) — Wizard 4 perguntas sequenciais (SITUACAO/ACAO/RACIOCINIO/AUTOSSENSIBILIDADE). Cenário B SEMPRE do banco_cenarios. UX idêntica ao mapeamento (steps, não chat).
- **`temporada/concluida/page.js`** (NOVO) — 5 blocos: hero, comparativo por descritor, momentos insight, missões, avaliação final. PDF via botão.
- **`gestor/equipe-evolucao`** (NOVO) — Lista liderados com delta + status (evolução confirmada/parcial/estagnação/regressão). Filtros + ordenação. Click-through modal com detalhe + PDF individual. Botão "Equipe" na top bar pra gestor/RH.

### Admin
- **`admin/temporadas`** — Cards + timeline + botão "SIM" para Simulador de Temporada com barra de progresso.
- **`admin/vertho/evidencias`** (NOVO) — Conversas socráticas sem 1-12, extração, transcript. Filtro `?empresa=`.
- **`admin/vertho/avaliacao-acumulada`** (NOVO) — Nota por descritor + auditoria + botão regerar. Filtro `?empresa=`.
- **`admin/vertho/auditoria-sem14`** (NOVO) — 4 notas (pré/acumulada/cenário/final) + delta + regerar com feedback. Filtro `?empresa=`.
- **`admin/vertho/simulador-custo`** (NOVO) — Calculadora interativa: catálogo 20 chamadas IA, 7 modelos, 3 presets.
- Todos os painéis Vertho com back button context-aware.

### Design System
- **Tailwind v4** com `postcss.config.mjs`.
- Paleta: navy + teal/cyan.
- Componentes base em `page-shell.js`.
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
| **Motor de Temporadas** (completo) | `lib/season-engine/`, `actions/temporadas.js`, `actions/avaliacao-acumulada.js`, `actions/evolution-report.js`, `actions/temporada-concluida.js`, `actions/simulador-temporada.js`, 16 prompts, 6 API routes, 5 telas dashboard, migrations 029-036 | ✅ |
| **Dashboard Gestor** | `app/dashboard/gestor/equipe-evolucao/`, `actions.js` | ✅ |
| **Painéis Admin Vertho** | 4 telas em `app/admin/vertho/`, `lib/ia-cost-catalog.js` | ✅ |
| **Evolution Report + PDF** | `actions/evolution-report.js`, `lib/temporada-concluida-pdf.js`, `app/dashboard/temporada/concluida/` | ✅ |
| **Plenária** | `lib/plenaria-equipe-pdf.js`, `/api/gestor/plenaria/pdf` | ✅ |
| **Relatório Comportamental** | `colaboradores.report_texts`, prompt, 4 componentes PDF | ✅ |
| **Fit v2** | `lib/fit-v2/`, `actions/fit-v2.js`, `/admin/fit` | ✅ |
| **Pipeline Bunny** | import → tagging IA → consumo via temporada | ✅ |

---

_Relatório atualizado em 2026-04-15. Credenciais em `.env.local` existem mas não foram extraídas._
