import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, tableStyles, pageStyles, nivelColor, nivelBgColor } from './styles';

function stars(nivel) {
  const n = Math.min(4, Math.max(0, Math.round(nivel || 0)));
  return '*'.repeat(n) + '-'.repeat(4 - n);
}

const s = StyleSheet.create({
  section: { marginBottom: 12 },
  h2: { fontSize: 14, fontWeight: 'bold', color: colors.navy, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.gray200, paddingBottom: 4 },
  text: { fontSize: 10, color: colors.navy, lineHeight: 1.6, marginBottom: 4 },
  textSm: { fontSize: 9, color: colors.navy, lineHeight: 1.4 },
  italic: { fontSize: 10, color: colors.textGray, fontStyle: 'italic', marginBottom: 6, lineHeight: 1.5 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.gray200, marginVertical: 12 },
  coverTitle: { fontSize: 32, fontWeight: 'bold', color: colors.navy, textAlign: 'center', letterSpacing: 4 },
  coverLine: { borderBottomWidth: 2, borderBottomColor: colors.cyan, width: 80, alignSelf: 'center', marginTop: 12 },
  coverSub: { fontSize: 14, color: colors.gray500, textAlign: 'center', marginTop: 8 },
  coverName: { fontSize: 22, color: colors.navy, textAlign: 'center', marginTop: 40, fontWeight: 'bold' },
  coverCargo: { fontSize: 12, color: colors.gray500, textAlign: 'center', marginTop: 4 },
  coverDate: { fontSize: 10, color: colors.gray400, textAlign: 'center', marginTop: 40 },
  perfilBox: { backgroundColor: colors.perfilBg, borderRadius: 4, padding: 12, marginBottom: 10 },
  twoCol: { flexDirection: 'row', marginBottom: 8 },
  fezBemCol: { flex: 1, backgroundColor: colors.fezBemBg, padding: 8, marginRight: 3, borderRadius: 3, borderWidth: 0.5, borderColor: colors.borderLight },
  melhorarCol: { flex: 1, backgroundColor: colors.melhorarBg, padding: 8, marginLeft: 3, borderRadius: 3, borderWidth: 0.5, borderColor: colors.borderLight },
  colTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 4 },
  colItem: { fontSize: 9, color: colors.navy, marginBottom: 2 },
  descritorBox: { backgroundColor: colors.descritorBg, borderRadius: 4, padding: 10, marginBottom: 8 },
  descritorTitle: { fontSize: 10, fontWeight: 'bold', color: colors.descritorTitle, marginBottom: 4 },
  planoBox: { backgroundColor: colors.planoBg, borderRadius: 4, padding: 10, marginBottom: 8 },
  semanaTitle: { fontSize: 9, fontWeight: 'bold', color: colors.navy, marginBottom: 2, marginTop: 4 },
  dicaBox: { marginBottom: 6 },
  dicaTitle: { fontSize: 10, fontWeight: 'bold', color: colors.teal, marginBottom: 3 },
  estudoItem: { fontSize: 9, color: colors.linkBlue, marginBottom: 2, marginLeft: 8 },
  checklistHeader: { backgroundColor: colors.navy, padding: 6, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  checklistHeaderText: { fontSize: 9, fontWeight: 'bold', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 1 },
  checkItem: { fontSize: 10, color: colors.navy, paddingVertical: 4, paddingHorizontal: 10 },
  checkItemAlt: { fontSize: 10, color: colors.navy, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: colors.checklistBg },
  compTitle: { fontSize: 13, fontWeight: 'bold', color: colors.navy, marginBottom: 2 },
  compTitleFlag: { fontSize: 13, fontWeight: 'bold', color: colors.flagRed, marginBottom: 2 },
  starsText: { fontSize: 14, letterSpacing: 2, marginLeft: 8 },
});

