# Gerador de Vídeo a partir de Módulo-Base

> Status: **IMPLEMENTADO e em produção.** A seção **“Estado atual”** abaixo é
> autoritativa; o restante do documento é o **design histórico** (mantido por
> contexto, mas defasado — voz Kore/Sonnet/5 cenas/$0,20 NÃO refletem o sistema atual).

## Estado atual (implementado · jun/2026)

**Gatilho:** botão “Gerar vídeo” no Módulo-Base (`/admin/vertho/modulos-base/[id]`)
→ `actions/gerar-video.ts::criarEDispararVideo` → task `trigger/gerar-video-modulo`.

**Pipeline (na task `gerar-video-modulo`):**
1. **Roteiro** — `claude-opus-4-6` + extended thinking (task `conteudo_video`). Estrutura flexível: `avatar_intro` + miolo 6–12 cenas (13 templates) + `avatar_outro`. O `avatar_intro` **NÃO cumprimenta** (a saudação nominal faz isso — ver abaixo).
2. **Narração** — Gemini TTS, voz **`Vindemiatrix`** (`VIDEO_TTS_VOICE`), 1 mp3/cena, com **direção de estilo por tipo de cena** (intro calorosa/engajante, miolo conversa, outro pausado) + correção de pronúncia de siglas. Whisper alinha palavra-a-palavra (legendas).
3. **Avatar (HeyGen)** — só nas pontas; lip-sync do NOSSO mp3 (`voice.type=audio`), 1920×1080; mp4 normalizado p/ CFR (25→30fps).
4. **Render (Remotion, comp `VerthoVideo`)** — recebe tudo via `inputProps` (timeline de `montar-inputprops.ts`). **Dois backends** (`RENDER_BACKEND`):
   - **`hetzner`** (default/produção): enfileira `render_queued`; a box **CCX33 efêmera** (`worker-hetzner/worker.mjs`, modelo PULL) renderiza. **~$0,18/vídeo**, sobe/deleta por lote.
   - **`trigger`** (override de teste): render em chunks paralelos no trigger.dev. **~$5-6/vídeo em 1080p** (~42min). Snap de scale p/ dims inteiras (`Math.round(h*scale)/h`) corrige o bug do 0.6667.
   - Default **1080p** (`VIDEO_RENDER_SCALE` ausente → scale 1); 720p = 0.6667.
5. **SFX por template** — pacote sonoro (tick/count-up/chime/etc.) embutido na composição (`VideoCompositionV3`), volumes calibrados, gatilho casado com a fala (Whisper). **Sem transição de slides** entre cenas (cortes secos — `fadeInOut` desligado; só a abertura/fechamento do vídeo inteiro tem fade via `FilmFade`).
6. **Masterização de áudio** (`masterizar-audio.mjs`, ffmpeg, pós-render) — **trilha (bed)** com berço acústico + **ducking sidechain** (a trilha recua sob voz/SFX) + **master −14 LUFS / −1 dBTP** (loudnorm 2-pass). Roda no worker E no trigger (`masterizarSeguro`, degrada p/ áudio cru se o bed faltar).
7. **Upload** → Bunny Stream (lib 636615) → grava `videos_gerados` (status/etapa/urls/srt/vtt).

**Saudação nominal (Rota A — personalização por pessoa):** o deck é **genérico por célula** (módulo × empresa × cargo × DISC); o nome **não entra no render**. Após o deck, `personalizar.mjs` gera “Olá, {nome}. Que bom ter você aqui.” por colaborador da célula — TTS **Vindemiatrix** (mesma voz do avatar) **normalizado a −14 LUFS** (casa o volume do deck), cena `AvatarGreeting` (Remotion) + **crossfade curto** (0,3s) no deck. Tom alinhado ao avatar (nem festivo nem sereno demais). Grava em `videos_personalizados` (cache por célula×colaborador). `PERSONALIZE_LIMIT` (env, 0=todos) limita a quantidade (usado em testes). Roda tanto no worker (`personalizeCell`, via `pg`) quanto no trigger (`render-video.ts::personalizarCelula`, via PostgREST, reusando o mesmo `personalizar.mjs`).

**Entrega ao colaborador:** `resolverVideoDaSemana`/`resolverCelulaVideo` entregam o personalizado do colaborador se houver (`done`), senão o genérico da célula (fallback transparente).

