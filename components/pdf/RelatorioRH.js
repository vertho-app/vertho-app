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
  kpiRow: { flexDirection: 'row', marginBottom: 8 },
  kpiBox: { flex: 1, alignItems: 'center', padding: 8, backgroundColor: colors.gray100, borderRadius: 4, marginHorizontal: 2 },
  kpiValue: { fontSize: 18, fontWeight: 'bold', color: colors.navy },
  kpiLabel: { fontSize: 7, color: colors.gray500, textTransform: 'uppercase', marginTop: 2 },
  criticaBadge: { fontSize: 8, fontWeight: 'bold', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
  critica: { backgroundColor: '#FEE2E2', color: '#991B1B' },
  atencao: { backgroundColor: '#FEF3C7', color: '#92400E' },
  estavel: { backgroundColor: '#D1FAE5', color: '#065F46' },
  trainCard: { backgroundColor: '#F0FDFA', borderRadius: 4, padding: 8, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: colors.teal },
  trainTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 2 },
  trainMeta: { fontSize: 8, color: colors.gray500, marginBottom: 2 },
  trainJust: { fontSize: fonts.small, color: colors.gray600 },
  decisionCard: { backgroundColor: '#FFF7ED', borderRadius: 4, padding: 8, marginBottom: 4, borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  actionCard: { backgroundColor: colors.gray100, borderRadius: 4, padding: 8, marginBottom: 4 },
  actionLabel: { fontSize: 8, fontWeight: 'bold', color: colors.gray400, textTransform: 'uppercase', marginBottom: 2 },
  actionTitle: { fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 2 },
});

