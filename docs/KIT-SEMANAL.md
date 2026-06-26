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
3. **Todos os 4 formatos × 4 DISC** = 16 conteúdos por brief.
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
              └─► 4 formatos SEMEADOS pelo brief + o desafio do DISC (lente DISC):
                    vídeo (fecha no desafio) · podcast (provocação = desafio)
                    texto ("Para refletir" = desafio) · caso (pergunta final = desafio)
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
  Agrupa os 4 formatos.
- **`micro_conteudos.kit_id`** (FK → kits) + **`.disc`** — os 16 conteúdos do brief.
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
  (orquestrador on-demand de UM kit DISC = 4 formatos coesos + 1 desafio). Prova a
  coesão num tema/DISC antes de escalar.
- **Fase 2 — Lote**: `gerarKitSemanal` (brief → 4 DISC × 4 formatos → render pesado
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

**Injeção:** `promptTextContent`/`promptCaseStudy` (+ extensão reduzida p/ `simples`; `garantirMinimoPdf` não reinfla) e no **núcleo + desafio do kit** (`kit/brief.ts`). Ponto único de geração = `gerarConteudoIA` → cobre kit e temporada.

**Geração por cargo:** `planejarKitsCoorte` agora chaveia por **(competência × descritor × CARGO × DISC)** — cada público gera no seu registro. **Entrega cargo-aware com fallback:** `resolverDesafioDoKit` e `precarregarKits`/`overlayKitNaSemana` preferem o kit do cargo do colaborador e caem no `'todos'` do legado se não houver.

**Performance (escala):** `precarregarKits` (`entrega-semana.ts`) carrega todos os kits da trilha em **3 queries** e casa em memória — antes o overlay fazia 2-3 queries POR semana (~30/load). Ver `docs/ESCALA-50K.md`.

Validado: kit "Gestão Financeira Básica › Formação básica de preço" com `cargo='MEI'` → case "Cláudia e o mês que não fechou" (marmitas/WhatsApp), texto ~5,3k chars, registro do dia a dia.
