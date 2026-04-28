import { StyleSheet, Font } from '@react-pdf/renderer';

// ── Registrar Noto Sans (suporte completo a português) ──────────────────────
Font.register({
  family: 'NotoSans',
  fonts: [
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-400-normal.ttf', fontWeight: 400 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-400-italic.ttf', fontWeight: 400, fontStyle: 'italic' },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-500-normal.ttf', fontWeight: 500 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-600-normal.ttf', fontWeight: 600 },
    { src: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-700-normal.ttf', fontWeight: 700 },
  ],
});

// ── Desativar hifenização automática ────────────────────────────────────────
// Por padrão o @react-pdf/renderer quebra palavras com hífen ao final de linha.
// Retornar a palavra como array de 1 item força a quebra por palavra inteira.
Font.registerHyphenationCallback((word: string) => [word]);

// ── Paleta Vertho Premium ───────────────────────────────────────────────────
// Alinhada ao mockup PDI Rodrigo (v2) — usa o cyan oficial da marca
// (#34C5CC) em vez do neon. Navy profundo + cyan vibrante,
// blocos coloridos com BG suave + borda fina (estilo print premium).
export const colors = {
  // Primárias
  navy: '#0F2B54',
  navy2: '#1A3A6E',
  navyLight: '#1A3A6B',
  cyan: '#34C5CC',
  cyanLight: '#9AE2E6',
  cyan2: '#34C5CC',          // alias mantido p/ compat
  teal: '#0D9488',
  white: '#FFFFFF',
  // Fundos de seção (BG suave + borda)
  perfilBg: '#F0F9FF',       // azul muito claro (análise / perfil)
  perfilBorder: '#BAE6FD',
  fezBemBg: '#F0FDF4',
  fezBemBorder: '#BBF7D0',
  melhorarBg: '#FFF7ED',
  melhorarBorder: '#FED7AA',
  descritorBg: '#FFFBEB',    // amber/yellow
  descritorBorder: '#FDE68A',
  planoBg: '#F8FAFC',
  estudoBg: '#F5F0FF',       // purple
  estudoBorder: '#DDD6FE',
  purpleDark: '#3B0A6D',
  dicasBg: '#F0FDF4',
  dicasBorder: '#BBF7D0',
  summaryBg: '#F8FAFC',
  coverAccent: '#3EF0E2',
  // Texto
  textPrimary: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#64748B',
  flagRed: '#B91C1C',
  descritorTitle: '#D97706',
  yellowText: '#78350F',
  greenText: '#14532D',
  orangeText: '#7C2D12',
  blueText: '#0C4A6E',
  purpleText: '#4C1D95',
  linkBlue: '#1565C0',
  // Status escolhidos pra texto colorido nos labels
  green: '#16A34A',
  orange: '#EA580C',
  yellow: '#D97706',
  purple: '#9E4EDD',
  // Grays
  gray100: '#F8FAFC',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  // Borders
  borderLight: '#E2E8F0',
  borderMedium: '#CBD5E1',
  // Nível
  nivelGreen: '#065F46',
  nivelCyan: '#155E75',
  nivelAmber: '#92400E',
  nivelRed: '#991B1B',
};

export const fonts = {
  coverTitle: 28,
  heading1: 16,
  heading2: 13,
  heading3: 11,
  body: 9.5,
  small: 8.5,
  caption: 7,
  tiny: 6.5,
};

// ── Nível helpers ───────────────────────────────────────────────────────────
export function nivelColor(nivel: number) {
  if (nivel >= 4) return colors.nivelGreen;
  if (nivel >= 3) return colors.nivelCyan;
  if (nivel >= 2) return colors.nivelAmber;
  return colors.nivelRed;
}

export function nivelBgColor(nivel: number) {
  if (nivel >= 4) return '#D1FAE5';
  if (nivel >= 3) return '#CFFAFE';
  if (nivel >= 2) return '#FEF3C7';
  return '#FEE2E2';
}

export function nivelLabel(nivel: number) {
  if (nivel >= 4) return 'Excelente';
  if (nivel >= 3) return 'Bom';
  if (nivel >= 2) return 'Em desenvolvimento';
  return 'Atenção';
}

export function starsText(nivel: number) {
  const n = Math.min(4, Math.max(0, Math.round(nivel || 0)));
  return '*'.repeat(n) + '-'.repeat(4 - n);
}

// ── Table Styles ────────────────────────────────────────────────────────────
export const tableStyles = StyleSheet.create({
  table: { display: 'flex', flexDirection: 'column', width: '100%', marginVertical: 6 },
  headerRow: {
    flexDirection: 'row', backgroundColor: colors.navy,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 2,
  },
  headerCell: {
    color: colors.white, fontSize: fonts.small, fontWeight: 'bold',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.gray200,
  },
  rowAlt: {
    flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.gray200,
    backgroundColor: colors.gray100,
  },
  cell: { fontSize: fonts.body, color: colors.textSecondary },
  cellBold: { fontSize: fonts.body, color: colors.navy, fontWeight: 'bold' },
});

// ── Page Styles ─────────────────────────────────────────────────────────────
// Layout: navy header full-width no topo + body em padding + footer fino.
// Mockup PDI Rodrigo (210mm × 297mm): header 18mm, body 10mm padding.
export const pageStyles = StyleSheet.create({
  page: {
    flexDirection: 'column', backgroundColor: colors.white,
    paddingTop: 70, paddingBottom: 40, paddingHorizontal: 40,
    fontFamily: 'NotoSans',
  },
  // Header navy fixo no topo (full bleed)
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: colors.navy,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 40, paddingVertical: 14,
  },
  headerLogo: { height: 18 },
  headerLabel: {
    fontSize: 8, color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500,
  },
  // Footer fino na base
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 40, paddingVertical: 10,
    borderTopWidth: 0.5, borderTopColor: colors.borderLight,
  },
  footerText: { fontSize: 7, color: colors.gray500, letterSpacing: 0.4 },
});
