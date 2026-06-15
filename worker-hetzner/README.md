# Worker de render Remotion — Hetzner (always-on, pull)

Renderiza os vídeos da fila `videos_gerados` (status `render_queued`) numa VPS
barata, em vez de pagar o compute caro do trigger.dev. Modelo **pull**: o worker
faz poll no Supabase, não há endpoint público (a caixa só faz conexões de saída).

## Arquitetura

```
trigger.dev (gerar-video-modulo)            Hetzner CX33 (este worker, always-on)
  roteiro → TTS → HeyGen → ffprobe            loop:
  → montar inputProps                           claim atômico (FOR UPDATE SKIP LOCKED)
  → grava render_inputprops + srt/vtt           renderMedia(VerthoVideo, inputProps)
  → status = 'render_queued'   ───fila DB───▶   upload Bunny → status='done'
```

- **Claim atômico** (`FOR UPDATE SKIP LOCKED`): seguro com N workers; nunca processam o mesmo job.
- **Reaper**: jobs presos em `rendering` há > `REAP_AFTER_MIN` voltam pra fila (auto-cura se o worker cair).
- **Mesma composição** do app (`spike-bundle/`) — só muda *onde* renderiza.

## Pré-requisitos

1. Uma VPS Hetzner (recomendado **CX33**: 4 vCPU / 8 GB / ~$9/mês) com Docker.
2. O bundle Remotion atualizado em `./spike-bundle` (copie de `nextjs-app/spike-bundle`).
3. As envs (ver `.env.example`): `DATABASE_URL`, `BUNNY_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`.

## Atualizar o bundle (a cada mudança nas cenas Remotion)

```bash
# no nextjs-app:
cd video-spike && npx remotion bundle remotion/index.ts --out-dir ../spike-bundle
# copie nextjs-app/spike-bundle → worker-hetzner/spike-bundle antes de buildar a imagem
```

## Subir na CX33

```bash
# 1) copie a pasta worker-hetzner/ (com spike-bundle/) pra VPS
scp -r worker-hetzner root@SEU_IP:/opt/vertho-worker

# 2) na VPS:
cd /opt/vertho-worker
cp .env.example .env && nano .env        # preencha DATABASE_URL e BUNNY_STREAM_API_KEY
docker build -t vertho-render-worker .
docker run -d --name vertho-worker --restart=always --env-file .env vertho-render-worker

# logs
docker logs -f vertho-worker
```

`--restart=always` garante que o worker volte após reboot/crash. Para atualizar:
`docker stop vertho-worker && docker rm vertho-worker`, rebuild, run de novo.

## Ligar/desligar a migração (sem mexer em código)

O app decide onde renderizar pela env **`RENDER_BACKEND`** no **trigger.dev**:

- `RENDER_BACKEND=trigger` (default) — render no trigger.dev (comportamento atual).
- `RENDER_BACKEND=hetzner` — o job só enfileira; **este worker** renderiza.

Para migrar: suba o worker, confirme que ele drena a fila, e então defina
`RENDER_BACKEND=hetzner` no trigger.dev prod. Para voltar, troque de volta — sem deploy.

## Resolução (720p / 1080p)

O job grava `render_scale` por vídeo (`0.6667`=720p, `1.0`=1080p). Sem valor, o
worker usa `VIDEO_RENDER_SCALE` do `.env`. Em CX33 o 1080p é praticamente de graça
(custo fixo), então dá pra subir a resolução sem impacto de custo — só mais tempo
de render por vídeo.

## Escala

1 worker = 1 render por vez. Para mais throughput em picos, suba **mais containers**
(mesma imagem, mesmo `.env`) na mesma VPS ou em outra — o claim atômico cuida da
concorrência. O índice parcial `idx_videos_gerados_fila` mantém o claim barato.
