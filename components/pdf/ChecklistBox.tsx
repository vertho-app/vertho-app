import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors } from './styles';

const s = StyleSheet.create({
  container: {
    backgroundColor: colors.navy,
    borderRadius: 3,
    padding: 10,
    marginBottom: 10,
  },
  label: {
    fontSize: 7.5, fontWeight: 700, color: colors.cyan,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  checkbox: {
    width: 9, height: 9, borderWidth: 0.7, borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 1.5, flexShrink: 0,
  },
  itemText: { fontSize: 8, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4, flex: 1 },
});

export default function ChecklistBox({ items, title }: { items?: string[]; title?: string }) {
  if (!items?.length) return null;
  return (
    <View style={s.container} wrap={false}>
      <Text style={s.label}>{title || 'Checklist Tático'}</Text>
      {items.map((item: string, i: number) => (
        <View key={i} style={s.item}>
          <View style={s.checkbox} />
          <Text style={s.itemText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}
