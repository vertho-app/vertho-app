/**
 * Geração de imagem via OpenAI gpt-image-1.
 *
 * Usado pela capa do "conteúdo final" (PDF premium): gera APENAS um fundo
 * editorial branded — sem texto, letras ou logo (a IA de imagem distorce
 * texto). O texto real é aplicado por camada controlada no @react-pdf.
 */

const IMAGE_API = 'https://api.openai.com/v1/images/generations';
const MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

/**
 * Prompt de fundo de capa: ILUSTRAÇÃO editorial conceitual que evoca o tema
 * do conteúdo (metáfora visual), não apenas formas abstratas. Mantém a coluna
 * esquerda como navy calmo pro título ficar legível; a cena vive à direita.
 * @param tema competência + descritor do conteúdo (guia a metáfora).
 */
/** Famílias de tratamento visual — sorteadas a cada geração p/ forçar variedade
 *  (mesmo tema/competência não converge sempre pra mesma imagem). */
const COVER_TREATMENTS = [
  'abstract architectural forms — arches, layered walls, doorways, staircases — with strong depth and perspective',
  'a natural landscape element (mountains, ocean, sky, canyon, dunes, forest) interpreted cinematically',
  'a single symbolic 3D object resting on a clean reflective surface, studio-lit',
  'flowing light trails, particles and luminous energy across dark negative space',
  'abstract geometric / network / data-inspired forms — nodes, lattices, waves, fragments',
  'an atmospheric interior or environment with strong perspective and depth',
  'organic forms — growth, layers, crystalline or topographic structures',
];

export function buildCoverPrompt(tema?: string | null): string {
  const treatment = COVER_TREATMENTS[Math.floor(Math.random() * COVER_TREATMENTS.length)];
  const conceito = tema
    ? `Invent a SINGLE elegant conceptual metaphor that visually represents the SPECIFIC topic of this content: "${tema}". The image must be driven by this specific topic — two different contents must look clearly DIFFERENT from one another, never a repeated template. Render the metaphor through ${treatment}.`
    : `Invent a single elegant conceptual metaphor about professional growth and clarity, rendered through ${treatment}.`;
  return [
    'Premium EDITORIAL ILLUSTRATION for the A4 vertical cover of an institutional professional-development guide by Vertho.',
    'Deep navy (#142F57) dominant palette with cyan (#34C5CC) and light cyan (#9AE2E6) accents; sophisticated, modern, cinematic lighting with soft glow.',
    conceito,
    'Composition: keep the LEFT ~45% as calm, almost-solid deep navy negative space (reserved for a title); place the illustrated scene on the RIGHT and lower-right, flowing gently toward the center.',
    'Style: refined modern editorial illustration / subtle 3D, premium and minimal, depth and atmosphere, tasteful — NOT a flat icon, NOT a busy collage.',
    'AVOID overused clichés — do NOT use a glowing winding road / path / highway leading to a horizon, and do NOT use a lone chess piece, unless absolutely essential to the topic. Prefer a fresh, specific image.',
    'STRICTLY NO text, NO letters, NO numbers, NO words, NO logo, NO people, NO faces, NO cartoon, NO clipart, NO childish elements, NO stock-photo watermark look.',
  ].filter(Boolean).join(' ');
}

/**
 * Gera o fundo de capa e retorna PNG como Buffer. Lança em erro/sem chave —
 * o caller decide o fallback.
 */
export async function generateCoverImage(tema?: string | null): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  // gpt-image-1 (quality medium) costuma levar 20-60s. Aborta limpo em 110s
  // pra dar uma mensagem de erro clara em vez de a função serverless ser morta.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 110_000);
  let res: Response;
  try {
    res = await fetch(IMAGE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        prompt: buildCoverPrompt(tema),
        size: '1024x1536', // retrato ~2:3 (próximo de A4)
        quality: 'medium',
        n: 1,
      }),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('OpenAI image: timeout (110s)');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI image ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI image: resposta sem b64_json');
  return Buffer.from(b64, 'base64');
}
