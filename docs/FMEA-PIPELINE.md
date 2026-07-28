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
> | `postflight` | junto com `trigger_diario` | "o que dizia que ia sair, saiu?" |
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
- **Ressalva (follow-up):** `gerarBlueprintsLote`/`auditarBlueprintsLote` (`actions/blueprint.ts`)
  **seguem com loops síncronos de IA** — mesma receita pendente (stub + a fila client que já existe
  para ambos). Não fechados nesta rodada.

### F-E5 · Cap de conta Anthropic **não** cai no fallback 🟡
- **Gatilho:** o fallback gpt-5.4 só dispara em erro **transitório** (`ai-client.ts:153`,
  `isTransientAIError` = 429/503/529). Um cap de billing (400/403) **não** casa → re-lança → toda a
  fase de IA falha sem degradar.
- **Resolução:** decidir se cap deve cair no fallback (ampliar `isTransientAIError`) ou falhar limpo
  com mensagem clara. **Não determinado** se é intencional. (Um 429 de rate-limit **sim** cai no
  fallback — só o cap não.)

### F-E6 · Batch de blueprint usa `submitClaudeBatch` INLINE (segura o maxDuration) 🔵
- **Gatilho:** `gerar-blueprint-batch.ts` usa o batch **inline** (budget 40min dentro da task de
  `maxDuration:3600`), não o **destacado** (`createClaudeBatch` + `wait.for`, budget 24h) que
  `gerar-modulos-manuscrito` usa. Janela lenta da Batch API → fallback síncrono serial → task expira.
- **Resolução:** migrar blueprint para o padrão **destacado** com `wait.for`.

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

---

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

### 1.2 Pílula perdida para sempre em qualquer falha 🆕 ✅ (27/07: carimbo POR CANAL — `carimbo-canal.ts`, nada saiu → sem carimbo — + `publishToQStash` lançando, `0a188172`)

- O carimbo `ultima_pilulaN_em` é gravado **mesmo quando WhatsApp E e-mail falham** (`actions/cron-jobs.ts:370` — stamp incondicional ao fim de `enviarPilulaDia`). A idempotência protege de duplicado, mas converte qualquer falha em perda permanente: sem retry, sem fila morta, sem alerta (erro só num contador de retorno).
- Agravante: `QSTASH_TOKEN` ausente → `publishToQStash` loga warn e **retorna sucesso** → `pilulas++` + carimbo, nada enviado. O canal WhatsApp inteiro morre em silêncio (`cron-jobs.ts:418-423`).

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
- **IA fora durante `buildSeason`** → placeholder templated gravado no plano ("Missão pendente…"), trilha vai para produção assim; sinal só em `console.warn` (`lib/season-engine/build-season.ts:600-646`).
- **DUO sem assessment da 2ª competência** → fallback single **silencioso**; o colaborador recebe produto diferente do contratado, sem aviso ao admin (`trilha-core.ts:354-358`, carimbo `regular_single`).
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
3. **Cadeia de degradação silenciosa de 4 níveis** (flag off → sem blueprint → adapter erro → DUO sem 2ª comp → single): cada degrau é "correto" isoladamente, mas o único vestígio persistido é `programa_modo='regular_single'`. **Sem telemetria de decisões do motor** — o ledger `ia_usage_log` cobre chamadas de IA, não degradações. Medir exige grepar `console.warn`.
4. **Match por string tolerante em ~5 fronteiras** (normalizações diferentes em `core.ts:31,181`, `to-descriptors.ts:53-61`, `audit.ts:52-53`, `desafio-semana.ts:26-27`): qualquer divergência de grafia (prefixo `CÓDIGO —`, acento, renomeação) degrada kit→genérico sem erro — já houve bug real disso.
5. ✅ 27/07 (F-I8 — virou DECISÃO de design: 1ª letra na geração é a célula de custo, combo completo no relatório): **DISC de 1 letra vs 2 letras** (FMEA F-I8, aberto): kit/overlay/vídeo usam `charAt(0)`; o PDF personalizado cacheia por slug multi-letra (`"DI"`, `"SC"`) — a mesma pessoa é "D" num formato e "DI" noutro (`entrega-semana.ts:63`, `conteudos.ts:880`).
6. **Build de trilha sem checkpoint**: ~6 chamadas de IA (timeout 120s cada) + N queries em memória; function morre no meio → nada persiste, retry refaz tudo (`build-season.ts:274-435`).
7. **Gravação de kit não-transacional em 3 tabelas** (brief → upsert kits → N inserts → update de status), sem saga nem UNIQUE nas folhas — qualquer morte no meio gera os estados presos (1.5, §2).
8. ✅ parcial 27/07 (lock diário F-C3 + try/catch por empresa + carimbo por canal; o loop inline cross-tenant segue = F-E1 🔵): **Cron monolítico**: um loop cross-tenant sem isolamento de falha, sem lock, sem retry, dependente de 4 segredos cujos modos de ausência são silenciosos ou fail-open só em dev.
9. ✅ parcial 27/07 (paridade dos resolvedores `59b96755` + ORDER BY determinístico; **overlay não filtrar `ativo` segue ABERTO**): **Filtros divergentes entre caminhos gêmeos**: build filtra `ativo` e `kit_id null`; overlay não filtra `ativo`; `resolverKitDaSemana` exige `url`, `precarregarKits` não; sem ORDER BY nas duplicatas. Cada par de caminhos tem um caso em que divergem (`entrega-semana.ts:43,96-102`).
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

