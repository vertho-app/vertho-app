import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, lh, tableStyles, pageStyles, nivelLabel } from './styles';
import PdfCover from './PdfCover';
import { SectionTitle, BlockTitle } from './SectionTitle';
import { TableLevelBadge, TableStatusBadge, LevelBadge, StatusBadge } from './StatusBadge';
import CompetencyBlock from './CompetencyBlock';

const s = StyleSheet.create({
  text: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.body },
  textSmall: { fontFamily: 'Inter', fontSize: fonts.small, color: colors.textMuted, lineHeight: lh.small },
  // Page 2 boxes
  box: {
    backgroundColor: colors.bgNeutral, borderWidth: 1, borderColor: colors.borderLight,
    borderRadius: 8, padding: 14, marginBottom: 12,
  },
  // Pontos — two columns
  pontosRow: { flexDirection: 'row', marginBottom: 12 },
  pontosCol: { flex: 1, borderRadius: 8, padding: 12, borderWidth: 1 },
  pontosItem: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.small, marginBottom: 4 },
  // Table
  tableBox: {
    borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8,
    padding: 12, marginTop: 12,
  },
  tableRowFlag: { borderLeftWidth: 3, borderLeftColor: colors.flagRed },
  // Divider
  compDivider: { borderBottomWidth: 1, borderBottomColor: colors.borderLight, marginTop: 20, marginBottom: 20 },
  // Consolidated section
  consolidatedCard: {
    backgroundColor: colors.bgNeutral, borderWidth: 1, borderColor: colors.borderLight,
    borderRadius: 8, padding: 10, marginBottom: 8,
  },
  consolidatedName: {
    fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.blockTitle,
    color: colors.titleStrong, marginBottom: 4,
  },
  consolidatedItem: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.small, marginBottom: 2 },
  // Final message
  finalBox: {
    marginTop: 24, padding: 16,
  },
  finalTitle: {
    fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.sectionTitle,
    color: colors.titleStrong, marginBottom: 8,
  },
  finalText: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textPrimary, lineHeight: lh.body },
  // Trilha
  trilhaBox: {
    backgroundColor: colors.bgNeutral, borderWidth: 1, borderColor: colors.borderLight,
    borderRadius: 8, padding: 12, marginBottom: 12,
  },
  trilhaItem: { fontFamily: 'Inter', fontSize: fonts.body, color: colors.textSecondary, lineHeight: lh.small, marginBottom: 3 },
});

