# FMEA — modos de falha do pipeline da trilha

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

---

## 1. Concorrência & corrida

### F-C1 · Regeneração concorrente sobrescreve o plano (lost-update) 🟠
- **Gatilho:** 2 admins, ou lote + clique, regeneram a mesma trilha. `persistirTrilha` faz
  SELECT-then-UPDATE **sem lock nem versão** (`trilha-core.ts:536-566`). `trilhas` tem
  `UNIQUE(empresa_id,colaborador_id)` mas o código não a usa como upsert.
- **Efeito:** last-write-wins no `temporada_plano`; `data_inicio` reempurrado 2×; progresso zerado.
- **Detecção:** nenhuma — retorna `ok:true`.
- **Resolução:** **UPSERT com `onConflict:'empresa_id,colaborador_id'`** (como `development_blueprints`
  já faz), OU coluna `versao` + `.eq('versao', lido)` no UPDATE (optimistic lock). Rejeitar a 2ª
  gravação em vez de perder a 1ª.

### F-C2 · Plano e progresso de runs diferentes (delete+insert não-atômico) 🟠
- **Gatilho:** regen concorrente. `temporada_semana_progresso` faz `delete()` + `insert()` em
  statements separados (`trilha-core.ts:576-577`), **sem capturar erro** (contraste com `:560/:564`).
  Interleave `A.delete→B.delete→A.insert→B.insert`: o insert de B colide no `UNIQUE(trilha_id,semana)`
  e **falha inteiro, silenciosamente**.
- **Efeito:** `temporada_plano` reflete run B, `temporada_semana_progresso` reflete run A — "título ≠
  blocos" um nível acima (plano ≠ progresso), com `ok:true`.
- **Resolução:** capturar o erro do insert de progresso e propagar; idealmente `upsert` do progresso
  por `(trilha_id,semana)`; a médio prazo, envolver plano+progresso numa **função RPC transacional**
  (o único ponto do pipeline que precisa de transação multi-statement).

### F-C3 · Duplo-envio de pílula (TOCTOU nos carimbos) 🟡
- **Gatilho:** `triggerDiario` sobreposto a si mesmo (retry do Vercel num timeout, ou disparo manual
  de `trigger_diario`/`trigger_segunda` concorrente). O check lê `ultima_pilula1_em` em T0
  (`cron-jobs.ts:314,374`) e só carimba **depois** de publicar (`:363` publish → `:370` stamp), sem
  `WHERE` condicional. Duas execuções leem `null`, ambas enviam.
- **Efeito:** pílula 2× (WhatsApp + e-mail); pior, o **avanço de semana** (`semana_atual+1`, `:409`)
  2× → **pula conteúdo** (o bug que a mig 120 só fechou pro caso sequencial). `triggerSegunda`
  (`:86-169`) **não tem guarda nenhuma**.
- **Resolução:** (a) **lock de execução do cron** (advisory lock / linha em `cron_runs` com
  `INSERT ... ON CONFLICT DO NOTHING` no início); (b) carimbo **condicional**:
  `UPDATE ... SET ultima_pilula1_em=now() WHERE id=? AND ultima_pilula1_em IS NULL` e só enviar se
  `rowCount=1` (stamp-then-send, torna at-most-once); (c) aposentar os legados `trigger_segunda/quinta`.

### F-C4 · Overlay desligado em silêncio → trilha inteira sem core 🟡 (causa-raiz do episódio de 16/07)
- **Gatilho:** `precarregarKits` (`entrega-semana.ts:58-101`) **ignora o `error`** das 3 queries
  (`:69,73,77`) e retorna `if (!briefs?.length) return out` = **Map vazio mas TRUTHY**. Se o
  PostgREST devolve `{data:null, error}` sem lançar (timeout, pool esgotado, schema reload),
  `overlayConteudo:113` vê cache truthy → `.get()→undefined` → `if(!kit) return` → **mantém o
  conteúdo do build para TODAS as semanas** (desafio genérico + `core_id` stale).
- **Efeito:** se o `core_id` do build aponta para conteúdo apagado → **todas as semanas de conteúdo
  do colaborador ficam sem core de uma vez**, sem telemetria (o `catch` de `aplicarOverlayKit:467`
  engole).