1. ✅ **Envio (elo mais fraco)** — carimbo por canal, `publishToQStash` lança, try/catch por empresa, lock diário. **Ressíduo ABERTO: catch-up do cron** (perdeu o dia, perdeu a pílula).
2. ✅ **Regerar sem destruir** — upsert estrutural (`5a405965`) + `regerarSemana` preserva e repara pelo motor (F-I2).
3. ✅ **Unicidade e determinismo** — UNIQUE em `micro_conteudos` não-kit (mig 190), `videos_gerados` (mig 188), `kit_briefs` (mig 185) + ORDER BY determinístico no overlay. Ressíduo latente: UNIQUE do lado kit.
4. ✅ **IA4** — reprocesso self-service quando `avaliacao_ia` existe sem notas + aviso ao admin (27/07 noite; 0 presas em produção).
5. ✅ **Anti-vazamento** — filtros migrados para `disc IS NULL` (F-I4); caso SET NULL coberto no teste de isolamento.
6. 🔴 **Deep-link — ABERTO**: week page redireciona a `/login` **sem `?redirect=`** (4× `router.replace('/login')`); após login a pessoa perde semana/formato. É o CTA principal de todo envio.
7. 🔴 **Telemetria de degradação — ABERTO (design)**: decisões do motor (fallback de blueprint, DUO→single, kit ausente, ungrounded) seguem invisíveis.
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
5. `gerarBlueprintsLote`/`auditarBlueprintsLote` seguem com loops síncronos de IA — mesma
   receita do F-E4 (stub + a fila client que já existe). **Ressalva declarada, não fechada.**
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
12. **Telemetria de degradação** (§6-3.3, design): decisões do motor (fallback de blueprint,
    DUO→single, kit ausente, ungrounded) invisíveis — medir exige grepar `console.warn`.

**Operação (runbook, sem código) — números medidos em 27/07 à noite:**
13. Nunca deletar MB publicado — despublicar (F-I3 🟡).
14. **4 `kit_briefs` sem módulo-base** (ibipeba, projetomacae ×2, acme-demo) — cada um tem 1 kit
   publicado nascido sem matéria-prima canônica. O check estrutural acusa como aviso toda
   madrugada. Não é o "1" que a lista antiga citava.
15. **46 `videos_gerados` em `error`** + 1 personalizado em error — resíduo permitido pelo índice
   parcial e invisível à entrega; limpar é higiene, não correção.

**Verificação da própria instrumentação (o modo de falha mais irônico):**
16. ⚠️ Até 28/07 00:00 UTC a tabela `pipeline_health_runs` estava **VAZIA** — os quatro modos
    foram criados no dia e nenhum cron tinha passado ainda. Pior: **`ADMIN_EMAILS` não existia em
    nenhum ambiente**, então `alertar()` cairia no `console.error('ALERTA CRÍTICO SEM DESTINO')`
    e o e-mail nunca sairia. Corrigido na auditoria (env criada em Production; os modos rodados à
    mão via `scripts/_health-check.ts`). **Lição:** instrumentação nova só conta depois de uma
    execução observada de ponta a ponta — inclusive o canal de saída. Um alarme sem destinatário
    é a mesma "documentação que não protege ninguém" que este documento existe para criticar.
