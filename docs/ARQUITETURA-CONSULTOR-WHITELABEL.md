# Seção 24 — Camada de Parceiros (White-Label) e App do Consultor

> Frente nova: abrir a plataforma para **consultorias de RH externas** que gerenciam uma **carteira de empresas-clientes** sob a **própria marca** (white-label total — Vertho invisível para o cliente final).
> Princípio de projeto: **a empresa continua sendo o tenant**. O parceiro é um **plano acima** da empresa, não uma reescrita do isolamento atual. Reaproveita RLS por `empresa_id`, `lib/auth/action-context.ts` e a matriz de permissões — adiciona apenas um **escopo de carteira**.
> Status global da frente: 📋 planejado / estrutura desenhada. Migrations propostas: 122–126.

---

## 24.1 Decisão de tenancy

Hoje o RBAC tem `platform_admin | rh | gestor | tutor | colaborador`, e `rh` é admin de **um** tenant. Não existe camada que deixe uma conta enxergar uma **carteira** de empresas. O consultor não é um papel dentro da empresa — é uma **camada acima**.

```
parceiro (consultoria)              ← NOVO plano
   └── empresa (tenant atual)       ← inalterado: continua o tenant, RLS por empresa_id
          └── colaborador           ← inalterado
```

**Anti-pattern recusado:** pendurar o consultor no `platform_admin`. Esse papel é Vertho-interno e enxerga TODOS os tenants — usá-lo para o parceiro vazaria carteira cruzada. O consultor precisa de um escopo **restrito ao próprio `parceiro_id`**, com a mesma força de admin do `rh` **dentro** de cada empresa da carteira.

---

## 24.2 Modelo de dados (migration 122)

```sql
-- Parceiro = consultoria white-label (dono da marca que o cliente final vê)
CREATE TABLE parceiros (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,           -- subdomínio técnico de fallback
  dominio_custom TEXT UNIQUE,                    -- ex.: app.consultoria-aurora.com.br
  branding      JSONB NOT NULL DEFAULT '{}',     -- logo_url, cores, login_subtitle, favicon
  plano         TEXT NOT NULL DEFAULT 'starter', -- starter | pro | scale (quotas em 24.9)
  status        TEXT NOT NULL DEFAULT 'ativo',   -- ativo | suspenso | trial
  default_locale TEXT NOT NULL DEFAULT 'pt-BR',
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Time interno do parceiro (consultores). Identidade SEPARADA de colaboradores:
-- o consultor não pertence a nenhuma empresa, está acima delas.
CREATE TABLE parceiro_membros (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parceiro_id  UUID NOT NULL REFERENCES parceiros(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  nome         TEXT NOT NULL,
  papel        TEXT NOT NULL DEFAULT 'consultor', -- consultor_owner | consultor
  status       TEXT NOT NULL DEFAULT 'ativo',
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parceiro_id, email)
);

-- Liga a empresa (tenant) ao parceiro dono da carteira.
-- NULL = empresa direta Vertho (modelo atual, intacto).
ALTER TABLE empresas ADD COLUMN parceiro_id UUID REFERENCES parceiros(id);
CREATE INDEX idx_empresas_parceiro ON empresas(parceiro_id);
```

Notas:
- `parceiro_membros` é tabela própria, **não** reusa `colaboradores` — evita poluir a semântica de `colaboradores.empresa_id` (que é NOT NULL na prática e dirige RLS/dashboards). Auth continua por email no Supabase Auth; o que muda é o **contexto** resolvido no login.
- `branding` no parceiro espelha a forma do `empresas.ui_config` (logo_url, 7 cores, font_color, login_subtitle, hidden_elements, labels) — permite reusar o `ui-resolver.ts` com fallback em cascata (24.4).

---

## 24.3 Resolução de domínio white-label (proxy)

White-label total = domínio do **próprio consultor**, Vertho invisível. O `proxy.js` ganha um passo de resolução de **parceiro por domínio**, antes da resolução de tenant.

```
Requisição → proxy.js
  1. hostname é dominio_custom de um parceiro?  (cache 5min, igual tenant-resolver)
       → injeta x-parceiro-id  + escopo white-label
       → app do consultor (portfólio) OU empresa-cliente do parceiro
  2. senão, fluxo atual: {slug}.vertho.ai → tenant por slug
```

- **SSL/custom domains em escala:** **Cloudflare for SaaS** (custom hostnames + cert on-demand) ou **Vercel Domains API** (já há `lib/vercel-domain.ts` com o botão "Vincular ao Vercel"). Provisionamento de domínio do parceiro é **manual-aprovado** no início (mesma lição do bug Ibipeba: nada de auto-registro silencioso), depois self-service com verificação de DNS (TXT).
- `RESERVED_SUBDOMAINS` ganha `parceiros`, `consultor`, `portfolio`.
- Apex Vertho e `radar/imprensa` seguem inalterados.

---

## 24.4 Cascata de branding (white-label total)

O cliente final **nunca** vê a marca Vertho. Resolução de branding em 3 níveis, com cache:

