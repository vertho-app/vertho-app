# Vertho Mentor IA — Arquitetura do Sistema

> Documento oficial de arquitetura — SaaS B2B de desenvolvimento de competencias por IA.
> Ultima atualizacao: 15/04/2026
> Revisado contra o codigo-fonte em producao (vertho.com.br)
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
| **Framework** | Next.js (App Router) | 16.2.2 | ✅ |
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
| **Filas** | Upstash QStash | 2.10.1 | ✅ |
| **WhatsApp** | Z-API (REST) | — | 🔑 |
| **Email** | Resend API | — | 🔑 |
| **Scraping Primario** | Jina AI Reader | — | ✅ |
| **Scraping Fallback** | Firecrawl | — | 🔑 |
| **Error Tracking** | Sentry | — | 🔑 |
| **Testes** | Playwright + smoke-test.js | — | ✅ |
| **Hospedagem** | Vercel (Serverless) | — | ✅ |
| **DNS/CDN** | Cloudflare (Full Strict SSL) | — | ✅ |
| **Dominio** | vertho.com.br (wildcard *.vertho.com.br) | — | ✅ |
| **CI/CD** | GitHub Actions (smoke test no push) | — | ✅ |

**Config Next.js**: `experimental.serverActions.bodySizeLimit = '50mb'` (Next 16 compat).

---

## 2. Estrutura de Pastas (~160 arquivos JS)

