# Vertho Mentor IA — Arquitetura do Sistema

> Documento oficial de arquitetura — SaaS B2B de desenvolvimento de competencias por IA.
> Ultima atualizacao: 09/04/2026
> Commit de referencia: 1038523
> Revisado contra o codigo-fonte em producao (vertho.com.br)
> Metodo: auditoria automatizada + revisao manual + comparacao com legado GAS

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
| **IA Principal** | Anthropic SDK (Claude) | 0.81.0 | ✅ |
| **IA Secundaria** | Google Gemini | via fetch nativo | ✅ |
| **IA Validacao** | Gemini (auditor multi-LLM) | via fetch nativo | ✅ |
| **PDF** | @react-pdf/renderer (geracao) | 4.4.0 | ✅ |
| **PDF Reader** | pdfjs-dist (leitura) | 5.6 | ✅ |
| **Filas** | Upstash QStash | 2.10.1 | ✅ |
| **WhatsApp** | Z-API (REST) | — | 🔑 |
| **Email** | Resend API | — | 🔑 |
| **Scraping Primario** | Jina AI Reader | — | ✅ |
| **Scraping Fallback** | Firecrawl | — | 🔑 |
| **LMS** | Moodle (REST API) | — | ✅ |
| **Error Tracking** | Sentry | — | 🔑 |
| **Testes** | Playwright + smoke-test.js | — | ✅ |
| **Hospedagem** | Vercel (Serverless) | — | ✅ |
| **DNS/CDN** | Cloudflare (Full Strict SSL) | — | ✅ |
| **Dominio** | vertho.com.br (wildcard *.vertho.com.br) | — | ✅ |
| **CI/CD** | GitHub Actions (smoke test no push) | — | ✅ |

---

