// CONARH 52 — tema da rota. Sóbrio, escuro, premium; acento da marca #34C5CC.
// Fontes vêm do layout raiz (app/layout.tsx): --font-fraunces (display),
// --font-manrope / --font-inter (texto). Mesma linguagem de app/imprensa.

export const COR = {
  acento: '#34C5CC',
  acentoEscuro: '#2AA8AE',
  fundo0: '#06172C',
  fundo1: '#0A1F3A',
  card: 'rgba(255,255,255,0.04)',
  cardForte: 'rgba(255,255,255,0.07)',
  borda: 'rgba(255,255,255,0.10)',
  bordaAcento: 'rgba(52,197,204,0.35)',
  texto: '#FFFFFF',
  texto2: 'rgba(255,255,255,0.74)',
  texto3: 'rgba(255,255,255,0.48)',
  verde: '#34D399',
  ambar: '#FBBF24',
  vermelho: '#F87171',
} as const;

export const FUNDO =
  'radial-gradient(1100px 620px at 85% -5%, rgba(52,197,204,.10), transparent 55%),' +
  'radial-gradient(800px 500px at -5% 40%, rgba(52,197,204,.05), transparent 60%),' +
  'linear-gradient(180deg,#06172C 0%,#0A1F3A 100%)';

export const SERIF = "var(--font-fraunces), Georgia, serif";
export const SANS = "var(--font-manrope), var(--font-inter), system-ui, sans-serif";

// Leitura a 60 cm, equipe em pé, tablet 11–13": nada abaixo disto no corpo.
export const TX = {
  micro: 13, // só para chips/eyebrows em caixa alta
  corpo: 20,
  corpoMenor: 17,
  subtitulo: 26,
  titulo: 40,
} as const;

// Alvo de toque mínimo confortável para uso em pé.
export const TOQUE = 68;
