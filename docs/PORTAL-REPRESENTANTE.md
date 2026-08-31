# Portal do Representante — canal comercial de representantes autônomos

> MVP 1 implementado em 04/07/2026. Workspace comercial para RCs (representantes
> comerciais autônomos): CRM/pipeline, proteção de oportunidade, propostas com
> aprovação interna Vertho, comissão estimada, carteira e materiais aprovados.

## Estado em 27/07/2026 — congelado desde 07/07, e isso é intencional

**Verificado:** nenhum commit tocou `app/representante/`, `app/admin/comercial/`,
`lib/sales/`, `actions/sales/`, `components/sales/` ou o documento da proposta
**desde 07/07** — MVPs 1-4 + kit + versionamento estão fechados; o esforço migrou
para o motor da trilha, vídeo e segurança. Nenhuma migration `sales_*` depois da 168.

**Volume em produção (medido 27/07):** 6 representantes · 19 oportunidades ·
21 propostas · 19 contas na carteira · 139 eventos de comissão · 26 materiais.

**⚠️ Pendência que continua aberta:** a tabela `PRICING` (`lib/sales/pricing.ts:12`)
segue **PLACEHOLDER** — R$/usuário 25/45/35 e taxa de plataforma 400/600/500 são
números de exemplo. O simulador de preço já está no fluxo de proposta, então **todo
valor mensal sugerido ao RC hoje sai desses números fictícios**. Trocar as constantes
do arquivo basta; a mecânica não muda.

Débitos conhecidos, sem data: i18n do portal (pt-BR hardcoded), prorrogação manual de
proteção (`extended`, previsto no MVP 2 e não implementado), material próprio para o
segmento `fundacao` (hoje herda os gerais).

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

## Kit de sales enablement + template completo de proposta (06/07)

Ingestão do kit de materiais gerado externamente (battlecard, scripts,
one-pagers, etc.) para dentro do Portal — para o RC acessar in-product E a IA
aterrar neles.

- **Mig 164**: `sales_materials.content` (corpo rico; `description` continua
  teaser — o card faz `line-clamp-3`).
- **`scripts/seed-sales-kit.mjs`** (idempotente): arquiva os 12 placeholders
  genéricos (mantém os 2 de `politica`) e ingere 12 materiais ricos —
  Battlecard (13 objeções + posicionamento vs. concorrentes), 3 scripts de
  qualificação por segmento, 7 etapas, cheat sheet do acme-demo, mapa da
  jornada, modelo de proposta e 3 one-pagers. **Mapa GTM → `segment`**: escola
  privada→`escola`, RH/T&D→`empresa`, secretaria/rede pública→`rede_ensino`,
  transversais→`geral` (⚠️ `fundacao` sem material próprio; herda os gerais).
