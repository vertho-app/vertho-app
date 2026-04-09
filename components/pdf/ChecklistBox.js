import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';

const s = StyleSheet.create({
  container: { marginBottom: 6 },
  header: {
    backgroundColor: colors.navy, paddingVertical: 5, paddingHorizontal: 10,
    borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  headerText: {
    fontSize: fonts.small, fontWeight: 'bold', color: colors.white,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  item: {
    fontSize: fonts.body, color: colors.textPrimary, lineHeight: 1.5,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  itemAlt: {
    fontSize: fonts.body, color: colors.textPrimary, lineHeight: 1.5,
    paddingVertical: 4, paddingHorizontal: 10,
    backgroundColor: colors.checklistBg,
  },
  box: {
    fontSize: 8, color: colors.textMuted, marginRight: 4,
  },
});

export default function ChecklistBox({ items, title = 'Checklist Tatico' }) {
  if (!items?.length) return null;
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerText}>{title}</Text>
      </View>
      {items.map((item, i) => (
        <Text key={i} style={i % 2 === 0 ? s.item : s.itemAlt}>
          [ ] {item}
        </Text>
      ))}
    </View>
  );
}
