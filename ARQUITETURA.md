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
| **IA Secundaria** | Google Gemini + OpenAI | via fetch nativo |
| **IA Validacao** | Gemini (auditor multi-LLM) | via fetch nativo |
| **PDF** | @react-pdf/renderer | 4.4.0 |
| **Filas** | Upstash QStash | 2.10.1 |
| **WhatsApp** | Z-API (REST) | — |
| **LMS** | Moodle (REST API) | — |
| **Hospedagem** | Vercel (Serverless) | — |
| **DNS/CDN** | Cloudflare | — |
| **Dominio** | vertho.com.br (wildcard *.vertho.com.br) | — |

---

## 2. Estrutura de Pastas (81 arquivos JS)

```
nextjs-app/
├── middleware.js                  # Roteamento multi-tenant por subdominio
├── app/
│   ├── layout.js                 # Root layout (Inter font, meta, theme)
│   ├── globals.css               # Tailwind + design tokens (navy, cyan, teal)
│   ├── page.js                   # Redirect → /login
│   ├── login/
│   │   ├── page.js               # Server Component: resolve tenant → branding
│   │   └── login-form.js         # Client: Magic Link + senha (fallback teste)
│   ├── dashboard/                # Area do colaborador (autenticado)
│   │   ├── page.js               # Dashboard RBAC (RH / Gestor / Colab)
│   │   ├── layout.js             # Shell: header + bottom nav + BETO
│   │   ├── dashboard-shell.js    # Client: nav, auth guard, logout
│   │   ├── assessment/
│   │   │   ├── page.js           # Lista cenarios pendentes
│   │   │   └── chat/page.js      # Motor Conversacional Fase 3 (UI)
│   │   ├── pdi/page.js           # Plano de Desenvolvimento
│   │   ├── perfil/page.js        # Perfil do colaborador
│   │   ├── perfil-cis/
│   │   │   ├── page.js           # Perfil comportamental (DISC)
│   │   │   └── mapeamento/page.js
│   │   ├── evolucao/page.js      # Evolucao pos-capacitacao
│   │   ├── jornada/page.js       # Timeline de etapas
│   │   └── praticar/
│   │       ├── page.js           # Trilha semanal
│   │       └── evidencia/page.js # Evidencias semanais
│   ├── admin/                    # Painel administrativo (email guard)
│   │   ├── layout.js             # Wrapper AdminGuard
│   │   ├── admin-guard.js        # Valida email contra ADMIN_EMAILS
│   │   ├── dashboard/
│   │   │   ├── page.js           # KPIs globais + System Health + lista empresas
│   │   │   └── actions.js        # loadAdminDashboard() via service role
│   │   ├── empresas/
│   │   │   ├── nova/
│   │   │   │   ├── page.js       # Form: nome + segmento
│   │   │   │   └── actions.js    # criarNovaEmpresa() com auto-slug
│   │   │   ├── gerenciar/
│   │   │   │   ├── page.js       # Dropdown empresa + import CSV
│   │   │   │   └── actions.js    # importarColaboradoresLote() com dedup
│   │   │   └── [empresaId]/
│   │   │       ├── page.js       # Pipeline visual Fases 0-5 (expandivel)
│   │   │       ├── actions.js    # loadEmpresaPipeline() + wrappers fase1-5
│   │   │       └── configuracoes/
│   │   │           ├── page.js   # 4 tabs: Branding, IA, Automacoes, Envios
│   │   │           └── actions.js # salvarBranding/Config/Slug
│   │   ├── cargos/page.js
│   │   ├── competencias/page.js
│   │   ├── ppp/page.js
│   │   ├── relatorios/page.js
│   │   ├── whatsapp/page.js
│   │   └── simulador/page.js
│   ├── actions/                  # Server Actions (app-level)
│   │   ├── beto.js               # BETO mentor (Claude, max 500 tokens)
│   │   └── manutencao.js         # Limpeza sessoes, stats
│   └── api/                      # API Routes (serverless)
│       ├── chat/route.js         # Motor Conversacional Fase 3 (backend)
│       ├── chat-simulador/route.js
│       ├── assessment/route.js   # GET cenarios + POST respostas
│       ├── colaboradores/route.js # CRUD colaboradores
│       ├── upload-logo/route.js  # Upload logo → Supabase Storage
│       ├── relatorios/
│       │   ├── route.js
│       │   └── individual/route.js
│       ├── academia/route.js
│       ├── cron/route.js
│       ├── pdi/route.js
│       ├── ppp/route.js
│       ├── cargos/route.js
│       ├── generate-narratives/route.js
│       └── webhooks/
│           ├── qstash/route.js
│           └── qstash/whatsapp-cis/route.js  # Webhook QStash → Z-API
├── actions/                      # Server Actions (logica de negocio)
│   ├── ai-client.js              # Roteador universal: callAI + callAIChat
│   ├── utils.js                  # extractJSON, extractBlock, stripBlocks
│   ├── fase1.js                  # IA1 (Top10), IA2 (Gabarito), IA3, Cenarios
│   ├── fase2.js                  # Forms, emails (Resend), coleta, status
│   ├── fase3.js                  # IA4, check, relatorios ind/gestor/RH
│   ├── fase4.js                  # PDI, trilhas, Moodle, triggers
│   ├── fase5.js                  # Reavaliacao, evolucao, plenaria
│   ├── competencias.js           # CRUD competencias por empresa
│   ├── competencias-base.js      # CRUD base global (educacao/corporativo)
│   ├── ppp.js                    # Extracao PPP via IA + Jina scraping
│   ├── onboarding.js             # Criar empresa, importar colabs, config
│   ├── whatsapp.js               # Z-API: texto, PDF, link
│   ├── whatsapp-lote.js          # QStash: lote CIS + relatorios com delay
│   ├── automacao-envios.js       # PDF + WhatsApp em lote
│   └── manutencao.js             # Limpeza sessoes, stats do banco
├── components/
│   ├── beto-chat.js              # Chat flutuante do mentor IA
│   ├── dashboard/
│   │   ├── RHView.js             # Visao RH/Diretor (KPIs agregados)
│   │   └── ManagerView.js        # Visao Gestor (equipe por area)
│   └── pdf/
│       ├── styles.js             # Design system PDF (paleta, tipografia)
│       ├── RelatorioTemplate.js  # Template A4 (header VERTHO, footer, paginacao)
│       └── RelatorioIndividual.js # Relatorio Fase 3 (competencias + PDI)
├── lib/
│   ├── supabase.js               # createSupabaseClient(req) + createSupabaseAdmin()
│   ├── supabase-browser.js       # Singleton browser client (RLS)
│   ├── tenant-resolver.js        # resolveTenant(slug) com cache 5min
│   ├── ui-resolver.js            # getCustomLabel() + isHidden() por tenant
│   ├── notifications.js          # Templates email HTML + WhatsApp texto
│   ├── moodle.js                 # Moodle REST: criar user, matricular
│   └── competencias-base.js      # Arrays educacao/corporativo + PILAR_COLORS
└── public/
    └── logo-vertho.png           # Logo oficial
```

