import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { nivelColor, nivelBgColor, nivelLabel, fonts, colors } from './styles';

const s = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 3,
  },
  level: { fontSize: 10, fontWeight: 'bold' },
  label: { fontSize: 8, marginLeft: 5 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  dotFilled: {
    width: 7, height: 7, borderRadius: 4, marginRight: 3,
  },
  dotEmpty: {
    width: 7, height: 7, borderRadius: 4, marginRight: 3,
    borderWidth: 1.5,
  },
});

function LevelDots({ nivel, color }: { nivel: number; color: string }) {
  const n = Math.min(4, Math.max(0, Math.round(nivel || 0)));
  const dots: React.ReactNode[] = [];
  for (let i = 1; i <= 4; i++) {
    if (i <= n) {
      dots.push(<View key={i} style={{ ...s.dotFilled, backgroundColor: color }} />);
    } else {
      dots.push(<View key={i} style={{ ...s.dotEmpty, borderColor: color, opacity: 0.35 }} />);
    }
  }
  return <View style={s.dotsRow}>{dots}</View>;
}

export default function StatusBadge({ nivel }: { nivel: number }) {
  const n = Math.round(nivel || 0);
  const color = nivelColor(n);
  const bg = nivelBgColor(n);

  return (
    <View style={s.container}>
      <View style={{ ...s.badge, backgroundColor: bg }}>
        <Text style={{ ...s.level, color }}>N{n}</Text>
        <Text style={{ ...s.label, color }}>{nivelLabel(n)}</Text>
      </View>
      <LevelDots nivel={n} color={color} />
    </View>
  );
}

export function FlagBadge() {
  return (
    <View style={{ ...s.badge, backgroundColor: '#FEE2E2', marginBottom: 6 }}>
      <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: '#991B1B', letterSpacing: 0.5, textTransform: 'uppercase' }}>
        Atencao Prioritaria
      </Text>
    </View>
  );
}

export { LevelDots };
