import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';

const s = StyleSheet.create({
  container: { marginBottom: 8 },
  header: {
    backgroundColor: colors.navy, paddingVertical: 4, paddingHorizontal: 10,
    borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  headerText: {
    fontSize: 7.5, fontWeight: 'bold', color: colors.white,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  item: {
    fontSize: 8.5, color: colors.textPrimary, lineHeight: 1.5,
    paddingVertical: 3.5, paddingHorizontal: 10,
  },
  itemAlt: {
    fontSize: 8.5, color: colors.textPrimary, lineHeight: 1.5,
    paddingVertical: 3.5, paddingHorizontal: 10,
    backgroundColor: colors.gray100,
  },
  checkbox: { color: colors.textMuted },
});

export default function ChecklistBox({ items, title = 'Checklist Tatico' }) {
  if (!items?.length) return null;
  return (
    <View style={s.container} wrap={false}>
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
