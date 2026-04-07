// components/pdf/RelatorioIndividual.js — Individual Phase 3 report (PDF)

import React from 'react';
import { Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import RelatorioTemplate from './RelatorioTemplate';
import { colors, fonts, tableStyles } from './styles';

/**
 * Individual competency report for Phase 3.
 *
 * @param {object} props
 * @param {object} props.colaborador - { nome, cargo, email }
 * @param {Array}  props.competencias - [{ nome, pilar, nivel, nota, feedback, acoes_pdi }]
 * @param {object} props.avaliacao - { data_avaliacao, nota_final, status }
 */
export default function RelatorioIndividual({
  colaborador,
  competencias,
  avaliacao,
}) {
  const dataFormatada = avaliacao?.data_avaliacao
    ? new Date(avaliacao.data_avaliacao).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  return (
    <RelatorioTemplate
      title={`Relatório Individual — ${colaborador?.nome || 'Colaborador'}`}
    >
      {/* Profile Section */}
      <View style={s.profileSection}>
        <Text style={s.reportTitle}>Relatório Individual de Competências</Text>

        <View style={s.profileRow}>
          <View style={s.profileCol}>
            <Text style={s.label}>Nome</Text>
            <Text style={s.value}>{colaborador?.nome || '—'}</Text>
          </View>
          <View style={s.profileCol}>
            <Text style={s.label}>Cargo</Text>
            <Text style={s.value}>{colaborador?.cargo || '—'}</Text>
          </View>
        </View>

        <View style={s.profileRow}>
          <View style={s.profileCol}>
            <Text style={s.label}>Data da Avaliação</Text>
            <Text style={s.value}>{dataFormatada}</Text>
          </View>
          <View style={s.profileCol}>
            <Text style={s.label}>Nota Final</Text>
            <Text style={s.valueHighlight}>
              {avaliacao?.nota_final != null
                ? Number(avaliacao.nota_final).toFixed(1)
                : '—'}
            </Text>
          </View>
        </View>
      </View>

      {/* Competency Table */}
      <View style={s.sectionMargin}>
        <Text style={s.sectionTitle}>Resumo de Competências</Text>

        <View style={tableStyles.table}>
          {/* Header */}
          <View style={tableStyles.headerRow}>
            <Text style={{ ...tableStyles.headerCell, width: '40%' }}>
              Competência
            </Text>
            <Text
              style={{
                ...tableStyles.headerCell,
                width: '20%',
                textAlign: 'center',
              }}
            >
              Nível
            </Text>
            <Text
              style={{
                ...tableStyles.headerCell,
                width: '15%',
                textAlign: 'center',
              }}
            >
              Nota
            </Text>
            <Text style={{ ...tableStyles.headerCell, width: '25%' }}>
              Pilar
            </Text>
          </View>

          {/* Data Rows */}
          {(competencias || []).map((comp, i) => {
            const rowStyle =
              i % 2 === 0 ? tableStyles.row : tableStyles.rowAlt;
            return (
              <View key={comp.nome + i} style={rowStyle}>
                <Text style={{ ...tableStyles.cellBold, width: '40%' }}>
                  {comp.nome}
                </Text>
                <Text
                  style={{
                    ...tableStyles.cell,
                    width: '20%',
                    textAlign: 'center',
                  }}
                >
                  {comp.nivel || '—'}
                </Text>
                <Text
                  style={{
                    ...tableStyles.cell,
                    width: '15%',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: colors.navy,
                  }}
                >
                  {comp.nota != null ? Number(comp.nota).toFixed(1) : '—'}
                </Text>
                <Text style={{ ...tableStyles.cell, width: '25%' }}>
                  {comp.pilar || '—'}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Detailed Feedback per Competency */}
      <View style={s.sectionMargin} break>
        <Text style={s.sectionTitle}>Feedback Detalhado</Text>

        {(competencias || []).map((comp, i) => (
          <View key={'fb-' + i} style={s.feedbackBlock} wrap={false}>
            <View style={s.feedbackHeader}>
              <Text style={s.feedbackTitle}>{comp.nome}</Text>
              <Text style={s.feedbackNota}>
                {comp.nota != null ? Number(comp.nota).toFixed(1) : '—'}
              </Text>
            </View>
            <Text style={s.feedbackText}>
              {comp.feedback || 'Feedback não disponível para esta competência.'}
            </Text>
          </View>
        ))}
      </View>

      {/* PDI Summary */}
      <View style={s.sectionMargin} break>
        <Text style={s.sectionTitle}>
          Plano de Desenvolvimento Individual (PDI)
        </Text>
        <Text style={s.pdiIntro}>
          Com base nos resultados da avaliação, as seguintes ações de
          desenvolvimento foram recomendadas:
        </Text>

        {(competencias || [])
          .filter((c) => c.acoes_pdi)
          .map((comp, i) => (
            <View key={'pdi-' + i} style={s.pdiItem} wrap={false}>
              <View style={s.pdiBullet} />
              <View style={s.pdiContent}>
                <Text style={s.pdiCompName}>{comp.nome}</Text>
                <Text style={s.pdiAction}>{comp.acoes_pdi}</Text>
              </View>
            </View>
          ))}

        {(competencias || []).filter((c) => c.acoes_pdi).length === 0 && (
          <Text style={s.emptyText}>
            Nenhuma ação de PDI definida ainda para este colaborador.
          </Text>
        )}
      </View>
    </RelatorioTemplate>
  );
}

const s = StyleSheet.create({
  profileSection: {
    marginBottom: 16,
  },
  reportTitle: {
    fontSize: fonts.heading2,
    color: colors.navy,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  profileRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  profileCol: {
    flex: 1,
  },
  label: {
    fontSize: fonts.caption,
    color: colors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  value: {
    fontSize: fonts.body,
    color: colors.navy,
  },
  valueHighlight: {
    fontSize: 14,
    color: colors.teal,
    fontWeight: 'bold',
  },
  sectionMargin: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: fonts.heading3,
    color: colors.navy,
    fontWeight: 'bold',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.cyan,
    paddingBottom: 4,
  },
  feedbackBlock: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: colors.gray100,
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: colors.cyan,
  },
  feedbackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  feedbackTitle: {
    fontSize: fonts.body,
    color: colors.navy,
    fontWeight: 'bold',
  },
  feedbackNota: {
    fontSize: fonts.body,
    color: colors.teal,
    fontWeight: 'bold',
  },
  feedbackText: {
    fontSize: fonts.small,
    color: colors.gray600,
    lineHeight: 1.5,
  },
  pdiIntro: {
    fontSize: fonts.body,
    color: colors.gray600,
    marginBottom: 12,
    lineHeight: 1.5,
  },
  pdiItem: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  pdiBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.teal,
    marginTop: 3,
    marginRight: 8,
  },
  pdiContent: {
    flex: 1,
  },
  pdiCompName: {
    fontSize: fonts.body,
    color: colors.navy,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  pdiAction: {
    fontSize: fonts.small,
    color: colors.gray600,
    lineHeight: 1.5,
  },
  emptyText: {
    fontSize: fonts.body,
    color: colors.gray400,
    fontStyle: 'italic',
  },
});
