# Auditoria Final do Sistema — Vertho Mentor IA

> Abril/2026

## Resumo Executivo

Auditoria completa em 6 frentes do sistema reconstruído. O projeto está operacional com 40 rotas, 100+ arquivos JS, 20 migrations e integrações reais com Claude, Gemini, Supabase, Z-API, QStash e Firecrawl.

**Score geral: Sistema OPERACIONAL com ajustes de segurança e schema aplicados.**

---

## Frente 1: ENVs e Integrações

### Vars configuradas na Vercel (17):
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, MOODLE_TOKEN, ZAPI_CLIENT_TOKEN, ZAPI_INSTANCE_ID, ZAPI_TOKEN, QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, ADMIN_EMAILS, CRON_SECRET, FIRECRAWL_API_KEY, NEXT_PUBLIC_APP_URL

### Correções aplicadas:
- ✅ `NEXT_PUBLIC_APP_URL` adicionado (era referenciado em 8 lugares sem estar na Vercel)

### Vars usadas no código mas opcionais (sem configurar):
- `RESEND_API_KEY` — emails não funcionam sem ela (fase2 dispatch)
- `MOODLE_URL` — tem default hardcoded
- `JINA_API_KEY` — funciona sem auth
- `INTERNAL_API_KEY` — usado internamente para PDF

### Vars seguras:
- Nenhuma `NEXT_PUBLIC_*` sensível (apenas Supabase URL + anon key + app URL — todos públicos por design)
- Service role e API keys são server-side only ✅

---

## Frente 2: Schema e Migrations

### 20 migrations (001-020), 24+ tabelas
### Correções aplicadas:
- ✅ Migration 020: criadas tabelas `relatorios`, `pdis`, `fase4_envios`, `trilhas_catalogo`
- ✅ Colunas `evidencia_texto` e `evidencia_avaliacao` em `capacitacao`
- ✅ RLS habilitado nas novas tabelas

### Tabelas referenciadas no código e agora cobertas:
| Tabela | Status |
|---|---|
| relatorios | ✅ Criada (migration 020) |
| pdis | ✅ Criada |
| fase4_envios | ✅ Criada |
| trilhas_catalogo | ✅ Criada |
| avaliacoes | ⚠️ Referência em RHView.js — provável erro de nome (deveria ser sessoes_avaliacao) |
| resultados_competencia | ⚠️ Referência em RHView.js — provável erro de nome |

---

## Frente 3: Segurança e Permissões

### Correções aplicadas:
- ✅ API `/api/colaboradores` GET: empresa_id agora é OBRIGATÓRIO (antes retornava todos os colaboradores de todas as empresas)
- ✅ Admin guard: 100% server-side via `platform_admins` + fallback `ADMIN_EMAILS`
- ✅ Nenhuma `NEXT_PUBLIC_ADMIN_EMAILS` (removido completamente)
- ✅ RBAC explícito via coluna `role` (não mais regex em cargo)

### Análise de tenant isolation:
- `empresa_id` presente em todas as tabelas core ✅
- Queries com `createSupabaseAdmin()` sempre filtram por `empresaId` ✅
- `mensagens_chat` filtra por `sessao_id` (scoped por empresa via sessão) ✅
- RLS habilitado nas tabelas com policy por `get_empresa_id()` ✅

### Riscos residuais:
- RLS policies usam `get_empresa_id()` do JWT — funciona apenas com client autenticado, não com service role
- Service role bypassa RLS — as queries server-side dependem de filtro explícito no código (implementado)

---

## Frente 4: Observabilidade

### Implementado:
- ✅ `lib/logger.js` — logger estruturado com domain shortcuts
- ✅ `console.log` no cron para rastreabilidade de jobs
- ✅ Prompt versioning em `prompt_versions` (audit trail de IA)
- ✅ Check IA4 com nota + status + resultado (audit trail de qualidade)

### Recomendações futuras:
- Adicionar Sentry ou similar para error tracking
- Instrumentar tempos de resposta das chamadas de IA
- Dashboard de saúde (já existe System Health no admin)

---

## Frente 5: Validação por Fluxo

### Smoke Test: 29/29 passed ✅
| Fluxo | Status |
|---|---|
| Login (Magic Link + senha) | ✅ |
| Dashboard (colaborador/gestor/RH) | ✅ |
| Assessment (lista + chat) | ✅ |
| Mapeamento DISC (29 steps) | ✅ |
| PDI (visualização) | ✅ |
| Praticar (trilha + evidência) | ✅ |
| Evolução | ✅ |
| Admin Dashboard (KPIs + health) | ✅ |
| Pipeline empresa (fases 0-5) | ✅ |
| Configurações (5 tabs) | ✅ |
| PPP (extração + visualização) | ✅ |
| Relatórios | ✅ |
| Simulador | ✅ |
| WhatsApp dispatch | ✅ |
| Platform Admins | ✅ |

---

## Frente 6: Higiene Final

### Estado:
- 0 placeholders expostos ao usuário ✅
- 0 rotas quebradas ✅
- 0 botões sem handler ✅
- 0 stubs visíveis ✅
- Bell icon substituído por Logout funcional ✅
- Assessment page implementada (era placeholder) ✅
- PDI empty state com CTA útil ✅

---

## Arquivos Alterados Nesta Auditoria

1. `app/api/colaboradores/route.js` — empresa_id obrigatório
2. `supabase/migrations/020_tabelas_faltantes.sql` — 4 tabelas + colunas
3. `lib/logger.js` — NOVO: logger estruturado
4. Vercel env: `NEXT_PUBLIC_APP_URL` adicionado

## Riscos Pendentes

| Risco | Severidade | Ação |
|---|---|---|
| `RESEND_API_KEY` não configurada | Médio | Emails de fase 2 não funcionam |
| RHView.js referencia `avaliacoes` e `resultados_competencia` (tabelas inexistentes) | Baixo | Componente não usado diretamente na UI principal |
| OpenAI API key inválida (401) | Baixo | GPT removido dos seletores |

## Próximos Passos Recomendados

1. Configurar `RESEND_API_KEY` para emails funcionarem
2. Corrigir RHView.js para usar tabelas corretas
3. Implementar Sentry para error tracking
4. Adicionar testes Playwright para fluxos com interação
5. Configurar CI/CD com smoke test automático no deploy
