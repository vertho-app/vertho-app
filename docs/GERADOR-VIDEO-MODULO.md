# Gerador de Vídeo a partir de Módulo-Base — Design

> Status: **DESIGN** (não implementado). Decisões: avatar via **HeyGen API**;
> gatilho **no Módulo-Base**. Reaproveita o spike Remotion (V3), `lib/gemini-tts.ts`,
> Bunny Stream e o padrão trigger.dev→callback da extração.

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
  2a) AVATAR (HeyGen API)  →  avatar-intro.mp4 + avatar-outro.mp4 (ASSÍNCRONO ~minutos)
  2b) NARRAÇÃO (Gemini TTS)  →  audio-2/3/4.mp3 das cenas animadas
  │     reusa lib/gemini-tts.ts (voz feminina Kore/escolhida)
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

## Integração HeyGen (assíncrona)

1. `POST /v2/video/generate` com avatar_id + voice_id + script (texto da intro/outro).
2. Recebe `video_id`; **polling** `GET /v1/video_status.get?video_id=` até `completed`.
3. Baixa o mp4 resultante (URL temporária do HeyGen).
- Precisa: `HEYGEN_API_KEY`, `HEYGEN_AVATAR_ID` (avatar da mentora), `HEYGEN_VOICE_ID`.
- Render HeyGen leva ~1-3 min/clip → o job de vídeo é naturalmente assíncrono.
- Legendas do avatar: HeyGen pode devolver caption/timing; se não, usamos
  proporcional+janela-de-fala (já temos no `captions-core`).

## Render Remotion no trigger.dev (item de risco)

- `@remotion/renderer` `renderMedia()` headless. Precisa Chrome Headless Shell +
  ffmpeg no container → instalar no build (extensão, como fizemos com yt-dlp).
- O bundle do spike é estático; os **assets variam por vídeo** → a composição
  recebe as URLs dos assets via `inputProps` (avatar mp4 + mp3 do Bunny/temp),
  em vez de `staticFile`. Adaptar load-scenes para aceitar URLs externas.
- Recursos: 1080p30 ~97s ≈ poucos min de CPU. Validar maxDuration/máquina.
- **De-risk primeiro**: provar `renderMedia` headless no trigger.dev com o spike
  atual (sem HeyGen) antes de montar o resto.

## Reuso

- Spike Remotion V3 inteiro (cenas, legendas, captions-core, SRT/VTT export).
- `lib/gemini-tts.ts` (narração), Bunny Stream (`/api/bunny-videos`, library).
- Padrão trigger.dev → `POST /api/internal/...` callback (igual extração).
- Tracker de status + UI de poll (igual `extracoes_video`).
- `ia-cost-catalog.ts` (custo do roteiro/TTS) + nova linha render+HeyGen.

## Custo estimado (por vídeo)

- Roteiro (Claude Sonnet): ~$0,05
- Narração TTS (3 cenas, Gemini TTS $1/$20 MM): ~$0,10
- **HeyGen avatar** (2 clips ~35s): depende do plano (créditos HeyGen) — **maior custo**
- Render trigger.dev (compute) + Bunny (storage/stream): centavos
- **Total ≈ $0,20 + custo HeyGen** por vídeo.

## Fases

1. **De-risk render** — `renderMedia` headless no trigger.dev com o spike (sem HeyGen).
2. **Núcleo** — roteiro (Claude) + TTS + render + Bunny + micro_conteudo + UI/status, **avatar mockado** (clip fixo).
3. **HeyGen** — troca o avatar mockado pela API real (assíncrona) + legendas do avatar.
4. **Refino** — legendas com forced alignment, personalização DISC/cargo, reuso.

## Pendências / o que preciso de você

- `HEYGEN_API_KEY` + `HEYGEN_AVATAR_ID` + `HEYGEN_VOICE_ID` (da mentora Vertho).
- Confirmar Bunny Stream como destino (vs Storage) — assumido Stream.
- Plano HeyGen (créditos) p/ estimar o custo real do avatar.
