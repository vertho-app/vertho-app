# Vertho Mentor IA — Arquitetura do Sistema

> Documento oficial de arquitetura — SaaS B2B de desenvolvimento de competencias por IA.
> Ultima atualizacao: 25/05/2026 (HEAD `2730cd7` — RadarEmpresas + i18n + auditoria/permissoes + OTP WhatsApp + hardening RLS)
> Revisado contra o codigo-fonte local e estado atual do workspace
> Metodo: auditoria automatizada + revisao manual

---

## Legenda de Status

| Icone | Significado |
|---|---|
| ✅ | Operacional em producao |
| ⚡ | Implementado parcialmente |
| 📋 | Planejado / estrutura pronta |
| 🔑 | Depende de credenciais / config externa |

---

## 1. Visao Geral da Stack

| Camada | Tecnologia | Versao | Status |
|--------|-----------|--------|--------|
| **Framework** | Next.js (App Router) | 16.2.4 | ✅ |
| **UI** | React | 19.2.4 | ✅ |
| **Estilizacao** | Tailwind CSS | 4.0 | ✅ |
| **Icones** | Lucide React | 1.7.0 | ✅ |
| **Banco de Dados** | Supabase (PostgreSQL) | — | ✅ |
| **Auth** | Supabase Auth (Magic Link + Senha) | — | ✅ |
| **IA Principal** | Anthropic SDK (Claude Sonnet 4.6) | 0.81.0 | ✅ |
| **IA Secundaria** | Google Gemini | via fetch nativo | ✅ |
| **IA Validacao** | Gemini (auditor multi-LLM) | via fetch nativo | ✅ |
| **IA Leve** | Claude Haiku 4.5 (Tira-Duvidas, Simulador) | via SDK | ✅ |
| **PDF** | @react-pdf/renderer (geracao) | 4.4.0 | ✅ |
| **PDF Reader** | pdfjs-dist (leitura) | 5.6 | ✅ |
| **Embeddings** | Voyage AI (voyage-3-large) | — | ✅ |
| **Spreadsheet parse** | read-excel-file | 8.0 | ✅ |
| **Filas** | Upstash QStash | 2.10.1 | ✅ |
| **WhatsApp** | Z-API (REST) | — | 🔑 |
| **Email** | Resend SDK | 6.12 | 🔑 |
| **Scraping Primario** | Jina AI Reader | — | ✅ |
| **Scraping Fallback** | Firecrawl | — | 🔑 |
| **Error Tracking** | Sentry | — | 🔑 |
| **TypeScript** | tsc --noEmit (strict: false) | 5.9 | ✅ |
| **Testes** | Playwright + smoke-test.js | — | ✅ |
| **i18n** | next-intl (pt-BR / pt-PT / es-ES) | — | ✅ |
| **Hospedagem** | Vercel (Serverless) | — | ✅ |
| **DNS/CDN** | Cloudflare (Full Strict SSL) | — | ✅ |
| **Dominio** | vertho.ai (apex no Gamma) + app.vertho.ai (auth/admin) + *.vertho.ai (tenants) + radar.vertho.ai + imprensa.vertho.ai. **radarbett.vertho.ai DESCONTINUADO** (301 → radar/vertho.ai). vertho.com.br legado, mantido no proxy so por compat de DNS antigo. | — | ✅ |
| **Pipeline de dados** | DuckDB + Parquet + Python (RadarEmpresas, local) | — | ✅ |
| **CI/CD** | GitHub Actions (smoke test no push) | — | ✅ |

**Config Next.js**: `experimental.serverActions.bodySizeLimit = '50mb'` (Next 16 compat).

---

## 1.1 Estado de Retomada (25/05/2026)

Contexto rapido para reinicializacao da maquina:

- Branch atual: `master`, HEAD `2730cd7`. Migrations 022-117 aplicadas em prod. ~100 commits desde a revisao anterior (14/05).
- Working tree limpo. `.gitignore` agora ignora `*.log`, `.tmp_*/`, `/backups/` (PII) e `/.agents/skills/` (vendorado via `skills-lock.json`).
- Nao versionados intencionalmente: `.tmp_enem_2024/` (2,2 GB microdados ENEM), `data-pipeline/radarempresas/**/out/` e Parquets (calculo pesado fica local).
- Frentes desde 14/05:
  - **RadarEmpresas** (~50 commits, migrations 099-111) — modulo INTERNO de inteligencia comercial B2B. Receita Federal + CAGED + RAIS + CEMPRE/SIDRA, pipeline DuckDB local, Score de Oportunidade v5, deteccao de redes/franquias, funil enderecavel, "Potencial por Cidade" (TAM Empresas+Escolas). Detalhes na **secao 19**.
  - **i18n** (commit `50a5b9b`, migration 114) — next-intl com pt-BR/pt-PT/es-ES. Locale em `empresas.default_locale` + `colaboradores.locale`. Detalhes na **secao 20**.
  - **Auditoria + Matriz de Permissoes** (commits `2b5a63c`, `7443380`, `5bd44e2`, `e1a1638`, migrations 116-117) — `admin_audit_log` + `/admin/auditoria`; matriz papel×permissao (`lib/permissions.ts`) + overrides auditaveis + `/admin/permissoes`. Detalhes na **secao 21**.
  - **Login OTP WhatsApp** (commit `32ddf15`, migration 112) — colaborador sem email entra por codigo no WhatsApp, via email-proxy deterministico. Detalhes na **secao 22**.
  - **Hardening de seguranca** (~15 commits + migration 113) — guard centralizado `requireAdminSupabase()`, AdminGuard movido pra server layout, RLS real fechada em tabelas sensiveis (alerta Supabase "Table publicly accessible"). Detalhes em **3.3** e **secao 11**.
  - **radarbett descontinuado** (commit `b04e3ee`) — 301 redirect; frentes "Onde a Vertho pode ajudar" migradas pro Radar (commit `0c57c19`). Codigo dormant.
  - **Radar — matriculas Censo** (commits `8561f40`, `3b6f195`, `d697118`, migration 115) — coluna `matriculas` (QT_MAT_BAS) na ficha da escola.
  - **Regular DUO vira default global** (commit `f148e9b`) — ver secao 17.11.
- Para retomar localmente: entrar em `C:\GAS\Vertho App\nextjs-app`, rodar `npm run dev` e acessar `http://localhost:3000`.

---

## 2. Estrutura de Pastas (~378 arquivos TS/TSX + ~58 .js/.mjs em scripts, tests e configs)

