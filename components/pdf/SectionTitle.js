import React from 'react';
import { Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, lh } from './styles';

const s = StyleSheet.create({
  title: {
    fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.sectionTitle,
    color: colors.titleStrong, lineHeight: lh.sectionTitle, marginBottom: 6,
  },
  blockTitle: {
    fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.blockTitle,
    color: colors.titleStrong, marginBottom: 4,
  },
});

export function SectionTitle({ children }) {
  return <Text style={s.title}>{children}</Text>;
}

export function BlockTitle({ children, color }) {
  return <Text style={{ ...s.blockTitle, ...(color ? { color } : {}) }}>{children}</Text>;
}
