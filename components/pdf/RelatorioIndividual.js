import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles, estrelas, nivelColor, nivelBgColor } from './styles';

const s = StyleSheet.create({
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: fonts.heading3, fontWeight: 'bold', color: colors.navy, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.gray200, paddingBottom: 4 },
  text: { fontSize: fonts.body, color: colors.gray700, lineHeight: 1.6, marginBottom: 4 },
  textSmall: { fontSize: fonts.small, color: colors.gray500, lineHeight: 1.4 },
  italic: { fontSize: fonts.body, color: colors.textGray, fontStyle: 'italic', marginBottom: 6, lineHeight: 1.5 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.gray200, marginVertical: 12 },

  // Capa
  coverTitle: { fontSize: 32, fontWeight: 'bold', color: colors.navy, textAlign: 'center', letterSpacing: 4 },
  coverSubtitle: { fontSize: 14, color: colors.gray500, textAlign: 'center', marginTop: 8 },
  coverName: { fontSize: 22, color: colors.navy, textAlign: 'center', marginTop: 40, fontWeight: 'bold' },
  coverCargo: { fontSize: 12, color: colors.gray500, textAlign: 'center', marginTop: 4 },
  coverDate: { fontSize: 10, color: colors.gray400, textAlign: 'center', marginTop: 40 },
  coverLine: { borderBottomWidth: 2, borderBottomColor: colors.cyan, width: 80, alignSelf: 'center', marginTop: 12 },

  // Perfil comportamental
  perfilBox: { backgroundColor: colors.perfilBg, borderRadius: 4, padding: 12, marginBottom: 10 },
  perfilLabel: { fontSize: 8, fontWeight: 'bold', color: colors.navy, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },

  // Competência card
  compTitle: { fontSize: fonts.heading3, fontWeight: 'bold', color: colors.navy, marginBottom: 2 },
  compTitleFlag: { fontSize: fonts.heading3, fontWeight: 'bold', color: colors.flagRed, marginBottom: 2 },
  compDesc: { fontSize: fonts.small, color: colors.textGray, fontStyle: 'italic', marginBottom: 6 },
  starsText: { fontSize: 14, letterSpacing: 2, marginLeft: 8 },

  // Descritores
  descritorBox: { backgroundColor: colors.descritorBg, borderRadius: 4, padding: 10, marginBottom: 8 },
  descritorTitle: { fontSize: 10, fontWeight: 'bold', color: colors.descritorTitle, marginBottom: 4 },
  descritorItem: { fontSize: fonts.small, color: colors.navy, marginLeft: 8, marginBottom: 2 },

  // Fez Bem / Melhorar
  twoCol: { flexDirection: 'row', marginBottom: 8 },
  fezBemCol: { flex: 1, backgroundColor: colors.fezBemBg, padding: 8, marginRight: 3, borderRadius: 3, borderWidth: 0.5, borderColor: colors.borderLight },
  melhorarCol: { flex: 1, backgroundColor: colors.melhorarBg, padding: 8, marginLeft: 3, borderRadius: 3, borderWidth: 0.5, borderColor: colors.borderLight },
  colTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 4 },
  colItem: { fontSize: fonts.small, color: colors.navy, marginBottom: 2 },

  // Plano 30 dias
  planoBox: { backgroundColor: colors.planoBg, borderRadius: 4, padding: 10, marginBottom: 8 },
  planoTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 6 },
  semanaTitle: { fontSize: 9, fontWeight: 'bold', color: colors.navy, marginBottom: 2, marginTop: 4 },

  // Checklist
  checklistHeader: { backgroundColor: colors.navy, padding: 6, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  checklistHeaderText: { fontSize: 9, fontWeight: 'bold', color: colors.white, textTransform: 'uppercase', letterSpacing: 1 },
  checkItem: { fontSize: fonts.body, color: colors.navy, paddingVertical: 4, paddingHorizontal: 10 },
  checkItemAlt: { fontSize: fonts.body, color: colors.navy, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: colors.checklistBg },

  // Steps
  stepCard: { borderLeftWidth: 3, borderLeftColor: colors.teal, backgroundColor: colors.planoBg, borderRadius: 3, padding: 8, marginBottom: 4 },
  stepComp: { fontSize: 9, fontWeight: 'bold', color: colors.teal, marginBottom: 2 },
  stepText: { fontSize: fonts.small, color: colors.gray700, lineHeight: 1.5 },
});