```
nextjs-app/
├── middleware.js                  # Roteamento multi-tenant por subdominio
├── sentry.client.config.js       # Sentry (browser errors)
├── sentry.server.config.js       # Sentry (server errors)
├── sentry.edge.config.js         # Sentry (middleware errors)
├── vercel.json                   # Cron jobs (4 triggers)
├── playwright.config.js          # Config testes e2e
├── .env.example                  # Template env vars (sem segredos)
├── .github/
│   └── workflows/
│       └── smoke-test.yml        # CI/CD: smoke test em cada push
├── app/
│   ├── layout.tsx                # Root layout (Inter font, meta, theme)
│   ├── icon.svg                  # Favicon SVG
│   ├── globals.css               # Tailwind + design tokens (navy, cyan, teal)
│   ├── global-error.tsx          # Error boundary → Sentry
│   ├── not-found.tsx             # 404 page
│   ├── page.tsx                  # Redirect → /login
│   ├── login/
│   │   ├── page.tsx              # Server Component: resolve tenant → branding
│   │   └── login-form.tsx        # Client: Magic Link + senha
│   ├── dashboard/                # Area do colaborador (autenticado)
│   │   ├── page.tsx              # Card Votacao Aberta + Foco da semana + Acesso Rapido
│   │   ├── home/page.tsx         # Dashboard "home" alternativo (KPIs + hero por fase)
│   │   ├── layout.tsx            # Shell: header + bottom nav + BETO
│   │   ├── dashboard-shell.tsx   # Client: nav
│   │   ├── dashboard-actions.ts  # loadDashboardData() com RBAC explicito
│   │   ├── assessment/
│   │   │   ├── page.tsx          # Lista competencias com status
│   │   │   ├── assessment-actions.ts
│   │   │   └── chat/page.tsx     # Motor Conversacional Fase 3
│   │   ├── pdi/page.tsx          # PDI com cards expandiveis
│   │   ├── perfil/page.tsx       # Perfil + DISC preview + logout
│   │   ├── perfil-comportamental/
│   │   │   ├── page.tsx          # Resultado DISC ou "Iniciar Mapeamento"
│   │   │   ├── mapeamento/page.tsx # Instrumento DISC completo (29 steps)
│   │   │   └── relatorio/page.tsx  # Relatorio comportamental detalhado
│   │   ├── votacao/page.tsx      # NOVO: Votacao em competencias por cargo (case+accent insensitive)
│   │   ├── evolucao/page.tsx     # Comparativo inicial vs reavaliacao
│   │   ├── jornada/page.tsx      # Timeline vertical 5 fases
│   │   ├── praticar/
│   │   │   ├── page.tsx          # Pilula semanal + progresso
│   │   │   └── evidencia/page.tsx # Formulario de evidencia
│   │   ├── temporada/
│   │   │   ├── page.tsx          # Timeline 14 semanas (cards coloridos)
│   │   │   ├── semana/[week]/page.tsx  # Player + desafio + Tira-Duvidas + Evidencias
│   │   │   ├── sem14/page.tsx    # Wizard 4 perguntas (cenario B)
│   │   │   └── concluida/page.tsx # Temporada Concluida (5 blocos + PDF)
│   │   └── gestor/
│   │       ├── page.tsx          # Hub do gestor
│   │       └── equipe-evolucao/  # Dashboard gestor
│   │           ├── page.tsx      # Lista liderados + delta + status + filtros
│   │           └── actions.ts    # Server actions do gestor
│   ├── admin/                    # Painel administrativo
│   │   ├── layout.tsx            # Wrapper AdminGuard
│   │   ├── admin-guard.tsx       # Server-side via platform_admins
│   │   ├── admin-actions.ts      # checkAdminAccess()
│   │   ├── dashboard/page.tsx    # Redesign 2026-05: sidebar + header (filtro empresa via React Portal, persistido em localStorage) + bento grid
│   │   ├── empresas/
│   │   │   ├── nova/             # Form: nome + segmento (auto-slug)
│   │   │   ├── gerenciar/        # Import CSV com role + area_depto + ordenacao por coluna
│   │   │   └── [empresaId]/
│   │   │       ├── page.tsx      # Pipeline Fases 0-5 + Danger Zone (limpar competencias/colabs)
│   │   │       ├── actions.ts
│   │   │       ├── fase0/page.tsx # Onboarding empresa
│   │   │       ├── fase1/page.tsx # Top 10, Gabarito, Cenarios
│   │   │       ├── fase2/page.tsx # Diagnostico + Trilhas
│   │   │       ├── fase4/page.tsx # NOVO: Envios diagnostico (WhatsApp/email lote)
│   │   │       ├── votacao/page.tsx       # NOVO: Resultados votacao por cargo + badge % votantes por cargo + total geral
│   │   │       ├── perfil-externo/page.tsx # NOVO: Cadastro externo (autosvc) p/ piloto
│   │   │       ├── perfis-comportamentais/page.tsx # NOVO 2026-05: Tela admin de perfis DISC por empresa
│   │   │       ├── relatorios/page.tsx
│   │   │       └── configuracoes/page.tsx  # 5 tabs (incluindo Branding c/ "Vincular ao Vercel")
│   │   ├── cargos/               # Top 5 selection
│   │   ├── competencias/         # CRUD completo + copy da base
│   │   ├── assessment-descritores/ # Grid colab x descritor (notas 1-4)
│   │   ├── conteudos/            # Banco micro-conteudos + Bunny import + tagging IA
│   │   ├── temporadas/           # Viewer temporadas + botao Simulador
│   │   ├── evolucao/             # Evolution Report agregado
│   │   ├── ppp/                  # Extracao PPP (.docx via mammoth, multi-escola)
│   │   ├── relatorios/           # Download PDFs
│   │   ├── whatsapp/             # Disparo lote
│   │   ├── simulador/            # Sandbox chat
│   │   ├── fit/                  # Fit v2
│   │   ├── top10/                # IA1 top 10
│   │   ├── videos/               # Analytics Bunny
│   │   ├── platform-admins/      # Gestao admins
│   │   ├── preferencias-aprendizagem/
│   │   ├── lixeira/              # NOVO: Restore de registros excluidos
│   │   ├── radar/                # NOVO: Ingestao Radar (Saeb/ICA/Censo) + qualidade + funnel analytics
│   │   │   ├── page.tsx
│   │   │   ├── funnel/page.tsx
│   │   │   ├── funnel-bett/page.tsx
│   │   │   └── qualidade-dados/page.tsx
│   │   └── vertho/               # Paineis Admin Vertho
│   │       ├── evidencias/       # Conversas socraticas 1-12, extracao, transcript
│   │       ├── avaliacao-acumulada/  # Nota por descritor + auditoria + regerar
│   │       ├── auditoria-sem14/  # 4 notas + delta + regerar com feedback
│   │       ├── simulador-custo/  # Calculadora interativa custo IA
│   │       └── knowledge-base/   # CRUD base conhecimento RAG per-tenant
│   ├── radar/                    # NOVO: Site publico Radar Vertho (radar.vertho.ai)
│   │   ├── page.tsx              # Home com busca + 3 stats reais
│   │   ├── escola/[inep]/        # Hero + Saeb + Ideb + ENEM + SARESP + Censo + benchmarks + IA
│   │   ├── municipio/[ibge]/     # Hero + ICA + FUNDEB + VAAR + variabilidade + IA
│   │   ├── rede/[ibge]/          # Rede municipal
│   │   ├── estado/[uf]/          # Stats UF + microrregioes + Top/Bottom 10
│   │   ├── comparar/             # Lado a lado de ate 4 escolas
│   │   ├── metodologia/, bett/, sitemap.ts, robots.ts
│   │   └── _components/          # 23 componentes vh3
│   ├── radarbett/                # NOVO: Site publico Bett 2026 (radarbett.vertho.ai)
│   │   ├── page.tsx              # Home com tipografia Plus Jakarta Sans + Fraunces (escopadas)
│   │   ├── escola/[inep]/, municipio/[ibge]/, comparar/, buscar/, jornada/, metodologia/
│   │   ├── _lib/whatsapp.ts      # openWhatsAppAgendar(ctx) — "Agendar conversa" abre WhatsApp direto
│   │   ├── _lib/tracking.ts      # Eventos de funil Bett
│   │   └── _components/          # header, busca, lead modal, sticky CTA, whatsapp icon
│   ├── actions/
│   │   ├── beto.ts               # BETO contextual
│   │   └── manutencao.ts
│   └── api/
│       ├── chat/route.ts         # Motor Conversacional
│       ├── chat-simulador/route.ts
│       ├── assessment/route.ts
│       ├── colaboradores/route.ts
│       ├── upload-logo/route.ts
│       ├── cron/route.ts         # 4 cron jobs
│       ├── content/search/route.ts  # Busca micro_conteudos
│       ├── capacitacao-recomendada/route.ts  # multi-formato por comp foco
│       ├── relatorios/individual/route.ts
│       ├── relatorios/pdf/route.ts
│       ├── temporada/
│       │   ├── reflection/route.ts    # Chat socratico/analitico (c/ grounding RAG)
│       │   ├── tira-duvidas/route.ts  # Chat reativo Haiku 4.5 (c/ grounding RAG)
│       │   ├── missao/route.ts        # set_modo + compromisso
│       │   ├── evaluation/route.ts    # Sem 14 wizard + triangulacao
│       │   └── concluida/pdf/route.ts # PDF Evolution Report
│       ├── gestor/
│       │   └── plenaria/pdf/route.ts  # PDF Plenaria equipe
│       ├── webhooks/
│       │   ├── bunny/route.ts
│       │   ├── qstash/route.ts
│       │   └── qstash/whatsapp-cis/route.ts
│       └── ...
├── actions/                      # Server Actions (logica de negocio, 42 arquivos .ts)
│   ├── ai-client.ts              # callAI + callAIChat + Extended Thinking
│   ├── utils.ts                  # extractJSON, extractBlock, stripBlocks
│   ├── fase1.ts                  # IA1, IA2, IA3, Cenarios (Top 10 case+accent insensitive)
│   ├── fase2.ts                  # Forms, emails, coleta, status
│   ├── fase3.ts                  # IA4, relatorios
│   ├── fase4.ts                  # PDI, trilhas, triggers
│   ├── fase5.ts                  # Reavaliacao, evolucao, plenaria
│   ├── temporadas.ts             # Motor de Temporadas (gerar, carregar, listar)
│   ├── conteudos.ts              # Banco micro-conteudos + Bunny + tagging IA
│   ├── conteudos-metrics.ts      # Metricas de conteudos
│   ├── recalcular-impacto-conteudo.ts  # NOVO: Recalculo periodico de impacto
│   ├── avaliacao-acumulada.ts    # Auto-trigger pos sem 13, dual-IA
│   ├── evolution-report.ts       # Consolida sems 13+14
│   ├── temporada-concluida.ts    # Dados tela Concluida
│   ├── simulador-temporada.ts    # 1 sem/chamada, 4 perfis, Haiku
│   ├── assessment-descritores.ts # CRUD assessment descritores
│   ├── cenario-b.ts              # Cenario B
│   ├── check-ia4.ts              # Validacao 4D x 25pts = 100
│   ├── evolucao-granular.ts      # Delta por descritor
│   ├── fit-v2.ts                 # Calculo Fit v2
│   ├── trilhas-load.ts           # Carregar trilhas
│   ├── tutor-evidencia.ts        # Avaliacao evidencia
│   ├── competencias.ts           # CRUD por empresa
│   ├── competencias-base.ts      # CRUD base global
│   ├── votacao.ts                # NOVO: Votacao colabs nas top10 do cargo (load+save case+accent insensitive)
│   ├── perfil-externo.ts         # NOVO: Onboarding autosvc para piloto
│   ├── lead-comercial.ts         # NOVO: Captura de lead via Radar
│   ├── ppp.ts                    # Jina + Firecrawl + 10 secoes (.docx via mammoth, multi-escola)
│   ├── onboarding.ts             # Criar empresa, importar, config
│   ├── cron-jobs.ts              # cleanup, segunda, quinta
│   ├── dashboard-kpis.ts         # KPIs home
│   ├── bunny-stats.ts            # Metricas Bunny
│   ├── video-analytics.ts        # Analytics por colab
│   ├── video-tracking.ts         # Registro views
│   ├── whatsapp.ts               # Z-API
│   ├── whatsapp-lote.ts          # QStash lote
│   ├── automacao-envios.ts       # PDF + WhatsApp lote
│   ├── relatorios.ts             # Geracao relatorios (c/ grounding RAG)
│   ├── relatorios-load.ts        # Load relatorios
│   ├── simulador-conversas.ts    # Simulador admin
│   ├── simulador-disc.ts         # Simulador DISC
│   ├── backup.ts                 # Backup actions
│   ├── preferencias-aprendizagem.ts
│   └── manutencao.ts
├── components/
│   ├── beto-chat.tsx             # Chat flutuante (hidden em semana pages)
│   ├── mic-input.tsx             # Web Speech API (forwardRef + stop on send)
│   ├── page-shell.tsx            # PageContainer, PageHero, GlassCard, SectionHeader
│   ├── preferencias-ranking.tsx
│   ├── video-modal.tsx           # Bunny iframe + postMessage tracking
│   ├── dashboard/
│   │   ├── RHView.tsx
│   │   └── ManagerView.tsx
│   └── pdf/
│       ├── styles.ts             # NotoSans, paleta, helpers
│       ├── RelatorioTemplate.tsx
│       ├── RelatorioIndividual.tsx
│       ├── RelatorioGestor.tsx
│       ├── RelatorioRH.tsx
│       ├── PdfCover.tsx
│       ├── SectionTitle.tsx
│       ├── StatusBadge.tsx
│       ├── CompetencyBlock.tsx
│       └── ChecklistBox.tsx
├── lib/                          # ~60 arquivos (.ts + .js residuais em fit-v2/, prompts/)
│   ├── supabase.ts               # createSupabaseClient + createSupabaseAdmin
│   ├── supabase-browser.ts       # Singleton browser client
│   ├── tenant-resolver.ts        # resolveTenant(slug) cache 5min
│   ├── tenant-db.ts              # Helper multi-tenant DB
│   ├── ui-resolver.ts            # getCustomLabel + isHidden
│   ├── authz.ts                  # RBAC: getUserContext, isPlatformAdmin, roles
│   ├── auth/                     # NOVO: action-context (requireAdminAction, requireUserAction, requireAdminOrCronAction), fetch-auth, request-context
│   ├── csrf.ts                   # NOVO: Tokens anti-CSRF
│   ├── rate-limit.ts             # NOVO: Rate limiting in-memory + dedup
│   ├── domain.ts                 # NOVO: Helpers de dominio (vertho.ai resolution)
│   ├── vercel-domain.ts          # NOVO: Vincular subdominio Vercel via API (botao manual)
│   ├── perfil-comportamental.ts  # NOVO: Helper perfil DISC
│   ├── perfil-externo/           # NOVO: Logica perfil externo (autosvc piloto)
│   ├── sentry-scrub-pii.ts       # NOVO: Scrub PII antes de enviar pro Sentry
│   ├── radar/                    # NOVO: Camada de dados+IA do Radar
│   │   ├── queries.ts            # getEscola, getMunicipio, getRede, getEstadoStats, benchmarks
│   │   ├── ica-benchmarks-oficiais.ts  # MEC oficial: Brasil 2025=66%, por UF 2023-2025
│   │   ├── ia-narrativa.ts       # Cache (scope, prompt_version, dados_hash) + isLikelyBot
│   │   ├── proposta-pdf-data.ts  # IA da proposta do PDF
│   │   ├── leitura-deterministica.ts  # Textos sem IA (fallback SEO) + fmt percentual
│   │   ├── saeb-importer.ts, ica-importer.ts, censo-importer.ts
│   │   ├── censo-scores.ts       # 4 scores agrupados por familia de campo
│   │   ├── eventos.ts            # registrarEvento server-side (funnel)
│   │   └── hash.ts               # stableJsonHash p/ cache IA
│   ├── versioning.ts             # Prompt versioning (SHA-256 dedup)
│   ├── logger.ts                 # Logger estruturado
│   ├── notifications.ts          # Templates email + WhatsApp
│   ├── competencias-base.ts      # Arrays educacao/corporativo + PILAR_COLORS
│   ├── pdf-assets.ts             # Assets para PDFs
│   ├── markdown-to-pdf.ts        # Converter markdown para PDF
│   ├── parse-spreadsheet.ts      # Parser planilhas (read-excel-file v8)
│   ├── pii-masker.ts             # Mascara PII antes de enviar para LLMs externos
│   ├── ai-tasks.ts               # Tasks IA auxiliares
│   ├── ia-cost-catalog.ts        # Catalogo chamadas IA x modelos x presets (inclui RAG)
│   ├── embeddings.ts             # Wrapper Voyage / OpenAI embedding provider
│   ├── rag.ts                    # kb_search_hybrid + formatacao grounding
│   ├── rag-ingest.ts             # Parser PDF/DOCX -> chunks -> embedding
│   ├── rag-seed.ts               # 6 docs seed (regua, modos missao, privacidade...)
│   ├── temporada-concluida-pdf.ts  # PDF Evolution Report individual
│   ├── plenaria-equipe-pdf.ts    # PDF Plenaria consolidado do time
│   ├── disc-arquetipos.ts
│   ├── avatar-presets.ts
│   ├── preferencias-config.ts
│   ├── season-engine/            # Motor de Temporadas
│   │   ├── programa-config.ts    # PROGRAMA_REGULAR_DUO (default) + REGULAR + ONBOARDING
│   │   ├── build-season.ts       # buildSeason(): 14 semanas (missao+cenario em paralelo)
│   │   ├── select-descriptors.ts # selectDescriptors / selectDescriptorsDuo / *Multi
│   │   ├── week-gating.ts        # Gate calendario + anterior concluida
│   │   └── prompts/              # 16 prompts (todos .ts)
│   │       ├── socratic.ts       # Evidencias: 6 turnos, DISC, anti-alucinacao (c/ grounding)
│   │       ├── analytic.ts       # Feedback analitico: 10 turnos
│   │       ├── challenge.ts      # Desafio semanal
│   │       ├── scenario.ts       # Cenario situacional
│   │       ├── tira-duvidas.ts   # Chat reativo Haiku 4.5 (c/ grounding)
│   │       ├── missao.ts         # Missao pratica
│   │       ├── missao-feedback.ts # IA analisa relato (10 turnos, c/ grounding)
│   │       ├── acumulado.ts      # Avaliacao acumulada (cega, dual-IA)
│   │       ├── evolution-qualitative.ts  # Sem 13: 12 turnos, 6 etapas
│   │       ├── evolution-scenario.ts     # Sem 14 cenario
│   │       ├── evolution-scenario-check.ts # Check 2a IA
│   │       ├── simulador-temporada.ts    # 4 perfis
│   │       ├── case-study.ts
│   │       ├── text-content.ts
│   │       ├── video-script.ts
│   │       └── podcast-script.ts
│   ├── fit-v2/
│   │   ├── engine.ts
│   │   ├── blocos.ts
│   │   ├── classificacao.ts
│   │   ├── gap-analysis.ts
│   │   ├── penalizacoes.ts
│   │   ├── ranking.ts
│   │   └── validacao.ts
│   ├── prompts/
│   │   ├── behavioral-report-prompt.js
│   │   ├── fit-executive-prompt.js
│   │   └── insights-executivos-prompt.js
│   └── supabase/
│       └── mapCISProfile.ts
├── scripts/
│   ├── smoke-test.js
│   ├── backfill-embeddings.js    # NOVO: re-gera embeddings ao trocar provider
│   ├── backup-project.ps1
│   ├── checkpoint.ps1
│   ├── auto-backup-diario.ps1
│   └── instalar-backup-automatico.ps1
├── tests/                        # Playwright + Vitest (27 arquivos de teste)
├── migrations/                   # 70 arquivos SQL (022 -> 089, inclui 085 v1/v2)
├── tsconfig.json                 # TypeScript config (strict:false, allowJs, checkJs:false)
├── docs/
│   ├── envs-importantes.md
│   ├── rag-architecture.md       # NOVO: Arquitetura RAG (Voyage, pgvector, backfill, pitfalls)
│   ├── typescript-migration.md   # NOVO: Guia migracao TS (config, criterios, erros comuns)
│   ├── tenant-db-migration.md
│   ├── migrations-workflow.md
│   ├── checklist-antes-de-prompt-grande.md
│   ├── checklist-antes-de-deploy.md
│   └── rotina-antifalha.md
└── public/
    ├── logo-vertho.png
    └── pdf.worker.min.mjs
```

