// ─────────────────────────────────────────────────────────────────────────────
// Vertho — Design Tokens dos PDFs (fonte única)
//
// Derivado do "Vertho Design System" (bundle de handoff). É a fonte da verdade
// de COR e TIPO para os PDFs. O `styles.ts` consome estes tokens.
//
// A marca (navy / cyan / purple) já era idêntica ao que os PDFs usavam — aqui só
// formalizamos. As duas DECISÕES abertas do diff DS×PDF ficam atrás de flags no
// fim do arquivo (NEUTRAL_RAMP e STATUS_PALETTE): por padrão reproduzem o look
// ATUAL (slate + status vivo), então trocar a flag é opt-in e verificável
// re-renderizando com scripts/_pdf-samples*.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Primitivas de marca — batem 1:1 com o DS e com o que os PDFs já usam. */
export const brand = {
  navy: { 900: '#06152B', 700: '#0A1F3F', 500: '#0F2B54', 300: '#2F568C' },
  /** Tinta do logo/wordmark — NÃO é cor de texto de UI (decisão do DS vds3). */
  indigoLogo: '#3C385F',
  cyan: { 100: '#DBF6F7', 300: '#9AE2E6', 500: '#34C5CC', 700: '#1C8A90' },
  purple: { 100: '#F3E3FF', 300: '#E1AAFF', 500: '#9E4EDD', 700: '#3B0A6D' },
  white: '#FFFFFF',
} as const;

/** Gradiente assinatura cyan→purple (o DS usa em destaques; PDFs ainda não). */
export const gradient = { from: brand.cyan[500], to: brand.purple[500], angle: 120 } as const;

/**
 * As duas famílias neutras do diff:
 *  - `slate`  = o que os PDFs usam hoje (Tailwind Slate, cinza azulado).
 *  - `indigo` = a rampa indigo-tinted do DS (levemente roxa, marca mais coesa).
 * Papéis nomeados por lightness para trocar de família sem quebrar mapeamento.
 */
export const neutralRamps = {
  slate: {
    bgLight: '#F8FAFC', border: '#E2E8F0', borderStrong: '#CBD5E1',
    g400: '#94A3B8', g500: '#64748B', g600: '#475569', g700: '#334155', g800: '#1E293B',
    textStrong: '#1E293B', textBody: '#475569', textMuted: '#64748B',
  },
  indigo: {
    bgLight: '#F7F7FB', border: '#E0DEE9', borderStrong: '#C9C6D6',
    g400: '#A4A0B8', g500: '#7D7994', g600: '#5A566F', g700: '#403C56', g800: '#2A2740',
    // DS: text forte = navy (não o cinza mais escuro).
    textStrong: brand.navy[500], textBody: '#403C56', textMuted: '#7D7994',
  },
} as const;

/**
 * Status. `vivid` = Tailwind saturado (atual dos PDFs); `ds` = paleta sóbria do
 * DS (arquétipo Sábio). Só afeta os 3 canônicos success/warning/danger.
 */
export const statusPalettes = {
  vivid: { success: '#16A34A', warning: '#EA580C', danger: '#B91C1C', info: '#1565C0' },
  ds: { success: '#1F9D6B', warning: '#D9932B', danger: '#D6455C', info: '#1C8A90' },
} as const;

/** Famílias tipográficas do DS (produto). Corpo já é Inter nos PDFs. */
export const fontFamilies = {
  body: 'Inter', // corpo/UI — DS + PDF default (registrado como 'NotoSans' no styles.ts)
  display: 'Fraunces', // títulos (serif editorial) — só o ranking-pdf usa hoje
} as const;

// ─── FLAGS DE MIGRAÇÃO ───────────────────────────────────────────────────────
// Padrão = look ATUAL (nenhuma mudança visual). Troque, salve e re-renderize
// (scripts/_pdf-samples*.ts) para comparar antes de commitar.
export const NEUTRAL_RAMP: 'slate' | 'indigo' = 'slate';
export const STATUS_PALETTE: 'vivid' | 'ds' = 'vivid';