Detalhes vivos em [[project_current_work]] (memória) e nos arquivos `lib/video/*`, `worker-hetzner/*`, `trigger/gerar-video-modulo.ts`, `trigger/render-video.ts`.

---

## Design histórico (defasado)

> Status: **DESIGN** (não implementado). Decisões:
> - Avatar via **HeyGen API**, com **lip-sync do NOSSO áudio TTS** (`voice.type=audio`),
>   **não** voz do HeyGen → não precisa de `voice_id`. Avatar:
>   **`Abigail_expressive_2024112501`** (1280x720), o mesmo dos vídeos atuais.
> - Gatilho **no Módulo-Base**.
> - Reaproveita o spike Remotion (V3), `lib/gemini-tts.ts` (voz Kore em TODAS as
>   cenas, inclusive a do avatar), Bunny Stream e o padrão trigger.dev→callback.

## Objetivo

Botão **"Gerar vídeo"** num Módulo-Base publicado → produz um vídeo no estilo do
spike (avatar intro/outro + 3 cenas animadas + narração + legendas) → hospeda no
**Bunny Stream** → cria um `micro_conteudo` formato `video` ligado ao módulo.

O módulo-base é a matéria-prima canônica; o vídeo é um **formato derivado** dele
(como texto/podcast já são).

## Pipeline

```
Módulo-Base (conteudo_central + aplicavel + adaptacao_por_formato.video_roteiro)
  │
  1) ROTEIRO (Claude)  →  estrutura de cenas (JSON do spike) + textos de legenda
  │     reusa lib/season-engine/prompts/video-script.ts (HeyGen-style) + spec do spike
  │     saída: { titulo, scenes:[avatar_intro, concept, comparison, icon_story, avatar_outro] }
  │
  2) NARRAÇÃO (Gemini TTS, voz Kore) — UMA fonte de voz pra TUDO:
  │     reusa lib/gemini-tts.ts → mp3 das 5 cenas (intro/outro + concept/comparison/signals)
  │     └─ cada mp3 sobe no Bunny (URL pública) p/ o HeyGen consumir
  │
  2b) AVATAR (HeyGen API)  →  avatar-intro.mp4 + avatar-outro.mp4 (ASSÍNCRONO ~minutos)
  │     character.avatar_id = Abigail_expressive_2024112501
  │     voice = { type:"audio", audio_url: <mp3 do TTS no Bunny> }   ← lip-sync do NOSSO áudio
  │     (sem voz HeyGen → voz idêntica à das cenas animadas)
  │
  3) RENDER (trigger.dev task + Remotion renderMedia)  →  mp4 1080p30
  │     ⚠️ peça a validar: Remotion headless no trigger.dev (Chrome + ffmpeg)
  │     assets servidos por URL temporária (Bunny/Storage assinado)
  │
  4) UPLOAD → Bunny Stream (BUNNY_LIBRARY_ID/STREAM_API_KEY) → video GUID + playback
  │
  5) PERSISTE micro_conteudo formato=video (guid Bunny) + SRT/VTT + telemetria
        tracker de status (tabela videos_gerados) + UI no /admin/vertho/modulos-base
```

## Data model (novo)

```sql
CREATE TABLE videos_gerados (
  id uuid PK default gen_random_uuid(),
  modulo_base_id uuid REFERENCES modulos_base_conteudo(id) ON DELETE SET NULL,
  empresa_id uuid NULL,                       -- escopo (igual extração: global ou tenant)
  status text CHECK (status IN ('roteiro','avatar','narracao','render','upload','done','error')) default 'roteiro',
  error text,
  roteiro jsonb,                              -- cenas geradas (spike-scenes)
  heygen_intro_id text, heygen_outro_id text, -- jobs HeyGen
  assets jsonb,                               -- URLs dos mp3/mp4 intermediários
  bunny_video_id text,                        -- GUID no Bunny Stream
  micro_conteudo_id uuid NULL,                -- conteúdo final criado
  srt text, vtt text,
  created_by text, created_at timestamptz, updated_at timestamptz
);
```

micro_conteudo final: `formato='video'`, `origem='video_gerado'`, `url`/campo Bunny
(seguir o padrão atual de vídeos Bunny), `conteudo_inline` = roteiro/legenda.

## Integração HeyGen (assíncrona) — avatar com lip-sync do NOSSO áudio

Header `X-Api-Key`. Para CADA clip (intro e outro):