---

## 3. Arquitetura Multi-Tenant e Fronteira de Tenant

### 3.1 Roteamento por Subdominio (`proxy.js`)
> O roteamento foi migrado de `middleware.js` para o Next Proxy (`proxy.js`, export `proxy()`) — commits `38a8b71` + `4bac514`. Comportamento equivalente, API nova do Next 16.
```
{slug}.vertho.ai/login
  → proxy.js extrai slug do hostname (extractTenantSlug, suporta .ai e .com.br)
  → Rejeita RESERVED_SUBDOMAINS (www, app, api, admin, radar, radarbett, imprensa, ...)
  → Injeta header x-tenant-slug + cookie vertho-tenant-slug (httpOnly, p/ server actions)
  → Server Components resolvem tenant via lib/tenant-resolver.ts (cache 5min)
  → radar.vertho.ai     → reescreve para /radar/<path>     (site publico Radar)
  → imprensa.vertho.ai  → reescreve para /imprensa/<path>   (NOVO: pagina institucional nativa)
  → radarbett.vertho.ai → 301 redirect (deep-links equivalentes → radar; resto → vertho.ai)  [DESCONTINUADO]
  → app.vertho.ai       → app principal (auth/admin)
```

**Apex `vertho.ai`**: hospedado no Gamma (home institucional). `next.config.mjs` tem rewrite condicional via `GAMMA_HOME_URL` caso o apex migre pro Vercel. `imprensa.vertho.ai` ja e nativa da Next (`app/imprensa/page.tsx`).

**Vincular subdominio ao Vercel**: a partir de 2026-04, o registro NAO eh mais automatico em `criarNovaEmpresa`. Existe botao **"Vincular ao Vercel"** em `/admin/empresas/{id}/configuracoes` (aba Branding) — usa `lib/vercel-domain.ts`. Razao: cliente Ibipeba falhou silenciosamente no auto-registro.

### 3.2 Resolucao do Tenant
```
lib/tenant-resolver.js:
  resolveTenant(slug)
    → SELECT * FROM empresas WHERE slug = $1
    → Cache em memoria por 5 minutos
    → Retorna: id, nome, slug, segmento, ui_config, sys_config
    → Se nao encontrar: retorna null (login mostra erro)
```

### 3.3 Isolamento de Dados

**Camada 1 — Schema (FK)**
- Todas as tabelas transacionais possuem `empresa_id` (FK para `empresas.id`)

**Camada 2 — RLS (Row Level Security)** — *reforçada na migration 113 (25/05)*
- Tabelas com leitura direta do browser autenticado ganharam policies **reais por tenant** (não mais `USING (true)`): `empresas`, `colaboradores`, `sessoes_avaliacao`, `mensagens_chat` — via funções SECURITY DEFINER `current_empresa_id()` / `current_colaborador_id()` / `can_read_sessao_avaliacao()`.
- Tabelas exclusivamente server-side (`colab_otp`, `tutor_log`, `platform_admins`, `reavaliacao_sessoes`, `videos_watched`, `ia_usage_log`, `fase4_progresso`, ...) ficam **sem policy** = anon/authenticated bloqueados; `service_role` continua com bypass.
- "Cinto e suspensório": qualquer tabela `public` ainda sem RLS é fechada por um `DO $$` final. Verificação da migration retorna **0 tabelas public sem RLS**.
- Fecha o alerta Supabase "Table publicly accessible". Confirmado aplicado em prod (5/5 policies + 3/3 funções presentes).
- **Status real**: as queries server-side continuam usando `createSupabaseAdmin()` (service_role bypassa RLS), mas agora o cliente browser autenticado (anon key) só enxerga o próprio tenant — defense-in-depth real para leituras client-side.

**Camada 3 — Codigo (Server Actions + API Routes)**
- Server actions usam `createSupabaseAdmin()` com filtro EXPLICITO de `empresa_id`
- API routes: `/api/colaboradores` exige `empresa_id` no request

**Camada 4 — Auth Action Context + Guard centralizado (hardening 05/2026)**
- `lib/auth/action-context.ts` provê as guardas de server action:
  - `requireAdminAction()` — exige platform admin
  - `requireUserAction()` — exige usuário autenticado (qualquer role)
  - `requireAdminOrCronAction()` — admin OU chamada do cron QStash assinada
  - `requirePermissionAction()` — exige permissão específica da matriz (ver seção 21)
- **`lib/admin-supabase.ts::requireAdminSupabase()`** (NOVO) — colapsa `requireAdminAction()` + `createSupabaseAdmin()` em 1 chamada. ~15 commits migraram as server actions admin pra este padrão. `createSupabaseAdmin()` cru só é permitido na allowlist (`config/service-role-allowlist.json`); CI falha se vazar.
- **AdminGuard movido pra server layout** (`app/admin/layout.tsx`, commit `c604c7c`): identidade 100% server-side via cookie SSR (`checkAdminAccess` → `isPlatformAdmin`), sem confiar em input do client.
- Migration 081: RLS restrita em `diag_analises_ia`

### 3.4 Branding por Tenant
Coluna `ui_config JSONB`: logo_url, 7 cores, font_color, login_subtitle, hidden_elements, labels.

### 3.5 Config por Tenant
Coluna `sys_config JSONB`: ai_model, cadencia, envios.

---

## 4. RBAC (Controle de Acesso Baseado em Papeis)

### 4.1 Papeis por Tenant
Coluna `role` em `colaboradores`: `colaborador` | `gestor` | `rh` | `tutor` (ver 17.5).

### 4.1.1 Matriz de Papeis × Permissoes (NOVO — seção 21)
A partir de `e1a1638`, RBAC deixou de ser binário (admin/não-admin) e passou a ter uma **matriz declarativa** em `lib/permissions.ts`: 5 papéis de sistema (`platform_admin`, `rh`, `gestor`, `tutor`, `colaborador`) × 31 permissões nomeadas (`companies.*`, `users.*`, `assessments.*`, `reports.*`, `radar_empresas.access`, `audit.view`, ...). Overrides auditáveis por papel ou por usuário vivem em `permission_overrides` (migration 117). Console em `/admin/permissoes`. Detalhes na seção 21.

### 4.2 Admin da Plataforma
Tabela `platform_admins` — admins globais. RLS habilitado.

### 4.3 Dashboard por Papel
- **colaborador**: progresso pessoal + temporada
- **gestor**: KPIs da equipe + equipe-evolucao + plenaria + seu progresso
- **rh**: KPIs da empresa inteira + seu progresso

### 4.4 Admin Guard
```
checkAdminAccess():
  1. Busca email do usuario autenticado
  2. Consulta platform_admins por email
  3. Fallback: verifica ADMIN_EMAILS env var
  4. Se nenhum match: redireciona para /login
```

---

## 5. Motor de IA

### 5.1 Roteador Universal
```
callAI(system, user, aiConfig, maxTokens, options)     → single-turn
callAIChat(system, messages, aiConfig, maxTokens, options) → multi-turn
options.thinking = true → Extended Thinking (budget 32k/65k)
```

Modelos: Claude Sonnet 4.6, Claude Opus 4.6, Claude Haiku 4.5, Gemini 3 Flash, Gemini 3.1 Pro

### 5.2 Motor Conversacional (api/chat/route.js)
- System prompt: ~120 linhas
- State machine: cenario → aprofundamento → contraexemplo → encerramento → concluida
- Business rules: MIN_EVIDENCIAS=2, MIN_MSG=10, MAX_MSG=4096, CONFIANCA_ENCERRAR=80

### 5.3 Catalogo de Prompts do Motor de Temporadas

