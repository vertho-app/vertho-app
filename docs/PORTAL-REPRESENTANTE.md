# Portal do Representante — canal comercial de representantes autônomos

> MVP 1 implementado em 04/07/2026. Workspace comercial para RCs (representantes
> comerciais autônomos): CRM/pipeline, proteção de oportunidade, propostas com
> aprovação interna Vertho, comissão estimada, carteira e materiais aprovados.

## Arquitetura (decisões-chave)

1. **Não é tenant.** Isolamento por `representante_id` em TODAS as queries,
   aplicado server-side (guards + actions). Admins Vertho enxergam o canal todo.
2. **Rotas em `/representante/*`** (não `/dashboard/representante` como o spec
   sugeria): o segmento `/dashboard` tem layout do colaborador de tenant
   (`DashboardShell` com nav de jornada) — aninhar ali criaria shell duplo.
   O portal tem layout raiz próprio (`RepresentativeShell`).
3. **Auth**: RC é usuário Supabase Auth vinculado a `sales_representatives` por
   e-mail (`user_id` opcional). Não passa por `getUserContext` (que exige
   colaborador/admin) — guards próprios em `lib/sales/permissions.ts`:
   `getRepresentativeContext` / `requireRepresentativeAction` /
   `requireRepresentativeOrAdminAction` / `requireCommercialAdminAction` +
   `assertRepresentativeOwnership` (anti-IDOR).
4. **Permissões admin**: chaves novas `sales_channel.view` (sócio tem) e
   `sales_channel.manage` (só master; aprovar propostas, gerir RCs/materiais).
   Item "Canal Comercial" no grupo Comercial do menu admin.
5. **Segurança do banco** (mig 159, padrão pós-156/158): 9 tabelas `sales_*`
   com RLS ON + zero policies + REVOKE anon/authenticated = service-role-only.
   Passa nos invariantes do guard de postura (INV1-5).
6. **Linguagem comercial neutra por design**: o RC é autônomo — nada de
   controle de jornada/rotina/horas. Rótulos: "Próximas ações comerciais",
   "Proteção de oportunidade", "Pipeline qualificado", "Carteira ativa".
7. **Financeiro nunca no client**: `lib/sales/commissions.ts` é a fonte única
   (o server SEMPRE recalcula ao salvar proposta). O client usa a mesma lib só
   para preview ao vivo no simulador.
8. **i18n**: MVP em pt-BR hardcoded no portal (público RC brasileiro); as
   chaves do menu admin estão nos 4 locales. i18n completo do portal = débito.

## Regras de negócio implementadas

- **Proteção de oportunidade**: 90 dias do registro validado
  (`lib/sales/protection.ts`); status derivado active/expiring (≤15d)/expired;
  alertas em 15/10/5 dias e vencida. `extended` reservado para prorrogação
  manual pela Vertho (MVP 2).
- **Score de qualidade (0-100)**: completude do registro
  (`lib/sales/quality-score.ts`) — conta 10, contato 10, cargo do contato 10,
  origem 10, necessidade 15, produto 10, estágio 10, próxima ação 15,
  evidência 10. Persistido e recalculado a cada update.
- **Comissões** (`lib/sales/commissions.ts`): aquisição 9% do contrato inicial;
  recorrente 12% na vigência; renovação 6%; expansão 9%+12%. MVP = estimativa
  na proposta; aceite do cliente materializa eventos `forecast` em
  `sales_commission_events` (hook MVP 2: accrued/paid/chargeback prontos).
- **Máquina de estados da proposta**: draft → submitted_for_approval →
  approved|changes_requested|rejected; approved → sent_to_client → accepted|lost.
  RC nunca aprova a própria proposta; só admin com `sales_channel.manage`.
  Submissão/envio/aceite refletem no estágio da oportunidade
  (aguardando_aceite_vertho → contrato_enviado → fechado_ganho) e o aceite
  ativa a conta na carteira com data de renovação.
- **KPIs** (`lib/sales/kpis.ts`): pipeline total/qualificado (score ≥70 fora de
  lead)/ponderado (probabilidade por estágio), sem-próxima-ação, paradas 15d+,
  proteções vencendo, receita contratada no trimestre, comissão estimada.

## Mapa de arquivos

- `migrations/159-portal-representante.sql` — schema (aplicada em prod 04/07)
- `lib/sales/` — constants, types, protection, quality-score, commissions,
  validation, kpis, formatters, permissions (guards)
- `actions/sales/` — representatives, accounts, contacts, opportunities,
  proposals, commissions, materials, admin-dashboard
- `components/sales/` — shell do RC, kanban, cards, tabelas, forms, badges,
  painéis de aprovação
- `app/representante/` — layout (gate de RC), dashboard, crm(/nova/[id]),
  propostas(/nova/[id]), carteira, inteligencia-comercial
- `app/admin/comercial/` — dashboard do canal, propostas(/[id]) com aprovação,
  representantes, materiais
- `scripts/seed-sales-materials.mjs` — seed idempotente (14 materiais, rodado)

## Como criar um RC

Admin (master) em `/admin/comercial/representantes` → "Novo representante"
(e-mail + nome). O RC entra por `/login` (magic link/OTP do Supabase) e acessa
`/representante`. Se o e-mail ainda não tem usuário auth, o primeiro login cria.

## MVP 2-4 (hooks prontos, não implementados)

- MVP 2: `sales_commission_events` cobre forecast/accrued/paid/chargeback;
  falta UI financeira + export + status de NF do RC.
- MVP 3: `sales_accounts` tem contract_start/renewal_date/churn_risk; carteira
  já deriva fase 12%/6% — falta histórico de follow-up e upsell guiado.
- MVP 4: playbook por segmento já é dado (`sales_materials.segment`); IA de
  proposta/preparação de reunião/benchmark ficam para o assistente.
