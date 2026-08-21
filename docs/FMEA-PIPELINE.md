# FMEA — modos de falha do pipeline da trilha

> ## ⚠️ 27/07/2026 — por que este documento não bastou, e o que passou a existir
>
> Em 27/07 quatro problemas morderam a entrega da Ibipeba. **Três já estavam escritos
> aqui**: o texto da pílula prometendo formato inexistente (§2, camadas 6–7), o carimbo
> sobrevivendo à falha de envio (§1.2) e os resolvedores gêmeos divergindo em `url`
> (§3, risco 9). O diagnóstico estava certo e completo — e não protegeu ninguém,
> porque **nada rodava sozinho**. Um check que só um humano dispara é documentação.
>
> O que mudou: **`lib/pipeline-health/`** — checagens que rodam por cron, gravam série
> histórica em `pipeline_health_runs` e alertam por e-mail.
>
> | Modo | Quando | O que responde |
> |---|---|---|
> | `preflight_entrega` | 10:00 UTC (~25h antes do envio das 11:00) | "a pílula de amanhã está pronta, e o que ela promete existe?" |
> | `postflight_entrega` | 11:45 UTC (45 min APÓS o disparo) | "o que dizia que ia sair, saiu?" |
> | `health_estrutural` | 06:30 UTC | duplicatas, presos, órfãos — com **tendência**, não foto |
> | `horizonte_kits` | segunda 09:00 UTC (semanal) | "o que as PRÓXIMAS 4 semanas vão pedir e ainda não existe?" |
>
> ⚠️ **Nenhum desses crons tinha rodado até a auditoria de 27/07 à noite** (`pipeline_health_runs`
> vazia) e **`ADMIN_EMAILS` não existia em nenhum ambiente** — o alerta cairia no
> `console.error('ALERTA CRÍTICO SEM DESTINO')`. Env criada e os 4 modos exercitados à mão
> (`scripts/_health-check.ts <modo>`) na mesma auditoria. Ver o item 10 da priorização.
>
> **Por que o horizonte é um modo à parte** (27/07): os outros três olham amanhã, hoje e
> o estoque. Nenhum responde pela produção — e 25h dão tempo de reenviar um e-mail, não
> de PRODUZIR (kit leva ~5min por DISC). A trilha troca de BLOCO DE COMPETÊNCIAS ao longo
> do programa, e o bloco novo entra sem kit nenhum: medido no Ibipeba, 42 DISC faltando
> para a semana 5 com o piloto na semana 3. Ver **F-I11**.
>
> As regras são funções puras em `regras.ts`, testadas por mutação
> (`tests/unit/pipeline-health-regras.test.ts`). Cada uma nasceu de uma falha medida,
> e o teste guarda os DOIS sentidos: dispara quando o problema existe e fica calada
> quando não existe — check que sempre acusa vira ruído e é desligado.
>
> 🔴 **O pós-voo já foi um alarme MENTIROSO, e a causa não foi a regra — foi a hora** (17/08/2026).
> Ele rodava dentro do mesmo request do `trigger_diario`. Isso valia enquanto o trigger enviava;
> desde que virou **dispatcher** (fan-out de uma task QStash por empresa, 04/08), passou a medir o
> ENFILEIRAMENTO: em 17/08 o run das 11:00:21 gritou *"Nenhum WhatsApp saiu hoje"*, *"Nenhum e-mail
> saiu hoje"* e *"36 pessoas não receberam por canal nenhum"* — enquanto as 36 pílulas eram
> entregues entre 11:00:28 e 11:00:43, todas `delivered`. Mesmo padrão em 03/08.
> **O timing já estava escrito num comentário do `app/api/cron/route.ts`** ("este postflight roda
> logo após o enfileiramento") e o alarme continuou disparando assim mesmo: *aviso em comentário não
> é mecanismo*. Correção em duas camadas — cron próprio às 11:45 e, no código,
> `MINUTOS_MINIMOS_APOS_DISPARO`: rodando cedo demais o pós-voo devolve
> `postflight-cedo-demais` (aviso) em vez de inventar uma pane. Guard novo liga os dois arquivos:
> `tests/unit/security/cron-agendado-existe.test.ts` (toda action agendada tem case, e o pós-voo vem
> ≥30 min depois do disparo). Alarme que grita num dia normal é pior que alarme ausente: ensina a
> ignorá-lo justamente antes do dia em que ele estiver certo.
>
> **A R12 é a única que depende de I/O EXTERNO** (`inspecionarCloudApi`, no estrutural), e
> a exceção tem motivo: ela cobre o canal de ENTRADA do WhatsApp, que não deixa rastro no
> banco quando cai. A Meta desativa a inscrição do webhook por conta própria, e num número
> da Cloud API **não existe aplicativo** — a mensagem não fica pendente, some. Medir isso
> por volume seria inútil: "zero recebidas em 24h" é o estado normal do canal (uma mensagem
> no total até 15/08/2026), então a regra ficaria muda para sempre, inclusive na queda. A
> decisão continua pura; só a coleta pergunta à Meta (`subscribed_apps` + `quality_rating`).
>
> **A regra de ouro da coleta:** a previsão passa pelo MESMO código da entrega
> (`precarregarKits` + `overlayKitNaSemana`). Reimplementar "o que a pessoa vai
> receber" produz um check que concorda consigo mesmo e diverge da realidade — erro
> cometido nesse mesmo dia, quando um diagnóstico via `resolverKitDaSemana` acusou
> "34 entregas só com áudio" enquanto a entrega real servia os 3 formatos.
>
> **Três coisas que o próprio esforço de instrumentar revelou** (todas corrigidas):
> 1. `publishToQStash` (`cron-jobs.ts:456`) dava `return` quando faltava
>    `QSTASH_TOKEN`, e o chamador seguia para `pilulas++` + carimbo: o WhatsApp da
>    coorte inteira morria em silêncio com o banco dizendo que saiu. O gêmeo em
>    `whatsapp-lote.ts:18` sempre lançou — dois caminhos, comportamentos opostos.
> 2. `lib/phone.ts` usava `libphonenumber-js/max`, cuja metadata chega como
>    `{default}` sob `tsx` — o parse lançava, o catch devolvia `null` e **todo**
>    telefone virava inválido em silêncio. Deu 36 falsos positivos no primeiro
>    pré-voo. Agora a metadata é explícita e há um canário (`metadataSaudavel()`).
> 3. `triggerDiario` não tinha try/catch por empresa: uma exceção abortava o run e
>    as empresas seguintes ficavam sem envio, sem retry do Vercel Cron.
>
> **F-C5, medido de manhã e fechado à tarde** (27/07): o parágrafo que havia aqui dizia que
> consolidar as 22 células duplicadas era "trabalho próprio, não efeito colateral de uma
> migration" — e foi exatamente isso que a **migration 188** fez: migra os personalizados
> para a célula vencedora com **guarda que aborta** se algum 'done' ficasse sem equivalente,
> depois apaga as cópias e cria o UNIQUE parcial. Resultado medido: 113 → 76 células, 451 →
> 321 personalizados, 3 → 0 presos. Re-medido na auditoria da noite: **0 duplicatas vivas**
> (as 46 linhas `error` são resíduo permitido pelo índice parcial e invisíveis à entrega).


Análise de modos de falha, efeitos e resolução do pipeline descrito em
`docs/PIPELINE-TRILHA.md`. **Cada falha foi lida no código** (17/07/2026), não inferida;
onde o estado já existe em produção, está medido no tenant Ibipeba.

**Legenda de status:**
- 🔴 **JÁ-OBSERVADO** — o estado já existe no banco de produção (medido).
- 🟠 **PROVÁVEL** — dispara em operação normal (2 admins, regen, cadência).
- 🟡 **RARO** — exige coincidência (corrida estreita, crash na janela certa).
- 🔵 **SÓ-EM-ESCALA** — inofensivo hoje, quebra a partir de N colaboradores.
- ⚪ **LATENTE** — o caminho existe mas hoje é inatingível (protegido por outra camada).

> Escala não é coberta em detalhe aqui — `docs/ESCALA-50K.md` já mapeia os gargalos
> por-pessoa (WhatsApp, TTS, connection pool). Este doc foca **correção** e **integridade**,
> com a dimensão de escala onde ela vira modo de falha novo.

---

## 0. Verdade-terreno — o que já disparou (medido no Ibipeba, 17/07)

Os modos de falha abaixo **não são hipóteses**. Já estão gravados:

| Estado medido | Contagem | Interpretação |
|---|---|---|
| `videos_gerados` em `error` | **38** (20 células reais, 18 spikes) | erros transitórios (HeyGen timeout, `terminated`, TTS 400, render sem box) cobertos por retries; linhas mortas acumulam |
| células com vídeo `done` **duplicado** | **18** (uma com **9 cópias** do mesmo mb×cargo×disc) | corrida SELECT-then-INSERT sem UNIQUE (F-C5) + re-disparos — cada cópia é um render HeyGen desperdiçado |
| `micro_conteudos` genéricos **duplicados** | **6 tuplas** (até 4× a mesma) | falta UNIQUE (F-C6) + kit apagado sem apagar conteúdo antes (FK SET NULL, F-I3) |
| `micro_conteudos` inativos | 9 | áudio/vídeo nascem `ativo=false` (esperado) |
| `videos_personalizados` em error/processing | 9 + 5 | resíduo do bug de env corrigido em `a8464fa` (25/06) — pessoas veem deck sem nome |
| `kit_briefs` ungrounded (sem MB) | 1 | "Desenvolvimento docente" (23/06), só D, não serve trilha ativa |

Limpo (0): assessments com nota null, conteúdo ungrounded, nota fora de [1,4], trilha sem plano,
briefs duplicados por tupla.

> **Re-medição de 27/07 (noite), após as correções do dia:** células `done` duplicadas: **0**
> (F-C5 fechado, mig 188) · `videos_personalizados`: 320 done / 1 error · `micro_conteudos`
> duplicados: **0** (F-C6 fechado na mesma noite, mig 190 — eram 19 grupos na auditoria da
> tarde: dedup de 30 linhas + 17 planos reapontados + UNIQUE parcial) ·
> `kit_briefs` duplicados: 0 (UNIQUE na mig 185). As contagens de 17/07 acima ficam como
> histórico do episódio.

---

## 1. Concorrência & corrida

### F-C1 · Regeneração concorrente sobrescreve o plano (lost-update) ✅ (fechado 27/07)
- **Gatilho (histórico):** 2 admins, ou lote + clique, regeneram a mesma trilha. O header fazia
  SELECT-then-UPDATE **sem lock nem versão**; `trilhas` tem `UNIQUE(empresa_id,colaborador_id)`
  (baseline:2035) mas o código não a usava como upsert.
- **Efeito:** last-write-wins no `temporada_plano`; `data_inicio` reempurrado 2×; progresso zerado.
  Retornava `ok:true`.
- **Correção (27/07):** o header virou **upsert único com `onConflict:'empresa_id,colaborador_id'`**
  (`trilha-core.ts:718-728`, mesmo padrão de `development_blueprints`), com erro propagado — o
  UPDATE-talvez-0-linhas e o INSERT-que-colide silenciosos acabaram. O SELECT segue só para LER
  `data_inicio`/`numero_temporada` (F-I1 preservado).
- **Guarda:** `tests/unit/trilha-header-upsert.test.ts` (4) — validado por mutação (voltar para
  UPDATE simples derruba os 4).

### F-C2 · Plano e progresso de runs diferentes (delete+insert não-atômico) ✅ (fechado 27/07, com ressalva)
- **Gatilho (histórico):** regen concorrente. `temporada_semana_progresso` fazia `delete()` + `insert()`
  em statements separados, **sem capturar erro**. Interleave `A.delete→B.delete→A.insert→B.insert`: o
  insert de B colidia no `UNIQUE(trilha_id,semana)` e **falhava inteiro, silenciosamente**.
- **Efeito:** `temporada_plano` refletia run B, `temporada_semana_progresso` refletia run A — "título ≠
  blocos" um nível acima (plano ≠ progresso), com `ok:true`.
- **Correção (27/07, `ab3cf043` + `5a405965`):** delete+insert virou **upsert por `(trilha_id,semana)`**
  com erro **propagado** (`trilha-core.ts:763-765`). Bônus: o payload leva só o estrutural —
  reflexões/feedbacks/tira-dúvidas/consumo do colaborador sobrevivem à regeneração; o `delete` que
  sobrou (`:773`) remove só semanas órfãs **vazias** (`classificarOrfas`).
- **Ressalva (segue em aberto, menor):** plano (`:718-726`) e progresso seguem em **statements
  separados** — a função RPC transacional sugerida como ideal **não** foi implementada. O modo de
  falha descrito (insert colidindo em silêncio) está fechado; atomicidade multi-statement, não.
- **Guarda:** `tests/unit/regeneracao-nao-destrutiva.test.ts` cobre os helpers de classificação —
  ⚠️ nenhum teste trava o **payload do upsert** em si; a garantia dele vem do código.

### F-C3 · Duplo-envio de pílula (TOCTOU nos carimbos) ✅ (fechado 27/07, com ressalva)
- **Gatilho (histórico):** `triggerDiario` sobreposto a si mesmo (retry do Vercel num timeout, ou
  disparo manual concorrente). O check lia `ultima_pilula1_em` em T0 e só carimbava **depois** de
  publicar, sem `WHERE` condicional. Duas execuções liam `null`, ambas enviavam.
- **Efeito:** pílula 2× (WhatsApp + e-mail); pior, o **avanço de semana** aplicado 2× → **pulava
  conteúdo**.
- **Correção (27/07, `ab3cf043`):** **lock diário de execução** — tabela `cron_execucoes` (mig 187,
  `PRIMARY KEY (job, dia)`) + `lib/cron-lock.ts` (`INSERT ... ON CONFLICT DO NOTHING`; reclama lock
  de execução morta <30min). `triggerDiario` adquire **antes** do loop (`cron-jobs.ts:296-301`).
  Escolhido lock em vez de stamp-then-send porque inverter tornaria o envio at-most-once — trocaria
  duplicar por PERDER, e perda silenciosa é o que sobra neste pipeline. **Fail-open deliberado** se
  o lock falhar por infra: recusar envio por problema de infra deixaria a coorte sem pílula, pior e
  não recuperável (cron roda 1×/dia). Provado com concorrência real em `scripts/_test-cron-lock.ts`:
  5 tentativas simultâneas → 1 adquire.
- **Ressalva (segue em aberto):** os legados `triggerSegunda`/`triggerQuinta` (disparo manual)
  **não** usam o lock — seguem sem guarda nenhuma.
- ⚠️ **Não observado em produção ainda:** `cron_execucoes` tinha **0 linhas** na auditoria da noite —
  o `trigger_diario` de 27/07 rodou (11:00 UTC) antes do deploy do lock. Primeira aquisição real:
  28/07 11:00 UTC.

### F-C4 · Overlay desligado em silêncio → trilha inteira sem core ✅ (fechado 27/07)
- **Gatilho (histórico, causa-raiz do episódio de 16/07):** `precarregarKits` **ignorava o `error`**
  das 3 queries e retornava **Map vazio mas TRUTHY**. Se o PostgREST devolvia `{data:null, error}`
  sem lançar (timeout, pool esgotado, schema reload), o overlay via cache truthy → `.get()→undefined`
  → **mantinha o conteúdo do build para TODAS as semanas** (desafio genérico + `core_id` stale).
- **Efeito:** a personalização da COORTE INTEIRA sumia de uma vez, sem erro e sem telemetria (o
  `catch` de `temporadas.ts` engolia).
- **Correção (27/07, `ab3cf043`):** `precarregarKits` **propaga o erro** (`throw` com mensagem
  diagnóstica, `entrega-semana.ts:87-106`) — o chamador cai no resolvedor live, que degrada por
  semana. "Não há kits" (Map vazio legítimo) ≠ "não consegui saber se há kits" (falha de infra). O
  `.catch` de `temporadas.ts:512-516` passou a **LOGAR** em vez de engolir.
- **Guarda:** `tests/unit/kit-overlay-falha-fechada.test.ts` — 8 testes nos DOIS sentidos (falha em
  cada uma das 3 tabelas → rejects; dados vazios sem erro → Map vazio sem lançar), validado por
  mutação.

### F-C5 · `videos_gerados` duplicados por célula ✅ (fechado 27/07, verificado no banco)
- **Gatilho (histórico):** `resolverCelulaVideo`/`dispararVideoDoKit` faziam SELECT-then-INSERT;
  **`videos_gerados` não tinha UNIQUE** por célula. 2 disparos concorrentes → 2 rows + 2 renders
  pagos. O número crescia sozinho: 18 em 17/07, 22 em 27/07 de manhã.
- **Efeito:** decks duplicados (render HeyGen pago por cópia) e **contaminação de toda medição** —
  as cópias eram invisíveis à entrega (`.order(created_at,desc).limit(1)`) mas seus personalizados
  contavam, produzindo "travado há 13 dias" para quem TINHA vídeo, e inflando a reconciliação F-V1
  (83 pessoas medidas em vez de 25).
- **Correção (27/07, `b91b546f`, mig 188):** consolidação com **guarda que aborta** se algum
  personalizado 'done' ficasse sem equivalente na célula vencedora (a mais recente não-error), e
  depois **`UNIQUE(modulo_base_id, COALESCE(empresa_id), COALESCE(cargo), COALESCE(disc_dominante))
  parcial `WHERE status <> 'error'`** — permite reprocessar após erro, barra duplicata viva.
- **Medido na auditoria da noite (27/07):** 76 células vivas, **0 duplicadas vivas**; 46 linhas
  `error` são resíduo permitido pelo índice parcial e invisíveis à entrega; `videos_personalizados`:
  320 done / 1 error. Bate com o commit (113 → 76 células, 451 → 321 personalizados, 3 → 0 presos).

### F-C6 · `micro_conteudos` duplicados ✅ (fechado 27/07, verificado no banco)
- **Gatilho (histórico):** **sem UNIQUE** em `micro_conteudos`. Idempotência só em código
  (`gerarConteudoIA:126-135`, SELECT-then-INSERT) — geração concorrente do mesmo
  `(empresa, competência, descritor, formato, cargo)` inseria 2+ rows. Cresceu: 6 tuplas em
  17/07 → **19 grupos** medidos na auditoria de 27/07 (13 globais/demo, 6 Ibipeba, até 4×).
- **Correção (27/07, mig 190):** dedup ANTES da constraint (`scripts/_dedup-micro-conteudos.mjs`):
  **30 linhas apagadas** em 19 grupos. Vencedor por **referenciada > score > versão > recente**
  (score idêntico ao do motor, `build-season.ts:235-242`) — e **17 `temporada_plano` reapontados**
  antes do delete, porque 10 perdedores eram referenciados como `core_id`/`formatos_disponiveis`
  (apagar direto = core órfão). Backup: `backups/micro-conteudos-dedup-f-c6-*.json` (linhas +
  planos originais). Depois, **`uq_micro_conteudos_core`**: UNIQUE parcial
  `(COALESCE(empresa_id), competencia, COALESCE(descritor), formato, COALESCE(cargo))
  WHERE kit_id IS NULL` — espelha EXATAMENTE a query de idempotência; kit tem variantes por
  DISC no mesmo tuple e fica fora (variante ≠ duplicata).
- **Verificado no banco (27/07 noite):** índice criado, **0 duplicados restantes**.
- **Guarda:** `tests/unit/conteudo-idempotencia-kit.test.ts` — trava a cobertura exata das
  colunas da constraint na query de idempotência (constraint e checagem divergindo = insert
  que passa na checagem e explode no banco). **Validado por mutação** (remover `.eq('formato')`
  do código derruba o teste).

### F-C7 · `kit_briefs` duplicados ✅ (fechado 27/07 — era latente, 0 medidos)
- **Gatilho (histórico):** SELECT-then-INSERT + **sem UNIQUE**. Dois jobs do mesmo tema (lote de
  coorte + ação manual) → 2 briefs. Protegido **dentro** de um job, não entre jobs.
- **Correção (27/07, mig 185):** UNIQUE por
  `(empresa_id, competencia, descritor, nivel_min, nivel_max, cargo, contexto)` + upsert. Medido na
  auditoria da noite: **0 duplicados**.

---

## 2. Integridade de dados

### F-I1 · `data_inicio` resetado em toda regeneração ✅ (fechado 27/07)
- **Gatilho (histórico):** `data_inicio: nextMondayISO()` no payload de UPDATE **e** INSERT.
- **Efeito:** trilha em andamento na semana 8 voltava pro calendário zero + progresso recriado.
- **Correção (27/07, `ab3cf043`):** `data_inicio: existente?.data_inicio || nextMondayISO()`
  (`trilha-core.ts:713`) — só a 1ª gravação calcula; o UPDATE preserva.

### F-I2 · `regerarSemana` não re-seleciona conteúdo nem normaliza ✅ (fechado 27/07)
- **Gatilho (histórico):** `regerarSemana` reescrevia só desafio/missão/cenário por IA, mantinha
  `core_id`/`formatos_disponiveis`/`descritor` do slot antigo e gravava o JSONB direto, sem
  `normalizarSemanas` — perpetuava `core_id` órfão e "título ≠ blocos".
- **Correção (27/07):** reparo de conteúdo roteado pelo MOTOR — `repararCoreOrfaoDaSemana`
  (`build-season.ts:230-311`, vizinha da `selecionarConteudoDaSemana`, que é quem escolhe — nada de
  reimplementar scoring). Critério: re-seleciona só quando o `core_id` é null (`fallback_gerado`)
  ou **não está no pool servível de hoje** (ativo, não-kit, mesma competência); `core_id` válido
  **não é trocado** — a pessoa já viu. `normalizarSemanas(plano)` roda antes de gravar; a mensagem
  enganosa foi corrigida (descritor null ≠ "semana de avaliação"). A preservação de 27/07
  (reflexão/feedback/tira-dúvidas/status) ficou intocada.
- **Guarda:** `tests/unit/reparar-core-orfao.test.ts` (5) + `regerar-semana-conteudo.test.ts` (5) —
  validado por mutação (trocar a seleção do motor por "pega o 1º candidato" derruba 3 testes).

### F-I3 · FK destrutivas — deletar MB apaga os vídeos 🟡
- **Gatilho:** `videos_gerados.modulo_base_id` é **`NOT NULL + CASCADE`** (mig 138:6) — o único do
  pipeline de conteúdo. Deletar um MB → cascateia decks → cascateia `videos_personalizados`.
- **Efeito:** pessoas perdem o vídeo, silenciosamente.
- **Resolução:** **nunca deletar MB publicado; despublicar** (`status`). Se precisar deletar, mudar
  a regra para RESTRICT (forçar limpeza explícita dos decks antes). Documentar no runbook de MB.
- **Vizinhos:** `micro_conteudos.modulo_base_id` → SET NULL (vira ungrounded silencioso);
  `micro_conteudos.kit_id` → SET NULL (**o vazamento de DISC**, F-I4).

### F-I4 · `kit_id` SET NULL → conteúdo de DISC vaza no build ✅ (fechado 27/07 — sem DDL)
- **Gatilho (histórico):** deletar/regerar kit → `micro_conteudos.kit_id=null` (mig 142:45) → o build
  filtrava só `!kit_id` → conteúdo escrito p/ UM DISC entrava no pool (cego a DISC). Medido 16/07:
  23 de 648 entregas.
- **Correção (27/07):** a coluna `micro_conteudos.disc` **já existia** (mig 142:47, denormalização
  da entrega, 1ª letra — a célula de custo da decisão F-I8) e, por não ser FK, **sobrevive ao
  SET NULL** — verificado em produção: 243/243 conteúdos de kit a têm. O reforço estrutural virou
  filtro DUPLO: `conteudosDoBuild` e o pool de `montarSemanaConteudo` exigem
  **`kit_id IS NULL AND disc IS NULL`** (`build-season.ts:318-329,585-600`). Nenhuma migration
  necessária (a especificação original pedia coluna `origem_disc` nova — redundante com `disc`).
- **Efeito imediato no deploy:** os **3 órfãos vazando HOJE no Ibipeba** (áudio C "Priorização
  estratégica", áudio I "Definição de metas", texto C "Priorização estratégica") saem do pool sem
  backfill nenhum. Ressalva: trilhas já montadas (`temporada_plano` gravado) não são refeitas —
  vale para builds novos/rebuilds.
- **Guarda:** `tests/unit/conteudo-isolamento-disc.test.ts` (bloco F-I4) — validado por mutação.
- **Follow-up anotado:** `anotarOrigemDisc` (`temporadas.ts:608-637`) resolve DISC via join em
  `kits`, então subnotifica órfãos; ler `disc` ali fecharia o diagnóstico.

### F-I5 · `development_blueprints` sem FK → órfãos ✅ (fechado 27/07, mig 191 aplicada)
- **Gatilho (histórico):** mig 175 não criou FK para `colaborador_id`/`empresa_id` — deletar
  colab/empresa **não** apagava o blueprint; `auditarBlueprint` de órfão falhava no gate
  "colaborador não encontrado".
- **Correção (27/07, mig 191, aplicada):** `FK(colaborador_id) ON DELETE CASCADE` +
  `FK(empresa_id) ON DELETE CASCADE`. **Medido antes de aplicar: 0 órfãos** (37 blueprints, todos
  com colab e empresa vivos — dry-run de `scripts/_limpar-blueprints-orfaos.mjs`), então a
  constraint entrou direto, sem delete prévio.

### F-I6 · Descritor com 2 nomes — blueprint dedupa (perde nota), legado duplica (gasta slot) ✅ (fechado 27/07, backfill aplicado)
- **Gatilho (histórico):** o assessment guardava `"COO03_D5 — X"`, o blueprint `"X"`. No caminho
  blueprint→trilha a dedup por Map **sobrescrevia** uma nota; no legado, 2 semanas no mesmo
  descritor. A `UNIQUE(colaborador_id,competencia,descritor)` não pegava (strings diferentes).
- **Correção (27/07):** escrita normalizada com o normalizador EXISTENTE (`stripCodigoDescritor`,
  `lib/descritores.ts` — nenhum 4º normalizador). A IA4 (`fase3.ts:328`) **já** normalizava; o
  buraco era o grid admin (`assessment-descritores.ts`: salvar e deletar nota). Fixture congelado
  da demo (`reset-acme-demo.ts`) **não** foi normalizado de propósito (dado histórico congelado,
  colidiria na UNIQUE dentro do próprio batch).
- **Backfill (27/07, aplicado — `scripts/_backfill-descritor-canonico.mjs`):** 784 linhas, 122 com
  prefixo → **122 updates + 6 deletes** de colisão (mesmo colab, critério: `assessment_date` mais
  recente vence; deletes ANTES dos updates para não violar a UNIQUE). Backup:
  `backups/descritor-canonico-backfill-f-i6-*.json`.
- **Guarda:** `tests/unit/assessment-descritor-normalizacao.test.ts` (4) — validado por mutação.

### F-I7 · Competência acento-divergente bloqueia o blueprint em silêncio 🟡
- **Gatilho:** 3 normalizadores divergentes: `core.ts:31` `normNome` **não tira acento**;
  `audit.ts:52` e `to-descriptors.ts:53` tiram. Foco grava "Comunicação", assessment grava
  "Comunicacao" (import sem cedilha) → `resolverFilaBlueprint100:63` acha mapeamento incompleto →
  colaborador **nunca entra na fila**; ou gate 7 "Mapeamento incompleto" apesar do assessment existir.
- **Efeito:** "por que fulano não gera blueprint?" sem causa visível.
- **Resolução:** **um único normalizador acento-insensível compartilhado** (`normNome` = `normDescritor`
  sem o strip de prefixo). Consolidar os 3.

### F-I8 · DISC de 1ª-letra (kit/vídeo) vs 2-letras (PDF) ✅ (decisão 27/07 — é design, não bug)
- **Fenômeno:** dominante de 2 letras é o normal ("DI", "SC", "ID"). `derivarArquetipo` (PDF/relatório)
  usa as **2 letras**; kit/desafio/áudio/vídeo usam **`charAt(0)`** (`entrega-semana.ts`, `gerar-video.ts`,
  etc.).
- **Decisão (27/07, Rodrigo): MANTER ASSIM.** A geração de conteúdo usa **só a 1ª letra de propósito**:
  são 4 células DISC em vez de até 16 combos — menos kits, menos renders, menos custo. O relatório/PDF
  usa o combo completo porque é **grátis** (derivação em código, sem geração extra) e mais preciso.
  A divergência entre camadas deixa de ser acidente: é a política.
- **Regra que sai daí:** ao criar qualquer camada NOVA de conteúdo gerado por IA, ancorar na **1ª letra**
  (célula de custo); camadas derivadas em código (relatórios, arquétipos, textos estáticos) podem usar
  o combo completo. Não "corrigir" o charAt(0) dos kits — dobraria o custo de produção.

### F-I9 · Semana degenerada sem `conteudo` — UI está protegida ✅ (verificado)
- **Gatilho:** slot de conteúdo sem descritor alocado → `{descritor:null, status:'bloqueada'}` **sem
  objeto `conteudo`** (`build-season.ts:290-297`).
- **Verificado:** o week page trata — `conteudo ? [...] : []` (page.tsx:139) e optional chaining
  (`semana?.conteudo?.formato_core`, `entrega.conteudo?.desafio_texto`). Não quebra.
- **Risco residual:** a pessoa vê uma semana **vazia** (bloqueada, sem conteúdo) — degradação, não
  crash. Se aparecer em produção, é sintoma de seleção incompleta (blueprint com menos descritores
  que slots). **Resolução:** o build poderia converter slot de conteúdo vazio em reflexão em vez de
  emitir semana bloqueada. Baixa prioridade.

### F-I10 · Empresa-rede: `.limit(1)` em `ppp_escolas` aplica UMA escola à rede inteira ✅ (fechado 27/07)
- **Gatilho:** empresa-rede tem **1 PPP por escola** (Medido 26/07: Ibipeba **11 PPPs extraídos, 86
  valores**; todos os outros 5 tenants com PPP têm 1). Qualquer leitura `.eq('status','extraido')
  .order('extracted_at' desc).limit(1)` devolve **uma escola sorteada pela data de extração** e a
  trata como a rede.
- **Efeito:** a régua de competências do município inteiro é autorada com o contexto/valores de uma
  escola arbitrária. Medido: os valores que entravam no IA2 de Ibipeba eram os 8 de uma **creche**
  ("Respeito às infâncias", "Indissociabilidade entre cuidar e educar") — aplicados a todos os cargos
  da rede. Falha **silenciosa**: nada erra, o gabarito só fica calibrado na escola errada.
- **Resolução (o padrão):** consolidar. `lib/season-engine/kit/contexto-empresa.ts` já fazia isso
  para o Kit (1 PPP → direto; N → síntese municipal por IA, cacheada em `empresas.kit_contexto`).
- **Status por consumidor:**
  - ✅ `buscarValores` (`lib/ia2-gabarito.ts`) — corrigido 26/07 (`062dca13`): consolidação
    **determinística** por frequência entre escolas (sem IA — são strings curtas), teto de 10, ordem
    estável porque o prompt é cacheado. Guarda: `tests/unit/ia2-valores-rede.test.ts`.
  - ✅ `buscarContextoPPP` (`lib/ia2-gabarito.ts`) — 27/07. Alimenta IA1, IA2 e o cenário de rede do
    IA3; insumo maior que o de valores (4000 chars vs. 10 strings). Resolve **por número de PPPs**:
    `pppEscolaId` → esse PPP · **1 PPP → seções curadas, idêntico ao anterior** (os 5 tenants de 1 PPP
    não mudam de prompt nem pagam IA — trocar o formato deles seria mudança de qualidade não medida)
    · **N → `resolverContextoEmpresa`**, a síntese municipal cacheada em `empresas.kit_contexto`
    **compartilhada com o Kit** (a mesma pessoa passa a ver régua e kit sob a MESMA lente).
    Assinatura virou objeto (`{empresaId, pppEscolaId?}`) de propósito: o antigo 2º parâmetro era
    `empresaNome` **não usado**, e trocar `string` por `string` deixaria call site errado passar pelo
    compilador. Guarda: `tests/unit/ia2-contexto-ppp-rede.test.ts` (validado por mutação).
  - ✅ `montarCheckIA3Prompt` (`lib/ia3-cenarios.ts`) — 27/07. O check dual auditava com `.limit(1)`
    **sem ordem definida**: numa rede o auditor podia ver o PPP de uma escola e o gerador de outra —
    reprovando contexto que ele mesmo não estava vendo. Agora passa pelo mesmo resolvedor, com o
    `ppp_escola_id` da row quando o cenário é por escola.
  - ✅ `gerarConteudoFinalPersonalizado` (`actions/conteudos.ts`) — 27/07, junto com o F-E7. Era a
    **rota de PPP desconectada** do kit (item 3 da tabela de riscos do `PIPELINE-TRILHA.md`): em
    Ibipeba, 54 pessoas recebiam o PDF na lente de uma escola arbitrária enquanto o kit da mesma
    semana usava a lente municipal.
  - ✅ **IA4** (`actions/fase3.ts` ×2) e ✅ **Cenário B do fechamento** (`actions/fase5/cenarios-b.ts`
    ×3) — 27/07. **Achados pelo guard, não por leitura**: eu havia declarado a classe "fechada nos 4
    consumidores" e o guard apontou 5 sites a mais no primeiro run. Os dois de valores em `cenarios-b`
    eram os piores da série: `.select('valores').limit(1)` **sem `order`** — escola em ordem
    indefinida do Postgres, podendo variar entre execuções na MESMA empresa.
- **Guard de CI:** `tests/unit/security/ppp-rede-guard.test.ts` — falha se uma cadeia de
  `ppp_escolas` reduz a uma linha (`.limit(1)`/`.single()`/`.maybeSingle()`) **sem** dizer qual escola
  (`.eq('id'`/`.eq('escola'`). Sem allowlist: o estoque é zero. Varre o **disco** (não `git ls-files`),
  então arquivo novo ainda não commitado também é conferido. Recorte: `actions`, `app`, `lib`,
  `trigger` — `scripts/` fica fora (diagnóstico one-off não entrega nada a ninguém).
- **Lição de método:** 9 sites da mesma classe em 4 leituras humanas independentes do código. Enquanto
  a regra era só texto no `CLAUDE.md`, cada release nova reintroduzia. **Grep de padrão perigoso vira
  teste, não parágrafo.**

### F-I12 · Módulo-Base com TÍTULO no lugar do descritor → conteúdo ancora no assunto vizinho ✅ (corrigido 28/07)
- **Gatilho:** o resolver casa o descritor da semana contra `modulos_base_conteudo.descritor`
  (embedding quando há vetor, tokens quando não). Se a extração gravou nesse campo um **título
  editorial** em vez do `nome_curto` da régua, o match exato nunca acontece e a escolha vira ruído.
- **Medido (28/07, Ibipeba):** os **18 MBs** de "Autocuidado × Gestão Escolar" (6 descritores × 3
  níveis) guardavam títulos como "A Calma que se Constrói". Resultado: os 6 descritores colapsaram
  em **2 módulos**, **14 dos 18** micro_conteudos core ficaram ancorados no módulo errado e **2
  módulos nunca foram usados por nada**. O MESMO manuscrito (DIR02) gravou certo em Coordenação
  Pedagógica — a varredura do acervo achou só esses 18 fora do padrão.
- **Efeito:** silencioso e caro. O conteúdo é gerado, tem qualidade de escrita, cita o cargo — e
  fala do assunto ao lado. Nenhuma tela, log ou teste mostra.
- **Por que passou:** o único sinal era o critério no `console.log` do resolver
  (`descritor-parcial-semântico(0.31)` em vez de `descritor-tokens(1.00)`) — visível em quem
  estivesse lendo o log daquela geração.
- **Correção:** gravar o `nome_curto` da régua em `descritor` (o título editorial pertence a
  `titulo`) e **RECALCULAR `descritor_embedding`**. ⚠️ Corrigir só o texto NÃO resolve: o vetor
  antigo tem **precedência absoluta** sobre tokens (`if (queryVec && emb) cosine else tokens`), então
  o embedding do título continuaria mandando — estado pior que o original, porque o texto parece
  certo. Mapeamento confirmado por duas fontes independentes: `conteudo_central` de cada MB e as
  tags de extração (`DIR02_MB01..MB12`, dois por descritor, na ordem D1..D6).
- **Guarda:** **R9** (`checarMbForaDaRegua`) no run ESTRUTURAL do health-check — é check de DADOS,
  não de código, então não cabe num guard de CI que só vê o repositório. Teste:
  `pipeline-health-regras.test.ts` (R9), validado por mutação.
- **Depois de corrigir o MB, o conteúdo já gerado continua errado** — regerar usando o próprio
  resolver como juiz (comparar `modulo_base_id` gravado com o que ele escolheria agora) para mexer
  só no que está mal ancorado. Medido: 14 refeitos, 4 preservados.

### F-I13 · Embedding do acervo nunca existiu (Voyage a 3 RPM) — seleção "semântica" era token-matching ✅ (fechado 28/07)
- **Medido (28/07):** **198 de 216** MBs publicados (91,7%) estão **sem `descritor_embedding`**. A
  conta Voyage estava sem método de pagamento → **3 RPM / 10K TPM**; `embedText`/`embedQuery` não têm
  cache, retry nem backoff, e o resolver engole a exceção (`catch { queryVec = null }`). Em qualquer
  lote (42 DISC em 8 min) a seleção semântica ficava desligada **de fato**, sem erro nem telemetria.
- **Efeito:** para descritor com nome idêntico ao do MB, tokens acerta (1.00) e ninguém nota. Para
  paráfrase — ou para F-I12 — a escolha degrada em silêncio. Também afeta `lib/rag.ts` (busca e
  indexação da base de conhecimento).
- **Resolvido (28/07):** crédito adicionado (medido: 6 chamadas em 1,7s, 0 erro) · `embedText` ganhou
  **cache por processo** (o mesmo descritor é reconsultado 3 formatos × N DISC por tema) + **2
  retentativas** em erro transitório + contador de falhas com log alto · **backfill dos 198** MBs.
  Guarda: `tests/unit/embeddings-cache-retry.test.ts`.
- ⚠️ **O backfill revelou uma regressão que só a medição pegaria:** fotografei a decisão do resolver
  para os 48 casos do acervo ANTES e DEPOIS. Uma mudou — "Formação básica de preço" (MEI) passou a
  ancorar em "Identificação de custos". Causa: **o cosseno de dois textos IGUAIS dá ~0,9, não 1,0**,
  então 0,1 de diferença na nota da auditoria passou na frente do match exato (que com tokens valia
  1.00 e era imbatível). Corrigido na raiz: **nome idêntico normalizado → relevância 1, antes de
  qualquer cosseno**. A semântica serve para PARÁFRASE, não para desempatar o que já é igual.
  Depois: 48/48 decisões iguais. Guarda: `tests/unit/modulo-base-match-exato.test.ts`.
- O rótulo do critério passou a distinguir `descritor-exato` de `descritor-semântico` e
  `descritor-tokens` — não é cosmético: foi lendo esse log que o F-I12 apareceu, e ele dizia
  "tokens" no caminho exato.

### F-I11 · Bloco novo de competências entra sem kit — ninguém dispara o que ninguém sabe que falta ✅ (alarme 27/07)
- **Gatilho:** o kit é gerado por **gatilho manual, uma rodada por vez**, e a trilha **troca de bloco
  de competências** ao longo do programa. Os kits das semanas já rodadas existem; o bloco seguinte
  nunca entrou em rodada nenhuma.
- **Medido (27/07, Ibipeba, piloto na semana 3):** os **3 pares (competência × cargo)** que entram na
  semana 5 eram 100% novos — Autocuidado × Coordenação (10p), Autocuidado × Gestão Escolar (15p) e
  Apoio técnico e monitoramento × Gestão Educacional (11p). Kit em **0/36** pessoas, 42 DISC a
  produzir, com 13 dias de prazo. **Nada do que foi autorado nas semanas 1-3 serve** — o par
  competência×cargo muda inteiro.
- **Efeito:** sem kit, a entrega ACONTECE — com o core genérico e desafio placeholder. Ninguém
  reclama, nada erra, nenhuma tela mostra. Perde-se exatamente a personalização por DISC, que é o
  valor do produto.
- **Por que o pré-voo não bastava:** ele avalia a entrega de **amanhã**. Isso dá tempo de reenviar um
  e-mail, não de PRODUZIR: kit leva ~5min por DISC. Detectar tarde equivale a não detectar quando a
  correção é lenta.
- **Resolução:** modo **`horizonte`** do health-check (`lib/pipeline-health`, cron semanal segunda
  09:00 UTC, migration 189). Reusa `levantarPlanoKitsCoorte` — o **mesmo** código que a tela de coorte
  usa para decidir o que gerar; a capacidade de detectar já existia, faltava alguém perguntar. Olha 4
  semanas à frente; **crítico** a ≤14 dias, aviso além disso. O núcleo saiu de dentro da action
  (`actions/kits.ts` só faz gate + enfileirar) porque o cron não tem sessão.
- ⚠️ **A contagem é a parte fácil de errar** — a unidade de esforço é **(tema × DISC)**, contada na
  PRIMEIRA semana que a demanda: um kit serve todas as semanas que pedirem aquele tema. Duas versões
  erradas passaram por plausíveis antes de baterem contra um medidor independente (68 e 97, onde eram
  42). Guardas: `tests/unit/pipeline-health-horizonte.test.ts` e `pipeline-health-regras.test.ts` (R7),
  ambos validados por mutação.

### F-I14 · Request cru de IA fica FORA do fix do wrapper e some na troca de geração ✅ (corrigido 10/08)
- **Gatilho:** `lib/video/gerar-roteiro.ts:47` (antes desta correção) — `fetch` direto para
  `https://api.anthropic.com/v1/messages/batches`, fora de `callAI` e fora de `lib/ai-batch.ts`,
  com `thinking: {type:'enabled', budget_tokens: 8000}` no corpo.
- **Efeito:** o formato `enabled`+`budget_tokens` foi **removido** na geração 5 do Claude (400: *"use
  thinking.type.adaptive and output_config.effort"*). `lib/ai-tasks.ts` apontou `conteudo_video` para
  `claude-opus-5` em 05/08 → toda geração de roteiro passou a estourar 400.
- **Medido:** **0 vídeos gerados de 05/08 a 10/08** (o último foi 28/07; 169 no total). E **0 de 169
  vídeos** no `ia_usage_log` — o request cru também não passava pelo ledger, justamente na chamada
  mais cara do produto.
- **Por que ficou 5 dias invisível — três camadas, não uma:**
  1. o ramo batch é o **default** (`VIDEO_ROTEIRO_MODE !== 'sync' && !forceSync`) e `VIDEO_ROTEIRO_MODE`
     não existe em produção → o caminho quebrado é o que roda;
  2. o `catch` faz `return { error }` **sem cair no síncrono** e sem `registrarDegradacao`;
  3. o insert em `videos_gerados` vem **DEPOIS** do roteiro — falha não deixa linha, e "nada foi
     gerado" é indistinguível de "ninguém pediu".
- **A pegadinha que dá nome ao modo:** em 08/08 o wrapper **aprendeu** o formato novo (`adaptive`) e
  o vídeo **continuou quebrado** — quem monta request cru não passa pelo wrapper e portanto fica fora
  do fix. É o corolário "conserte o que RODA" do `CLAUDE.md`, agora entre *wrapper* e *request cru*.
  Documentar o modo de falha (commit `18c53a13`, 09/08) também não gera vídeo: o arquivo seguiu
  intacto até 10/08.
- **Correção (10/08):** o ramo batch passa por **`submitClaudeBatch`** (`lib/ai-batch.ts`) — SDK
  oficial, **nenhum parâmetro de raciocínio no corpo** (imune por construção à próxima troca de
  geração), cache de system automático e ledger com `feature:'conteudo_video'`. `max_tokens` fica em
  **16k de propósito**: na geração 5 o raciocínio é ligado por padrão e divide o orçamento com o
  texto — dimensionar justo trunca o roteiro no meio.
- **Guarda (validada por mutação):** `tests/unit/integrations/ia-request-cru-guard.test.ts` varre o
  DIRETÓRIO (`actions/ lib/ app/ trigger/ components/`, pega arquivo untracked) e falha se alguém
  falar HTTP direto com `api.anthropic.com` (allowlist **vazia**) ou montar `budget_tokens:` fora de
  `actions/ai-client.ts`. Complementa `ai-thinking-geracao.test.ts`, que trava o formato *dentro* do
  wrapper: um cobre o conteúdo do corpo, o outro a existência de um segundo caminho.
- ⚠️ **Ainda não observado:** um vídeo real gerado fim-a-fim após a correção. A prova aqui é de
  contrato (typecheck + guarda), não de execução — a primeira geração real é que fecha o modo.

---

## 3. Escala (o que quebra a partir de N) — resumo; detalhe em ESCALA-50K.md

### F-E1 · `triggerDiario` inline sob `maxDuration ≤300s` 🔵 (quebra em ~centenas de colabs)
- **Gatilho:** o cron roda o loop de envio **inline** numa rota sem `export const maxDuration`
  (`app/api/cron/route.ts:78`), serial por colab (query + QStash + Resend + updates, awaited).
- **Efeito:** em centenas de colabs a rota expira no meio; como o cron roda **1×/dia**, a cauda fica
  **sem pílula naquele dia** (a idempotência evita duplicar, não evita não-enviar).
- **Resolução:** o cron deve **enfileirar** (task Trigger.dev / QStash fan-out) em vez de iterar
  inline. **Não determinado** por que não é task.

### F-E2 · `.in()` com milhares de ids estoura a URL 🔵 (~1-2k ids)
- **Gatilho:** `listarTemporadasEmpresa` (`temporadas.ts:607`) e `gerar-blueprint-batch.ts:44` fazem
  `.in('id', ids)` com todos os colaboradores. 5.000 UUIDs ≈ 185 KB de URL → PostgREST rejeita.
- **Resolução:** **chunkar o `.in()`** em lotes de ~200.

### F-E3 · `listarTemporadasEmpresa` — `Promise.all` de N overlays × 3 queries 🔵
- **Gatilho:** overlay por trilha, todas em paralelo sem limite (`temporadas.ts:615`) → 5.000 × 3 =
  15.000 queries de uma vez → satura o pool.
- **Resolução:** **paginar** a listagem; **cachear `precarregarKits` por (empresaId, cargo, disc)**
  (trilhas idênticas re-buscam os mesmos kits); limitar a concorrência do `Promise.all`.

### F-E4 · Lotes síncronos de IA (504) ✅ (fechado 27/07 para temporadas — ver ressalva)
- **Gatilho (histórico):** `gerarTemporadasLote` rodava N gerações (~6 chamadas de IA cada) numa
  server action serial, sem `maxDuration` — 1 colab já podia passar de 300s e o lote morria 504.
- **Correção (27/07):** o lote síncrono virou **stub de depreciação gated** (recusa com erro claro,
  zero IA/banco inline). Descoberta: o padrão correto **já existia e era o caminho real da UI** —
  fila + loop no client, 1 action por colab, progresso `[i/N]`, try/catch por item e botão de parar
  (`page.tsx:549-567` → `listarColabsParaTrilha` + `gerarTemporada`), mesmo padrão de
  `filaBlueprint`. Os dois callers do lote eram mortos na prática (ACTION_MAP inalcançável +
  `montarTrilhasLote` já `@deprecated`). Nenhuma task Trigger nova — duplicaria infra para um fluxo
  manual com a tela aberta.
- **Guarda:** `tests/unit/gerar-temporadas-lote-depreciado.test.ts` (3) — validado por mutação.
- ✅ **Ressalva fechada em 28/07:** `gerarBlueprintsLote`/`auditarBlueprintsLote`
  (`actions/blueprint.ts`) viraram os mesmos stubs gated. Confirmado antes de mexer: **zero callers**
  — a tela importa `filaBlueprint`/`filaAuditBlueprint` e itera no cliente com progresso e
  cancelamento, nunca os lotes. Mantidos como stub (não removidos) porque `'use server'` publica
  action id: export que desaparece dá erro opaco num cliente de deploy antigo; stub responde o motivo.
  Guarda: `tests/unit/blueprint-lote-depreciado.test.ts` (3) — validado por mutação (reintroduzir
  `createSupabaseAdmin()` no corpo derruba o teste).

### F-E5 · Cap de conta **não** cai no fallback ✅ (DECIDIDO 28/07 — é intencional, agora explícito)
- **Gatilho (histórico):** o fallback de provedor só disparava em erro **transitório**
  (`isTransientAIError` = 429/503/529). Um cap de billing (400/402/403) não casava → re-lançava como
  falha genérica de API, e **quem lia o log não sabia que a causa era a fatura**.
- **Decisão:** o cap **NÃO** deve cair no fallback, e isso agora é código, não acidente. Motivos:
  (a) repetir não resolve — cap não passa com espera; (b) trocar de provedor automaticamente
  **gastaria em outra conta sem ninguém pedir** e esconderia justamente o que precisa de ação humana.
  O que faltava não era degradar: era **falhar etiquetado**.
- **Implementação (`actions/ai-client.ts`):** `isCapDeContaAIError` (400/402/403 + padrão de
  billing/quota/credit/payment) → **sem retry, sem fallback**, e erro que diz "CAP DE CONTA … Ação:
  revisar crédito/billing do provedor". O `withAIRetry` sai na hora, sem queimar as 4 tentativas.
- **O 429 fica de fora do cap de propósito** — é rate limit e o backoff resolve. Mas quando o 429 é
  causado pela FATURA, o log passa a dizer isso: `isRateLimitPorBilling`. Caso real de 28/07 — a
  Voyage devolveu **429** com *"You have not yet added your payment method… 3 RPM"*: limite
  permanente por falta de pagamento, indistinguível de pico no classificador antigo.
- **Guarda:** `tests/unit/ai-cap-de-conta.test.ts` (8) — validado por mutação (ignorar o status HTTP
  e classificar só pelo texto derruba 2 testes).

### F-E6 · Batch de blueprint usa `submitClaudeBatch` INLINE (segura o maxDuration) 🔵
- **Gatilho:** `gerar-blueprint-batch.ts` usa o batch **inline** (budget 40min dentro da task de
  `maxDuration:3600`), não o **destacado** (`createClaudeBatch` + `wait.for`, budget 24h) que
  `gerar-modulos-manuscrito` usa. Janela lenta da Batch API → fallback síncrono serial → task expira.
- **Resolução:** migrar blueprint para o padrão **destacado** com `wait.for` — o molde exato está
  em `trigger/gerar-modulos-manuscrito.ts:110-127`: `createClaudeBatch` grava o `batchId` nos params
  do job (resumível se a run reiniciar), depois `pollClaudeBatch` + `wait.for({seconds:60})` em loop
  (espera CHECKPOINTADA, não consome execução) e `fetchClaudeBatchResults` no fim.
- **Decisão 28/07 — NÃO agora, e o motivo não é preguiça:** (a) é 🔵, não morde no volume atual
  (37 blueprints no maior tenant); (b) mexer em `trigger/` exige **deploy manual** do Trigger.dev,
  e ele foi feito no meio de uma rodada com **renders de vídeo em execução** nessas mesmas tasks —
  deploy ali arrisca o que está rodando, para ganhar resiliência a uma fila lenta da Batch API que
  não é gargalo hoje. Fazer junto do próximo deploy de Trigger que já for necessário.

### F-E7 · PDF cache por-arquétipo vaza PPP em empresa-rede ✅ (fechado 27/07)
- **Gatilho:** chave `final/perso/{contentId}/{empresaId}/{arquetipoSlug}.pdf` **não incluía a
  escola**. Numa rede multi-escola, 2 colabs de escolas diferentes mas mesmo arquétipo colidiam → o
  2º recebia o PDF com o **PPP da escola do 1º**.
- **Resolução (`conteudos.ts`):** a chave ganhou a **assinatura do contexto**
  (`{arquetipoSlug}-{contextoAssinatura}`, `assinaturaCurta` em `lib/escola-brief.ts` — djb2 em
  base36, determinística). Fecha **duas** coisas: o vazamento por colisão *e* a **invalidação** —
  antes, um PPP novo atualizava o contexto e o cache seguia servindo o texto antigo para sempre.
- ⚠️ **Ao mudar a fonte do contexto do PDF, garanta que `contextoAssinatura` varie com ela** — é o
  que mantém a chave discriminante. Hoje: `brief-manual` (brief da empresa) · `sem-ppp` · hash do
  contexto consolidado.

---

## 4. Vídeo / personalização

### F-V1 · Colab novo (ou que muda de DISC) nunca recebe o vídeo nominal ✅ (job criado 27/07 — 1ª execução ainda não observada)
- **Gatilho (histórico):** `personalizarCelula` fotografa os colabs de (empresa,cargo,disc) **no
  instante do render** e não havia re-disparo. Quem entra depois (contratado, DISC remapeado, célula
  renderizada antes da pessoa existir) caía no **deck genérico** permanentemente. Junto sumiam os
  falhos ('error') e os travados ('processing' sem fim — 5 parados desde 14-16/07). Degradação
  silenciosa: a pessoa vê um vídeo, só que sem o nome.
- **Correção (27/07, `b124947d`):** job de reconciliação `lib/video/reconciliar-personalizados.ts` —
  detecta `(colab × célula done)` sem personalizado (ausente/error/processing travado), apaga os
  presos e devolve a célula à fila (`render_queued`), com teto (env `RECONCILIAR_VIDEOS_LIMITE`,
  default 3). **Agendado:** sábado 03:00 UTC (`vercel.json` → `app/api/cron/route.ts`) — não é só
  script manual. Não prejudica quem já tem vídeo: `resolverCelulaVideo` busca com
  `.neq('status','error')` (célula segue servida durante o re-render) e `personalizeCell` pula quem
  está 'done'. Guarda: `tests/unit/reconciliar-personalizados.test.ts`.
- ⚠️ **Não observado em produção ainda:** a primeira execução real é **sábado 01/08 03:00 UTC** —
  implementado e agendado, mas nunca rodou de verdade até a auditoria de 27/07.

### F-V2 · Personalização fora do watchdog, serial por colab 🔵
- **Gatilho:** o watchdog (`MAX_RENDER_MS`) envolve só o render do deck; `personalizeCell` roda depois
  (`worker.mjs:276`), serial por colaborador, sem teto próprio. Célula de cargo popular (centenas de
  colabs do mesmo DISC) → personalização longuíssima ocupando a box.
- **Resolução:** teto de tempo próprio na personalização + paralelismo limitado; ou personalizar
  fora do worker de render (fila separada).
- **Medido 28/07 (não morde ainda):** no lote de 42 células, **187 personalizados** saíram atrás dos
  decks sem travar nenhuma box — o cache de saudação (25/06) é o que segura isso. O risco continua
  em pé para célula de cargo popular; só ficou provado que 187/42 ≈ 4,5 por célula passa.

### F-V3 · Lote de vídeo satura o FORNECEDOR — ~15% falham e o pipeline não retenta 🟠 (recuperável)
- **Medido 28/07 (semana 5 do Ibipeba, 41 células com `--conc 4`):** **6 falhas (~15%)** —
  3× `TTS: resposta sem áudio após 4 tentativas` (Vertex) e 3× `HeyGen timeout aguardando video_id`.
  Nenhuma por bug: é saturação de Vertex TTS e HeyGen ao mesmo tempo. Concorrência **4 já basta**.
- **Efeito:** a célula fica `status='error'`, o resolver da entrega a ignora (`status<>'error'`) e a
  pessoa cai no formato não-vídeo — **sem alarme**, porque o achado `video-stale` do health só pega
  `processing/rendering/render_queued` presos, nunca `error`.
- **Resolução (o que já funciona):** re-rodar o disparo com `--conc 2` recuperou **6/6** na primeira
  tentativa. É seguro e idempotente: `error` não conta como "tem deck" e a UNIQUE parcial permite a
  linha nova. **Custo do padrão:** 47 renders pagos para 42 células (~12% de desperdício).
- ✅ **Observabilidade fechada em 28/07 — R10 `celula-video-em-error`** (run estrutural, diário):
  o buraco não era o render falhar, era **ninguém ver**. ⚠️ O critério é **"erro E nenhum deck"**, não
  "tem erro": medido no mesmo dia, **35 células já falharam alguma vez e 33 estavam resolvidas** por
  tentativa posterior — contar `error` cru acusaria 35 para sempre, e alarme crônico é alarme
  desligado. Validado contra produção: reporta **2** (resíduos antigos — `projetomacae` box morta e
  `ibipeba` `render_inputprops inválido`), com a causa de cada um na amostra. Guarda:
  `pipeline-health-regras.test.ts` (R10).
- **Segue sem retry automático:** a recuperação é o re-disparo manual com `--conc 2`. Automatizar
  exigiria fila com backoff por fornecedor — não feito, e o alarme agora avisa quem precisa agir.

### F-V4 · Dois lotes NOSSOS disputam o mesmo TTS — e o 504 do gateway não prova trabalho perdido 🟠 (recuperável)
- **Gatilho:** o TTS do Vertex é compartilhado por caminhos que ninguém lê juntos — a **narração do
  vídeo** (`worker`/`gerar-video`, etapa `narracao`) e o **podcast** (`/api/internal/pregerar-podcast`
  e `/api/conteudo/[id]/podcast`). Rodar prewarm de podcast e disparo de vídeo na mesma janela é
  auto-saturação: F-V3 mede a saturação causada pelo PRÓPRIO lote; aqui a causa é o lote vizinho.
- **Medido 12/08/2026 (Ibipeba, semana 5):** 4 células disparadas com o prewarm de 72 podcasts rodando
  a `CONC=5`. As 3 que já tinham passado da narração renderizaram; **a 4ª morreu em `narracao`**
  (`TTS: resposta sem áudio após 4 tentativas`). Re-disparada **sozinha**, passou na primeira
  tentativa. No mesmo lote, o prewarm devolveu **10 falhas em 69** — 9× **HTTP 504** e 1× 500.
- 🔑 **`504` do gateway ≠ trabalho não feito:** a rodada seguinte encontrou **8 dos 10 já gravados** no
  Storage. O gateway desiste em ~300 s, a função continua e sobe o MP3. **Quem sabe se o áudio existe é
  o Storage, não o status HTTP** — tratar 504 como falha faz o retry pagar TTS de novo (a rota
  `pregerar-podcast` NÃO confere cache antes de gerar; quem confere é o script).
- **Resolução:** serializar as frentes que compartilham fornecedor (vídeo primeiro, prewarm depois — ou
  o inverso), e medir o resultado pelo **efeito persistido**, não pela resposta da chamada. Concorrência
  é recurso global: `PREWARM_CONC=5` subiu a taxa de 0,4 → ~1,5 áudio/min *e* produziu a cauda de 504.
- **Sem retry automático** (mesma limitação de F-V3): a recuperação é re-rodar, e o script de prewarm é
  idempotente por cache. Detalhe operacional em `docs/KIT-SEMANAL.md` §12/08.

---

### F-C10 · A quinta era o ÚNICO ponto MONOCANAL da cadência ✅ (fechado 14/08)

**Gatilho:** `lib/fase4/trigger-diario-empresa.ts` — o bloco da evidência era `if (telefone) { … }` e
nada mais, enquanto a pílula de segunda/terça já saía por WhatsApp + e-mail + push (mig 202).

**Medido (13/08/2026):** a instância Z-API caiu no meio do disparo da Ibipeba — **6 de 36
entregues**, 30 pessoas sem nada. As 36 têm e-mail cadastrado, e o Resend não falhou **nenhuma** vez
em 194 envios medidos. O canal que teria salvado as 30 já existia, já estava pago, e simplesmente
não era usado naquele dia da semana.

**Correção (mig 213):** carimbo por canal na evidência, como a pílula.

🔴 **A armadilha que a correção quase criou.** O gate de entrada virou POR CANAL — de propósito,
para recuperar o canal que falhou numa segunda passada. Só que `ultima_evidencia_em` acumulava DOIS
papéis: idempotência do dia **e** alavanca do avanço de semana. Sem separar, a segunda passada
avançaria `semana_atual` de novo, **pulando uma semana inteira de conteúdo da pessoa, sem erro
nenhum na tela**. Entrega passou a olhar os carimbos por canal; calendário olha o consolidado.
Validado por mutação.

**Classe:** quando um campo responde a duas perguntas ("já processei hoje?" e "já avancei o
calendário?"), tornar a primeira mais granular quebra a segunda em silêncio.

### F-C11 · Enum fechado em schema `.strict()` faz a mensagem NÃO SAIR ✅ (fechado 14/08)

**Gatilho:** `app/api/webhooks/qstash/whatsapp-cis/route.ts` — `carimboCampo: z.enum([...])` dentro
de um schema `.strict()`.

Ao dar carimbo próprio à evidência, publicar `ultima_evidencia_whatsapp_em` sem adicioná-lo ao enum
**não** deixaria só o carimbo de fora: o Zod recusa o payload inteiro e o envio nem acontece. Falha
**total**, não parcial — e descoberta por ler o consumidor, não pelo typecheck (publisher e webhook
falam por JSON).

No mesmo arquivo, o `motivo` da telemetria era o literal `'pilula'` para qualquer carimbo, sob um
comentário afirmando que "o TypeScript obriga a decidir o kind aqui". Não obrigava — a evidência
entraria na contagem de cadência como conteúdo. Hoje é `satisfies Record<CarimboCampo, string>`:
enum novo sem mapa **quebra o build**.

**Classe:** contrato entre dois processos que falam por JSON não é verificado pelo compilador. E
comentário que promete uma garantia não a implementa.

### F-I21 · A régua sequencial existia, era intencional — e ninguém era avisado 🟡 (corrigido em parte, 20/08, `7ea60717`)

**Gatilho:** `app/dashboard/temporada/semana/[week]/page.tsx` — 822 linhas, **zero** gate, enquanto
`lib/season-engine/trilha-runtime.ts:136` devolvia 403 nas 4 rotas de conversa.

**A mesma decisão morava em três lugares, com critérios diferentes:**

| Porta | Critério até 20/08 |
|---|---|
| 4 rotas de conversa | anterior `concluido` → 403 |
| lista de semanas (`temporada/page.tsx:158`) | liberava também por `em_andamento` |
| página da semana | **nenhum** — URL direta abria qualquer semana |

**Classe: a porta mais permissiva vira a promessa, a mais restritiva vira a experiência.** Régua
duplicada não diverge com o tempo — ela já nasce divergente, e o descompasso só aparece quando
alguém reclama. Some a isso o fato de que a cadência corre pelo CALENDÁRIO
(`fase4_envios.semana_atual`) e manda `deepLinkSemana(baseUrl, semana)`: **o sistema convidava toda
semana para uma porta que ele mesmo trancava.**

**Medido (20/08/2026, Ibipeba — 36 trilhas ativas, início 13/07, semana 6 do calendário):** 19 de 36
**sem nenhuma semana concluída**. Uma pessoa parou em **5 de 6** turnos e ficou **36 dias** parada; a
que reclamou tinha parado em **3 de 6** às 08:27 e escreveu às 08:28 ("não estou conseguindo acessar
os conteúdos das próximas semanas"). O gate não estava quebrado — estava **mudo**, e o que conclui
uma semana (a conversa, não abrir o conteúdo) não está dito em lugar nenhum da tela.

**Correção:** `avaliarAcessoSemana` vira a régua única (servidor decide, tela explica); a página
passa a mostrar o que falta, a regra em português e o botão para a semana pendente; os tetos de turno
saem das rotas para o `week-gating`; semana trancada loga `bloqueio` em vez de `abertura` (a métrica
de abertura inflava justamente com quem não viu nada). Guarda:
`tests/unit/week-gating-acesso.test.ts` (13 casos, validados por mutação).

🚧 **Aberto:** a lista ainda libera por `em_andamento` e `marcarConteudoConsumido`
(`actions/temporadas.ts:709`) continua criando progresso `em_andamento` em qualquer semana sem gate —
a raiz dos registros órfãos que destravam o botão da lista.

⚠️ **O buraco estava documentado desde 17/07** na errata 2 de `docs/PIPELINE-TRILHA.md` e ficou 34
dias sem virar trabalho. Achado sem consequência visível não é priorizado; o que o tornou urgente foi
uma frase de uma pessoa.

### F-C12 · Cota de retentativa consumida por avaria do CANAL torna o resgate inalcançável ✅ (corrigido 19/08, `984607e3`)

**Gatilho:** `lib/conarh/reenvio-t0.ts:33,124` — `MAX_TENTATIVAS_AUTOMATICAS = 10` +
`query.lt('t0_tentativas', MAX_TENTATIVAS_AUTOMATICAS)`, herdado por
`app/api/conarh/reenviar-t0/route.ts` porque a tela mandava corpo vazio.

**Medido (18-19/08, feira do CONARH):** o único lead real da feira foi capturado às 15:19 do dia 1.
O `recorte_demonstracao` ainda estava PENDING na Meta e a Z-API está caída desde 11/08, então o cron
tentou de 15 em 15 min e **esgotou as 10 tentativas por volta das 17:50** — sempre com o mesmo erro,
`zapi: saúde: desconectada`. O template foi aprovado às **19:21**; a essa altura o lead já estava
fora do cron **e do botão**. A tela mostrava "1 recorte não chegou" e oferecia uma ação que, para
ele, não fazia nada. A entrega só saiu às **10:45 do dia seguinte**, na 11ª tentativa, depois da
correção — 19h25 após a captura, `delivered` confirmado pela Meta 13s depois do envio.

**Classe: contador de tentativa que não distingue de QUEM é a falha.** A cota é do destinatário, mas
quem a gastou foi a avaria do sistema (fornecedor fora, template não aprovado). Quando o canal
volta, o teto já expulsou exatamente quem nunca recebeu nada. Vale para toda fila com retentativa:
falha de canal não devia debitar a cota do destinatário.

**Correção:** a decisão de insistir mudou de lado. A rota manual — que só é chamada por gente com a
chave — passou a incluir os esgotados **por padrão** (`incluirEsgotados: body?.incluirEsgotados
!== false`); o cron segue conservador. Guarda: `tests/unit/conarh-reenviar-t0-rota.test.ts`
(5 casos, validado por mutação: com o default anterior, corpo vazio e valor lixo falham).

⚠️ **Aberto:** `/conarh/fila` lista só as capturas **do dia** (`criado_em >= inicioHojeBRT`), enquanto
o contador de pendências é da **campanha inteira**. Um lead devendo desde ontem aparece no número e
não na lista — o aviso fica sem rosto.

### F-I15 · Régua oficial faz variantes do modelo COLIDIREM e o upsert perde a avaliação inteira ✅ (corrigido 14/08)

**Gatilho:** `lib/ia4-avaliacao.ts` — `descritor: resolverNomeOficial(d.nome, ctx.descsOficiais)` no
array do `upsert` com `onConflict: 'colaborador_id,competencia,descritor'`.

`resolverNomeOficial` existe porque o modelo devolve o mesmo descritor com grafias diferentes
("COO03_D6 — Busca de apoio" e "Busca de apoio (COO03_D6)"). Resolver contra a régua conserta o nome
— e faz as duas variantes virarem a MESMA chave. O upsert então leva duas linhas iguais e o Postgres
recusa a operação **inteira**: `ON CONFLICT DO UPDATE command cannot affect row a second time`. A
avaliação completa da pessoa se perde por causa de uma repetição do modelo.

**O defeito é ANTIGO e era invisível:** só aparece quando existe régua para resolver CONTRA. Com
descritores livres (competência sem `cod_desc`), duas variantes viravam dois nomes distintos e nunca
colidiam. Ficou latente até a matriz de Macaé ser semeada — ou seja, apareceria no próximo tenant que
cadastrasse os descritores corretamente.

**Correção:** dedup por descritor DEPOIS de resolver, consolidando notas repetidas pela média, com
`console.warn` nomeando quantas colidiram.

**Classe:** correção que só se manifesta depois de OUTRA correção. A primeira metade (resolver o nome)
criou a segunda (chave duplicada) e ficou dormente esperando o pré-requisito.

### F-I16 · A jornada gerava blueprint e não o lia — `conteudosPorSemana` sem consumidor ✅ (corrigido 14/08)

**Gatilho:** `lib/season-engine/trilha-core.ts` — o bloco `blueprintToTrilhaInputs` vivia só no ramo
DUO; `PROGRAMA_JORNADA` tem `numCompetencias: 1` e caía em `selectDescriptors`.

`selectDescriptors` aloca UM descritor por semana (modelo anterior ao `conteudosPorSemana: 2`). A
trilha de 7 semanas saía com 4 descritores e 6 entregas em vez de 7 e 12, e descritores com gap real
ficavam de fora. O blueprint — gerado, auditado, pago — era ignorado nesse modo.

Ligado o bloco, o adapter ainda rejeitava tudo: `semana de conteúdo 1 sem nenhum descritor
resolvível`. O nome da competência vem de duas fontes que não combinam — o assessment guarda
`competencias.nome` ("GERENCIAMENTO DE CONFLITOS") e a IA do blueprint reescreve em caixa mista
("Gerenciamento de Conflitos"). Os DESCRITORES já eram normalizados; a competência era chave crua.
Resultado: fallback silencioso, sem erro na tela.

**Correção:** caminho de 1 competência tenta o blueprint quando `conteudosPorSemana >= 2` (mesmo
fallback e mesma degradação do DUO); `to-descriptors.ts` normaliza a chave da competência e devolve o
nome do ASSESSMENT — é por ele que o resolver casa `micro_conteudos`. Guarda:
`tests/unit/blueprint-to-descriptors-competencia.test.ts`, validada por mutação.

**Classe:** config declarada sem consumidor. `conteudosPorSemana: 2` estava certo no objeto e não
tinha quem o lesse naquele caminho — o modo novo herdou o objeto de config, não os consumidores.

### F-I17 · O `progress` do job de manuscrito diz "N ok, 0 erros" e 11 de 24 estavam reprovados 🟡 (medido 16/08)

**Gatilho:** `trigger/gerar-modulos-manuscrito.ts` — `resultados[].ok` significa *persistiu*, não
*aprovado*. O veredito mora em `modulos_base_conteudo.auditoria_ia->>'veredito'`, que o progresso
não resume.

Medido no DIR10 → C014 (Macaé): o job fechou **"21 ok, 0 erro(s) · 21/21 auditado(s)"** e o banco
tinha **11 reprovados de 24**. Pior, **3 módulos com `conteudo_central` VAZIO** (`{}`, 2 chars,
contra ~9k dos irmãos, com `conteudo_aplicavel` completo de ~19k) saíram como `ok: true`, levando os
avisos do `validarCorpo` na mesma linha do resultado (`ideia_principal ausente`,
`principios precisa de pelo menos 3 itens`). Nada falhou alto: é a classe **"200 vazia fura
fail-loud"** (§1.2 deste doc) aplicada à CONSTRUÇÃO, onde a régua manda falhar.

**Como não cair:** depois de qualquer lote de manuscrito, contar por veredito — nunca ler o
`progress` como resultado:

```sql
select auditoria_ia->>'veredito', count(*), min((auditoria_ia->>'nota')::numeric)
from modulos_base_conteudo m join competencias c on c.id = m.competencia_id
where c.cod_comp = 'C014' group by 1;
```

**Correção pendente:** o `progress` deveria carregar o veredito por item (ou ao menos `reprovados:
N`), e `conteudo_central` vazio deveria ser erro do item, não aviso. **Contorno que funciona hoje:**
`scripts/_refinar-reprovados.ts <slug> --aplicar` — 13 de 14 recuperados em uma passada; o único
"sem ganho" (4,9 → 4,9) tinha sido REESCRITO (`versao` 2, bloco vazio → 8,3k, problema mudou de
*estrutura* para *auto-consistência*) e uma 2ª passada fechou em 10. **Nota igual não quer dizer
conteúdo igual — comparar `versao`/`auditado_em_versao` antes de desistir.**

### F-I18 · PDF do micro-conteúdo falhava por fonte e o catch engolia — 40 conteúdos sem PDF ✅ (corrigido 16/08, `f3ed4aa5`)

**Gatilho:** `lib/conteudo-final-pdf.tsx` fazia `await import('@react-pdf/renderer')` dentro de
`renderConteudoFinalPDF`, enquanto `components/pdf/styles` registrava a NotoSans na instância do
import ESTÁTICO. Sob `tsx` (todo lote headless) são cópias diferentes do módulo — medido: namespace,
`Font` e `renderToBuffer` são objetos distintos, e a dinâmica tinha **12 famílias registradas contra
13** da estática.

O erro `Font family not registered: NotoSans` caía no `catch` de `gerarConteudoIA`
(`actions/conteudos.ts:250`), que só faz `console.warn`. O conteúdo era gravado com `url` e
`storage_path` NULOS. Resultado: **40 micro-conteúdos sem PDF** (24 de C007 em 14/08 + 16 de C014 em
16/08) — e a expansão de IA do PDF (`conteudo_expansao_pdf`, US$ 0,26 na última rodada) foi paga
mesmo assim.

**Correção:** `renderToBuffer` passou a vir do import estático do topo — o dinâmico não adiava nada,
já que `Document`/`Page` entram estáticos na mesma linha. **Guarda:**
`scripts/_provar-instancia-pdf.ts`, com validação por mutação (o mesmo componente pelo import
dinâmico ainda falha com o erro original).

**Classe: contornar não é consertar.** A causa foi diagnosticada certo em 05/08 e o conserto entrou
no CHAMADOR (`scripts/_conarh-guia-pdf.ts` deixou de usar a função); a função ficou quebrada mais 11
dias, para todo mundo. ⚠️ **Ainda com o padrão, não medidos:**
`lib/relatorio-comportamental/relatorio-core.ts:65` e `app/dashboard/pdi/pdi-actions.ts:96`.
**Backfill dos 40 existentes: ABERTO** — o fix vale só para gerações novas.

### F-I19 · Corte constante com premissa embutida deixou 34 pessoas sem aviso, para sempre ✅ (corrigido 17/08)

**Gatilho:** `lib/notifications/avisar-plano-pronto.ts` — `CORTE_ISO = '2026-08-16T23:59'`, com o
comentário *"os 38 de Ibipeba e os 34 de Macaé já foram baixados pelas pessoas e não devem ser
reanunciados"*.

A premissa valia para Ibipeba, de onde nasceu, e foi generalizada para os dois na mesma linha.
**Medido em 17/08:** `notification_deliveries` tinha **ZERO** registros de `kind='plano'` em `macae`
— só convite, magic link, boas-vindas e acesso. Os 34 nunca souberam que o plano existia, e como o
corte é fixo **e não tinha caminho de exceção**, ficariam em silêncio permanente. O sintoma é a
ausência de sintoma: nada falha, nada alerta, ninguém reclama de mensagem que não chegou.

**Classe: constante cuja justificativa mora num comentário.** O comentário é uma afirmação sobre o
MUNDO ("já baixaram"), não sobre o código, e envelhece sem que nada acuse. Antes de confiar num
corte, conferir o fato no banco.

**Correção:** `avisarPlanosProntos` aceita `corteIso`, mas **só junto de `apenasSlug`**, e lança
antes de tocar banco ou provedor — sem escopo, baixar o corte alcançaria os 38 de Ibipeba junto.
O `CORTE_ISO` não mudou; o teste que o trava segue valendo. Guarda em
`tests/unit/avisar-plano-pronto.test.ts`.

**Agravante que virou feature:** o disparo só existia via `curl` no endpoint do cron com
`CRON_SECRET`, que é *Sensitive* na Vercel — ninguém consegue LER, só regravar, e regravar
invalidaria o valor dos crons agendados. Operação que só o cron alcança é operação sem porta. Agora
há botão em `/admin-v2` (aba "Planos (PDI)"), autorizado pela sessão e auditado.

### F-I20 · A política de cadência existia e não governava nenhum envio real ✅ (corrigido 17/08, `259bb66a`)

**Gatilho:** `tests/unit/integrations/whatsapp-cadencia-guard.test.ts` — o denominador media o canal
ANTIGO.

Seis dias depois do incidente de 11/08, havia **quatro** réguas para a mesma decisão: a política
(15s), dois literais de 6s (`avisar-plano-pronto.ts`, `_boas-vindas-turma.ts`) e **dois de 2s** —
`_reenviar-p1-whatsapp.ts` (`setTimeout(res, 2000)`) e `_enviar-missao-semana4-ibipeba.ts`
(`i * 2` no `Upstash-Delay`), que é o ritmo exato que derrubou o número.

**Por que a guarda passava verde:** (1) `DIRS` não incluía `scripts/`, e foram scripts que falaram
com as 72 pessoas de Macaé; (2) os emissores reconhecidos eram os do wrapper legado
(`@/actions/whatsapp`, `sendWhatsapp`) — `enviarTemplateCloud`/`enviarPorTemplate`, a **Cloud API
oficial desde 14/08**, não contavam. Ampliado o denominador, ela apontou os dois scripts sozinha.

**Classe: guard que não acompanha a migração de canal.** Ele continua verde e passa a certificar o
caminho que ninguém mais usa. Ao trocar de fornecedor/canal, o denominador do guard troca junto.

**Default 15s → 6s**, com procedência: o 15s era para o número QR bloqueado; hoje o canal é a Cloud
API (teto 80 msg/s, o limite restante é o tier de destinatários únicos — volume, não taxa). Medido
em 17/08: 38 boas-vindas a 7,0s e 34 avisos de plano a 6,5s, **72 mensagens, 0 falhas**. A régua do
incidente segue travando o valor (máx. 10 msg/min; 6s dá exatamente 10). Detalhe em
`docs/TEMPLATES-WHATSAPP.md` e na memória `project_whatsapp_ban_lote`.

## 5. Parse de IA / robustez

### F-P1 · JSON truncado (maxTokens) → falha limpa (blueprint) ou score inflado (auditoria) ✅ (fechado 27/07)
- **Gatilho (histórico):** `extractJSON` retorna `null` em JSON incompleto. Blueprint → `{error}`
  (falha limpa, ok). **Auditoria** → sem checks semânticos → denominador caía de 12 p/ 6 → **score
  inflado** (6 estruturais pass = 100 numa auditoria pela metade).
- **Correção (27/07, `audit.ts:266-298`):** **denominador fixo** — check semântico ausente conta
  como NÃO-AVALIADO (fica no denominador, sem pontuar): a auditoria parcial pontua no máximo o
  estrutural (50), nunca mais que a completa. Mais o flag **`parcial: true`** no relatório
  (persistido em `development_blueprints.auditoria`) e na superfície do admin (`page.tsx:403`
  mostra "· PARCIAL" e marca a linha como erro).
- **Guarda:** `tests/unit/blueprint-audit.test.ts` (6) — validado por mutação (voltar ao
  denominador variável derruba 3). ⚠️ Comportamento muda: runs parciais que o admin via como 100
  agora aparecem como ≤50 + PARCIAL — é a correção, não regressão.

### F-O1 · O ALARME media varredura, não experiência ✅ (fechado 04/08)
- **Gatilho:** `aplicarOverlayKit` roda sobre o plano INTEIRO (14 semanas) e passava `colaboradorId`
  em todas — e é o `colaboradorId` que LIGA o registro em `overlayConteudo`. Uma abertura de
  `/admin/temporadas` no ibipeba = 37 trilhas × ~9 semanas, tudo contabilizado como fallback.
- **Medido (04/08):** o health acusou **578 fallbacks/24h**; das **622 ocorrências acumuladas** de
  `kit-ausente-disc` + `kit-cargo-divergente`, **ZERO eram de semana acessível** — menor semana
  registrada em todo o histórico = **6**, maior liberada = **4**. Ninguém tinha recebido conteúdo
  degradado.
- 🔎 **O que denunciou:** os dois tipos com `ultima_em` no **mesmo segundo** (03:41:27) — lote, não
  leitura de gente. Ao ver contagem alta, cheque a distribuição temporal antes da causa-raiz.
- **Correção:** `colaboradorId` só em semana liberada (`entregaEhReal`, `week-gating.ts`).
  Fail-closed sem `data_inicio` → varredura de admin (cujos selects não trazem o campo) para de
  registrar por construção, mesma disciplina da prévia do health (que já não passava `colaboradorId`).
- ⚠️ **Recontextualiza o alarme de 29/07:** os "86 fallbacks / 29 leituras de 2 pessoas" que
  motivaram os fixes de kit (§3.4) também eram varredura de semana futura. Os bugs eram **reais** e a
  correção segue válida — mas era **preventiva**: ninguém tinha sido servido errado, porque ninguém
  chegou na semana 6. **Lição: "N ocorrências" não é "N pessoas afetadas" enquanto não se cruza com
  quem podia consumir aquilo.**

### F-P3 · Missão truncada chegava CRUA na tela (JSON no lugar do texto) ✅ (fechado 29/07)
- **Gatilho:** `parseMissaoResponse` faz `JSON.parse` do payload inteiro e devolve `null` quando a
  geração cortou no meio (maxTokens — mesma raiz do F-P1). `normalizeMissao` é fail-safe
  (`if (!parsed) return missao`) e repassa o texto cru; a week page renderiza com `<ReactMarkdown>`
  → a pessoa abre a semana de aplicação e vê um **bloco de código JSON** no lugar da missão.
- **Alcance medido (29/07):** **127 missões**, sendo **108 no ibipeba** (piloto REAL) — 34 das 37
  trilhas na semana 4 e 37/37 nas semanas 8 e 12. acme-demo, projetomacae e teste-piloto idem.
- **A assimetria que causou:** o CENÁRIO já tinha `salvageCenarioStructured` para exatamente isso; a
  MISSÃO não tinha. A recuperação foi escrita para um dos gêmeos e não replicada — a mesma classe do
  §3.4 (match de kit), no mesmo dia.
- **Correção:** `salvageMissaoStructured` espelha a cadeia do cenário (parse estrito → salvamento do
  truncado → parse frouxo) e reusa os helpers loose; `integracao_descritores` precisa de extrator
  próprio por ser array de OBJETOS, e o último par costuma ser o cortado. `missaoToMarkdown` deixou
  de emitir o cabeçalho "Descritores a integrar" com lista vazia.
- **Por que não precisou de migration:** a normalização roda na **leitura** (`loadTemporada`), então
  as 127 se corrigiram sem tocar no banco. `scripts/_verif-missao-normalizada.ts` roda o normalizador
  real sobre as trilhas e conta o que ainda chegaria cru: **127 antes, 0 depois**.
- ⚠️ **Resíduo da mesma família, corrigido junto:** `/api/temporada/reflection` lia
  `trilha.temporada_plano` **cru** para montar o prompt, enquanto a tela normalizava — a pessoa lia a
  missão certa e a IA recebia o blob de JSON. Ao ler o plano fora do `loadTemporada`, passe por
  `normalizeTemporadaPlano`.

### F-P4 · Conversa da semana de missão nunca começava — `messages: []` no turn 1 ✅ (fechado 29/07)
- **Gatilho:** a API da Anthropic recusa `messages: []` com **400 "at least one message is required"**
  e `/api/temporada/reflection` converte em **500 "Erro na IA"**. No turn 1 o histórico é vazio **por
  definição** — a pessoa acabou de clicar o botão que inicia a conversa e ainda não escreveu nada.
- **Alcance:** dos três prompts de conversa, **só o `socratic` injetava** a mensagem de abertura.
  `missao_feedback` (semanas 4/8/12, caminho "Sim, consegui") e `analytic` (caminho "Não" → cenário
  escrito, e avaliação) não injetavam. O caminho principal das semanas de aplicação **nunca funcionou**.
- **Medida do impacto (o que provou):** `0 de 144` semanas de aplicação com qualquer transcript e
  **0 aceites de missão**, contra `37` transcripts nas semanas de conteúdo, que usam o socratic.
- **Correção:** injeção `[INICIE A CONVERSA…]` nos dois, espelhando o socratic. Guarda:
  `tests/unit/prompts-primeiro-turno.test.ts` roda sobre **os três** — a falha foi um prompt nascer
  sem copiar o detalhe do irmão, então o próximo entra na mesma lista.
- 📌 **Como apareceu — e por que não antes:** dirigindo o fluxo real com Playwright para capturar o
  vídeo-tutorial. **Nenhuma superfície mostrava**: não há tela de admin para isso, o health-check não
  olha, e `registrarDegradacao` também não pega — a rota devolve 500 e o cliente exibe erro genérico.
  Classe: **fluxo que ninguém percorreu ponta a ponta não tem prova de que funciona**, e "ninguém
  reclamou" não é sinal quando o passo anterior (aceitar a missão) também nunca foi alcançado.

### F-P2 · Missão/cenário formativos caem em placeholder — **não afeta o scoring** ✅ (esclarecimento)
- Confirmado: o Cenário B da **avaliação** (13/14) vem de `banco_cenarios`, não desta geração. Missão/
  cenário das semanas 4/8/12 são formativos. Placeholder degrada a experiência, **não o fechamento**.

---

## 6. Verificação do pipeline contra o código (17/07/2026)

> Absorvido de `FMEA-PIPELINE.md` §6 em 27/07/2026. Método: leitura estática do
> `PIPELINE-TRILHA.md` conferida linha a linha no código, por 3 frentes paralelas (camadas 0-3
> insumos→trilha, 4-5 conteúdo→kit, 6-7 entrega→envio). Achados marcados 🆕 **não** têm entrada F-*
> própria — são candidatos a catalogação.
>
> **Status sincronizado na auditoria de 27/07 (noite):** itens com ✅ foram fechados (commit entre
> parênteses); os sem marca **seguem abertos** — os priorizáveis estão na seção "Prioridação" no fim
> do documento.


### Veredito geral

O `PIPELINE-TRILHA.md` é **excepcionalmente fiel** (~50 referências `arquivo:linha` checadas, quase todas exatas: 7 gates, regra dos 100%, floor, override, UPSERT, auditoria 6+6, enforcement de gaps, persistência, week-gating, achados 1–11). Mas o pipeline tem um padrão de falha sistêmico: **degradação silenciosa** — quase toda falha vira conteúdo genérico, placeholder ou ausência, sem erro, sem alerta, sem telemetria. E o envio (camada 7) foi projetado no polo "nunca duplicar", pagando com **"às vezes nunca enviar"**.

### 1. Falhas de maior severidade

### 1.1 Regeneração destrói dados do colaborador ✅ (27/07: `5a405965` + stub do lote, F-E4)

- Regenerar trilha faz `delete` da linha inteira de `temporada_semana_progresso` — apaga **reflexões, feedbacks e evidências**, não só o progresso (`lib/season-engine/trilha-core.ts:576`). O doc subestima ("reseta data_inicio e o progresso").
- `gerarTemporadasLote` regenera **todos** sem checar trilha existente (`actions/temporadas.ts:246-273`).
- `regerarSemana` zera `status/reflexao/feedback/conteudo_consumido` da semana — quem já concluiu perde o transcript e a semana destrava o Tira-Dúvidas (`actions/temporadas.ts:432-435`). Não re-seleciona conteúdo (armadilha 7 do doc ✓).

### 1.2 Pílula perdida para sempre em qualquer falha 🆕 ✅ (27/07: carimbo POR CANAL — `carimbo-canal.ts`, nada saiu → sem carimbo — + `publishToQStash` lançando, `0a188172`; **04/08: carimbo WhatsApp movido p/ PÓS-ENTREGA**)

- O carimbo `ultima_pilulaN_em` é gravado **mesmo quando WhatsApp E e-mail falham** (`actions/cron-jobs.ts:370` — stamp incondicional ao fim de `enviarPilulaDia`). A idempotência protege de duplicado, mas converte qualquer falha em perda permanente: sem retry, sem fila morta, sem alerta (erro só num contador de retorno).
- Agravante: `QSTASH_TOKEN` ausente → `publishToQStash` loga warn e **retorna sucesso** → `pilulas++` + carimbo, nada enviado. O canal WhatsApp inteiro morre em silêncio (`cron-jobs.ts:418-423`).
- **Ressíduo fechado em 04/08** (`33221971`): o carimbo `ultima_pilulaN_whatsapp_em` era gravado no ENFILEIRAMENTO (publish ok ≠ entrega). Agora o publish leva `fase4EnvioId` + `carimboCampo` (enum fechado) e o webhook `whatsapp-cis` grava o carimbo **só após `sendWhatsapp` ok** — falha de carimbo só loga, nunca 5xx (retry reenviaria o texto). Guarda: `tests/unit/qstash-whatsapp-cis.test.ts`, validada por mutação. O consolidado `ultima_pilulaN_em` segue no critério antigo (e-mail ok OU WhatsApp enfileirado).

### 1.3 Cron sem catch-up e sem isolamento de falha 🆕 ✅ parcial (27/07: try/catch por empresa `0a188172` + lock diário F-C3 — **catch-up segue ABERTO**: perdeu o dia, perdeu a pílula)

- Gates são `hoje===dia` (`cron-jobs.ts:303-306`): perdeu segunda → pílula 1 perdida; perdeu quinta (diaEv) → `semana_atual` não avança e `ultima_evidencia_em` não carimba → na semana seguinte **reenvia pílulas da mesma semana** (conteúdo repetido), e a trilha deriva do calendário porque o week-gating continua liberando por `data_inicio` (`:374-407`).
- **Sem try/catch por empresa/envio**: exceção no carimbo (`:370`,`:406`) ou no `tdb` aborta o run inteiro → empresas restantes do dia sem envio; Vercel cron não re-tenta.
- **Corrida**: duas invocações concorrentes passam no `mesmoDiaUTC` (check-then-act não atômico, sem lock) → envio duplicado nos 2 canais (`:288-289,374-380`).

### 1.4 Colaborador preso sem retry na IA4 ✅ (27/07 noite: upsert de notas ANTES do carimbo `avaliacao_ia`, variante-sem-notas vira falha retryable, fila inclui presas com aviso ao admin — **0 presas medidas em produção**)

- `respostas.avaliacao_ia` é gravado **antes** do upsert de `descriptor_assessments` (`actions/fase3.ts:285-293`). Se o upsert falha, a resposta consta avaliada mas não tem notas: o colaborador some da fila dos 100%, a trilha devolve `sem_assessment`, e `rodarIA4Uma` recusa reprocessar ("Já avaliada"); `rodarIA4`/`listarPendentesIA4` filtram `.is('avaliacao_ia', null)`. Preso sem retry self-service, sem aviso a ninguém (só `console.warn`, `:320-327`).
- Variante: IA4 retorna JSON válido **sem `avaliacao_por_descritor`** → média 0 → `nivel_ia4=1`/`nota_ia4=0` gravados, **zero** linhas em `descriptor_assessments` → mesmo aprisionamento, com nota N1 falsa de bônus (`fase3.ts:228,243-245,262,319`).

### 1.5 Duplicatas de conteúdo de kit com leitura não-determinística ✅ parcial (27/07: idempotência cega `6c0f12c0` + leitura determinística `ORDER BY created_at DESC, id DESC` nos 2 resolvedores — **escrita kit-side segue latente**: idempotência pulada para kit e sem UNIQUE cobrindo `kit_id NOT NULL`; **0 duplicatas kit-side medidas em 27/07**)

- `gerarConteudoIA` **pula a idempotência quando `kit` está presente** (`actions/conteudos.ts:119`) e `micro_conteudos` não tem UNIQUE (FMEA F-C6 — medido: 6 tuplas genéricas até 4×). O upsert reusa o `kitId`, então cada re-run empilha cópias; o overlay faz `formatos[c.formato] = …` **sem ORDER BY** (`lib/season-engine/kit/entrega-semana.ts:37-44,94-103`) → serve uma cópia **arbitrária**. Custo de IA + entrega não-determinística.

### 1.6 Renders de vídeo duplicados (custo direto) ✅ (27/07: F-C5 mig 188 + F-C7 mig 185)

- `dispararVideoDoKit`/`resolverCelulaVideo` são SELECT-then-INSERT sem UNIQUE em `videos_gerados` (`actions/gerar-video.ts:134-137,155-159`) → renders HeyGen duplicados. **Medido: 18 células, uma com 9 cópias** (FMEA F-C5, latente). Corrida de briefs idem: `idx_kit_briefs_tema` não-único + SELECT-then-INSERT em `resolverOuCriarBrief` (`lib/season-engine/kit/brief.ts:130-146`, FMEA F-C7).

### 2. Modos de falha relevantes (severidade média), por camada

### Camadas 0–3 (Insumos → Blueprint → Trilha)

- **IA com JSON inválido no blueprint** → erro "IA não retornou blueprint válido", sem retry de parse; o colaborador fica sem blueprint e ninguém é notificado; com a flag on, a trilha DUO **degrada em silêncio** para `selectDescriptorsDuo` (`lib/blueprint/core.ts:172-178`, `lib/season-engine/trilha-core.ts:378`).
- **IA fora durante `buildSeason`** ✅ 28/07 → o build **ABORTA** com erro acionável ("trilha não construída; rode de novo") + registra `missao-placeholder` crítico no `degradacao_log`. Antes: placeholder templated gravado no plano ("Missão pendente…") ia para produção, com sinal só em `console.warn`. **28/07 (varredura):** o corte passou a cobrir também **resposta 200 vazia/não-parseável** (`build-season.ts` — sem ele, a semana ia com missão/cenário em branco: o `catch` só cobria exceção).
- **DUO sem assessment da 2ª competência** ✅ 28/07 → **erro acionável** ("rode o mapeamento ou defina `programa_modo='regular_single'` explicitamente") + registro `duo-para-single`. Antes: fallback single **silencioso** — o colaborador recebia produto diferente do contratado, sem aviso (a trilha `regular_single` da Érica no Ibipeba nasceu desse caminho).
- **Sem assessment / sem foco do cargo** → erro explícito acionável (correto), mas **sem notificação proativa** — quem trava fica invisível até alguém olhar a fila (`trilha-core.ts:105-110`, `core.ts:120-122`).
- **Blueprint regenerado depois da trilha construída** → trilha é snapshot; PDI lê o blueprint ao vivo → **PDI e trilha divergem silenciosamente** até a próxima geração (`trilha-core.ts:370-376`, `actions/relatorios.ts:275`).
- **`regerarSemana` é read-modify-write do JSONB inteiro** → duas regens concorrentes → last-writer-wins perde uma edição; sem lock (`temporadas.ts:360-430`).
- **Corrida na 1ª geração de trilha** ✅ 27/07 (F-C1/F-C2: upsert do header + do progresso) → `persistirTrilha` lê-então-insere; `UNIQUE(empresa_id,colaborador_id)` faz o 2º falhar com erro cru; delete+insert de progresso não é transacional — falha entre os dois deixa a trilha sem linhas de progresso (`trilha-core.ts:536-577`).
- **Cargo renomeado/grafia diferente** → lookup por `eq('nome')` exato; divergência de caixa/espaço derruba o gate 6 ou degrada DUO→single (`core.ts:117-118`, `trilha-core.ts:312-313`).
- **Onboarding sem assessment de uma das 5 competências** → injeta `{descritor:'Descritor padrão', nota:1.5}` → semana busca conteúdo por descritor inexistente → fallback genérico silencioso (achado #8 do doc ✓, `trilha-core.ts:240-241`).
- **Duplo clique em "gerar blueprint em lote"** → `enqueueBlueprintBatch` não verifica job ativo → 2 batches concorrentes, custo dobrado (resultado idempotente via UPSERT) (`actions/ia-pipeline-batch.ts:77-83`).

### Camadas 4–5 (Micro-conteúdo → Kit)

- **Batch de IA falha no meio (lote 4 DISC)** → collector cai em síncrono por request; request individual falha → kit `status='error'`, mas o **job fecha `done`** se ≥1 DISC ok → pessoas do DISC afetado recebem genérico + desafio placeholder, degradação silenciosa fora do polling admin. Reparo manual via `planejarKitsCoorte` (`actions/kits.ts:132-136,246,397-403`, `trigger/gerar-kit.ts:35`, `lib/ai-batch.ts:187-192`).
- **Brief não sai (JSON inválido 3×)** → caminho sequencial re-tenta criar o brief **por DISC** (até 12 chamadas de IA) e todos falham → job `error`, zero kits (`kit/brief.ts:119-124`, `kits.ts:199,215-218`).
- **Falha parcial de formatos (1 de 3)** → kit `error`; os micro_conteudos que saíram ficam **órfãos presos ao kit** — build não os vê (`.is('kit_id',null)`), overlay exige `published`. Lixo invisível, sem retry.
- **Kit preso em `generating`** → crash/timeout entre o upsert inicial e o update final deixa a linha nesse estado **para sempre**; overlay ignora; re-run insere novos conteúdos no mesmo `kitId` (ver 1.5) (`kits.ts:98-101`).
- **`kit_jobs` preso em `running`/`queued`** → sem watchdog/sweeper; polling da tela desiste após **800×3s ≈ 40min em silêncio** (`app/admin/conteudos/kit/page.tsx:51-67`). Retry da task não declarado — não determinado no código.
- **Idempotência cega a `kit_id`** 🆕 ✅ 27/07 (`6c0f12c0` — `.is('kit_id', null)` na checagem) → a checagem "já existe" (`conteudos.ts:119-127`) **não filtra `kit_id IS NULL`**: se só existe conteúdo **de kit** para a célula, gerar o **genérico** retorna `skipped` com o id do conteúdo do kit → a célula genérica nunca nasce e o build fica sem core, com o admin vendo "já existe".
- **Overlay silenciosamente desligado** ✅ 27/07 (F-C4 — propaga erro + catch loga) → `precarregarKits` **ignora `error` das 3 queries** e devolve Map vazio truthy; o catch de `aplicarOverlayKit` segue sem telemetria. Uma falha do Supabase tira o kit de **toda a coorte** de uma vez — falha fechada (sem vazamento), mas perda total de personalização invisível (`entrega-semana.ts:67-80`, `temporadas.ts:467`).
- **Ungrounded silencioso ponta a ponta** → sem módulo-base publicado, degradam juntos e sem erro: micro-conteúdo (`conteudos.ts:166-169`), brief (`brief.ts:97`) e vídeo do kit (`kits.ts:127`, não conta no `okAll`). Um tema pode nascer 100% genérico e sem vídeo com job `done`/kit `published`. Medido: 1 brief ungrounded em produção.
- **Conteúdo faltando para a célula (competência×nível)** → build degrada nível; sem nada, semana nasce com `core_id: null` — UI tolera (FMEA F-I9 ✅) (`build-season.ts:491-495,548-559`).

### Camadas 6–7 (Entrega na leitura → Envio)

- **Kit inexistente para o DISC da pessoa** (ou DISC ausente/inválido) → overlay mantém genérico + desafio placeholder `"Aplique {descritor}…"`; silencioso na UI, só o admin vê via `anotarOrigemDisc` (`entrega-semana.ts:64,116`).
- **Vídeo `processing`/`render_queued` stale** → tela mostra "volte em alguns minutos" **para sempre** — sem detecção de stale nesse caminho (`semana/[week]/page.tsx:747-751`, `gerar-video.ts:155-176`). Vídeo `error` → chip some em silêncio (gracioso, mas ninguém é alertado).
- **Áudio do kit sem MP3** (overlay **não filtra `ativo`**) → chip aparece; rota tenta TTS on-demand (self-heal); TTS fora + sem áudio-base → **404 e player mudo** (`podcast/route.ts:90-117`, `entrega-semana.ts:37-43`).
- **Deep-link `?formato=audio` em semana sem áudio** → só vídeo tem correção; `fonteId` cai para `core_id` (um texto) → `<audio src=/api/conteudo/{idDeTexto}/podcast>` → 400 → player mudo (`page.tsx:645-652,756`, `podcast/route.ts:43`).
- **PDF sem genérico** (PDF headless falhou na geração e personalização falha) → aba nova com **JSON 404 cru** (`pdf/route.ts:20-24`, `conteudos.ts:953-958`).
- **Dois relógios sem reconciliação** 🆕 → `fase4_envios.semana_atual` (envio) × `data_inicio` (liberação): regenerar trilha empurra `data_inicio` mas **não toca** `semana_atual` → pílula linka semana N que o gate bloqueia no chat (403) mas exibe no conteúdo (`cron-jobs.ts:406` vs `trilha-core.ts:554`).
- **Deep-link sem auto-login** 🆕 → link é URL pura; deslogado, a week page redireciona a `/login` **sem `?redirect=`** (`page.tsx:93`) → após login cai em `/dashboard` e perde semana/formato (o login suporta `?redirect=`, `login-form.tsx:43-47`). **É o CTA principal de todo o envio.**
- **Texto da pílula promete o formato preferido** ✅ 27/07 (preflight diário verifica "o que ela promete existe?") ("Seu vídeo 🎬 de hoje") mesmo quando ele **não existe** na semana → clique não encontra o prometido (`pilula-envio.ts:49-52`, `cron-jobs.ts:333,361`).
- **Colaborador sem telefone e sem e-mail** → pílulas puladas, mas evidência carimba e `semana_atual+1` aplica → trilha avança, pessoa nunca notificada, zero telemetria (`cron-jobs.ts:374,379,406`).
- **Tenant demo** → só o e-mail é zerado (`:328`); WhatsApp depende de o demo não ter telefone cadastrado — fail-open confirmado: demo com `whatsapp` preenchido recebe WhatsApp real.
- **Pílula sem `envioId`** → webhook não aplica o guard anti-duplicado (`envios_diagnostico.status`); retry após falha ambígua pode duplicar (`webhooks/qstash/whatsapp-cis/route.ts:47-63`).
- **Nudge de inatividade (≥14 dias) é código morto** → `ultima_evidencia_em` é carimbada toda semana, logo `ultimoEnvio` nunca atinge 14 dias (`cron-jobs.ts:386-392`).
- **Kit/desafio reprocessado** → overlay é leitura viva: o desafio novo aparece **retroativamente** em semanas já consumidas, sem versionamento; pílulas já enviadas citam o tema antigo (`desafio-semana.ts:40-47`).
- **Regerar conteúdo com `forcar`** → sempre INSERT de nova linha → novo `contentId`: não-kit, o plano (snapshot) segue servindo o id VELHO para sempre; kit, velho+novo dividem o mesmo `kit_id` e as queries não têm ORDER BY → escolha não-determinística (`conteudos.ts:239`, `entrega-semana.ts:37-38`).
- **`?p=2` só serve para telemetria** → a 2ª pílula não é focada/scrollada (`page.tsx:271`).

### 3. Riscos estruturais (design)

1. ✅ 27/07 (F-I4 — filtro duplo `kit_id/disc IS NULL`, a `disc` virou filtro de verdade): **A invariante anti-vazamento DISC depende da única coluna que a FK apaga.** `micro_conteudos.kit_id` é `ON DELETE SET NULL` (`migrations/142:45`): apagar brief/kit sem apagar o conteúdo antes transforma conteúdo DISC-específico em "genérico" — e ele **volta a vazar no build**, porque o filtro SQL e `conteudosDoBuild` só olham `kit_id`. A coluna **`disc` denormalizada existe e sobreviveria ao SET NULL** (`migrations/142:48`), mas **nada a usa como filtro**; o teste de isolamento **não cobre** `{kit_id:null, disc:'D'}`. A defesa hoje é processual (ordem conteúdo→kits→brief) — e falha exatamente durante regerações, que é quando scripts mexem nessas tabelas (já mordeu: 6 pessoas sem core em 16/07).
2. **Snapshot congelado ponta a ponta.** `temporada_plano`, `descritores_selecionados`, `formatos_disponiveis`, binding e `programa_modo` são gravados no build; nova IA4, blueprint novo, foco alterado ou micro-conteúdo melhor **não refletem** em nada já construído. O sistema depende de disciplina operacional de "regerar na ordem certa", sem invalidação automática.
3. ✅ 28/07 (telemetria de degradação, mig 194): **Cadeia de degradação silenciosa de 4 níveis** (flag off → sem blueprint → adapter erro → DUO sem 2ª comp → single): cada degrau é "correto" isoladamente, mas o único vestígio persistido é `programa_modo='regular_single'`. **Sem telemetria de decisões do motor** — o ledger `ia_usage_log` cobre chamadas de IA, não degradações. Medir exige grepar `console.warn`. **Correção:** `degradacao_log` + `registrarDegradacao` (`lib/degradacao.ts`, nunca lança, dedup por chave com contador **por dia UTC** — a R10 lê 24h, e o acumulado histórico cruzava o limiar em operação normal: alarme crônico, corrigido na varredura de 28/07) em 10 pontos de fallback — `duo-para-single`, `blueprint-adapter-fallback`, `descritor-sem-avaliacao`, `onboarding-default-neutro`, `missao-placeholder` (crítico), `desafio-placeholder`, `conteudo-ausente`, `piloto-distribuicao-incompleta`, `sintese-ppp-falhou`, `kit-ausente-disc`. O health estrutural lê as últimas 24h toda madrugada (R10). Fallback continua existindo — só não é mais invisível. **11º ponto em 29/07: `kit-cargo-divergente`** — existe kit do tema E do DISC, mas só de outro cargo, e ele é barrado (ver §"Kit do cargo errado"). Tipo separado de propósito: a ação é gerar UMA célula, não escrever um tema, e no mesmo balde isso desapareceria dentro do maior.
4. ✅ parcial 29/07 (fronteira do KIT fechada; as outras normalizações seguem divergentes): **Match por string tolerante em ~5 fronteiras** (normalizações diferentes em `core.ts:31,181`, `to-descriptors.ts:53-61`, `audit.ts:52-53`, `desafio-semana.ts:26-27`): qualquer divergência de grafia (prefixo `CÓDIGO —`, acento, renomeação) degrada kit→genérico sem erro — já houve bug real disso. **Voltou a morder em 29/07, e no pior lugar:** `resolverDesafioDoKit` normalizava desde 20/07, mas quem roda em produção é o CACHE (`temporadas.ts` pré-carrega; o resolvedor individual só entra se o pré-carregamento falhar) — e `cacheKey` casava string CRUA, montada com o descritor do BRIEF e consultada com o do PLANO. **A correção estava no caminho que quase nunca executa.** Medido no `degradacao_log`: 29 leituras de 2 pessoas de ibipeba caindo em `kit-ausente-disc` com o kit publicado do DISC delas na prateleira. Fix: `cacheKey` passa por `normDescritor`. ⚠️ Lição além do bug: **ao corrigir um par de caminhos gêmeos, corrija o que o usuário percorre — e confirme qual é.**
5. ✅ 27/07 (F-I8 — virou DECISÃO de design: 1ª letra na geração é a célula de custo, combo completo no relatório): **DISC de 1 letra vs 2 letras** (FMEA F-I8, aberto): kit/overlay/vídeo usam `charAt(0)`; o PDF personalizado cacheia por slug multi-letra (`"DI"`, `"SC"`) — a mesma pessoa é "D" num formato e "DI" noutro (`entrega-semana.ts:63`, `conteudos.ts:880`).
6. **Build de trilha sem checkpoint**: ~6 chamadas de IA (timeout 120s cada) + N queries em memória; function morre no meio → nada persiste, retry refaz tudo (`build-season.ts:274-435`).
7. **Gravação de kit não-transacional em 3 tabelas** (brief → upsert kits → N inserts → update de status), sem saga nem UNIQUE nas folhas — qualquer morte no meio gera os estados presos (1.5, §2).
8. ✅ 04/08 (fan-out por empresa, `33221971`): **Cron monolítico** — o loop sequencial cross-tenant virou dispatcher: `triggerDiario` (lock diário mantido) filtra as empresas do dia e enfileira **1 task QStash por empresa** → worker `/api/webhooks/qstash/trigger-diario-empresa` (dual-auth internal/QStash, `maxDuration` 300, idempotente pelos carimbos por canal → erro = 5xx = retry seguro). N+1 de trilhas morto (`.in()` + redução em JS). Sem `QSTASH_TOKEN`, fallback inline (dev). ⚠️ Duas mudanças de comportamento a saber: o **delay de 2s/msg agora é intra-empresa** (era contador global entre empresas) e o **postflight roda após o ENFILEIRAMENTO**, não após os envios — a leitura "entregue hoje" só é completa minutos depois. (27/07 já tinha: lock diário F-C3 + try/catch por empresa + carimbo por canal.)
9. ✅ parcial 27/07 (paridade dos resolvedores `59b96755` + ORDER BY determinístico; **overlay não filtrar `ativo` segue ABERTO**): **Filtros divergentes entre caminhos gêmeos**: build filtra `ativo` e `kit_id null`; overlay não filtra `ativo`; `resolverKitDaSemana` exige `url`, `precarregarKits` não; sem ORDER BY nas duplicatas. Cada par de caminhos tem um caso em que divergem (`entrega-semana.ts:43,96-102`). ⚠️ **Terceira divergência achada em 29/07** (normalização do descritor — item 4). O `kit-entrega-paridade.test.ts` existia desde a segunda e **passou verde na terceira**: ele consultava o cache com o descritor do BRIEF, igual dos dois lados, então a divergência de grafia nunca era exercitada. O caso novo vai pelo CONSUMIDOR (`overlayKitNaSemana` com o descritor do plano) em vez de remontar a chave com a função da própria implementação — **teste de paridade que constrói a entrada dos dois lados do mesmo jeito não testa paridade nenhuma**.
10. **Dupla implementação de preferência de formato** (`formatoPreferido` × `derivarPrioridadeFormatos`) — mesma ideia, tie-breaking e consumidores diferentes (overlay × pílula) (`entrega-semana.ts:16`, `formato-preferido.ts:11`).
11. **Cache `empresas.kit_contexto` com invalidação estreita** — PPP editado no mesmo timestamp ou removido não invalida; falha da síntese cai no PPP mais recente sem cachear, oscilando o tom do kit (`contexto-empresa.ts:27,44-47`).
12. **Código morto que infla a sensação de cobertura**: check inalcançável em `trilha-core.ts:133-135`; check de auditoria `semana-vinculada` jamais falha porque o persist já barra; `normalizarSemanas` hardcoda `dia`/`label` para 2 entregas (armadilha futura para >2 pílulas/semana).

### 4. Divergências doc×código ✅ (corrigidas 27/07 noite — PIPELINE-TRILHA.md e KIT-SEMANAL.md atualizados item a item)

1. **"4 formatos + vídeo → micro_conteudos" é falso**: default são **3 formatos** (`FORMATOS_PADRAO = ['audio','texto','case']`, `actions/kits.ts:23`); o vídeo do kit **não é micro_conteudo nem passa por `gerarConteudoIA`** (é `dispararVideoDoKit` → `videos_gerados`, `kits.ts:122-128`, `gerar-video.ts:129-145`). Real: **12 micro_conteudos + 4 vídeos de célula** por brief. `KIT-SEMANAL.md` e o comentário da mig 142 ("16 conteúdos") também defasados.
2. **"Gate real na leitura" não existe para conteúdo** 🆕: `checarGatesSemana` (`trilha-runtime.ts:57-77`) só é chamado pelas 4 rotas de chat (reflection, evaluation, tira-duvidas, missao). `loadTemporada` e a week page **não gateiam** — semana futura é legível por URL direta; o dashboard só desabilita o clique (`temporada/page.tsx:161-162`).
3. **"Idempotente por dia"** omite o carimbo-on-failure (§1.2).
4. **"Qualquer erro → genérica. Nunca quebra a entrega" é forte demais**: sem genérico, PDF devolve JSON 404 cru; podcast sem TTS e sem áudio-base → 404 player mudo.
5. **Caminhos**: `lib/kit/*`/`lib/overlay*` → real `lib/season-engine/kit/*` (`enrich.ts`, `entrega-semana.ts`, `contexto-empresa.ts`). Linhas defasadas: overlay doc `:127` → real `entrega-semana.ts:133`; merge de formatos doc `:112` → real `:118`; filtros de nível doc `:107-108` → real `modulo-base-integration.ts:106-107`; cron doc `:292` → real `:291`.
6. **Origem do DISC superestimada**: `evolucao-granular.ts:303` não escreve DISC (é projeção de leitura). Escritores reais: `simulador-disc.ts:28` (demo) e import externo.
7. Menores: WhatsApp tem failover Z-API→WaSender (doc diz só Z-API); `drift = fails > 0` está em `audit.ts:280` (doc: :281).

### 5. O que está bem protegido

- Overlay **falha fechado** (sem kit do DISC → genérico do build, nunca outro perfil) e é aditivo/best-effort — nunca quebra a tela; isolamento DISC em **defesa dupla com teste de mutação no CI** (query `.is('kit_id',null)` + `conteudosDoBuild()` + caso real "Taluana/C × kit do D").
- Batch API com **fallback síncrono por request** — nunca perde conteúdo; `gerarKit`/`gerarKitSemanal` nunca lançam (falhas viram `status='error'` explícito); `kits` com `UNIQUE(brief_id,disc)` + upsert.
- Gates com `DomainError` acionável e `codigo` transportado; anti-viés sem default 1.5 em single/DUO/piloto; `callAI` com backoff + fallback de provedor.
- Podcast/PDF resolvem identidade pela sessão, checam tenant, cache correto (por colab / por arquétipo), fallback genérico; `marcarConteudoConsumido` com gate de posse.
- Webhook WhatsApp fail-closed em produção, 503-para-retry, failover de provedor; vídeo na entrega é `gerar=false` (custo contido); blueprint com UPSERT idempotente, nível autoritativo e auditoria genuinamente aditiva (nada consome `drift` como gate).

### 6. Prioridades sugeridas (status 27/07 noite)

1. ✅ **Envio (elo mais fraco)** — carimbo por canal, `publishToQStash` lança, try/catch por empresa, lock diário. 04/08: fan-out por empresa via QStash + carimbo WhatsApp pós-entrega (item 8 / §1.2). **Ressíduo ABERTO: catch-up do cron** (perdeu o dia, perdeu a pílula).
2. ✅ **Regerar sem destruir** — upsert estrutural (`5a405965`) + `regerarSemana` preserva e repara pelo motor (F-I2).
3. ✅ **Unicidade e determinismo** — UNIQUE em `micro_conteudos` não-kit (mig 190), `videos_gerados` (mig 188), `kit_briefs` (mig 185) + ORDER BY determinístico no overlay. Ressíduo latente: UNIQUE do lado kit.
4. ✅ **IA4** — reprocesso self-service quando `avaliacao_ia` existe sem notas + aviso ao admin (27/07 noite; 0 presas em produção).
5. ✅ **Anti-vazamento** — filtros migrados para `disc IS NULL` (F-I4); caso SET NULL coberto no teste de isolamento.
6. 🔴 **Deep-link — ABERTO**: week page redireciona a `/login` **sem `?redirect=`** (4× `router.replace('/login')`); após login a pessoa perde semana/formato. É o CTA principal de todo envio.
7. ✅ **Telemetria de degradação** (28/07, mig 194): `degradacao_log` + `registrarDegradacao` em 10 pontos de fallback; o estrutural lê 24h (R10).
8. ✅ **Doc** — as 7 divergências do §4 corrigidas em 27/07 noite (PIPELINE-TRILHA.md + KIT-SEMANAL.md).

---

## 7. Pegadinhas de geração e entrega de conteúdo (go-live Ibipeba, 13-15/07)

> Absorvido de `FMEA-PIPELINE.md` §7 em 27/07/2026. **Cada item custou um bug real.**
> Ler antes de gerar/publicar conteúdo (micro-conteúdos, áudio, vídeo) ou de mexer na trilha.
> Ver também `envs-importantes.md` (TTS/Vertex) e a memória `project_pdi_trilha_coerencia`.


### 1. Conteúdo nasce `ativo=false` (e o resolver só serve `ativo=true`)

`gerarConteudoIA` insere `micro_conteudos` **inativo**. `montarSemanaConteudo`
(`lib/season-engine/build-season.ts`) só considera `.eq('ativo', true)`. Então
**gerou ≠ apareceu** — tem que **ATIVAR** (`update micro_conteudos set ativo=true`).

Análogo (Módulo-Base): MB extraído nasce `status='revisao'`; o resolver só usa
`publicado` → **PUBLICAR o MB antes de gerar conteúdo**, senão sai *ungrounded*.

### 2. `formatos_disponiveis` é um SNAPSHOT congelado no plano da trilha

O plano (`trilhas.temporada_plano[].conteudos_dia[].conteudo.formatos_disponiveis`) é
tirado **no momento do build** da trilha. Conteúdo gerado/ativado **DEPOIS** do build
**não aparece** sozinho — o snapshot está velho.
→ Além de ativar, é preciso **REFRESCAR o snapshot** (re-resolver e adicionar o formato
ao `formatos_disponiveis` dos planos). Aditivo, **cargo-safe** (só o formato do cargo do
colab ou genérico — nunca de outro cargo).

**Receita de 4 passos para fechar gap de formato** (rodada em 27/07 para o áudio de
Autocuidado no Ibipeba). O que persiste é **esta receita**, não os scripts: `scripts/_*` é
uma mistura — 54 estão versionados e outros tantos só existem no disco de quem rodou, e os
da vez anterior se perderam, custando uma sessão de retrabalho. Se versionar um script `_*`
que usa `createSupabaseAdmin` ou lê tabela de PII, ele **precisa entrar nas allowlists** dos
guards (`service-role`, `tenant-read`) no MESMO commit — senão o CI fica vermelho (aconteceu
em `fc25fe36` com `_diag-orfaos-detalhe.ts`, corrigido em seguida):
1. **Gerar** — `gerarConteudoIA({formato, competencia, descritor, cargo, empresaId, sb})`
   headless, espelhando `nivel_min/max` e `contexto` do texto/case que já existe no par.
   Confirmar antes que o **MB está `publicado`** (pegadinha 1).
2. **Ativar** — nasce `ativo=false`.
3. **Refrescar o snapshot** — aditivo e cargo-safe, casando por `chaveDescritor`.
4. **Pré-gerar o MP3-base** via `POST /api/internal/pregerar-podcast` (`{id}` sem
   `colaboradorId`), com `x-internal-secret`. ~112s e ~5 MB por áudio (medido).
   O pré-aquecimento POR COLABORADOR (`{id, colaboradorId}`) é etapa separada, para perto
   da abertura da semana — antes disso a trilha pode mudar e o cache viraria lixo.

⚠️ **O descritor no plano vem com CÓDIGO** (`"COO03_D6 — Busca de apoio"`) e em
`micro_conteudos` vem só o nome (`"Busca de apoio"`). Casar os dois exige
**`chaveDescritor`** (`lib/descritores.ts`), que tira o código — uma normalização caseira
só de acento/caixa deixou **79 de 194 slots** sem casar, em silêncio (medido 27/07).
A `url` no snapshot pode ficar `null` sem prejuízo: o week page usa o **id**
(`/api/conteudo/{id}/podcast`) e só cai na url se não houver id.

### 2b. Idempotência de `gerarConteudoIA` confundia KIT com CORE ✅ (corrigido 27/07)

A query de "já existe" casava (empresa, competência, descritor, cargo, formato) **sem
`.is('kit_id', null)`**. Como conteúdo de kit é DISC-específico e sai só pelo overlay (o
build o exclui com esse mesmo filtro), um kit existente fazia a geração do **core** ser
pulada — e o retorno era **`success: true`**, então o gap nunca fechava e o operador via
sucesso. **Medido:** o áudio de kit de "Busca de apoio e rede" (Gestão Escolar, DISC D)
bloqueou o core do mesmo par; 13 das 15 pessoas do cargo (todo DISC ≠ D) ficariam sem
áudio naquele descritor. Guarda: `tests/unit/conteudo-idempotencia-kit.test.ts`
(validado por mutação).

### 3. `gerarConteudoIA` roda HEADLESS (bypassa o gate)

`gerarConteudoIA({..., sb })` — passar um `createSupabaseAdmin()` em `sb` pula o
`requireAdminSupabase`. Rodar via `tsx --env-file=.env.local`. Idempotente por
(empresa, competência, descritor, cargo, formato) — re-rodar pula os prontos.

### 4. Áudio/podcast é PRÉ-GERADO (não on-demand) — e o TTS é lento

- O podcast **não** deve ser TTS on-demand no play: o TTS leva **~145-175s** e estourava
  o `maxDuration` da rota (120s → 0:00/timeout). É **pré-gerado** e servido do cache/URL.
- **Personalizado com nome** (`"Olá, {nome}..."`) → o áudio precisa do nome no TTS, então
  é **por colaborador**: pré-aquece o cache `final/audio-personalizado/{conteudo}/{colab}.mp3`
  que `/api/conteudo/{id}/podcast` já lê. Base (sem nome) = fallback p/ admin.
- Gerar via a rota `/api/internal/pregerar-podcast` (roda no **runtime da Vercel**).
  ⚠️ **`lamejs` (encoder MP3) NÃO roda no tsx** — por isso a geração de áudio precisa
  do runtime Next (Vercel/Trigger), não dá pra rodar o TTS+MP3 num script tsx.
- **Vertex TTS no Vercel exige `GOOGLE_SERVICE_ACCOUNT_JSON`** (senão 500). AI Studio tem
  teto 100/dia (preview) → usar Vertex pro volume. Ver `envs-importantes.md`.

### 5. Rótulo das entregas = "Pílula N" (não dia da semana)

`conteudos_dia[].label`/`dia` já foi "Segunda/Terça-feira" hardcoded por índice, o que
**ignorava a cadência do tenant** (Ibipeba envia P2 na quarta). Hoje é **"Pílula N"**
(`build-season.ts`) — correto por índice, independe de cadência.

### 6. Regeneração desincronizava campos DERIVADOS → use `normalizarSemanas`

`descritores_cobertos` (título da semana) e os `label`/`dia` são **derivados** de
`conteudos_dia`. A regen (snapshot+reorder p/ preservar a comp1 já enviada) atualizava
`conteudos_dia` mas deixava `descritores_cobertos` velho → **título ≠ blocos**.
→ `persistirTrilha` (`lib/season-engine/trilha-core.ts`) chama **`normalizarSemanas()`**
que recomputa `descritores_cobertos`/`descritor`/`label`/`dia` de `conteudos_dia` sempre.
Qualquer script que mexa em `temporada_plano` deve rodar a mesma normalização.

### Como verificar (sempre por PRESENÇA, não por ausência)

- Conteúdo ativo? `select ativo, count(*) from micro_conteudos where ... group by ativo`.
- Aparece na trilha? Inspecionar `conteudos_dia[].conteudo.formatos_disponiveis` do plano
  (não a tabela `micro_conteudos` — o plano é snapshot).
- Áudio pré-gerado? Checar o arquivo no storage (`final/audio-personalizado/...` ou
  `final/podcast-base/...`) + `HEAD` na URL pública (200 + `audio/mpeg`).
- Erro da rota TTS? `mcp__vercel__get_runtime_logs` escopado ao `deploymentId`.

---


## Prioridação — o que ainda falta

> Revisada na auditoria de **27/07 (noite)**. Os itens 1-10, 13 e 16 da lista antiga foram
> executados no mesmo dia e saíram daqui — lista de prioridade que não encolhe manda refazer
> o que já está feito. O estado abaixo foi **medido no banco**, não herdado do texto anterior.

**Feito em 26-27/07 (verificado no banco na auditoria):** UNIQUE parcial em `videos_gerados`
(F-C5, mig 188) · UNIQUE parcial em `micro_conteudos` (F-C6, mig 190) · UNIQUE em `kit_briefs`
(F-C7, mig 185) · FKs em `development_blueprints` (F-I5, mig 191) · `data_inicio` preservado
(F-I1) · `precarregarKits` propaga erro (F-C4) · UPSERT do header (F-C1/F-C2) · carimbo
condicional + lock (F-C3, mig 187) · `regerarSemana` pelo motor (F-I2) · descritor canônico na
escrita + backfill (F-I6) · lote síncrono de temporadas depreciado (F-E4) · reconciliação de
vídeo nominal (F-V1) · contexto de PPP consolidado (F-I10/F-E7) · alarme de horizonte (F-I11)
· **retry self-service da IA4 p/ resposta avaliada sem notas (§6-1.4; 0 presas em prod)** ·
**leitura determinística do overlay com ORDER BY (§6-1.5; 0 duplicatas kit-side em prod)**.
**Medido agora:** 0 células de vídeo duplicadas · 0 `micro_conteudos` duplicados · 0
`kit_briefs` duplicados · 0 blueprints órfãos · 0 kits/jobs/vídeos presos · 0 respostas presas
na IA4 · 0 duplicatas do lado do kit.

**Escala (antes de crescer o tenant) — nada disso morde hoje:**
1. `triggerDiario` vira task/fan-out — F-E1 🔵
2. Chunkar `.in()`, paginar `listarTemporadasEmpresa`, cachear `precarregarKits` — F-E2/E3 🔵
3. Batch de blueprint no padrão destacado (`wait.for`) — F-E6 🔵
4. Teto de tempo próprio na personalização de vídeo — F-V2 🔵

**Código (pendências reais, pequenas):**
5. ~~`gerarBlueprintsLote`/`auditarBlueprintsLote` com loops síncronos de IA~~ ✅ **28/07** —
   stubs gated, zero callers confirmado antes de mexer (F-E4).
6. Decidir se cap de billing cai no fallback de provedor — F-E5 🟡 (hoje só erro transitório).
7. **Deep-link sem `?redirect=`** (§6, prioridade 6): 4× `router.replace('/login')` na week
   page — após login a pessoa perde semana/formato. CTA principal de todo envio.
8. **Catch-up do cron** (§6-1.3 residual): perdeu o dia (deploy, incidente), perdeu a pílula —
   lock e try/catch fecharam os vizinhos, isso não.
9. **Dois relógios sem reconciliação** (§6): regenerar trilha empurra `data_inicio` mas não
   toca `fase4_envios.semana_atual` — pílula pode linkar semana que o gate bloqueia no chat.
10. **Watchdog de presos de kit** (§6): `kits.generating` e `kit_jobs.running/queued` ficam
    presos para sempre (hoje 0, medido) — o estrutural acusa, mas nada destrava.
11. **Batch de kit fecha `done` com ≥1 DISC ok** (§6): pessoas do DISC falho recebem genérico
    em silêncio; reparo manual via `planejarKitsCoorte`.
12. ~~**Telemetria de degradação**~~ ✅ (28/07, mig 194): `degradacao_log` + `registrarDegradacao`
    (`lib/degradacao.ts`, dedup por chave com contador **por dia UTC**, nunca lança) em 10 pontos de fallback;
    o estrutural lê as últimas 24h toda madrugada (R10, `critico` em volume >50/dia ou
    `missao-placeholder`). Decisões do motor deixaram de ser invisíveis.

**Operação (runbook, sem código) — números medidos em 27/07 à noite:**
13. Nunca deletar MB publicado — despublicar (F-I3 🟡).
14. **4 `kit_briefs` sem módulo-base** — investigados um a um em 28/07, e **nenhum é corrigível
   sem dependência ou risco**. Reancorar o brief SEM regerar o conteúdo seria teatro: silencia o
   aviso e deixa o texto genérico. Por caso:
   - `ibipeba` · Liderança pedagógica / Desenvolvimento docente → **0 MB publicado do tema**;
     depende de extração de manuscrito.
   - `acme-demo` · Negociação e Fechamento / Criação de senso de urgência → **0 MB**; é tenant de
     demo com reset por cron, o brief se recria.
   - `projetomacae` · Postura Profissional / **Respeito às regras** → o resolver só acha
     "Comportamento em entrevista" a **0,43** (parcial-semântico). Regerar aqui **reproduziria o
     F-I12 de propósito** — ancorar no assunto vizinho. Precisa do MB do descritor.
   - `projetomacae` · Trabalho em Equipe / **Colaboração** → MB **exato (1.00)** existe, mas os 3
     conteúdos do kit **são o que o plano referencia** (9 slots; não há core equivalente — resíduo
     do F-I4). Corrigir = gerar o core, reapontar os 9 e refazer o kit — **no tenant que serve de
     ESTÚDIO dos vídeos instrucionais**, onde mudar o plano altera a tela no meio da gravação.
     Só com coordenação, nunca de repente.
15. **46 `videos_gerados` em `error`** — **decisão de 28/07: não limpar.** São invisíveis à entrega
   (índice parcial + `resolverCelulaVideo` filtra `status<>'error'`), e a limpeza não é gratuita:
   **1 tem `videos_personalizados` vinculado e 2 têm `bunny_video_id`** (asset hospedado). O
   histórico de falha tem valor diagnóstico e o custo de mantê-lo é zero — apagar seria trocar
   informação por um número mais bonito no painel.
16. **Vídeo da semana 5 do Ibipeba não foi gerado** (decisão do dono, 27-28/07): **42 células
   distintas** `(módulo × cargo × DISC)`, 0 slots sem MB. A ~$0,64-0,75 por render + box Hetzner,
   é a maior linha de custo em aberto do piloto. Hoje **ninguém tem vídeo nessa semana**, então
   não há regressão a evitar — é ganho novo, não reparo. Conteúdo (core + kit) está 100%.
17. ~~20 slots com core órfão + 49 formatos órfãos~~ ✅ **28/07** — os 20 pelo motor
   (`_reparar-core-orfao`), e os 22 slots de formato órfão com core VÁLIDO por saneamento
   dedicado (9 substituídos pelo equivalente ativo do cargo, 20 entradas removidas por não haver
   equivalente — anunciar formato inexistente é pior, o clique cai em 404). Origem: a dedup de
   27/07 reapontou `core_id` e **esqueceu** `formatos_disponiveis[].id`. **Medido depois: 0 e 0.**
   Regra que fica: quem mexe em `micro_conteudos` reaponta as DUAS referências JSONB.

**Verificação da própria instrumentação (o modo de falha mais irônico):**
16. ⚠️ Até 28/07 00:00 UTC a tabela `pipeline_health_runs` estava **VAZIA** — os quatro modos
    foram criados no dia e nenhum cron tinha passado ainda. Pior: **`ADMIN_EMAILS` não existia em
    nenhum ambiente**, então `alertar()` cairia no `console.error('ALERTA CRÍTICO SEM DESTINO')`
    e o e-mail nunca sairia. Corrigido na auditoria (env criada em Production; os modos rodados à
    mão via `scripts/_health-check.ts`). **Lição:** instrumentação nova só conta depois de uma
    execução observada de ponta a ponta — inclusive o canal de saída. Um alarme sem destinatário
    é a mesma "documentação que não protege ninguém" que este documento existe para criticar.
