# Análise de riscos — Pipeline da Trilha (17/07/2026)

Verificação do `docs/PIPELINE-TRILHA.md` contra o código, camada por camada (0–3 insumos→trilha, 4–5 conteúdo→kit, 6–7 entrega→envio). Método: leitura estática por 3 frentes paralelas, cada afirmação do doc conferida no código. Complementar ao `docs/FMEA-PIPELINE.md` — achados **novos** (não catalogados no FMEA) marcados 🆕.

## Veredito geral

O `PIPELINE-TRILHA.md` é **excepcionalmente fiel** (~50 referências `arquivo:linha` checadas, quase todas exatas: 7 gates, regra dos 100%, floor, override, UPSERT, auditoria 6+6, enforcement de gaps, persistência, week-gating, achados 1–11). Mas o pipeline tem um padrão de falha sistêmico: **degradação silenciosa** — quase toda falha vira conteúdo genérico, placeholder ou ausência, sem erro, sem alerta, sem telemetria. E o envio (camada 7) foi projetado no polo "nunca duplicar", pagando com **"às vezes nunca enviar"**.

## 1. Falhas de maior severidade

### 1.1 Regeneração destrói dados do colaborador

- Regenerar trilha faz `delete` da linha inteira de `temporada_semana_progresso` — apaga **reflexões, feedbacks e evidências**, não só o progresso (`lib/season-engine/trilha-core.ts:576`). O doc subestima ("reseta data_inicio e o progresso").
- `gerarTemporadasLote` regenera **todos** sem checar trilha existente (`actions/temporadas.ts:246-273`).
- `regerarSemana` zera `status/reflexao/feedback/conteudo_consumido` da semana — quem já concluiu perde o transcript e a semana destrava o Tira-Dúvidas (`actions/temporadas.ts:432-435`). Não re-seleciona conteúdo (armadilha 7 do doc ✓).

### 1.2 Pílula perdida para sempre em qualquer falha 🆕

- O carimbo `ultima_pilulaN_em` é gravado **mesmo quando WhatsApp E e-mail falham** (`actions/cron-jobs.ts:370` — stamp incondicional ao fim de `enviarPilulaDia`). A idempotência protege de duplicado, mas converte qualquer falha em perda permanente: sem retry, sem fila morta, sem alerta (erro só num contador de retorno).
- Agravante: `QSTASH_TOKEN` ausente → `publishToQStash` loga warn e **retorna sucesso** → `pilulas++` + carimbo, nada enviado. O canal WhatsApp inteiro morre em silêncio (`cron-jobs.ts:418-423`).

### 1.3 Cron sem catch-up e sem isolamento de falha 🆕

- Gates são `hoje===dia` (`cron-jobs.ts:303-306`): perdeu segunda → pílula 1 perdida; perdeu quinta (diaEv) → `semana_atual` não avança e `ultima_evidencia_em` não carimba → na semana seguinte **reenvia pílulas da mesma semana** (conteúdo repetido), e a trilha deriva do calendário porque o week-gating continua liberando por `data_inicio` (`:374-407`).
- **Sem try/catch por empresa/envio**: exceção no carimbo (`:370`,`:406`) ou no `tdb` aborta o run inteiro → empresas restantes do dia sem envio; Vercel cron não re-tenta.
- **Corrida**: duas invocações concorrentes passam no `mesmoDiaUTC` (check-then-act não atômico, sem lock) → envio duplicado nos 2 canais (`:288-289,374-380`).

### 1.4 Colaborador preso sem retry na IA4

- `respostas.avaliacao_ia` é gravado **antes** do upsert de `descriptor_assessments` (`actions/fase3.ts:285-293`). Se o upsert falha, a resposta consta avaliada mas não tem notas: o colaborador some da fila dos 100%, a trilha devolve `sem_assessment`, e `rodarIA4Uma` recusa reprocessar ("Já avaliada"); `rodarIA4`/`listarPendentesIA4` filtram `.is('avaliacao_ia', null)`. Preso sem retry self-service, sem aviso a ninguém (só `console.warn`, `:320-327`).
- Variante: IA4 retorna JSON válido **sem `avaliacao_por_descritor`** → média 0 → `nivel_ia4=1`/`nota_ia4=0` gravados, **zero** linhas em `descriptor_assessments` → mesmo aprisionamento, com nota N1 falsa de bônus (`fase3.ts:228,243-245,262,319`).