- **Grounding da IA** (`materiaisGrounding`): passa a ler `content` (truncado a
  1400 chars/material). O assistente de objeções/proposta/reunião agora cita o
  battlecard e os scripts calibrados, não os teasers. Validado E2E: objeção
  "substitui nine-box?" → resposta ancorada ("o nine-box é uma fotografia; a
  Vertho começa onde ele termina").
- **Card**: `content` com "Ver conteúdo" (expand) para o RC ler o material.
- **PDFs originais como download** (mig 165 `storage_path`): os 8 PDFs do kit
  vivem num bucket **privado** `sales-materials` (`kit/*.pdf`). O download é
  servido pela rota **gated** `GET /api/sales/materials/[id]/download`
  (`requireRepresentativeOrAdminAction` → 403 anônimo; stream via service role)
  — materiais internos (battlecard, scripts) não vazam por URL pública.
  `file_url` aponta para essa rota; o card mostra "Baixar". Validado E2E
  (anônimo 403, RC 200 %PDF). Reingerir: `seed-sales-kit.mjs` (texto) +
  re-subir os PDFs/relinkar `file_url` (upload é passo local, fora do repo).

**Template completo da proposta** (o doc gerado passa a espelhar o Modelo de
Proposta do kit): o VM (`buildProposalDocument`) ganhou `contexto` (da
`identified_need` da oportunidade), `cronograma`, `premissas`, `naoIncluso` e
`proximosPassos` (seções-padrão). Página pública e PDF renderizam as novas
seções. **Validade 15 → 30 dias** (`PROPOSAL_VALIDITY_DAYS`), alinhando ao material.

## Redesign do documento da proposta (06-07/07)

O documento visto pelo cliente — página pública `app/proposta/[token]/page.tsx`
e o PDF `components/pdf/PropostaComercialPDF.tsx` — foi redesenhado para um tema
**claro/editorial** (fundo branco, acento índigo), substituindo o visual escuro
anterior. A linguagem visual está documentada em `docs/DESIGN-SYSTEM.md`; aqui
ficam o fluxo e as seções. Commit `3316392f`.

- **Seções** (mesma ordem na página e no PDF): brand + pill "Proposta Comercial",
  hero, card "Para", `// Contexto`, `// Escopo incluído` (chips), `// Investimento`,
  `// Cronograma` (timeline), `// O que não está incluso`, `// Premissas`,
  `// Próximos passos` (cards 01-04), Contato (avatar de iniciais) e footer.
- **Inversão do destaque** (`2de61dd2`): a barra grande de investimento passou a
  mostrar o **valor mensal** (recorrência é a decisão comercial), e o total do
  contrato virou card menor ao lado.

## Correções e simulador de preço (06/07)

- **Toaster montado no `RepresentativeShell`** (`components/sales/representative-shell.tsx:259`):
  o portal não tinha `<Toaster>` do sonner — todos os toasts eram invisíveis, então
  "Submeter para aprovação não fazia nada" (o erro de validação era mudo). Agora
  há um `<Toaster>` próprio (`position="top-right"`, tema escuro, richColors).
  Commit `f2e08540`. + a validação de submissão passou a aceitar **pacotes legados**
  (`KNOWN_PACKAGES` = chaves de `PRODUCT_PACKAGE_LABELS`, em `lib/sales/validation.ts`),
  para não travar propostas antigas.
- **Simulador de preço** (`lib/sales/pricing.ts`, `simularMensalidade`): o valor
  mensal vem automático das variáveis (pacote / nº de usuários / nº de cargos); o
  form ganhou "Valor mensal com desconto" (máscara de moeda R$ #.###,##) e mostra o
  valor final do contrato após desconto. `calculateProposalFinancials` passou a
  devolver bruto + desconto em R$; a **mig 167** adicionou
  `sales_proposals.contract_value_gross` + `discount_amount` (o server grava o
  financeiro inteiro). Commit `d6fe08a9`. ⚠️ **A tabela `PRICING` em `pricing.ts` é
  PLACEHOLDER** (números de exemplo — ajustar com os valores reais da Vertho).
- **Segmento e pacotes** (**mig 166**): segmento "Fundação" → **"Comércio"**
  (`comercio` no `customer_type`/`segment`); pacotes do dropdown passam a ser
  `onboarding` / `mentor_ia` / `piloto` / `custom` (`completo`/`pulso` mantidos como
  legado no CHECK).

## Versionamento de proposta (06/07)

De uma proposta **Aprovada** ou **Enviada ao cliente**, o RC clica **"Revisar
(nova versão)"** → cria uma **cópia editável** (draft, número `-Rn`, financeiro
recalculado, **token novo**); a original vira status `superseded` ("Substituída")
e o doc mostra o selo "Versão N". A nova versão segue de novo pelo fluxo normal
(aprovação Vertho → reenvio ao cliente). Action `revisarProposta`
(`actions/sales/proposals.ts:230`). **Mig 168** adicionou `sales_proposals.version`
+ `supersedes_id` + o status `'superseded'` no CHECK. Commit `8bbcbf1b`. Validado
E2E ao vivo.

## Apagar uma empresa (`sales_accounts`) — a ordem é do banco, não minha (31/08)

A lista de empresas do Copiloto (`/copiloto`, aba Histórico) ganhou exclusão. Ela
vale para todo o módulo `sales_*`, porque `sales_accounts` é a raiz do canal:
sete tabelas apontam para ela, e **a metade que não cascateia dita a ordem**.

`Medido: 31/08/2026` (via `pg_constraint.confdeltype`; `c` = cascade, `n` = set
null, `a` = bloqueia):

| Regra | Tabelas |
|---|---|
| `c` — sai sozinho | `sales_contacts` · `copilot_plans` · `copilot_conversations` |
| `a` — bloqueia o DELETE | `sales_activity_notes` · `sales_opportunities` · `sales_proposals` · `sales_commission_events` |

O segundo nível decide a sequência: `sales_commission_events.proposal_id` →
`sales_proposals.opportunity_id` → `sales_opportunities` (e
`sales_opportunities.primary_contact_id` é `a`, então as oportunidades saem antes
de a conta cascatear os contatos). Daí a ordem em
`deleteSalesAccount` (`actions/sales/accounts.ts`):

```
sales_commission_events → sales_proposals → sales_activity_notes → sales_opportunities → sales_accounts
```

**Duas funções, dois papéis.** `getSalesAccountVinculos` só conta (mesmo gate,
nenhuma escrita) e é o que a confirmação da tela mostra —
*"Apagar “X”? Vai junto: 1 proposta, 1 oportunidade, 2 planejamentos, 1
resultado. Não dá para desfazer."*. `deleteSalesAccount(id, { forcar })` apaga.
Sem `forcar`, conta com funil (ou marcada `active_client`) devolve
`precisaConfirmar` + o inventário em vez de apagar: a action é um endpoint HTTP,
e quem chama direto não passou por confirmação nenhuma.

**Por que não recusa.** A versão anterior bloqueava a exclusão quando havia
funil. Estava tecnicamente certa e era um beco: a tela do Copiloto não oferece
caminho para remover oportunidade ou proposta, então a recusa empurrava o
operador para fora do produto. O que aquele bloqueio realmente prestava era
INFORMAR, e informação cabe na confirmação — decisão do dono, mesma data.

⚠️ **Apagar `sales_commission_events` deixa comissão paga sem lastro.** Por isso a
exclusão de conta com histórico grava `sales_account.excluir` em
`admin_audit_log` (`lib/audit.ts`) com o inventário, contado ANTES do delete —
depois não há mais o que contar. E a contagem usa `count: 'exact', head: true`
**com o `{ error }` checado**: leitura que falha e vira 0 apaga a conta com funil
em silêncio (E11).

Cobertura: `tests/unit/copiloto-apagar-empresa.test.ts` (18 casos, validados por
mutação — ignorar o `forcar`, inverter a ordem do delete, tirar a auditoria, não
checar o erro do loop, deixar a falha de leitura virar inventário vazio e tirar o
gate de dono do `getSalesAccountVinculos`; cada uma derruba exatamente o teste que
a descreve). Commits `d152ef13` (primeira versão, com bloqueio) e `735ef946`.

## Redes oficiais descobertas no PRÓPRIO site da empresa (31/08)

O planejamento pede três coisas ao vendedor: empresa, site e os perfis oficiais. O
terceiro era o que ficava vazio, e ele não é decorativo:
`lib/copiloto/social-identity.ts` descarta todo sinal social cujo perfil não tenha sido
declarado ali, e `researchCompany` só dispara a trilha "Redes oficiais" quando a lista
tem ao menos um item. Campo vazio não degradava a pesquisa: apagava uma das três
trilhas, em silêncio, e o Play saía com uma fonte a menos sem nada na tela dizendo isso.

Agora, ao informar o site (debounce de 900 ms, ou o botão **Buscar no site**),
`POST /api/copiloto/redes-sociais` lê o HTML e devolve os perfis que o próprio site
publica. **Por que o site e não busca aberta:** o link no rodapé é evidência de
titularidade, porque quem publicou foi a empresa. Busca traria homônimo e perfil de fã
com a mesma confiança, que é exatamente o que a régua de identidade existe para barrar.

Onde mora o quê:

- `lib/copiloto/social-discovery.ts` — puro, sem rede: `perfilCanonico`,
  `extrairPerfisSociais`, `paginasCandidatas`, `mesclarPerfisSociais`. É puro **porque a
  tela o importa** (`'use client'`): um import de `net-guard` (`node:dns`) quebraria o bundle.
- `lib/copiloto/social-discovery-fetch.ts` — a leitura: home e, só se ela vier com menos
  de 2 perfis, UMA página interna de contato/sobre. Teto de 3 requisições, 8 s, 1,5 MB.
- `lib/fetch-texto-publico.ts` — o GET público com a guarda anti-SSRF em cada hop,
  extraído de `lib/site-palette.ts` (paleta de login) e agora compartilhado pelos dois.

Régua do que conta como perfil DA EMPRESA (`perfilCanonico`):

- LinkedIn: só `/company`, `/school` e `/showcase`. `/in/` fica de fora **de propósito** —
  é o perfil de uma pessoa, e um fato do fundador entraria carimbado como fato da organização;
- fora também: botão de compartilhar (`sharer.php`, `intent/tweet`, `shareArticle`,
  `sharing/share-offsite`), post e reel avulsos, pixel e página de plugin;
- `twitter.com` e `x.com` colapsam num perfil só, senão a mesma conta come duas das 8 vagas.

A mescla **nunca sobrescreve**: entra só o que ainda não está no campo, comparado
canonicamente (`www.`, barra final e a dupla twitter/x não viram entrada duplicada). Quem
declara oficialidade continua sendo o vendedor; a descoberta é sugestão.

`Medido: 31/08/2026` — 8 domínios testados, 7 existentes, **7 devolveram perfis**:
anchieta.br (6), nubank.com.br (4), sesisp.org.br (4), anthropic.com (3), objetivo.br (3),
fiap.com.br (2) e sebsa.com.br (1 — este exercitou o caminho da página interna, porque a
home trazia um só). `example.com` respondeu corretamente "não publica nenhum", e o único
`sem_resposta` foi domínio inexistente, não bloqueio de bot.

Cobertura: `tests/unit/copiloto-social-discovery.test.ts` (16 casos, validados por mutação
— soltar o bloqueio de `sharer` e aceitar `/in/` derruba exatamente 3). Commit `f8852f18`.
