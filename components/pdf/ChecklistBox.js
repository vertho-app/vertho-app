import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';

const s = StyleSheet.create({
  container: { marginBottom: 10 },
  header: {
    backgroundColor: colors.navy, paddingVertical: 5, paddingHorizontal: 10,
    borderTopLeftRadius: 4, borderTopRightRadius: 4,
  },
  headerText: {
    fontSize: 7.5, fontWeight: 'bold', color: colors.white,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  body: {
    borderWidth: 0.5, borderColor: colors.gray200, borderTopWidth: 0,
    borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
  },
  item: {
    fontSize: 8.5, color: colors.textPrimary, lineHeight: 1.5,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  itemAlt: {
    fontSize: 8.5, color: colors.textPrimary, lineHeight: 1.5,
    paddingVertical: 4, paddingHorizontal: 10,
    backgroundColor: colors.gray100,
  },
});

export default function ChecklistBox({ items, title }) {
  if (!items?.length) return null;
  return (
    <View style={s.container} wrap={false}>
      <View style={s.header}>
        <Text style={s.headerText}>{title || 'Checklist T\u00e1tico'}</Text>
      </View>
      <View style={s.body}>
        {items.map((item, i) => (
          <Text key={i} style={i % 2 === 0 ? s.item : s.itemAlt}>
            [ ] {item}
          </Text>
        ))}
      </View>
    </View>
  );
}
