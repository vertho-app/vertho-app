import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles, nivelColor, nivelBgColor, starsText } from './styles';
import PdfCover from './PdfCover';
import { SectionTitle } from './SectionTitle';
import StatusBadge from './StatusBadge';
import CompetencyBlock from './CompetencyBlock';

const s = StyleSheet.create({
  section: { marginBottom: 10 },
  text: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.65, marginBottom: 4 },
  italic: { fontSize: fonts.body, color: colors.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 },
  // Perfil box
  perfilBox: {
    backgroundColor: colors.perfilBg, borderRadius: 4, padding: 12,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.cyan,
  },
  // Two-col summary
  summaryRow: { flexDirection: 'row', marginBottom: 8, gap: 6 },
  summaryCol: {
    flex: 1, padding: 10, borderRadius: 4, borderWidth: 0.5,
    borderColor: colors.borderLight,
  },
  summaryLabel: {
    fontSize: fonts.small, fontWeight: 'bold', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 4,
  },
  summaryItem: { fontSize: fonts.body, color: colors.textPrimary, marginLeft: 6, marginBottom: 2, lineHeight: 1.4 },
  // Trilha
  trilhaBox: {
    backgroundColor: colors.planoBg, borderRadius: 4, padding: 10,
    marginBottom: 8, borderLeftWidth: 3, borderLeftColor: colors.teal,
  },
  trilhaTitle: { fontSize: fonts.heading3, fontWeight: 'bold', color: colors.teal, marginBottom: 4 },
  trilhaItem: { fontSize: fonts.body, color: colors.textSecondary, marginLeft: 8, marginBottom: 2, lineHeight: 1.4 },
  // Mensagem final
  finalBox: {
    backgroundColor: colors.perfilBg, borderRadius: 6, padding: 16,
    marginTop: 16, borderLeftWidth: 3, borderLeftColor: colors.coverAccent,
  },
  finalText: {
    fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.7,
    fontStyle: 'italic',
  },
  // Divider
  divider: { borderBottomWidth: 0.5, borderBottomColor: colors.gray200, marginVertical: 10 },
});

// ── Header + Footer fixos ───────────────────────────────────────────────────
function PageHeader({ nome, sub }) {
  return (
    <View style={pageStyles.header} fixed>
      <Text style={pageStyles.headerTitle}>VERTHO</Text>
      <Text style={pageStyles.headerSub}>{sub || nome}</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
      <Text style={pageStyles.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// ── Componente Principal ────────────────────────────────────────────────────

export default function RelatorioIndividualPDF({ data, empresaNome, logoBase64 }) {
  const c = data.conteudo;
  if (!c) return null;

  const competencias = c.competencias || [];
  const nome = data.colaborador_nome || '';

  return (
    <Document title={`PDI - ${nome}`}>
      {/* ═══ CAPA ═══ */}
      <PdfCover
        logoBase64={logoBase64}
        nome={nome}
        cargo={data.colaborador_cargo}
        empresa={empresaNome}
        data={data.gerado_em}
      />

      {/* ═══ RESUMO EXECUTIVO ═══ */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader nome={nome} sub={nome} />

        {/* Acolhimento */}
        {c.acolhimento && <Text style={s.italic}>{c.acolhimento}</Text>}

        {/* Resumo Geral */}
        {c.resumo_geral && (
          <View style={s.section}>
            <SectionTitle>Resumo Geral</SectionTitle>
            <Text style={s.text}>{c.resumo_geral}</Text>
          </View>
        )}

        {/* Perfil Comportamental */}
        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.section}>
            <SectionTitle>Perfil Comportamental</SectionTitle>
            <View style={s.perfilBox}>
              <Text style={s.text}>
                {c.perfil_comportamental?.descricao || c.perfil_disc?.descricao}
              </Text>
            </View>

            {/* Pontos Fortes / Pontos de Atenção */}
            <View style={s.summaryRow}>
              <View style={{ ...s.summaryCol, backgroundColor: colors.fezBemBg, borderLeftWidth: 3, borderLeftColor: '#2E7D32' }}>
                <Text style={{ ...s.summaryLabel, color: '#2E7D32' }}>Pontos Fortes</Text>
                {(c.perfil_comportamental?.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p, i) => (
                  <Text key={i} style={s.summaryItem}>+ {p}</Text>
                ))}
              </View>
              <View style={{ ...s.summaryCol, backgroundColor: colors.melhorarBg, borderLeftWidth: 3, borderLeftColor: '#E65100' }}>
                <Text style={{ ...s.summaryLabel, color: '#E65100' }}>Pontos de Atencao</Text>
                {(c.perfil_comportamental?.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p, i) => (
                  <Text key={i} style={s.summaryItem}>! {p}</Text>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Resumo de Desempenho */}
        {(c.resumo_desempenho || competencias)?.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Resumo de Desempenho</SectionTitle>
            <View style={tableStyles.table}>
              <View style={tableStyles.headerRow}>
                <Text style={{ ...tableStyles.headerCell, flex: 3 }}>Competencia</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1, textAlign: 'center' }}>Nivel</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1.5, textAlign: 'center' }}>Desempenho</Text>
              </View>
              {(c.resumo_desempenho || competencias).map((comp, i) => {
                const nivel = comp.nivel || comp.nivel_atual || 0;
                return (
                  <View key={i} style={i % 2 === 0 ? tableStyles.row : tableStyles.rowAlt}>
                    <Text style={{ ...tableStyles.cellBold, flex: 3 }}>
                      {(comp.flag || nivel <= 1) ? '[!] ' : ''}{comp.competencia || comp.nome}
                    </Text>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 8.5, fontWeight: 'bold', color: nivelColor(nivel),
                        backgroundColor: nivelBgColor(nivel),
                        paddingHorizontal: 6, paddingVertical: 1, borderRadius: 2,
                      }}>N{nivel}</Text>
                    </View>
                    <Text style={{ ...tableStyles.cell, flex: 1.5, textAlign: 'center', letterSpacing: 2 }}>
                      {starsText(nivel)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Trilha de Cursos (se disponível) */}
        {c.trilha_cursos?.length > 0 && (
          <View style={s.section}>
            <SectionTitle>Trilha de Desenvolvimento</SectionTitle>
            <View style={s.trilhaBox}>
              <Text style={s.trilhaTitle}>Cursos Recomendados</Text>
              {c.trilha_cursos.map((curso, i) => (
                <Text key={i} style={s.trilhaItem}>
                  {i + 1}. {curso.nome}{curso.competencia ? ` (${curso.competencia})` : ''}
                </Text>
              ))}
            </View>
          </View>
        )}

        <PageFooter />
      </Page>

      {/* ═══ BLOCOS POR COMPETÊNCIA ═══ */}
      {competencias.map((comp, idx) => (
        <Page key={idx} size="A4" style={pageStyles.page} wrap>
          <PageHeader nome={nome} sub={`PDI ${idx + 1}/${competencias.length}`} />
          <CompetencyBlock comp={comp} index={idx} total={competencias.length} />
          <PageFooter />
        </Page>
      ))}

      {/* ═══ MENSAGEM FINAL ═══ */}
      {c.mensagem_final && (
        <Page size="A4" style={pageStyles.page}>
          <PageHeader nome={nome} sub="PDI" />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={s.finalBox}>
              <Text style={{ fontSize: fonts.heading2, fontWeight: 'bold', color: colors.navy, marginBottom: 10 }}>
                Mensagem Final
              </Text>
              <Text style={s.finalText}>{c.mensagem_final}</Text>
            </View>
          </View>
          <PageFooter />
        </Page>
      )}
    </Document>
  );
}