---

## 3. Arquitetura Multi-Tenant

### 3.1 Roteamento por Subdominio

```
zula.vertho.com.br/login
  → middleware.js extrai slug "zula" do hostname
  → Injeta header x-tenant-slug: "zula"
  → Rotas permanecem iguais (/login, /dashboard, /api/*)
  → Server Components leem o header para resolver tenant
```

Subdominioes reservados (sem tenant): www, app, api, admin, mail, smtp, ftp.
Dominios raiz (sem tenant): vertho.com.br, vertho.ai, localhost, *.vercel.app.

### 3.2 Resolucao do Tenant

```
lib/tenant-resolver.js:
  resolveTenant(slug)
    → Cache em memoria (Map, TTL 5 min)
    → SELECT id, nome, slug, ui_config FROM empresas WHERE slug
    → Cache negativo 60s para slugs invalidos
    → Retorna { id, nome, slug, ui_config } ou null
```

### 3.3 Isolamento de Dados

Todas as tabelas possuem `empresa_id UUID NOT NULL REFERENCES empresas(id)`.
Isolamento em 2 camadas:

1. **RLS (Row-Level Security)**: Policies filtram por `empresa_id` via `public.get_empresa_id()` do JWT
2. **Application-level**: Server Actions usam `createSupabaseAdmin()` com filtro explicito por `empresaId`

