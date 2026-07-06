# Portal do Representante — canal comercial de representantes autônomos

> MVP 1 implementado em 04/07/2026. Workspace comercial para RCs (representantes
> comerciais autônomos): CRM/pipeline, proteção de oportunidade, propostas com
> aprovação interna Vertho, comissão estimada, carteira e materiais aprovados.

## Ambiente de Demonstração (para o RC treinar/apresentar) — 04/07

O RC acessa o tenant de demonstração (`acme-demo`) pelo item **"Ambiente de
Demonstração"** no portal. Decisões:

1. **Entra COMO uma persona**, não como um colaborador-sombra. O RC escolhe
   Bruna (jornada completa), Ana (início), Paulo (parcial) ou Carla (gestora)
   e abre a demo **em nova aba**. Como os cookies de auth são **host-scoped**
   (`app.vertho.ai` ≠ `acme-demo.vertho.ai`), a sessão do portal do RC
   permanece ativa — ele alterna entre portal e demo livremente.
2. **Mecanismo**: `actions/sales/demo-access.ts` → `entrarNoDemoComoPersona()`
   (gated a RC ativo, personas allowlistadas, só se `acme-demo.is_demo`) gera um
   `token_hash` de magic link server-side (SEM enviar nada) e devolve a URL de
   `/auth/callback` no host do demo. Reusa o fluxo de callback existente — zero
   invenção de "token de impersonation". A persona vira sessão normal de
   colaborador/gestor no acme-demo. Cria o auth user da persona lazy (idempotente).
3. **Present + interagir**: como o RC É a persona, mostra a experiência real do
   colaborador E **interage ao vivo com o Mentor IA** (o diferencial pedido).
   Gestora (Carla) abre direto em `/dashboard/gestor` (visão de equipe).
4. **Compartilhado + reset noturno**: ambiente único, reiniciado toda madrugada
   (+ on-demand pelo admin). Colisão simultânea mitigada pelo reset; "um demo por
   RC" fica como follow-up se a interação simultânea virar gargalo.
5. **Subdomínio `acme-demo.vertho.ai` REGISTRADO no Vercel** (04/07): estava
   faltando — o tenant demo nunca foi web-acessível (host retornava 000). Agora
   registrado (via `vincularDominioVercel`) E **self-healing**: o reset chama
   `addVercelDomain('acme-demo')` (best-effort, idempotente) a cada execução.
   Validado E2E: RC entra como Bruna → cai em `acme-demo.vertho.ai/dashboard`
   (jornada 40%, fase 3/5); sessão do portal permanece ativa em paralelo.

### Gate de envio (pré-requisito de segurança — mig 160)

`empresas.is_demo` é a fonte única de "tenant de demonstração" (antes os flags
`sys_config.cadencia.*_ativo` eram cosméticos). `lib/demo/envio-guard.ts`
(`isTenantDemo`/`gateEnvioDemo`) bloqueia **todo disparo real** em tenant demo:

- Dispatchers em lote: `dispararMensagemCustomizada`, `enviarMagicLinksWhatsApp`,
  `dispararEmails`, `enviarConvitesPulso`, `enviarLinksPerfil`.
- Caminho de access-link (central): `sendAccessLink` recebe `empresaId` e bloqueia
  — cobre o **auto-cadastro aberto** (`allow_open_signup`, o vetor de envio a
  contato REAL durante a demo) + todos os magic-links de login.
- A sessão de demo é mintada server-side (não passa pelo sender) → não é afetada.
- Defesa em profundidade: personas @vertho.ai sem telefone permanecem.

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

## MVP 2 — Comissões financeiras (IMPLEMENTADO 04/07)

Ciclo de vida completo em `sales_commission_events`:
**forecast (previsto) → accrued (a receber) → paid (pago)**, + `cancelled` e
`chargeback` (estorno, valor negativo).

- **Expansão mensal**: ao aceitar a proposta (`markProposalAccepted`), além da
  comissão de aquisição (9%, evento único), a recorrente (12%) é expandida em
  **UM evento por competência (mês)** da vigência (`expandRecurringMonthly`) —
  granularidade que o financeiro precisa para reconhecer/pagar mês a mês.
- **Nota fiscal do RC** (mig 161: `invoice_number`, `invoice_issued_at`): o RC
  emite NF numa comissão "a receber" (`marcarNotaFiscalEmitida`) para agilizar o
  pagamento; "emitida" = `invoice_issued_at` preenchido.
