import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, nivelLabel } from './styles';

const s = StyleSheet.create({
  badge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    marginRight: 6,
  },
  text: { fontFamily: 'Inter', fontSize: fonts.badgeText },
});

export function LevelBadge({ nivel }) {
  return (
    <View style={{ ...s.badge, backgroundColor: colors.badgeLevelBg }}>
      <Text style={{ ...s.text, fontWeight: 600, color: colors.badgeLevelText }}>N{nivel}</Text>
    </View>
  );
}

export function StatusBadge({ nivel }) {
  const label = nivelLabel(nivel);
  const n = Math.round(nivel || 0);
  let bg, color;
  if (n >= 3) { bg = colors.badgeGoodBg; color = colors.badgeGoodText; }
  else if (n >= 2) { bg = colors.badgeDevBg; color = colors.badgeDevText; }
  else { bg = colors.badgePriorityBg; color = colors.badgePriorityText; }

  return (
    <View style={{ ...s.badge, backgroundColor: bg }}>
      <Text style={{ ...s.text, fontWeight: 500, color }}>{label}</Text>
    </View>
  );
}

export function PriorityBadge() {
  return (
    <View style={{ ...s.badge, backgroundColor: colors.badgePriorityBg }}>
      <Text style={{ ...s.text, fontWeight: 600, color: colors.badgePriorityText }}>{'ATEN\u00c7\u00c3O PRIORIT\u00c1RIA'}</Text>
    </View>
  );
}

// Table-specific badges (smaller)
export function TableLevelBadge({ nivel }) {
  return (
    <View style={{ backgroundColor: colors.badgeLevelBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'center' }}>
      <Text style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.badgeText, color: colors.badgeLevelText, textAlign: 'center' }}>N{nivel}</Text>
    </View>
  );
}

export function TableStatusBadge({ nivel }) {
  const label = nivelLabel(nivel);
  const n = Math.round(nivel || 0);
  let bg, color;
  if (n >= 3) { bg = colors.badgeGoodBg; color = colors.badgeGoodText; }
  else if (n >= 2) { bg = colors.badgeDevBg; color = colors.badgeDevText; }
  else { bg = colors.badgePriorityBg; color = colors.badgePriorityText; }

  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'center' }}>
      <Text style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: fonts.badgeText, color, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}
