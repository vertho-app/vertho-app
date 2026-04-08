# Vertho Mentor IA — Arquitetura do Sistema

> Documento oficial de arquitetura do SaaS B2B de desenvolvimento de competencias por IA.
> Atualizado em: Abril/2026

---

## 1. Visao Geral da Stack

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| **Framework** | Next.js (App Router) | 16.2.2 |
| **UI** | React | 19.2.4 |
| **Estilizacao** | Tailwind CSS | 4.0 |
| **Icones** | Lucide React | 1.7.0 |
| **Banco de Dados** | Supabase (PostgreSQL) | — |
| **Auth** | Supabase Auth (Magic Link + Senha) | — |
| **IA Principal** | Anthropic SDK (Claude) | 0.81.0 |
| **IA Secundaria** | Google Gemini | via fetch nativo |
| **IA Validacao** | Gemini (auditor multi-LLM) | via fetch nativo |
| **PDF** | @react-pdf/renderer + pdfjs-dist | 4.4.0 / 5.6 |
| **Filas** | Upstash QStash | 2.10.1 |
| **WhatsApp** | Z-API (REST) | — |
| **Email** | Resend API | — |
| **Scraping** | Jina AI Reader + Firecrawl (fallback) | — |
| **LMS** | Moodle (REST API) | — |
| **Error Tracking** | Sentry | — |
| **Testes** | Playwright + smoke-test.js | — |
| **Hospedagem** | Vercel (Serverless) | — |
| **DNS/CDN** | Cloudflare (Full Strict SSL) | — |
| **Dominio** | vertho.com.br (wildcard *.vertho.com.br) | — |
| **CI/CD** | GitHub Actions (smoke test no push) | — |

---

## 2. Estrutura de Pastas (123 arquivos JS)

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
│   ├── fase4.js                  # PDI, trilhas, Moodle, triggers
│   ├── fase5.js                  # Reavaliacao, evolucao, plenaria
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
│       ├── styles.js
│       ├── RelatorioTemplate.js
│       └── RelatorioIndividual.js
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

## 3. Arquitetura Multi-Tenant

### 3.1 Roteamento por Subdominio
```
{slug}.vertho.com.br/login
  → middleware.js extrai slug do hostname
  → Injeta header x-tenant-slug
  → Server Components resolvem tenant via lib/tenant-resolver.js (cache 5min)
```

### 3.2 Branding por Tenant
Coluna `ui_config JSONB`: logo_url, 7 cores, font_color, login_subtitle, hidden_elements, labels.
Configurado em `/admin/empresas/{id}/configuracoes` → aba Branding com preview ao vivo.

### 3.3 RBAC Explicito
- `colaboradores.role` = colaborador | gestor | rh (por tenant)
- `platform_admins` = admin global (tabela separada)
- `lib/authz.js` = getUserContext, isPlatformAdmin, getDashboardView
- Admin guard 100% server-side (nunca NEXT_PUBLIC)

---

## 4. Motor de IA

### 4.1 Roteador Universal
```
callAI(system, user, aiConfig, maxTokens, options)     → single-turn
callAIChat(system, messages, aiConfig, maxTokens, options) → multi-turn
options.thinking = true → Extended Thinking (budget 32k/65k)
```

Modelos: Claude Sonnet 4.6, Claude Opus 4.6, Gemini 3 Flash, Gemini 3.1 Pro

### 4.2 Motor Conversacional (api/chat/route.js)
- System prompt: ~120 linhas (proibicoes, 4 dimensoes, evidencias tipadas)
- [META]: proximo_passo, razao, dimensao_explorada, dimensoes_cobertas, evidencias_coletadas, confianca
- State machine: cenario → aprofundamento → contraexemplo → encerramento → concluida
- Business rules: MIN_EVIDENCIAS=2, MIN_MSG=10, MAX_MSG=4096, CONFIANCA_ENCERRAR=80

### 4.3 Avaliacao [EVAL]
- consolidacao: nivel_geral, nota_decimal, gap, confianca, travas_aplicadas
- descritores_destaque: pontos_fortes + gaps_prioritarios
- evidencias tipadas (explicito, explicito_forte, inferido)
- recomendacoes_pdi: 3 prioridades com barreira_provavel
- Travas: N1 critico → max N2; 3+ N1 → N1; duvida → inferior