## 2. Estrutura de Pastas (~130 arquivos JS)

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
│   │   ├── dashboard-shell.js    # Client: nav (Inicio/Jornada/Praticar/Evolucao/Perfil)
│   │   ├── dashboard-actions.js  # loadDashboardData() com RBAC explicito
│   │   ├── assessment/
│   │   │   ├── page.js           # Lista competencias com status + link ao chat
│   │   │   ├── assessment-actions.js
│   │   │   └── chat/page.js      # Motor Conversacional Fase 3 (UI)
│   │   ├── pdi/
│   │   │   ├── page.js           # PDI com cards expandiveis + CTA
│   │   │   └── pdi-actions.js
│   │   ├── perfil/
│   │   │   ├── page.js           # Perfil + DISC preview + logout
│   │   │   └── perfil-actions.js
│   │   ├── perfil-comportamental/
│   │   │   ├── page.js           # Resultado DISC ou "Iniciar Mapeamento"
│   │   │   ├── perfil-comportamental-actions.js
│   │   │   └── mapeamento/
│   │   │       ├── page.js       # Instrumento DISC completo (29 steps, 864 linhas)
│   │   │       └── mapeamento-actions.js  # Salva 29+ colunas no Supabase
│   │   ├── evolucao/
│   │   │   ├── page.js           # Comparativo inicial vs reavaliacao
│   │   │   └── evolucao-actions.js
│   │   ├── jornada/
│   │   │   ├── page.js           # Timeline vertical 5 fases
│   │   │   └── jornada-actions.js
│   │   └── praticar/
│   │       ├── page.js           # Pilula semanal + progresso
│   │       ├── praticar-actions.js # + registrarEvidencia com avaliacao IA
│   │       └── evidencia/page.js # Formulario de evidencia
│   ├── admin/                    # Painel administrativo
│   │   ├── layout.js             # Wrapper AdminGuard
│   │   ├── admin-guard.js        # Server-side via platform_admins
│   │   ├── admin-actions.js      # checkAdminAccess()
│   │   ├── dashboard/
│   │   │   ├── page.js           # 7 KPIs + System Health + lista empresas
│   │   │   └── actions.js
│   │   ├── empresas/
│   │   │   ├── nova/             # Form: nome + segmento (auto-slug)
│   │   │   ├── gerenciar/        # Import CSV com role
│   │   │   └── [empresaId]/
│   │   │       ├── page.js       # Pipeline Fases 0-5 + danger zone
│   │   │       ├── actions.js    # Pipeline + cleanup por colaborador
│   │   │       ├── fase0/page.js # Moodle detalhes (Catalogo, Catalogado IA, Cobertura)
│   │   │       ├── fase1/page.js # Fase 1 detalhes (Top 10, Top 5, Gabarito, Cenarios)
│   │   │       ├── fase2/page.js # Fase 2 detalhes (Diagnostico + Trilhas)
│   │   │       ├── fase3/page.js # Fase 3 Capacitacao (dashboard progresso Moodle)
│   │   │       └── configuracoes/
│   │   │           ├── page.js   # 5 tabs: Equipe, Branding, IA, Automacoes, Envios
│   │   │           └── actions.js
│   │   ├── cargos/               # Top 5 selection com checkboxes
│   │   ├── competencias/         # CRUD completo + copy da base
│   │   ├── ppp/                  # Extracao 10 secoes + PDF reader + Firecrawl
│   │   ├── relatorios/           # Download PDF individuais
│   │   ├── whatsapp/             # Disparo CIS + relatorios via QStash
│   │   ├── simulador/            # Sandbox chat (amber theme, sem BD)
│   │   └── platform-admins/      # Gestao admins da plataforma
│   ├── actions/                  # Server Actions (app-level)
│   │   ├── beto.js               # BETO contextual (injeta pilula da semana)
│   │   └── manutencao.js
│   └── api/                      # API Routes (15 endpoints)
│       ├── chat/route.js         # Motor Conversacional completo
│       ├── chat-simulador/route.js
│       ├── assessment/route.js
│       ├── colaboradores/route.js # empresa_id obrigatorio (seguranca)
│       ├── upload-logo/route.js
│       ├── cron/route.js         # 3 cron jobs (cleanup, segunda, quinta)
│       ├── relatorios/individual/route.js
│       └── webhooks/qstash/whatsapp-cis/route.js
├── actions/                      # Server Actions (logica de negocio, 20 arquivos)
│   ├── ai-client.js              # callAI + callAIChat + Extended Thinking
│   ├── utils.js                  # extractJSON, extractBlock, stripBlocks
│   ├── fase1.js                  # IA1, IA2 (+ versao_regua), IA3, Cenarios
│   ├── fase2.js                  # Forms, emails (Resend), coleta, status
│   ├── fase3.js                  # IA4 (32768 tok), relatorios (64000 tok)
│   ├── fase4.js                  # PDI, trilhas (comp foco), triggers
│   ├── fase5.js                  # Reavaliacao, evolucao, plenaria
│   ├── capacitacao.js            # Fase 3: provisionar Moodle, sync, nudges, tutor IA
│   ├── trilhas-load.js           # Carregar trilhas com dados de colaborador
│   ├── cenario-b.js              # Cenario B (DISC-adapted, dilema etico)
│   ├── check-ia4.js              # Validacao 4D × 25pts = 100
│   ├── evolucao-granular.js      # Delta por descritor + convergencia CIS
│   ├── tutor-evidencia.js        # Avaliacao de evidencia (5 criterios × 2pts)
│   ├── cron-jobs.js              # cleanup 48h, segunda (pilula), quinta (evidencia)
│   ├── competencias.js           # CRUD por empresa
│   ├── competencias-base.js      # CRUD base global
│   ├── ppp.js                    # Jina + Firecrawl + 10 secoes
│   ├── onboarding.js             # Criar empresa, importar, config
│   ├── whatsapp.js               # Z-API: texto, PDF, link
│   ├── whatsapp-lote.js          # QStash: lote com delay incremental
│   ├── automacao-envios.js       # PDF + WhatsApp em lote
│   └── manutencao.js
├── components/
│   ├── beto-chat.js              # Chat flutuante + evento open-beto + contexto
│   ├── dashboard/
│   │   ├── RHView.js             # KPIs empresa (sessoes_avaliacao)
│   │   └── ManagerView.js        # Equipe por area (sessoes_avaliacao)
│   └── pdf/
│       ├── styles.js             # NotoSans (4 pesos + italic), paleta, helpers (nivelColor, nivelLabel)
│       ├── RelatorioTemplate.js  # Template base A4
│       ├── RelatorioIndividual.js # PDI (capa + resumo + competencias N1-2 detalhadas + N3+ compactas + mensagem)
│       ├── RelatorioGestor.js    # Gestor (mesmo design system: NotoSans, PdfCover, SectionTitle, badges)
│       ├── RelatorioRH.js        # RH (mesmo design system: NotoSans, PdfCover, SectionTitle, badges)
│       ├── PdfCover.js           # Capa reutilizavel (logo base64 proporcional, nome, cargo, selo confidencial)
│       ├── SectionTitle.js       # SectionTitle (14pt) + BlockTitle (11pt) com accent bar
│       ├── StatusBadge.js        # LevelBadge, StatusBadge, PriorityBadge, Table variants (pills)
│       ├── CompetencyBlock.js    # Bloco por competencia (8 secoes, header navy, plano com cards numerados)
│       └── ChecklistBox.js       # Checklist tatico com header navy + zebra
├── lib/
│   ├── supabase.js               # createSupabaseClient + createSupabaseAdmin
│   ├── supabase-browser.js       # Singleton browser client
│   ├── tenant-resolver.js        # resolveTenant(slug) cache 5min
│   ├── ui-resolver.js            # getCustomLabel + isHidden
│   ├── authz.js                  # RBAC: getUserContext, isPlatformAdmin, roles
│   ├── versioning.js             # Prompt versioning (SHA-256 dedup)
│   ├── logger.js                 # Logger estruturado por dominio
│   ├── notifications.js          # Templates email + WhatsApp
│   ├── moodle.js                 # Moodle REST
│   └── competencias-base.js      # Arrays educacao/corporativo + PILAR_COLORS
├── scripts/
│   ├── smoke-test.js             # Smoke test HTTP (29 rotas, CI-ready)
│   ├── backup-project.ps1        # Snapshot ZIP local
│   ├── checkpoint.ps1            # Add + commit + push rapido
│   ├── auto-backup-diario.ps1    # Backup automatico diario (Task Scheduler)
│   └── instalar-backup-automatico.ps1  # Setup one-time do agendamento
├── tests/                        # Playwright e2e (86 specs)
│   ├── helpers/auth.js           # Login helper compartilhado
│   ├── login.spec.js             # 3 specs
│   ├── navegacao.spec.js         # 6 specs
│   ├── admin.spec.js             # 3 specs
│   ├── mapeamento-disc.spec.js   # 19 specs (serial, fluxo completo)
│   ├── assessment-chat.spec.js   # 8 specs
│   ├── admin-pipeline.spec.js    # 12 specs
│   ├── admin-config.spec.js      # 10 specs
│   ├── admin-ppp.spec.js         # 8 specs
│   ├── admin-crud.spec.js        # 10 specs
│   └── sandbox-danger.spec.js    # 8 specs (cria/deleta empresa teste)
├── docs/
│   ├── envs-importantes.md       # Mapa de 20+ env vars
│   ├── checklist-antes-de-prompt-grande.md
│   ├── checklist-antes-de-deploy.md
│   └── rotina-antifalha.md       # 5 regras de ouro
└── public/
    ├── logo-vertho.png
    └── pdf.worker.min.mjs        # Worker pdf.js para leitura de PDF
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

