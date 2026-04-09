import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles, nivelColor, nivelBgColor } from './styles';
import PdfCover from './PdfCover';
import { SectionTitle } from './SectionTitle';
import { LevelDots } from './StatusBadge';
import CompetencyBlock from './CompetencyBlock';

const s = StyleSheet.create({
  text: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.65, marginBottom: 4 },
  italic: { fontSize: fonts.body, color: colors.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 10 },
  section: { marginBottom: 12 },
  // Resumo executivo cards
  resumoCard: {
    backgroundColor: colors.summaryBg, borderRadius: 4, padding: 12,
    marginBottom: 10, borderWidth: 0.5, borderColor: colors.borderLight,
  },
  // Perfil box
  perfilBox: {
    backgroundColor: colors.perfilBg, borderRadius: 4, padding: 12,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.cyan,
  },
  // Pontos fortes / atenção
  pontosRow: { flexDirection: 'row', marginBottom: 10 },
  pontosCol: {
    flex: 1, padding: 10, borderRadius: 4, borderWidth: 0.5, borderColor: colors.borderLight,
  },
  pontosLabel: {
    fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: 5,
  },
  pontosItem: { fontSize: 9, color: colors.textPrimary, marginLeft: 4, marginBottom: 2.5, lineHeight: 1.45 },
  // Trilha
  trilhaBox: {
    backgroundColor: '#F0FAF4', borderRadius: 4, padding: 10,
    marginBottom: 10, borderLeftWidth: 3, borderLeftColor: colors.teal,
  },
  trilhaLabel: { fontSize: 8, fontWeight: 'bold', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  trilhaItem: { fontSize: 8.5, color: colors.textSecondary, marginLeft: 6, marginBottom: 2, lineHeight: 1.4 },
  // Competency divider
  compDivider: {
    borderBottomWidth: 0.5, borderBottomColor: colors.gray200, marginTop: 16, marginBottom: 16,
  },
  // Mensagem final
  finalBox: {
    backgroundColor: colors.perfilBg, borderRadius: 6, padding: 20,
    marginTop: 20, borderLeftWidth: 3, borderLeftColor: colors.coverAccent,
  },
  finalTitle: { fontSize: 13, fontWeight: 'bold', color: colors.navy, marginBottom: 10 },
  finalText: { fontSize: 9.5, color: colors.textSecondary, lineHeight: 1.7, fontStyle: 'italic' },
});

// ── Fixed Header & Footer ───────────────────────────────────────────────────
function PageHeader({ sub }) {
  return (
    <View style={pageStyles.header} fixed>
      <Text style={pageStyles.headerTitle}>VERTHO</Text>
      <Text style={pageStyles.headerSub}>{sub}</Text>
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

// ── Main Component ──────────────────────────────────────────────────────────

export default function RelatorioIndividualPDF({ data, empresaNome, logoBase64 }) {
  const c = data.conteudo;
  if (!c) return null;

  const competencias = c.competencias || [];
  const nome = data.colaborador_nome || '';

  return (
    <Document title={`PDI - ${nome}`}>
      {/* ═══════════════════ CAPA ═══════════════════ */}
      <PdfCover
        logoBase64={logoBase64}
        nome={nome}
        cargo={data.colaborador_cargo}
        empresa={empresaNome}
        data={data.gerado_em}
      />

      {/* ═══════════════════ RESUMO EXECUTIVO ═══════════════════ */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader sub={nome} />

        {/* Acolhimento */}
        {c.acolhimento && <Text style={s.italic}>{c.acolhimento}</Text>}

        {/* Resumo Geral */}
        {c.resumo_geral && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Resumo Geral</SectionTitle>
            <View style={s.resumoCard}>
              <Text style={s.text}>{c.resumo_geral}</Text>
            </View>
          </View>
        )}

        {/* Perfil Comportamental */}
        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Perfil Comportamental</SectionTitle>
            <View style={s.perfilBox}>
              <Text style={s.text}>
                {c.perfil_comportamental?.descricao || c.perfil_disc?.descricao}
              </Text>
            </View>
          </View>
        )}

        {/* Pontos Fortes / Pontos de Atenção */}
        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.pontosRow} wrap={false}>
            <View style={{ ...s.pontosCol, backgroundColor: colors.fezBemBg, borderLeftWidth: 3, borderLeftColor: '#2E7D32', marginRight: 4 }}>
              <Text style={{ ...s.pontosLabel, color: '#2E7D32' }}>Pontos Fortes</Text>
              {(c.perfil_comportamental?.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p, i) => (
                <Text key={i} style={s.pontosItem}>+ {p}</Text>
              ))}
            </View>
            <View style={{ ...s.pontosCol, backgroundColor: colors.melhorarBg, borderLeftWidth: 3, borderLeftColor: '#E65100', marginLeft: 4 }}>
              <Text style={{ ...s.pontosLabel, color: '#E65100' }}>Pontos de Atencao</Text>
              {(c.perfil_comportamental?.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p, i) => (
                <Text key={i} style={s.pontosItem}>! {p}</Text>
              ))}
            </View>
          </View>
        )}

        {/* Resumo de Desempenho */}
        {(c.resumo_desempenho || competencias)?.length > 0 && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Resumo de Desempenho</SectionTitle>
            <View style={tableStyles.table}>
              <View style={tableStyles.headerRow}>
                <Text style={{ ...tableStyles.headerCell, flex: 3.5 }}>Competencia</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 0.8, textAlign: 'center' }}>Nivel</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1.5, textAlign: 'center' }}>Desempenho</Text>
              </View>
              {(c.resumo_desempenho || competencias).map((comp, i) => {
                const nivel = comp.nivel || comp.nivel_atual || 0;
                const nColor = nivelColor(nivel);
                return (
                  <View key={i} style={i % 2 === 0 ? tableStyles.row : tableStyles.rowAlt}>
                    <Text style={{ ...tableStyles.cellBold, flex: 3.5 }}>
                      {(comp.flag || nivel <= 1) ? '[!] ' : ''}{comp.competencia || comp.nome}
                    </Text>
                    <View style={{ flex: 0.8, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 8, fontWeight: 'bold', color: nColor,
                        backgroundColor: nivelBgColor(nivel),
                        paddingHorizontal: 5, paddingVertical: 1, borderRadius: 2,
                      }}>N{nivel}</Text>
                    </View>
                    <View style={{ flex: 1.5, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                      <LevelDots nivel={nivel} color={nColor} />
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Trilha de Cursos */}
        {c.trilha_cursos?.length > 0 && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Trilha de Desenvolvimento</SectionTitle>
            <View style={s.trilhaBox}>
              <Text style={s.trilhaLabel}>Cursos Recomendados</Text>
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

      {/* ═══════════════════ COMPETÊNCIAS ═══════════════════ */}
      {/* Páginas com wrap — react-pdf quebra naturalmente entre blocos */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader sub="Plano de Desenvolvimento Individual" />

        {competencias.map((comp, idx) => (
          <View key={idx}>
            {idx > 0 && <View style={s.compDivider} />}
            <CompetencyBlock comp={comp} index={idx} total={competencias.length} />
          </View>
        ))}

        <PageFooter />
      </Page>

      {/* ═══════════════════ MENSAGEM FINAL ═══════════════════ */}
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
