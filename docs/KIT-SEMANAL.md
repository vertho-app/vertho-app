# Kit Semanal (kit por competência × descritor × DISC)

Documento canônico do recurso **Kit Semanal**. Visão, decisões e plano de fases.

## Visão
Para cada pessoa, por competência, por semana, entregar um **kit coeso**: 1 vídeo +
1 podcast + 1 texto + 1 estudo de caso, **todos sobre o mesmo tema** (competência/
descritor), dizendo "a mesma coisa" em formatos diferentes, **produzidos em lote na
semana anterior**, compartilhando um **desafio** que a IA **cobra na quinta-feira**
como a parte prática da semana.

## Decisões (travadas)
1. **Núcleo compartilhado + personalização** — não se gera conteúdo do zero por
   pessoa. Produz-se um núcleo por (competência × descritor × DISC), compartilhado
   pela coorte; a pessoa recebe SUA renderização + camada fina (nome/PPP).
2. **Grão de produção = (competência × descritor × DISC)** → **4 kits base** por
   competência/descritor (um por DISC: D/I/S/C). Em DUO (2 competências) = 8/semana.
3. **3 formatos de conteúdo × 4 DISC** = **12 micro_conteudos** por brief
   (`FORMATOS_PADRAO = ['audio','texto','case']` em `actions/kits.ts`) **+ 4 vídeos de
   célula** (um por DISC, via `dispararVideoDoKit` → `videos_gerados` — o vídeo NÃO é
   micro_conteudo nem passa por `gerarConteudoIA`).
4. **Desafio POR DISC** — cada kit DISC tem seu próprio desafio (mesma espinha
   conceitual, ação prática sob medida ao perfil). Cobrado na quinta.
5. **Desafio é o foco prático da semana** (substitui o "desafio solto" atual).
6. **Entrega por pessoa**: o formato **preferido** da pessoa é o **principal**; os
   outros 3 ficam como **material de apoio**. (preferência via `learnPrefs`.)

## Arquitetura (4 camadas)
```
MÓDULO-BASE (modulos_base_conteudo — verdade pedagógica, já existe)
  └─► gerarKitBrief()  →  BRIEF { ideia_central, pontos_chave[3], exemplo_ancora }   ← espinha (DISC-neutra)
        └─► gerarKitDesafio(brief, DISC)  →  DESAFIO próprio do DISC
              └─► 3 formatos SEMEADOS pelo brief + o desafio do DISC (lente DISC),
                  via gerarConteudoIA → micro_conteudos:
                    podcast (provocação = desafio) · texto ("Para refletir" = desafio)
                    caso (pergunta final = desafio)
                  + vídeo (fecha no desafio) — pipeline de célula (videos_gerados),
                    NÃO é micro_conteudo
  PRODUÇÃO EM LOTE na semana anterior, por coorte (DUO = 2 competências × 4 DISC)
SEGUNDA: pessoa recebe os 4 (principal = formato preferido; resto = apoio) + o desafio
QUINTA 11:00: IA cobra o desafio (check-in focado) → avalia → rastreia
```

## Modelo de dados
- **`kit_briefs`** — 1 por (competência × descritor × nível × cargo × contexto).
  `brief` JSONB = `{ ideia_central, pontos_chave[], exemplo_ancora }`. Espinha
  DISC-neutra, derivada do módulo-base.
- **`kits`** — 4 por brief, um por DISC. `disc` (D/I/S/C) + `desafio` JSONB
  (`{desafio_texto, acao_observavel, criterio_de_execucao, por_que_cabe_na_semana}`).
  Agrupa os 3 formatos de conteúdo (+ o vídeo de célula ligado ao kit).
- **`micro_conteudos.kit_id`** (FK → kits) + **`.disc`** — os 12 conteúdos do brief.
- (Fase 4) `colaboradores.formato_preferido` — define o "principal".
- (Fase 3) `temporada_semana_progresso.reflexao.desafio_quinta` — rastreio da cobrança.

## Reuso vs novo
- **Reusa (pronto):** `modulos_base_conteudo` + `resolverModuloBaseParaConteudo`/
  `enriquecerPromptComModuloBase`; os 4 geradores (`gerarConteudoIA`,
  `prompt{Video,Podcast,Text,Case}*`); `ARQUETIPOS` DISC (`lib/disc-arquetipos.ts`);
  desafio (`prompts/challenge.ts`); estrutura semanal (`temporada_plano`,
  `temporada_semana_progresso`, week-gating); cron de quinta (`triggerQuinta`); chats
  de avaliação + extração (`/api/temporada/reflection`); personalização (saudação,
  DISC+PPP); auto-provisionamento de render (cx33).
- **Novo:** o **brief** compartilhado, o **`kit_id`**, o orquestrador vertical +
  agendador, e o check-in de quinta por dia.