- **Resolução:** `precarregarKits` deve **propagar o error** (throw) em vez de retornar Map vazio —
  aí o overlay cai no caminho live `resolverKitDaSemana` (que degrada bem) em vez do cache vazio
  tóxico. Distinguir "sem kits" (Map vazio legítimo) de "query falhou" (throw).

### F-C5 · `videos_gerados` duplicados por célula 🔴 (18 medidos, um com 9 cópias)
- **Gatilho:** `resolverCelulaVideo`/`dispararVideoDoKit` fazem SELECT-then-INSERT
  (`gerar-video.ts:134-137,155-159`); **`videos_gerados` não tem UNIQUE** por célula/kit (mig
  138/139/145 só criam índices não-únicos). 2 disparos concorrentes → 2 rows + 2 renders.
- **Efeito:** decks duplicados; cada cópia é um render HeyGen pago; a personalização roda 2× sob
  `cell_video_id` diferentes.
- **Resolução:** **`UNIQUE(empresa_id, modulo_base_id, cargo, disc_dominante)` parcial
  `WHERE status <> 'error'`** (permite reprocessar após erro, barra duplicata de sucesso) + `upsert`
  no disparo. Limpar as 18 existentes (manter a mais recente `done` por célula).

### F-C6 · `micro_conteudos` duplicados 🔴 (6 tuplas medidas, até 4×)
- **Gatilho:** **sem UNIQUE** em `micro_conteudos` (só PK/FK/CHECK). Idempotência é só em código
  (`gerarConteudoIA:119-128`, e **pulada quando vem de kit**). Geração concorrente do mesmo
  `(competência,descritor,formato,cargo,empresa)` insere 2 rows; kit apagado sem apagar conteúdo →
  FK SET NULL cria genéricos duplicados.
- **Efeito:** `montarSemanaConteudo` escolhe uma por score; as outras são peso morto e candidatas em
  empate. Confunde diagnósticos (contei "6 pares" que eram genéricos duplicados).
- **Resolução:** **UNIQUE parcial em conteúdo NÃO-kit**:
  `UNIQUE(empresa_id, competencia, descritor, formato, cargo) WHERE kit_id IS NULL` (conteúdo de kit
  tem variantes por DISC → fora da constraint). Dedup dos 6 existentes.

### F-C7 · `kit_briefs` duplicados 🔵 (0 hoje, latente)
- **Gatilho:** SELECT-then-INSERT (`brief.ts:130-144`) + **sem UNIQUE** (só índice não-único
  `idx_kit_briefs_tema`, mig 142:24). Dois jobs do mesmo tema (lote de coorte + ação manual) →
  2 briefs. Protegido **dentro** de um job (`briefPreResolvido`), não entre jobs.
- **Efeito:** 2 conjuntos de kits; `precarregarKits:89` escolhe por score com desempate arbitrário
  → pode servir o brief errado. (`scripts/_fix-brief-duplicado.ts` existe = já ocorreu.)
- **Resolução:** **UNIQUE(empresa_id, competencia, descritor, nivel_min, nivel_max, cargo, contexto)**
  (promover o índice existente a único) + `upsert onConflict`.

---

## 2. Integridade de dados

### F-I1 · `data_inicio` resetado em toda regeneração 🟠 (o 🔴 do PIPELINE-TRILHA)
- **Gatilho:** `data_inicio: nextMondayISO()` no payload de UPDATE **e** INSERT (`trilha-core.ts:554`).
- **Efeito:** trilha em andamento na semana 8 volta pro calendário zero + progresso recriado.
- **Resolução:** no UPDATE, **preservar** `existente.data_inicio`; só o INSERT (1ª vez) calcula.
  Já mordido nesta sessão (o `_reliberar` foi paliativo).

### F-I2 · `regerarSemana` não re-seleciona conteúdo nem normaliza 🟠
- **Gatilho:** `regerarSemana` (`temporadas.ts:373-430`) reescreve só desafio/missão/cenário por IA,
  mantém `core_id`/`formatos_disponiveis`/`descritor` do slot antigo, e grava **sem passar por
  `normalizarSemanas`**.
