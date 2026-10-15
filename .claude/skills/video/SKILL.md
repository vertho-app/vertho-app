---
name: video
description: Gerar/editar vídeo de microlearning na Vertho App (Claude roteiro + Gemini TTS + HeyGen avatar + Remotion render + Bunny Stream). Use quando o trabalho envolver lib/video/, worker-hetzner/, trigger/gerar-video-modulo.ts, trigger/render-video.ts, video-spike/, ou o usuário falar em vídeo/microlearning/roteiro/HeyGen/Remotion/Bunny/render. Encodes o pipeline implementado, os dois backends de render (hetzner default) e a calibragem de duração/áudio.
---

# Gerador de Vídeo de Módulo-Base (Vertho App)

**Status: implementado e em produção.** Dois gatilhos, a mesma task `trigger/gerar-video-modulo`:
- **Kit semanal (o caminho que roda):** `gerarKitSemanal` dispara as 4 células DISC juntas (`dispararCelulasDoKitEmLote`, `lib/video/celulas-lote.ts`), com os roteiros num lote só e os disparos espaçados.
- **Admin:** botão **"Gerar vídeo"** no Módulo-Base (`/admin/vertho/modulos-base/[id]`) → `actions/gerar-video.ts::criarEDispararVideo`.

A seção "Estado atual" de `docs/GERADOR-VIDEO-MODULO.md` é autoritativa (o resto do doc é design histórico defasado).

🔴 **Modelo, voz e máquina se conferem na fonte, não aqui.** Esta skill já afirmou Opus 4.6 e Vindemiatrix meses depois da troca. Modelo: `DEFAULT_TASK_MODELS` + `PINNED_TASKS` em `lib/ai-tasks.ts`. Voz: `lib/tts/elenco.ts`, mas a env do Trigger vence o código (`VIDEO_TTS_VOICE`, `GEMINI_TTS_VERTEX_MODEL`, `RENDER_SERVER_TYPES`). O que de fato rodou: `ia_usage_log` (`conteudo_video`, `video_avatar_grupo`, `tts_video_cena`, `tts_saudacao`, `heygen_avatar`). Valores abaixo conferidos em 15/10/2026.

## Pipeline (task `gerar-video-modulo`)

1. **Roteiro** — task `conteudo_video` = `claude-opus-5`, pela **Batch API** (`submitClaudeBatch`, −50%), **sem `thinking` no corpo** (na geração 5 o raciocínio já vem ligado e divide os 16k de `max_tokens`). Resolve sem empresa, então o `modelo_padrao` do tenant não o troca. Estrutura: `avatar_intro` + miolo 6–12 cenas (13 templates) + `avatar_outro`. O `avatar_intro` **não cumprimenta** (a saudação nominal é separada).
   - **Avatar por grupo** (`VIDEO_AVATAR_GRUPO=on`): abertura e fecho escritos 1× por empresa × módulo × cargo, em tom neutro (task `video_avatar_grupo`, `claude-opus-5`, **pinada** desde 15/10/2026: antes o `modelo_padrao` Sonnet 4.6 das empresas vencia). Só a 1ª célula do grupo paga a HeyGen; as irmãs narram só o miolo. Detalhe em "Avatar compartilhado por grupo" no doc.
2. **Narração** — `gemini-2.5-flash-tts` **no Vertex** (`TTS_BACKEND=vertex`), voz **`Aoede`** (`VIDEO_TTS_VOICE`; era Vindemiatrix no 3.1 até 05/09/2026). Por padrão o roteiro inteiro sai num take só e é cortado por cena (`VIDEO_NARRACAO_UNICA`, `lib/video/narracao-unica.ts`), com direção de estilo + correção de siglas. **Whisper** (`whisper-1`) alinha palavra a palavra (legendas e cortes).
3. **Avatar (HeyGen)** — API **v3**, motor **`avatar_iii`** (`HEYGEN_ENGINE`), só nas pontas; **lip-sync do NOSSO mp3** (sem `voice_id`), 1920×1080, CFR 25→30fps. Sopro antes da fala é aparado antes de mandar (`lib/video/aparar-sopro.ts`).
4. **Render (Remotion, comp `VerthoVideo`)** — recebe tudo via `inputProps` (`lib/video/montar-inputprops.ts`). Dois backends (`RENDER_BACKEND`):
   - **`hetzner`** (default/produção): enfileira `render_queued`; box **efêmera** (`worker-hetzner/worker.mjs`, modelo PULL) renderiza, até `MAX_RENDER_BOXES` (4). Tipo pela escada `RENDER_SERVER_TYPES` do Trigger (`cx43,cx53,cx33,cpx32,cpx22,ccx13`, começando em `nbg1`). ~**$0,18/vídeo**. ⚠️ **CX** (shared, barato) primeiro; **CCX** (dedicado) só no fim da escada.
   - **`trigger`** (override de teste): render em chunks paralelos (`trigger/render-chunk.ts`). ~$5–6/vídeo em 1080p.
