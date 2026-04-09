import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, lh } from './styles';
import { BlockTitle } from './SectionTitle';

const s = StyleSheet.create({
  container: {
    backgroundColor: colors.checklistBg, borderWidth: 1, borderColor: colors.checklistBorder,
    borderRadius: 8, padding: 12, marginBottom: 14,
  },
  item: {
    fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary,
    lineHeight: lh.small, marginBottom: 5,
  },
});

export default function ChecklistBox({ items }) {
  if (!items?.length) return null;
  return (
    <View style={s.container} wrap={false}>
      <BlockTitle>{'CHECKLIST T\u00c1TICO'}</BlockTitle>
      {items.map((item, i) => (
        <Text key={i} style={s.item}>[ ] {item}</Text>
      ))}
    </View>
  );
}