```
nextjs-app/
├── middleware.js                  # Roteamento multi-tenant por subdominio
├── sentry.client.config.js       # Sentry (browser errors)
├── sentry.server.config.js       # Sentry (server errors)
├── sentry.edge.config.js         # Sentry (middleware errors)
├── vercel.json                   # Cron jobs (3 triggers)
├── playwright.config.js          # Config testes e2e
├── .env.example                  # Template env vars (sem segredos)
├── .github/
│   └── workflows/
│       └── smoke-test.yml        # CI/CD: smoke test em cada push
├── app/
│   ├── layout.js                 # Root layout (Inter font, meta, theme)
│   ├── globals.css               # Tailwind + design tokens (navy, cyan, teal)
│   ├── global-error.js           # Error boundary → Sentry
│   ├── page.js                   # Redirect → /login
│   ├── login/
│   │   ├── page.js               # Server Component: resolve tenant → branding
│   │   └── login-form.js         # Client: Magic Link + senha
│   ├── dashboard/                # Area do colaborador (autenticado)
│   │   ├── page.js               # Dashboard com Proximo Passo + Acesso Rapido
│   │   ├── layout.js             # Shell: header + bottom nav + BETO
│   │   ├── dashboard-shell.js    # Client: nav
│   │   ├── dashboard-actions.js  # loadDashboardData() com RBAC explicito
│   │   ├── assessment/
│   │   │   ├── page.js           # Lista competencias com status
│   │   │   ├── assessment-actions.js
│   │   │   └── chat/page.js      # Motor Conversacional Fase 3
│   │   ├── pdi/page.js           # PDI com cards expandiveis
│   │   ├── perfil/page.js        # Perfil + DISC preview + logout
│   │   ├── perfil-comportamental/
│   │   │   ├── page.js           # Resultado DISC ou "Iniciar Mapeamento"
│   │   │   └── mapeamento/page.js  # Instrumento DISC completo (29 steps)
│   │   ├── evolucao/page.js      # Comparativo inicial vs reavaliacao
│   │   ├── jornada/page.js       # Timeline vertical 5 fases
│   │   ├── praticar/
│   │   │   ├── page.js           # Pilula semanal + progresso
│   │   │   └── evidencia/page.js # Formulario de evidencia
│   │   ├── temporada/
│   │   │   ├── page.js           # Timeline 14 semanas (cards coloridos)
│   │   │   ├── semana/[week]/page.js  # Player + desafio + Tira-Duvidas + Evidencias
│   │   │   ├── sem14/page.js     # NOVO: Wizard 4 perguntas (cenario B)
│   │   │   └── concluida/page.js # NOVO: Temporada Concluida (5 blocos + PDF)
│   │   └── gestor/
│   │       └── equipe-evolucao/  # NOVO: Dashboard gestor
│   │           ├── page.js       # Lista liderados + delta + status + filtros
│   │           └── actions.js    # Server actions do gestor
│   ├── admin/                    # Painel administrativo
│   │   ├── layout.js             # Wrapper AdminGuard
│   │   ├── admin-guard.js        # Server-side via platform_admins
│   │   ├── admin-actions.js      # checkAdminAccess()
│   │   ├── dashboard/page.js     # 7 KPIs + System Health + lista empresas
│   │   ├── empresas/
│   │   │   ├── nova/             # Form: nome + segmento (auto-slug)
│   │   │   ├── gerenciar/        # Import CSV com role
│   │   │   └── [empresaId]/
│   │   │       ├── page.js       # Pipeline Fases 0-5
│   │   │       ├── actions.js
│   │   │       ├── fase0/page.js # Moodle detalhes
│   │   │       ├── fase1/page.js # Fase 1: Top 10, Gabarito, Cenarios
│   │   │       ├── fase2/page.js # Fase 2: Diagnostico + Trilhas
│   │   │       └── configuracoes/page.js  # 5 tabs
│   │   ├── cargos/               # Top 5 selection
│   │   ├── competencias/         # CRUD completo + copy da base
│   │   ├── assessment-descritores/ # Grid colab x descritor (notas 1-4)
│   │   ├── conteudos/            # Banco micro-conteudos + Bunny import + tagging IA
│   │   ├── temporadas/           # Viewer temporadas + botao Simulador
│   │   ├── evolucao/             # Evolution Report agregado
│   │   ├── ppp/                  # Extracao PPP
│   │   ├── relatorios/           # Download PDFs
│   │   ├── whatsapp/             # Disparo lote
│   │   ├── simulador/            # Sandbox chat
│   │   ├── fit/                  # Fit v2
│   │   ├── top10/                # IA1 top 10
│   │   ├── videos/               # Analytics Bunny
│   │   ├── platform-admins/      # Gestao admins
│   │   ├── preferencias-aprendizagem/
│   │   └── vertho/               # NOVO: Paineis Admin Vertho
│   │       ├── evidencias/       # Conversas socraticas 1-12, extracao, transcript
│   │       │   ├── page.js
│   │       │   └── actions.js
│   │       ├── avaliacao-acumulada/  # Nota por descritor + auditoria + regerar
│   │       │   ├── page.js
│   │       │   └── actions.js
│   │       ├── auditoria-sem14/  # 4 notas + delta + regerar com feedback
│   │       │   ├── page.js
│   │       │   └── actions.js
│   │       └── simulador-custo/  # Calculadora interativa custo IA
│   │           └── page.js
│   ├── actions/
│   │   ├── beto.js               # BETO contextual
│   │   └── manutencao.js
│   └── api/
│       ├── chat/route.js         # Motor Conversacional
│       ├── chat-simulador/route.js
│       ├── assessment/route.js
│       ├── colaboradores/route.js
│       ├── upload-logo/route.js
│       ├── cron/route.js         # 3 cron jobs
│       ├── content/search/route.js  # Busca micro_conteudos
│       ├── capacitacao-recomendada/route.js  # NOVO: multi-formato por comp foco
│       ├── relatorios/individual/route.js
│       ├── relatorios/pdf/route.js
│       ├── temporada/
│       │   ├── reflection/route.js    # Chat socratico/analitico
│       │   ├── tira-duvidas/route.js  # NOVO: Chat reativo (Haiku 4.5)
│       │   ├── missao/route.js        # NOVO: set_modo + compromisso
│       │   ├── evaluation/route.js    # Sem 14 wizard + triangulacao
│       │   └── concluida/pdf/route.js # NOVO: PDF Evolution Report
│       ├── gestor/
│       │   └── plenaria/pdf/route.js  # NOVO: PDF Plenaria equipe
│       ├── webhooks/
│       │   ├── bunny/route.js
│       │   ├── qstash/route.js
│       │   └── qstash/whatsapp-cis/route.js
│       └── ...
├── actions/                      # Server Actions (logica de negocio, ~40 arquivos)
│   ├── ai-client.js              # callAI + callAIChat + Extended Thinking
│   ├── utils.js                  # extractJSON, extractBlock, stripBlocks
│   ├── fase1.js                  # IA1, IA2, IA3, Cenarios
│   ├── fase2.js                  # Forms, emails, coleta, status
│   ├── fase3.js                  # IA4, relatorios
│   ├── fase4.js                  # PDI, trilhas, triggers
│   ├── fase5.js                  # Reavaliacao, evolucao, plenaria
│   ├── temporadas.js             # Motor de Temporadas (gerar, carregar, listar)
│   ├── conteudos.js              # Banco micro-conteudos + Bunny + tagging IA
│   ├── conteudos-metrics.js      # Metricas de conteudos
│   ├── avaliacao-acumulada.js    # NOVO: Auto-trigger pos sem 13, dual-IA
│   ├── evolution-report.js       # NOVO: Consolida sems 13+14
│   ├── temporada-concluida.js    # NOVO: Dados tela Concluida
│   ├── simulador-temporada.js    # NOVO: 1 sem/chamada, 4 perfis, Haiku
│   ├── assessment-descritores.js # CRUD assessment descritores
│   ├── cenario-b.js              # Cenario B
│   ├── check-ia4.js              # Validacao 4D x 25pts = 100
│   ├── evolucao-granular.js      # Delta por descritor
│   ├── fit-v2.js                 # Calculo Fit v2
│   ├── trilhas-load.js           # Carregar trilhas
│   ├── tutor-evidencia.js        # Avaliacao evidencia
│   ├── competencias.js           # CRUD por empresa
│   ├── competencias-base.js      # CRUD base global
│   ├── ppp.js                    # Jina + Firecrawl + 10 secoes
│   ├── onboarding.js             # Criar empresa, importar, config
│   ├── cron-jobs.js              # cleanup, segunda, quinta
│   ├── dashboard-kpis.js         # KPIs home
│   ├── bunny-stats.js            # Metricas Bunny
│   ├── video-analytics.js        # Analytics por colab
│   ├── video-tracking.js         # Registro views
│   ├── whatsapp.js               # Z-API
│   ├── whatsapp-lote.js          # QStash lote
│   ├── automacao-envios.js       # PDF + WhatsApp lote
│   ├── relatorios.js             # Geracao relatorios
│   ├── relatorios-load.js        # Load relatorios
│   ├── simulador-conversas.js    # Simulador admin
│   ├── simulador-disc.js         # Simulador DISC
│   ├── backup.js                 # Backup actions
│   ├── preferencias-aprendizagem.js
│   └── manutencao.js
├── components/
│   ├── beto-chat.js              # Chat flutuante (hidden em semana pages)
│   ├── mic-input.js              # Web Speech API (forwardRef + stop on send)
│   ├── page-shell.js             # PageContainer, PageHero, GlassCard, SectionHeader
│   ├── preferencias-ranking.js
│   ├── video-modal.js            # Bunny iframe + postMessage tracking
│   ├── dashboard/
│   │   ├── RHView.js
│   │   └── ManagerView.js
│   └── pdf/
│       ├── styles.js             # NotoSans, paleta, helpers
│       ├── RelatorioTemplate.js
│       ├── RelatorioIndividual.js
│       ├── RelatorioGestor.js
│       ├── RelatorioRH.js
│       ├── PdfCover.js
│       ├── SectionTitle.js
│       ├── StatusBadge.js
│       ├── CompetencyBlock.js
│       └── ChecklistBox.js
├── lib/
│   ├── supabase.js               # createSupabaseClient + createSupabaseAdmin
│   ├── supabase-browser.js       # Singleton browser client
│   ├── tenant-resolver.js        # resolveTenant(slug) cache 5min
│   ├── ui-resolver.js            # getCustomLabel + isHidden
│   ├── authz.js                  # RBAC: getUserContext, isPlatformAdmin, roles
│   ├── versioning.js             # Prompt versioning (SHA-256 dedup)
│   ├── logger.js                 # Logger estruturado
│   ├── notifications.js          # Templates email + WhatsApp
│   ├── competencias-base.js      # Arrays educacao/corporativo + PILAR_COLORS
│   ├── pdf-assets.js             # Assets para PDFs
│   ├── markdown-to-pdf.js        # Converter markdown para PDF
│   ├── parse-spreadsheet.js      # Parser de planilhas
│   ├── ai-tasks.js               # Tasks IA auxiliares
│   ├── ia-cost-catalog.js        # NOVO: Catalogo 20 chamadas x 7 modelos x 3 presets
│   ├── temporada-concluida-pdf.js  # NOVO: PDF Evolution Report individual
│   ├── plenaria-equipe-pdf.js    # NOVO: PDF Plenaria consolidado do time
│   ├── disc-arquetipos.js
│   ├── avatar-presets.js
│   ├── preferencias-config.js
│   ├── season-engine/            # Motor de Temporadas
│   │   ├── build-season.js       # buildSeason(): 14 semanas (missao+cenario em paralelo)
│   │   ├── select-descriptors.js # selectDescriptors(): 9 slots por gap
│   │   ├── week-gating.js        # NOVO: Gate calendario + anterior concluida
│   │   └── prompts/              # 16 prompts
│   │       ├── socratic.js       # Evidencias: 6 turnos, DISC, anti-alucinacao
│   │       ├── analytic.js       # Feedback analitico: 10 turnos
│   │       ├── challenge.js      # Desafio semanal
│   │       ├── scenario.js       # Cenario situacional
│   │       ├── tira-duvidas.js   # NOVO: Chat reativo (Haiku 4.5)
│   │       ├── missao.js         # NOVO: Missao pratica
│   │       ├── missao-feedback.js # NOVO: IA analisa relato (10 turnos)
│   │       ├── acumulado.js      # NOVO: Avaliacao acumulada (cega, dual-IA)
│   │       ├── evolution-qualitative.js  # Sem 13: 12 turnos, 6 etapas
│   │       ├── evolution-scenario.js     # Sem 14 cenario
│   │       ├── evolution-scenario-check.js # NOVO: Check 2a IA
│   │       ├── simulador-temporada.js    # NOVO: 4 perfis
│   │       ├── case-study.js
│   │       ├── text-content.js
│   │       ├── video-script.js
│   │       └── podcast-script.js
│   ├── fit-v2/
│   │   ├── engine.js
│   │   ├── blocos.js
│   │   ├── classificacao.js
│   │   ├── gap-analysis.js
│   │   ├── penalizacoes.js
│   │   ├── ranking.js
│   │   └── validacao.js
│   ├── prompts/
│   │   ├── behavioral-report-prompt.js
│   │   ├── fit-executive-prompt.js
│   │   └── insights-executivos-prompt.js
│   └── supabase/
│       └── mapCISProfile.js
├── scripts/
│   ├── smoke-test.js
│   ├── backup-project.ps1
│   ├── checkpoint.ps1
│   ├── auto-backup-diario.ps1
│   └── instalar-backup-automatico.ps1
├── tests/                        # Playwright e2e (86 specs)
├── docs/
│   ├── envs-importantes.md
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
{slug}.vertho.com.br/login
  → middleware.js extrai slug do hostname
  → Injeta header x-tenant-slug
  → Server Components resolvem tenant via lib/tenant-resolver.js (cache 5min)
```

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
- RLS habilitado em todas as tabelas principais
- Migration 037: RLS habilitado em `competencias`, `competencias_base`, `platform_admins`, `reavaliacao_sessoes`, `videos_watched`

