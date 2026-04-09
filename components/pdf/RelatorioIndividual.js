import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles } from './styles';

const s = StyleSheet.create({
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: colors.cyan, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  text: { fontSize: fonts.body, color: colors.gray700, lineHeight: 1.5, marginBottom: 4 },
  textSmall: { fontSize: fonts.small, color: colors.gray500, lineHeight: 1.4 },
  italic: { fontSize: fonts.body, color: colors.gray600, fontStyle: 'italic', marginBottom: 4 },
  card: { backgroundColor: colors.gray100, borderRadius: 4, padding: 10, marginBottom: 6 },
  compHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  compName: { fontSize: 11, fontWeight: 'bold', color: colors.navy, flex: 1 },
  nivelBadge: { fontSize: 10, fontWeight: 'bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3 },
  green: { backgroundColor: '#D1FAE5', color: '#065F46' },
  cyan: { backgroundColor: '#CFFAFE', color: '#155E75' },
  amber: { backgroundColor: '#FEF3C7', color: '#92400E' },
  red: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  bullet: { fontSize: fonts.small, color: colors.gray600, marginLeft: 8, marginBottom: 2 },
  gap: { fontSize: fonts.small, color: '#B45309', marginTop: 2 },
  action: { fontSize: fonts.small, color: colors.teal, marginTop: 2 },
  stepCard: { backgroundColor: '#F0FDFA', borderRadius: 4, padding: 8, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: colors.teal },
  stepComp: { fontSize: 9, fontWeight: 'bold', color: colors.teal, marginBottom: 2 },
  stepText: { fontSize: fonts.small, color: colors.gray700, lineHeight: 1.4 },
  coverTitle: { fontSize: 28, fontWeight: 'bold', color: colors.navy, textAlign: 'center', marginBottom: 8 },
  coverSubtitle: { fontSize: 14, color: colors.gray500, textAlign: 'center', marginBottom: 4 },
  coverName: { fontSize: 20, color: colors.cyan, textAlign: 'center', marginTop: 30, fontWeight: 'bold' },
  coverCargo: { fontSize: 12, color: colors.gray500, textAlign: 'center', marginTop: 4 },
  coverDate: { fontSize: 10, color: colors.gray400, textAlign: 'center', marginTop: 30 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: colors.gray200, marginVertical: 10 },
});

function getNivelStyle(nivel) {
  if (nivel >= 4) return s.green;
  if (nivel >= 3) return s.cyan;
  if (nivel >= 2) return s.amber;
  return s.red;
}

export default function RelatorioIndividualPDF({ data, empresaNome }) {
  const c = data.conteudo;
  if (!c) return null;

  return (
    <Document>
      {/* Capa */}
      <Page size="A4" style={pageStyles.page}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={s.coverTitle}>VERTHO</Text>
          <Text style={s.coverSubtitle}>Relatório Individual de Competências</Text>
          <View style={s.divider} />
          <Text style={s.coverName}>{data.colaborador_nome}</Text>
          <Text style={s.coverCargo}>{data.colaborador_cargo}</Text>
          <Text style={s.coverCargo}>{empresaNome}</Text>
          <Text style={s.coverDate}>{new Date(data.gerado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
        </View>
        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* Conteúdo */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>{data.colaborador_nome}</Text>
        </View>

        {c.acolhimento && (
          <View style={s.section}>
            <Text style={s.italic}>{c.acolhimento}</Text>
          </View>
        )}

        {c.resumo_geral && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Resumo Geral</Text>
            <Text style={s.text}>{c.resumo_geral}</Text>
          </View>
        )}

        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Perfil Comportamental</Text>
            <Text style={s.text}>{c.perfil_comportamental?.descricao || c.perfil_disc?.descricao}</Text>
            {(c.perfil_comportamental?.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p, i) => (
              <Text key={i} style={s.bullet}>+ {p}</Text>
            ))}
            {(c.perfil_comportamental?.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p, i) => (
              <Text key={i} style={{ ...s.bullet, color: '#B45309' }}>! {p}</Text>
            ))}
          </View>
        )}

        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* Competências */}
      {c.competencias?.length > 0 && (
        <Page size="A4" style={pageStyles.page}>
          <View style={pageStyles.header}>
            <Text style={pageStyles.headerTitle}>VERTHO</Text>
            <Text style={pageStyles.headerDate}>Competências</Text>
          </View>

          <Text style={s.sectionTitle}>Competências Avaliadas</Text>

          <View style={tableStyles.table}>
            <View style={tableStyles.headerRow}>
              <Text style={{ ...tableStyles.headerCell, flex: 3 }}>Competência</Text>
              <Text style={{ ...tableStyles.headerCell, flex: 1, textAlign: 'center' }}>Nível</Text>
              <Text style={{ ...tableStyles.headerCell, flex: 1, textAlign: 'center' }}>Nota</Text>
            </View>
            {c.competencias.map((comp, i) => (
              <View key={i} style={i % 2 === 0 ? tableStyles.row : tableStyles.rowAlt}>
                <Text style={{ ...tableStyles.cellBold, flex: 3 }}>{comp.nome}</Text>
                <Text style={{ ...tableStyles.cell, flex: 1, textAlign: 'center' }}>N{comp.nivel || comp.nivel_atual || '?'}</Text>
                <Text style={{ ...tableStyles.cell, flex: 1, textAlign: 'center' }}>{comp.nota_decimal ? Number(comp.nota_decimal).toFixed(2) : '—'}</Text>
              </View>
            ))}
          </View>

          {c.competencias.map((comp, i) => (
            <View key={i} style={s.card} wrap={false}>
              <View style={s.compHeader}>
                <Text style={s.compName}>{comp.nome}</Text>
                <Text style={{ ...s.nivelBadge, ...getNivelStyle(comp.nivel || comp.nivel_atual) }}>
                  N{comp.nivel || comp.nivel_atual || '?'}
                </Text>
              </View>
              {comp.analise && <Text style={s.text}>{comp.analise}</Text>}
              {comp.evidencias_destaque?.map((e, j) => <Text key={j} style={s.bullet}>• {e}</Text>)}
              {comp.lacuna_principal && <Text style={s.gap}>Gap: {comp.lacuna_principal}</Text>}
              {(comp.acao_pratica || comp.script_pratico) && <Text style={s.action}>→ {comp.acao_pratica || comp.script_pratico}</Text>}
              {comp.impacto_alunos && <Text style={s.textSmall}>{comp.impacto_alunos}</Text>}
              {comp.recomendacao && <Text style={s.textSmall}>{comp.recomendacao}</Text>}
            </View>
          ))}

          <View style={pageStyles.footer}>
            <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
          </View>
        </Page>
      )}

      {/* Próximos Passos */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>Plano de Desenvolvimento</Text>
        </View>

        {c.proximos_passos && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Próximos Passos</Text>
            {(Array.isArray(c.proximos_passos) ? c.proximos_passos : Object.values(c.proximos_passos).filter(p => p?.competencia)).map((p, i) => (
              <View key={i} style={s.stepCard}>
                <Text style={s.stepComp}>{p.competencia} — {p.prazo}</Text>
                <Text style={s.stepText}>{p.meta_primeira_pessoa}</Text>
              </View>
            ))}
          </View>
        )}

        {c.mensagem_final && (
          <View style={{ ...s.section, marginTop: 20 }}>
            <View style={s.divider} />
            <Text style={s.italic}>{c.mensagem_final}</Text>
          </View>
        )}

        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>
    </Document>
  );
}
