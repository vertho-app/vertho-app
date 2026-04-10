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
Font.registerHyphenationCallback(word => [word]);

// ── Paleta Vertho Premium ───────────────────────────────────────────────────
export const colors = {
  // Primárias
  navy: '#0F2B54',
  navyLight: '#1A3A6B',
  cyan: '#00B4D8',
  teal: '#0D9488',
  white: '#FFFFFF',
  // Fundos de seção
  perfilBg: '#EEF3FB',
  fezBemBg: '#E8F5E9',
  melhorarBg: '#FFF3E0',
  descritorBg: '#FFF8E1',
  planoBg: '#E8EDF5',
  checklistBg: '#F5F7FA',
  coverAccent: '#00B4D8',
  summaryBg: '#F8FAFC',
  // Texto
  textPrimary: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#64748B',
  flagRed: '#B91C1C',
  descritorTitle: '#E65100',
  linkBlue: '#1565C0',
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
export function nivelColor(nivel) {
  if (nivel >= 4) return colors.nivelGreen;
  if (nivel >= 3) return colors.nivelCyan;
  if (nivel >= 2) return colors.nivelAmber;
  return colors.nivelRed;
}

export function nivelBgColor(nivel) {
  if (nivel >= 4) return '#D1FAE5';
  if (nivel >= 3) return '#CFFAFE';
  if (nivel >= 2) return '#FEF3C7';
  return '#FEE2E2';
}

export function nivelLabel(nivel) {
  if (nivel >= 4) return 'Excelente';
  if (nivel >= 3) return 'Bom';
  if (nivel >= 2) return 'Em desenvolvimento';
  return 'Atenção';
}

export function starsText(nivel) {
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
export const pageStyles = StyleSheet.create({
  page: {
    flexDirection: 'column', backgroundColor: colors.white,
    paddingTop: 120, paddingBottom: 52, paddingHorizontal: 40,
    fontFamily: 'NotoSans',
  },
  header: {
    position: 'absolute', top: 18, left: 40, right: 40,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 0.5, borderBottomColor: colors.gray300, paddingBottom: 6,
  },
  headerTitle: { fontSize: 11, color: colors.navy, fontWeight: 'bold', letterSpacing: 3 },
  headerSub: { fontSize: fonts.small, color: colors.textMuted },
  footer: {
    position: 'absolute', bottom: 20, left: 40, right: 40,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 0.5, borderTopColor: colors.gray300, paddingTop: 5,
  },
  footerText: { fontSize: fonts.tiny, color: colors.navy, fontWeight: 'bold' },
});