- **Efeito:** perpetua `core_id` órfão e "título ≠ blocos"; não conserta o que o admin acha que está
  consertando.
- **Resolução:** rotear reparo de conteúdo por `selecionarConteudoDaSemana` (já exportada) + chamar
  `normalizarSemanas` no fim de `regerarSemana`. E corrigir a mensagem enganosa "não pode regerar
  avaliação" quando `descritor` é null (semana degenerada).

### F-I3 · FK destrutivas — deletar MB apaga os vídeos 🟡
- **Gatilho:** `videos_gerados.modulo_base_id` é **`NOT NULL + CASCADE`** (mig 138:6) — o único do
  pipeline de conteúdo. Deletar um MB → cascateia decks → cascateia `videos_personalizados`.
- **Efeito:** pessoas perdem o vídeo, silenciosamente.
- **Resolução:** **nunca deletar MB publicado; despublicar** (`status`). Se precisar deletar, mudar
  a regra para RESTRICT (forçar limpeza explícita dos decks antes). Documentar no runbook de MB.
- **Vizinhos:** `micro_conteudos.modulo_base_id` → SET NULL (vira ungrounded silencioso);
  `micro_conteudos.kit_id` → SET NULL (**o vazamento de DISC**, F-I4).

### F-I4 · `kit_id` SET NULL → conteúdo de DISC vaza no build 🟠 (a Armadilha #1 do KIT-SEMANAL)
- **Gatilho:** deletar/regerar kit → `micro_conteudos.kit_id=null` (mig 142:45) → `conteudosDoBuild`
  filtra `!kit_id` → conteúdo escrito p/ UM DISC entra no pool do build (cego a DISC).
- **Efeito:** pessoa lê conteúdo de outro perfil (medido 16/07: 23 de 648).
- **Resolução:** já mitigado no build; a **ordem correta ao regerar kit é conteúdo→kits→brief**
  (script `_regerar-temas-kit`). Reforço estrutural: um `WHERE kit_id IS NULL` no build **não basta**
  se o conteúdo órfão herda `kit_id=null` — considerar coluna `origem_disc` que sobrevive ao SET NULL
  e um filtro `origem_disc IS NULL` no build.

### F-I5 · `development_blueprints` sem FK → órfãos 🟠
- **Gatilho:** mig 175 não cria FK para `colaborador_id`/`empresa_id`. Deletar colab/empresa **não**
  apaga o blueprint.
- **Efeito:** lixo acumulado; `auditarBlueprint` de um órfão falha no gate "colaborador não encontrado".
- **Resolução:** adicionar `FK(colaborador_id) ON DELETE CASCADE` + `FK(empresa_id) ON DELETE CASCADE`
  (mig nova); limpar órfãos existentes.

### F-I6 · Descritor com 2 nomes — blueprint dedupa (perde nota), legado duplica (gasta slot) 🟠
- **Gatilho:** o assessment guarda `"COO03_D5 — X"`, o blueprint guarda `"X"`. No caminho
  blueprint→trilha, `to-descriptors.ts:89` `Map.set(normDescritor)` → a 2ª nota **sobrescreve** a 1ª.
  No legado `select-descriptors` **não normaliza** → 2 `SelectedDescriptor` → 2 semanas no mesmo
  descritor. A `UNIQUE(colaborador_id,competencia,descritor)` não pega (strings diferentes).
- **Efeito:** blueprint perde uma nota; legado desperdiça slots.
- **Resolução:** **normalizar `descritor` na ESCRITA** de `descriptor_assessments` (IA4 + manual) —
  gravar o nome limpo, canônico. Backfill dos existentes.

### F-I7 · Competência acento-divergente bloqueia o blueprint em silêncio 🟡
- **Gatilho:** 3 normalizadores divergentes: `core.ts:31` `normNome` **não tira acento**;
  `audit.ts:52` e `to-descriptors.ts:53` tiram. Foco grava "Comunicação", assessment grava
  "Comunicacao" (import sem cedilha) → `resolverFilaBlueprint100:63` acha mapeamento incompleto →
  colaborador **nunca entra na fila**; ou gate 7 "Mapeamento incompleto" apesar do assessment existir.
