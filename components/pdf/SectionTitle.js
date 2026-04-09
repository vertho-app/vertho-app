import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';

const s = StyleSheet.create({
  container: { marginBottom: 8, marginTop: 4 },
  title: {
    fontSize: fonts.heading2, fontWeight: 'bold', color: colors.navy,
    paddingBottom: 4, borderBottomWidth: 1.5, borderBottomColor: colors.coverAccent,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: fonts.heading3, fontWeight: 'bold', color: colors.navyLight,
    marginBottom: 4,
  },
  label: {
    fontSize: fonts.small, fontWeight: 'bold', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  },
});

export function SectionTitle({ children }) {
  return (
    <View style={s.container}>
      <Text style={s.title}>{children}</Text>
    </View>
  );
}

export function SubTitle({ children }) {
  return <Text style={s.subtitle}>{children}</Text>;
}

export function Label({ children }) {
  return <Text style={s.label}>{children}</Text>;
}
