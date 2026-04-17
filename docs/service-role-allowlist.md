# Allowlist de `createSupabaseAdmin()` (service_role)

> Inventário de 88 arquivos que usam `createSupabaseAdmin()` (service_role key).
> service_role bypassa RLS — cada uso precisa de justificativa.
> Revisão: 2026-04-16
>
> **Nota**: A versão técnica/auditável da allowlist está em `config/service-role-allowlist.json` (com contagem por arquivo).

## Classificação

### ✅ Grupo 1 — Aceitável (uso legítimo de admin)

**Critério**: só entra neste grupo se tiver proteção server-side explícita
(requireAdminAction, requireRoleAction, ou checagem equivalente no servidor).
Guard client-side ou page-level NÃO conta.

Usos onde service_role é necessário ou justificável: infraestrutura, jobs internos,
operações cross-tenant, resolução de auth, platform-admin protegido por `requireAdminAction()`.

| Arquivo | Justificativa |
|---------|---------------|
| `lib/supabase.ts` | Definição do helper — não é uso, é fonte |
| `lib/tenant-db.ts` | Wrapper que usa admin internamente mas força filtro empresa_id |
| `lib/authz.ts` | Resolve platform_admins + colaborador cross-tenant por email |
| `lib/auth/request-context.ts` | Resolve contexto autenticado (precisa cross-tenant) |
| `lib/tenant-resolver.ts` | Resolve empresa por slug (cache 5min) |
| `lib/versioning.ts` | Prompt versioning — tabela global, sem tenant |
| `lib/rag.ts` | Lê knowledge_base pra grounding — protegido por empresa_id explícito |
| `lib/season-engine/build-season.ts` | Gera temporada — chamado de action admin |
| `lib/ai-tasks.ts` | Tasks IA auxiliares — uso interno |
| `actions/cron-jobs.ts` | Batch jobs (cleanup, triggers segunda/quinta) — sem user context |
| `actions/backup.ts` | Manutenção — admin only |
| `actions/manutencao.ts` | Manutenção — admin only |
| `app/actions/manutencao.ts` | Manutenção — admin only |
| `actions/whatsapp-lote.ts` | Dispatch assíncrono via QStash — job background |
| `actions/automacao-envios.ts` | Automação de envios em lote — job background |
| `actions/onboarding.ts` | Criação de empresa — admin only |
| `actions/simulador-conversas.ts` | Sandbox admin — protegido por requireUser/admin |
| `actions/simulador-temporada.ts` | Simulador de teste — admin sandbox |
| `app/api/webhooks/bunny/route.ts` | Webhook — autenticado por BUNNY_WEBHOOK_SECRET |
| `app/admin/dashboard/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/platform-admins/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/empresas/gerenciar/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/empresas/nova/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/empresas/[empresaId]/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/empresas/[empresaId]/configuracoes/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/cargos/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/competencias/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/relatorios/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/ppp/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/whatsapp/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/vertho/evidencias/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/vertho/avaliacao-acumulada/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/vertho/auditoria-sem14/actions.ts` | Protegido por requireAdminAction() |
| `app/admin/vertho/knowledge-base/actions.ts` | Protegido por requireAdminAction() |

### 🔄 Grupo 2 — Deveria migrar (leitura user-scoped já protegida por P0/P1)

Usos onde o endpoint já tem auth forte e as queries poderiam rodar com client
user-scoped + RLS, reduzindo blast radius. Migração depende de RLS policies
corretas nas tabelas envolvidas.

| Arquivo | Risco se service_role vazar | Tabelas envolvidas | Prioridade |
|---------|----------------------------|-------------------|-----------|
| `app/dashboard/dashboard-actions.ts` | Lê dados do colab autenticado | colaboradores, trilhas, respostas | Alta |
| `app/dashboard/pdi/pdi-actions.ts` | Lê PDI do colab | relatorios, colaboradores | Alta |
| `app/dashboard/jornada/jornada-actions.ts` | Timeline do colab | respostas, trilhas, relatorios | Alta |
| `app/dashboard/evolucao/evolucao-actions.ts` | Comparativo evolução | trilhas, descriptor_assessments | Alta |
| `app/dashboard/perfil/perfil-actions.ts` | Perfil do colab | colaboradores | Alta |
| `app/dashboard/perfil-comportamental/*-actions.ts` | DISC | colaboradores, cis_ia_referencia | Média |
| `app/dashboard/assessment/assessment-actions.ts` | Sessões do colab | sessoes_avaliacao, respostas | Alta |
| `app/dashboard/praticar/praticar-actions.ts` | Temporada do colab | trilhas, temporada_semana_progresso | Alta |
| `app/dashboard/gestor/equipe-evolucao/actions.ts` | Equipe do gestor | colaboradores, trilhas | Média |
| `actions/trilhas-load.ts` | Carrega trilhas | trilhas | Alta |
| `actions/temporada-concluida.ts` | Dados temporada | trilhas, colaboradores | Alta |
| `actions/dashboard-kpis.ts` | KPIs home | respostas, trilhas, micro_conteudos | Média |
| `app/api/assessment/route.ts` | Assessment colab | sessoes_avaliacao, respostas | Alta |
| `app/api/temporada/missao/route.ts` | Missão colab | trilhas | Alta |
| `app/api/temporada/reflection/route.ts` | Reflexão colab | trilhas, temporada_semana_progresso | Alta |
| `app/api/temporada/tira-duvidas/route.ts` | Tira-dúvidas | trilhas | Alta |
| `app/api/temporada/evaluation/route.ts` | Sem 14 | trilhas | Alta |
| `app/api/capacitacao-recomendada/route.ts` | Conteúdos | micro_conteudos | Média |
| `app/api/content/search/route.ts` | Busca conteúdos | micro_conteudos | Média |
| `app/api/colaboradores/route.ts` | CRUD colabs | colaboradores | Alta (já tem role check) |
| `app/api/cenarios/route.ts` | Cenários | banco_cenarios | Média |
| `app/api/relatorios/pdf/route.ts` | PDF relatórios | relatorios | Média |
| `app/api/temporada/concluida/pdf/route.ts` | PDF evolução | trilhas | Média |
| `app/api/gestor/plenaria/pdf/route.ts` | PDF gestor | trilhas, colaboradores | Média |
| `app/api/upload-logo/route.ts` | Upload storage | — (Supabase Storage) | Baixa |
| `app/api/upload/signed-url/route.ts` | Signed URL | — (Supabase Storage) | Baixa |
| `app/api/chat/route.ts` | Chat IA | sessoes_avaliacao, mensagens_chat | Alta |
| `app/api/chat-simulador/route.ts` | Simulador | sessoes_avaliacao | Baixa |
| `app/actions/beto.ts` | BETO chat | — (só IA, sem DB direto) | Baixa |

