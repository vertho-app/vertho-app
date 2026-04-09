import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { nivelColor, nivelBgColor, nivelLabel, fonts } from './styles';

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 3, alignSelf: 'flex-start',
  },
  level: { fontSize: 10, fontWeight: 'bold', marginRight: 4 },
  label: { fontSize: fonts.small },
  stars: { fontSize: 10, letterSpacing: 2, marginLeft: 6 },
});

export default function StatusBadge({ nivel }) {
  const n = Math.round(nivel || 0);
  const stars = '*'.repeat(Math.min(4, Math.max(0, n))) + '-'.repeat(4 - Math.min(4, Math.max(0, n)));

  return (
    <View style={{ ...s.badge, backgroundColor: nivelBgColor(n) }}>
      <Text style={{ ...s.level, color: nivelColor(n) }}>N{n}</Text>
      <Text style={{ ...s.label, color: nivelColor(n) }}>{nivelLabel(n)}</Text>
      <Text style={{ ...s.stars, color: nivelColor(n) }}>{stars}</Text>
    </View>
  );
}

export function FlagBadge() {
  return (
    <View style={{ ...s.badge, backgroundColor: '#FEE2E2' }}>
      <Text style={{ fontSize: fonts.small, fontWeight: 'bold', color: '#991B1B' }}>ATENCAO PRIORITARIA</Text>
    </View>
  );
}
