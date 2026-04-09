import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';
import StatusBadge, { FlagBadge } from './StatusBadge';
import ChecklistBox from './ChecklistBox';

const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 10, paddingBottom: 8,
    borderBottomWidth: 1.5, borderBottomColor: colors.coverAccent,
  },
  compName: { fontSize: 14, fontWeight: 'bold', color: colors.navy, maxWidth: '60%' },
  compNameFlag: { fontSize: 14, fontWeight: 'bold', color: colors.flagRed, maxWidth: '60%' },
  counter: { fontSize: 7, color: colors.textMuted, marginTop: 2 },
  // Seção genérica
  sectionBox: { marginBottom: 10 },
  sectionLabel: {
    fontSize: 8, fontWeight: 'bold', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  // Descritores
  descritorBox: {
    backgroundColor: colors.descritorBg, borderRadius: 4, padding: 10,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#E65100',
  },
  descritorItem: { fontSize: 9, color: colors.textPrimary, marginLeft: 6, marginBottom: 2, lineHeight: 1.5 },
  // Two columns
  twoCol: { flexDirection: 'row', marginBottom: 10 },
  fezBemCol: {
    flex: 1, backgroundColor: colors.fezBemBg, padding: 10, marginRight: 4, borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: '#2E7D32',
  },
  melhorarCol: {
    flex: 1, backgroundColor: colors.melhorarBg, padding: 10, marginLeft: 4, borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: '#E65100',
  },
  colLabel: {
    fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 5,
  },
  colItem: { fontSize: 9, color: colors.textPrimary, marginLeft: 4, marginBottom: 2.5, lineHeight: 1.45 },
  // Feedback
  feedbackBox: {
    backgroundColor: '#F0F4FA', borderRadius: 4, padding: 10,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.cyan,
  },
  feedbackText: { fontSize: 9, color: colors.textSecondary, lineHeight: 1.65, fontStyle: 'italic' },
  // Plano 30 dias
  planoBox: {
    backgroundColor: colors.planoBg, borderRadius: 4, padding: 10,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.navy,
  },
  planoTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 6 },
  semanaRow: { marginBottom: 5 },
  semanaTitle: { fontSize: 9, fontWeight: 'bold', color: colors.navyLight, marginBottom: 1 },
  semanaAcao: { fontSize: 8.5, color: colors.textSecondary, marginLeft: 10, marginBottom: 1, lineHeight: 1.4 },
  // Dicas
  dicasBox: {
    marginBottom: 10, padding: 10, backgroundColor: '#F0FAF4', borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: colors.teal,
  },
  dicaLabel: { fontSize: 8, fontWeight: 'bold', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  dicaItem: { fontSize: 8.5, color: colors.textSecondary, marginLeft: 6, marginBottom: 2, lineHeight: 1.5 },
  // Estudo
  estudoBox: {
    marginBottom: 10, padding: 10, backgroundColor: '#F5F0FF', borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: '#6B46C1',
  },
  estudoLabel: { fontSize: 8, fontWeight: 'bold', color: '#6B46C1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  estudoItem: { fontSize: 8.5, color: colors.linkBlue, marginLeft: 6, marginBottom: 2, lineHeight: 1.4 },
});

export default function CompetencyBlock({ comp, index, total }) {
  const nivel = comp.nivel || comp.nivel_atual || 0;
  const isFlag = comp.flag || nivel <= 1;

  return (
    <View>
      {/* ── Header: nome + badge (não quebrar) ── */}
      <View style={s.header} wrap={false}>
        <View>
          <Text style={isFlag ? s.compNameFlag : s.compName}>
            {comp.nome}
          </Text>
          <Text style={s.counter}>Competencia {index + 1} de {total}</Text>
        </View>
        <StatusBadge nivel={nivel} />
      </View>

      {isFlag && <FlagBadge />}

      {/* ── Descritores em desenvolvimento ── */}
      {comp.descritores_desenvolvimento?.length > 0 && (
        <View style={s.descritorBox} wrap={false}>
          <Text style={s.sectionLabel}>Descritores em Desenvolvimento</Text>
          {comp.descritores_desenvolvimento.map((d, i) => (
            <Text key={i} style={s.descritorItem}>- {d}</Text>
          ))}
        </View>
      )}

      {/* ── Fez Bem / Melhorar (não quebrar) ── */}
      <View style={s.twoCol} wrap={false}>
        <View style={s.fezBemCol}>
          <Text style={{ ...s.colLabel, color: '#2E7D32' }}>Fez Bem</Text>
          {comp.fez_bem?.length > 0
            ? comp.fez_bem.map((e, j) => <Text key={j} style={s.colItem}>+ {e}</Text>)
            : <Text style={s.colItem}>-</Text>
          }
        </View>
        <View style={s.melhorarCol}>
          <Text style={{ ...s.colLabel, color: '#E65100' }}>Melhorar</Text>
          {comp.melhorar?.length > 0
            ? comp.melhorar.map((e, j) => <Text key={j} style={s.colItem}>- {e}</Text>)
            : <Text style={s.colItem}>-</Text>
          }
        </View>
      </View>

      {/* ── Feedback interpretativo ── */}
      {comp.feedback && (
        <View style={s.feedbackBox} wrap={false}>
          <Text style={s.sectionLabel}>Analise</Text>
          <Text style={s.feedbackText}>{comp.feedback}</Text>
        </View>
      )}

      {/* ── Plano 30 dias ── */}
      {comp.plano_30_dias && (
        <View style={s.planoBox}>
          <Text style={s.planoTitle}>Plano de Desenvolvimento — 30 Dias</Text>
          {['semana_1', 'semana_2', 'semana_3', 'semana_4'].map((sem, si) => {
            const semana = comp.plano_30_dias[sem];
            if (!semana) return null;
            return (
              <View key={si} style={s.semanaRow}>
                <Text style={s.semanaTitle}>Semana {si + 1}: {semana.foco}</Text>
                {semana.acoes?.map((a, ai) => (
                  <Text key={ai} style={s.semanaAcao}>- {a}</Text>
                ))}
              </View>
            );
          })}
        </View>
      )}

      {/* ── Dicas de desenvolvimento ── */}
      {comp.dicas_desenvolvimento?.length > 0 && (
        <View style={s.dicasBox} wrap={false}>
          <Text style={s.dicaLabel}>Dicas de Desenvolvimento</Text>
          {comp.dicas_desenvolvimento.map((d, i) => (
            <Text key={i} style={s.dicaItem}>- {d}</Text>
          ))}
        </View>
      )}

      {/* ── Estudo recomendado ── */}
      {comp.estudo_recomendado?.length > 0 && (
        <View style={s.estudoBox} wrap={false}>
          <Text style={s.estudoLabel}>Estudo Recomendado</Text>
          {comp.estudo_recomendado.map((e, i) => (
            <Text key={i} style={s.estudoItem}>- {e}</Text>
          ))}
        </View>
      )}

      {/* ── Checklist tático ── */}
      {comp.checklist_tatico?.length > 0 && (
        <ChecklistBox items={comp.checklist_tatico} />
      )}
    </View>
  );
}