### 1.5 Duplicatas de conteúdo de kit com leitura não-determinística

- `gerarConteudoIA` **pula a idempotência quando `kit` está presente** (`actions/conteudos.ts:119`) e `micro_conteudos` não tem UNIQUE (FMEA F-C6 — medido: 6 tuplas genéricas até 4×). O upsert reusa o `kitId`, então cada re-run empilha cópias; o overlay faz `formatos[c.formato] = …` **sem ORDER BY** (`lib/season-engine/kit/entrega-semana.ts:37-44,94-103`) → serve uma cópia **arbitrária**. Custo de IA + entrega não-determinística.

### 1.6 Renders de vídeo duplicados (custo direto)

- `dispararVideoDoKit`/`resolverCelulaVideo` são SELECT-then-INSERT sem UNIQUE em `videos_gerados` (`actions/gerar-video.ts:134-137,155-159`) → renders HeyGen duplicados. **Medido: 18 células, uma com 9 cópias** (FMEA F-C5, latente). Corrida de briefs idem: `idx_kit_briefs_tema` não-único + SELECT-then-INSERT em `resolverOuCriarBrief` (`lib/season-engine/kit/brief.ts:130-146`, FMEA F-C7).

## 2. Modos de falha relevantes (severidade média), por camada

### Camadas 0–3 (Insumos → Blueprint → Trilha)