| Prompt | Arquivo | Turnos | Modelo | Uso |
|---|---|---|---|---|
| Tira-Duvidas | `tira-duvidas.ts` | ilimitado | Haiku 4.5 | Chat reativo, guard-rail descritor, grounding RAG |
| Evidencias (socratica) | `socratic.ts` | 6 | Sonnet | DISC + anti-alucinacao + grounding RAG |
| Desafio | `challenge.ts` | — | Sonnet | JSON: desafio_texto, acao_observavel, criterio_de_execucao, por_que_cabe_na_semana |
| Cenario | `scenario.ts` | — | Sonnet | JSON + parseCenarioResponse + cenarioToMarkdown |
| Missao | `missao.ts` | — | Sonnet | JSON + parseMissaoResponse + missaoToMarkdown |
| Missao Feedback | `missao-feedback.ts` | 10 | Sonnet | IA analisa relato (c/ grounding RAG) |
| Analitico (fallback) | `analytic.ts` | 10 | Sonnet | Feedback cenario escrito |
| Evolution Qualitativa | `evolution-qualitative.ts` | 12 | Sonnet | Sem 13: 6 etapas, microcaso, DISC |
| Extracao pos-conversa (6.7) | `socratic.ts` | — | Sonnet | JSON: sinais_extraidos, forca_evidencia, trecho_sustentador, alertas_metodologicos |
| Sem13 extracao (6.9.1) | `evolution-qualitative.ts` | — | Sonnet | JSON: confianca 0-1, citacoes_literais, limites_da_leitura |
| Acumulada (6.10) | `acumulado.ts` | single-shot | Sonnet + auditor | JSON: forca_do_padrao, trechos_sustentadores, limites_da_base. validateAvaliacaoAcumulada |
| Check Acumulada (6.11) | `acumulado.ts` | single-shot | auditor | 6 criterios ponderados, 3-status. validateAvaliacaoAcumuladaCheck |
| Sem14 scorer (6.12) | `evolution-scenario.ts` | — | Sonnet | resumo_avaliacao ALWAYS object. validateEvolutionScenarioScore |
| Check sem14 (6.13) | `evolution-scenario-check.ts` | — | Sonnet | 6 criterios. validateEvolutionScenarioCheck |
| Simulador | `simulador-temporada.ts` | 1 sem/chamada | Haiku | 4 perfis comportamentais |
| Case Study | `case-study.ts` | — | Sonnet | Geracao de caso |
| Texto | `text-content.ts` | — | Sonnet | Geracao de artigo |
| Video Script | `video-script.ts` | — | Sonnet | Roteiro video |
| Podcast Script | `podcast-script.ts` | — | Sonnet | Roteiro podcast |
| PDI (7.1) | `fase4.ts` | — | Sonnet | JSON: resumo_geral always object, plano_30_dias always {foco, acoes}, estudo_recomendado always objects |
| Gestor (7.2) | `relatorios.ts` | — | Sonnet | JSON: resumo_executivo always object, risco_se_nao_agir, impacto_se_nao_agir |
| RH (7.3) | `relatorios.ts` | — | Sonnet | JSON: resumo_executivo always object, perfil_disc always forca_coletiva/risco_coletivo |
| PPP (8.1-8.3) | `ppp.ts` | — | Sonnet | _metadata_extracao, prudencia reforcada |
| Comportamental (9.1) | `behavioral-report-prompt.js` | — | Sonnet | Campos extras: relacoes_e_comunicacao, modo_de_trabalho, frases_chave |
| Tags IA (11.5) | `conteudos.ts` | — | Sonnet | Vocabulario controlado, confianca enum |

### 5.4 Avaliacao Sem 14 (Triangulacao)
- Cenario B SEMPRE do `banco_cenarios` (sem fallback IA)
- 4 perguntas sequenciais: SITUACAO/ACAO/RACIOCINIO/AUTOSSENSIBILIDADE
- Scorer triangula: cenario + acumulada + evidencias 13 semanas
- Check por 2a IA
- Ponderacao: consistente / divergente cenario superior / divergente cenario inferior
- 4 notas por descritor: pre, acumulada, cenario, final
- `nota_cenario` isolada + `nota_pos` triangulada
- Granularidade 0.1 (era 0.5)

### 5.5 Versionamento de Prompts
Tabela `prompt_versions` (SHA-256 dedup).

### 5.6 Tokens
| Fase | Tokens |
|---|---|
| Conversa | 1.024 |
| Avaliacao [EVAL] | 32.768 |
| Auditoria [AUDIT] | 65.536 |
| Relatorios | 64.000 |
| Acumulada (1a IA) | 8.000 |
| Acumulada (auditor) | 6.000 |
| PDI | 6.000 |
| PPP | 16.000 |
| BETO tutor | 500 |
| Tira-Duvidas | 500 (Haiku) |

---

## 5.7 RAG / Grounding per-tenant

Sistema de Retrieval-Augmented Generation que enriquece respostas da IA com contexto da empresa (valores, cultura, politicas internas, manuais).

### Schema SQL
- **Migration 041** — Tabela `knowledge_base` (empresa_id, titulo, chunk_index, content, metadata JSONB) + funcao `kb_search` (FTS PT-BR via tsvector com unaccent).
- **Migration 042** — Extensao `pgvector` + coluna `embedding VECTOR(1536)` + funcoes `kb_search_semantic` e `kb_search_hybrid` (RRF). Nota: migration 043 reduziu a dimensão para 1024.
- **Migration 043** — Dimensao reduzida de 1536 para **1024** (requisito nativo do Voyage-3-large). Sem perda de dados (base vazia no momento da migration).

### Provider de Embeddings
- **Atual: Voyage** (`voyage-3-large`, 1024d nativo) — configurado via `EMBEDDING_PROVIDER=voyage` + `VOYAGE_API_KEY` em Vercel prod e `.env.local`.
- **Fallback: OpenAI** — suportado via `EMBEDDING_PROVIDER=openai` (usa `text-embedding-3-small` com parametro `dimensions: 1024`).
- Wrapper: `lib/embeddings.ts`.

### Superficies com Grounding Ativo (commit 8dc80df)
| Superficie | Query | Arquivo |
|---|---|---|
| Tira-Duvidas | Pergunta do colaborador | `/api/temporada/tira-duvidas` |
| Evidencias socratico | Competencia + descritor + ultimas msgs | `/api/temporada/reflection` |
| Missao Feedback | Competencia + descritor + ultimas msgs | `/api/temporada/reflection` |
| Relatorio Gestor | Valores + cultura da empresa | `actions/relatorios.ts::gerarRelatorioGestor` |
| Relatorio RH | Valores + cultura da empresa | `actions/relatorios.ts::gerarRelatorioRH` |

### Ingest
- **`lib/rag-ingest.ts`** — Parser PDF (via pdf-parse) e DOCX (via mammoth) — fragmenta por secao, gera embeddings, upserta em `knowledge_base`.
- **`lib/rag-seed.ts`** — 6 docs base: temporada (visao geral), evidencias (metodologia socratica), tira-duvidas, regua de maturidade, modos de missao, privacidade.

### Painel Admin
- **`/admin/vertho/knowledge-base`** — CRUD + Upload (PDF/DOCX/TXT/MD ate 4MB) + botao "Popular base inicial" (seed) + preview de busca (FTS/vector/hybrid).

### Backfill
- Script `scripts/backfill-embeddings.js` + npm `backfill:embeddings` — re-gera embeddings de docs existentes ao trocar provider.

### Custo
- `lib/ia-cost-catalog.ts` contem chamada `rag-query-embed` (voyage-3-large, 138 calls/colab x 100 tokens) + 3 chamadas com grounding que tiveram +800 tokens input (`evidencias-socratic`, `tira-duvidas`, `missao-feedback`).

Documentacao detalhada: **`docs/rag-architecture.md`**.

---

## 6. Integracoes

### 6.1 WhatsApp — Z-API + QStash
Dispatch async com delay incremental 2s. Status: ✅ operacional, 🔑 Z-API credentials.

### 6.2 Email — Resend API
Dispatch de formularios e relatorios. Status: 🔑 RESEND_API_KEY.

### 6.3 PDF — @react-pdf/renderer + pdfjs-dist
Geracao server-side. Fonte NotoSans. PDFs: Individual, Gestor, RH, Comportamental, **Evolution Report**, **Plenaria**.
- `lib/temporada-concluida-pdf.ts` — PDF Evolution Report individual
- `lib/plenaria-equipe-pdf.ts` — PDF Plenaria consolidado do time
Status: ✅

### 6.4 Scraping — Jina AI + Firecrawl
PPP 10 secoes estruturadas. Status: ✅ Jina, 🔑 Firecrawl.

### 6.5 Supabase Storage — Buckets
- `logos`: upload de logo por empresa
- `conteudos`: storage de conteudos (audio/PDF)
Status: ✅

### 6.6 Bunny Stream
Import, thumbnails, embed, analytics, webhook. Status: ✅

---

## 7. Fluxos Ponta a Ponta

### Fluxo A: Login + Tenant + Dashboard
```
1. Usuario acessa {slug}.vertho.ai/login
2. middleware.js extrai slug → header x-tenant-slug
3. tenant-resolver.js busca empresa por slug (cache 5min)
4. LoginForm: email + senha/Magic Link → Supabase Auth
5. Redirect para /dashboard
6. authz.js: getUserContext → getDashboardView → rh|gestor|colaborador
7. Dashboard renderiza Hero + Proximo Passo + Acesso Rapido + KPIs

Tabelas: empresas, colaboradores, platform_admins
```

### Fluxo B: Assessment Conversacional
```
1. Colaborador clica em competencia em /dashboard/assessment
2. POST /api/chat: sessao → historico → Claude → [META] → state machine
3. Encerramento: [EVAL] 32768 tok → [AUDIT] Gemini → resultado persistido

Tabelas: sessoes_avaliacao, mensagens_chat, competencias, banco_cenarios
```

### Fluxo C: Motor de Temporadas Completo (14 semanas)
```
1. Admin gera temporadas (buildSeason): 14 semanas
   - Default global = Regular DUO: 2 competencias em blocos paralelos
     (selectDescriptorsDuo aloca [1-3]=Comp A, [5-7]=Comp B, [9-11]=reforco)
   - Conteudo (9 slots): micro_conteudos + desafio
   - Pratica (sem 4/8/12): missao + cenario em paralelo (DUO: integradoras das 2 comps)
   - Avaliacao (sem 13/14): reservadas
   - data_inicio definida → week gating por calendario

2. Semanas 1-3, 5-7, 9-11 (conteudo):
   - Colab ve conteudo → "Marcar como realizado" (gate: clicar link)
   - Tira-Duvidas: chat reativo (Haiku 4.5, sem limite turnos)
   - Evidencias: socratica 6 turnos (DISC, anti-alucinacao)
   - Fechamento: Desafio/Insight/Compromisso

3. Semanas 4, 8, 12 (pratica):
   - Missao Pratica: aceita → compromisso → executa → relata → IA analisa (10 turnos)
   - Fallback "Nao consegui": cenario escrito (analitico 10 turnos)

4. Semana 13 (qualitativa):
   - 12 turnos, 6 etapas: abertura, retrospectiva, evidencias, microcaso, integracao, sintese
   - Extracao: evolucao_percebida, maior_avanco, ponto_atencao, microcaso_qualidade

5. Avaliacao Acumulada (auto-trigger pos sem 13):
   - 1a IA pontua 1-4 por descritor (cega p/ nota inicial)
   - 2a IA audita

6. Semana 14 (wizard):
   - Cenario B do banco_cenarios (SEMPRE, sem fallback)
   - 4 perguntas: SITUACAO/ACAO/RACIOCINIO/AUTOSSENSIBILIDADE
   - Scorer triangula: cenario + acumulada + evidencias
   - 4 notas por descritor: pre, acumulada, cenario, final

7. Evolution Report automatico:
   - Consolida sems 13+14 → trilhas.evolution_report
   - Tela Concluida: 5 blocos (hero, comparativo, insights, missoes, avaliacao)
   - PDF via /api/temporada/concluida/pdf

Tabelas: trilhas, temporada_semana_progresso, descriptor_assessments, micro_conteudos, banco_cenarios
```

### Fluxo D: Dashboard Gestor
```
1. Gestor acessa /dashboard/gestor/equipe-evolucao
2. Lista liderados com delta + status (confirmada/parcial/estagnacao/regressao)
3. Filtros + ordenacao
4. Click-through: modal com detalhe + PDF individual
5. Plenaria PDF: /api/gestor/plenaria/pdf (consolidado do time)

Tabelas: trilhas, colaboradores, temporada_semana_progresso
```

---

## 8. Modelagem de Dados (98 arquivos SQL — 022 a 117)

### Migrations 022-051 (core Mentor IA)
Multi-tenant + Fit v2 + Temporadas + Tira-Duvidas + RAG (knowledge_base, pgvector 1024d) + Capacitacao + Relatorios.

### Migrations 052-053 (votacao + aderencia)
- **052** — `top10_cargos.aderencia_cargo`, `aderencia_mercado`, `motivo` (scores IA1)
- **053** — `votacao_competencias` (colab vota nas top 10 do cargo, gera ranking de foco)

