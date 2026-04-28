import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, nivelColor, nivelBgColor, nivelLabel } from './styles';
import ChecklistBox from './ChecklistBox';

const s = StyleSheet.create({
  // ── Header navy compacto ────────────────────────────────────────────
  headerBox: {
    backgroundColor: colors.navy, borderRadius: 5, padding: 10,
    marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  headerLeft: { flex: 1, marginRight: 10 },
  compName: { fontSize: 12, fontWeight: 700, color: colors.white, lineHeight: 1.3 },
  headerRight: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  // Badges
  badgeLevel: {
    backgroundColor: colors.cyan,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3,
  },
  badgeLevelText: { fontSize: 8, fontWeight: 700, color: colors.navy, letterSpacing: 0.5 },
  badgeAtencao: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, marginLeft: 5,
  },
  badgeAtencaoText: { fontSize: 7.5, fontWeight: 700, color: colors.white, letterSpacing: 0.5 },
  badgeDev: {
    backgroundColor: colors.yellow,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 3, marginLeft: 5,
  },
  badgeDevText: { fontSize: 7.5, fontWeight: 700, color: colors.white, letterSpacing: 0.5 },
  // ── Block container helper ───────────────────────────────────────────
  blockLabel: {
    fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: 4,
  },
  blockItem: {
    fontSize: 8.5, lineHeight: 1.6, marginBottom: 1.5,
  },
  // Descritores (amber/yellow)
  descritorBox: {
    backgroundColor: colors.descritorBg,
    borderWidth: 0.5, borderColor: colors.descritorBorder,
    borderRadius: 3, padding: 9, marginBottom: 8,
  },
  // Fez bem (green) e Melhorar (orange) — two cols
  twoCol: { flexDirection: 'row', marginBottom: 8, gap: 6 },
  fezBemCol: {
    flex: 1, backgroundColor: colors.fezBemBg,
    borderWidth: 0.5, borderColor: colors.fezBemBorder,
    borderRadius: 3, padding: 9,
  },
  melhorarCol: {
    flex: 1, backgroundColor: colors.melhorarBg,
    borderWidth: 0.5, borderColor: colors.melhorarBorder,
    borderRadius: 3, padding: 9,
  },
  // Análise (blue)
  analiseBox: {
    backgroundColor: colors.perfilBg,
    borderWidth: 0.5, borderColor: colors.perfilBorder,
    borderRadius: 3, padding: 9, marginBottom: 8,
  },
  analiseText: { fontSize: 8.5, color: colors.blueText, lineHeight: 1.65, fontStyle: 'italic' },
  // Plano 30 dias
  planoTitle: {
    fontSize: 10, fontWeight: 700, color: colors.navy,
    marginBottom: 4, marginTop: 2,
  },
  steps: { marginBottom: 8 },
  step: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.gray100, borderWidth: 0.5, borderColor: colors.borderLight,
    borderRadius: 3, padding: 8, marginBottom: 4,
  },
  stepNum: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: colors.navy,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: { fontSize: 8, fontWeight: 700, color: colors.white },
  stepContent: { flex: 1 },
  stepStrong: {
    fontSize: 9, fontWeight: 700, color: colors.navy, marginBottom: 2,
  },
  stepSpan: {
    fontSize: 8.5, color: colors.gray500, lineHeight: 1.55,
  },
  // Bottom row: dicas (green) + estudo (purple)
  bottomRow: { flexDirection: 'row', marginBottom: 8, gap: 6 },
  dicasBox: {
    flex: 1, backgroundColor: colors.dicasBg,
    borderWidth: 0.5, borderColor: colors.dicasBorder,
    borderRadius: 3, padding: 9,
  },
  estudoBox: {
    flex: 1, backgroundColor: colors.estudoBg,
    borderWidth: 0.5, borderColor: colors.estudoBorder,
    borderRadius: 3, padding: 9,
  },
});

// Util: renderiza um item com prefix colorido (substitui o ::before do CSS)
function PrefixedItem({ prefix, color, text, textColor }: {
  prefix: string; color: string; text: string; textColor?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 2 }}>
      <Text style={{ fontSize: 9, fontWeight: 700, color, width: 12, marginTop: 0 }}>{prefix}</Text>
      <Text style={{ fontSize: 8.5, color: textColor || colors.textPrimary, flex: 1, lineHeight: 1.6 }}>
        {text}
      </Text>
    </View>
  );
}

