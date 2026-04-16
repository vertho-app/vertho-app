import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles, nivelColor, nivelBgColor, nivelLabel } from './styles';
import PdfCover from './PdfCover';
import PageBackground from './PageBackground';
import { SectionTitle } from './SectionTitle';
import { LevelDots } from './StatusBadge';
import CompetencyBlock from './CompetencyBlock';

const s = StyleSheet.create({
  text: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.65, marginBottom: 4 },
  italic: { fontSize: fonts.body, color: colors.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 10 },
  section: { marginBottom: 14 },
  // Resumo Geral — bloco principal
  resumoCard: {
    backgroundColor: '#F8FAFC', borderRadius: 5, padding: 14,
    marginBottom: 12, borderLeftWidth: 4, borderLeftColor: colors.navy,
  },
  // Perfil box
  perfilBox: {
    backgroundColor: colors.perfilBg, borderRadius: 5, padding: 14,
    marginBottom: 12, borderLeftWidth: 4, borderLeftColor: colors.cyan,
  },
  // Pontos fortes / atenção
  pontosRow: { flexDirection: 'row', marginBottom: 12 },
  pontosCol: { flex: 1, padding: 12, borderRadius: 5 },
  pontosHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  pontosDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  pontosLabel: { fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  pontosItem: { fontSize: 9, color: colors.textPrimary, marginLeft: 12, marginBottom: 3, lineHeight: 1.5 },
  // Tabela desempenho
  tableRow: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.gray200, alignItems: 'center',
  },
  tableRowFlag: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.gray200, alignItems: 'center',
    backgroundColor: '#FEF2F2',
  },
  // Trilha
  trilhaBox: {
    backgroundColor: '#F0FAF4', borderRadius: 5, padding: 12,
    marginBottom: 12, borderLeftWidth: 4, borderLeftColor: colors.teal,
  },
  trilhaLabel: { fontSize: 8, fontWeight: 'bold', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  trilhaItem: { fontSize: 8.5, color: colors.textSecondary, marginLeft: 6, marginBottom: 2.5, lineHeight: 1.45 },
  // Competency divider
  compDivider: { borderBottomWidth: 0.5, borderBottomColor: colors.gray200, marginTop: 18, marginBottom: 18 },
  // Mensagem final
  finalBox: {
    backgroundColor: colors.perfilBg, borderRadius: 6, padding: 24,
    marginTop: 24, borderLeftWidth: 4, borderLeftColor: colors.coverAccent,
  },
  finalTitle: { fontSize: 14, fontWeight: 'bold', color: colors.navy, marginBottom: 12 },
  finalText: { fontSize: 10, color: colors.textSecondary, lineHeight: 1.75, fontStyle: 'italic' },
});

// ── Fixed Footer ────────────────────────────────────────────────────────────
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

export default function RelatorioIndividualPDF({ data, empresaNome, logoBase64 }: { data: any; empresaNome?: string; logoBase64?: string }) {
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
        <PageBackground />

        {/* Acolhimento */}
        {c.acolhimento && <Text style={s.italic}>{c.acolhimento}</Text>}

        {/* Resumo Geral — bloco principal com border navy */}
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

        {/* Pontos Fortes / Pontos de Atenção — cards contrastantes */}
        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.pontosRow} wrap={false}>
            <View style={{ ...s.pontosCol, backgroundColor: '#E8F5E9', marginRight: 5, borderLeftWidth: 4, borderLeftColor: '#2E7D32' }}>
              <View style={s.pontosHeader}>
                <View style={{ ...s.pontosDot, backgroundColor: '#2E7D32' }} />
                <Text style={{ ...s.pontosLabel, color: '#2E7D32' }}>Pontos Fortes</Text>
              </View>
              {(c.perfil_comportamental?.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p: any, i: number) => (
                <Text key={i} style={s.pontosItem}>+ {p}</Text>
              ))}
            </View>
            <View style={{ ...s.pontosCol, backgroundColor: '#FFF3E0', marginLeft: 5, borderLeftWidth: 4, borderLeftColor: '#E65100' }}>
              <View style={s.pontosHeader}>
                <View style={{ ...s.pontosDot, backgroundColor: '#E65100' }} />
                <Text style={{ ...s.pontosLabel, color: '#E65100' }}>Pontos de Atenção</Text>
              </View>
              {(c.perfil_comportamental?.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p: any, i: number) => (
                <Text key={i} style={s.pontosItem}>! {p}</Text>
              ))}
            </View>
          </View>
        )}

        {/* Resumo de Desempenho — tabela premium */}
        {(c.resumo_desempenho || competencias)?.length > 0 && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Resumo de Desempenho</SectionTitle>
            <View style={tableStyles.table}>
              <View style={tableStyles.headerRow}>
                <Text style={{ ...tableStyles.headerCell, flex: 3 }}>Competência</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 0.7, textAlign: 'center' }}>Nível</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1.3, textAlign: 'center' }}>Status</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1, textAlign: 'center' }}>Desempenho</Text>
              </View>
              {(c.resumo_desempenho || competencias).map((comp: any, i: number) => {
                const nivel = comp.nivel || comp.nivel_atual || 0;
                const nColor = nivelColor(nivel);
                const isFlag = comp.flag || nivel <= 1;
                const rowStyle = isFlag ? s.tableRowFlag : (i % 2 === 0 ? s.tableRow : { ...s.tableRow, backgroundColor: colors.gray100 });
                return (
                  <View key={i} style={rowStyle}>
                    <Text style={{ fontSize: 9, color: isFlag ? colors.flagRed : colors.navy, fontWeight: 'bold', flex: 3 }}>
                      {isFlag ? '[!] ' : ''}{comp.competencia || comp.nome}
                    </Text>
                    <View style={{ flex: 0.7, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 8, fontWeight: 'bold', color: nColor,
                        backgroundColor: nivelBgColor(nivel),
                        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
                      }}>N{nivel}</Text>
                    </View>
                    <View style={{ flex: 1.3, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 7, fontWeight: 'bold', color: nColor,
                        backgroundColor: nivelBgColor(nivel),
                        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3,
                      }}>{nivelLabel(nivel)}</Text>
                    </View>
                    <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
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
              {c.trilha_cursos.map((curso: any, i: number) => (
                <Text key={i} style={s.trilhaItem}>
                  {i + 1}. {curso.nome}{curso.competencia ? ` (${curso.competencia})` : ''}
                </Text>
              ))}
            </View>
          </View>
        )}

        <PageFooter />
      </Page>

      {/* ═══════════════════ COMPET\u00caNCIAS ═══════════════════ */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageBackground />

        {competencias.map((comp: any, idx: number) => (
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
          <PageBackground />
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
