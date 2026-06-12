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
- Legendas: parágrafo por cena fatiado e distribuído no tempo. `cuesToSrt()` já
  existe para export futuro (quando houver timestamps reais do TTS).
- Sem imagens de IA — só ícones SVG e o logo da marca.
