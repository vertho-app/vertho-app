import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';

const s = StyleSheet.create({
  container: { marginBottom: 6, marginTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  accent: { width: 3, height: 14, backgroundColor: colors.coverAccent, marginRight: 8, borderRadius: 1 },
  title: { fontSize: 12, fontWeight: 'bold', color: colors.navy },
  subtitle: { fontSize: 10, fontWeight: 'bold', color: colors.navyLight, marginBottom: 4 },
  label: {
    fontSize: 7.5, fontWeight: 'bold', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
});

export function SectionTitle({ children }: { children?: React.ReactNode }) {
  return (
    <View style={s.container}>
      <View style={s.titleRow}>
        <View style={s.accent} />
        <Text style={s.title}>{children}</Text>
      </View>
    </View>
  );
}

export function SubTitle({ children }: { children?: React.ReactNode }) {
  return <Text style={s.subtitle}>{children}</Text>;
}

export function Label({ children }: { children?: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}
