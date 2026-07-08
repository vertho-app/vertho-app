---
name: video
description: Gerar/editar vídeo de microlearning na Vertho App (Claude roteiro + Gemini TTS + HeyGen avatar + Remotion render + Bunny Stream). Use quando o trabalho envolver lib/video/, worker-hetzner/, trigger/gerar-video-modulo.ts, trigger/render-video.ts, video-spike/, ou o usuário falar em vídeo/microlearning/roteiro/HeyGen/Remotion/Bunny/render. Encodes o pipeline implementado, os dois backends de render (hetzner default) e a calibragem de duração/áudio.
---

# Gerador de Vídeo de Módulo-Base (Vertho App)

**Status: implementado e em produção.** Gatilho: botão **"Gerar vídeo"** no Módulo-Base (`/admin/vertho/modulos-base/[id]`) → `actions/gerar-video.ts::criarEDispatcharVideo` → task `trigger/gerar-video-modulo`. A seção "Estado atual" de `docs/GERADOR-VIDEO-MODULO.md` é autoritativa (o resto do doc é design histórico defasado).

## Pipeline (task `gerar-video-modulo`)

1. **Roteiro** — `claude-opus-4-6` + extended thinking. Estrutura: `avatar_intro` + miolo 6–12 cenas (13 templates) + `avatar_outro`. O `avatar_intro` **não cumprimenta** (a saudação nominal é separada).
2. **Narração** — Gemini TTS, voz **`Vindemiatrix`** (`VIDEO_TTS_VOICE`), 1 mp3/cena, com direção de estilo por tipo de cena + correção de siglas. **Whisper** alinha palavra-a-palavra (legendas).
3. **Avatar (HeyGen)** — só nas pontas; **lip-sync do NOSSO mp3** (`voice.type=audio`, sem `voice_id`), 1920×1080, CFR 25→30fps.
4. **Render (Remotion, comp `VerthoVideo`)** — recebe tudo via `inputProps` (`lib/video/montar-inputprops.ts`). Dois backends (`RENDER_BACKEND`):
   - **`hetzner`** (default/produção): enfileira `render_queued`; box **CX33/CX43 efêmera** (`worker-hetzner/worker.mjs`, modelo PULL) renderiza. ~**$0,18/vídeo**. ⚠️ **CX** (shared, barato) — NÃO **CCX** (dedicado, cota travada em conta nova).
   - **`trigger`** (override de teste): render em chunks paralelos (`trigger/render-chunk.ts`). ~$5–6/vídeo em 1080p.
5. **SFX por template** — pacote sonoro embutido na composição (`VideoCompositionV3`), volumes calibrados, gatilhado pela fala. Cortes secos entre cenas (só fade de abertura/fechamento do vídeo via `FilmFade`).
6. **Masterização de áudio** — `worker-hetzner/masterizar-audio.mjs` (ffmpeg): trilha (bed) + **ducking sidechain** + **−14 LUFS / −1 dBTP** (loudnorm 2-pass). Degrada p/ áudio cru se faltar o bed.
7. **Upload** → Bunny Stream (lib `636615`) → grava `videos_gerados` (status/etapa/urls/srt/vtt).

## Personalização por pessoa (Rota A)

O deck é **genérico por célula** (módulo × empresa × cargo × DISC); **o nome não entra no render**. Depois, `worker-hetzner/personalizar.mjs` gera "Olá, {nome}. Que bom ter você aqui." por colaborador — TTS **Vindemiatrix** normalizado a −14 LUFS, cena `AvatarGreeting` (Remotion) + crossfade curto (0,3s). Grava em `videos_personalizados` (cache por célula×colaborador). A saudação é cacheada em storage (`video-assets/greetings-cache/...mp4`) e reutilizada entre células.

Entrega: `resolverVideoDaSemana`/`resolverCelulaVideo` → personalizado se `done`, senão o genérico da célula (fallback transparente).

## Calibragem (não regredir)

- **Duração alvo ~4 min** (~490 palavras, taxa real **~125 wpm**, não 90). Miolo **6–8 cenas**, 58–66 palavras/cena (faixa 440–540). Sem hard-cap pós-TTS.
- **1080p default** (`VIDEO_RENDER_SCALE` ausente → scale 1); 720p = 0,6667. Snap de scale p/ dims inteiras: `Math.round(h*scale)/h` (corrige bug do 0,6667).
- **TTS resiliente** (`lib/gemini-tts.ts`): re-tenta quando o Vertex responde **200 OK sem áudio**.
- **`MAX_RENDER_MS` default 40 min** (era 25 — matava render válido de ~5,6 min que levou 32 min em cx33). Override por env.
- **`RENDER_SERVER_TYPE=cx43`** (~2× a cx33 + folga de RAM). CX só existe em hel1/nbg1 (Europa).
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