O isolamento multi-tenant opera em 3 camadas:

**Camada 1 — Schema (FK)**
- Todas as tabelas transacionais possuem coluna `empresa_id` (FK para `empresas.id`)
- Constraint NOT NULL garante que nenhum registro exista sem tenant

**Camada 2 — RLS (Row Level Security)**
- RLS habilitado em todas as tabelas
- Policy padrao usa `get_empresa_id()` para filtrar por tenant
- Aplica-se automaticamente a queries feitas com `createSupabaseClient()` (anon key)

**Camada 3 — Codigo (Server Actions + API Routes)**
- Server actions usam `createSupabaseAdmin()` com filtro EXPLICITO de `empresa_id`
- API routes: `/api/colaboradores` exige `empresa_id` no request (retorna 400 sem ele)
- `mensagens_chat` isoladas via `sessao_id` (sessao ja scoped por empresa)

**Riscos Conhecidos:**
- `service_role` bypassa RLS — filtro no codigo e a defesa primaria
- Se uma query omitir filtro `empresa_id` com `service_role`, vazamento cross-tenant e possivel
- Mitigacao: todas as queries auditadas, `empresa_id` obrigatorio em endpoints criticos

### 3.4 Branding por Tenant
Coluna `ui_config JSONB`: logo_url, 7 cores, font_color, login_subtitle, hidden_elements, labels.
Configurado em `/admin/empresas/{id}/configuracoes` → aba Branding com preview ao vivo.

