import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles, nivelColor, nivelBgColor, nivelLabel } from './styles';
import PdfCover, { PdfBackCover } from './PdfCover';
import { SectionTitle } from './SectionTitle';
import { LevelDots } from './StatusBadge';
import CompetencyBlock from './CompetencyBlock';

const s = StyleSheet.create({
  text: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.65, marginBottom: 4 },
  italic: { fontSize: fonts.body, color: colors.textMuted, fontStyle: 'italic', lineHeight: 1.6, marginBottom: 10 },
  section: { marginBottom: 14 },
  // Perfil — texto introdutório (azul claro itálico)
  perfilText: {
    backgroundColor: colors.perfilBg,
    borderWidth: 0.5, borderColor: colors.perfilBorder,
    borderRadius: 3, padding: 12, marginBottom: 12,
    fontSize: 9, color: colors.blueText, lineHeight: 1.7, fontStyle: 'italic',
  },
  // Pontos fortes / atenção (mesmo padrão do CompetencyBlock)
  pontosRow: { flexDirection: 'row', marginBottom: 12, gap: 6 },
  pontosCol: {
    flex: 1, padding: 10, borderRadius: 3,
    borderWidth: 0.5,
  },
  pontosLabel: { fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  pontosItemRow: { flexDirection: 'row', marginBottom: 2 },
  pontosPrefix: { fontSize: 9, fontWeight: 700, width: 12 },
  pontosItemText: { fontSize: 8.5, flex: 1, lineHeight: 1.6 },
  // Tabela resumo de desempenho
  table: { width: '100%', marginBottom: 12 },
  tableHead: {
    flexDirection: 'row', backgroundColor: colors.navy,
    paddingVertical: 6, paddingHorizontal: 8,
    borderTopLeftRadius: 3, borderTopRightRadius: 3,
  },
  tableHeadCell: {
    color: colors.white, fontSize: 7.5, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8,
    borderBottomWidth: 0.3, borderBottomColor: colors.borderLight, alignItems: 'center',
  },
  tableRowAlt: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8,
    borderBottomWidth: 0.3, borderBottomColor: colors.borderLight, alignItems: 'center',
    backgroundColor: colors.gray100,
  },
  tableCellComp: { fontSize: 8.5, fontWeight: 600, color: colors.navy },
  // Tag nivel da tabela
  nivelTag: {
    backgroundColor: colors.navy, alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  nivelTagText: { fontSize: 7, fontWeight: 700, color: colors.cyan },
  // Status pills
  statusPillAtencao: {
    backgroundColor: '#FEE2E2', alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  statusPillAtencaoText: { fontSize: 7, fontWeight: 600, color: '#B91C1C' },
  statusPillDev: {
    backgroundColor: '#FEF9C3', alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  statusPillDevText: { fontSize: 7, fontWeight: 600, color: '#A16207' },
  statusPillBom: {
    backgroundColor: '#D1FAE5', alignSelf: 'flex-start',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2,
  },
  statusPillBomText: { fontSize: 7, fontWeight: 600, color: '#065F46' },
  // Progress bar
  progWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progBar: { width: 60, height: 5, backgroundColor: '#E2E8F0', borderRadius: 2.5, overflow: 'hidden' },
  progFill: { height: '100%' },
  progLabel: { fontSize: 7, color: colors.gray500, fontWeight: 600 },
  // Trilha
  trilhaBox: {
    backgroundColor: colors.fezBemBg,
    borderWidth: 0.5, borderColor: colors.fezBemBorder,
    borderRadius: 3, padding: 10, marginBottom: 12,
  },
  trilhaLabel: { fontSize: 8, fontWeight: 700, color: colors.green, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  trilhaItem: { fontSize: 8.5, color: colors.greenText, marginBottom: 2, lineHeight: 1.5 },
  // Competency divider
  compDivider: { borderBottomWidth: 0.5, borderBottomColor: colors.borderLight, marginTop: 14, marginBottom: 14 },
  // Mensagem final
  finalBox: {
    backgroundColor: colors.navy, borderRadius: 4, padding: 22,
    marginTop: 24,
  },
  finalLabel: { fontSize: 8, fontWeight: 700, color: colors.cyan, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 },
  finalText: { fontSize: 10, color: colors.white, lineHeight: 1.8, fontStyle: 'italic', opacity: 0.9 },
});

// ── Fixed Header navy ───────────────────────────────────────────────────────
function PageHeader({ logoBase64, label }: { logoBase64?: string; label: string }) {
  return (
    <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>{label}</Text>
    </View>
  );
}

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

// ── Status pill helper ──────────────────────────────────────────────────────
function StatusPill({ nivel }: { nivel: number }) {
  if (nivel <= 1) return (
    <View style={s.statusPillAtencao}><Text style={s.statusPillAtencaoText}>Atenção</Text></View>
  );
  if (nivel === 2) return (
    <View style={s.statusPillDev}><Text style={s.statusPillDevText}>Em Desenvolvimento</Text></View>
  );
  return <View style={s.statusPillBom}><Text style={s.statusPillBomText}>{nivelLabel(nivel)}</Text></View>;
}

function ProgressBar({ nivel }: { nivel: number }) {
  const pct = Math.min(100, Math.max(0, (nivel / 4) * 100));
  const fillColor = nivel <= 1 ? '#EF4444' : nivel === 2 ? '#F59E0B' : nivel === 3 ? '#06B6D4' : '#10B981';
  return (
    <View style={s.progWrap}>
      <View style={s.progBar}>
        <View style={{ ...s.progFill, width: `${pct}%`, backgroundColor: fillColor }} />
      </View>
      <Text style={s.progLabel}>{Math.round(pct)}%</Text>
    </View>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function RelatorioIndividualPDF({ data, empresaNome, logoBase64 }: { data: any; empresaNome?: string; logoBase64?: string }) {
  const c = data.conteudo;
  if (!c) return null;

  const competencias = c.competencias || [];
  const nome = data.colaborador_nome || '';
  const headerLabel = `Plano de Desenvolvimento Individual${nome ? ` · ${(nome.split(' ')[0]) || nome}` : ''}`;

  return (
    <Document title={`PDI - ${nome}`}>
      {/* ═══════════════════ CAPA NAVY ═══════════════════ */}
      <PdfCover
        logoBase64={logoBase64}
        nome={nome}
        cargo={data.colaborador_cargo}
        empresa={empresaNome}
        data={data.gerado_em}
      />

      {/* ═══════════════════ PERFIL + RESUMO DE DESEMPENHO ═══════════════════ */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={headerLabel} />

        {/* Acolhimento (texto de abertura) */}
        {c.acolhimento && <Text style={s.italic}>{c.acolhimento}</Text>}

        {/* Perfil Comportamental — texto introdutório em azul claro */}
        {c.perfil_comportamental && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Perfil Comportamental</SectionTitle>
            <Text style={s.perfilText}>{c.perfil_comportamental.descricao}</Text>
          </View>
        )}

        {/* Pontos Fortes / Pontos de Atenção */}
        {c.perfil_comportamental && (
          <View style={s.pontosRow} wrap={false}>
            <View style={{ ...s.pontosCol, backgroundColor: colors.fezBemBg, borderColor: colors.fezBemBorder }}>
              <Text style={{ ...s.pontosLabel, color: colors.green }}>Pontos Fortes</Text>
              {c.perfil_comportamental.pontos_forca?.map((p: any, i: number) => (
                <View key={i} style={s.pontosItemRow}>
                  <Text style={{ ...s.pontosPrefix, color: colors.green }}>+</Text>
                  <Text style={{ ...s.pontosItemText, color: colors.greenText }}>{p}</Text>
                </View>
              ))}
            </View>
            <View style={{ ...s.pontosCol, backgroundColor: colors.melhorarBg, borderColor: colors.melhorarBorder }}>
              <Text style={{ ...s.pontosLabel, color: colors.orange }}>Pontos de Atenção</Text>
              {c.perfil_comportamental.pontos_atencao?.map((p: any, i: number) => (
                <View key={i} style={s.pontosItemRow}>
                  <Text style={{ ...s.pontosPrefix, color: colors.orange }}>!</Text>
                  <Text style={{ ...s.pontosItemText, color: colors.orangeText }}>{p}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Resumo de Desempenho — tabela premium navy */}
        {(c.resumo_desempenho || competencias)?.length > 0 && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Resumo de Desempenho</SectionTitle>
            <View style={s.table}>
              <View style={s.tableHead}>
                <Text style={{ ...s.tableHeadCell, flex: 3 }}>Competência</Text>
                <Text style={{ ...s.tableHeadCell, flex: 0.8, textAlign: 'center' }}>Nível</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1.4, textAlign: 'center' }}>Status</Text>
                <Text style={{ ...s.tableHeadCell, flex: 1.4, textAlign: 'center' }}>Desempenho</Text>
              </View>
              {(c.resumo_desempenho || competencias).map((comp: any, i: number) => {
                const nivel = comp.nivel || comp.nivel_atual || 0;
                const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt;
                return (
                  <View key={i} style={rowStyle}>
                    <Text style={{ ...s.tableCellComp, flex: 3 }}>
                      {comp.competencia || comp.nome}
                    </Text>
                    <View style={{ flex: 0.8, alignItems: 'center' }}>
                      <View style={s.nivelTag}>
                        <Text style={s.nivelTagText}>N{nivel}</Text>
                      </View>
                    </View>
                    <View style={{ flex: 1.4, alignItems: 'center' }}>
                      <StatusPill nivel={nivel} />
                    </View>
                    <View style={{ flex: 1.4, alignItems: 'center' }}>
                      <ProgressBar nivel={nivel} />
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

      {/* ═══════════════════ COMPETÊNCIAS — uma página por competência ═══════════════════ */}
      {competencias.map((comp: any, idx: number) => (
        <Page key={idx} size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={`Competência ${idx + 1} de ${competencias.length}`} />
          <CompetencyBlock comp={comp} index={idx} total={competencias.length} />
          <PageFooter />
        </Page>
      ))}

      {/* ═══════════════════ MENSAGEM FINAL (navy box) ═══════════════════ */}
      {c.mensagem_final && (
        <Page size="A4" style={pageStyles.page}>
          <PageHeader logoBase64={logoBase64} label={headerLabel} />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={s.finalBox}>
              <Text style={s.finalLabel}>Mensagem Final</Text>
              <Text style={s.finalText}>{c.mensagem_final}</Text>
            </View>
          </View>
          <PageFooter />
        </Page>
      )}

      {/* ═══════════════════ CONTRACAPA NAVY ═══════════════════ */}
      <PdfBackCover logoBase64={logoBase64} />
    </Document>
  );
}