### Migrations 054-089 (Radar Vertho — base nacional INEP + Bett)
- **054** — schema Radar: `diag_escolas`, `diag_saeb_snapshots`, `diag_ica_snapshots`, `diag_analises_ia`, `diag_leads`, `diag_ingest_runs` + bucket `diag-relatorios`
- **055-058** — refinamentos schema (IBGE nullable, Censo, lat/long, bucket privado, campos API INEP)
- **059** — `pg_trgm` + GIN indexes p/ busca
- **060** — Materialized views: `diag_mv_escola_saeb_agg`, `diag_mv_municipio_saeb_agg`, `diag_mv_municipio_ica_recent`, `diag_mv_estado_stats` + RPC `refresh_diag_mvs()`
- **061** — `diag_eventos` (tracking funil) + RPCs
- **062-066** — `diag_ideb` (metas), `diag_saresp` (escolas SP), `diag_fundeb`, `diag_pdde`, mapeamento código SP → INEP
- **067-069** — RPCs de contagem da home, `diag_fundeb_vaar` (binário), receita prevista FUNDEB
- **070-076** — MVs: métricas municipais/escolas, benchmarks INSE, infra×Saeb, pares cidade, stats por etapa, rede municipal
- **077** — Recompute scores Censo (correção famílias de campo)
- **078** — `diag_enem_escola` (3º EM)
- **079** — `perfil_externo` (autosvc)
- **080** — `diag_censo_docentes` (microdados INEP) + saneamento QT_*
- **081** — RLS restrita em `diag_analises_ia` (auth audit P1)
- **082** — RPCs `diag_qualidade_*` para painel de qualidade dos dados
- **083** — metricas municipais para pagina/rede municipal
- **084** — busca fuzzy do Radar
- **085 / 085-v2** — busca avancada de escolas (filtros por UF, rede, etapa e contagem)
- **086** — RPC para listar municipios por UF
- **087** — signup aberto para fluxo Bett
- **088** — limpeza/saneamento de telefones
- **089** — tracking de dispositivo na votacao

### Migrations 090-092 (Modo Onboarding)
- **090** — `empresas.sys_config` COMMENT documentando chaves novas (programa_modo, fase_carreira, nivel_meta_alvo, etc.)
- **091** — `trilhas.competencias_foco TEXT[]` + backfill (multi-competencia)
- **092** — `colaboradores.tutorados_ids UUID[]` + GIN index

### Migrations 093-095 (Mercado Potencial)
- **093** — MVs `diag_mv_mercado_escola/municipio/rede` (cross Censo+Saeb+VAAR)
- **094** — INSE proxy para escolas privadas sem Saeb (score ponderado de signals do Censo)
- **095** — `qt_doc_0_24` (idade-corte flexivel)

### Migrations 096-098 (Pulso de Desenvolvimento)
- **096** — `pulse_ciclos`, `pulse_assignments`, `pulse_responses`, `pulse_audit_logs` (RLS permissiva)
- **097** — MV `pulse_mv_aggregates` (company/area/cargo × dimensao × T0/T2 + linha `_geral`) + funcao `refresh_pulse_aggregates()`
- **098** — `pulse_classifications` (saida Dual-IA: classifier_themes/sentiment + auditor_agrees/divergences + final_confidence) + `pulse_triangulations` (cache do resultado por ciclo+grupo)

### Migrations 099-111 (RadarEmpresas — inteligencia comercial B2B INTERNA)
> Modulo Vertho-interno (nao multi-tenant). Guard `requireAdminSupabase()`. Detalhes na seção 19.
- **099** — schema core: `radarempresas_empresas`/`_estabelecimentos`, `_segmentos`, mapa `cnae_segmento`, `_scores`, `_listas`/`_lista_itens`, `_jobs`, `_audit_logs`
- **100** — agregados CAGED 6m (municipio×CNAE, ×CBO, nacionais) — contexto setorial
- **101** — agregados RAIS_ESTAB (estoque/porte municipio×CNAE) — base da taxa de rotatividade real
- **102** — score v4: `score_confidence`, `commercial_actionability`, `priority_rank`, `low_team_probability`
- **103** — expansao curada CNAE→segmento (prefixos 2/3/5/7 digitos)
- **104** — denylist CNAE (consultoria, participacoes, entidades publicas)
- **105** — denylist especifica consultoria (CNAE 6202 + razao social)
- **106** — `classificacao_teto` por segmento (override comercial reversivel: boa→79, nutrir→59, baixa→39)
- **107** — `saude_clinicas` rebaixada pra teto `nutrir`
- **108** — deteccao de redes (mesmo nome_fantasia em 3+ cnpj_basico) + `radarempresas_redes` + coluna `rede_marca`
- **109** — tipo de rede: `franquia` (multi-dono) vs `grupo` (1 dono, N filiais)
- **110** — tabelas serving BR: `radarempresas_cidades_agg`, `radarempresas_funil_agg` (agregados < 100 MB)
- **111** — colunas TAM em `cidades_agg` (base do "Potencial por Cidade")

### Migrations 112-117 (auth, RLS, i18n, Radar, auditoria, permissoes)
- **112** — login WhatsApp OTP: `colaboradores.login_por_whatsapp` + tabela `colab_otp` (code hash, TTL 10min, attempts). Seção 22.
- **113** — fecha RLS public (alerta Supabase): policies reais por tenant + funcoes SECURITY DEFINER + tranca residual. Ver 3.3.
- **114** — i18n: `empresas.default_locale` (default pt-BR, CHECK) + `colaboradores.locale` (nullable). Seção 20.
- **115** — `diag_censo_infra.matriculas` (QT_MAT_BAS) — total de matriculas na ficha da escola do Radar
- **116** — `admin_audit_log` (admin_email, acao, empresa_id, alvo, detalhes JSONB, resultado, ip, user_agent). Seção 21.
- **117** — `permission_overrides` (scope role|user, effect allow|deny, reason auditavel). Seção 21.

### Dados Transacionais
```
sessoes_avaliacao ← mensagens_chat (1:N por sessao_id)
respostas (R1-R4 por competencia)
evolucao + evolucao_descritores (comparativo A vs B)
trilhas + temporada_semana_progresso (Motor de Temporadas)
descriptor_assessments (notas 1-4, granularidade 0.1)
```

### Dados de Configuracao
```
empresas → colaboradores (1:N)
empresas → competencias (1:N)
empresas → cargos (1:N)
empresas → banco_cenarios (1:N)
empresas.ui_config / sys_config
```

### Artefatos Gerados por IA
```
relatorios, pdis
prompt_versions (audit trail SHA-256)
sessoes_avaliacao.rascunho_avaliacao / validacao_audit / avaliacao_final
trilhas.evolution_report (JSONB — consolida sems 13+14)
temporada_semana_progresso.feedback.acumulado (avaliacao acumulada)
temporada_semana_progresso.tira_duvidas (JSONB)
```

### Dados de Operacao
```
envios_diagnostico
trilhas (competencia foco, temporada_plano, data_inicio, evolution_report)
platform_admins (RLS habilitado)
videos_watched (RLS habilitado)
micro_conteudos (banco unificado)
```

### Tabelas Removidas (migration 035)
```
fase4_progresso — dropada (legacy Moodle)
tutor_log — dropada (legacy)
```

### Dados de Referencia
```
competencias_base (RLS habilitado)
regua_maturidade
catalogo_enriquecido, moodle_catalogo
cis_referencia, cis_ia_referencia
```

---

## 9. Cron Jobs (Vercel)

| Cron | Horario (BRT) | Acao |
|---|---|---|
| cleanup_sessoes | Diario 05:00 | Reseta sessoes abandonadas >48h, recalcula taxa_conclusao |
| trigger_segunda | Segunda 11:00 | Envia pilula semanal via QStash |
| trigger_quinta | Quinta 11:00 | Solicita evidencia + nudge inatividade |
| backup_diario | Diario 04:00 | Executa rotina de backup via `/api/cron?action=backup_diario` |

---

## 10. Testes

### Smoke Test (HTTP)
`node scripts/smoke-test.js https://vertho.ai` — 29 rotas, CI-ready.

### Playwright E2E + Vitest (27 arquivos de teste)
```
npm test
$env:SMOKE_EMAIL="x"; $env:SMOKE_PASS="y"; npm test
npm run test:ui
```

### CI/CD
`.github/workflows/smoke-test.yml` — smoke test em cada push.

---

## 11. Seguranca

- RBAC explicito: coluna `role` + tabela `platform_admins` + **matriz papel×permissao** (`lib/permissions.ts`) com overrides auditaveis (`permission_overrides`, migration 117)
- Admin guard 100% server-side (server layout `app/admin/layout.tsx`, cookie SSR)
- Guard centralizado `requireAdminSupabase()` + allowlist de `createSupabaseAdmin()` enforced no CI
- **Auditoria**: `logAdminAction()` grava disparos e mutacoes admin em `admin_audit_log` (migration 116), best-effort, com IP + user-agent
- API colaboradores: empresa_id obrigatorio
- **RLS real por tenant** (migration 113) nas tabelas de leitura client-side (`empresas`, `colaboradores`, `sessoes_avaliacao`, `mensagens_chat`); demais tabelas sensiveis sem policy = bloqueadas pra anon/authenticated. Zero tabelas `public` sem RLS.
- Login OTP WhatsApp: codigo em hash (sha256 + pepper), TTL 10min, max 5 tentativas, rate-limit + anti-enumeracao (seção 22)
- Nenhuma NEXT_PUBLIC sensivel
- Sentry para error tracking
- **npm audit: 0 vulnerabilities** (xlsx removido, Next.js patched para 16.2.4, resend instalado)

### 11.1 Confirms preventivos (UX defensiva)

Depois de um incidente em que admin clicou sem querer e gerou todas as avaliacoes comportamentais (commit `3730e22`), foi adicionada confirmacao explicita (`window.confirm`) em todas as acoes destrutivas/massivas do painel admin (commit `4990742`):

| Local | Acoes protegidas |
|---|---|
| `/admin/empresas/{id}` `handleAction` (map `DANGEROUS_CONFIRMS`) | `simular-disc`, `simular`, `temporadas`, `rel-ind`, `cenarios-b`, `evolucao`, `plenaria`, `rh-links`, `rh-dossie` |
| `/admin/empresas/{id}` Danger Zone | `limpar*`, `excluirEmpresa`, `definirSenhaTesteEmpresa` (mantidos) |
| `/admin/whatsapp` | `handleDisparar` (com canal + nº destinatarios), Magic Links em massa |
| `/admin/competencias` | `handleCopy` (copia da base) e `handleDelete` |
| `/admin/conteudos`, `/admin/lixeira`, `/admin/platform-admins`, `/admin/temporadas` (Simular) | mantem confirms ja existentes |

Padrao das mensagens: explicar **o que** vai acontecer, **escopo** (todos / N items), e se eh **reversivel** ou nao. Ver `app/admin/empresas/[empresaId]/page.tsx` linha ~208 para o template.

### Repositorio publico
- NUNCA commitar .env, credenciais ou tokens
- `.gitignore` exclui `.env*.local`
- Variaveis de ambiente vivem APENAS na Vercel

---

## 12. Observabilidade

- `lib/logger.ts` — logger estruturado
- Sentry — erros client + server + edge
- System Health no admin dashboard
- Prompt versioning em `prompt_versions`
- Check IA4 com nota persistida
- Paineis Admin Vertho: evidencias, avaliacao acumulada, auditoria sem 14

---

## 13. Paineis Admin Vertho (platform admin only)

| Painel | Rota | Funcao |
|---|---|---|
| Evidencias | `/admin/vertho/evidencias` | Conversas socraticas sem 1-12, extracao, transcript |
| Avaliacao Acumulada | `/admin/vertho/avaliacao-acumulada` | Nota por descritor + auditoria + regerar |
| Auditoria Sem 14 | `/admin/vertho/auditoria-sem14` | 4 notas (pre/acumulada/cenario/final) + delta + regerar com feedback |
| Simulador de Custo | `/admin/vertho/simulador-custo` | Calculadora interativa: catalogo chamadas x modelos x presets |
| Knowledge Base (RAG) | `/admin/vertho/knowledge-base` | CRUD + Upload PDF/DOCX + Seed + preview de busca (grounding per-tenant) |

Todos com filtro `?empresa=` e back button context-aware. Dados via `lib/ia-cost-catalog.ts`.

---

## 14. Operacao

### Deploy
```
git push origin master → Vercel build automatico → producao
```

### Backup automatico
```
Task Scheduler Windows → scripts/auto-backup-diario.ps1 (todo dia 20h)
```