```jsonc
POST https://api.heygen.com/v2/video/generate
{
  "title": "avatar-intro",
  "video_inputs": [{
    "character": { "type": "avatar", "avatar_id": "Abigail_expressive_2024112501", "avatar_style": "normal" },
    "voice":     { "type": "audio", "audio_url": "<URL pública do mp3 do TTS (Bunny)>" },
    "background":{ "type": "color", "value": "#071A33" }
  }],
  "dimension": { "width": 1280, "height": 720 }
}
```

1. Sobe o mp3 do TTS (intro/outro) no Bunny → URL pública → `voice.audio_url`.
2. `POST /v2/video/generate` → recebe `video_id`.
3. **Polling** `GET /v1/video_status.get?video_id=` até `status="completed"` → `video_url`.
4. Baixa o mp4 do avatar (entra no Remotion como `OffthreadVideo`).

- Precisa só: `HEYGEN_API_KEY` + `HEYGEN_AVATAR_ID` (= `Abigail_expressive_2024112501`).
  **Sem `voice_id`** — a voz é o nosso TTS (lip-sync), idêntica às cenas animadas.
- Render HeyGen ~1-3 min/clip → job naturalmente assíncrono (encaixa no trigger.dev).
- Legendas do avatar: como o áudio é NOSSO (Gemini TTS), reusamos
  `captions-core` (proporcional + janela-de-fala via ffmpeg) — mesma timeline.

## Render Remotion no trigger.dev — DE-RISK ✅ VALIDADO

`renderMedia()` headless **funciona no trigger.dev**. Provado com a task
`trigger/render-spike.ts` renderizando o spike V3 (bundle pré-construído incluído
via `additionalFiles`). Config que funcionou (4 pegadinhas resolvidas):

1. **Compositor nativo Linux**: `additionalPackages(['@remotion/compositor-linux-x64-gnu@4.0.476'])`
   — instalei o renderer no Windows, então o binário Linux não vinha.
2. **`@remotion/renderer` como `external`** no build — senão o esbuild do trigger
   (keepNames) injeta `__name` nas funções serializadas pro browser → `__name is not defined`.
3. **Libs do Chrome** no build (`installChromeDeps`: libnss3, libgbm1, libasound2…);
   o binário do Chrome é baixado em runtime por `ensureBrowser()`. `gl: 'swangle'` (software).
4. **Máquina `large-2x`** (4 vCPU / 8 GB) — a default dá `TASK_PROCESS_OOM_KILLED`.

**Velocidade medida:** ~1,46s/frame (large-2x, concurrency 4), incluindo ~40s de
overhead (download Chrome + bundle). Marginal ~0,8-1s/frame.

### Implicação → render em CHUNKS paralelos
Vídeo cheio (~2916 frames @30fps ≈ 97s) num container só = **~40-70 min** → acima do
maxDuration prático. Produção deve **fatiar em N runs paralelos** (cada um renderiza
um `frameRange`) e um passo final concatena com ffmpeg — é como o Remotion Lambda
funciona. Ex.: 6 chunks de ~490 frames ≈ 7-8 min cada, em paralelo → ~8-10 min total.

### Assets por vídeo
O bundle do spike é estático; os **assets variam por vídeo** → adaptar `load-scenes`
pra aceitar **URLs externas** (avatar mp4 do HeyGen + mp3 do TTS no Bunny) via
`inputProps`, em vez de `staticFile`.

## Reuso

- Spike Remotion V3 inteiro (cenas, legendas, captions-core, SRT/VTT export).
- `lib/gemini-tts.ts` (narração), Bunny Stream (`/api/bunny-videos`, library).
- Padrão trigger.dev → `POST /api/internal/...` callback (igual extração).
- Tracker de status + UI de poll (igual `extracoes_video`).
- `ia-cost-catalog.ts` (custo do roteiro/TTS) + nova linha render+HeyGen.

## Custo estimado (por vídeo)

- Roteiro (Claude Sonnet): ~$0,05
- Narração TTS (5 cenas, Gemini TTS $1/$20 MM): ~$0,15
- **HeyGen avatar** (2 clips ~35s): depende do plano (créditos HeyGen) — **maior custo**
- Render trigger.dev (compute) + Bunny (storage/stream): centavos
- **Total ≈ $0,20 + custo HeyGen** por vídeo.

