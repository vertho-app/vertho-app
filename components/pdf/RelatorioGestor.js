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
  coverTitle: { fontSize: 28, fontWeight: 'bold', color: colors.navy, textAlign: 'center', marginBottom: 8 },
  coverSubtitle: { fontSize: 14, color: colors.gray500, textAlign: 'center', marginBottom: 4 },
  coverDate: { fontSize: 10, color: colors.gray400, textAlign: 'center', marginTop: 30 },
  divider: { borderBottomWidth: 0.5, borderBottomColor: colors.gray200, marginVertical: 10 },
  urgentBadge: { fontSize: 8, fontWeight: 'bold', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
  urgente: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  importante: { backgroundColor: '#FEF3C7', color: '#92400E' },
  acompanhar: { backgroundColor: '#E2E8F0', color: '#475569' },
  evolucao: { fontSize: fonts.small, color: '#065F46', marginBottom: 2 },
  actionCard: { backgroundColor: '#F0FDFA', borderRadius: 4, padding: 8, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: colors.teal },
  actionLabel: { fontSize: 8, fontWeight: 'bold', color: colors.gray400, textTransform: 'uppercase', marginBottom: 2 },
  actionTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 2 },
  actionDesc: { fontSize: fonts.small, color: colors.gray600, lineHeight: 1.4 },
  actionImpact: { fontSize: fonts.small, color: colors.teal, marginTop: 2 },
});

export default function RelatorioGestorPDF({ data, empresaNome }) {
  const c = data.conteudo;
  if (!c) return null;

  return (
    <Document>
      {/* Capa */}
      <Page size="A4" style={pageStyles.page}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={s.coverTitle}>VERTHO</Text>
          <Text style={s.coverSubtitle}>Relatório do Gestor</Text>
          <View style={s.divider} />
          <Text style={{ fontSize: 16, color: colors.cyan, textAlign: 'center', marginTop: 20, fontWeight: 'bold' }}>{empresaNome}</Text>
          <Text style={s.coverDate}>{new Date(data.gerado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
        </View>
        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* Resumo + Evolução */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>Relatório Gestor</Text>
        </View>

        {c.resumo_executivo && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Resumo Executivo</Text>
            <Text style={s.text}>{c.resumo_executivo}</Text>
          </View>
        )}

        {c.destaques_evolucao?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Destaques de Evolução</Text>
            {c.destaques_evolucao.map((d, i) => <Text key={i} style={s.evolucao}>★ {d}</Text>)}
          </View>
        )}

        {/* Ranking de atenção */}
        {(c.ranking_atencao || c.ranking_qualificado)?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Ranking de Atenção</Text>
            <View style={tableStyles.table}>
              <View style={tableStyles.headerRow}>
                <Text style={{ ...tableStyles.headerCell, flex: 1 }}>Urgência</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 2 }}>Colaborador</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 2 }}>Competência</Text>
                <Text style={{ ...tableStyles.headerCell, flex: 1, textAlign: 'center' }}>Nível</Text>
              </View>
              {(c.ranking_atencao || c.ranking_qualificado).map((r, i) => (
                <View key={i} style={i % 2 === 0 ? tableStyles.row : tableStyles.rowAlt}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ ...s.urgentBadge, ...(r.urgencia === 'URGENTE' ? s.urgente : r.urgencia === 'IMPORTANTE' ? s.importante : s.acompanhar) }}>{r.urgencia}</Text>
                  </View>
                  <Text style={{ ...tableStyles.cellBold, flex: 2 }}>{r.nome}</Text>
                  <Text style={{ ...tableStyles.cell, flex: 2 }}>{r.competencia}</Text>
                  <Text style={{ ...tableStyles.cell, flex: 1, textAlign: 'center' }}>N{r.nivel || r.nivel_fase3}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* Análise por competência + DISC + Ações */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>Análise e Ações</Text>
        </View>

        {c.analise_por_competencia?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Análise por Competência</Text>
            {c.analise_por_competencia.map((a, i) => (
              <View key={i} style={s.card} wrap={false}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.navy, marginBottom: 2 }}>{a.competencia} — Média: {a.media_nivel || a.media}</Text>
                <Text style={s.text}>{a.padrao_observado}</Text>
                {a.acao_gestor && <Text style={{ fontSize: fonts.small, color: colors.teal }}>→ {a.acao_gestor}</Text>}
              </View>
            ))}
          </View>
        )}

        {c.perfil_disc_equipe && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Perfil DISC da Equipe</Text>
            <Text style={s.text}>{c.perfil_disc_equipe.descricao}</Text>
            {c.perfil_disc_equipe.forca_coletiva && <Text style={s.textSmall}>Força: {c.perfil_disc_equipe.forca_coletiva}</Text>}
            {c.perfil_disc_equipe.risco_coletivo && <Text style={{ ...s.textSmall, color: '#B45309' }}>Risco: {c.perfil_disc_equipe.risco_coletivo}</Text>}
          </View>
        )}

        {c.acoes && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Plano de Ação</Text>
            {['esta_semana', 'proximas_semanas', 'medio_prazo'].map(k => {
              const a = c.acoes[k];
              if (!a) return null;
              const labels = { esta_semana: 'Esta Semana', proximas_semanas: 'Próximas Semanas', medio_prazo: 'Médio Prazo' };
              return (
                <View key={k} style={s.actionCard}>
                  <Text style={s.actionLabel}>{labels[k]}</Text>
                  <Text style={s.actionTitle}>{a.titulo}</Text>
                  <Text style={s.actionDesc}>{a.descricao}</Text>
                  {a.impacto && <Text style={s.actionImpact}>{a.impacto}</Text>}
                </View>
              );
            })}
          </View>
        )}

        {c.papel_do_gestor && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Papel do Gestor</Text>
            {c.papel_do_gestor.semanal && <Text style={s.text}>Semanal: {c.papel_do_gestor.semanal}</Text>}
            {c.papel_do_gestor.quinzenal && <Text style={s.text}>Quinzenal: {c.papel_do_gestor.quinzenal}</Text>}
            {c.papel_do_gestor.proximo_ciclo && <Text style={s.text}>Próximo ciclo: {c.papel_do_gestor.proximo_ciclo}</Text>}
          </View>
        )}

        {c.mensagem_final && <Text style={s.italic}>{c.mensagem_final}</Text>}

        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>
    </Document>
  );
}
