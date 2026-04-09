import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, nivelColor, nivelBgColor, nivelLabel } from './styles';
import { LevelDots } from './StatusBadge';
import ChecklistBox from './ChecklistBox';

const s = StyleSheet.create({
  // ── Header ──
  headerBox: {
    backgroundColor: colors.navy, borderRadius: 4, padding: 12,
    marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLeft: { flex: 1 },
  compName: { fontSize: 13, fontWeight: 'bold', color: colors.white, marginBottom: 2 },
  counter: { fontSize: 7, color: '#94A3B8' },
  headerRight: { alignItems: 'flex-end' },
  levelBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, marginBottom: 4,
  },
  levelText: { fontSize: 11, fontWeight: 'bold', marginRight: 4 },
  statusText: { fontSize: 7.5, fontWeight: 'bold', letterSpacing: 0.3 },
  flagBadge: {
    backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 2, marginBottom: 8, alignSelf: 'flex-start',
  },
  flagText: { fontSize: 7, fontWeight: 'bold', color: '#991B1B', textTransform: 'uppercase', letterSpacing: 0.5 },
  // ── Sections ──
  sectionLabel: {
    fontSize: 7.5, fontWeight: 'bold', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  // Descritores
  descritorBox: {
    backgroundColor: colors.descritorBg, borderRadius: 4, padding: 10,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#E65100',
  },
  descritorItem: { fontSize: 9, color: colors.textPrimary, marginLeft: 6, marginBottom: 2.5, lineHeight: 1.5 },
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
  feedbackLabel: { fontSize: 7.5, fontWeight: 'bold', color: colors.cyan, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  feedbackText: { fontSize: 9, color: colors.textSecondary, lineHeight: 1.65, fontStyle: 'italic' },
  // Plano 30 dias
  planoContainer: { marginBottom: 10 },
  planoTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 8 },
  weekCard: {
    backgroundColor: colors.planoBg, borderRadius: 4, padding: 10, marginBottom: 5,
    flexDirection: 'row',
  },
  weekNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  weekNumText: { fontSize: 10, fontWeight: 'bold', color: colors.white },
  weekContent: { flex: 1 },
  weekFoco: { fontSize: 9, fontWeight: 'bold', color: colors.navyLight, marginBottom: 2 },
  weekAcao: { fontSize: 8.5, color: colors.textSecondary, marginLeft: 4, marginBottom: 1, lineHeight: 1.4 },
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
  const nColor = nivelColor(nivel);
  const nBg = nivelBgColor(nivel);
  const nLabel = nivelLabel(nivel);

  return (
    <View>
      {/* ── Header navy com badge ── */}
      <View style={s.headerBox} wrap={false}>
        <View style={s.headerLeft}>
          <Text style={s.compName}>{comp.nome}</Text>
          <Text style={s.counter}>Competencia {index + 1} de {total}</Text>
        </View>
        <View style={s.headerRight}>
          <View style={{ ...s.levelBadge, backgroundColor: nBg }}>
            <Text style={{ ...s.levelText, color: nColor }}>N{nivel}</Text>
            <LevelDots nivel={nivel} color={nColor} />
          </View>
          <Text style={{ ...s.statusText, color: '#CBD5E1' }}>{nLabel}</Text>
        </View>
      </View>

      {isFlag && (
        <View style={s.flagBadge}>
          <Text style={s.flagText}>Atencao Prioritaria</Text>
        </View>
      )}

      {/* ── Descritores em desenvolvimento ── */}
      {comp.descritores_desenvolvimento?.length > 0 && (
        <View style={s.descritorBox} wrap={false}>
          <Text style={s.sectionLabel}>Descritores em Desenvolvimento</Text>
          {comp.descritores_desenvolvimento.map((d, i) => (
            <Text key={i} style={s.descritorItem}>- {d}</Text>
          ))}
        </View>
      )}

      {/* ── Fez Bem / Melhorar ── */}
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

      {/* ── Feedback ── */}
      {comp.feedback && (
        <View style={s.feedbackBox} wrap={false}>
          <Text style={s.feedbackLabel}>Analise</Text>
          <Text style={s.feedbackText}>{comp.feedback}</Text>
        </View>
      )}

      {/* ── Plano 30 dias (mini-cards por semana) ── */}
      {comp.plano_30_dias && (
        <View style={s.planoContainer}>
          <Text style={s.planoTitle}>Plano de Desenvolvimento — 30 Dias</Text>
          {['semana_1', 'semana_2', 'semana_3', 'semana_4'].map((sem, si) => {
            const semana = comp.plano_30_dias[sem];
            if (!semana) return null;
            return (
              <View key={si} style={s.weekCard} wrap={false}>
                <View style={s.weekNum}>
                  <Text style={s.weekNumText}>{si + 1}</Text>
                </View>
                <View style={s.weekContent}>
                  <Text style={s.weekFoco}>{semana.foco}</Text>
                  {semana.acoes?.map((a, ai) => (
                    <Text key={ai} style={s.weekAcao}>- {a}</Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Dicas ── */}
      {comp.dicas_desenvolvimento?.length > 0 && (
        <View style={s.dicasBox} wrap={false}>
          <Text style={s.dicaLabel}>Dicas de Desenvolvimento</Text>
          {comp.dicas_desenvolvimento.map((d, i) => (
            <Text key={i} style={s.dicaItem}>- {d}</Text>
          ))}
        </View>
      )}

      {/* ── Estudo ── */}
      {comp.estudo_recomendado?.length > 0 && (
        <View style={s.estudoBox} wrap={false}>
          <Text style={s.estudoLabel}>Estudo Recomendado</Text>
          {comp.estudo_recomendado.map((e, i) => (
            <Text key={i} style={s.estudoItem}>- {e}</Text>
          ))}
        </View>
      )}

      {/* ── Checklist ── */}
      {comp.checklist_tatico?.length > 0 && (
        <ChecklistBox items={comp.checklist_tatico} />
      )}
    </View>
  );
}