- **Efeito:** "por que fulano não gera blueprint?" sem causa visível.
- **Resolução:** **um único normalizador acento-insensível compartilhado** (`normNome` = `normDescritor`
  sem o strip de prefixo). Consolidar os 3.

### F-I8 · DISC de 1ª-letra (kit/vídeo) vs 2-letras (PDF) 🟠 (toda base com dominante composto)
- **Gatilho:** dominante de 2 letras é o normal ("DI", "SC", "ID"). `derivarArquetipo` (PDF) usa as
  **2 letras**; kit/desafio/áudio/vídeo usam **`charAt(0)`** (`entrega-semana.ts:63`, `gerar-video.ts:200`,
  etc.).
- **Efeito:** a pessoa 'SC' recebe desafio/áudio/vídeo do perfil **S** mas o PDF do arquétipo
  **Especialista (SC)** — a "personalização DISC" **diverge entre camadas**.
- **Resolução:** decidir **uma** chave DISC canônica no pipeline (recomendo a 1ª letra em todo lugar,
  ou o combo em todo lugar) e padronizar. Hoje é inconsistente por acidente, não por design.

### F-I9 · Semana degenerada sem `conteudo` — UI está protegida ✅ (verificado)
- **Gatilho:** slot de conteúdo sem descritor alocado → `{descritor:null, status:'bloqueada'}` **sem
  objeto `conteudo`** (`build-season.ts:290-297`).
- **Verificado:** o week page trata — `conteudo ? [...] : []` (page.tsx:139) e optional chaining
  (`semana?.conteudo?.formato_core`, `entrega.conteudo?.desafio_texto`). Não quebra.
- **Risco residual:** a pessoa vê uma semana **vazia** (bloqueada, sem conteúdo) — degradação, não
  crash. Se aparecer em produção, é sintoma de seleção incompleta (blueprint com menos descritores
  que slots). **Resolução:** o build poderia converter slot de conteúdo vazio em reflexão em vez de
  emitir semana bloqueada. Baixa prioridade.

### F-I10 · Empresa-rede: `.limit(1)` em `ppp_escolas` aplica UMA escola à rede inteira 🟠 (parcial ✅ 26/07)
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
  - 🔴 **ABERTO** — `buscarContextoPPP` (`lib/ia2-gabarito.ts:57-65`) segue com `.limit(1)` quando
    `pppEscolaId` é `undefined`/`null`, e o comentário chama isso de "proxy de rede, comportamento
    histórico". Alimenta IA1, IA2 e o cenário de rede do IA3. É o **mesmo defeito**, num insumo maior
    (4000 chars de contexto vs. 10 strings). Correção: reusar `resolverContextoEmpresa`.
- **Onde mais checar antes de escrever query nova:** qualquer `from('ppp_escolas')` sem
  `pppEscolaId` explícito.

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

### F-E4 · Lotes síncronos de IA (504) 🟠 (já em 1-5 colabs)
- **Gatilho:** `gerarTemporadasLote`/`gerarBlueprintsLote` rodam N chamadas de IA numa server action
  serial, sem `maxDuration`. Temporada = 6 chamadas/colab → 1 colab já pode passar de 300s.
- **Resolução:** o padrão correto **já existe** (`filaBlueprint` + loop no client; Batch API). **Depreciar
  os loops síncronos**; `gerarTemporadasLote` precisa de uma task dedicada (hoje inexistente).

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

### F-E7 · PDF cache por-arquétipo vaza PPP em empresa-rede 🔵
- **Gatilho:** chave `final/perso/{contentId}/{empresaId}/{arquetipoSlug}.pdf` (`conteudos.ts:911`)
  **não inclui a escola**. Numa rede multi-escola, 2 colabs de escolas diferentes mas mesmo arquétipo
  colidem → o 2º recebe o PDF com o **PPP da escola do 1º**.
- **Resolução:** incluir `escola_id` (ou hash do PPP) na chave de cache do PDF. Relevante para Ibipeba
  (rede municipal) **agora**, não só em escala.