- **IA com JSON inválido no blueprint** → erro "IA não retornou blueprint válido", sem retry de parse; o colaborador fica sem blueprint e ninguém é notificado; com a flag on, a trilha DUO **degrada em silêncio** para `selectDescriptorsDuo` (`lib/blueprint/core.ts:172-178`, `lib/season-engine/trilha-core.ts:378`).
- **IA fora durante `buildSeason`** → placeholder templated gravado no plano ("Missão pendente…"), trilha vai para produção assim; sinal só em `console.warn` (`lib/season-engine/build-season.ts:600-646`).
- **DUO sem assessment da 2ª competência** → fallback single **silencioso**; o colaborador recebe produto diferente do contratado, sem aviso ao admin (`trilha-core.ts:354-358`, carimbo `regular_single`).
- **Sem assessment / sem foco do cargo** → erro explícito acionável (correto), mas **sem notificação proativa** — quem trava fica invisível até alguém olhar a fila (`trilha-core.ts:105-110`, `core.ts:120-122`).
- **Blueprint regenerado depois da trilha construída** → trilha é snapshot; PDI lê o blueprint ao vivo → **PDI e trilha divergem silenciosamente** até a próxima geração (`trilha-core.ts:370-376`, `actions/relatorios.ts:275`).
- **`regerarSemana` é read-modify-write do JSONB inteiro** → duas regens concorrentes → last-writer-wins perde uma edição; sem lock (`temporadas.ts:360-430`).
- **Corrida na 1ª geração de trilha** → `persistirTrilha` lê-então-insere; `UNIQUE(empresa_id,colaborador_id)` faz o 2º falhar com erro cru; delete+insert de progresso não é transacional — falha entre os dois deixa a trilha sem linhas de progresso (`trilha-core.ts:536-577`).
- **Cargo renomeado/grafia diferente** → lookup por `eq('nome')` exato; divergência de caixa/espaço derruba o gate 6 ou degrada DUO→single (`core.ts:117-118`, `trilha-core.ts:312-313`).
- **Onboarding sem assessment de uma das 5 competências** → injeta `{descritor:'Descritor padrão', nota:1.5}` → semana busca conteúdo por descritor inexistente → fallback genérico silencioso (achado #8 do doc ✓, `trilha-core.ts:240-241`).
- **Duplo clique em "gerar blueprint em lote"** → `enqueueBlueprintBatch` não verifica job ativo → 2 batches concorrentes, custo dobrado (resultado idempotente via UPSERT) (`actions/ia-pipeline-batch.ts:77-83`).

### Camadas 4–5 (Micro-conteúdo → Kit)

- **Batch de IA falha no meio (lote 4 DISC)** → collector cai em síncrono por request; request individual falha → kit `status='error'`, mas o **job fecha `done`** se ≥1 DISC ok → pessoas do DISC afetado recebem genérico + desafio placeholder, degradação silenciosa fora do polling admin. Reparo manual via `planejarKitsCoorte` (`actions/kits.ts:132-136,246,397-403`, `trigger/gerar-kit.ts:35`, `lib/ai-batch.ts:187-192`).
- **Brief não sai (JSON inválido 3×)** → caminho sequencial re-tenta criar o brief **por DISC** (até 12 chamadas de IA) e todos falham → job `error`, zero kits (`kit/brief.ts:119-124`, `kits.ts:199,215-218`).
- **Falha parcial de formatos (1 de 3)** → kit `error`; os micro_conteudos que saíram ficam **órfãos presos ao kit** — build não os vê (`.is('kit_id',null)`), overlay exige `published`. Lixo invisível, sem retry.
- **Kit preso em `generating`** → crash/timeout entre o upsert inicial e o update final deixa a linha nesse estado **para sempre**; overlay ignora; re-run insere novos conteúdos no mesmo `kitId` (ver 1.5) (`kits.ts:98-101`).
- **`kit_jobs` preso em `running`/`queued`** → sem watchdog/sweeper; polling da tela desiste após **800×3s ≈ 40min em silêncio** (`app/admin/conteudos/kit/page.tsx:51-67`). Retry da task não declarado — não determinado no código.
- **Idempotência cega a `kit_id`** 🆕 → a checagem "já existe" (`conteudos.ts:119-127`) **não filtra `kit_id IS NULL`**: se só existe conteúdo **de kit** para a célula, gerar o **genérico** retorna `skipped` com o id do conteúdo do kit → a célula genérica nunca nasce e o build fica sem core, com o admin vendo "já existe".
- **Overlay silenciosamente desligado** (FMEA F-C4, não corrigido) → `precarregarKits` **ignora `error` das 3 queries** e devolve Map vazio truthy; o catch de `aplicarOverlayKit` segue sem telemetria. Uma falha do Supabase tira o kit de **toda a coorte** de uma vez — falha fechada (sem vazamento), mas perda total de personalização invisível (`entrega-semana.ts:67-80`, `temporadas.ts:467`).
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
- **Texto da pílula promete o formato preferido** ("Seu vídeo 🎬 de hoje") mesmo quando ele **não existe** na semana → clique não encontra o prometido (`pilula-envio.ts:49-52`, `cron-jobs.ts:333,361`).
- **Colaborador sem telefone e sem e-mail** → pílulas puladas, mas evidência carimba e `semana_atual+1` aplica → trilha avança, pessoa nunca notificada, zero telemetria (`cron-jobs.ts:374,379,406`).
- **Tenant demo** → só o e-mail é zerado (`:328`); WhatsApp depende de o demo não ter telefone cadastrado — fail-open confirmado: demo com `whatsapp` preenchido recebe WhatsApp real.
- **Pílula sem `envioId`** → webhook não aplica o guard anti-duplicado (`envios_diagnostico.status`); retry após falha ambígua pode duplicar (`webhooks/qstash/whatsapp-cis/route.ts:47-63`).
- **Nudge de inatividade (≥14 dias) é código morto** → `ultima_evidencia_em` é carimbada toda semana, logo `ultimoEnvio` nunca atinge 14 dias (`cron-jobs.ts:386-392`).
- **Kit/desafio reprocessado** → overlay é leitura viva: o desafio novo aparece **retroativamente** em semanas já consumidas, sem versionamento; pílulas já enviadas citam o tema antigo (`desafio-semana.ts:40-47`).
- **Regerar conteúdo com `forcar`** → sempre INSERT de nova linha → novo `contentId`: não-kit, o plano (snapshot) segue servindo o id VELHO para sempre; kit, velho+novo dividem o mesmo `kit_id` e as queries não têm ORDER BY → escolha não-determinística (`conteudos.ts:239`, `entrega-semana.ts:37-38`).
- **`?p=2` só serve para telemetria** → a 2ª pílula não é focada/scrollada (`page.tsx:271`).

## 3. Riscos estruturais (design)

1. **A invariante anti-vazamento DISC depende da única coluna que a FK apaga.** `micro_conteudos.kit_id` é `ON DELETE SET NULL` (`migrations/142:45`): apagar brief/kit sem apagar o conteúdo antes transforma conteúdo DISC-específico em "genérico" — e ele **volta a vazar no build**, porque o filtro SQL e `conteudosDoBuild` só olham `kit_id`. A coluna **`disc` denormalizada existe e sobreviveria ao SET NULL** (`migrations/142:48`), mas **nada a usa como filtro**; o teste de isolamento **não cobre** `{kit_id:null, disc:'D'}`. A defesa hoje é processual (ordem conteúdo→kits→brief) — e falha exatamente durante regerações, que é quando scripts mexem nessas tabelas (já mordeu: 6 pessoas sem core em 16/07).
2. **Snapshot congelado ponta a ponta.** `temporada_plano`, `descritores_selecionados`, `formatos_disponiveis`, binding e `programa_modo` são gravados no build; nova IA4, blueprint novo, foco alterado ou micro-conteúdo melhor **não refletem** em nada já construído. O sistema depende de disciplina operacional de "regerar na ordem certa", sem invalidação automática.
3. **Cadeia de degradação silenciosa de 4 níveis** (flag off → sem blueprint → adapter erro → DUO sem 2ª comp → single): cada degrau é "correto" isoladamente, mas o único vestígio persistido é `programa_modo='regular_single'`. **Sem telemetria de decisões do motor** — o ledger `ia_usage_log` cobre chamadas de IA, não degradações. Medir exige grepar `console.warn`.
4. **Match por string tolerante em ~5 fronteiras** (normalizações diferentes em `core.ts:31,181`, `to-descriptors.ts:53-61`, `audit.ts:52-53`, `desafio-semana.ts:26-27`): qualquer divergência de grafia (prefixo `CÓDIGO —`, acento, renomeação) degrada kit→genérico sem erro — já houve bug real disso.
5. **DISC de 1 letra vs 2 letras** (FMEA F-I8, aberto): kit/overlay/vídeo usam `charAt(0)`; o PDF personalizado cacheia por slug multi-letra (`"DI"`, `"SC"`) — a mesma pessoa é "D" num formato e "DI" noutro (`entrega-semana.ts:63`, `conteudos.ts:880`).
6. **Build de trilha sem checkpoint**: ~6 chamadas de IA (timeout 120s cada) + N queries em memória; function morre no meio → nada persiste, retry refaz tudo (`build-season.ts:274-435`).
7. **Gravação de kit não-transacional em 3 tabelas** (brief → upsert kits → N inserts → update de status), sem saga nem UNIQUE nas folhas — qualquer morte no meio gera os estados presos (1.5, §2).
8. **Cron monolítico**: um loop cross-tenant sem isolamento de falha, sem lock, sem retry, dependente de 4 segredos cujos modos de ausência são silenciosos ou fail-open só em dev.
9. **Filtros divergentes entre caminhos gêmeos**: build filtra `ativo` e `kit_id null`; overlay não filtra `ativo`; `resolverKitDaSemana` exige `url`, `precarregarKits` não; sem ORDER BY nas duplicatas. Cada par de caminhos tem um caso em que divergem (`entrega-semana.ts:43,96-102`).
10. **Dupla implementação de preferência de formato** (`formatoPreferido` × `derivarPrioridadeFormatos`) — mesma ideia, tie-breaking e consumidores diferentes (overlay × pílula) (`entrega-semana.ts:16`, `formato-preferido.ts:11`).
11. **Cache `empresas.kit_contexto` com invalidação estreita** — PPP editado no mesmo timestamp ou removido não invalida; falha da síntese cai no PPP mais recente sem cachear, oscilando o tom do kit (`contexto-empresa.ts:27,44-47`).
12. **Código morto que infla a sensação de cobertura**: check inalcançável em `trilha-core.ts:133-135`; check de auditoria `semana-vinculada` jamais falha porque o persist já barra; `normalizarSemanas` hardcoda `dia`/`label` para 2 entregas (armadilha futura para >2 pílulas/semana).

## 4. Divergências doc×código (corrigir no PIPELINE-TRILHA.md)

1. **"4 formatos + vídeo → micro_conteudos" é falso**: default são **3 formatos** (`FORMATOS_PADRAO = ['audio','texto','case']`, `actions/kits.ts:23`); o vídeo do kit **não é micro_conteudo nem passa por `gerarConteudoIA`** (é `dispararVideoDoKit` → `videos_gerados`, `kits.ts:122-128`, `gerar-video.ts:129-145`). Real: **12 micro_conteudos + 4 vídeos de célula** por brief. `KIT-SEMANAL.md` e o comentário da mig 142 ("16 conteúdos") também defasados.
2. **"Gate real na leitura" não existe para conteúdo** 🆕: `checarGatesSemana` (`trilha-runtime.ts:57-77`) só é chamado pelas 4 rotas de chat (reflection, evaluation, tira-duvidas, missao). `loadTemporada` e a week page **não gateiam** — semana futura é legível por URL direta; o dashboard só desabilita o clique (`temporada/page.tsx:161-162`).
3. **"Idempotente por dia"** omite o carimbo-on-failure (§1.2).
4. **"Qualquer erro → genérica. Nunca quebra a entrega" é forte demais**: sem genérico, PDF devolve JSON 404 cru; podcast sem TTS e sem áudio-base → 404 player mudo.
5. **Caminhos**: `lib/kit/*`/`lib/overlay*` → real `lib/season-engine/kit/*` (`enrich.ts`, `entrega-semana.ts`, `contexto-empresa.ts`). Linhas defasadas: overlay doc `:127` → real `entrega-semana.ts:133`; merge de formatos doc `:112` → real `:118`; filtros de nível doc `:107-108` → real `modulo-base-integration.ts:106-107`; cron doc `:292` → real `:291`.
6. **Origem do DISC superestimada**: `evolucao-granular.ts:303` não escreve DISC (é projeção de leitura). Escritores reais: `simulador-disc.ts:28` (demo) e import externo.
7. Menores: WhatsApp tem failover Z-API→WaSender (doc diz só Z-API); `drift = fails > 0` está em `audit.ts:280` (doc: :281).

## 5. O que está bem protegido

- Overlay **falha fechado** (sem kit do DISC → genérico do build, nunca outro perfil) e é aditivo/best-effort — nunca quebra a tela; isolamento DISC em **defesa dupla com teste de mutação no CI** (query `.is('kit_id',null)` + `conteudosDoBuild()` + caso real "Taluana/C × kit do D").
- Batch API com **fallback síncrono por request** — nunca perde conteúdo; `gerarKit`/`gerarKitSemanal` nunca lançam (falhas viram `status='error'` explícito); `kits` com `UNIQUE(brief_id,disc)` + upsert.
- Gates com `DomainError` acionável e `codigo` transportado; anti-viés sem default 1.5 em single/DUO/piloto; `callAI` com backoff + fallback de provedor.
- Podcast/PDF resolvem identidade pela sessão, checam tenant, cache correto (por colab / por arquétipo), fallback genérico; `marcarConteudoConsumido` com gate de posse.
- Webhook WhatsApp fail-closed em produção, 503-para-retry, failover de provedor; vídeo na entrega é `gerar=false` (custo contido); blueprint com UPSERT idempotente, nível autoritativo e auditoria genuinamente aditiva (nada consome `drift` como gate).

## 6. Prioridades sugeridas

1. **Envio (elo mais fraco)**: não carimbar quando ambos os canais falharem; `publishToQStash` retornar erro de verdade; try/catch por empresa; catch-up do cron; lock/claim atômico do run.
2. **Regerar sem destruir**: trocar o `delete` de progresso por arquivamento/soft-reset que preserve reflexões e evidências (trilha inteira e `regerarSemana`).
3. **Unicidade e determinismo**: UNIQUE em `micro_conteudos (kit_id, competencia, descritor, formato)` + ORDER BY no overlay; UNIQUE em `videos_gerados` por célula; UNIQUE em `kit_briefs(tema)`.
4. **IA4**: permitir reprocesso quando `avaliacao_ia` existe mas não há linhas em `descriptor_assessments` (e alertar o admin).
5. **Anti-vazamento**: migrar filtros para `disc IS NULL` (ou `origem_disc`) em vez de `kit_id IS NULL`; cobrir o caso SET NULL no teste de isolamento.
6. **Deep-link**: week page redirecionar a `/login?redirect=<url completa>` (preserva semana/formato — CTA principal do envio).
7. **Telemetria de degradação**: registrar decisões do motor (fallback de blueprint, DUO→single, kit ausente, ungrounded) em tabela ou log estruturado — hoje invisíveis.
8. **Doc**: corrigir as 7 divergências do §4 no PIPELINE-TRILHA.md (e o "16 conteúdos" do KIT-SEMANAL.md).