### ⏳ Grupo 3 — Ciclo posterior (alto risco de regressão)

Módulos com lógica complexa de negócio, múltiplas tabelas, ou pipelines IA
pesados. Já protegidos por P0/P1 na camada de app — migrar pra user-scoped
requer RLS policies completas + testes extensivos.

| Arquivo | Motivo pra adiar |
|---------|-----------------|
| `actions/fase1.ts` | 15 exports, cross-table, gera cenários/gabaritos |
| `actions/fase2.ts` | Pipeline de diagnóstico |
| `actions/fase3.ts` | IA4 + check — pipeline batch |
| `actions/fase4.ts` | PDI + trilhas |
| `actions/fase5.ts` | 16 exports — reavaliação, plenária, dossiê |
| `actions/relatorios.ts` | Gera 3 tipos de relatório com IA |
| `actions/avaliacao-acumulada.ts` | Dual-IA + check |
| `actions/check-ia4.ts` | Auditor |
| `actions/evolucao-granular.ts` | Delta por descritor |
| `actions/evolution-report.ts` | Consolidação sems 13+14 |
| `actions/temporadas.ts` | Motor de temporadas |
| `actions/fit-v2.ts` | Engine de scoring |
| `actions/ppp.ts` | Extração PPP com IA |
| `actions/conteudos.ts` | CRUD + tagging IA |
| `actions/conteudos-metrics.ts` | Métricas |
| `actions/cenario-b.ts` | Cenário B |
| `actions/competencias.ts` | CRUD competências |
| `actions/competencias-base.ts` | Base global |
| `actions/assessment-descritores.ts` | Grid notas |
| `actions/bunny-stats.ts` | Analytics Bunny |
| `actions/video-analytics.ts` | Analytics vídeos |
| `actions/video-tracking.ts` | Registro views |
| `actions/tutor-evidencia.ts` | Tutor evidência |
| `actions/preferencias-aprendizagem.ts` | Preferências |
| `actions/recalcular-impacto-conteudo.ts` | Recálculo |

## Resumo

| Grupo | Arquivos | Status |
|-------|----------|--------|
| ✅ Aceitável | 34 | Mantidos com service_role — justificados |
| 🔄 Migrar (P2+) | 29 | Candidatos a user-scoped quando RLS estiver pronta |
| ⏳ Ciclo posterior | 25 | Complexos demais pra migrar sem RLS policies completas + testes |

## Pré-requisitos pra migração do Grupo 2

1. RLS policies corretas nas tabelas-alvo (empresa_id + colaborador_id)
2. Client user-scoped criado com token do usuário autenticado
3. Testes por tabela (query com user A não retorna dados de user B)
4. Fallback: se RLS falhar, a proteção de app (P0/P1) continua ativa

## CSRF / Origin Check

Proteção de origin aplicada em 8 rotas mutativas via `lib/csrf.ts`:
- Requests com Bearer explícito: bypass (não é cookie-based)
- Requests GET/HEAD/OPTIONS: bypass (safe methods)
- Demais: exige Origin confiável (*.vertho.com.br, *.vercel.app, localhost)
- Falha fechada com 403

Exceções: webhooks (bunny, qstash) e cron — não são cookie-based.

## Cobertura de testes

### Testes comportamentais (handlers reais com mocks de dependência)
Rotas com testes que importam o handler real e validam status HTTP:
- `POST /api/chat` — auth 401, body validation 400
- `GET/POST /api/colaboradores` — auth 401, role 403
- `POST /api/upload/signed-url` — auth 401, role 403, admin passa gate
- `GET/POST /api/assessment` — auth 401, CSRF 403, Bearer bypass
- `POST /api/temporada/tira-duvidas` — auth 401, validation 400
- `loadPlatformAdmins` / `adicionarAdmin` — throws UNAUTHORIZED
- `loadAdminDashboard` — throws UNAUTHORIZED

### Testes estruturais (string matching no source)
~85 testes verificam presença de guards (`requireUser`, `requireRole`, `csrfCheck`, etc.) no codigo-fonte de rotas e actions. Complementam os comportamentais mas nao substituem.

### Guard de service_role (CI)
3 testes vitest + GitHub Actions (`typecheck.yml`):
- Arquivo novo com `createSupabaseAdmin` fora da allowlist → falha
- Contagem aumentada em arquivo ja permitido → falha
- Entrada stale (arquivo removido) → falha