## Fase 1 — estrutura (com as decisões fechadas)

Gatilho: botão **"Gerar vídeo"** no Módulo-Base → cria `videos_gerados` (status) → task trigger.dev:

```
módulo → 1) Claude monta o roteiro (cenas)
       → 2) Gemini TTS gera os 5 mp3 (voz Kore) → sobe no Bunny (URLs públicas)
       → 3) HeyGen (avatar Abigail + audio_url do TTS) p/ intro e outro → polling → mp4s
       → 4) Remotion renderMedia (trigger.dev, headless) com inputProps = URLs dos assets
       → 5) upload do mp4 final no Bunny Stream → micro_conteudo formato=video + SRT/VTT
       → UI de status (poll) + player
```

Arquivos novos (espelham a extração): `actions/gerar-video.ts`, `trigger/gerar-video.ts`,
`app/api/internal/video-*` (callbacks), migration `videos_gerados`, botão no
`/admin/vertho/modulos-base/[id]`, lib `lib/heygen.ts` + `lib/bunny-upload.ts`,
e adaptar `video-spike/remotion/data/load-scenes` p/ aceitar **URLs externas**
(em vez de `staticFile`) via `inputProps`.

### Ordem de execução
1. **De-risk render** (sem HeyGen, já dá pra começar): provar `renderMedia` headless
   no trigger.dev renderizando o spike V3 atual → mp4 → Bunny. É o maior risco técnico.
2. **Núcleo** — roteiro (Claude) + TTS + Bunny + render + micro_conteudo + UI/status,
   com avatar = clip fixo (os atuais) enquanto o HeyGen não entra.
3. **HeyGen** — `lib/heygen.ts` (generate + polling) com avatar Abigail + audio_url do TTS.
4. **Refino** — forced alignment p/ legenda exata, personalização DISC/cargo, reuso.

## Pendências / o que preciso de você

- **`HEYGEN_API_KEY`** (no `.env.local` + Vercel + trigger.dev). Avatar já definido:
  `HEYGEN_AVATAR_ID = Abigail_expressive_2024112501`. (Sem voice_id — voz é o nosso TTS.)
- Bunny Stream confirmado como destino (já em uso no app).
- Plano HeyGen (créditos) p/ estimar o custo real do avatar.

> Posso começar JÁ pela ordem 1 (de-risk render no trigger.dev) — não depende do HeyGen.

---

## Atualização 25/06/2026 — duração, cache de saudação e infra

**Duração calibrada (3,5–4,5 min).** Vídeos saíam ~5,6 min. `lib/video/roteiro-prompt.ts` recalibrado com a **taxa real medida ~125 palavras/min** (não ~90): alvo **~490 palavras / ~4 min**, miolo **6–8 cenas**, 58–66 palavras/cena, faixa 440–540. (1ª tentativa com ~390 palavras saiu 3,0–3,6 min = baixo demais.) Sem hard-cap pós-TTS — recalibrar medindo `palavras ÷ (totalFrames/30/60)`.

**Cache de saudação (escala).** `worker-hetzner/personalizar.mjs`: a saudação ("Olá, {nome}" = TTS Vertex + render Remotion `AvatarGreeting`) era refeita por (usuário × célula). Agora o `greetMp4` é gravado **1× no storage** (`video-assets/greetings-cache/{colab}__{voz}__{nome}__{WxH}.mp4`) e **reutilizado** em todas as células — pula TTS (rate-limited) + render; só o crossfade com o deck permanece por vídeo. Chave determinística (sem tabela). Escala: O(usuários × materiais) → O(usuários). Ver `docs/ESCALA-50K.md`.

**Infra de render.**
- `RENDER_SERVER_TYPE=cx43` (era cx33; ~2× + folga de RAM). CX só existe em hel1/nbg1 (Europa).
- Watchdog `MAX_RENDER_MS` default 25→**40min** (`worker.mjs`): 25min matava render válido (um de 5,6min levou 32min em cx33). Override por env.
- TTS resiliente (`lib/gemini-tts.ts`): re-tenta quando o Vertex responde **200 OK sem áudio** (intermitente) — antes 1 cena com hiccup derrubava o vídeo ("TTS: resposta sem áudio").
- Snapshot atual: `401652957` (rebuildar quando `worker-hetzner/*` mudar → atualizar `RENDER_SNAPSHOT_ID` no trigger).
