/**
 * HeyGen — gera o mp4 do avatar (Mentora Vertho) fazendo LIP-SYNC da NOSSA
 * narração (TTS Gemini). NÃO usamos a voz da HeyGen: passamos `audio_url` (a URL
 * pública do mp3 gerado em `trigger/gerar-video-modulo.ts`), garantindo a mesma
 * voz nas cenas de avatar e nas demais.
 *
 * Fluxo: `POST /v3/videos` → polling em `GET /v3/videos/{id}` → URL do mp4. O mp4
 * vira input das cenas avatar_intro / avatar_outro do Remotion.
 *
 * ── API v3 desde 25/09/2026 ─────────────────────────────────────────────────────
 * A HeyGen retira `/v2/video/generate` e `/v1/video_status.get` em **31/10/2026**.
 * Contrato v3 `Medido` em 24/09 com a nossa foto:
 *   · `engine` é OBJETO (`{ type: 'avatar_iii' }`); string devolve 400.
 *   · sem `engine`, o v3 usa **Avatar IV**, que custou US$ 0,0382/s contra
 *     US$ 0,0171/s do `avatar_iii` (mesmo áudio de 7,58s, delta da carteira).
 *     O `avatar_iii` custa o MESMO que a v2 `talking_photo` (US$ 0,0172/s). Por isso
 *     o motor é EXPLÍCITO, e só a env `HEYGEN_ENGINE` o troca.
 *   · a foto de sempre (`d160ea51…`) já existe na v3 como look `photo_avatar`, e o
 *     id é o mesmo: vai em `avatar_id`.
 *   · saída 1920×1080 a 25fps, como a v2; o trigger normaliza para 30fps.
 *
 * ── Custo no ledger ──────────────────────────────────────────────────────────────
 * Até aqui o avatar, a MAIOR linha de custo do vídeo, não aparecia em conta nenhuma:
 * HTTP direto, fora do wrapper de IA. Agora cada clipe concluído grava uma linha em
 * `ia_usage_log` (feature `heygen_avatar`, source `heygen:v3`), com o custo =
 * duração que a HeyGen reporta (segundo exato) × preço do motor. Conferido contra o
 * saldo da carteira em 25/09: 1,3% abaixo.
 */
import { createHash } from 'node:crypto';
import { gravarLinhaLedger } from '../ia-ledger';
import { HEYGEN_USD_POR_SEGUNDO } from '../ia-cost-catalog';

const BASE = 'https://api.heygen.com';
// Lidos em RUNTIME: `const` de topo leria o env antes de o script carregar o `.env`.
const chave = () => process.env.HEYGEN_API_KEY || '';
// Avatar da marca "Mentora Vertho" (foto aberta, navy), validado em 17/06. A env só
// sobrescreve para testar outra foto. Não é segredo (id de asset).
export const fotoPadraoHeyGen = () => process.env.HEYGEN_TALKING_PHOTO_ID || 'd160ea51f4124514b94aa1cf8e56eb42';
export const motorHeyGen = () => process.env.HEYGEN_ENGINE || 'avatar_iii';

interface GerarOpts {
  /** Outro look (avatar_id da v3) no lugar da foto padrão. */
  avatarId?: string;
  width?: number;
  height?: number;
}

/** O que o polling devolve quando o clipe fica pronto. */
export interface ClipePronto {
  url: string;
  /** Duração que a HeyGen reporta (s), a base da cobrança. */
  duracaoS: number | null;
}

interface AguardarOpts {
  intervaloMs?: number;
  tentativas?: number;
  /** De quem é o custo. Sem isto, o clipe sai sem linha no ledger (uso de script). */
  ledger?: { feature: string; empresaId: string | null };
}

const cabecalhos = () => ({ 'X-Api-Key': chave(), 'Content-Type': 'application/json', Accept: 'application/json' });