### 3.5 Config por Tenant
Coluna `sys_config JSONB` em `empresas`:
- `ai_model`: modelo padrao de IA para o tenant
- `cadencia`: frequencia de envio (semanal, quinzenal)
- `envios`: configuracao de automacoes (WhatsApp, email)
- Configurado em `/admin/empresas/{id}/configuracoes` → abas IA, Automacoes, Envios

---

## 4. RBAC (Controle de Acesso Baseado em Papeis)

### 4.1 Papeis por Tenant
Coluna `role` em `colaboradores`: `colaborador` | `gestor` | `rh`
Cada colaborador pertence a exatamente um tenant (`empresa_id`) com exatamente um papel.

### 4.2 Admin da Plataforma
Tabela `platform_admins` — admins globais com acesso a todas as empresas.
Verificacao 100% server-side via `checkAdminAccess()`.

### 4.3 Dashboard por Papel
`getDashboardView()` em `lib/authz.js` retorna `rh` | `gestor` | `colaborador`.
- **colaborador**: ve apenas seu progresso pessoal
- **gestor**: ve KPIs da equipe (por area) + seu progresso
- **rh**: ve KPIs da empresa inteira + seu progresso

### 4.4 Admin Guard
```
checkAdminAccess():
  1. Busca email do usuario autenticado
  2. Consulta platform_admins por email
  3. Fallback: verifica ADMIN_EMAILS env var (lista separada por virgula)
  4. Se nenhum match: redireciona para /login
```

### 4.5 Gestao de Papeis
`/admin/empresas/{id}/configuracoes` → aba Equipe
Permite alterar o `role` de cada colaborador dentro do tenant.

### 4.6 Gestao de Admins
`/admin/platform-admins` — CRUD de admins globais da plataforma.

### Nota
RBAC NAO usa regex no campo `cargo` (abordagem antiga foi substituida por coluna `role` explicita).

---

## 5. Motor de IA

### 5.1 Roteador Universal
```
callAI(system, user, aiConfig, maxTokens, options)     → single-turn
callAIChat(system, messages, aiConfig, maxTokens, options) → multi-turn
options.thinking = true → Extended Thinking (budget 32k/65k)
```

Modelos: Claude Sonnet 4.6, Claude Opus 4.6, Gemini 3 Flash, Gemini 3.1 Pro

### 5.2 Motor Conversacional (api/chat/route.js)
- System prompt: ~120 linhas (proibicoes, 4 dimensoes, evidencias tipadas)
- [META]: proximo_passo, razao, dimensao_explorada, dimensoes_cobertas, evidencias_coletadas, confianca
- State machine: cenario → aprofundamento → contraexemplo → encerramento → concluida
- Business rules: MIN_EVIDENCIAS=2, MIN_MSG=10, MAX_MSG=4096, CONFIANCA_ENCERRAR=80

### 5.3 Avaliacao [EVAL]
- consolidacao: nivel_geral, nota_decimal, gap, confianca, travas_aplicadas
- descritores_destaque: pontos_fortes + gaps_prioritarios
- evidencias tipadas (explicito, explicito_forte, inferido)
- recomendacoes_pdi: 3 prioridades com barreira_provavel
- Travas: N1 critico → max N2; 3+ N1 → N1; duvida → inferior

