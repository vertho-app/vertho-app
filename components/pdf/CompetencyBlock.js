import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';
import StatusBadge, { FlagBadge } from './StatusBadge';
import ChecklistBox from './ChecklistBox';

const s = StyleSheet.create({
  container: { marginBottom: 6 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  compName: { fontSize: fonts.heading2, fontWeight: 'bold', color: colors.navy },
  compNameFlag: { fontSize: fonts.heading2, fontWeight: 'bold', color: colors.flagRed },
  // Descritores
  descritorBox: {
    backgroundColor: colors.descritorBg, borderRadius: 4, padding: 10,
    marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colors.descritorTitle,
  },
  descritorLabel: {
    fontSize: fonts.small, fontWeight: 'bold', color: colors.descritorTitle,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  descritorItem: { fontSize: fonts.body, color: colors.textPrimary, marginLeft: 8, marginBottom: 2, lineHeight: 1.5 },
  // Two columns
  twoCol: { flexDirection: 'row', marginBottom: 8, gap: 6 },
  fezBemCol: {
    flex: 1, backgroundColor: colors.fezBemBg, padding: 10, borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: '#2E7D32',
  },
  melhorarCol: {
    flex: 1, backgroundColor: colors.melhorarBg, padding: 10, borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: '#E65100',
  },
  colLabel: {
    fontSize: fonts.small, fontWeight: 'bold', color: colors.textPrimary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  colItem: { fontSize: fonts.body, color: colors.textPrimary, marginLeft: 6, marginBottom: 2, lineHeight: 1.4 },
  // Feedback
  feedbackBox: {
    backgroundColor: colors.perfilBg, borderRadius: 4, padding: 10,
    marginBottom: 8,
  },
  feedbackText: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.6, fontStyle: 'italic' },
  // Plano 30 dias
  planoBox: {
    backgroundColor: colors.planoBg, borderRadius: 4, padding: 10,
    marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colors.navy,
  },
  planoTitle: {
    fontSize: fonts.heading3, fontWeight: 'bold', color: colors.navy, marginBottom: 6,
  },
  semanaTitle: {
    fontSize: fonts.body, fontWeight: 'bold', color: colors.navyLight,
    marginBottom: 2, marginTop: 5,
  },
  semanaAcao: { fontSize: fonts.small, color: colors.textSecondary, marginLeft: 10, marginBottom: 1, lineHeight: 1.4 },
  // Dicas
  dicasBox: { marginBottom: 8 },
  dicasTitle: {
    fontSize: fonts.heading3, fontWeight: 'bold', color: colors.teal, marginBottom: 4,
  },
  dicaItem: { fontSize: fonts.body, color: colors.textSecondary, marginLeft: 8, marginBottom: 2, lineHeight: 1.5 },
  // Estudo
  estudoTitle: {
    fontSize: fonts.heading3, fontWeight: 'bold', color: colors.navy, marginBottom: 4,
  },
  estudoItem: { fontSize: fonts.body, color: colors.linkBlue, marginLeft: 8, marginBottom: 2, lineHeight: 1.4 },
});

export default function CompetencyBlock({ comp, index, total }) {
  const nivel = comp.nivel || comp.nivel_atual || 0;
  const isFlag = comp.flag || nivel <= 1;

  return (
    <View style={s.container}>
      {/* Header: nome + badge */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={isFlag ? s.compNameFlag : s.compName}>
            {isFlag ? '[!] ' : ''}{comp.nome}
          </Text>
        </View>
        <StatusBadge nivel={nivel} />
      </View>

      {isFlag && <FlagBadge />}

      {/* Descritores em desenvolvimento */}
      {comp.descritores_desenvolvimento?.length > 0 && (
        <View style={s.descritorBox}>
          <Text style={s.descritorLabel}>Descritores em Desenvolvimento</Text>
          {comp.descritores_desenvolvimento.map((d, i) => (
            <Text key={i} style={s.descritorItem}>- {d}</Text>
          ))}
        </View>
      )}

      {/* Fez Bem / Melhorar */}
      <View style={s.twoCol}>
        <View style={s.fezBemCol}>
          <Text style={s.colLabel}>Fez Bem</Text>
          {comp.fez_bem?.length > 0
            ? comp.fez_bem.map((e, j) => <Text key={j} style={s.colItem}>+ {e}</Text>)
            : <Text style={s.colItem}>-</Text>
          }
        </View>
        <View style={s.melhorarCol}>
          <Text style={s.colLabel}>Melhorar</Text>
          {comp.melhorar?.length > 0
            ? comp.melhorar.map((e, j) => <Text key={j} style={s.colItem}>- {e}</Text>)
            : <Text style={s.colItem}>-</Text>
          }
        </View>
      </View>

      {/* Feedback interpretativo */}
      {comp.feedback && (
        <View style={s.feedbackBox}>
          <Text style={s.feedbackText}>{comp.feedback}</Text>
        </View>
      )}

      {/* Plano 30 dias */}
      {comp.plano_30_dias && (
        <View style={s.planoBox}>
          <Text style={s.planoTitle}>Plano de Desenvolvimento - 30 Dias</Text>
          {['semana_1', 'semana_2', 'semana_3', 'semana_4'].map((sem, si) => {
            const semana = comp.plano_30_dias[sem];
            if (!semana) return null;
            return (
              <View key={si}>
                <Text style={s.semanaTitle}>Semana {si + 1}: {semana.foco}</Text>
                {semana.acoes?.map((a, ai) => (
                  <Text key={ai} style={s.semanaAcao}>- {a}</Text>
                ))}
              </View>
            );
          })}
        </View>
      )}

      {/* Dicas de desenvolvimento */}
      {comp.dicas_desenvolvimento?.length > 0 && (
        <View style={s.dicasBox}>
          <Text style={s.dicasTitle}>Dicas de Desenvolvimento</Text>
          {comp.dicas_desenvolvimento.map((d, i) => (
            <Text key={i} style={s.dicaItem}>- {d}</Text>
          ))}
        </View>
      )}

      {/* Estudo recomendado */}
      {comp.estudo_recomendado?.length > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Text style={s.estudoTitle}>Estudo Recomendado</Text>
          {comp.estudo_recomendado.map((e, i) => (
            <Text key={i} style={s.estudoItem}>- {e}</Text>
          ))}
        </View>
      )}

      {/* Checklist tático */}
      {comp.checklist_tatico?.length > 0 && (
        <ChecklistBox items={comp.checklist_tatico} />
      )}
    </View>
  );
}