### Scripts utilitarios
| Script | Uso |
|---|---|
| `scripts/smoke-test.js` | Testa 29 rotas via HTTP |
| `scripts/backup-project.ps1` | Snapshot ZIP manual |
| `scripts/checkpoint.ps1` | Commit + push rapido |
| `scripts/auto-backup-diario.ps1` | Backup diario automatico |

### Restauracao do Schema
- Rodar migrations em ordem: `migrations/022*.sql` ate `089*.sql`
- Processo de alteracao de schema: `docs/SCHEMA-PROCESS.md`

### Backfill de embeddings
- `npm run backfill:embeddings` — re-gera embeddings em `knowledge_base` (util ao trocar `EMBEDDING_PROVIDER`)

### TypeScript
- `npm run typecheck` — roda `tsc --noEmit` (config: `strict:false`, `jsx:"preserve"`, `allowJs:true`, `checkJs:false`)

---

## 15. Infraestrutura

```
GitHub: vertho-app/vertho-app (publico)
Vercel: vertho-app (deploy via git push)
Cloudflare: DNS + CDN (CNAME @ e * → cname.vercel-dns.com, SSL Full Strict)
  - vertho.ai (apex — home institucional no Gamma)
  - app.vertho.ai (auth/admin/dashboard)
  - *.vertho.ai (tenants — vincular manualmente em /admin/empresas/{id}/configuracoes)
  - radar.vertho.ai (Radar publico nacional)
  - imprensa.vertho.ai (pagina institucional nativa Next)
  - radarbett.vertho.ai (DESCONTINUADO — 301 redirect pra radar/vertho.ai)
  - vertho.com.br (legacy — proxy aceita por compat de DNS antigo; sera removido)
Supabase: PostgreSQL + Auth + Storage + RLS (pgvector 1024d)
Upstash: QStash (filas async WhatsApp + Radar PDF worker)
Resend: Email transacional
Sentry: Error tracking (com lib/sentry-scrub-pii.ts)
Bunny Stream: Video host
Voyage AI: Embeddings (voyage-3-large)
Z-API: WhatsApp gateway
```

---

## 16. Legacy Removido

- `actions/capacitacao.js` — integracaoo Moodle removida
- `/admin/empresas/[id]/fase3/` — pagina removida
- Botoes: "Iniciar Capacitacao", "Avancar Semana", "Nudges", "Iniciar Reavaliacao" — removidos
- Tabelas `fase4_progresso` e `tutor_log` — dropadas (migration 035)
- Labels renomeadas: "Aplicacao" → "Pratica", "Mentor IA" → "Evidencias"
- Cenario: titulo removido, "CENARIO" → "CONTEXTO"
- "Marcar como assistido" → "Marcar como realizado"
- `xlsx` — removido (2 CVEs high sem fix) → substituido por `read-excel-file@^8`
- `jsconfig.json` — substituido por `tsconfig.json` (migração majoritária para TypeScript; arquivos .js/.mjs residuais permanecem em scripts, tests e configs)
- `gas-antigo/` (69 arquivos GAS) — removido 2026-04-17
- `migrations-legacy/` (37 SQL) — removido 2026-04-17
- `migrate:legacy` npm script — removido
- `relatorio-arquitetura-vertho.md` — removido
- Compatibilidade legada removida: perfil_disc fallback, typeof string checks em PDFs, resumo_avaliacao_detalhado
- `radarbett.vertho.ai` — **DESCONTINUADO** (commit `b04e3ee`): 301 redirect (deep-links → radar.vertho.ai, resto → vertho.ai). Frentes "Onde a Vertho pode ajudar" migradas pro Radar (`0c57c19`). Código `app/radarbett/` segue no repo, dormant.
- `middleware.js` → `proxy.js` (Next 16 proxy API, commits `38a8b71` + `4bac514`)

---

## 17. Modos da engine (Regular DUO · Regular single · Onboarding)

> A mesma engine de trilha serve três modos, resolvidos por empresa via `sys_config.programa_modo`. **Não são produtos diferentes** — só configuração (`getProgramaConfig`). **Default global = Regular DUO** (2 competências em blocos paralelos). Single-comp virou escape hatch (`regular_single`). Onboarding (recém-formados) inalterado.

### 17.1 Como diferem

| Dimensão | **Regular DUO** *(default)* | Regular single *(`regular_single`)* | Onboarding *(`onboarding`)* |
|---|---|---|---|
| Duração | 14 semanas | 14 semanas | **10 semanas** |
| Competências por trilha | **2 (em blocos paralelos)** | 1 (aprofundada) | **5 (em espiral)** |
| Nível-meta na régua | 3 (proficiente) | 3 (proficiente) | **2 (autonomia supervisionada)** |
| Missões | Sem 4, 8, 12 (**integradoras das 2 comps**) | Sem 4, 8, 12 (uni-competência) | **Sem 4, 7, 9 (multi-competência integradora)** |
| Avaliação Acumulada | Sem 13 (auto-trigger, **por competência**) | Sem 13 (auto-trigger) | **Embutida nas missões 4/7/9 (parcial cumulativa)** |
| Cenário B (wizard final) | Sem 14 | Sem 14 | **Sem 10** |
| Slots de conteúdo | `[1,2,3,5,6,7,9,10,11]` (3 blocos de 3) | `[1,2,3,5,6,7,9,10,11]` | `[2,3,5,6,8]` — sem 1 = calibragem |
| Acompanhamento | Gestor (por `gestor_email`) | Gestor | **Tutor** (por `tutorados_ids[]`) |
| Push automatizado | — | — | **WhatsApp pro tutor nas sems 4 e 7** (sugestão de pauta) |

> Trilhas já persistidas (single-comp) **não são regeradas** — o plano salvo é servido como está; só nova geração usa DUO. Detalhe do DUO em **17.11**.

### 17.2 Arquivos-chave

```
lib/season-engine/programa-config.ts   # PROGRAMA_REGULAR_DUO (default) + REGULAR + ONBOARDING + getProgramaConfig
lib/season-engine/build-season.ts      # buildSeason recebe programaConfig + competencias[] (isMulti = DUO|Onboarding)
lib/season-engine/select-descriptors.ts # selectDescriptors (single) + selectDescriptorsDuo (Regular DUO, profundo) + selectDescriptorsMulti (onboarding, raso)
lib/season-engine/prompts/scenario.ts  # aceita cenarioTipo='integrador' + competenciasIntegradas[]
lib/season-engine/prompts/missao.ts    # aceita missaoTipo='integradora' + competenciasIntegradas[]
lib/season-engine/prompts/acumulado.ts # aceita nivelMetaAlvo: 2|3 (régua condicional)
lib/notify-tutor.ts                    # notifyTutorMissaoConcluida (Z-API push)
actions/temporadas.ts                  # gerarTemporada (single) + gerarTemporadaRegularDuo (2 comps) + gerarTemporadaOnboarding (multi)
actions/avaliacao-acumulada.ts         # gerarAvaliacaoAcumulada (single + multi-comp DUO via avaliarCompAcumulada) + gerarAvaliacaoAcumuladaParcial (Onboarding)
app/api/temporada/reflection/route.ts  # auto-trigger acumulada parcial + notify tutor ao concluir missão
app/admin/empresas/[id]/configuracoes  # tab "Programa" (toggle modo + fase_carreira)
lib/authz.ts                           # isTutor, getTutorados, canTutorAccess
```

### 17.3 Chaves novas em `sys_config` (JSONB)

```jsonc
{
  "programa_modo": "onboarding" | "regular_single",    // ausente/outro = Regular DUO (default global)
  "competencias_regular_duo": ["CompA", "CompB"],      // override das 2 comps do DUO (senão top-2 do cargo, âncora 1º)
  "fase_carreira_default": "junior" | "pleno" | "senior", // viés da IA1
  "nivel_meta_alvo": 2 | 3,                            // default 3
  "duracao_semanas": 10 | 14,                          // futuro override
  "num_competencias_trilha": 1 | 5,
  "cadencia_template": "linear" | "espiral",
  "competencias_onboarding": ["Comp1", ..., "Comp5"]   // override do top 5 do cargo (modo onboarding)
}
```

Documentação enforced via migration 090 (`COMMENT ON COLUMN`).

### 17.4 Migrations

- **090** — `empresas.sys_config` COMMENT documentando chaves novas. Sem DDL.
- **091** — `trilhas.competencias_foco TEXT[]` + backfill `ARRAY[competencia_foco]`.
- **092** — `colaboradores.tutorados_ids UUID[]` + GIN index.

### 17.5 RBAC do papel Tutor

- Adicionado em `types/index.d.ts`: `Role = 'colaborador' | 'gestor' | 'rh' | 'tutor'`.
- `lib/authz.ts`: `isTutor`, `getTutorados(ctx)`, `canTutorAccess(ctx, colabId)`.
- `getDashboardView` retorna `'tutor'` quando aplicável.
- `findColabByEmail` puxa `tutorados_ids` no select padrão.
- Tutor reusa `/dashboard/gestor` e `/dashboard/gestor/equipe-evolucao`; filtros checam `tutorados_ids` (fail-closed: vazio = lista vazia).
- Header da página: "Tutor · seus tutorados" + "Meus tutorados" quando `scope='tutor'`.

### 17.6 Auto-trigger acumulada parcial

Em `/api/temporada/reflection/route.ts` (linha ~390): ao concluir missão integradora em modo Onboarding, dispara `gerarAvaliacaoAcumuladaParcial(trilhaId, compsCobertas, semana, internal=true)` em background. Não bloqueia resposta ao colab. A flag `internal=true` pula `requireAdminAction` porque o caller é o próprio colaborador.

Janela cumulativa vem de `programaConfig.competenciasNaMissao`:
- Sem 4 → Comps 0-1 (índices)
- Sem 7 → Comps 0-3
- Sem 9 → todas (`[-1]`)

### 17.7 Push WhatsApp pro Tutor (sems 4 e 7)

`lib/notify-tutor.ts` → `notifyTutorMissaoConcluida({trilhaId, semana, competenciasIntegradas})`. Disparado em paralelo ao trigger da acumulada parcial. Mensagem inclui nome do tutorado, semana, competências cobertas e 3 perguntas de pauta sugerida. Hard-coded em `SEMANAS_NOTIFY = [4, 7]` — sem 9 é final, sem check-in.

Comportamento defensivo: sem tutor vinculado → skip silencioso; tutor sem telefone → log; Z-API falha → log (não bloqueia conclusão da missão).

### 17.8 Testes

- **Unit (Vitest)** — `tests/unit/onboarding/programa-config.test.ts`: 33 testes cobrindo estrutura dos templates (incl. `PROGRAMA_REGULAR_DUO`), `getProgramaConfig` (default global DUO + escape hatch `regular_single`), `descritoresCobertosNaMissao`, `selectDescriptorsMulti`, `selectDescriptorsDuo` (blocos paralelos, reforço por gap, `.competencia` preenchida).
- **E2E (Playwright)** — `tests/onboarding-config-ui.spec.js`: tab Programa, toggle modo, banner ativo, dropdown fase_carreira, role Tutor no dropdown da Equipe.

### 17.9 Pendências (fora do escopo Fases 1-4)

- Push pro tutor além das sems 4 e 7 (ex.: alertas de inatividade).
- UI dedicada pra atribuir `tutorados_ids` em massa (hoje só via SQL ou edição individual).
- Testes específicos de IA1 com `fase_carreira` e acumulada com nível-meta 2 — pulados intencionalmente porque dependem de chamadas reais de IA e geram falsos negativos quando prompts evoluem.

### 17.10 Commits do roll-out

| Commit | Entrega |
|---|---|
| `776f953` | Fase 1 — Parametrização da engine (zero mudança funcional) |
| `a177b3b` | Fase 2 — Template ONBOARDING + IA1 `fase_carreira` + UI admin tab Programa |
| `2caa933` | Fases 3+4 — Multi-competência + prompts integradores + role Tutor + nível-meta 2 |
| `1ccd877` | Auto-trigger acumulada parcial + dashboard tutor com escopo |
| `777a726` | Push WhatsApp pro tutor ao concluir missões 4 e 7 |
| `cca9c33` | Testes Vitest + Playwright + cleanup UI |
| `f148e9b` | **Regular DUO — 2 competências em blocos paralelos vira o default global** |

