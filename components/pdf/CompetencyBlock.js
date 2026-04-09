import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, lh } from './styles';
import { LevelBadge, StatusBadge, PriorityBadge } from './StatusBadge';
import { BlockTitle } from './SectionTitle';
import ChecklistBox from './ChecklistBox';

const s = StyleSheet.create({
  // Header
  headerBox: { marginBottom: 12 },
  compName: {
    fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.compName,
    color: colors.titleStrong, lineHeight: lh.compName, marginBottom: 6,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgeLeft: { flexDirection: 'row', alignItems: 'center' },
  counter: { fontFamily: 'Inter', fontSize: fonts.small, color: colors.textMuted },
  // Descritores
  descritorBox: { marginBottom: 12 },
  descritorItem: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.small, marginBottom: 3 },
  // Two columns
  twoCol: { flexDirection: 'row', marginBottom: 12 },
  colBox: { flex: 1, borderRadius: 8, padding: 12, borderWidth: 1 },
  colItem: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.small, marginBottom: 4 },
  // Analysis
  analysisBox: {
    backgroundColor: colors.bgAnalysis, borderWidth: 1, borderColor: colors.borderLight,
    borderRadius: 8, padding: 14, marginBottom: 12,
  },
  analysisText: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.body },
  // Plan week card
  weekCard: {
    borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8,
    padding: 10, marginBottom: 8, backgroundColor: colors.white,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  weekSeal: {
    width: 18, height: 18, borderRadius: 4, backgroundColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1,
  },
  weekSealText: { fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.small, color: '#111827' },
  weekContent: { flex: 1 },
  weekFoco: { fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.blockTitle, color: colors.titleStrong, marginBottom: 3 },
  weekAcao: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.small, marginBottom: 2 },
  // Tips
  tipsBox: {
    backgroundColor: colors.bgNeutral, borderWidth: 1, borderColor: colors.borderLight,
    borderRadius: 8, padding: 12, marginBottom: 10,
  },
  tipItem: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.small, marginBottom: 3 },
  // Study
  studyBox: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderLight,
    borderRadius: 8, padding: 12, marginBottom: 10,
  },
  studyItem: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.linkBlue, lineHeight: lh.small, marginBottom: 3 },
});

export default function CompetencyBlock({ comp, index, total }) {
  const nivel = comp.nivel || comp.nivel_atual || 0;
  const isFlag = comp.flag || nivel <= 1;

  return (
    <View>
      {/* Header */}
      <View style={s.headerBox} wrap={false}>
        <Text style={s.compName}>{comp.nome}</Text>
        <View style={s.badgeRow}>
          <View style={s.badgeLeft}>
            <LevelBadge nivel={nivel} />
            <StatusBadge nivel={nivel} />
            {isFlag && <PriorityBadge />}
          </View>
          <Text style={s.counter}>{'Compet\u00eancia'} {index + 1} de {total}</Text>
        </View>
      </View>

      {/* Descritores em Desenvolvimento */}
      {comp.descritores_desenvolvimento?.length > 0 && (
        <View style={s.descritorBox}>
          <BlockTitle>Descritores em Desenvolvimento</BlockTitle>
          {comp.descritores_desenvolvimento.map((d, i) => (
            <Text key={i} style={s.descritorItem}>{'  \u2013 '}{d}</Text>
          ))}
        </View>
      )}

      {/* Fez Bem / Melhorar */}
      <View style={s.twoCol} wrap={false}>
        <View style={{ ...s.colBox, backgroundColor: colors.bgPositive, borderColor: colors.borderPositive, marginRight: 8 }}>
          <BlockTitle color={colors.fezBemTitle}>FEZ BEM</BlockTitle>
          {comp.fez_bem?.length > 0
            ? comp.fez_bem.map((e, j) => <Text key={j} style={s.colItem}>+ {e}</Text>)
            : <Text style={s.colItem}>{'\u2014'}</Text>
          }
        </View>
        <View style={{ ...s.colBox, backgroundColor: colors.bgAttention, borderColor: colors.borderAttention, marginLeft: 8 }}>
          <BlockTitle color={colors.melhorarTitle}>MELHORAR</BlockTitle>
          {comp.melhorar?.length > 0
            ? comp.melhorar.map((e, j) => <Text key={j} style={s.colItem}>{'\u2013 '}{e}</Text>)
            : <Text style={s.colItem}>{'\u2014'}</Text>
          }
        </View>
      </View>

      {/* Análise */}
      {comp.feedback && (
        <View style={s.analysisBox} wrap={false}>
          <BlockTitle>{'AN\u00c1LISE'}</BlockTitle>
          <Text style={s.analysisText}>{comp.feedback}</Text>
        </View>
      )}

      {/* Plano de Desenvolvimento — 30 Dias */}
      {comp.plano_30_dias && (
        <View style={{ marginBottom: 12 }}>
          <BlockTitle>{'Plano de Desenvolvimento \u2014 30 Dias'}</BlockTitle>
          <View style={{ marginTop: 4 }}>
            {['semana_1', 'semana_2', 'semana_3', 'semana_4'].map((sem, si) => {
              const semana = comp.plano_30_dias[sem];
              if (!semana) return null;
              return (
                <View key={si} style={s.weekCard} wrap={false}>
                  <View style={s.weekSeal}>
                    <Text style={s.weekSealText}>{si + 1}</Text>
                  </View>
                  <View style={s.weekContent}>
                    <Text style={s.weekFoco}>{semana.foco}</Text>
                    {semana.acoes?.map((a, ai) => (
                      <Text key={ai} style={s.weekAcao}>{'\u2013 '}{a}</Text>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Dicas de Desenvolvimento */}
      {comp.dicas_desenvolvimento?.length > 0 && (
        <View style={s.tipsBox} wrap={false}>
          <BlockTitle>DICAS DE DESENVOLVIMENTO</BlockTitle>
          {comp.dicas_desenvolvimento.map((d, i) => (
            <Text key={i} style={s.tipItem}>{'\u2013 '}{d}</Text>
          ))}
        </View>
      )}

      {/* Estudo Recomendado */}
      {comp.estudo_recomendado?.length > 0 && (
        <View style={s.studyBox} wrap={false}>
          <BlockTitle>ESTUDO RECOMENDADO</BlockTitle>
          {comp.estudo_recomendado.map((e, i) => (
            <Text key={i} style={s.studyItem}>{'\u2013 '}{e}</Text>
          ))}
        </View>
      )}

      {/* Checklist Tático */}
      {comp.checklist_tatico?.length > 0 && (
        <ChecklistBox items={comp.checklist_tatico} />
      )}
    </View>
  );
}
