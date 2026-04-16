import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, nivelColor, nivelBgColor, nivelLabel } from './styles';
import { LevelDots } from './StatusBadge';
import ChecklistBox from './ChecklistBox';

const s = StyleSheet.create({
  // ── Header navy ──
  headerBox: {
    backgroundColor: colors.navy, borderRadius: 5, padding: 12,
    marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLeft: { flex: 1, marginRight: 10 },
  compName: { fontSize: 13, fontWeight: 'bold', color: colors.white, marginBottom: 2 },
  counter: { fontSize: 6.5, color: '#7B91AB', letterSpacing: 0.3 },
  headerRight: { alignItems: 'flex-end' },
  levelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  levelBadge: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, marginRight: 6,
  },
  levelText: { fontSize: 11, fontWeight: 'bold' },
  statusText: { fontSize: 7.5, color: '#94A3B8', fontWeight: 'bold', letterSpacing: 0.3 },
  // Flag
  flagBadge: {
    backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 3, marginBottom: 10, alignSelf: 'flex-start',
  },
  flagText: { fontSize: 7.5, fontWeight: 'bold', color: '#991B1B', letterSpacing: 0.5 },
  // ── Section labels ──
  sectionLabel: {
    fontSize: 7.5, fontWeight: 'bold', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  // Descritores
  descritorBox: {
    backgroundColor: '#FFF8E1', borderRadius: 4, padding: 10,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#E65100',
  },
  descritorItem: { fontSize: 9, color: colors.textPrimary, marginLeft: 6, marginBottom: 2.5, lineHeight: 1.5 },
  // Two columns — fez bem / melhorar
  twoCol: { flexDirection: 'row', marginBottom: 10 },
  fezBemCol: {
    flex: 1, backgroundColor: '#E8F5E9', padding: 10, marginRight: 4, borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: '#2E7D32',
  },
  melhorarCol: {
    flex: 1, backgroundColor: '#FFF3E0', padding: 10, marginLeft: 4, borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: '#E65100',
  },
  colHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  colDot: { width: 5, height: 5, borderRadius: 3, marginRight: 5 },
  colLabel: { fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  colItem: { fontSize: 9, color: colors.textPrimary, marginLeft: 10, marginBottom: 2.5, lineHeight: 1.45 },
  // Feedback / An\u00e1lise
  feedbackBox: {
    backgroundColor: '#F0F4FA', borderRadius: 4, padding: 12,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.cyan,
  },
  feedbackLabel: {
    fontSize: 8, fontWeight: 'bold', color: colors.cyan,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5,
  },
  feedbackText: { fontSize: 9, color: colors.textSecondary, lineHeight: 1.65, fontStyle: 'italic' },
  // Plano 30 dias
  planoContainer: { marginBottom: 12 },
  planoTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 8 },
  weekCard: {
    backgroundColor: '#E8EDF5', borderRadius: 4, padding: 10, marginBottom: 5,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  weekNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center',
    marginRight: 10, marginTop: 1,
  },
  weekNumText: { fontSize: 10, fontWeight: 'bold', color: colors.white },
  weekContent: { flex: 1 },
  weekFoco: { fontSize: 9, fontWeight: 'bold', color: colors.navyLight, marginBottom: 3 },
  weekAcao: { fontSize: 8.5, color: colors.textSecondary, marginLeft: 4, marginBottom: 1.5, lineHeight: 1.45 },
  // Dicas
  dicasBox: {
    marginBottom: 10, padding: 10, backgroundColor: '#F0FAF4', borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: colors.teal,
  },
  dicaLabel: { fontSize: 8, fontWeight: 'bold', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  dicaItem: { fontSize: 8.5, color: colors.textSecondary, marginLeft: 6, marginBottom: 2.5, lineHeight: 1.5 },
  // Estudo
  estudoBox: {
    marginBottom: 10, padding: 10, backgroundColor: '#F5F0FF', borderRadius: 4,
    borderLeftWidth: 3, borderLeftColor: '#6B46C1',
  },
  estudoLabel: { fontSize: 8, fontWeight: 'bold', color: '#6B46C1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  estudoItem: { fontSize: 8.5, color: colors.linkBlue, marginLeft: 6, marginBottom: 2.5, lineHeight: 1.45 },
});

export default function CompetencyBlock({ comp, index, total }: { comp: any; index: number; total: number }) {
  const nivel = comp.nivel || comp.nivel_atual || 0;
  const isFlag = comp.flag || nivel <= 1;
  const isStrong = nivel >= 3; // Compet\u00eancia consolidada — bloco mais compacto
  const nColor = nivelColor(nivel);
  const nBg = nivelBgColor(nivel);

  return (
    <View>
      {/* ── Header navy ── */}
      <View style={s.headerBox} wrap={false}>
        <View style={s.headerLeft}>
          <Text style={s.compName}>{comp.nome}</Text>
          <Text style={s.counter}>Competência {index + 1} de {total}</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.levelRow}>
            <View style={{ ...s.levelBadge, backgroundColor: nBg }}>
              <Text style={{ ...s.levelText, color: nColor }}>N{nivel}</Text>
            </View>
            <LevelDots nivel={nivel} color={nColor} />
          </View>
          <Text style={s.statusText}>{nivelLabel(nivel)}</Text>
        </View>
      </View>

      {/* Flag de prioridade */}
      {isFlag && (
        <View style={s.flagBadge}>
          <Text style={s.flagText}>ATENÇÃO PRIORITÁRIA</Text>
        </View>
      )}

      {/* ── Descritores em desenvolvimento (apenas para N1-2) ── */}
      {!isStrong && comp.descritores_desenvolvimento?.length > 0 && (
        <View style={s.descritorBox} wrap={false}>
          <Text style={s.sectionLabel}>Descritores em Desenvolvimento</Text>
          {comp.descritores_desenvolvimento.map((d: any, i: number) => (
            <Text key={i} style={s.descritorItem}>- {d}</Text>
          ))}
        </View>
      )}

      {/* ── Fez Bem / Melhorar ── */}
      <View style={s.twoCol} wrap={false}>
        <View style={s.fezBemCol}>
          <View style={s.colHeader}>
            <View style={{ ...s.colDot, backgroundColor: '#2E7D32' }} />
            <Text style={{ ...s.colLabel, color: '#2E7D32' }}>Fez Bem</Text>
          </View>
          {comp.fez_bem?.length > 0
            ? comp.fez_bem.map((e: any, j: number) => <Text key={j} style={s.colItem}>+ {e}</Text>)
            : <Text style={s.colItem}>-</Text>
          }
        </View>
        <View style={s.melhorarCol}>
          <View style={s.colHeader}>
            <View style={{ ...s.colDot, backgroundColor: '#E65100' }} />
            <Text style={{ ...s.colLabel, color: '#E65100' }}>Melhorar</Text>
          </View>
          {comp.melhorar?.length > 0
            ? comp.melhorar.map((e: any, j: number) => <Text key={j} style={s.colItem}>- {e}</Text>)
            : <Text style={s.colItem}>-</Text>
          }
        </View>
      </View>

      {/* ── An\u00e1lise (feedback) ── */}
      {comp.feedback && (
        <View style={s.feedbackBox} wrap={false}>
          <Text style={s.feedbackLabel}>Análise</Text>
          <Text style={s.feedbackText}>{comp.feedback}</Text>
        </View>
      )}

      {/* ── Plano 30 dias (apenas para N1-2, priorit\u00e1rias) ── */}
      {!isStrong && comp.plano_30_dias && (
        <View style={s.planoContainer}>
          <Text style={s.planoTitle}>Plano de Desenvolvimento — 30 Dias</Text>
          {['semana_1', 'semana_2', 'semana_3', 'semana_4'].map((sem: string, si: number) => {
            const semana = comp.plano_30_dias[sem];
            if (!semana) return null;
            return (
              <View key={si} style={s.weekCard} wrap={false}>
                <View style={s.weekNum}>
                  <Text style={s.weekNumText}>{si + 1}</Text>
                </View>
                <View style={s.weekContent}>
                  <Text style={s.weekFoco}>{semana.foco}</Text>
                  {semana.acoes?.map((a: any, ai: number) => (
                    <Text key={ai} style={s.weekAcao}>- {a}</Text>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Dicas de Desenvolvimento ── */}
      {comp.dicas_desenvolvimento?.length > 0 && (
        <View style={s.dicasBox} wrap={false}>
          <Text style={s.dicaLabel}>Dicas de Desenvolvimento</Text>
          {comp.dicas_desenvolvimento.map((d: any, i: number) => (
            <Text key={i} style={s.dicaItem}>- {d}</Text>
          ))}
        </View>
      )}

      {/* ── Estudo Recomendado ── */}
      {comp.estudo_recomendado?.length > 0 && (
        <View style={s.estudoBox} wrap={false}>
          <Text style={s.estudoLabel}>Estudo Recomendado</Text>
          {comp.estudo_recomendado.map((e: any, i: number) => (
            <Text key={i} style={s.estudoItem}>- {e}</Text>
          ))}
        </View>
      )}

      {/* ── Checklist T\u00e1tico ── */}
      {comp.checklist_tatico?.length > 0 && (
        <ChecklistBox items={comp.checklist_tatico} />
      )}
    </View>
  );
}