### 5.4 Auditoria [AUDIT] (Gemini)
6 criterios: evidencias, nivel, nota, lacuna, alucinacoes, vies

### 5.5 Check IA4 (actions/check-ia4.js)
4 dimensoes × 25pts = 100. Threshold >= 90 aprovado.

### 5.6 Versionamento de Prompts
Tabela `prompt_versions` (SHA-256 dedup). Cada sessao registra qual prompt gerou o resultado.

### 5.7 Tokens (alinhados com GAS)
| Fase | Tokens |
|---|---|
| Conversa | 1.024 |
| Avaliacao [EVAL] | 32.768 |
| Auditoria [AUDIT] | 65.536 |
| Relatorios | 64.000 |
| PDI | 6.000 |
| PPP | 16.000 |
| BETO tutor | 500 |
| Tutor Capacitacao | 600 (Haiku) |

---

## 6. Integracoes

### 6.1 WhatsApp — Z-API + QStash
Dispatch async com delay incremental 2s. Webhook com verificacao de assinatura.
Status: ✅ operacional, 🔑 depende de Z-API credentials

### 6.2 Email — Resend API
Dispatch de formularios (Fase 2) e relatorios.
Status: 🔑 depende de RESEND_API_KEY

### 6.3 Moodle — REST API
Criar usuario, matricular, verificar conclusao, importar catalogo, catalogar com IA.
- `lib/moodle.js`: moodleCreateUser, moodleGetUser, moodleEnrollBatch, moodleGetCompletion, moodleGetCourses, moodleGetCourseContents
- `actions/capacitacao.js`: provisionarMoodleLote, syncProgressoMoodle (completion tracking)
- `actions/moodle-actions.js`: moodleImportarCatalogo, catalogarConteudosMoodle, gerarCoberturaConteudo
Status: ✅ operacional (academia.vertho.ai)

### 6.4 PDF — @react-pdf/renderer + pdfjs-dist
Geracao server-side em memoria. Fonte NotoSans (4 pesos + italic, suporte portugues completo).
Logo: `public/logo-vertho.png` (Vertho H escuro fundo transparente, 3148x800, carregada como base64).
Design system unificado nos 3 relatorios (PDI, Gestor, RH):
- PdfCover reutilizavel (logo + nome + cargo + selo confidencial)
- SectionTitle com accent bar cyan
- StatusBadge/LevelBadge como pills coloridos
- Boxes com borderRadius 8, border #E5E7EB, fundo #F8FAFC
- Cards com header colorido + conteudo com fundo semantico
- PageHeader/PageFooter com paginacao X/Y
PDI: capa + resumo executivo + competencias N1-2 detalhadas + N3+ compactas + mensagem final.
Gestor: capa + resumo + evolucao + ranking + analise + DISC + acoes por horizonte.
RH: capa + resumo + indicadores + comparativo + cargos + criticas + treinamentos + decisoes.
Leitura de PDF no browser (PPP) via pdfjs-dist.
Status: ✅ geracao + ✅ leitura

### 6.5 Scraping — Jina AI + Firecrawl
Jina (primario, gratis) → Firecrawl (fallback, pago). PPP 10 secoes estruturadas.
Status: ✅ Jina (gratis), 🔑 Firecrawl (fallback pago)

### 6.6 Supabase Storage — Bucket logos
Upload de logo por empresa via /api/upload-logo.
Status: ✅ bucket logos

---

## 7. Fluxos Ponta a Ponta

