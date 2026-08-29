# Auditoria Técnica — Rotas, Ações e Componentes

> Gerado automaticamente em: Abril/2026
> Script: /tmp/audit.js (Node.js)

## Resultado: LIMPO

### Rotas
- **40 rotas reais** no App Router (25 páginas + 15 API routes)
- **49 referências** a rotas no código (router.push, href, fetch)
- **0 referências quebradas**

### Code Issues
- **60 detecções** pelo scanner automático
- **0 problemas reais** — todos são:
  - `placeholder="..."` em atributos HTML (funcionais)
  - "TODOS" em texto português (falso positivo de "TODO")
  - `console.log` em cron (logging legítimo)

### Mapa de Rotas

#### Páginas (25)
| Rota | Status |
|---|---|
| `/` | ✅ Redirect → /login |
| `/login` | ✅ Magic Link + senha |
| `/dashboard` | ✅ Dashboard RBAC |
| `/dashboard/assessment` | ✅ Lista competências |
| `/dashboard/assessment/chat` | ✅ Motor conversacional |
| `/dashboard/pdi` | ✅ Plano desenvolvimento |
| `/dashboard/praticar` | ✅ Trilha semanal |
| `/dashboard/praticar/evidencia` | ✅ Submissão evidência |
| `/dashboard/jornada` | ✅ Timeline |
| `/dashboard/perfil` | ✅ Perfil usuário |
| `/dashboard/perfil-comportamental` | ✅ Perfil DISC |
| `/dashboard/perfil-comportamental/mapeamento` | ✅ Instrumento DISC |
| `/dashboard/evolucao` | ✅ Evolução |
| `/admin/dashboard` | ✅ Admin KPIs |
| `/admin/empresas/nova` | ✅ Nova empresa |
| `/admin/empresas/gerenciar` | ✅ Import CSV |
| `/admin/empresas/[id]` | ✅ Pipeline fases 0-5 |
| `/admin/empresas/[id]/configuracoes` | ✅ Config 5 tabs |
| `/admin/cargos` | ✅ Cargos + Top 5 |
| `/admin/competencias` | ✅ CRUD competências |
| `/admin/ppp` | ✅ Extração PPP |
| `/admin/relatorios` | ✅ Download relatórios |
| `/admin/simulador` | ✅ Sandbox chat |
| `/admin/whatsapp` | ✅ Disparo lote |
| `/admin/platform-admins` | ✅ Gestão admins |

#### API Routes (15)
| Rota | Status |
|---|---|
| `/api/chat` | ✅ Motor conversacional |
| `/api/chat-simulador` | ✅ Sandbox |
| `/api/assessment` | ✅ GET cenários + POST respostas |
| `/api/colaboradores` | ✅ CRUD |
| `/api/upload-logo` | ✅ Upload Supabase Storage |
| `/api/cron` | ✅ 3 cron jobs |
| `/api/webhooks/qstash/whatsapp-cis` | ✅ Webhook QStash |
| `/api/relatorios/individual` | ✅ PDF individual |
| `/api/academia` | ✅ Stub (não chamado pelo frontend) |
| `/api/cargos` | ✅ Stub |
| `/api/generate-narratives` | ✅ Stub |
| `/api/pdi` | ✅ Stub |
| `/api/ppp` | ✅ Stub |
| `/api/relatorios` | ✅ Stub |
| `/api/webhooks/qstash` | ✅ Stub |

### Verificação de Integridade
- Todos os `router.push` apontam para rotas existentes ✅
- Todos os `fetch('/api/...')` apontam para endpoints existentes ✅
- Nenhum `onClick={() => {}}` vazio ✅
- Nenhum `href="#"` ✅
- Nenhum stub exposto ao usuário ✅
- Nenhum handler morto ✅
