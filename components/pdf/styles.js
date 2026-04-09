import { StyleSheet } from '@react-pdf/renderer';

// Paleta Vertho (fiel ao GAS)
export const colors = {
  navy: '#0F2B54',
  cyan: '#00B4D8',
  teal: '#0D9488',
  white: '#FFFFFF',
  // Fundos de seção
  perfilBg: '#EEF3FB',
  fezBemBg: '#D9EAD3',
  melhorarBg: '#FCE5CD',
  descritorBg: '#FFF3E0',
  planoBg: '#E8F0FE',
  checklistBg: '#F7FBFF',
  // Texto
  flagRed: '#CC0000',
  descritorTitle: '#BF360C',
  linkBlue: '#1155CC',
  textGray: '#666666',
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
  borderLight: '#CCCCCC',
};

export const fonts = {
  heading1: 18,
  heading2: 14,
  heading3: 12,
  body: 10,
  small: 9,
  caption: 7,
};

export const tableStyles = StyleSheet.create({
  table: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.navy,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 2,
  },
  headerCell: {
    color: colors.white,
    fontSize: fonts.small,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.gray200,
  },
  rowAlt: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.gray200,
    backgroundColor: colors.checklistBg,
  },
  cell: {
    fontSize: fonts.body,
    color: colors.gray700,
  },
  cellBold: {
    fontSize: fonts.body,
    color: colors.navy,
    fontWeight: 'bold',
  },
});

export const pageStyles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: colors.white,
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    position: 'absolute',
    top: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: fonts.heading2,
    color: colors.navy,
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  headerDate: {
    fontSize: fonts.small,
    color: colors.gray500,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: colors.gray300,
    paddingTop: 6,
  },
  footerText: {
    fontSize: fonts.caption,
    color: colors.gray400,
  },
  content: {
    flex: 1,
  },
});

// Helpers
export function estrelas(nivel) {
  const n = Math.min(4, Math.max(0, Math.round(nivel || 0)));
  return '★'.repeat(n) + '☆'.repeat(4 - n);
}

export function nivelColor(nivel) {
  if (nivel >= 4) return '#065F46';
  if (nivel >= 3) return '#155E75';
  if (nivel >= 2) return '#92400E';
  return '#991B1B';
}

export function nivelBgColor(nivel) {
  if (nivel >= 4) return '#D1FAE5';
  if (nivel >= 3) return '#CFFAFE';
  if (nivel >= 2) return '#FEF3C7';
  return '#FEE2E2';
}
