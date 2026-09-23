# Resumo de Retomada — Vertho App

> Atualizado em 22/09/2026. O SHA de HEAD não é fixado aqui de propósito — ficava
> obsoleto no commit seguinte e dava a impressão de que o resto do documento também estava.

## Histórico das jornadas do colaborador (21/09)

O colaborador agora acessa **Jornada → Ver histórico** para consultar as próprias
temporadas concluídas. A lista abre conteúdos e missões em modo somente leitura e mantém
Evolution Report, PDF e certificado ligados à temporada escolhida; as consultas continuam
escopadas ao usuário e ao tenant autenticados. O aviso de retenção explicita que o acesso
permanece enquanto a empresa tiver acesso à plataforma (`4714f27e`).

Na ACME Demo, a Bruna Costa ganhou uma temporada 1 concluída de Negociação e
Fechamento, com 7/7 semanas, relatório e certificado, sem alterar sua temporada 2 ativa.
O seed é idempotente, restrito ao `acme-demo` e integrado ao reset canônico; cadência e
sinais seguem a temporada mais recente (`00a96dd4`). Detalhes e roteiro de validação:
`docs/AMBIENTE-DEMO.md` e `docs/CHECKLIST-VALIDACAO.md`.

## Degustação B — navegação e painéis (21/09)

Cartões de ação abrem grupos identificados, com retorno às sugestões. Histórico semanal responsivo e selecionável; série ilustrativa de 73–97% somente na visão geral dos três tenants demo, separada das métricas operacionais. Resumo de revisões removido dos painéis de vendas e liderança; participação e revisão individual mantidas. Critérios em [AMBIENTE-DEMO.md](AMBIENTE-DEMO.md).

## Degustação B — adoção do elenco (21/09)