```
branding efetivo da tela =
   empresa.ui_config            (se o parceiro deixou a empresa customizar)
   → parceiro.branding          (padrão da consultoria — o que o cliente final vê)
   → default Vertho             (NUNCA exibido sob domínio de parceiro; só apex Vertho)
```

`lib/ui-resolver.ts` passa a receber também `parceiro_id` e aplica o fallback intermediário. Sob domínio de parceiro, o último nível é **trocado pelo branding do parceiro**, garantindo que Vertho não apareça nem em erro/login/email. Templates de email e WhatsApp (`lib/notifications.ts`, `lib/i18n-auth-templates.ts`) passam a herdar remetente/assinatura do parceiro.

---

## 24.5 Isolamento de dados — escopo de carteira (migration 123)

Três níveis de isolamento, somando à barreira atual (filtro explícito por `empresa_id` + guards):

**Camada RLS — função de escopo**
```sql
-- SECURITY DEFINER: resolve o parceiro do membro autenticado
CREATE FUNCTION current_parceiro_id() RETURNS UUID ...;

-- Consultor enxerga SOMENTE empresas da própria carteira
CREATE POLICY consultor_le_carteira ON empresas
  FOR SELECT TO authenticated
  USING (
    parceiro_id = current_parceiro_id()       -- carteira do consultor
    OR id = current_empresa_id()              -- usuário-empresa vê só o próprio tenant (atual)
  );

-- Dados transacionais: consultor lê linhas das empresas da carteira
CREATE POLICY consultor_le_colaboradores ON colaboradores
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (SELECT id FROM empresas WHERE parceiro_id = current_parceiro_id())
    OR empresa_id = current_empresa_id()
  );
-- idem sessoes_avaliacao, relatorios, trilhas, pulse_*  (mesma cláusula de subquery)
```

**Camada de guard (enforcement real — onde as queries usam service_role)**
- Novo guard `requireConsultorAction(empresaId)` em `lib/auth/action-context.ts`: resolve `parceiro_id` do membro, **valida que `empresa.parceiro_id === parceiro_id`** antes de qualquer operação. Sem isso, qualquer server action que opere por `empresaId` poderia ser chamada para uma empresa fora da carteira.
- `requireConsultorOwnerAction()` para ações de gestão do parceiro (time, branding, billing, criar/arquivar empresa).

**Muralhas duras:**
- Parceiro A ↔ Parceiro B: isolamento total (subquery por `parceiro_id`).
- Colaborador da empresa X **nunca** percebe carteira nem outras empresas — o escopo de carteira só existe acima do tenant; o RLS atual do colaborador (`current_empresa_id()`) permanece o teto dele.
- `admin_audit_log` ganha coluna `parceiro_id` (migration 126) — auditoria por consultoria.

---

## 24.6 RBAC — papéis e permissões do parceiro (migration 124)

Estende `lib/permissions.ts`. Hoje as permissões são por-tenant; agora ganham **dimensão de escopo de carteira**.

| Papel (novo) | Escopo | Poder |
|---|---|---|
| `consultor_owner` | Carteira inteira do parceiro | Tudo do consultor + gerencia time do parceiro, branding, billing, cria/arquiva empresas |
| `consultor` | Carteira (empresas atribuídas) | Equivalente a `rh` **dentro** de cada empresa da carteira; lê relatórios de portfólio |

**Novos domínios de permissão:**
- `partner.team.manage`, `partner.branding.manage`, `partner.billing.view`, `partner.domain.manage` — gestão do parceiro (só `consultor_owner`).
- `portfolio.companies.create`, `portfolio.companies.archive`, `portfolio.reports.cross` — operação da carteira.

`can(ctx, perm)` passa a considerar o conjunto efetivo de empresas do consultor (carteira), não um único `empresa_id`. Overrides auditáveis (`permission_overrides`) continuam valendo — agora podem ter scope `parceiro`.

---

## 24.7 Provisionamento self-service da empresa-cliente

O consultor **cadastra a empresa e os colaboradores sozinho** (sem depender da Vertho).

```
criarEmpresaParceiro(parceiroId, dados)            -- guard: requireConsultorOwnerAction (ou consultor c/ permissão)
  → INSERT empresas (parceiro_id = parceiroId, ui_config herda parceiro.branding)
  → seed de competencias + cargos a partir de um TEMPLATE do parceiro (segmento educação/corporativo)
  → SEM auto-registro de domínio (lição Ibipeba); empresa herda o domínio do parceiro
  → quota: bloqueia se exceder limite do plano (24.9)
```

- **Onboarding de colaboradores:** reusa o import CSV existente (`area_depto` + aliases), escopado à empresa nova. Mapeamento de cargos/competências do template do parceiro.
- **Convites:** magic link / OTP WhatsApp (seção 22) com branding do parceiro.

---

## 24.8 Relatórios de portfólio (migration 125)

Dois planos de relatório:

