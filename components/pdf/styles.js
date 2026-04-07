// components/pdf/styles.js — PDF design system for @react-pdf/renderer

import { StyleSheet } from '@react-pdf/renderer';

export const colors = {
  navy: '#0F2A4A',
  cyan: '#00B4D8',
  teal: '#0D9488',
  white: '#FFFFFF',
  gray100: '#F8FAFC',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
};

export const fonts = {
  heading1: 22,
  heading2: 16,
  heading3: 13,
  body: 10,
  small: 8,
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
    paddingHorizontal: 8,
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
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.gray200,
  },
  rowAlt: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.gray200,
    backgroundColor: colors.gray100,
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
