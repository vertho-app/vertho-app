# Histórico de auditorias (arquivo morto)

> **Registro, não backlog.** Auditorias antigas cujos achados já foram corrigidos e cujo vocabulário
> não corresponde mais ao código (falam de `.js`, de rotas que mudaram, de 20 migrations quando hoje
> são 164). Consolidado em 27/07/2026.
>
> Absorveu: `auditoria-final-sistema.md`, `auditoria-tecnica-rotas-acoes.md`,
> `auditoria-ux-funcional.md`, `smoke-test-report.md` (342 linhas somadas). Integral no git.
>
> **Auditorias vivas — é ali que se olha:**
> - Segurança: `SECURITY-STATUS.md` (estado corrente) — auditoria multi-agente de 23/07 remediada.
> - Pipeline da trilha: `FMEA-PIPELINE.md` (modos de falha catalogados, com status).
> - Levantamento geral 17/07: `LEVANTAMENTO-2026-07.md`.
> - Refatoração: `plano-refatoracao-final.md`.

---

## Abril/2026 — bateria de auditorias pós-reconstrução

Contexto: o app tinha acabado de ser reescrito do Google Apps Script (ver `HISTORICO-MIGRACAO.md`) e
rodava com 40 rotas, ~100 arquivos e 20 migrations. Quatro auditorias em sequência.

**O que foi encontrado e corrigido** (tudo aplicado à época):

| Frente | Achado | Correção |
|---|---|---|
| Segurança | `GET /api/colaboradores` sem `empresa_id` obrigatório → **devolvia colaboradores de todas as empresas** | `empresa_id` passou a ser obrigatório |
| Segurança | Admin decidido no cliente / por regex no cargo | Guard 100% server-side (`platform_admins`) + RBAC por coluna `role` |
| Segurança | `NEXT_PUBLIC_ADMIN_EMAILS` exposta no bundle | Removida |
| Schema | 4 tabelas referenciadas no código sem existir (`relatorios`, `pdis`, `fase4_envios`, `trilhas_catalogo`) | Criadas na migration 020 |
| Env | `NEXT_PUBLIC_APP_URL` usada em 8 lugares e ausente na Vercel | Adicionada |
| UX | `/dashboard/assessment` era placeholder "Em construção"; sino sem handler; PDI sem CTA no estado vazio | Implementados |
| Smoke | 29/29 rotas OK contra `vertho.com.br` | — |

**As duas lições que sobreviveram ao tempo** (o resto é folclore):

1. **Tabela referenciada no código não prova que existe no banco.** Quatro tabelas eram lidas por
   código em produção sem existir. Daí veio o `docs/SCHEMA-PROCESS.md` — schema muda por migration
   versionada, e a divergência doc×banco se confere no banco.
2. **Env var usada não prova env var configurada.** Foi a origem da auditoria periódica de envs
   (`docs/envs-importantes.md`); o mesmo tipo de furo reapareceu em 14/07 com `CRON_SECRET` faltando
   em produção.

## Junho/2026 — auditoria de arquitetura

Revisão de ~106k LoC por explorações paralelas. **Foi consumida pelo `plano-refatoracao-final.md`**,
que declara supersedê-la e é o plano oficial — está lá, não aqui.

## Julho/2026 — reorganização do admin (04/07)

Cinco fases executadas a partir de uma auditoria de navegação/layout/fluxos, com smoke test em
produção e sessão admin real. **O diagnóstico que motivou** — vale como referência do que não
repetir: menu lateral plano com 26 itens sem agrupamento; **31 de 64 páginas só alcançáveis pelo hub
do pipeline**; 4 mecanismos concorrentes de resolver o contexto de empresa; design system usado só
no dashboard (23 modais hand-rolled, 87 selects crus, 4 formas de dar feedback); toda ação
destrutiva protegida apenas por `window.confirm()`, inclusive "Excluir empresa".

**Bug encontrado no próprio smoke:** chegar a um workspace **via `redirect()`** (link antigo)
disparava React #310 — as páginas liam `useSearchParams()` sem `<Suspense>`. Só acontecia na chegada
por rota redirecionada, e a tela se auto-recuperava. Corrigido com boundary `<Suspense>` (`d3177d3`).

**Follow-ups que continuam abertos** (o registro completo saiu do repo em 27/07):
- i18n da tab Escolas (conteúdo interno segue hardcoded pt-BR).
- Modal compartilhado no lugar dos hand-rolled; `EmptyDataState`/`FilterBar` nas páginas restantes.
- Troca de tab nos workspaces não reescreve a URL (deep-link por `?tab=` funciona).
- Remover em definitivo as rotas-redirect legadas (top10, relatorios global, funnel-bett, escolas,
  votacao, ranking, calibracao…) depois de confirmar nos logs que ninguém mais as acessa.
- `prompt()` nativo remanescente na escolha de perfil do simulador de temporadas.

## Julho/2026 — levantamento geral (17/07)

Auditoria estática de fluxos, UX, segurança e arquitetura, com as divergências doc×código
sinalizadas. Continua **viva** em `LEVANTAMENTO-2026-07.md`; os 3 achados altos de segurança dela
foram fechados em 22/07 (`SECURITY-STATUS.md`).