### 3.4 Branding por Tenant

Coluna `ui_config JSONB` na tabela `empresas`:

```json
{
  "logo_url": "https://...supabase.co/storage/v1/object/public/logos/.../logo.png",
  "font_color": "#FFFFFF",
  "font_color_secondary": "#FFFFFF99",
  "primary_color": "#0D9488",
  "primary_color_end": "#0F766E",
  "accent_color": "#00B4D8",
  "bg_gradient_start": "#091D35",
  "bg_gradient_end": "#0F2A4A",
  "login_subtitle": "Sua jornada de desenvolvimento",
  "hidden_elements": ["btn-fase1-ia1"],
  "labels": { "fase3-titulo": "Avaliacao Comportamental" }
}
```

Configurado em: `/admin/empresas/{id}/configuracoes` → aba Branding (upload logo, color pickers, preview ao vivo).
Aplicado em: `/login` (Server Component resolve tenant → passa branding como props).

### 3.5 Configuracoes por Tenant

Coluna `sys_config JSONB`:

```json
{
  "ai": { "modelo_padrao": "claude-sonnet-4-6", "thinking": false },
  "cadencia": { "fase4_dia_pilula": 1, "fase4_hora": 8 },
  "envios": { "email_remetente": "diagnostico@empresa.com" }
}
```

### 3.6 RBAC (Role-Based Access Control)

Dashboard detecta cargo via regex:

| Cargo contendo... | Role | Visao |
|---|---|---|
| rh, diretor, ceo, admin | `rh` | KPIs agregados + equipe inteira |
| coordenador, gestor, gerente | `gestor` | Equipe por area_depto |
| (outros) | `colaborador` | Visao individual (PDI, trilha) |

Admin guard: `app/admin/admin-guard.js` valida email contra `NEXT_PUBLIC_ADMIN_EMAILS`.

---

## 4. Motor de IA

### 4.1 Roteador Universal (`actions/ai-client.js`)

```
callAI(system, user, aiConfig, maxTokens)     → single-turn
callAIChat(system, messages, aiConfig, maxTokens) → multi-turn (historico)

Roteamento por prefixo do modelo:
  ├── claude*  → Anthropic SDK (new Anthropic())
  ├── gemini*  → Google AI REST (generativelanguage.googleapis.com)
  └── gpt*|o1*|o3*|o4* → OpenAI REST (api.openai.com)

Modelos disponiveis:
  - Claude Sonnet 4.6, Claude Opus 4.6
  - Gemini 3 Flash, Gemini 3.1 Pro
  - GPT-5.4, GPT-5.4 Mini
```

### 4.2 Helpers de Parsing (`actions/utils.js`)

```
extractJSON(text)       → Parse robusto (5 estrategias de fallback)
extractBlock(text, tag) → Extrai conteudo entre [TAG]...[/TAG] e parseia JSON
stripBlocks(text)       → Remove todos os blocos [META/EVAL/AUDIT] do texto visivel
```

### 4.3 Motor Conversacional Fase 3 (`api/chat/route.js`)