export default function RelatorioRHPDF({ data, empresaNome }) {
  const c = data.conteudo;
  if (!c) return null;

  return (
    <Document>
      {/* Capa */}
      <Page size="A4" style={pageStyles.page}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={s.coverTitle}>VERTHO</Text>
          <Text style={s.coverSubtitle}>Relatório Consolidado — RH</Text>
          <View style={s.divider} />
          <Text style={{ fontSize: 16, color: colors.cyan, textAlign: 'center', marginTop: 20, fontWeight: 'bold' }}>{empresaNome}</Text>
          <Text style={s.coverDate}>{new Date(data.gerado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</Text>
        </View>
        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* Resumo + Indicadores */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>Relatório RH</Text>
        </View>

        {c.resumo_executivo && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Resumo Executivo</Text>
            <Text style={s.text}>{c.resumo_executivo}</Text>
          </View>
        )}

        {c.indicadores && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Indicadores</Text>
            <View style={s.kpiRow}>
              <View style={s.kpiBox}><Text style={s.kpiValue}>{c.indicadores.total_avaliados || 0}</Text><Text style={s.kpiLabel}>Avaliados</Text></View>
              <View style={s.kpiBox}><Text style={s.kpiValue}>{c.indicadores.total_avaliacoes || 0}</Text><Text style={s.kpiLabel}>Avaliações</Text></View>
              <View style={s.kpiBox}><Text style={{ ...s.kpiValue, color: colors.cyan }}>{c.indicadores.media_geral || 0}</Text><Text style={s.kpiLabel}>Média</Text></View>
            </View>
            <View style={s.kpiRow}>
              <View style={s.kpiBox}><Text style={{ ...s.kpiValue, color: '#991B1B' }}>{c.indicadores.pct_nivel_1 || 0}%</Text><Text style={s.kpiLabel}>N1</Text></View>
              <View style={s.kpiBox}><Text style={{ ...s.kpiValue, color: '#92400E' }}>{c.indicadores.pct_nivel_2 || 0}%</Text><Text style={s.kpiLabel}>N2</Text></View>
              <View style={s.kpiBox}><Text style={{ ...s.kpiValue, color: '#155E75' }}>{c.indicadores.pct_nivel_3 || 0}%</Text><Text style={s.kpiLabel}>N3</Text></View>
              <View style={s.kpiBox}><Text style={{ ...s.kpiValue, color: '#065F46' }}>{c.indicadores.pct_nivel_4 || 0}%</Text><Text style={s.kpiLabel}>N4</Text></View>
            </View>
          </View>
        )}

        {c.comparativo_f1_f3 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Comparativo</Text>
            <Text style={s.text}>{c.comparativo_f1_f3.analise}</Text>
            {c.comparativo_f1_f3.destaque_positivo && <Text style={{ ...s.textSmall, color: '#065F46' }}>+ {c.comparativo_f1_f3.destaque_positivo}</Text>}
            {c.comparativo_f1_f3.destaque_atencao && <Text style={{ ...s.textSmall, color: '#92400E' }}>! {c.comparativo_f1_f3.destaque_atencao}</Text>}
          </View>
        )}

        {c.visao_por_cargo?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Visão por Cargo</Text>
            {c.visao_por_cargo.map((v, i) => (
              <View key={i} style={s.card} wrap={false}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.navy, marginBottom: 2 }}>{v.cargo} — Média: {v.media || '—'}</Text>
                <Text style={s.text}>{v.analise}</Text>
                {v.ponto_forte && <Text style={{ ...s.textSmall, color: '#065F46' }}>+ {v.ponto_forte}</Text>}
                {v.ponto_critico && <Text style={{ ...s.textSmall, color: '#92400E' }}>! {v.ponto_critico}</Text>}
              </View>
            ))}
          </View>
        )}

        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* Competências Críticas + Treinamentos */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>Investimentos e Decisões</Text>
        </View>

        {c.competencias_criticas?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Competências Críticas</Text>
            {c.competencias_criticas.map((comp, i) => (
              <View key={i} style={s.card} wrap={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <Text style={{ ...s.criticaBadge, ...(comp.criticidade === 'CRITICA' ? s.critica : comp.criticidade === 'ATENCAO' ? s.atencao : s.estavel) }}>{comp.criticidade}</Text>
                  <Text style={{ fontSize: 10, fontWeight: 'bold', color: colors.navy, marginLeft: 6 }}>{comp.competencia}</Text>
                </View>
                <Text style={s.text}>{comp.motivo}</Text>
                {comp.impacto && <Text style={{ ...s.textSmall, color: colors.teal }}>{comp.impacto || comp.impacto_alunos}</Text>}
              </View>
            ))}
          </View>
        )}

        {c.treinamentos_sugeridos?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Treinamentos Sugeridos</Text>
            {c.treinamentos_sugeridos.map((t, i) => (
              <View key={i} style={s.trainCard} wrap={false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <Text style={s.trainTitle}>{t.titulo}</Text>
                  <Text style={{ ...s.criticaBadge, marginLeft: 6, ...(t.prioridade === 'URGENTE' ? s.critica : t.prioridade === 'IMPORTANTE' ? s.atencao : s.estavel) }}>{t.prioridade}</Text>
                </View>
                <Text style={s.trainMeta}>{t.publico} · {t.formato} · {t.carga_horaria} · Custo: {t.custo || t.custo_relativo}</Text>
                {t.justificativa && <Text style={s.trainJust}>{t.justificativa}</Text>}
              </View>
            ))}
          </View>
        )}

        {c.perfil_disc_organizacional && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Perfil DISC Organizacional</Text>
            <Text style={s.text}>{c.perfil_disc_organizacional.descricao}</Text>
            {c.perfil_disc_organizacional.implicacao && <Text style={s.textSmall}>{c.perfil_disc_organizacional.implicacao || c.perfil_disc_organizacional.implicacao_pedagogica}</Text>}
          </View>
        )}

        <View style={pageStyles.footer}>
          <Text style={pageStyles.footerText}>Vertho Mentor IA — Confidencial</Text>
        </View>
      </Page>

      {/* Decisões-Chave + Plano de Ação */}
      <Page size="A4" style={pageStyles.page}>
        <View style={pageStyles.header}>
          <Text style={pageStyles.headerTitle}>VERTHO</Text>
          <Text style={pageStyles.headerDate}>Plano de Ação RH</Text>
        </View>

        {c.decisoes_chave?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Decisões-Chave</Text>
            {c.decisoes_chave.map((d, i) => (
              <View key={i} style={s.decisionCard} wrap={false}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: colors.navy, marginBottom: 2 }}>{d.colaborador}</Text>
                <Text style={s.text}>{d.situacao}</Text>
                <Text style={{ ...s.textSmall, color: colors.teal }}>→ {d.acao || d.acao_imediata}</Text>
                {d.criterio_reavaliacao && <Text style={s.textSmall}>Reavaliação: {d.criterio_reavaliacao}</Text>}
                {d.consequencia && <Text style={{ ...s.textSmall, color: '#92400E' }}>Se não evoluir: {d.consequencia}</Text>}
              </View>
            ))}
          </View>
        )}

        {c.plano_acao && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Plano de Ação</Text>
            {['curto_prazo', 'medio_prazo', 'longo_prazo'].map(k => {
              const a = c.plano_acao[k];
              if (!a) return null;
              const labels = { curto_prazo: 'Curto Prazo (2 semanas)', medio_prazo: 'Médio Prazo (1-2 meses)', longo_prazo: 'Longo Prazo (próximo semestre)' };
              return (
                <View key={k} style={s.actionCard}>
                  <Text style={s.actionLabel}>{labels[k]}</Text>
                  <Text style={s.actionTitle}>{a.titulo}</Text>
                  <Text style={{ fontSize: fonts.small, color: colors.gray600 }}>{a.descricao}</Text>
                  {a.impacto && <Text style={{ fontSize: fonts.small, color: colors.teal, marginTop: 2 }}>{a.impacto}</Text>}
                </View>
              );
            })}
          </View>
        )}

        {c.mensagem_final && (
          <View style={{ ...s.section, marginTop: 10 }}>
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