**Camada 3 — Codigo (Server Actions + API Routes)**
- Server actions usam `createSupabaseAdmin()` com filtro EXPLICITO de `empresa_id`
- API routes: `/api/colaboradores` exige `empresa_id` no request

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
| Tira-Duvidas | `tira-duvidas.js` | ilimitado | Haiku 4.5 | Chat reativo por semana, guard-rail no descritor |
| Evidencias (socratica) | `socratic.js` | 6 | Sonnet | DISC + anti-alucinacao + perguntas abertas |
| Desafio | `challenge.js` | — | Sonnet | Micro-acao observavel |
| Cenario | `scenario.js` | — | Sonnet | Cenario situacional com stakeholders |
| Missao | `missao.js` | — | Sonnet | Missao pratica (sem 4/8/12) |
| Missao Feedback | `missao-feedback.js` | 10 | Sonnet | IA analisa relato da missao |
| Analitico (fallback) | `analytic.js` | 10 | Sonnet | Feedback cenario escrito |
| Evolution Qualitativa | `evolution-qualitative.js` | 12 | Sonnet | Sem 13: 6 etapas, microcaso, DISC |
| Acumulada | `acumulado.js` | single-shot | Sonnet + auditor | Pontua 1-4 cega, max 8000+6000 tok |
| Evolution Cenario | `evolution-scenario.js` | — | Sonnet | Gera cenario sem 14 |
| Evolution Check | `evolution-scenario-check.js` | — | Sonnet | 2a IA valida cenario |
| Simulador | `simulador-temporada.js` | 1 sem/chamada | Haiku | 4 perfis comportamentais |
| Case Study | `case-study.js` | — | Sonnet | Geracao de caso |
| Texto | `text-content.js` | — | Sonnet | Geracao de artigo |
| Video Script | `video-script.js` | — | Sonnet | Roteiro video |
| Podcast Script | `podcast-script.js` | — | Sonnet | Roteiro podcast |

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