## Fases
- **Fase 1 — Espinha** (este commit): `kit_briefs` + `kits` + `kit_id` +
  `gerarKitBrief`/`gerarKitDesafio` + `enriquecerPromptComKit` + `gerarKit`
  (orquestrador on-demand de UM kit DISC = 3 formatos coesos + 1 desafio, + vídeo
  disparado à parte, async). Prova a
  coesão num tema/DISC antes de escalar.
- **Fase 2 — Lote**: `gerarKitSemanal` (brief → 4 DISC × 3 formatos + vídeo por célula → render pesado
  no auto-provision cx33) + agendador semana-anterior por coorte (DUO).
- **Fase 3 — Cobrança de quinta**: desafio como foco da semana + prompt de check-in
  + gate por dia (quinta = início + (semana−1)×7 + 3d) + rastreio + estender
  `triggerQuinta` p/ semanas de conteúdo.
- **Fase 4 — Entrega** (FEITA): `loadTemporada` faz overlay do kit por
  (empresa×competência×descritor×DISC) via `lib/season-engine/kit/entrega-semana.ts`
  (`overlayKitNaSemana`/`resolverKitDaSemana`/`formatoPreferido`). Os
  `formatos_disponiveis` da semana viram áudio/texto/caso do kit (vídeo segue do
  pipeline de célula, excluído do overlay), `formato_core` = formato preferido da
  pessoa (`colaboradores.pref_*`; default texto), desafio = o do kit. Aditivo +
  best-effort (sem kit → buildSeason permanece); trata DUO (`conteudos_dia`). O
  viewer da semana NÃO mudou — já lia `formato_core`+`formatos_disponiveis` e serve
  podcast/PDF por `/api/conteudo/[id]`.
- **Botão "Gerar Kit" na tela de módulo** (FEITO): `_kit-gerador.tsx` enfileira o
  kit pré-preenchido com a competência+descritor do módulo (dropdown de empresa).
- **Batch API −50%** (FEITO): `lib/ai-batch.ts` (`submitClaudeBatch` +
  `createAIBatchCollector`). `gerarKitSemanal` ganha caminho LOTE opt-in (`useBatch`,
  ≥2 DISC): resolve brief+PPP 1×, roda os 4 DISC concorrentes pelo collector
  (2 rodadas: desafios → formatos). Fallback em camadas (batch falho/timeout/
  modelo não-Claude/request vazio → `callAI` síncrono; falha estrutural → sequencial).
  `enqueueKit` liga `useBatch` por default no lote. ⚠️ exige redeploy MANUAL do trigger.
- **Agendador por coorte — manual por empresa** (FEITO): `planejarKitsCoorte(empresaId,
  {executar, incluirVideo})` varre o `temporada_plano` de TODA a coorte, deduplica os
  (competência × descritor × DISC) demandados, confere os kits publicados (empresa OU
  global) e gera SÓ os faltantes (1 job por comp×descritor com os DISC que faltam, em
  Batch). `executar:false` = dry-run. Reuso: N pessoas no mesmo (descritor×DISC) = 1 kit.
  Toggle `incluirVideo` (controle de GPU). UI: `/admin/conteudos/kit/coorte`.
  RESTA (futuro): virar isso um CRON semana-anterior (hoje é gatilho manual).

## Arquivos (Fase 1)
- `migrations/142-kits-semanais.sql`
- `lib/season-engine/kit/brief.ts` — `gerarKitBrief`, `gerarKitDesafio`, tipos/parsers
- `lib/season-engine/kit/enrich.ts` — `enriquecerPromptComKit` + lente DISC
- `actions/conteudos.ts` — `gerarConteudoIA` aceita `kit` (brief+disc+desafio+kitId)
- `actions/kits.ts` — `gerarKit` (orquestrador on-demand)

---

## Atualização 25/06/2026 — Registro por público + geração/entrega por CARGO

**Problema:** texto/case saíam em registro corporativo-acadêmico para qualquer público — inadequado para MEI/Empregabilidade (adulto, baixa escolaridade).

**Resolver de público** (`lib/season-engine/perfil-publico.ts`, determinístico):
- Mapeia a chave por **CARGO primeiro**, segmento só fallback. Motivo: empresa social (ex.: "Macaé - MEI & Empregabilidade") tem `segmento` único (às vezes "corporativo") e os dois públicos só se distinguem pelo cargo ("MEI" vs "Em busca").
- 4 perfis (`mei`, `empregabilidade`, `educacao`, `corporativo`), cada um com: `registroInstrucao`, `dominioExemplos`, `termosEvitar`, `proibirContextoEducacional`, `minCharsPdf` (5k p/ nível simples vs 8k).
- `blocoCalibracaoPublico(perfil)` monta o bloco injetável (reutilizado por texto/case/kit).