### Fluxo A: Login + Tenant + Dashboard
```
1. Usuario acessa {slug}.vertho.com.br/login
2. middleware.js extrai slug → header x-tenant-slug
3. app/login/page.js (Server Component):
   → lib/tenant-resolver.js busca empresa por slug (cache 5min)
   → Extrai ui_config: logo, cores, subtitulo
   → Passa branding como props para LoginForm
4. LoginForm: email + senha/Magic Link → Supabase Auth
5. Redirect para /dashboard
6. dashboard-actions.js → lib/authz.js:
   → getUserContext(email) busca colaborador + role + empresa_id
   → getDashboardView() retorna rh|gestor|colaborador
7. Dashboard renderiza:
   → Hero card "Vamos continuar sua evolucao"
   → Proximo Passo (perfil → assessment → PDI)
   → Acesso Rapido (4 cards)
   → KPIs equipe (se gestor/rh)

Tabelas: empresas, colaboradores, platform_admins
Integracoes: Supabase Auth
Critico: tenant-resolver cache, RBAC por role explicito
```

### Fluxo B: Assessment Conversacional ate Avaliacao Final
```
1. Colaborador clica em competencia em /dashboard/assessment
2. Navega para /dashboard/assessment/chat?competencia=UUID
3. Envia mensagem → POST /api/chat:
   a. Cria ou continua sessao em sessoes_avaliacao
   b. Carrega contexto: competencia + cenario + gabarito + historico
   c. Monta system prompt (~120 linhas: proibicoes, dimensoes, regua)
   d. callAIChat() com historico completo (Claude, 1024 tokens)
   e. Parseia [META]: confianca, evidencias, proximo_passo
   f. Salva em mensagens_chat (user + assistant)
   g. State machine decide proxima fase
4. Quando encerrar (confianca >= 80 OU turnos >= 10 OU min 2 evidencias):
   a. Claude gera [EVAL] (32768 tokens): nivel, nota, travas, descritores, PDI
   b. Gemini audita [AUDIT] (65536 tokens): 6 criterios
   c. Resultado final persistido em sessoes_avaliacao
   d. Versao do prompt registrada em prompt_versions
5. UI mostra card final: nivel, nota, lacuna, pontos fortes/melhoria

Tabelas: sessoes_avaliacao, mensagens_chat, competencias, banco_cenarios, prompt_versions
Integracoes: Claude (avaliador), Gemini (auditor)
Critico: business rules (min evidencias, travas de nivel), prompt versioning
```

### Fluxo C: Extracao PPP (10 secoes)
```
1. Admin acessa /admin/ppp?empresa=UUID (vem do pipeline)
2. Clica "Nova Extracao" → expande formulario
3. Upload de PDF (pdfjs-dist extrai texto no browser) e/ou URLs
4. Seleciona modelo de IA
5. Clica "Extrair via IA":
   a. Para URLs: Jina AI Reader → se falhar → Firecrawl (fallback)
   b. Texto dos PDFs + URLs combinados
   c. Claude extrai 10 secoes estruturadas:
      1. Perfil, 2. Comunidade, 3. Identidade, 4. Praticas,
      5. Inclusao, 6. Gestao, 7. Infraestrutura, 8. Desafios,
      9. Vocabulario, 10. Competencias priorizadas
   d. Resultado salvo em ppp_escolas (extracao JSONB + valores JSONB)
6. Lista de PPPs mostra cards com status + botao visualizar (modal 10 secoes)

Tabelas: ppp_escolas, empresas
Integracoes: Jina AI, Firecrawl, Claude
Critico: PDF com imagem (scan) nao e legivel; sites com anti-bot podem falhar
```