---

## 4. Vídeo / personalização

### F-V1 · Colab novo (ou que muda de DISC) nunca recebe o vídeo nominal 🟠 (estrutural)
- **Gatilho:** `personalizarCelula` fotografa os colabs de (empresa,cargo,disc) **no instante do
  render** (`render-video.ts:92-97`) e não há re-disparo automático. Quem entra depois cai no **deck
  genérico** (sem "Olá, {nome}") permanentemente.
- **Resolução:** um job de **reconciliação** (cron/tarefa) que detecta `(colab × célula done)` sem
  `videos_personalizados` e enfileira a personalização. Cobre também os 14 presos em error/processing.

### F-V2 · Personalização fora do watchdog, serial por colab 🔵
- **Gatilho:** o watchdog (`MAX_RENDER_MS`) envolve só o render do deck; `personalizeCell` roda depois
  (`worker.mjs:276`), serial por colaborador, sem teto próprio. Célula de cargo popular (centenas de
  colabs do mesmo DISC) → personalização longuíssima ocupando a box.
- **Resolução:** teto de tempo próprio na personalização + paralelismo limitado; ou personalizar
  fora do worker de render (fila separada).

---

## 5. Parse de IA / robustez

### F-P1 · JSON truncado (maxTokens) → falha limpa (blueprint) ou score inflado (auditoria) 🟠
- **Gatilho:** `extractJSON` retorna `null` em JSON incompleto. Blueprint → `{error}` (não persiste
  lixo, bom). **Auditoria** → sem checks semânticos → denominador cai de 12 p/ 6 → **score inflado**
  (`audit.ts:277`).
- **Resolução:** score da auditoria deve usar **denominador fixo** (semântico ausente conta como
  não-avaliado, não some do denominador), OU marcar o relatório como "parcial" quando a 2ª IA cai.

### F-P2 · Missão/cenário formativos caem em placeholder — **não afeta o scoring** ✅ (esclarecimento)
- Confirmado: o Cenário B da **avaliação** (13/14) vem de `banco_cenarios`, não desta geração. Missão/
  cenário das semanas 4/8/12 são formativos. Placeholder degrada a experiência, **não o fechamento**.

---

## Prioridação — o que corrigir primeiro

**Migrations (barram classes inteiras de duplicata/órfão):**
1. `UNIQUE` parcial em `videos_gerados` (célula, `WHERE status<>'error'`) — F-C5 🔴
2. `UNIQUE` parcial em `micro_conteudos` (`WHERE kit_id IS NULL`) — F-C6 🔴
3. `UNIQUE` em `kit_briefs` (promover o índice) — F-C7
4. FK `ON DELETE CASCADE` em `development_blueprints` — F-I5
+ dedup dos registros já duplicados (18 vídeos, 6 conteúdos).

**Código (corrigem perda de dado / silêncio):**
5. `data_inicio` preservado no UPDATE de `persistirTrilha` — F-I1 🟠
6. `precarregarKits` propaga erro em vez de Map vazio — F-C4 (causa-raiz dos órfãos)
7. `persistirTrilha` vira UPSERT + progresso captura erro — F-C1/F-C2
8. Carimbo condicional (stamp-then-send) + lock do cron — F-C3
9. `regerarSemana` usa `selecionarConteudoDaSemana` + `normalizarSemanas` — F-I2
10. Normalizador único acento-insensível; normalizar descritor na escrita — F-I6/F-I7

**Escala (antes de crescer o tenant):**
11. `triggerDiario` vira task/fan-out — F-E1
12. Chunkar `.in()`, paginar `listarTemporadasEmpresa`, cachear `precarregarKits` — F-E2/E3
13. Depreciar lotes síncronos de IA — F-E4
14. `escola_id` na chave de cache do PDF — F-E7 (relevante já pro Ibipeba)

**Operação (runbook, sem código):**
15. Nunca deletar MB publicado — despublicar (F-I3).
16. Job de reconciliação de `videos_personalizados` (F-V1) — cobre os 14 presos.
17. Limpar os 38 `videos_gerados` em error + 1 brief ungrounded.