**Injeção:** `promptTextContent`/`promptCaseStudy` (+ extensão reduzida p/ `simples`; `garantirMinimoPdf` não reinfla) e no **núcleo + desafio do kit** (`lib/season-engine/kit/brief.ts`). Ponto único de geração = `gerarConteudoIA` → cobre kit e temporada.

**Geração por cargo:** `planejarKitsCoorte` agora chaveia por **(competência × descritor × CARGO × DISC)** — cada público gera no seu registro. **Entrega cargo-aware com fallback:** `resolverDesafioDoKit` e `precarregarKits`/`overlayKitNaSemana` preferem o kit do cargo do colaborador e caem no `'todos'` do legado se não houver.

**Performance (escala):** `precarregarKits` (`entrega-semana.ts`) carrega todos os kits da trilha em **3 queries** e casa em memória — antes o overlay fazia 2-3 queries POR semana (~30/load). Ver `docs/ESCALA-50K.md`.

Validado: kit "Gestão Financeira Básica › Formação básica de preço" com `cargo='MEI'` → case "Cláudia e o mês que não fechou" (marmitas/WhatsApp), texto ~5,3k chars, registro do dia a dia.

## Atualização 16/07/2026 — ⚠️ LEIA ANTES DE MEXER EM KIT (5 armadilhas, todas mordidas)

Regenerar 2 temas de kit por script fechou o vazamento de DISC **e deixou 6 pessoas SEM
CONTEÚDO** na semana seguinte. As 5 armadilhas, na ordem em que aparecem:

**1. Conteúdo de kit NUNCA sai do build — só do overlay.** `montarSemanaConteudo` filtra
competência + cargo mas **não DISC**, e os `micro_conteudos` do kit vivem na MESMA tabela
com competência/descritor/cargo preenchidos. Sem filtro, o build servia conteúdo escrito
para OUTRO perfil (medido: 23 de 648 entregas). Fechado com `.is('kit_id', null)` na query
**+** `conteudosDoBuild()` no código (defesa em profundidade, testado por mutação em
`tests/unit/conteudo-isolamento-disc`). O overlay só corrige quando existe kit do DISC da
pessoa — com cobertura parcial de DISC, escapa.

**2. `resolverOuCriarBrief` é idempotente e NÃO tem opção de forçar.** Casa por
`(competencia, descritor, nivel_min, nivel_max, cargo, contexto, empresa_id)`. Para regerar
um brief é preciso apagá-lo antes.

**3. `contexto` default = `'generico'`, mas os tenants usam `'educacional'`.** Não passar
`contexto` cria um brief DUPLICADO em vez de reusar → quebra a espinha compartilhada (o
ponto do Kit é os 4 DISC dizerem a mesma coisa). **Sempre passar `contexto` explícito.**

**4. FK: `micro_conteudos.kit_id` é `ON DELETE SET NULL`** (e `kits.brief_id` é `CASCADE`).
Apagar o brief antes do conteúdo transforma conteúdo DISC-específico em **genérico**
(`kit_id = null`) — e o build, que serve exatamente o genérico, passa a entregá-lo a
QUALQUER perfil. **Ordem obrigatória: conteúdo → kits → brief.**

**5. `gerarConteudoIA` grava `url = null` quando o PDF headless falha** (fonte NotoSans não
registrada no tsx). Isso é inofensivo para o build (a entrega é por ID: `/api/conteudo/{id}/pdf`
renderiza no runtime), mas o overlay exigia `url` e escondia texto/case do kit novo — o
`core_id` do plano seguia apontando para o conteúdo antigo, já apagado. Corrigido: o overlay
não exige mais `url`.

**Ao mexer em kit, medir PÓS-OVERLAY.** O raio-x que lê o `core_id` gravado dizia
"68/72 core, 0 formato não servido" e escondia as 6 pessoas quebradas. Ver `CLAUDE.md`
("a forma GRAVADA ≠ o que é ENTREGUE").

**Reparar plano gravado:** use `selecionarConteudoDaSemana` (exportada de `build-season`) —
é a MESMA função do motor. Reimplementar o scoring num script dessincroniza os campos
derivados (`formato_core`/`formatos_disponiveis`/`core_titulo`) do `core_id`.

**⚠️ Dívida conhecida:** os briefs criados antes de `7258c0a3` foram ancorados no módulo-base
**cego a cargo e a descritor** — o resolver escolhia UM módulo por competência e servia os 6
descritores dela. Ex.: o kit de "Troca de práticas" foi destilado do material de "Aprendizagem
entre pares". Ao regerar um tema antigo, o brief novo já nasce com o módulo correto.

## Atualização 22/07/2026 — vídeo avulso de kit antigo + podcast órfão de MP3 (2 armadilhas novas)

Caso real: completar o kit MEI×D "Formação básica de preço" (projetomacae) que tinha só
texto/case — faltavam vídeo e o MP3 do podcast.