export default function RelatorioIndividualPDF({ data, empresaNome }) {
  const c = data.conteudo;
  if (!c) return null;

  return (
    <Document>
      {/* CAPA */}
      <Page size="A4" style={pageStyles.page}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Image src="/logo-vertho.png" style={{ width: 80, height: 80, alignSelf: 'center', marginBottom: 12 }} />
          <Text style={s.coverTitle}>VERTHO</Text>
          <View style={s.coverLine} />
          <Text style={s.coverSub}>Plano de Desenvolvimento Individual</Text>
          <Text style={s.coverName}>{data.colaborador_nome}</Text>
          <Text style={s.coverCargo}>{data.colaborador_cargo}</Text>
          <Text style={s.coverCargo}>{empresaNome}</Text>
          <Text style={s.coverDate}>{new Date(data.gerado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
        </View>
        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA - Confidencial</Text></View>
      </Page>

      {/* PERFIL + RESUMO */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}><Text style={pageStyles.headerTitle}>VERTHO</Text><Text style={pageStyles.headerDate}>{data.colaborador_nome}</Text></View>

        {c.acolhimento && <Text style={s.italic}>{c.acolhimento}</Text>}

        {c.resumo_geral && (
          <View style={s.section}><Text style={s.h2}>Resumo Geral</Text><Text style={s.text}>{c.resumo_geral}</Text></View>
        )}

        {(c.perfil_comportamental || c.perfil_disc) && (
          <View style={s.section}>
            <Text style={s.h2}>Perfil Comportamental</Text>
            <View style={s.perfilBox}>
              <Text style={s.text}>{c.perfil_comportamental?.descricao || c.perfil_disc?.descricao}</Text>
            </View>
            <View style={s.twoCol}>
              <View style={s.fezBemCol}>
                <Text style={s.colTitle}>Pontos Fortes</Text>
                {(c.perfil_comportamental?.pontos_forca || c.perfil_disc?.pontos_forca)?.map((p, i) => <Text key={i} style={s.colItem}>+ {p}</Text>)}
              </View>
              <View style={s.melhorarCol}>
                <Text style={s.colTitle}>Pontos de Atencao</Text>
                {(c.perfil_comportamental?.pontos_atencao || c.perfil_disc?.pontos_atencao)?.map((p, i) => <Text key={i} style={s.colItem}>! {p}</Text>)}
              </View>
            </View>
          </View>
        )}

        {/* Resumo de desempenho */}
        {(c.resumo_desempenho || c.competencias)?.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2}>Resumo de Desempenho</Text>
            <View style={tableStyles.table}>
              <View style={tableStyles.headerRow}>
                <Text style={{ ...tableStyles.headerCell, flex: 3 }}>Competencia</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1, textAlign: 'center' }}>Nivel</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1.5, textAlign: 'center' }}>Desempenho</Text>
              </View>
              {(c.resumo_desempenho || c.competencias).map((comp, i) => {
                const nivel = comp.nivel || comp.nivel_atual || 0;
                return (
                  <View key={i} style={i % 2 === 0 ? tableStyles.row : tableStyles.rowAlt}>
                    <Text style={{ ...tableStyles.cellBold, flex: 3 }}>{comp.flag ? '[!] ' : ''}{comp.competencia || comp.nome}</Text>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{ fontSize: 9, fontWeight: 'bold', color: nivelColor(nivel), backgroundColor: nivelBgColor(nivel), paddingHorizontal: 6, paddingVertical: 1, borderRadius: 2 }}>N{nivel}</Text>
                    </View>
                    <Text style={{ ...tableStyles.cell, flex: 1.5, textAlign: 'center', letterSpacing: 2 }}>{stars(nivel)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA - Confidencial</Text></View>
      </Page>

      {/* COMPETENCIAS DETALHADAS COM PDI */}
      {c.competencias?.map((comp, idx) => {
        const nivel = comp.nivel || comp.nivel_atual || 0;
        const isFlag = comp.flag || nivel <= 1;

        return (
          <Page key={idx} size="A4" style={pageStyles.page}>
            <View style={pageStyles.header}><Text style={pageStyles.headerTitle}>VERTHO</Text><Text style={pageStyles.headerDate}>PDI - {idx + 1}/{c.competencias.length}</Text></View>

            {/* Titulo */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <Text style={isFlag ? s.compTitleFlag : s.compTitle}>{isFlag ? '[!] ' : ''}{comp.nome}</Text>
              <Text style={{ ...s.starsText, color: nivelColor(nivel) }}>{stars(nivel)}</Text>
            </View>

            {/* Descritores em desenvolvimento */}
            {comp.descritores_desenvolvimento?.length > 0 && (
              <View style={s.descritorBox}>
                <Text style={s.descritorTitle}>Descritores em Desenvolvimento</Text>
                {comp.descritores_desenvolvimento.map((d, i) => <Text key={i} style={{ fontSize: 9, color: colors.navy, marginLeft: 8, marginBottom: 2 }}>- {d}</Text>)}
              </View>
            )}

            {/* Fez Bem / Melhorar */}
            <View style={s.twoCol}>
              <View style={s.fezBemCol}>
                <Text style={s.colTitle}>FEZ BEM</Text>
                {comp.fez_bem?.map((e, j) => <Text key={j} style={s.colItem}>- {e}</Text>)}
                {!comp.fez_bem?.length && <Text style={s.colItem}>-</Text>}
              </View>
              <View style={s.melhorarCol}>
                <Text style={s.colTitle}>MELHORAR</Text>
                {comp.melhorar?.map((e, j) => <Text key={j} style={s.colItem}>- {e}</Text>)}
                {!comp.melhorar?.length && <Text style={s.colItem}>-</Text>}
              </View>
            </View>

            {/* Feedback */}
            {comp.feedback && <Text style={s.text}>{comp.feedback}</Text>}

            {/* Plano 30 dias */}
            {comp.plano_30_dias && (
              <View style={s.planoBox}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 6 }}>Plano de Desenvolvimento - 30 Dias</Text>
                {['semana_1', 'semana_2', 'semana_3', 'semana_4'].map((sem, si) => {
                  const semana = comp.plano_30_dias[sem];
                  if (!semana) return null;
                  return (
                    <View key={si}>
                      <Text style={s.semanaTitle}>Semana {si + 1}: {semana.foco}</Text>
                      {semana.acoes?.map((a, ai) => <Text key={ai} style={{ fontSize: 9, color: colors.navy, marginLeft: 12, marginBottom: 1 }}>- {a}</Text>)}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Dicas */}
            {comp.dicas_desenvolvimento?.length > 0 && (
              <View style={s.dicaBox}>
                <Text style={s.dicaTitle}>Dicas de Desenvolvimento</Text>
                {comp.dicas_desenvolvimento.map((d, i) => <Text key={i} style={{ fontSize: 9, color: colors.navy, marginLeft: 8, marginBottom: 2 }}>- {d}</Text>)}
              </View>
            )}

            {/* Estudo recomendado */}
            {comp.estudo_recomendado?.length > 0 && (
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 3 }}>Estudo Recomendado</Text>
                {comp.estudo_recomendado.map((e, i) => <Text key={i} style={s.estudoItem}>- {e}</Text>)}
              </View>
            )}

            {/* Checklist tatico */}
            {comp.checklist_tatico?.length > 0 && (
              <View>
                <View style={s.checklistHeader}><Text style={s.checklistHeaderText}>CHECKLIST TATICO</Text></View>
                {comp.checklist_tatico.map((item, i) => (
                  <Text key={i} style={i % 2 === 0 ? s.checkItem : s.checkItemAlt}>[ ] {item}</Text>
                ))}
              </View>
            )}

            <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA - Confidencial</Text></View>
          </Page>
        );
      })}

      {/* MENSAGEM FINAL */}
      {c.mensagem_final && (
        <Page size="A4" style={pageStyles.page}>
          <View style={pageStyles.header}><Text style={pageStyles.headerTitle}>VERTHO</Text><Text style={pageStyles.headerDate}>PDI</Text></View>
          <View style={s.divider} />
          <Text style={s.italic}>{c.mensagem_final}</Text>
          <View style={pageStyles.footer}><Text style={pageStyles.footerText}>Vertho Mentor IA - Confidencial</Text></View>
        </Page>
      )}
    </Document>
  );
}