### 17.11 Regular DUO (default global)

> A partir de `f148e9b`, **toda empresa sem `programa_modo`** gera trilha cobrindo **2 competências em paralelo**, mantendo a profundidade do Regular (14 sem, nível-meta 3). Single-comp continua disponível como escape hatch (`programa_modo = 'regular_single'`) — rollback por cliente sem mexer em código.

**Resolução das 2 competências** (`gerarTemporadaRegularDuo`):
1. `sys_config.competencias_regular_duo` (override explícito), OU
2. top-2 do cargo via `top10_cargos`, com a **competência âncora** (trilha/cargo existente) em 1º para continuidade.

**Alocação profunda** (`selectDescriptorsDuo`): os 9 slots viram 3 blocos contíguos de 3 — `[1,2,3]` → Comp A, `[5,6,7]` → Comp B, `[9,10,11]` → reforço da comp de **maior gap agregado** (empate → âncora). Blocos de 3 preservam a contiguidade do `selectDescriptors` (descritor de 2 semanas nunca cruza fronteira de bloco → nunca atravessa missão 4/8/12). Cada `SelectedDescriptor` sai com `.competencia` preenchida → `buildSeason` roteia a semana de conteúdo pra comp certa.

**Missões integradoras**: `competenciasNaMissao = { 4:[-1], 8:[-1], 12:[-1] }` (`-1` = todas as comps da trilha), complexidade crescente via `complexidadeMap` (simples → intermediário → completo).

**Avaliação acumulada** (`gerarAvaliacaoAcumulada`): trilha multi-comp → loop por competência (núcleo `avaliarCompAcumulada` compartilhado com o caminho single, sem drift), cada uma com sua régua. Payload ganha `{ multi:true, competencias, por_competencia[] }`. Single-comp mantém o shape antigo inalterado.

**Fallback sem viés**: cargo não resolve 2 comps, ou 2ª comp sem `descriptor_assessments` → cai pro fluxo single-comp (a comp âncora segue estrita, não preenche com default). UI da temporada exibe `"Comp A + Comp B"` quando multi (`trilhas.competencias_foco`).

**Persistência**: `competencia_foco` = âncora (compat), `competencias_foco TEXT[]` = as 2 comps (migration 091). `gerarTemporada` single agora também grava `competencias_foco: [comp]` pra uniformizar a leitura.

---

## 18. Módulo Pulso de Desenvolvimento

> Instrumento leve para entender se o ambiente favorece ou bloqueia o desenvolvimento das pessoas. **Não é** pesquisa de clima tradicional nem conformidade NR-1. **Não promete** diagnóstico psicossocial, laudo, risco individual, burnout ou saúde mental. Conexão com NR-1 é benefício colateral via relatório complementar opcional.

### 18.1 Conceito

Lógica do módulo:

```
Pulso T0 → Sinais da Jornada → Pulso T2 → Triangulação → Relatório agregado
```

- **Pulso T0** — linha de base declarada antes da jornada.
- **Sinais da Jornada** — métricas comportamentais derivadas de `ia_usage_log`, `respostas`, `pulse_assignments`. Sem nova tabela; on-demand.
- **Pulso T2** — percepção ao final da jornada (mesmas 6 dimensões).
- **Triangulação** — cruza declarado × comportamental × temas; gera aceleradores, bloqueadores, alertas, divergências, recomendações.
- **Relatório** — PDF executivo + complementar NR-1 (opcional, com disclaimer obrigatório).

### 18.2 Estrutura das perguntas

26 perguntas hardcoded em `lib/pulse/template.ts` (12 Likert + 1 aberta por momento). 6 dimensões × 2 perguntas:

1. Clareza
2. Condições
3. Liderança
4. Segurança para aprender
5. Aplicação prática
6. Futuro e permanência

Escala Likert 1-5 (Discordo totalmente → Concordo totalmente).

### 18.3 Privacy-by-design

| Regra | Como é implementado |
|---|---|
| Dashboards gestor/RH só consomem agregados | `loadPulseDashboard` lê MV, nunca `pulse_responses` direto |
| Nenhum recorte com n < 7 é exibido | `lib/pulse/anonymity.ts::PULSE_MIN_N=7` + `enforceMinN` + retorno `'masked'` |
| Respostas abertas brutas nunca vão pra gestor/RH | Apenas temas agregados (`pulse_classifications.classifier_themes`) e contagens |
| Sem ranking individual, score individual de clima/risco | UI não tem essa view |
| Filtros que reduzem n<7 são bloqueados na UI | `grupos_disponiveis` filtrado server-side |
| Logs de auditoria | `pulse_audit_logs` registra view_dashboard, view_dashboard_blocked, export_*, convite_enviado_* |

Anti-vazamento na Dual-IA: `pulse_classifications` armazena apenas `classifier_evidence` (frase curta, <120 chars, sem identificadores) — nunca o texto bruto.

### 18.4 Arquivos-chave

```
lib/pulse/template.ts            # 26 perguntas hardcoded (12 T0 + 12 T2 + 2 abertas)
lib/pulse/anonymity.ts           # PULSE_MIN_N=7, enforceMinN, classifyScore
lib/pulse/signal-scoring.ts      # Normalização sinais 1-5 + mapping pra dimensões
lib/pulse/triangulation.ts       # triangulate() puro (sem efeito colateral)
lib/pulse/dual-ai.ts             # classifyOpenText + auditClassification + resolveFinalConfidence
lib/pulse/themes-taxonomy.ts     # 12 temas fixos (falta_tempo, falta_clareza, ..., aplicacao_concreta)

actions/pulse/admin.ts           # criarCiclo, listarCiclos, dispararPulso (lote), fecharMomento
actions/pulse/responder.ts       # loadAssignment, saveResponse (upsert), finishAssignment
actions/pulse/dashboard.ts       # loadPulseDashboard, refreshPulseAggregates
actions/pulse/signals.ts         # loadPulseSignals (on-demand, sem nova MV)
actions/pulse/classify.ts        # classificarRespostasAbertas (lote), obterTemasCiclo
actions/pulse/export.ts          # exportarRelatorioPulso (gera registro em relatorios)
actions/pulse/envio.ts           # enviarConvitesPulso (Z-API + magic link), statusEnviosCiclo

app/dashboard/pulso/[assignmentId]/page.tsx                  # Fluxo colab: intro → perguntas → done
app/admin/empresas/[empresaId]/pulso/page.tsx                # Admin: gestão de ciclos + dispatch
app/admin/empresas/[empresaId]/pulso/[cicloId]/dashboard/page.tsx  # Dashboard agregado
app/admin/empresas/[empresaId]/pulso/[cicloId]/enviar/page.tsx     # Envio de convites WA/email

components/pulse/  # LikertScale, PulseProgress, OpenTextQuestion, PulseCompletion,
                   # PrivacyNotice, AnonymityGuardMessage, PulseScoreCard,
                   # PulseDimensionChart, PulseDeltaTable, PulseSignalsCard,
                   # PulseThemesCloud, TriangulationSummary, RecommendationsList

components/pdf/RelatorioPulsoExecutivo.tsx  # PDF executivo
components/pdf/RelatorioPulsoNR1.tsx        # PDF complementar NR-1 com disclaimer obrigatório

app/api/relatorios/pdf/route.ts  # Estendido: pulso_executivo + pulso_complementar_nr1
```

### 18.5 Modelo de dados

5 tabelas + 1 MV. RLS permissiva (filtro real fica em camada de aplicação, padrão do projeto):

| Tabela | UK | Função |
|---|---|---|
| `pulse_ciclos` | — | Ciclo de pulso por empresa (T0+T2 com timestamps de abertura/fechamento) |
| `pulse_assignments` | (ciclo_id, colaborador_id, pulse_moment) | "Convite" pra um colab responder T0 ou T2 |
| `pulse_responses` | (assignment_id, question_id) | Resposta a uma pergunta (Likert ou texto) |
| `pulse_audit_logs` | — | Logs de acesso a relatórios + envios + bloqueios n<7 |
| `pulse_classifications` | (response_id) | Saída Dual-IA: classifier + auditor + final_confidence |
| `pulse_triangulations` | (ciclo_id, group_type, group_key) | Cache do resultado consolidado por grupo |
| `pulse_mv_aggregates` | (empresa_id, ciclo_id, group_type, group_key, pulse_moment, dimension_key) | MV com médias e n por grupo × dimensão × momento |

### 18.6 Pipeline Dual-IA

Registrado em `lib/ai-tasks.ts` como `pulse_classify` (default Sonnet 4.6) e `pulse_audit` (default Gemini Flash). Configurável por empresa via `sys_config.ai.modelos`.

1. **Classifier** lê o texto e retorna JSON: `themes[]` (max 3 da taxonomia fechada), `sentiment`, `evidence` (frase curta), `confidence`.
2. **Auditor** recebe texto original + saída do classifier e retorna: `agrees`, `divergences[]`, `confidence_adjusted`, `notes`.
3. `resolveFinalConfidence` combina ambos (auditor='low' → 'low'; discordância → rebaixa 1 nível).
4. `applyAuditCorrections` remove temas rejeitados.
5. Agregação ignora `final_confidence='low'`.

### 18.7 Envio de convites

`enviarConvitesPulso(empresaId, cicloId, opts)` gera magic link pessoal via `sb.auth.admin.generateLink({ type:'magiclink', redirectTo: '/dashboard/pulso/{assignmentId}' })`, envia via Z-API com throttle 1.2s. Idempotente — pula assignments com audit log de `convite_enviado_*` (override via `force_resend=true`).

UI: `/admin/empresas/[id]/pulso/[cicloId]/enviar` com toggle T0/T2, canal (WA/email/ambos), textarea com placeholders `{{nome}}`, `{{empresa}}`, `{{link_pulso}}`.

### 18.8 Stage do módulo

Flag `empresas.sys_config.pulse_stage`: `experimental` | `calibrating` | `production`. Por empresa (não global) — alinhado aos pilotos.

Em `calibrating`:
- Admin Vertho vê texto aberto bruto (debug).
- Triangulação pode ser revisada antes de exibir a RH.
- Coleta feedback do RH/gestor pra ajustar taxonomia e thresholds.

Em `production`:
- Apenas temas agregados são exibidos.
- Insights só gerados se ≥60% das classificações tiverem confidence ≥ medium.

### 18.9 Decisões de design (vs spec original)

| Spec original | Implementado | Por quê |
|---|---|---|
| `pulse_templates` + `pulse_questions` (2 tabelas) | Seed estático em `lib/pulse/template.ts` | Template é fixo por design da metodologia. Tabelas viram opcionais quando empresa customizar. |
| `journey_signals` + `journey_signal_aggregates` (2 tabelas) | Cálculo on-demand em `actions/pulse/signals.ts` | Dados-fonte já existem (`ia_usage_log`, `respostas`). Nova tabela duplicaria + drift. |
| `pulse_open_text_themes` (tabela separada) | `themes_json` em `pulse_triangulations` | Só vira tabela se precisar busca cross-jornada. Não vale na fase MVP. |
| `pulse_aggregates` (tabela) | MV `pulse_mv_aggregates` | Mesmo padrão das MVs do Radar. Refresh on-demand via RPC. |

### 18.10 Commits do roll-out

| Commit | Entrega |
|---|---|
| `8468aa8` | Etapa 1 — Coleta (migration 096, template, actions admin/responder, UI colab + admin) |
| `c9203d6` | Etapa 2 — Agregados (migration 097, MV + guard n>=7, dashboard, delta T0/T2) |
| `3cdcf19` | Etapa 3 — Sinais comportamentais + triangulação por regras |
| `54c84d3` | Etapa 4 — Dual-IA (migration 098, Sonnet classifica + Gemini audita, 12 temas) |
| `71c625d` | Etapa 5 — PDFs Executivo + Complementar NR-1 (com disclaimer obrigatório) |
| `b7b072b` | Envio de convites por WhatsApp/email (magic link pessoal por assignment) |