## 6. Integracoes

### 6.1 WhatsApp — Z-API + QStash
Dispatch async com delay incremental 2s. Status: ✅ operacional, 🔑 Z-API credentials.

### 6.2 Email — Resend API
Dispatch de formularios e relatorios. Status: 🔑 RESEND_API_KEY.

### 6.3 PDF — @react-pdf/renderer + pdfjs-dist
Geracao server-side. Fonte NotoSans. PDFs: Individual, Gestor, RH, Comportamental, **Evolution Report**, **Plenaria**.
- `lib/temporada-concluida-pdf.js` — PDF Evolution Report individual
- `lib/plenaria-equipe-pdf.js` — PDF Plenaria consolidado do time
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

## 8. Modelagem de Dados (36 migrations)

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

---

## 10. Testes

### Smoke Test (HTTP)
`node scripts/smoke-test.js https://vertho.com.br` — 29 rotas, CI-ready.

### Playwright E2E (86 specs)
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
- RLS habilitado em todas as tabelas principais (5 adicionais via migration 037)
- Nenhuma NEXT_PUBLIC sensivel
- Sentry para error tracking

### Repositorio publico
- NUNCA commitar .env, credenciais ou tokens
- `.gitignore` exclui `.env*.local`
- Variaveis de ambiente vivem APENAS na Vercel

---

## 12. Observabilidade

- `lib/logger.js` — logger estruturado
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
| Simulador de Custo | `/admin/vertho/simulador-custo` | Calculadora interativa: catalogo 20 chamadas, 7 modelos, 3 presets |

Todos com filtro `?empresa=` e back button context-aware. Dados via `lib/ia-cost-catalog.js`.

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
- Rodar migrations em ordem: `supabase/migrations/001*.sql` ate `036*.sql`

---

## 15. Infraestrutura

```
GitHub: vertho-app/vertho-app (publico)
Vercel: vertho-app (deploy via git push)
Cloudflare: DNS + CDN (CNAME @ e * → cname.vercel-dns.com, SSL Full Strict)
Supabase: PostgreSQL + Auth + Storage + RLS
Upstash: QStash (filas async WhatsApp)
Sentry: Error tracking
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

---

*Documento validado contra o codigo-fonte em producao.*
*~160 arquivos JS | 36 migrations SQL | 86 e2e tests | 20+ env vars | vertho.com.br*
*Revisao: 15/04/2026*