export default function CompetencyBlock({ comp, index, total }: { comp: any; index: number; total: number }) {
  const nivel = comp.nivel || comp.nivel_atual || 0;
  const isFlag = comp.flag || nivel <= 1;
  const isStrong = nivel >= 3;

  return (
    <View>
      {/* ── Header navy + badges ── */}
      <View style={s.headerBox} wrap={false}>
        <View style={s.headerLeft}>
          <Text style={s.compName}>{comp.nome}</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.badgeLevel}>
            <Text style={s.badgeLevelText}>N{nivel}</Text>
          </View>
          {isFlag ? (
            <View style={s.badgeAtencao}>
              <Text style={s.badgeAtencaoText}>Atenção Prioritária</Text>
            </View>
          ) : nivel === 2 ? (
            <View style={s.badgeDev}>
              <Text style={s.badgeDevText}>Em Desenvolvimento</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* ── Descritores em desenvolvimento (amber) ── */}
      {!isStrong && comp.descritores_desenvolvimento?.length > 0 && (
        <View style={s.descritorBox} wrap={false}>
          <Text style={{ ...s.blockLabel, color: colors.yellow }}>Descritores em Desenvolvimento</Text>
          {comp.descritores_desenvolvimento.map((d: any, i: number) => (
            <PrefixedItem key={i} prefix="→" color={colors.yellow} text={d} textColor={colors.yellowText} />
          ))}
        </View>
      )}

      {/* ── Fez Bem / Melhorar (two-col) ── */}
      <View style={s.twoCol} wrap={false}>
        <View style={s.fezBemCol}>
          <Text style={{ ...s.blockLabel, color: colors.green }}>Fez Bem</Text>
          {comp.fez_bem?.length > 0
            ? comp.fez_bem.map((e: any, j: number) => (
                <PrefixedItem key={j} prefix="+" color={colors.green} text={e} textColor={colors.greenText} />
              ))
            : <Text style={{ ...s.blockItem, color: colors.greenText }}>—</Text>
          }
        </View>
        <View style={s.melhorarCol}>
          <Text style={{ ...s.blockLabel, color: colors.orange }}>Melhorar</Text>
          {comp.melhorar?.length > 0
            ? comp.melhorar.map((e: any, j: number) => (
                <PrefixedItem key={j} prefix="↑" color={colors.orange} text={e} textColor={colors.orangeText} />
              ))
            : <Text style={{ ...s.blockItem, color: colors.orangeText }}>—</Text>
          }
        </View>
      </View>

      {/* ── Análise (azul, itálico) ── */}
      {comp.feedback && (
        <View style={s.analiseBox} wrap={false}>
          <Text style={{ ...s.blockLabel, color: '#0369A1' }}>Análise</Text>
          <Text style={s.analiseText}>{comp.feedback}</Text>
        </View>
      )}

      {/* ── Plano 30 dias (steps numerados) ── */}
      {!isStrong && comp.plano_30_dias && (
        <View>
          <Text style={s.planoTitle}>Plano de Desenvolvimento — 30 Dias</Text>
          <View style={s.steps}>
            {['semana_1', 'semana_2', 'semana_3', 'semana_4'].map((sem: string, si: number) => {
              const semana = comp.plano_30_dias[sem];
              if (!semana) return null;
              const acoesText = Array.isArray(semana.acoes) ? semana.acoes.join(' ') : (semana.acoes || '');
              return (
                <View key={si} style={s.step} wrap={false}>
                  <View style={s.stepNum}>
                    <Text style={s.stepNumText}>{si + 1}</Text>
                  </View>
                  <View style={s.stepContent}>
                    <Text style={s.stepStrong}>{semana.foco}</Text>
                    {acoesText && <Text style={s.stepSpan}>{acoesText}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ── Bottom: Dicas (green) + Estudo (purple) ── */}
      {(comp.dicas_desenvolvimento?.length > 0 || comp.estudo_recomendado?.length > 0) && (
        <View style={s.bottomRow} wrap={false}>
          {comp.dicas_desenvolvimento?.length > 0 && (
            <View style={s.dicasBox}>
              <Text style={{ ...s.blockLabel, color: colors.green }}>Dica de Desenvolvimento</Text>
              {comp.dicas_desenvolvimento.map((d: any, i: number) => (
                <Text key={i} style={{ fontSize: 8, color: colors.greenText, lineHeight: 1.6, marginBottom: 2 }}>{d}</Text>
              ))}
            </View>
          )}
          {comp.estudo_recomendado?.length > 0 && (
            <View style={s.estudoBox}>
              <Text style={{ ...s.blockLabel, color: colors.purple }}>Estudo Recomendado</Text>
              {comp.estudo_recomendado.map((e: any, i: number) => (
                <Text key={i} style={{ fontSize: 8, color: colors.purpleText, lineHeight: 1.6, marginBottom: 2 }}>
                  {typeof e === 'string' ? e : `${e.titulo}${e.por_que_ajuda ? ' — ' + e.por_que_ajuda : ''}`}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Checklist Tático (navy + branco) ── */}
      {comp.checklist_tatico?.length > 0 && (
        <ChecklistBox items={comp.checklist_tatico} />
      )}
    </View>
  );
}