// ── Fixed Header & Footer ───────────────────────────────────────────────────
function PageHeader({ sub }) {
  return (
    <View style={pageStyles.header} fixed>
      <Text style={pageStyles.headerTitle}>Vertho{sub ? ` \u2014 ${sub}` : ''}</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{'Vertho Mentor IA \u2014 Confidencial'}</Text>
      <Text style={pageStyles.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function RelatorioIndividualPDF({ data, empresaNome, logoBase64 }) {
  const c = data.conteudo;
  if (!c) return null;

  const competencias = c.competencias || [];
  const nome = data.colaborador_nome || '';

  // Separar prioritárias (N1-2) e fortes (N3+)
  const prioritarias = competencias.filter(comp => (comp.nivel || comp.nivel_atual || 0) <= 2);
  const fortes = competencias.filter(comp => (comp.nivel || comp.nivel_atual || 0) >= 3);

  return (
    <Document title={`PDI - ${nome}`}>
      {/* ═══ CAPA ═══ */}
      <PdfCover logoBase64={logoBase64} nome={nome} cargo={data.colaborador_cargo} empresa={empresaNome} data={data.gerado_em} />

      {/* ═══ PÁGINA 2 — RESUMO EXECUTIVO ═══ */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader sub={nome} />

        {/* Bloco 1: Resumo Geral */}
        {c.resumo_geral && (
          <View style={s.box} wrap={false}>
            <SectionTitle>Resumo Geral</SectionTitle>
            <Text style={s.text}>{c.resumo_geral}</Text>
          </View>
        )}

        {/* Bloco 2: Perfil Comportamental */}
        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.box} wrap={false}>
            <SectionTitle>Perfil Comportamental</SectionTitle>
            <Text style={s.text}>{c.perfil_comportamental?.descricao || c.perfil_disc?.descricao}</Text>
          </View>
        )}

        {/* Bloco 3: Pontos Fortes / Pontos de Atenção — 2 colunas */}
        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.pontosRow} wrap={false}>
            <View style={{ ...s.pontosCol, backgroundColor: colors.bgPositive, borderColor: colors.borderPositive, marginRight: 8 }}>
              <SectionTitle>Pontos Fortes</SectionTitle>
              {(c.perfil_comportamental?.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p, i) => (
                <Text key={i} style={s.pontosItem}>+ {p}</Text>
              ))}
            </View>
            <View style={{ ...s.pontosCol, backgroundColor: colors.bgAttention, borderColor: colors.borderAttention, marginLeft: 8 }}>
              <SectionTitle>{'Pontos de Aten\u00e7\u00e3o'}</SectionTitle>
              {(c.perfil_comportamental?.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p, i) => (
                <Text key={i} style={s.pontosItem}>! {p}</Text>
              ))}
            </View>
          </View>
        )}

        {/* Bloco 4: Resumo de Desempenho — 3 colunas */}
        {competencias.length > 0 && (
          <View style={s.tableBox} wrap={false}>
            <SectionTitle>Resumo de Desempenho</SectionTitle>
            <View style={tableStyles.table}>
              <View style={tableStyles.headerRow}>
                <Text style={{ ...tableStyles.headerCell, width: '58%' }}>{'Compet\u00eancia'}</Text>
                <Text style={{ ...tableStyles.headerCell, width: '14%', textAlign: 'center' }}>{'N\u00edvel'}</Text>
                <Text style={{ ...tableStyles.headerCell, width: '28%', textAlign: 'center' }}>Status</Text>
              </View>
              {competencias.map((comp, i) => {
                const nivel = comp.nivel || comp.nivel_atual || 0;
                const isFlag = comp.flag || nivel <= 1;
                const rowBase = i % 2 === 0 ? tableStyles.row : tableStyles.rowAlt;
                return (
                  <View key={i} style={{ ...rowBase, ...(isFlag ? s.tableRowFlag : {}) }} wrap={false}>
                    <Text style={{ ...tableStyles.cellBold, width: '58%' }}>{comp.nome || comp.competencia}</Text>
                    <View style={{ width: '14%', alignItems: 'center' }}>
                      <TableLevelBadge nivel={nivel} />
                    </View>
                    <View style={{ width: '28%', alignItems: 'center' }}>
                      <TableStatusBadge nivel={nivel} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Trilha de Cursos */}
        {c.trilha_cursos?.length > 0 && (
          <View style={s.trilhaBox} wrap={false}>
            <SectionTitle>Trilha de Desenvolvimento</SectionTitle>
            {c.trilha_cursos.map((curso, i) => (
              <Text key={i} style={s.trilhaItem}>
                {i + 1}. {curso.nome}{curso.competencia ? ` (${curso.competencia})` : ''}
              </Text>
            ))}
          </View>
        )}

        <PageFooter />
      </Page>

      {/* ═══ COMPETÊNCIAS PRIORITÁRIAS (detalhadas) ═══ */}
      {prioritarias.length > 0 && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader sub="Plano de Desenvolvimento Individual" />
          {prioritarias.map((comp, idx) => {
            const globalIdx = competencias.indexOf(comp);
            return (
              <View key={idx}>
                {idx > 0 && <View style={s.compDivider} />}
                <CompetencyBlock comp={comp} index={globalIdx} total={competencias.length} />
              </View>
            );
          })}
          <PageFooter />
        </Page>
      )}

      {/* ═══ COMPETÊNCIAS CONSOLIDADAS (enxutas) ═══ */}
      {fortes.length > 0 && (
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader sub="PDI" />
          <SectionTitle>{'Compet\u00eancias Consolidadas'}</SectionTitle>
          <Text style={{ ...s.textSmall, marginBottom: 12 }}>
            {'Compet\u00eancias com bom desempenho. Foco: manter e fortalecer.'}
          </Text>
          {fortes.map((comp, idx) => {
            const nivel = comp.nivel || comp.nivel_atual || 0;
            const pontosFortes = (comp.fez_bem || []).slice(0, 2);
            const orientacao = comp.dicas_desenvolvimento?.[0] || comp.feedback?.slice(0, 120) || '';
            return (
              <View key={idx} style={s.consolidatedCard} wrap={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={s.consolidatedName}>{comp.nome}</Text>
                  <View style={{ marginLeft: 8, flexDirection: 'row' }}>
                    <LevelBadge nivel={nivel} />
                    <StatusBadge nivel={nivel} />
                  </View>
                </View>
                {pontosFortes.length > 0 && (
                  <View style={{ marginBottom: 4 }}>
                    <Text style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.small, color: colors.fezBemTitle, marginBottom: 2 }}>Pontos Fortes</Text>
                    {pontosFortes.map((p, i) => <Text key={i} style={s.consolidatedItem}>+ {p}</Text>)}
                  </View>
                )}
                {orientacao && (
                  <View>
                    <Text style={{ fontFamily: 'Inter', fontWeight: 600, fontSize: fonts.small, color: colors.textMuted, marginBottom: 2 }}>{'Orienta\u00e7\u00e3o'}</Text>
                    <Text style={s.consolidatedItem}>{orientacao}</Text>
                  </View>
                )}
              </View>
            );
          })}
          <PageFooter />
        </Page>
      )}

      {/* ═══ MENSAGEM FINAL ═══ */}
      {c.mensagem_final && (
        <Page size="A4" style={pageStyles.page}>
          <PageHeader sub="PDI" />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={s.finalBox}>
              <Text style={s.finalTitle}>Mensagem Final</Text>
              <Text style={s.finalText}>{c.mensagem_final}</Text>
            </View>
          </View>
          <PageFooter />
        </Page>
      )}
    </Document>
  );
}
