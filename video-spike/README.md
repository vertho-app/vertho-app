# Vertho — Video Spike (Remotion)

Spike **isolado** para validar a qualidade visual do miolo de vídeo (templates
animados + avatar + áudio). **Não** integra com Supabase, Bunny, QStash, banco
ou `micro_conteudos`. Não cria rotas no Next.js (fica fora de `app/`, e a pasta
é excluída do `tsconfig.json` do app).

## Como rodar

```bash
npm run video:preview   # abre o Remotion Studio (preview interativo)
npm run video:render    # gera outputs/vertho-video-spike.mp4 (1920x1080, 30fps)
```

Ambos rodam antes o `video:probe`, que lê a duração REAL de cada asset
(`@remotion/media-parser`) e grava `remotion/data/durations.json`.

## Estrutura

```
video-spike/remotion/
  index.ts                 # registerRoot (entrypoint do Remotion)
  Root.tsx                 # Composition "VerthoVideoSpike" + calculateMetadata
  VideoComposition.tsx     # orquestra as cenas (Sequences) + legendas + logo + progress bar
  theme.tsx                # paleta Vertho, fundo animado, ícones SVG, eyebrow, brandmark, progress
  data/
    load-scenes.ts         # lê spike-scenes.json + captions-draft.json + durations.json → props
    probe-durations.mjs    # pré-calcula durações reais (Node, sem ffmpeg)
    durations.json         # (gerado) duração por asset
  scenes/
    AvatarClip.tsx         # cenas 1 e 5 (MP4 com áudio próprio + overlay título)
    ConceptReveal.tsx      # cena 2 (título + bullets sequenciais + motivo de radar)
    ComparisonMotion.tsx   # cena 3 (Reagir x Antecipar, ênfase final em Antecipar)
    IconStory.tsx          # cena 4 (3 cards com ícones, entrada sequencial)
    Captions.tsx           # legenda global (rodapé translúcido)
  utils/
    timing.ts              # reveal/fadeInOut/spring/easing
    captions.ts            # fatiamento + timeline de legendas + export SRT (preparado)
```

Assets em `public/video-spike/assets/` (publicDir do Remotion = `public/video-spike`).

## Identidade

- Primária (ciano) `#34c5cc` · Secundária (navy) `#142f57` · Fundo `#071A33`
- 16:9 · 1920x1080 · 30fps · fonte Inter (fallback Segoe UI)

## Notas

- As durações das cenas vêm dos assets reais (vídeo/áudio), não fixas.
- Sem imagens de IA — só ícones SVG e o logo da marca.
- Composições: **VerthoVideoSpike** (V1), **VerthoVideoSpikeV2** (acabamento), **VerthoVideoSpikeV3** (legendas por timestamp).

## V3 — Legendas sincronizadas por timestamps

A V3 mantém o visual da V2 e troca o sistema de legendas: em vez de tempo
proporcional, usa **timestamps reais por cena**.

### Fonte das legendas

`public/video-spike/assets/captions-timestamps.json` (principal). Formato em
`captions-timestamps.example.json`. **`start`/`end` são RELATIVOS ao início de
cada cena** (segundos). Se houver `phrases`, elas têm prioridade; `words`
habilita o word-highlight. `source` deve indicar a origem (ex.: `external_tts`).

> Para cenas de avatar, use o timing do áudio que gerou o vídeo no HeyGen; para
> cenas de áudio, o timing do MP3. **Produção não deve depender do fallback
> proporcional.**

### Modo e fallback (`CAPTION_MODE`)

`timestamps` (default) · `proportional` · `off` — via env `CAPTION_MODE` no
`video:captions:v3`. Se `captions-timestamps.json` não existir, o build emite
**warning** e cai no fallback proporcional (só para preview). Se o arquivo tiver
`source: "approximation_for_preview"`, o build avisa que NÃO é produção.

### Pipeline (fonte única)

`build-captions-v3.ts` (Node) resolve as legendas com o **core puro**
(`captions/captions-core.ts`) e grava `data/captions-resolved.json` (consumido
pelo vídeo) **e** `outputs/vertho-video-spike-v3.srt/.vtt` — todos da MESMA
timeline (`buildVideoTimeline`). Regras: ≤9 palavras, ≤2 linhas, 1.0–3.5s.

### Word-highlight e captions queimadas

`load-scenes-v3.ts`: `CAPTION_WORD_HIGHLIGHT` (default `true`, ciano sutil) e
`SHOW_BURNED_CAPTIONS` (default `true`).

### Trocar legenda queimada por SRT/VTT externo

1. Coloque o export real do TTS em `captions-timestamps.json` (`source` ≠
   `approximation_for_preview`).
2. Rode `npm run video:render:v3` → gera mp4 + `.srt` + `.vtt` (mesma timeline).
3. Para o player externo legendar (sem queimar no vídeo): em
   `load-scenes-v3.ts` defina `SHOW_BURNED_CAPTIONS = false` e sirva o `.vtt`/`.srt`
   junto do mp4 (mesma timeline, então sincroniza).

### Scripts

```bash
npm run video:captions:v3   # resolve legendas + gera .srt/.vtt
npm run video:render:v3     # → outputs/vertho-video-spike-v3.mp4 (+ .srt + .vtt)
```