### 18.11 Piloto Macaé (status atual)

- Ciclo `1b635ee0-a21e-4faa-9973-bd8c657fb41c` — "Piloto Macaé — 1º Semestre 2026" criado.
- 59 assignments T0 criados (1 por colab ativo).
- Status atual: `em_jornada` (T0 fechado intencionalmente — aguardando autorização pra disparo de convites).
- Próximo passo: reabrir T0 + disparar convites via Z-API (Samuel Protetti é gestor de todos).

---

## 19. RadarEmpresas — Inteligência Comercial B2B (interno)

> Módulo **Vertho-interno** (não multi-tenant, não exposto a clientes). Mapeia empresas brasileiras a partir de dados públicos e ranqueia oportunidades comerciais por um Score de Oportunidade próprio. Guard `requireAdminSupabase()`. Migrations 099-111.

### 19.1 Telas (`app/admin/vertho/`)

| Rota | Função |
|---|---|
| `radarempresas/page.tsx` | Painel dual-mode. **Jundiaí** (MVP): busca filtrável (UF, município, segmento, porte, classificação) + paginação, KPIs, funil endereçável, top segmentos/municípios, export CSV/XLSX. **BR** (quando `radarempresas_cidades_agg` populado): consolidado por município, download XLSX de priorizados por cidade. |
| `radarempresas/listas/page.tsx` | Listas de prospecção nomeadas; status por item (`new → reviewed → approved → contacted → meeting_scheduled → discarded`); export. |
| `radarempresas/redes/page.tsx` | Redes/franquias consolidadas (1 linha por marca, expansível pras unidades). |
| `radarempresas/empresa/[cnpj]/page.tsx` | Ficha por CNPJ: identificação, contato, segmento (pain hypotheses), score com breakdown auditável. |
| `potencial-cidades/page.tsx` | TAM somável por município cruzando **2 verticais**: Empresas B2B (priorizadas + redes) e Escolas privadas (n_professores × R$/mês). |

### 19.2 Pipeline de dados (`data-pipeline/radarempresas/`)

Princípio: **todo cálculo pesado roda local** (DuckDB + Parquet); o Supabase recebe só agregados (< 100 MB) e os XLSX lead-a-lead vão pro Storage. Microdados brutos nunca sobem.

| Fonte | Uso |
|---|---|
| **Receita Federal** | base principal (CSV `.EMPRECSV`/`.ESTABELE`/`.CNAECSV`, cp1252 → utf8) |
| **CAGED** | movimentação 6m (admissões/desligamentos/saldo) → contexto setorial |
| **RAIS** (VINC/ESTAB) | estoque/porte de emprego formal → taxa de rotatividade real (CAGED÷RAIS) |
| **CEMPRE / SIDRA** (tabela 6449) | corroboração via API + cache |

Estágios BR (orquestrador `run_br.ps1`): `10_transcode` (encoding) → `11_ingest` (DuckDB, particiona por UF) → CAGED/RAIS aggregates → `15_cempre_sidra` → `14_contexto` (bayesiano CAGED÷RAIS) → `12_score` (aplica `scoreEstab` linha a linha) → `13_rank_redes` (priority_rank percentil + detecção de redes) → `16_export_xlsx` (1 XLSX/município) → `17_load_supabase` (agregados + Storage).

### 19.3 Score de Oportunidade (v5)

**Fonte única** em `lib/radarempresas/score-resolve.ts` (`scoreEstab`) + `lib/radarempresas/score.ts` (`calcularScore`). O pipeline BR reusa exatamente o mesmo código (zero drift; validado reproduzindo a distribuição de Jundiaí).

```
score_total = 0.40·dor_pessoas + 0.30·capacidade_compra + 0.30·fit_vertho   (cada sub-score 0-100)

dor_pessoas       = 0.55·people_intensity + 0.20·standardization + multiunidade[0/10/20/25]
                    + CNAE prioritário[+10] + 0.20·contexto_setorial(CAGED÷RAIS)
capacidade_compra = porte[8-40] + capital_social_log[0-30] + matriz[+4/+10] + idade(sweet spot 3-25a)
                    − penalidade low_team[-15]
fit_vertho        = leadership_complexity + onboarding_need + business_skills (pesos por segmento)

classificação:  abordar_agora ≥80 · boa 60-79 · nutrir 40-59 · baixa <40  (com teto comercial por segmento)
confidence:     curado+contexto alto → alta · curado → media · genérico → ≤media · excluído → baixa
actionability:  email/tel/fantasia/matriz (0-100, NÃO entra no total — desempate operacional)
low_team_probability: ME + capital <R$1k E setor RAIS <10 vínculos → filtra MEI sem equipe
```

Segmentação proprietária em `lib/radarempresas/segmentos.ts` (10 segmentos com pain hypotheses + ofertas). CNAE→segmento por allowlist curada (`cnae_segmento`) + denylist (consultoria/participações).

### 19.4 Redes/franquias e funil endereçável

- **Redes** (`13_rank_redes.sql` + migrations 108-109): **franquia** = mesmo `nome_fantasia` normalizado em 3+ `cnpj_basico` distintos (donos diferentes); **grupo** = 1 `cnpj_basico` com 3+ filiais. Cada rede vira **1 lead** (negociação é com a franqueadora, não por unidade) e suas unidades saem da lista individual.
- **Funil endereçável** (UI): ativos → fora de rede → sem `low_team` → CNAE aderente → score ≥ 60 → priorizados (top 10% por `priority_rank`) → redes consolidadas. Mostra quão apertado é o funil real de leads operacionais.

### 19.5 Server actions / lib

```
actions/radarempresas/busca.ts     # loadModoBR, loadRadarKpis, loadFunilMercado, loadRedes, listarEmpresas, getFichaEmpresa
actions/radarempresas/scoring.ts   # rodarScores (lote, upsert idempotente + registra job)
actions/radarempresas/listas.ts    # CRUD listas de prospecção + export CSV/XLSX
lib/radarempresas/score-resolve.ts # scoreEstab (fonte única, compartilhada com pipeline BR)
lib/radarempresas/score.ts         # calcularScore (fórmula pura) + classificação + confidence
lib/radarempresas/segmentos.ts     # 10 segmentos Vertho (pain hypotheses, ofertas)
```

---

## 20. Internacionalização (next-intl)

> 3 locales: **pt-BR** (default), **pt-PT**, **es-ES**. Migration 114. Commit `50a5b9b`.

### 20.1 Arquivos-chave
```
i18n/routing.ts            # locales + defaultLocale 'pt-BR'
i18n/request.ts            # getRequestConfig: resolve locale por precedência (abaixo)
lib/i18n.ts                # normalizeAppLocale, resolveAppLocale, cookie 'vertho-locale'
lib/i18n-server.ts         # getTenantDefaultLocaleBySlug (empresas.default_locale), getLocaleForEmail
lib/i18n-auth-templates.ts # templates de OTP/auth (WhatsApp + email) nos 3 locales
messages/{pt-BR,pt-PT,es-ES}.json
next.config.mjs            # wrapped com createNextIntlPlugin()
```

### 20.2 Precedência de resolução do locale
`requestLocale (URL)` → cookie `vertho-locale` → header `x-vertho-locale` → `empresas.default_locale` (do tenant) → `accept-language` → `pt-BR`.

### 20.3 Migration 114
- `empresas.default_locale TEXT NOT NULL DEFAULT 'pt-BR'` (CHECK em pt-BR/pt-PT/es-ES)
- `colaboradores.locale TEXT` nullable (CHECK idem) — sobrescreve o default da empresa
- Fallback de leitura: `colaborador.locale → empresa.default_locale → pt-BR`

---

## 21. Auditoria de Admin + Matriz de Permissões

### 21.1 Auditoria (`admin_audit_log` — migration 116)
- `lib/audit.ts::logAdminAction({ acao, empresa_id, alvo, detalhes, resultado })` — chamada de 1 linha em disparos e mutações sensíveis. **Best-effort**: nunca lança (falha de auditoria não derruba a ação). Grava via service-role; captura `ip` (x-forwarded-for) e `user_agent`.
- Campos: `admin_email`, `admin_user_id`, `acao`, `empresa_id`/`empresa_slug`, `alvo`, `detalhes` (JSONB), `resultado` (ok/parcial/erro), `ip`, `user_agent`, `criado_em`. Append-only, cross-tenant (empresa_id nullable pra ações de plataforma).
- Tela `/admin/auditoria` (`page.tsx` + `actions.ts::loadAuditLog`): tabela filtrável (ação, empresa, admin), resultado colorido, detalhes JSON, últimas 2000 linhas pras facetas.

### 21.2 Matriz de Permissões (`lib/permissions.ts` + `permission_overrides` — migration 117)
- **5 papéis de sistema**: `platform_admin` (tudo), `rh` (admin do tenant, ~15 permissões), `gestor` (~5), `tutor` (~3), `colaborador` (~3).
- **31 permissões** nomeadas por domínio (Admin, Governança, Empresas, Usuários, Configurações, Avaliações, Relatórios, Jornada, Conteúdo, IA, Radar, Radar Empresas, Dados) — cada uma com `label` PT-BR, `description` e `risk` (low/medium/high/critical).
- **Matriz base** fixa em código (`BASE_ROLE_PERMISSIONS`). **Overrides** em `permission_overrides` (scope `role`|`user`, `effect` allow|deny, `reason` obrigatório ≥5 chars, auditável; UNIQUE por scope+permission).
- Funções: `getSystemRole(ctx)`, `hasBasePermission(role, perm)`, `loadPermissionOverrides()`, `getEffectivePermissionKeys(ctx)` (= base + allow − deny), `can(ctx, perm)` (async). Guard de action: `requirePermissionAction(perm)`.
- Console `/admin/permissoes`: matriz clicável (permissões × papéis), diagnóstico por usuário (papel efetivo + allowed/denied), lista de overrides ativos, modal de save com motivo.

---

## 22. Login por OTP via WhatsApp

> Para colaborador **sem email** (ex.: Macaé). Telefone vira identidade. Commit `32ddf15`, migration 112.

### 22.1 Schema (migration 112)
- `colaboradores.login_por_whatsapp BOOLEAN DEFAULT FALSE` + `UNIQUE INDEX (empresa_id, telefone) WHERE login_por_whatsapp`
- `colab_otp` — `empresa_id`, `telefone` (E.164), `code_hash` (sha256+pepper), `expires_at` (10min), `attempts` (max 5), `consumed_at`

### 22.2 Fluxo
1. **Request** (`/api/auth/phone-otp/request`): valida móvel BR (`validateWhatsAppBR`), resolve tenant via `x-tenant-slug`, busca colab `login_por_whatsapp=true`, `issueOtp()` (rate-limit 3/15min + 30s, código de 6 dígitos cripto, só o **hash** persiste), envia via Z-API (mensagem locale-aware). Resposta genérica `{ok:true}` mesmo se o número não existe (**anti-enumeração**).
2. **Verify** (`/api/auth/phone-otp/verify`): `checkOtp()` (expiração, attempts, `timingSafeEqual`), marca `consumed_at`. Gera **email-proxy determinístico** `wa.<empresaId>.<e164>@nao-email.vertho.ai`, cria/reusa o usuário no Supabase Auth (`createUser` idempotente) e devolve `callbackUrl` reaproveitando o fluxo de magic-link (`/auth/callback?token_hash=...`).

Helpers em `lib/phone-otp.ts` (`proxyEmailFromPhone`, `isProxyEmail`, `issueOtp`, `checkOtp`, pepper `OTP_PEPPER`) e `lib/phone.ts` (`normalizePhoneBR`, `validateWhatsAppBR`).

---

*Documento validado contra o codigo-fonte local em 25/05/2026.*
*~420 arquivos TS/TSX + ~70 JS/MJS/Python | 98 arquivos SQL (022-117) | 28+ arquivos de teste | vertho.ai*
*Revisao: 25/05/2026 (HEAD `2730cd7` — RadarEmpresas + i18n + auditoria/permissões + OTP WhatsApp + hardening RLS)*