5. **SFX por template** — pacote sonoro embutido na composição (`VideoCompositionV3`), volumes calibrados, gatilhado pela fala. Cortes secos entre cenas (só fade de abertura/fechamento do vídeo via `FilmFade`).
6. **Masterização de áudio** — `worker-hetzner/masterizar-audio.mjs` (ffmpeg): trilha (bed) + **ducking sidechain** + **−14 LUFS / −1 dBTP** (loudnorm 2-pass). Degrada p/ áudio cru se faltar o bed.
7. **Upload** → Bunny Stream (lib `636615`) → grava `videos_gerados` (status/etapa/urls/srt/vtt).

## Personalização por pessoa (Rota A)

O deck é **genérico por célula** (módulo × empresa × cargo × DISC); **o nome não entra no render**. Depois, `worker-hetzner/personalizar.mjs` monta "Olá, {nome}. Que bom ter você aqui." por colaborador — o **áudio é sintetizado pelo APP no Vertex**, na mesma voz do corpo (`lib/video/saudacao-vertex.ts`, task `gerar-saudacoes-celula`, desde 07/10/2026; a box só lê, e sem o áudio a pessoa fica sem nominal em vez de cair em outro sintetizador), normalizado a −14 LUFS, cena `AvatarGreeting` (Remotion) + crossfade curto (0,3s). Grava em `videos_personalizados` (cache por célula×colaborador). A saudação é cacheada em storage (`video-assets/greetings-cache/...mp4`) e reutilizada entre células.

Entrega: `resolverVideoDaSemana`/`resolverCelulaVideo` → personalizado se `done`, senão o genérico da célula (fallback transparente).

## Calibragem (não regredir)

- **Duração alvo ~4 min** (~490 palavras, taxa real **~125 wpm**, não 90). Miolo **6–8 cenas**, 58–66 palavras/cena (faixa 440–540). Sem hard-cap pós-TTS.
- **1080p default** (`VIDEO_RENDER_SCALE` ausente → scale 1); 720p = 0,6667. Snap de scale p/ dims inteiras: `Math.round(h*scale)/h` (corrige bug do 0,6667).
- **TTS resiliente** (`lib/gemini-tts.ts`): re-tenta quando o Vertex responde **200 OK sem áudio**.
- **`MAX_RENDER_MS` default 40 min** (era 25 — matava render válido de ~5,6 min que levou 32 min em cx33). Override por env.
- **`RENDER_SERVER_TYPES`** (escada, vence o par `RENDER_SERVER_TYPE`/`RENDER_FALLBACK_TYPE`): cx43 primeiro (~2× a cx33 + folga de RAM); em falta de estoque (412) varre tipo × location. CX só existe na Europa.
- **`RENDER_SNAPSHOT_ID`** referencia o bundle do worker Hetzner — **o ID muda a cada rebuild** (não fixe um valor; confira o atual em uso). Ao mudar `worker-hetzner/*`: reconstruir (`scripts/_render-snapshot-build.mjs`) e **atualizar o snapshot no Trigger**.

## Render Remotion no Trigger — 4 gotchas (já resolvidas, manter)

1. Compositor nativo Linux: `additionalPackages(['@remotion/compositor-linux-x64-gnu@4.0.476'])`.
2. `@remotion/renderer` como **`external`** no build (senão `__name is not defined`).
3. Libs do Chrome no build (`installChromeDeps`); Chrome baixado em runtime por `ensureBrowser()`; `gl: 'swangle'`.
4. Máquina **`large-2x`** (4 vCPU/8 GB) — a default dá `TASK_PROCESS_OOM_KILLED`.

## NUNCA

- Usar `voice_id` do HeyGen — a voz é o NOSSO TTS (`voice.type=audio`).
- Recalcular duração sem medir `palavras ÷ (totalFrames/30/60)`.
- Baixar `MAX_RENDER_MS` abaixo de 40 min sem motivo forte.
- Esquecer de bumpar `RENDER_SNAPSHOT_ID` no Trigger ao mudar `worker-hetzner/*`.

## Fontes

- `docs/GERADOR-VIDEO-MODULO.md` (§ Estado atual), `docs/PROMPT-ROTEIRO-VIDEO.md`, `docs/ESCALA-50K.md`
- `lib/video/*`, `worker-hetzner/*`, `trigger/gerar-video-modulo.ts`, `trigger/render-video.ts`, `video-spike/remotion/`
- Skills `ai-calls` (roteiro/TTS) e `trigger-dev` (deploy da task)
