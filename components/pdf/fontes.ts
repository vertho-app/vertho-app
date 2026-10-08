import { Font } from '@react-pdf/renderer';
import { existsSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Fontes dos PDFs — brand book (out/2026): títulos em Codec Bold, textos em Roboto.
//
// ÚNICO lugar que registra fonte para os PDFs do produto. Os geradores importam
// `FONTE_TEXTO` / `FONTE_TITULO` daqui (ou `./styles`, que importa este módulo)
// em vez de escrever o nome da família: assim a fonte troca num arquivo só, e
// a queda para a Roboto, quando o Codec não está no pacote, é decidida num lugar.
// ─────────────────────────────────────────────────────────────────────────────

const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';

// ── TEXTO: Roboto (Apache 2.0), do fontsource, como a Inter era. ─────────────
// Pesos estáticos 400/500/600/700 + itálico 400. ⚠️ O subset `latin` NÃO tem
// → ← ↑ ↓ ≈ ✓ ● ■ ★ ≥ ≤ e outros: ver `tests/unit/pdf-glifos-guard.test.ts`
// (medido com fontTools em 08/10/2026; a Inter cobria ↑ ↓).
const ROBOTO = [
  { src: `${CDN}/roboto@latest/latin-400-normal.ttf`, fontWeight: 400 },
  { src: `${CDN}/roboto@latest/latin-400-italic.ttf`, fontWeight: 400, fontStyle: 'italic' },
  { src: `${CDN}/roboto@latest/latin-500-normal.ttf`, fontWeight: 500 },
  { src: `${CDN}/roboto@latest/latin-600-normal.ttf`, fontWeight: 600 },
  { src: `${CDN}/roboto@latest/latin-700-normal.ttf`, fontWeight: 700 },
] as const;

Font.register({ family: 'Roboto', fonts: ROBOTO.map(f => ({ ...f })) });
// Alias HISTÓRICO: os relatórios referenciam 'NotoSans' (hoje, mais de cem usos). O
// nome não diz mais a fonte, que é Roboto; renomear é churn sem ganho.
Font.register({ family: 'NotoSans', fonts: ROBOTO.map(f => ({ ...f })) });

// ── TÍTULO: Codec Cold Extra Bold (Zetafonts), arquivo LOCAL ───────────────────────
// O react-pdf não lê woff2, então é o OTF. Fica em `lib/pdf-fontes/` (e não em
// `public/`) para não ser baixável por URL. ⚠️ Lido por `fs`: precisa estar no
// `outputFileTracingIncludes` do next.config.mjs (Vercel) e no `additionalFiles` do
// trigger.config.ts (task de lote), senão some só no ar. ⚠️ Licença: o OTF gratuito
// NÃO cobre isto; o dono atestou ter a licença em 08/10/2026.
const CODEC_EXTRA_BOLD = join(process.cwd(), 'lib', 'pdf-fontes', 'CodecCold-ExtraBold.otf');

let codecOk = false;
try {
  codecOk = existsSync(CODEC_EXTRA_BOLD);
} catch { /* sem fs legível → cai para a Roboto, o render não quebra */ }

if (codecOk) {
  // Só existe o peso 800 (Extra Bold). Registrado sob TODOS os pesos e com `italic`: o
  // react-pdf lança "could not resolve font" se um estilo pede um peso/itálico
  // que a família não tem, e vários títulos eram 400/500/600 e itálicos em Fraunces.
  const fonts = [400, 500, 600, 700, 800].flatMap(fontWeight => [
    { src: CODEC_EXTRA_BOLD, fontWeight },
    { src: CODEC_EXTRA_BOLD, fontWeight, fontStyle: 'italic' as const },
  ]);
  Font.register({ family: 'Codec', fonts });
}

// Sem hifenização automática: a quebra por palavra inteira é a régua dos relatórios.
Font.registerHyphenationCallback((word: string) => [word]);

/** Texto e apoio. */
export const FONTE_TEXTO = 'Roboto';
/** Títulos e destaques. Codec Extra Bold; se o arquivo não estiver no pacote, Roboto (Bold pelo peso do estilo). */
export const FONTE_TITULO = codecOk ? 'Codec' : 'Roboto';
/** Para testes e diagnóstico: o título está mesmo em Codec? */
export const CODEC_DISPONIVEL = codecOk;