/** Dispara a geração do clip de avatar com lip-sync do áudio dado. Retorna o video_id. */
export async function gerarClipHeyGen(audioUrl: string, opts: GerarOpts = {}): Promise<string> {
  if (!chave()) throw new Error('HEYGEN_API_KEY ausente');
  const altura = opts.height ?? 1080;
  const body = {
    type: 'avatar',
    avatar_id: opts.avatarId || fotoPadraoHeyGen(),
    engine: { type: motorHeyGen() },
    audio_url: audioUrl,
    resolution: altura >= 1080 ? '1080p' : '720p',
    aspect_ratio: '16:9',
  };
  const r = await fetch(`${BASE}/v3/videos`, { method: 'POST', headers: cabecalhos(), body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  const id = j?.data?.video_id;
  if (!r.ok || !id) throw new Error(`HeyGen generate falhou: ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return id;
}

/** 5xx e 429 são do fornecedor e passam; os demais 4xx não vão melhorar esperando. */
const ehTransitorio = (status: number) => status === 429 || status >= 500;

/** `correlation_id` estável por clipe: um re-run que observe o mesmo clipe de novo
 *  grava com o MESMO id, e a duplicata fica identificável no ledger. */
function correlacaoDoClipe(videoId: string): string {
  const h = createHash('sha1').update(`heygen:${videoId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Faz polling do status até `completed`/`failed`. Retorna a URL do mp4 final (e
 * grava o custo no ledger quando `opts.ledger` vem).
 *
 * ⚠️ A mensagem de timeout é lida como texto em `pipeline-health` e na FMEA
 * ("HeyGen timeout aguardando video_id"): não mudar a redação.
 */
export async function aguardarClipHeyGen(videoId: string, opts: AguardarOpts = {}): Promise<string> {
  return (await aguardarClipeHeyGen(videoId, opts)).url;
}

/** Igual a `aguardarClipHeyGen`, devolvendo também a duração cobrada. */
export async function aguardarClipeHeyGen(videoId: string, opts: AguardarOpts = {}): Promise<ClipePronto> {
  if (!chave()) throw new Error('HEYGEN_API_KEY ausente');
  const intervalo = opts.intervaloMs ?? 8000;
  const max = opts.tentativas ?? 150; // ~20 min
  const t0 = Date.now();
  for (let i = 0; i < max; i++) {
    await new Promise((res) => setTimeout(res, intervalo));
    const r = await fetch(`${BASE}/v3/videos/${encodeURIComponent(videoId)}`, { headers: cabecalhos() });
    if (!r.ok) {
      if (ehTransitorio(r.status)) continue;
      const corpo = await r.text().catch(() => '');
      throw new Error(`HeyGen status ${r.status} para video_id ${videoId}: ${corpo.slice(0, 200)}`);
    }
    const j = await r.json().catch(() => ({}));
    const d = j?.data || {};
    const st = String(d.status || '').toLowerCase();
    if (st === 'completed') {
      if (!d.video_url) throw new Error('HeyGen completou sem video_url');
      const duracaoS = Number.isFinite(Number(d.duration)) ? Number(d.duration) : null;
      if (opts.ledger) await registrarCustoClipe(videoId, duracaoS, Date.now() - t0, opts.ledger);
      return { url: d.video_url, duracaoS };
    }
    if (st === 'failed' || st === 'error') {
      throw new Error(`HeyGen falhou: ${JSON.stringify(d.error || d.failure_message || d).slice(0, 200)}`);
    }
  }
  throw new Error(`HeyGen timeout aguardando video_id ${videoId}`);
}

async function registrarCustoClipe(videoId: string, duracaoS: number | null, latencyMs: number, ledger: { feature: string; empresaId: string | null }) {
  const motor = motorHeyGen();
  const preco = HEYGEN_USD_POR_SEGUNDO[motor];
  // Segundo EXATO: medido em 25/09, arredondar para cima ficava 4,6% acima do saldo.
  const custo = duracaoS !== null && preco !== undefined ? duracaoS * preco : null;
  await gravarLinhaLedger({
    correlation_id: correlacaoDoClipe(videoId),
    feature: ledger.feature,
    empresa_id: ledger.empresaId,
    provider: 'heygen',
    model: `heygen-${motor}`,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: custo,
    latency_ms: latencyMs,
    status: 'ok',
    source: 'heygen:v3',
  });
}
