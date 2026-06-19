/**
 * HeyGen — gera o mp4 do avatar (Mentora Vertho) fazendo LIP-SYNC da NOSSA
 * narração (TTS Gemini, voz Callirrhoe). NÃO usamos a voz do HeyGen: passamos
 * `voice.type = 'audio'` + `audio_url` (a URL pública do mp3 gerado em
 * `trigger/gerar-video-modulo.ts`), garantindo a mesma voz nas cenas de avatar e nas demais.
 *
 * Fluxo: generate → poll status → URL do mp4. O mp4 vira input das cenas
 * avatar_intro / avatar_outro do Remotion (OffthreadVideo via inputProps).
 */
const KEY = process.env.HEYGEN_API_KEY || '';
const AVATAR = process.env.HEYGEN_AVATAR_ID || 'Abigail_expressive_2024112501';
// Avatar da marca "Mentora Vertho": se HEYGEN_TALKING_PHOTO_ID estiver setado, usa
// um Talking Photo (foto custom, photoreal, mesmo custo ~$0,017/s) no lugar do
// avatar preset. Sem ele, cai no avatar_id (Abigail). Avatar IV (v3) é ~3× mais
// caro — não usado.
// Avatar "Mentora Vertho" (Talking Photo aberto, navy) é o DEFAULT — validado
// 17/06. Env var só sobrescreve (ex.: testar outra foto). Não é segredo (id de asset).
const TALKING_PHOTO = process.env.HEYGEN_TALKING_PHOTO_ID || 'd160ea51f4124514b94aa1cf8e56eb42';
const BASE = 'https://api.heygen.com';

export interface ClipAvatar {
  videoId: string;
  url: string;
  width: number;
  height: number;
}

interface GerarOpts {
  avatarId?: string;
  width?: number;
  height?: number;
  avatarStyle?: 'normal' | 'closeUp' | 'circle';
}

/** Dispara a geração do clip de avatar com lip-sync do áudio dado. Retorna o video_id. */
export async function gerarClipHeyGen(audioUrl: string, opts: GerarOpts = {}): Promise<string> {
  if (!KEY) throw new Error('HEYGEN_API_KEY ausente');
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const body = {
    video_inputs: [{
      character: (TALKING_PHOTO && !opts.avatarId)
        ? { type: 'talking_photo', talking_photo_id: TALKING_PHOTO }
        : { type: 'avatar', avatar_id: opts.avatarId || AVATAR, avatar_style: opts.avatarStyle || 'normal' },
      voice: { type: 'audio', audio_url: audioUrl },
    }],
    dimension: { width, height },
  };
  const r = await fetch(`${BASE}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  const id = j?.data?.video_id;
  if (!r.ok || !id) throw new Error(`HeyGen generate falhou: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return id;
}

/** Faz polling do status até `completed`/`failed`. Retorna a URL do mp4 final. */
export async function aguardarClipHeyGen(videoId: string, opts: { intervaloMs?: number; tentativas?: number } = {}): Promise<string> {
  const intervalo = opts.intervaloMs ?? 8000;
  const max = opts.tentativas ?? 150; // ~20 min
  for (let i = 0; i < max; i++) {
    await new Promise((res) => setTimeout(res, intervalo));
    const r = await fetch(`${BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: { 'X-Api-Key': KEY, Accept: 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    const st = j?.data?.status;
    if (st === 'completed') {
      const url = j?.data?.video_url;
      if (!url) throw new Error('HeyGen completou sem video_url');
      return url;
    }
    if (st === 'failed') throw new Error(`HeyGen falhou: ${JSON.stringify(j?.data?.error || j).slice(0, 200)}`);
  }
  throw new Error(`HeyGen timeout aguardando video_id ${videoId}`);
}

/** Gera o clip e aguarda — devolve a URL do mp4 + dimensões. */
export async function gerarAvatarComLipSync(audioUrl: string, opts: GerarOpts = {}): Promise<ClipAvatar> {
  const width = opts.width ?? 1280;
  const height = opts.height ?? 720;
  const videoId = await gerarClipHeyGen(audioUrl, { ...opts, width, height });
  const url = await aguardarClipHeyGen(videoId);
  return { videoId, url, width, height };
}