- **Actions**: RC — `getMinhaComissaoLedger` (extrato + totais por estágio),
  `marcarNotaFiscalEmitida`. Admin (`actions/sales/commissions-admin.ts`, gated
  `sales_channel.manage`) — `getCommissionEventsAdmin`, `getCommissionAdminSummary`,
  `marcarComissaoAReceber`, `marcarComissaoPaga`, `cancelarComissao`,
  `registrarEstorno`, `exportComissoesCSV`.
- **Telas**: `/representante/comissoes` (extrato do RC + emitir NF, 4 cards de
  estágio) e `/admin/comercial/comissoes` (gestão financeira: reconhecer/pagar/
  cancelar/estornar, filtros por RC/status/competência, export CSV). Item
  "Comissões" no menu do RC e atalho no dashboard `/admin/comercial`.
- Regra preservada: RC nunca muda status nem paga a si mesmo — só emite NF.

## MVP 3 — Carteira / pós-venda (IMPLEMENTADO 04/07)

Gestão dos clientes ativos depois do fechamento.

- **Schema** (mig 162): `sales_accounts.expansion_potential` + `next_followup_date`;
  `sales_activity_notes.kind` (nota/followup/renovacao/risco/expansao) para a
  timeline da conta.
- **Actions** (`actions/sales/accounts.ts`): `getSalesAccount` agora traz os
  `followups`; `addAccountFollowup` (timeline), `definirRiscoChurn` (grava risco
  + nota), `criarOportunidadeExpansao` (nova oportunidade `origin='expansao'`
  pré-ligada à conta ativa → segue a política de comissão ao fechar),
  `getPortfolio` enriquecido (expansion/next_followup/days_to_renewal),
  `getPortfolioAdmin` (visão de canal: ativos, renovações ≤90d, risco alto, expansão).
- **Telas**: `/representante/carteira` (faixa "Renovações próximas" + linhas
  clicáveis) → `/representante/carteira/[accountId]` (contrato, fase 12%/6%,
  gestão de risco/renovação/próxima-ação, oportunidades + "Nova expansão",
  timeline de acompanhamento). Admin: `/admin/comercial/carteira` (visão de canal,
  read-mostly) + atalho no dashboard.
- Visão 12%/6% já existia na carteira; MVP 3 adiciona a operação em volta.

## MVP 4 — Assistente Comercial (IA) (IMPLEMENTADO 04/07)

Reusa a infra central de IA do app (`actions/ai-client.callAI` — roteador
multi-provedor Claude/Gemini/GPT com retry+fallback; default `claude-sonnet-4-6`).
Cada função aterra o prompt no CONTEXTO real (conta/oportunidade) + nos MATERIAIS
aprovados (`sales_materials` playbook/objeções/case), então a saída é específica,
não genérica. Sempre com o rótulo "Gerado por IA — revise antes de usar".

- **Actions** (`actions/sales/ai-assistant.ts`, RC-scoped): `prepararReuniao`
  (briefing: resumo, perguntas de diagnóstico, objeções prováveis, próximo passo),
  `assistirProposta` (proposta de valor, escopo sugerido, pontos comerciais,
  objeções), `analisarObjecao` (respostas ancoradas no playbook + pergunta de
  retorno + dica). Todas retornam JSON via `extractJSON`, com erro gracioso.
- **Benchmark** (`actions/sales/benchmark.ts`, NÃO-IA): `getBenchmarkSegmento`
  — conversão, ticket médio e ciclo médio por segmento; RC vê o próprio funil,
  admin vê o canal.
- **Integrações**: detalhe da oportunidade → "Preparar reunião (IA)"; detalhe da
  proposta → "Sugerir com IA" (com copiar escopo); Inteligência Comercial →
  "Assistente de Objeções (IA)" + tabela de "Benchmark por segmento", acima da
  biblioteca de materiais.
- **Playbook por segmento**: os materiais já têm `segment`; o grounding do
  assistente filtra por segmento da conta (geral + do segmento). A Inteligência
  Comercial expõe a lente por segmento (chips escola/empresa/rede_ensino/
  fundacao/outro → filtra materiais do segmento + gerais).

## Correções pós-MVP (05/07)

- **Expansão não reseta o contrato-base**: `markProposalAccepted` só carimba
  `contract_start_date`/`renewal_date` em negócio novo/renovação; quando a
  oportunidade é `origin='expansao'` numa conta já ativa, preserva as datas
  vigentes (a renovação do contrato-base não pula para frente).