```
POST /api/chat
  { sessaoId?, empresaId, colaboradorId, competenciaId, mensagem }

Fluxo:
  1. Criar ou continuar sessao (sessoes_avaliacao)
  2. Carregar contexto: competencia + cenario + gabarito + historico
  3. Montar system prompt com fase atual + regras + regua maturidade
  4. callAIChat() com historico completo
  5. Parsear [META]: proximo_passo, confianca, evidencias, sinais
  6. stripBlocks() → mensagem visivel ao usuario
  7. Salvar mensagem em mensagens_chat (user + assistant)
  8. Decidir proxima fase (state machine)
  9. Se encerrar → avaliacao + auditoria
  10. Retornar: { ok, sessaoId, fase, status, confianca, mensagem, avaliacaoFinal }

State Machine:
  cenario → aprofundamento → contraexemplo → encerramento → concluida

Criterios de encerramento:
  - confianca >= 80%
  - OU total_turnos >= 10
  - OU Claude indicar proximo_passo = "encerrar"
```

### 4.4 Validacao Cruzada Multi-LLM

```
ETAPA 1 — Avaliador (Claude Sonnet 4.6)
    Gera [EVAL]:
    {
      nivel: 1-4, nota_decimal: 0-10, lacuna: -2 a 0,
      evidencias_principais: [...],
      feedback: { pontos_fortes, pontos_melhoria, resumo }
    }
    Salva em: sessoes_avaliacao.rascunho_avaliacao

ETAPA 2 — Auditor (Gemini Flash)
    Audita 6 criterios e gera [AUDIT]:
    {
      status: "aprovado|corrigido|reprovado",
      criterios: { evidencias, nivel, nota, lacuna, alucinacoes, vies },
      justificativa, avaliacao_corrigida (se corrigido)
    }
    Salva em: sessoes_avaliacao.validacao_audit

RESULTADO FINAL:
    Se corrigido → usa avaliacao_corrigida
    Se aprovado → mantem rascunho
    Se reprovado/erro → fallback ao rascunho
    Salva em: sessoes_avaliacao.avaliacao_final + nivel + nota_decimal + lacuna
```

### 4.5 UI do Chat (`app/dashboard/assessment/chat/page.js`)

```
- Area de historico com mensagens user/assistant
- Badges: fase atual, confianca %, status
- Input + botao enviar + loading
- Card de avaliacao final: nivel, nota, lacuna, pontos fortes/melhoria, resumo
- Acesso via: /dashboard/assessment/chat?competencia=UUID
```

---

## 5. Integracoes

### 5.1 WhatsApp (Z-API + QStash)

```
Envio individual (actions/whatsapp.js):
  enviarWhatsApp(telefone, mensagem)  → send-text
  enviarPDF(telefone, base64, nome)   → send-document/pdf
  enviarLink(telefone, url, titulo)   → send-link

Envio em lote (actions/whatsapp-lote.js):
  dispararLinksCIS(empresaId)
    → Publica no QStash com delay incremental (2s por msg)
    → QStash chama /api/webhooks/qstash/whatsapp-cis
    → Webhook valida assinatura (Receiver lazy)
    → Chama Z-API send-text
    → Retry automatico em caso de falha

  dispararRelatoriosLote(empresaId)
    → Mesmo fluxo via QStash

Vantagem: retorno instantaneo, sem timeout Vercel, retry automatico.
```

### 5.2 Moodle REST (`lib/moodle.js`)

```
Env vars: MOODLE_URL (default: https://academia.vertho.ai), MOODLE_TOKEN
Funcoes:
  - moodleCreateUser(email, nome)
  - moodleGetUser(email)
  - moodleEnrollUser(userId, courseId)
  - moodleEnrollBatch(enrollments)
  - moodleGetCompletion(userId, courseId)
```

### 5.3 PDF (`@react-pdf/renderer`)

```
components/pdf/
  ├── styles.js              → Paleta navy/cyan/teal, tipografia, tabelas
  ├── RelatorioTemplate.js   → A4 com header VERTHO + footer paginacao
  └── RelatorioIndividual.js → Perfil + tabela competencias + feedback + PDI

API: /api/relatorios/individual?colaboradorId=UUID
  → renderToBuffer(<RelatorioIndividual />) → Response application/pdf
```

### 5.4 Supabase Storage