### Fluxo D: Trilhas + Capacitacao (Fase 3)
```
1. RH define competencia foco por cargo (pipeline Fase 2, dropdown Top 5)
   → salva em cargos_empresa.competencia_foco
2. "Montar Trilhas": para cada colaborador:
   a. Se tem gap na competencia foco do cargo → usa foco
   b. Se nao tem gap no foco → usa competencia de maior gap
   c. Sempre 1 competencia por colaborador
   d. Match cursos do catalogo_enriquecido por competencia + cargo
   e. So inclui cursos reais do moodle_catalogo (nao inventa)
   f. Salva em trilhas (competencia_foco, cursos[])
3. "Provisionar Moodle":
   a. Cria usuario no Moodle (moodleCreateUser, idempotente)
   b. Matricula nos cursos da trilha (moodleEnrollBatch)
   c. Salva moodle_user_id em fase4_progresso
4. "Iniciar Capacitacao": status → em_andamento, gera contrato pedagogico
5. "Sync Progresso": busca completion via Moodle API, atualiza pct por curso
6. "Avancar Semana": avanca semana_atual +1 (14 semanas total)
7. "Nudges Inatividade": detecta 2+ semanas sem acesso → email colaborador + gestor
8. Dashboard /admin/empresas/{id}/fase3:
   - Resumo: total, provisionados, em andamento, concluidos, pct medio
   - Meta coletiva por gestor (% do time com >=75%)
   - Cards por colaborador: progresso, cursos, status Moodle
9. Tutor IA: chatTutor() — Claude Haiku, 9 regras de governanca, log em tutor_log

Tabelas: trilhas, fase4_progresso, tutor_log, cargos_empresa, catalogo_enriquecido, moodle_catalogo
Integracoes: Moodle REST API, Resend (nudges), Claude Haiku (tutor)
Critico: competencia foco por cargo, Moodle completion tracking
```

---

## 8. Modelagem de Dados (31 migrations)

### Dados Transacionais (progressao do colaborador)
```
sessoes_avaliacao ← mensagens_chat (1:N por sessao_id)
respostas (R1-R4 por competencia)
capacitacao (evidencias semanais)
evolucao + evolucao_descritores (comparativo A vs B)
```

### Dados de Configuracao (por empresa/tenant)
```
empresas → colaboradores (1:N)
empresas → competencias (1:N)
empresas → cargos (1:N)
empresas → banco_cenarios (1:N)
empresas.ui_config (branding)
empresas.sys_config (IA, cadencia, envios)
```

### Artefatos Gerados por IA
```
relatorios (individual, gestor, rh — conteudo JSONB)
pdis (plano de desenvolvimento — conteudo JSONB)
prompt_versions (audit trail de prompts — hash SHA-256)
sessoes_avaliacao.rascunho_avaliacao / validacao_audit / avaliacao_final
```

### Dados de Operacao
```
envios_diagnostico (tracking de formularios enviados)
fase4_progresso (progresso capacitacao: moodle_user_id, cursos_progresso, pct, nudge, contrato)
trilhas (1 competencia foco por colaborador, cursos do catalogo Moodle)
tutor_log (historico de interacoes com tutor IA)
cargos_empresa (top5_workshop, competencia_foco por cargo)
platform_admins (admin global)
```

### Dados de Referencia (read-only)
```
competencias_base (template global por segmento)
regua_maturidade
catalogo_enriquecido, moodle_catalogo
cis_referencia, cis_ia_referencia
```

### Regras de Isolamento
- Toda tabela possui `empresa_id` (exceto `platform_admins`, `prompt_versions`, `competencias_base`)
- Chave de progressao: `colaborador_id` → `sessoes` → `respostas` → `evolucao`
- Chave de tenant: `empresa_id` em tudo

---

## 9. Cron Jobs (Vercel)

| Cron | Horario (BRT) | Acao |
|---|---|---|
| cleanup_sessoes | Diario 05:00 | Reseta sessoes abandonadas >48h |
| trigger_segunda | Segunda 11:00 | Envia pilula semanal via QStash |
| trigger_quinta | Quinta 11:00 | Solicita evidencia + nudge inatividade |

---

## 10. Testes

### Smoke Test (HTTP)
`node scripts/smoke-test.js https://vertho.com.br` — 29 rotas, CI-ready.

### Playwright E2E (86 specs)
```
npm test                    # sem auth (paginas publicas)
$env:SMOKE_EMAIL="x"; $env:SMOKE_PASS="y"; npm test  # com auth
npm run test:ui             # modo visual interativo
```

### CI/CD
`.github/workflows/smoke-test.yml` — roda smoke test em cada push para master.

---

## 11. Seguranca

- RBAC explicito: coluna `role` + tabela `platform_admins`
- Admin guard server-side (nunca client)
- API colaboradores: empresa_id obrigatorio
- RLS habilitado em todas as tabelas
- Nenhuma NEXT_PUBLIC sensivel
- Sentry para error tracking (prod only)