**6. Vídeo de kit ANTIGO: o brief aponta pro módulo errado — ancorar no módulo do CONTEÚDO.**
`gerarKit` dispara o vídeo com o `modulo_base_id` do BRIEF, mas a entrega
(`resolverVideoDaSemana({coreId})`) resolve a célula pelo módulo do **conteúdo core pós-overlay**
(= o texto do kit, que o resolver cargo-aware escolheu). Num brief pré-`7258c0a3` os dois
divergem → o vídeo nasce numa célula que o painel NUNCA consulta (vídeo órfão; foi o caso dos
4 vídeos de 25/06, em `(módulo do brief × cargo 'todos')`). Receita: chamar `dispararVideoDoKit`
DIRETO com o `modulo_base_id` do micro-conteúdo texto do kit (molde `scripts/_video-kit-mei-d.ts`).
**NÃO regerar o kit inteiro** para "ganhar o vídeo": upsert do kit TROCA o desafio que os
colaboradores já veem e os formatos saem como micro_conteudos NOVOS (duplicatas — não há UNIQUE).

**7. Kit gerado com `renderAudio=false` fica com podcast SEM MP3 — e a entrega NÃO cura.**
O micro_conteúdo `audio` nasce só com o roteiro (`conteudo_inline`), `url=null`, `ativo=false`;
o player da semana carrega vazio (0:00) e nada renderiza on-demand. Curar com
`gerarPodcastAudio(id)` (admin) ou headless `scripts/_render-podcast-kit.ts [conteudoId]`
(núcleo sem gate; TTS+upload+update). Pré-requisito headless: o fix de interop do lamejs em
`lib/tts/audio-dsp.ts::resolveLamejs` (`70b77b74`) — sem ele, tsx quebra em
"Mp3Encoder is not a constructor" (o `require` do pacote cai no build IIFE vazio).

> **REVISADO 27/07/2026 — o podcast sem MP3 HOJE renderiza on-demand.** Medido em
> `scripts/_diag-narracao-kit.ts` (Ibipeba): 56/56 áudios de kit têm narração extraível
> (2,9k–3,8k chars), inclusive os 29 com `url=null`/`ativo=false`. O player aponta para
> `/api/conteudo/[id]/podcast` (week page), e a rota gera por TTS a partir do
> `conteudo_inline` e cacheia em `final/audio-personalizado/{conteudoId}/{colabId}.mp3`.
> Mais: quando há colaborador com nome, a rota **sempre** monta a versão personalizada e
> **ignora** o `url` — o MP3 base só é servido a quem não tem colaborador (admin). Ou seja,
> `renderAudio=true` produz um artefato que a entrega quase nunca usa. Mantenha
> `renderAudio=false` por padrão; o custo real é a latência da 1ª reprodução.

## Atualização 27/07/2026 — completar DISC faltante (2 armadilhas novas)

Fechar as lacunas de kit da coorte da Ibipeba (18 kits, semanas 1–3) expôs mais duas.

**8. `planejarKitsCoorte` forçava `contexto: 'educacional'` — e criava brief PARALELO.**
`resolverOuCriarBrief` casa por (competencia, descritor, nivel_min, nivel_max, cargo,
contexto, empresa_id). Completar os DISC de um tema cujo brief está gravado como
`'generico'` passando `'educacional'` **não reusa**: cria um segundo brief do mesmo tema e
quebra a espinha compartilhada — o ponto do Kit é os 4 DISC dizerem a mesma coisa. A
Ibipeba tinha 13 briefs `'generico'` × 10 `'educacional'`, vários do mesmo tema, e o padrão
bate com esse mecanismo. Corrigido: o plano agora **herda `contexto`/`nivel_min`/`nivel_max`
do brief existente** do tema e só usa `opts`/default quando o brief é novo (`actions/kits.ts`,
etapa 5). Ao gerar kit por script, herde igual — molde em `scripts/_gerar-kits-faltantes.ts`.

**9. Os dois resolvedores de entrega divergiam — a correção da armadilha 5 pegou só um.**
`overlayConteudo` usa `precarregarKits` (cache) quando o pré-carregamento deu certo e cai em
`resolverKitDaSemana` quando não deu (`actions/temporadas.ts` chama com `.catch(() => undefined)`).
A regra "a entrega é por ID, não por `url`" tinha sido aplicada só no primeiro; o segundo seguia
exigindo `url` e escondia texto/case — e `gerarConteudoIA` grava `url=null` sempre que o PDF
headless falha, o que acontece em TODA geração via tsx ("Font family not registered: NotoSans").
Efeito: a mesma pessoa via 3 formatos ou 1 dependendo de uma query ter falhado. Travado por
`tests/unit/kit-entrega-paridade.test.ts` (validado por mutação). **Ao mexer num dos dois
resolvedores, mexa no outro.**