```
Bucket "logos" (publico leitura, upload via service_role):
  POST /api/upload-logo → valida tipo/tamanho → upload → retorna URL publica
  Usado pela aba Branding para logo por empresa.
```

### 5.5 Extracao Web (Jina AI Reader)

```
actions/ppp.js → fetch('https://r.jina.ai/${url}')
  → Markdown limpo → prompt de extracao de PPP → salva em ppp_escolas
```

---

## 6. Modelagem de Dados (14 migrations)

### 6.1 Tabelas Core

```
empresas
  ├── id (UUID PK), nome, segmento (educacao|corporativo)
  ├── slug (UNIQUE) → subdominio multi-tenant
  ├── ui_config (JSONB) → branding + labels + hidden_elements
  └── sys_config (JSONB) → modelo IA, cadencia, envios

colaboradores
  ├── id (UUID PK), empresa_id (FK)
  ├── nome_completo, email, cargo, area_depto, whatsapp
  └── perfil: d/i/s/c_natural, perfil_dominante, val_*

cargos
  ├── id (UUID PK), empresa_id (FK)
  ├── nome, descricao, entregas_esperadas
  ├── competencias_top10 (JSONB), top5_workshop (JSONB)
  └── tela1..tela4, status_ia

competencias
  ├── id (UUID PK), empresa_id (FK)
  ├── cod_comp, nome, pilar, cargo, descricao, gabarito (JSONB)
  └── n1_gap, n2_desenvolvimento, n3_meta, n4_referencia

competencias_base (template global, sem empresa_id)
  └── segmento (educacao|corporativo) + mesma estrutura
```

### 6.2 Tabelas de Avaliacao

```
banco_cenarios
  ├── id (UUID PK), empresa_id (FK), competencia_id
  ├── titulo, descricao, alternativas (JSONB)
  └── cargo, email_colaborador

respostas
  ├── id (UUID PK), empresa_id (FK), colaborador_id, competencia_id
  ├── r1, r2, r3, r4
  └── avaliacao_ia (JSONB), nivel_ia4, nota_ia4, avaliado_em

sessoes_avaliacao (Motor Conversacional Fase 3)
  ├── id (UUID PK), empresa_id, colaborador_id, competencia_id
  ├── competencia_nome, cenario_id
  ├── status (em_andamento|concluido|erro)
  ├── fase (cenario|aprofundamento|contraexemplo|encerramento|concluida)
  ├── aprofundamentos (int), confianca (int), evidencias (JSONB)
  ├── rascunho_avaliacao (JSONB) → Etapa 1 (Claude)
  ├── validacao_audit (JSONB) → Etapa 2 (Gemini)
  ├── avaliacao_final (JSONB) → resultado validado
  ├── modelo_avaliador, modelo_validador
  └── nivel (int), nota_decimal (numeric), lacuna (numeric)

mensagens_chat
  ├── id (UUID PK), sessao_id (FK)
  ├── role (user|assistant|system), content
  └── metadata (JSONB — [META] parseado)
```

### 6.3 Tabelas de Capacitacao

```
trilhas           → 14 semanas de conteudo por colaborador
fase4_envios      → status semanal, sequencia, contrato
capacitacao       → evidencias semanais, pontos, quiz
evolucao          → comparativo Fase 3 vs Fase 5
evolucao_descritores → detalhamento por descritor
```

### 6.4 Tabelas de Suporte

```
ppp_escolas       → PPP extraido por escola/area
envios_diagnostico → tracking de formularios enviados (token UUID, canal, status)
regua_maturidade  → escala de proficiencia
catalogo_enriquecido → conteudos Moodle enriquecidos
moodle_catalogo   → mapeamento curso-competencia
cis_referencia    → referencia DISC
cis_ia_referencia → referencia DISC para IA
```

---

## 7. Fluxo Completo do Produto (Fases 0-5)

