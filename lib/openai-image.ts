/**
 * Geração de imagem via OpenAI gpt-image-1.
 *
 * Usado pela capa do "conteúdo final" (PDF premium): gera APENAS um fundo
 * editorial branded — sem texto, letras ou logo (a IA de imagem distorce
 * texto). O texto real é aplicado por camada controlada no @react-pdf.
 */

const IMAGE_API = 'https://api.openai.com/v1/images/generations';
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

/**
 * Prompt de fundo de capa. Mantém a metade esquerda como negative space
 * calmo (navy) pra o título ficar legível; interesse visual à direita.
 * @param tema dica temática sutil (ex.: competência) — opcional.
 */
export function buildCoverPrompt(tema?: string | null): string {
  const motif = tema
    ? `Subtle abstract motifs that gently evoke "${tema}" (kept minimal, never literal, never with any symbols that look like letters). `
    : '';
  return [
    'Premium editorial A4 vertical cover BACKGROUND for an institutional educational development guide by Vertho.',
    'Deep navy (#142F57) dominant background.',
    'The LEFT 60% MUST be a calm, almost-solid deep navy area with no busy elements — clean negative space reserved for text.',
    'Place ALL visual interest on the RIGHT side and lower-right: elegant abstract concentric rings, soft curved lines and translucent panels in cyan (#34C5CC) and light cyan (#9AE2E6), subtle abstract strategy/data motifs, soft cinematic glow.',
    motif,
    'Style: sophisticated, modern, institutional, premium, minimal, flat vector-like aesthetic with soft gradients.',
    'STRICTLY NO text, NO letters, NO numbers, NO words, NO logo, NO people, NO cartoon, NO clipart, NO childish elements, NO stock-photo look.',
  ].filter(Boolean).join(' ');
}

/**
 * Gera o fundo de capa e retorna PNG como Buffer. Lança em erro/sem chave —
 * o caller decide o fallback.
 */
export async function generateCoverImage(tema?: string | null): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch(IMAGE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      prompt: buildCoverPrompt(tema),
      size: '1024x1536', // retrato ~2:3 (próximo de A4)
      quality: 'medium',
      n: 1,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI image ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI image: resposta sem b64_json');
  return Buffer.from(b64, 'base64');
}