1. **Por empresa (reuso):** RelatorioRH, RelatorioGestor, Plenária, Evolution Report, Pulso — já existem, apenas escopados via guard de carteira.
2. **Cross-portfólio (novo):** visão agregada da carteira para o consultor.

```sql
-- MV serving por parceiro: # empresas, # colabs, evolução agregada, alertas
CREATE MATERIALIZED VIEW parceiro_portfolio_agg AS
  SELECT parceiro_id, empresa_id, qt_colaboradores, evolucao_media,
         confirmadas, parciais, estagnacoes, regressoes, n_alertas
  FROM ...
GROUP BY parceiro_id, empresa_id;
-- refresh agendado (cron), padrão pulse_mv_aggregates / radarempresas serving tables
```

**Anonimato e ética (herda regras do Pulso):**
- Benchmark cross-empresa é **agregado e com min-N** (PULSE_MIN_N=7) — o consultor compara clientes em nível agregado, mas uma empresa **não** enxerga dados de outra.
- Mantém os princípios dos prompts de relatório (níveis numéricos 1–4, DISC como hipótese, nunca quadro público de acompanhamento individual).

---

## 24.9 Billing / revenda (white-label = reseller)

Modelo wholesale→retail: **o parceiro paga a Vertho**; o cliente final **nunca** vê fatura Vertho.

- `parceiros.plano` (starter/pro/scale) define **quotas**: nº de empresas, colaboradores ativos, créditos de avaliação e de vídeo/mês.
- **Metering** por parceiro (colaboradores ativos, avaliações geradas, vídeos renderizados — bate com a economia de render da seção 23). Tela "Conta / Uso" no app do consultor.
- Cobrança da Vertho ao parceiro é separada do que o parceiro cobra do cliente (fora do escopo do produto; o app só expõe **uso**, não a margem do parceiro).

---

## 24.10 LGPD e papéis de tratamento

White-label muda a cadeia de responsabilidade:

- **Parceiro = controlador** dos dados dos clientes dele. **Vertho = operador/sub-operador.**
- DPA Vertho↔Parceiro + DPA Parceiro↔Empresa-cliente. Páginas legais (Privacidade/Termos) precisam de variante por parceiro (assinadas pelo parceiro, não pela Vertho) — herdam do branding.
- `admin_audit_log.parceiro_id` (migration 126) dá rastreabilidade por consultoria. `sentry-scrub-pii.ts` segue valendo.

---

## 24.11 Escalabilidade (chapéu de arquiteto)

| Risco | Mitigação |
|---|---|
| Explosão de tenants (parceiros × empresas × colabs) | Queries de carteira via subquery indexada (`idx_empresas_parceiro`) + MV serving `parceiro_portfolio_agg` (não recomputa a cada acesso) |
| Custom domains em escala | Cloudflare for SaaS (cert on-demand) ou Vercel Domains; cache de resolução domínio→parceiro (5min, padrão tenant-resolver) |
| Cascata de branding cara | Branding efetivo resolvido 1x e cacheado por (empresa, parceiro) |
| Noisy-neighbor / abuso de quota | Limites por plano + rate-limit existente (`lib/rate-limit.ts`) por parceiro |
| Vazamento cross-carteira | RLS por `parceiro_id` (defense-in-depth) **+** guard `requireConsultorAction` no caminho service_role (barreira real) |
| Custo de IA por carteira grande | Reusa `getModelForTask` + Haiku para passes baratos; metering por parceiro evita surpresa |

---

## 24.12 Rollout faseado (📋)

1. **Fase 1 — fundação:** migrations 122–124 (parceiros, escopo, RBAC). App do consultor com **portfólio + empresa + colaboradores (CRUD)**. Branding em cascata. Domínio de parceiro manual-aprovado.
2. **Fase 2 — relatórios:** migration 125 (MV portfólio) + relatórios cross-carteira + reuso dos PDFs por empresa.
3. **Fase 3 — self-service & billing:** provisionamento de domínio self-service (verificação DNS), quotas por plano, tela de uso, `parceiro_id` na auditoria (126).

---

## 24.13 Mapa de telas — App do Consultor (liga ao simulador)

| Tela | Função | Permissão |
|---|---|---|
| **Login white-label** | Marca do parceiro; Vertho invisível | público (domínio do parceiro) |
| **Portfólio** | Carteira de empresas + KPIs globais + alertas + "Nova empresa" | `portfolio.*` |
| **Empresa › Visão geral** | KPIs do cliente + snapshot de competências | carteira |
| **Empresa › Colaboradores** | Tabela + CRUD + import CSV + DISC/cargo | carteira (rh-equivalente) |
| **Empresa › Relatórios** | RH / Gestor / Plenária / Pulso / Evolution | carteira |
| **Relatórios de portfólio** | Agregado cross-carteira (min-N) | `portfolio.reports.cross` |
| **Marca (white-label)** | Logo, cores, domínio, preview | `partner.branding.manage` (owner) |
| **Conta / Uso** | Plano + metering (revenda) | `partner.billing.view` (owner) |