```
FASE 0 — Onboarding & PPP
  Criar empresa (auto-slug) → Import CSV colaboradores → Competencias → PPP → Moodle
  Config: Branding (logo, cores) + IA (modelo) + Automacoes + Envios

FASE 1 — Analise de Cargos & Cenarios
  IA1 (Top 10 competencias/cargo) → Selecao Top 5 → IA2 (Gabarito 5 niveis)
  → IA3 (Cenarios situacionais) → Popular Banco de Cenarios

FASE 2 — Formularios & Envios
  Gerar Envios (token UUID) → Disparar Emails (Resend) → WhatsApp (QStash + Z-API)
  → Enviar Links CIS → Coletar Respostas → Monitor Status

FASE 3 — Diagnostico IA
  Chat Conversacional (state machine 5 fases)
  → Avaliacao (Claude) [EVAL] → Auditoria (Gemini) [AUDIT]
  → Resultado Final → Relatorios Individual/Gestor/RH → PDF → Envio

FASE 4 — PDI & Capacitacao
  Gerar PDIs (12 semanas) → Enriquecer com Descritores → Montar Trilhas
  → Criar Estrutura Fase 4 → Iniciar Todos → Triggers Semanais

FASE 5 — Reavaliacao & Evolucao
  Reavaliacao conversacional → Relatorio de Evolucao → Plenaria
  → Dossie Gestor → Relatorio RH
```

---

## 8. Variaveis de Ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# IA
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
OPENAI_API_KEY=

# WhatsApp (Z-API)
ZAPI_INSTANCE_ID=
ZAPI_TOKEN=
ZAPI_CLIENT_TOKEN=

# Filas (Upstash QStash)
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Moodle
MOODLE_URL=https://academia.vertho.ai
MOODLE_TOKEN=

# App
NEXT_PUBLIC_APP_URL=https://vertho.com.br
NEXT_PUBLIC_ADMIN_EMAILS=rodrigo@vertho.ai
CRON_SECRET=
```

---

## 9. Infraestrutura de Deploy

```
GitHub: vertho-app/vertho-app (publico)
Vercel: vertho-app (deploy automatico via git push)
Cloudflare: DNS + CDN para vertho.com.br
  CNAME @ → cname.vercel-dns.com
  CNAME * → cname.vercel-dns.com (wildcard multi-tenant)
  SSL: Full (Strict)

Pipeline: git push origin master → Vercel build automatico → producao
Dominio: https://vertho.com.br
Subdominos: https://{slug}.vertho.com.br (por empresa)
```

---

## 10. Migrations SQL (14 arquivos)

```
001_codigo_js_tables.sql        → empresas, colaboradores, competencias, banco_cenarios, respostas, envios, regua
002_academia_gestao_tables.sql  → trilhas, fase4_envios, capacitacao, evolucao, evolucao_descritores
003_catalogo_cis_moodle.sql     → catalogo_enriquecido, cis_referencia, cis_ia_referencia, moodle_catalogo
004_empresas_segmento.sql       → ADD COLUMN segmento
005_ppp_escolas.sql             → CREATE TABLE ppp_escolas
006_competencias_base.sql       → CREATE TABLE competencias_base
007_competencias_base_cargo.sql → ADD COLUMN cargo em competencias_base
008_empresas_ui_config.sql      → ADD COLUMN ui_config JSONB
009_empresas_slug.sql           → ADD COLUMN slug UNIQUE + indice
009_sessoes_avaliacao.sql       → CREATE TABLE sessoes_avaliacao + mensagens_chat + RLS
010_empresas_sys_config.sql     → ADD COLUMN sys_config JSONB
010_storage_logos.sql           → Bucket "logos" no Supabase Storage
011_sessoes_validacao.sql       → ADD COLUMNS rascunho_avaliacao, validacao_audit, modelo_*
012_sessoes_lacuna_numeric.sql  → ALTER lacuna TEXT → NUMERIC + indices
```

---

*Documento gerado a partir do codigo-fonte atual do projeto Vertho Mentor IA.*
*81 arquivos JS | 14 migrations SQL | 13 env vars | vertho.com.br*