A home exclui visitantes do funil da empresa fictícia e inclui jornadas concluídas na adesão, com estados separados. Elenco recalibrado: média 3,26/4; 80% das competências comerciais e 76% das escolares em N3/N4; 19/22 e 9/11 jornadas concluídas. Atualização incremental e reset usam `lib/demo/sincronizar-adocao.ts`, com PDIs sintéticos e leituras coerentes. Detalhes e critérios: [AMBIENTE-DEMO.md](AMBIENTE-DEMO.md#adoção-e-resultados-do-elenco-online--21092026).

## Onde esta o projeto

- Workspace: `C:\GAS\Vertho App\nextjs-app` (o repo Git e esta pasta, nao a pasta-pai).
- Branch: `master`. **`git push origin master` ja deploya** na Vercel — NAO rodar `vercel --prod` por cima (duplica).
- Stack: Next.js 16.2.4, React 19.2.4, Supabase/Postgres, Tailwind 4, TypeScript (923 arquivos `.ts/.tsx` versionados).
- IA: Claude (`@anthropic-ai/sdk` 0.96) como default, com OpenAI/Gemini/Kimi pelo mesmo wrapper (`actions/ai-client.ts`).
- Jobs de fundo: Trigger.dev v4 (`trigger/`) — **deploy MANUAL**, nao sobe no push.
- Video: HeyGen (avatar) + Remotion 4 (render, backend Hetzner) + Bunny Stream (hosting).
- Mapa completo: `ARQUITETURA.md`. Resumo operacional e regras obrigatorias: `CLAUDE.md`.

## Como retomar

```powershell
cd "C:\GAS\Vertho App\nextjs-app"
git status --short
npm run dev            # http://localhost:3000
```

Antes de considerar qualquer tarefa pronta:

```powershell
npm run build          # NUNCA com `| tail` (deixa next build orfao segurando o lock)
npx tsc --noEmit
npm run test:unit      # vitest — 1041 testes em 120 arquivos (medido 28/07), roda no CI
```

Outros: `npm run smoke` · `npm test` (Playwright) · `npm run reset:demo` (reseta `acme-demo`).
⚠️ `npm run lint` esta QUEBRADO desde o Next 16 (`next lint` removido) — usar `tsc --noEmit`.

## Frentes recentes

**21/09 — Achados restantes do QA da degustação.** Migração 267 e leituras dos três tenants aplicadas. Contato registra clique sem enviar; exploração é medida após conteúdo carregado e visível, com coorte B e exclusão de testes. Leitura do Sinal usa 8 liderados/24 mapeamentos completos; Marina usa N3 (3,10) na narrativa e no cartão. Evolução explica reavaliação, DISC/PDF têm nomes acessíveis e data administrativa não depende de dois fusos na hidratação. 468 testes direcionados passaram. O formulário de contato preserva Origin no POST; a proteção de concorrência também cobre entrada pessoal A/B. Detalhes e critérios em `docs/AMBIENTE-DEMO.md`.

**21/09 — Correções críticas da degustação.** Concorrência de OTP reproduzida e protegida por lease no banco (migração 266, aplicada); falha transitória de convite válido retorna à degustação. PDF de RH passou a codificar o nome do arquivo em UTF-8. Testes direcionados (42), typecheck e build passaram; a revisão das métricas, narrativas e acessibilidade continua, sem encerrar os demais achados do QA de 20/09.

**21/09 — Degustação B começa pelo RH.** Cards, convite e etapas seguem RH → gestor →
participante. A orientação de cada visão oferece perguntas ligadas às dores do papel;
WhatsApp do próximo passo: (11) 97388-2303. Os simuladores habilitados ganharam
históricos fictícios de atendimento, vendas e liderança, além de mapeamento com os
quatro quadrantes. O seed é incremental, limitado ao elenco demo e integrado ao reset.
Detalhes e validação em `docs/AMBIENTE-DEMO.md`, seção “Degustação B: RH primeiro e
simuladores preenchidos (21/09/2026)”.

**12/09 — FinOps separado da precificação comercial.** `/admin/vertho/simulador-custo`
responde por custo real, projeções e catálogo de IA; `/admin/vertho/orcamento` virou
o deal desk de escopo, preço, custo all-in, margem, desconto seguro e caixa. A régua
única usa R$ 300 por pessoa/ciclo, matrizes nova/adaptada a R$ 1.000/R$ 500,
margem-alvo de 50%, impostos de 20%, contingência de 10% e comissão de cenário por
canal. A folha de decisão separa investimento do cliente de custo interno por pessoa
e por ciclo, explicitando o rateio do setup. Doc canônico: `docs/ORCAMENTO.md`.

**02/09 — Engajamento vira workspace visual com abas** (`1ba65ff7`). `/admin/engajamento` agora
reúne **Visão atual** e **Evolução semanal** em abas reais: o conteúdo troca no lugar, os estados são
preservados e a URL não muda. A primeira aba organiza acesso → consumo → evidência, posição na
jornada e acompanhamento por pessoa; a segunda mantém série longitudinal, trajetórias, recuperados,
heatmap por área e fila de risco. `/admin/engajamento/evolucao` virou redirect de compatibilidade e
o relatório semanal abre a aba longitudinal via `?view=evolucao`. A tela do gestor recebeu a mesma
hierarquia visual, com atenção primeiro e layout responsivo.

**02/09 — Engajamento separa calendário de etapa individual** (`0cb3feea`). A primeira versão da
visualização dizia que os 38 participantes estavam na semana 3 porque lia
`fase4_envios.semana_atual`; esse campo é o **relógio da cadência**, avança no dia da evidência e
não prova conclusão individual. `/admin/engajamento` e `/dashboard/gestor/engajamento` agora usam a
trilha mais recente + o histórico completo de `temporada_semana_progresso`, pela mesma
`primeiraSemanaAcessivel` da cadência (wrapper `lib/engajamento/posicao-jornada.ts`). A leitura real
da coorte no fechamento mostrou **21 na semana 1 pendente, 8 na semana 2 pendente, 7 na semana 3 em
curso e 2 com a semana 3 concluída**. Âmbar/ciano/verde distinguem esses estados; a régua filtra
pessoas por etapa, enquanto o seletor “Métricas” continua recortando os sinais históricos por
semana. Falha de leitura devolve “posição indisponível”, nunca o calendário como fallback. Não houve
migration.

**28/07 — Perfil natural, contexto no Pulso e evolução de engajamento.** O mapeamento DISC principal
e o relatório comportamental ficaram **natural-only**: o antigo bloco/perfil adaptado foi removido
da coleta principal, dos prompts e dos contratos de relatório. As perguntas de contexto foram
preservadas no **Pulso v2**: cada momento novo tem 12 Likert + 8 rankings + 6 escolhas forçadas +
1 aberta; assignments antigos continuam em v1, pois `template_version` é congelada. O resultado
contextual fica em `pulse_assignments.contextual_disc` e nunca sobrescreve o DISC natural
(migração 183; commit-base `8f987a25`).

Também entrou a evolução longitudinal, originalmente como página B em
**`/admin/engajamento/evolucao`** (`3caa064e`) e incorporada ao workspace como aba em 02/09: série
semana a semana de ativação/consumo/evidência, trajetórias, recuperados, heatmap por área e fila
operacional de risco. Índice explícito: 20 ativação + 30 consumo + 40 evidência + 10 Tira-Dúvidas;
é sinal operacional, não nota. Cada semana usa como denominador quem já a alcançou pelo relógio da
cadência (`semana_atual >= N`) — inclusive pendentes, porque a evolução mede quem estava previsto e
deu sinal, não posição individual. Não houve migration nova para o dashboard.

**28/07** — **Três regras de produto novas.** (1) **A missão de aplicação cobre o bloco que acabou
de fechar** (sem 4 → semanas 1-3, sem 8 → só 5-7, sem 12 → cumulativa): antes a semana 4 cobrava a
competência inteira, incluindo conteúdo ainda não entregue; as 37 trilhas do Ibipeba foram regeradas
(74 missões). (2) **Telemetria de degradação** (`degradacao_log`, mig 194): os 10 fallbacks
silenciosos clássicos registram; o health estrutural lê 24h (R10). (3) **Na construção, falhe alto;
na entrega, degrade registrando** — missão/cenário, semana sem core e DUO→single viraram ERRO
acionável no build (placeholder não embarca mais). Régua permanente no `CLAUDE.md`.

**26-27/07** — **Uma fonte de contexto institucional por empresa.** Empresa-rede tem 1 PPP por escola
(Ibipeba: 11) e o `.limit(1)` aplicava uma escola sorteada ao municipio inteiro, em silencio — classe
**F-I10** no `docs/FMEA-PIPELINE.md`. Fechada em **9 sites** (valores do IA2 em `062dca13`; em 27/07
`buscarContextoPPP` de IA1/IA2/IA3, check dual do IA3, PDF personalizado, IA4 ×2 e Cenario B ×3) e
protegida por **guard de CI** (`tests/unit/security/ppp-rede-guard.test.ts`) — os 5 ultimos sites foram
achados PELO guard, depois de a classe ter sido declarada fechada por leitura. Regua, cenario, kit e PDF
passam a ver a MESMA lente (`empresas.kit_contexto`); a chave de cache do PDF ganhou a assinatura do
contexto (F-E7 — fecha colisao entre escolas **e** a invalidacao quando entra PPP novo).
Os 2 guards de tenant voltaram ao verde (`3367efb7`): `certificado.ts` por `tenantDb`, `fetchColabPorId`
descobre o tenant e cobra via `empresaIdEsperado`.

**27/07 (noite)** — **Faxina do FMEA: zero 🔴/🟠 abertos** (`75764ed4` + `fc25fe36`). F-C6 (dedup de
30 linhas em `micro_conteudos` + 17 `temporada_plano` reapontados — 10 perdedoras eram referenciadas
via JSONB, sem FK — + UNIQUE parcial, mig 190) e os 6 laranjas: header da trilha vira upsert (F-C1),
`regerarSemana` repara core orfao pelo MOTOR (F-I2), pool do build exige `kit_id/disc IS NULL` sem DDL
— a `disc` da mig 142 ja sobrevivia ao SET NULL (F-I4), FKs em `development_blueprints` (F-I5, mig 191),
descritor canonico na escrita + backfill de 122 linhas (F-I6), auditoria com denominador fixo + flag
`parcial` (F-P1), lote sincrono de temporadas vira stub (F-E4 — a UI ja rodava fila + loop no client).
**F-I8 virou decisao de design**: conteudo por IA ancora na 1a letra do DISC (celula de custo);
relatorio/PDF usa o combo completo. Tudo com guarda validada por mutacao. Detalhe e follow-ups
(blueprint loops sincronos, crons novos ainda nao observados em prod) no `docs/FMEA-PIPELINE.md`.
Na sequencia (`02b42068` + `ccba5c15`): **IA4 com retry self-service** (resposta avaliada sem notas
volta pra fila; 0 presas em prod), **overlay deterministico** (ORDER BY nos 2 resolvedores; 0 dup
kit-side), **§6 do FMEA sincronizada** e as **7 divergencias doc×código** corrigidas no
PIPELINE-TRILHA/KIT-SEMANAL. Armadilha do dia: `try/catch` NÃO pega erro de query do supabase-js
(ele retorna `{ error }`) — regra nova no CLAUDE.md.

**22-23/07** — **Auditoria de seguranca multi-agente** (223 arquivos, 29 achados confirmados)
remediada de ponta a ponta; classe dominante = gate que nao liga o `empresaId` do client ao tenant da
sessao (`docs/SECURITY-STATUS.md`). **Certificado de Conclusao** (PDF A4, branding duplo, minimo 75%
de participacao, piloto nao emite). **Modo Personalizado** (`ec3fd527`, mig 182): degustacao de 1-4
semanas, 1-2 competencias, fechamento opcional, com a config congelada na trilha. **Branding: puxar
paleta do site do cliente** (`c885e970`) — IA mapeia 7 slots, contraste garantido em codigo.
**Lotes de IA em segundo plano** com Batch API (−50%) e botao de parar (migs 172/173). Refresh de
sessao movido pro `proxy.js` (`8f5c1d1c`) — matou o laco `/admin/dashboard` ↔ `/login`.
DISC contextual movido pro Pulso (mig 183); o mapeamento e os relatórios comportamentais usam apenas
o natural.

**20/07** — Telemetria de engajamento (`/admin/engajamento`), ledger de uso de IA (migs 177/178),
eventos de trilha (mig 179), provedor Kimi e `reasoningEffort` no wrapper de IA.

**06-07/07** — Portal do Representante: simulador de preco, redesign do documento de proposta,
versionamento `-Rn` (migs 166-168). Modo Piloto: acumulada virou task Trigger.dev com status
rastreavel (mig 169). ACME Demo: reset canonico unico.

## Produto (visao rapida)

- **Mentor IA** multi-tenant em `{empresa}.vertho.ai` — diagnostico (DISC + conversacional), PDI,
  trilha por temporadas, conteudo multi-formato, fechamento com dupla IA + arguicao, certificado.
  Modos: **Jornada de 7 semanas** (o formato em uso e o que o orçamento precifica: 1 competência,
  6 semanas de conteúdo e fechamento na 7ª; DUO = 2 jornadas em sequência, a 2ª montada sozinha) ·
  **Regular DUO** (14 sem; ainda é o default do código quando a empresa não escolhe modo) ·
  **Onboarding** (10 sem; configurado, sem turma em produção) · **Piloto** (2 sem) ·
  **Personalizado** (1-4 sem, configuravel). Modo por empresa E por colaborador, com carimbo na trilha.
- **Simuladores (módulos contratados)**: de vendas (método PACE), de atendimento (4 segmentos) e de
  liderança (5 encontros), com devolutiva por competência e evidência literal; e o **Mapeamento de
  liderança** (matriz global de liderança × estilo, leitura do RH). Docs: `SIMULADOR-VENDAS.md`,
  `recepcao-medica.md` (atendimento), `SIMULADOR-LIDERANCA.md`, `simuladores-validacao.md`.
- ⛔ **Off-line desde 31/08/2026** (`lib/blocos-offline.ts`, código preservado, não é capacidade do
  produto): Pulso de Desenvolvimento, Seleção de pessoas, RadarEmpresas, RadarBett e CONARH 52.
- **Engajamento operacional** — workspace `/admin/engajamento` com abas **Visão atual** e
  **Evolução semanal**, etapa individual separada do calendário da turma, filtros de empresa/semana/
  área e régua transparente. Sem filtro, os sinais pertencem à etapa atual da jornada mais recente;
  temporadas antigas não concluem a semana presente por engano. A antiga rota
  `/admin/engajamento/evolucao` é só compatibilidade.
- **Radar Vertho**: ferramenta INTERNA em `app.vertho.ai/radar` (só admins da plataforma) desde
  10/08/2026; `radar.vertho.ai` responde 301 para vertho.ai. Escola, municipio, rede, estado,
  comparacao; inclui matriculas do censo (178k escolas).
- **Portal do Representante** (`/representante`, interno): funil de RCs, propostas, comissoes;
  parado desde 10/07 (não off-line). Propostas também saem do deal desk, sem RC.
- **Ambiente de demo**: três tenants fictícios (`acme-demo`, `gruposinal` e `escolas-acme`), com
  reset canônico; a degustação guiada (versão B) é o padrão do painel (`docs/AMBIENTE-DEMO.md`).
- i18n em 4 idiomas (pt-BR/pt-PT/es-ES/en-US, next-intl) + login por WhatsApp (OTP) alem do magic link.
- **Descontinuado:** `radarbett.vertho.ai` (redirect 301 desde 25/05).

## Banco e migrations

- **172 arquivos, `000` a `191`** (com gaps). Recentes: 184/186 pipeline-health (+189 modo
  `horizonte`), 185 UNIQUE de `kit_briefs`, 187 lock do cron, 188 consolidacao de celulas de
  video, 190 UNIQUE parcial de `micro_conteudos` nao-kit, 191 FKs de `development_blueprints`.
  Anteriores: 172/173 `ia_jobs` (lote + parar),
  174 competencias-foco do cargo, 175/176 development blueprints + auditoria, 177/178 ledger e resumo
  de uso de IA, 179 eventos de trilha, 180 `videos_watched` por semana, 181 carimbo de pilula por
  canal, 182 config de programa na trilha (Modo Personalizado), 183 DISC contextual no pulso.
- **Aplicar**: `node --env-file=.env.local scripts/apply-migration.mjs migrations/NNN-x.sql`
  (driver `pg` + `DATABASE_URL`). O MCP Supabase e **read-only**; nao existe `supabase db push`.
  Detalhe: `docs/SCHEMA-PROCESS.md` e a skill `/migrations`.

## Pontos de atencao

- **RLS nao protege o app.** Ele roda 100% `service_role`, que tem `BYPASSRLS` — le cross-tenant mesmo
  com policies ligadas. O isolamento e responsabilidade do **codigo**: `tenantDb(empresaId)` sempre, e
  os guards de CI (`tenant-read-guard`, `tenant-mutation-guard`, `service-role-guard`,
  `use-server-internal-guard`) cobram. Allowlist so encolhe — adicionar entrada pra "passar o CI" e
  exatamente o bug que o guard existe pra pegar.
- **Todo export de arquivo `'use server'` e um endpoint HTTP.** Caminho headless (script, cron, task)
  chama um nucleo em `lib/`, nunca uma flag de bypass na action.
- `proxy.js` roteia por subdominio **e** e o unico lugar onde o cookie de sessao e gravavel (o refresh
  vive la; `cookies()` do RSC e read-only).
- Secrets so em `.env.local` e Vercel. **O repo e PUBLICO** — nunca versionar relatorio de
  vulnerabilidade ABERTA.
- Tasks do Trigger.dev exigem `npx trigger.dev deploy` manual (o path com espaco quebra o CLI —
  receita em `docs/`).

## Onde navegar

| Caminho | O que e |
|---|---|
| `app/` | rotas App Router (`admin/`, `api/`, `dashboard/`, `representante/`, `proposta/`) |
| `actions/` | server actions; `ai-client.ts` e o wrapper unico de IA |
| `lib/tenant-db.ts` | isolamento multi-tenant (ponto de entrada obrigatorio) |
| `lib/season-engine/` | motor das temporadas (trilha, kit, piloto, arguicao, fechamento) |
| `lib/scoring/` | motor de fit/adequacao (`calcularFitUnificado`, `spec_version`) |
| `lib/video/`, `trigger/`, `worker-hetzner/` | pipeline de video |
| `migrations/` | schema (sequencial, aplicado por script) |
| `tests/unit/` | vitest (48 arquivos), inclui os guards de seguranca |
| `docs/` | **PIPELINE-TRILHA** (mapa do produto), **FMEA-PIPELINE** (modos de falha), SECURITY-STATUS, CATALOGO-PROMPTS-IA, CUSTO-QUALIDADE, ORCAMENTO, MODO-PILOTO, KIT-SEMANAL, PORTAL-REPRESENTANTE |