### Nota sobre repositorio publico
O repositorio GitHub e PUBLICO. Isso implica:
- NUNCA commitar .env, credenciais ou tokens
- NUNCA commitar dados de clientes em seeds ou fixtures
- Revisar PRs para vazamento de segredos antes de merge
- `.gitignore` ja exclui `.env*.local` e artefatos sensiveis
- Variaveis de ambiente vivem APENAS na Vercel (server-side)
- `.env.example` contem apenas placeholders

---

## 12. Observabilidade

- `lib/logger.js` — logger estruturado por dominio
- Sentry — captura erros client + server + edge
- `app/global-error.js` — error boundary React → Sentry
- System Health no admin dashboard (6 tabelas verificadas)
- Prompt versioning em `prompt_versions` (audit trail)
- Check IA4 com nota persistida (qualidade)

---

## 13. Operacao

### Deploy
```
git push origin master → Vercel build automatico → producao
```

### Backup automatico
```
Task Scheduler Windows → scripts/auto-backup-diario.ps1 (todo dia 20h)
  → ZIP em C:\Backups\Vertho\ + git push + limpa antigos (mantem 7)
```

### Scripts utilitarios
| Script | Uso |
|---|---|
| `scripts/smoke-test.js` | Testa 29 rotas via HTTP |
| `scripts/backup-project.ps1` | Snapshot ZIP manual |
| `scripts/checkpoint.ps1` | Commit + push rapido |
| `scripts/auto-backup-diario.ps1` | Backup diario automatico |
| `scripts/instalar-backup-automatico.ps1` | Setup one-time Task Scheduler |

### Variaveis de Ambiente (20+)
Ver `docs/envs-importantes.md` e `.env.example`

---

## 14. Disaster Recovery

### Restauracao do Codigo
1. Clone do GitHub: `git clone https://github.com/vertho-app/vertho-app.git`
2. Instalar deps: `cd nextjs-app && npm install`
3. Copiar .env.local do backup ou reconstruir de .env.example + Vercel Dashboard

### Restauracao de Envs
- Vercel Dashboard → Environment Variables (fonte primaria)
- `.env.example` como template (sem valores reais)
- `docs/envs-importantes.md` como mapa de referencia

### Restauracao do Schema
- Rodar migrations em ordem: `supabase/migrations/001*.sql` ate `020*.sql`
- Supabase SQL Editor → copiar e executar cada arquivo
- Ordem importa: FKs dependem de tabelas anteriores

### Restauracao do Vinculo GitHub → Vercel
1. Vercel Dashboard → Import Project → vertho-app/vertho-app
2. Configurar Environment Variables
3. Deploy automatico no proximo push

### Restauracao do DNS (Cloudflare)
- CNAME @ → cname.vercel-dns.com (DNS only)
- CNAME * → cname.vercel-dns.com (wildcard)
- SSL/TLS → Full (Strict)

### O que depende de backup local
- `.env.local` (se nao estiver na Vercel)
- Snapshots ZIP em `C:\Backups\Vertho\`

### O que depende de servicos externos
- Supabase: dados do banco (nao ha backup automatico local)
- Vercel: configuracao de envs
- Cloudflare: DNS
- GitHub: codigo-fonte

### Ordem de recuperacao apos incidente
1. Verificar GitHub (codigo intacto?)
2. Verificar Vercel (deploy ativo? envs presentes?)
3. Verificar Supabase (banco acessivel? dados integros?)
4. Se codigo perdido: restaurar do ZIP local ou re-clonar
5. Se envs perdidas: reconstruir de .env.example + docs/envs-importantes.md
6. Se schema perdido: re-rodar migrations 001-020
7. Se DNS perdido: reconfigurar CNAME no Cloudflare
8. Smoke test: `node scripts/smoke-test.js https://vertho.com.br`

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

*Documento validado contra o codigo-fonte em producao.*
*~130 arquivos JS | 31 migrations SQL | 86 e2e tests | 20+ env vars | vertho.com.br*
*Commit de referencia: 1038523 | Revisao: 09/04/2026*
