# Geração e entrega de conteúdo — pegadinhas

> Lições operacionais tiradas do go-live do Ibipeba (13-15/07/2026). Cada uma custou
> um bug/erro real. Ler ANTES de gerar/publicar conteúdo (micro-conteúdos, áudio, vídeo)
> ou de mexer na trilha. Ver também `envs-importantes.md` (TTS/Vertex) e a memória
> `project_pdi_trilha_coerencia`.

## 1. Conteúdo nasce `ativo=false` (e o resolver só serve `ativo=true`)

`gerarConteudoIA` insere `micro_conteudos` **inativo**. `montarSemanaConteudo`
(`lib/season-engine/build-season.ts`) só considera `.eq('ativo', true)`. Então
**gerou ≠ apareceu** — tem que **ATIVAR** (`update micro_conteudos set ativo=true`).
> Sintoma real: 36 áudios existiam mas 0/36 apareciam nos formatos da trilha.

Análogo (Módulo-Base): MB extraído nasce `status='revisao'`; o resolver só usa
`publicado` → **PUBLICAR o MB antes de gerar conteúdo**, senão sai *ungrounded*.

## 2. `formatos_disponiveis` é um SNAPSHOT congelado no plano da trilha

O plano (`trilhas.temporada_plano[].conteudos_dia[].conteudo.formatos_disponiveis`) é
tirado **no momento do build** da trilha. Conteúdo gerado/ativado **DEPOIS** do build
**não aparece** sozinho — o snapshot está velho.
→ Além de ativar, é preciso **REFRESCAR o snapshot** (re-resolver e adicionar o formato
ao `formatos_disponiveis` dos planos). Aditivo, **cargo-safe** (só o formato do cargo do
colab ou genérico — nunca de outro cargo).

## 3. `gerarConteudoIA` roda HEADLESS (bypassa o gate)

`gerarConteudoIA({..., sb })` — passar um `createSupabaseAdmin()` em `sb` pula o
`requireAdminSupabase`. Rodar via `tsx --env-file=.env.local`. Idempotente por
(empresa, competência, descritor, cargo, formato) — re-rodar pula os prontos.

## 4. Áudio/podcast é PRÉ-GERADO (não on-demand) — e o TTS é lento

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

## 5. Rótulo das entregas = "Pílula N" (não dia da semana)

`conteudos_dia[].label`/`dia` já foi "Segunda/Terça-feira" hardcoded por índice, o que
**ignorava a cadência do tenant** (Ibipeba envia P2 na quarta). Hoje é **"Pílula N"**
(`build-season.ts`) — correto por índice, independe de cadência.

## 6. Regeneração desincronizava campos DERIVADOS → use `normalizarSemanas`

`descritores_cobertos` (título da semana) e os `label`/`dia` são **derivados** de
`conteudos_dia`. A regen (snapshot+reorder p/ preservar a comp1 já enviada) atualizava
`conteudos_dia` mas deixava `descritores_cobertos` velho → **título ≠ blocos**.
→ `persistirTrilha` (`lib/season-engine/trilha-core.ts`) chama **`normalizarSemanas()`**
que recomputa `descritores_cobertos`/`descritor`/`label`/`dia` de `conteudos_dia` sempre.
Qualquer script que mexa em `temporada_plano` deve rodar a mesma normalização.

## Como verificar (sempre por PRESENÇA, não por ausência)

- Conteúdo ativo? `select ativo, count(*) from micro_conteudos where ... group by ativo`.
- Aparece na trilha? Inspecionar `conteudos_dia[].conteudo.formatos_disponiveis` do plano
  (não a tabela `micro_conteudos` — o plano é snapshot).
- Áudio pré-gerado? Checar o arquivo no storage (`final/audio-personalizado/...` ou
  `final/podcast-base/...`) + `HEAD` na URL pública (200 + `audio/mpeg`).
- Erro da rota TTS? `mcp__vercel__get_runtime_logs` escopado ao `deploymentId`.
