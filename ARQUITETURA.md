# Vertho Mentor IA — Arquitetura do Sistema

> Documento oficial de arquitetura — SaaS B2B de desenvolvimento de competencias por IA.
> Ultima atualizacao: 13/05/2026
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
| **Hospedagem** | Vercel (Serverless) | — | ✅ |
| **DNS/CDN** | Cloudflare (Full Strict SSL) | — | ✅ |
| **Dominio** | vertho.ai (raiz) + app.vertho.ai (auth/admin) + *.vertho.ai (tenants) + radar.vertho.ai + radarbett.vertho.ai. Legado vertho.com.br ainda atendido pelo middleware. | — | ✅ |
| **CI/CD** | GitHub Actions (smoke test no push) | — | ✅ |

**Config Next.js**: `experimental.serverActions.bodySizeLimit = '50mb'` (Next 16 compat).

---

## 1.1 Estado de Retomada (13/05/2026)

Contexto rapido para reinicializacao da maquina:

- Branch atual: `master`, **Modo Onboarding** completo (Fases 1-4). Engine parametrizada via `lib/season-engine/programa-config.ts`; `getProgramaConfig` lê `sys_config.programa_modo`. Template `PROGRAMA_ONBOARDING` (10 sem, missões 4/7/9, cenário B sem 10, nível-meta 2, 5 comps em espiral). IA1 aceita viés por fase de carreira; IA3 (cenário) e missão aceitam modo integrador multi-competência. `actions/temporadas.gerarTemporadaOnboarding` faz trilha multi-comp; `gerarAvaliacaoAcumuladaParcial` roda acumulada por janela. Role `'tutor'` adicionado em `types/index.d.ts` + `lib/authz` (`isTutor`, `getTutorados`, `canTutorAccess`). UI admin: tab "Programa" + role tutor no dropdown. Migrations 090 (sys_config schema), 091 (trilhas.competencias_foco TEXT[]), 092 (colaboradores.tutorados_ids UUID[]).
- Arquivos rastreados: pendentes no momento desta revisao — `supabase/config.toml` (drift local) e este `ARQUITETURA.md`.
- Nao versionados presentes no workspace: `.tmp_enem_2024/`, `outputs/`, `RESUMO.md`, `public/Logo sem texto.png`, `scripts/diag-tables-check.mjs`.
- Ultimas frentes visiveis (semana 2026-05-12 → 13):
  - **Admin Dashboard redesign**: sidebar dinamica + header com filtro de empresa (React Portal pra sair do stacking context) + bento grid mantendo cores Vertho. Filtro persistido em localStorage.
  - **Gate de perfil comportamental pos-votacao**: bloqueia /perfil-comportamental ate o colab finalizar a votacao (commits `401b591`, `392980b`).
  - **Tela admin de perfis comportamentais por empresa** (commit `0b2e0d1`): `/admin/empresas/{id}/perfis-comportamentais`.
  - **Confirms preventivos em acoes destrutivas/massivas** (commits `3730e22`, `4990742`): `simular-disc`, `simular`, `temporadas`, `rel-ind`, `cenarios-b`, `evolucao`, `plenaria`, `rh-links`, `rh-dossie` no pipeline empresa; disparo WhatsApp/email e Magic Links; copia de competencia base. Razao: incidente em que admin clicou no botao errado e gerou todas as avaliacoes comportamentais.
  - **PWA do dashboard removida** (commits `6828af3`, `7bc6855`): link WhatsApp no iOS sempre abre browser, scope `/dashboard/` nao agregou valor; kill switch `sw.js` ja retirado.
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
│   │   ├── build-season.ts       # buildSeason(): 14 semanas (missao+cenario em paralelo)
│   │   ├── select-descriptors.ts # selectDescriptors(): 9 slots por gap
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

### 3.1 Roteamento por Subdominio
```
{slug}.vertho.ai/login (legado: {slug}.vertho.com.br)
  → middleware.js extrai slug do hostname (suporta .ai e .com.br)
  → Injeta header x-tenant-slug + cookie vertho-tenant-slug
  → Server Components resolvem tenant via lib/tenant-resolver.ts (cache 5min)
  → radar.vertho.ai     → reescreve para /radar/<path>     (site publico Radar)
  → radarbett.vertho.ai → reescreve para /radarbett/<path> (site publico Bett 2026)
  → app.vertho.ai       → app principal (auth/admin)
```

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

**Camada 2 — RLS (Row Level Security)**
- RLS habilitado nas tabelas principais, porém com policies permissivas (`USING (true)`) — não atua como barreira real enquanto queries usam service_role
- Migration 037: RLS habilitado em `competencias`, `competencias_base`, `platform_admins`, `reavaliacao_sessoes`, `videos_watched`
- **Status real**: RLS está ativo mas não funciona como defense-in-depth porque todas as queries usam `createSupabaseAdmin()` (service_role bypassa RLS)

**Camada 3 — Codigo (Server Actions + API Routes)**
- Server actions usam `createSupabaseAdmin()` com filtro EXPLICITO de `empresa_id`
- API routes: `/api/colaboradores` exige `empresa_id` no request

**Camada 4 — Auth Action Context (auth audit P1+P2, 2026-04)**
- `lib/auth/action-context.ts` provê três guardas para server actions:
  - `requireAdminAction()` — exige platform admin
  - `requireUserAction()` — exige usuário autenticado (qualquer role)
  - `requireAdminOrCronAction()` — admin OU chamada do cron QStash assinada
- Aplicado em ~120 server actions (votação, fase1-5, temporadas, ppp, conteudos, etc.)
- Migration 081: RLS restrita em `diag_analises_ia`

### 3.4 Branding por Tenant
Coluna `ui_config JSONB`: logo_url, 7 cores, font_color, login_subtitle, hidden_elements, labels.

### 3.5 Config por Tenant
Coluna `sys_config JSONB`: ai_model, cadencia, envios.

---

## 4. RBAC (Controle de Acesso Baseado em Papeis)

### 4.1 Papeis por Tenant
Coluna `role` em `colaboradores`: `colaborador` | `gestor` | `rh`

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
1. Usuario acessa {slug}.vertho.com.br/login
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
   - Conteudo (9 slots): micro_conteudos + desafio
   - Pratica (sem 4/8/12): missao + cenario em paralelo
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

## 8. Modelagem de Dados (70 arquivos SQL — 022 a 089)

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
`node scripts/smoke-test.js https://vertho.com.br` — 29 rotas, CI-ready.

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

- RBAC explicito: coluna `role` + tabela `platform_admins`
- Admin guard server-side
- API colaboradores: empresa_id obrigatorio
- RLS habilitado nas tabelas principais (5 adicionais via migration 037), porém policies permissivas — proteção real vem da camada de app
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
  - vertho.ai (raiz)
  - app.vertho.ai (auth/admin/dashboard)
  - *.vertho.ai (tenants — vincular manualmente em /admin/empresas/{id}/configuracoes)
  - radar.vertho.ai (Radar publico nacional)
  - radarbett.vertho.ai (site Bett 2026)
  - vertho.com.br (legado, ainda atendido pelo middleware)
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

---

*Documento validado contra o codigo-fonte local em 13/05/2026.*
*~378 arquivos TS/TSX + ~58 JS/MJS | 70 arquivos SQL (022-089) | 27 arquivos de teste | 22+ env vars | vertho.ai*
*Revisao: 13/05/2026 (HEAD `4990742` — confirms preventivos)*