export default function RelatorioIndividualPDF({ data, empresaNome }) {
  const c = data.conteudo;
  if (!c) return null;

  return (
    <Document>
      {/* ═══ CAPA ═══ */}
      <Page size="A4" style={pageStyles.page}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={s.coverTitle}>VERTHO</Text>
          <View style={s.coverLine} />
          <Text style={s.coverSubtitle}>Relatório Individual de Competências</Text>
          <Text style={s.coverName}>{data.colaborador_nome}</Text>
          <Text style={s.coverCargo}>{data.colaborador_cargo}</Text>
          <Text style={s.coverCargo}>{empresaNome}</Text>
          <Text style={s.coverDate}>{new Date(data.gerado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
        </View>
        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* ═══ PERFIL + RESUMO ═══ */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>{data.colaborador_nome}</Text>
        </View>

        {c.acolhimento && <Text style={s.italic}>{c.acolhimento}</Text>}

        {c.resumo_geral && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Resumo Geral</Text>
            <Text style={s.text}>{c.resumo_geral}</Text>
          </View>
        )}

        {/* Perfil Comportamental */}
        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Perfil Comportamental</Text>
            <View style={s.perfilBox}>
              <Text style={s.text}>{c.perfil_comportamental?.descricao || c.perfil_disc?.descricao}</Text>
            </View>
            <View style={s.twoCol}>
              <View style={s.fezBemCol}>
                <Text style={s.colTitle}>Pontos Fortes</Text>
                {(c.perfil_comportamental?.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p, i) => (
                  <Text key={i} style={s.colItem}>+ {p}</Text>
                ))}
              </View>
              <View style={s.melhorarCol}>
                <Text style={s.colTitle}>Pontos de Atenção</Text>
                {(c.perfil_comportamental?.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p, i) => (
                  <Text key={i} style={s.colItem}>! {p}</Text>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Resumo de desempenho (tabela com estrelas) */}
        {c.competencias?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Resumo de Desempenho</Text>
            <View style={tableStyles.table}>
              <View style={tableStyles.headerRow}>
                <Text style={{ ...tableStyles.headerCell, flex: 3 }}>Competência</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1, textAlign: 'center' }}>Nível</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1.5, textAlign: 'center' }}>Desempenho</Text>
              </View>
              {c.competencias.map((comp, i) => {
                const nivel = comp.nivel || comp.nivel_atual || 0;
                return (
                  <View key={i} style={i % 2 === 0 ? tableStyles.row : tableStyles.rowAlt}>
                    <Text style={{ ...tableStyles.cellBold, flex: 3 }}>{comp.nome}</Text>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: nivelColor(nivel), backgroundColor: nivelBgColor(nivel), paddingHorizontal: 6, paddingVertical: 1, borderRadius: 2 }}>N{nivel}</Text>
                    </View>
                    <Text style={{ ...tableStyles.cell, flex: 1.5, textAlign: 'center', letterSpacing: 2 }}>{estrelas(nivel)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* ═══ COMPETÊNCIAS DETALHADAS ═══ */}
      {c.competencias?.map((comp, idx) => {
        const nivel = comp.nivel || comp.nivel_atual || 0;
        const isFlag = nivel <= 1;
        const fortes = comp.evidencias_destaque?.filter((_, i) => i < 3) || [];
        const gap = comp.lacuna_principal;

        return (
          <Page key={idx} size="A4" style={pageStyles.page}>
            <View style={pageStyles.header}>
              <Text style={pageStyles.headerTitle}>VERTHO</Text>
              <Text style={pageStyles.headerDate}>Competência {idx + 1}/{c.competencias.length}</Text>
            </View>

            {/* Título competência */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              {isFlag && <Text style={{ fontSize: 14, marginRight: 4 }}>🚩</Text>}
              <Text style={isFlag ? s.compTitleFlag : s.compTitle}>{comp.nome}</Text>
              <Text style={{ ...s.starsText, color: nivelColor(nivel) }}>{estrelas(nivel)}</Text>
            </View>

            {/* Análise */}
            {comp.analise && <Text style={s.text}>{comp.analise}</Text>}

            {/* Fez Bem / Melhorar */}
            <View style={s.twoCol}>
              <View style={s.fezBemCol}>
                <Text style={s.colTitle}>✅ Fez Bem</Text>
                {fortes.map((e, j) => <Text key={j} style={s.colItem}>▸ {e}</Text>)}
                {!fortes.length && <Text style={s.colItem}>—</Text>}
              </View>
              <View style={s.melhorarCol}>
                <Text style={s.colTitle}>⚠️ Melhorar</Text>
                {gap ? <Text style={s.colItem}>▸ {gap}</Text> : <Text style={s.colItem}>—</Text>}
              </View>
            </View>

            {/* Feedback */}
            {(comp.acao_pratica || comp.script_pratico || comp.recomendacao) && (
              <View style={s.section}>
                <Text style={{ ...s.descritorTitle, color: colors.teal }}>🚀 Recomendações</Text>
                {comp.acao_pratica && <Text style={s.text}>→ {comp.acao_pratica}</Text>}
                {comp.script_pratico && <Text style={s.text}>→ {comp.script_pratico}</Text>}
                {comp.recomendacao && <Text style={s.textSmall}>{comp.recomendacao}</Text>}
                {comp.impacto_alunos && <Text style={{ ...s.textSmall, color: colors.teal }}>{comp.impacto_alunos}</Text>}
              </View>
            )}

            <View style={pageStyles.footer}>
              <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
              <Text style={pageStyles.footerText}>Página {idx + 3}</Text>
            </View>
          </Page>
        );
      })}

      {/* ═══ PLANO DE DESENVOLVIMENTO ═══ */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>Plano de Desenvolvimento</Text>
        </View>

        {c.proximos_passos && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>📅 Próximos Passos</Text>
            {(Array.isArray(c.proximos_passos) ? c.proximos_passos : Object.values(c.proximos_passos).filter(p => p?.competencia)).map((p, i) => (
              <View key={i} style={s.stepCard}>
                <Text style={s.stepComp}>Prioridade {i + 1}: {p.competencia} — {p.prazo}</Text>
                <Text style={s.stepText}>{p.meta_primeira_pessoa}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Checklist tático */}
        {c.competencias?.length > 0 && (
          <View style={s.section}>
            <View style={s.checklistHeader}>
              <Text style={s.checklistHeaderText}>⚡ Checklist Tático</Text>
            </View>
            {c.competencias.filter(comp => comp.acao_pratica || comp.script_pratico).map((comp, i) => (
              <Text key={i} style={i % 2 === 0 ? s.checkItem : s.checkItemAlt}>
                ☐ {comp.nome}: {comp.acao_pratica || comp.script_pratico}
              </Text>
            ))}
          </View>
        )}

        {c.mensagem_final && (
          <View style={{ marginTop: 16 }}>
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