### 4.4 Auditoria [AUDIT] (Gemini)
6 criterios: evidencias, nivel, nota, lacuna, alucinacoes, vies

### 4.5 Check IA4 (actions/check-ia4.js)
4 dimensoes × 25pts = 100. Threshold >= 90 aprovado.

### 4.6 Versionamento de Prompts
Tabela `prompt_versions` (SHA-256 dedup). Cada sessao registra qual prompt gerou o resultado.

### 4.7 Tokens (alinhados com GAS)
| Fase | Tokens |
|---|---|
| Conversa | 1.024 |
| Avaliacao [EVAL] | 32.768 |
| Auditoria [AUDIT] | 65.536 |
| Relatorios | 64.000 |
| PDI | 6.000 |
| PPP | 16.000 |
| BETO tutor | 500 |

---

## 5. Integracoes

### 5.1 WhatsApp — Z-API + QStash
Dispatch async com delay incremental 2s. Webhook com verificacao de assinatura.

### 5.2 Email — Resend API
Dispatch de formularios (Fase 2) e relatorios.

### 5.3 Moodle — REST API
Criar usuario, matricular, verificar conclusao.

### 5.4 PDF — @react-pdf/renderer + pdfjs-dist
Geracao server-side em memoria. Leitura de PDF no browser (PPP).

### 5.5 Scraping — Jina AI + Firecrawl
Jina (primario, gratis) → Firecrawl (fallback, pago). PPP 10 secoes estruturadas.

### 5.6 Supabase Storage — Bucket logos
Upload de logo por empresa via /api/upload-logo.

---

## 6. Modelagem de Dados (20 migrations)

### Tabelas Core
empresas, colaboradores (29+ colunas DISC), cargos, competencias (+ versao_regua), competencias_base

### Tabelas de Avaliacao
banco_cenarios, respostas, sessoes_avaliacao (+ check_nota/status/resultado), mensagens_chat

### Tabelas de Capacitacao
trilhas, fase4_envios, capacitacao (+ evidencia_texto/avaliacao), evolucao, evolucao_descritores

### Tabelas de Suporte
ppp_escolas, envios_diagnostico, relatorios, pdis, trilhas_catalogo, platform_admins, prompt_versions

### Tabelas de Referencia
regua_maturidade, catalogo_enriquecido, moodle_catalogo, cis_referencia, cis_ia_referencia

---

## 7. Cron Jobs (Vercel)

| Cron | Horario (BRT) | Acao |
|---|---|---|
| cleanup_sessoes | Diario 05:00 | Reseta sessoes abandonadas >48h |
| trigger_segunda | Segunda 11:00 | Envia pilula semanal via QStash |
| trigger_quinta | Quinta 11:00 | Solicita evidencia + nudge inatividade |

---

## 8. Testes

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

## 9. Seguranca

- RBAC explicito: coluna `role` + tabela `platform_admins`
- Admin guard server-side (nunca client)
- API colaboradores: empresa_id obrigatorio
- RLS habilitado em todas as tabelas
- Nenhuma NEXT_PUBLIC sensivel
- Sentry para error tracking (prod only)

---

## 10. Observabilidade

- `lib/logger.js` — logger estruturado por dominio
- Sentry — captura erros client + server + edge
- `app/global-error.js` — error boundary React → Sentry
- System Health no admin dashboard (6 tabelas verificadas)
- Prompt versioning em `prompt_versions` (audit trail)
- Check IA4 com nota persistida (qualidade)

---

## 11. Operacao

### Deploy
```
git push origin master → Vercel build automatico → producao
```

### Backup automatico
```
Task Scheduler Windows → scripts/auto-backup-diario.ps1 (todo dia 20h)
  → ZIP em C:\Backups\Vertho\ + git push + limpa antigos (mantém 7)
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

## 12. Infraestrutura

```
GitHub: vertho-app/vertho-app (publico)
Vercel: vertho-app (deploy via git push)
Cloudflare: DNS + CDN (CNAME @ e * → cname.vercel-dns.com, SSL Full Strict)
Supabase: PostgreSQL + Auth + Storage + RLS
Upstash: QStash (filas async WhatsApp)
Sentry: Error tracking
```

---

*Documento gerado a partir do codigo-fonte do projeto Vertho Mentor IA.*
*123 arquivos JS | 20 migrations SQL | 86 e2e tests | 20+ env vars | vertho.com.br*
