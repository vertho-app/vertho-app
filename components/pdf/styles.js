import { StyleSheet, Font } from '@react-pdf/renderer';

// ── Registrar Inter via Google Fonts CDN ────────────────────────────────────
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hjQ.ttf', fontWeight: 500 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hjQ.ttf', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hjQ.ttf', fontWeight: 700 },
  ],
});

// ── Paleta (spec exata) ─────────────────────────────────────────────────────
export const colors = {
  textPrimary: '#1F2937',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  titleStrong: '#0F172A',
  borderLight: '#E5E7EB',
  bgNeutral: '#F8FAFC',
  bgPositive: '#F0FDF4',
  bgAttention: '#FFFBEB',
  bgAnalysis: '#F5F7FA',
  borderPositive: '#D1FAE5',
  borderAttention: '#FDE68A',
  // Badges
  badgeLevelBg: '#E0F2FE',
  badgeLevelText: '#075985',
  badgeGoodBg: '#ECFDF3',
  badgeGoodText: '#166534',
  badgeDevBg: '#FEF3C7',
  badgeDevText: '#92400E',
  badgePriorityBg: '#FEE2E2',
  badgePriorityText: '#991B1B',
  // Extras
  white: '#FFFFFF',
  navy: '#0F172A',
  flagRed: '#B91C1C',
  fezBemTitle: '#166534',
  melhorarTitle: '#92400E',
  zebraOdd: '#FAFAFA',
  headerRowBg: '#F8FAFC',
  checklistBg: '#F9FAFB',
  checklistBorder: '#D1D5DB',
  // Legacy compat
  cyan: '#00B4D8',
  teal: '#0D9488',
  linkBlue: '#1565C0',
  coverAccent: '#00B4D8',
  perfilBg: '#F8FAFC',
  fezBemBg: '#F0FDF4',
  melhorarBg: '#FFFBEB',
  planoBg: '#FFFFFF',
  gray100: '#F8FAFC',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  navyLight: '#1E293B',
  summaryBg: '#F8FAFC',
  descritorBg: '#FFFBEB',
  descritorTitle: '#92400E',
};

// ── Tokens de tamanho (spec exata) ──────────────────────────────────────────
export const fonts = {
  coverTitle: 18,
  coverName: 22,
  coverCargo: 12,
  coverEmpresa: 11,
  coverDate: 10,
  coverSeal: 8,
  sectionTitle: 14,
  compName: 16,
  blockTitle: 11,
  body: 10,
  small: 8,
  caption: 8,
  tableHeader: 9,
  tableBody: 9,
  badgeText: 8,
  headerPage: 9,
  footerPage: 8,
};

// ── Line heights ────────────────────────────────────────────────────────────
export const lh = {
  body: 1.45,
  small: 1.35,
  sectionTitle: 1.2,
  compName: 1.15,
  coverName: 1.1,
};

// ── Nível helpers ───────────────────────────────────────────────────────────
export function nivelColor(nivel) {
  if (nivel >= 3) return colors.badgeGoodText;
  if (nivel >= 2) return colors.badgeDevText;
  return colors.badgePriorityText;
}

export function nivelBgColor(nivel) {
  if (nivel >= 3) return colors.badgeGoodBg;
  if (nivel >= 2) return colors.badgeDevBg;
  return colors.badgePriorityBg;
}

export function nivelLabel(nivel) {
  if (nivel >= 4) return 'Excelente';
  if (nivel >= 3) return 'Bom';
  if (nivel >= 2) return 'Em desenvolvimento';
  return 'Prioritária';
}

export function starsText(nivel) {
  const n = Math.min(4, Math.max(0, Math.round(nivel || 0)));
  return '*'.repeat(n) + '-'.repeat(4 - n);
}

// ── Table Styles ────────────────────────────────────────────────────────────
export const tableStyles = StyleSheet.create({
  table: { display: 'flex', flexDirection: 'column', width: '100%', marginVertical: 4 },
  headerRow: {
    flexDirection: 'row', backgroundColor: colors.headerRowBg,
    paddingVertical: 8, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  headerCell: {
    fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.tableHeader, color: '#374151',
  },
  row: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6', alignItems: 'center',
  },
  rowAlt: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6', alignItems: 'center',
    backgroundColor: colors.zebraOdd,
  },
  cell: { fontFamily: 'Inter', fontSize: fonts.tableBody, color: colors.textPrimary },
  cellBold: { fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.tableBody, color: colors.textPrimary },
});

// ── Page Styles ─────────────────────────────────────────────────────────────
export const pageStyles = StyleSheet.create({
  page: {
    flexDirection: 'column', backgroundColor: colors.white,
    paddingTop: 34, paddingBottom: 30, paddingHorizontal: 34,
    fontFamily: 'Inter',
  },
  header: {
    position: 'absolute', top: 12, left: 34, right: 34,
    paddingBottom: 6, marginBottom: 8,
  },
  headerTitle: {
    fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.headerPage,
    color: colors.textMuted,
  },
  headerSub: {
    fontFamily: 'Inter', fontSize: fonts.small, color: colors.textMuted,
  },
  footer: {
    position: 'absolute', bottom: 10, left: 34, right: 34,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 6,
  },
  footerText: {
    fontFamily: 'Inter', fontSize: fonts.footerPage, color: colors.textMuted,
  },
});
