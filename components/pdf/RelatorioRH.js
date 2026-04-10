import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { colors, pageStyles } from './styles';
import PdfCover from './PdfCover';
import PageBackground from './PageBackground';
import { SectionTitle } from './SectionTitle';

const s = StyleSheet.create({
  section: { marginBottom: 14 },
  text: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, lineHeight: 1.6, marginBottom: 4 },
  textIt: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 4, lineHeight: 1.5 },
  h3: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 4, marginTop: 8 },
  box: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, padding: 14, marginBottom: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.gray200, marginVertical: 12 },
  // KPIs
  kpiRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  kpiRowAlt: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', backgroundColor: '#FAFAFA' },
  kpiLabel: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, flex: 1 },
  kpiValue: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, fontWeight: 700, width: 150 },
  // Level bars
  levelBar: { borderRadius: 4, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 4 },
  levelText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600 },
  // Badge
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 6 },
  badgeText: { fontFamily: 'NotoSans', fontSize: 8, fontWeight: 600 },
  // Competências críticas
  critCard: { borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  critHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  critHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  critContent: { paddingVertical: 8, paddingHorizontal: 14 },
  critImpacto: { fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, fontStyle: 'italic', marginTop: 4 },
  // Treinamentos
  trainCard: { borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  trainHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  trainHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  trainContent: { paddingVertical: 8, paddingHorizontal: 14 },
  trainMeta: { fontFamily: 'NotoSans', fontSize: 9, color: colors.textMuted, fontStyle: 'italic', marginBottom: 3 },
  // Decisões
  decCard: { borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  decHeader: { backgroundColor: '#1E1B4B', paddingVertical: 8, paddingHorizontal: 12 },
  decHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  decRow: { paddingVertical: 6, paddingHorizontal: 14 },
  decLabel: { fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: colors.textMuted, marginBottom: 1 },
  // Ações horizonte
  acaoCard: { borderRadius: 6, marginBottom: 6, overflow: 'hidden' },
  acaoHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  acaoHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  acaoContent: { paddingVertical: 8, paddingHorizontal: 14 },
  acaoTitulo: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600, color: colors.textPrimary, marginBottom: 3 },
  // Visão por cargo
  cargoCard: { borderWidth: 1, borderColor: colors.gray200, borderRadius: 6, padding: 10, marginBottom: 8 },
  cargoTitle: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 4 },
  // Highlights
  hlPositive: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#D1FAE5', borderRadius: 6, padding: 8, marginBottom: 4 },
  hlAttention: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 6, padding: 8, marginBottom: 4 },
  hlText: { fontFamily: 'NotoSans', fontSize: 10 },
});

function PageFooter() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{'Vertho Mentor IA \u2014 Confidencial'}</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

const critColors = {
  CRITICA: { bg: '#B91C1C', contentBg: '#FEF2F2' },
  ATENCAO: { bg: '#D97706', contentBg: '#FFFBEB' },
  ESTAVEL: { bg: '#16A34A', contentBg: '#F0FDF4' },
};
const prioColors = {
  URGENTE: { bg: '#B91C1C', contentBg: '#FEF2F2' },
  IMPORTANTE: { bg: '#2563EB', contentBg: '#EFF6FF' },
  DESEJAVEL: { bg: '#16A34A', contentBg: '#F0FDF4' },
};
const acaoHorizontes = [
  { key: 'curto_prazo', label: 'Curto Prazo (2 semanas)', bg: '#B91C1C', contentBg: '#FEF2F2' },
  { key: 'medio_prazo', label: 'M\u00e9dio Prazo (1\u20132 meses)', bg: '#2563EB', contentBg: '#EFF6FF' },
  { key: 'longo_prazo', label: 'Longo Prazo (pr\u00f3ximo semestre)', bg: '#16A34A', contentBg: '#F0FDF4' },
];

export default function RelatorioRHPDF({ data, empresaNome, logoBase64 }) {
  const c = data.conteudo;
  if (!c) return null;

  return (
    <Document>
      {/* Capa */}
      <PdfCover logoBase64={logoBase64} nome={empresaNome} cargo={'Relat\u00f3rio Consolidado \u2014 RH / T&D'} empresa={''} data={data.gerado_em} tipo={'Relat\u00f3rio RH / T&D'} />

      {/* Resumo + Indicadores */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageBackground />

        {c.resumo_executivo && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Resumo Executivo</SectionTitle>
            <View style={s.box}><Text style={s.text}>{c.resumo_executivo}</Text></View>
          </View>
        )}

        {c.indicadores && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Indicadores Quantitativos</SectionTitle>
            <View style={{ borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
              {[['Colaboradores avaliados', c.indicadores.total_avaliados],
                ['Avalia\u00e7\u00f5es realizadas', c.indicadores.total_avaliacoes],
                ['M\u00e9dia geral', c.indicadores.media_geral],
              ].map(([label, val], i) => (
                <View key={i} style={i % 2 === 0 ? s.kpiRow : s.kpiRowAlt}>
                  <Text style={s.kpiLabel}>{label}</Text>
                  <Text style={s.kpiValue}>{val || 0}</Text>
                </View>
              ))}
            </View>
            <View>
              <View style={{ ...s.levelBar, backgroundColor: '#F0FDF4' }}>
                <Text style={{ ...s.levelText, color: '#166534' }}>N3-N4: {(c.indicadores.pct_nivel_3 || 0) + (c.indicadores.pct_nivel_4 || 0)}%</Text>
              </View>
              <View style={{ ...s.levelBar, backgroundColor: '#FFFBEB' }}>
                <Text style={{ ...s.levelText, color: '#92400E' }}>N2: {c.indicadores.pct_nivel_2 || 0}%</Text>
              </View>
              <View style={{ ...s.levelBar, backgroundColor: '#FEF2F2' }}>
                <Text style={{ ...s.levelText, color: '#991B1B' }}>N1: {c.indicadores.pct_nivel_1 || 0}%</Text>
              </View>
            </View>
          </View>
        )}

        {c.comparativo_f1_f3 && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Comparativo</SectionTitle>
            <View style={s.box}><Text style={s.text}>{c.comparativo_f1_f3.analise}</Text></View>
            {c.comparativo_f1_f3.destaque_positivo && (
              <View style={s.hlPositive}><Text style={{ ...s.hlText, color: '#166534' }}>+ {c.comparativo_f1_f3.destaque_positivo}</Text></View>
            )}
            {c.comparativo_f1_f3.destaque_atencao && (
              <View style={s.hlAttention}><Text style={{ ...s.hlText, color: '#92400E' }}>! {c.comparativo_f1_f3.destaque_atencao}</Text></View>
            )}
          </View>
        )}

        {c.visao_por_cargo?.length > 0 && (
          <View style={s.section}>
            <SectionTitle>{'Vis\u00e3o por Cargo'}</SectionTitle>
            {c.visao_por_cargo.map((v, i) => (
              <View key={i} style={s.cargoCard} wrap={false}>
                <Text style={s.cargoTitle}>{v.cargo} {'\u2014'} {'M\u00e9dia'}: {v.media || '\u2014'}</Text>
                <Text style={s.text}>{v.analise}</Text>
                {v.ponto_forte && <View style={s.hlPositive}><Text style={{ ...s.hlText, color: '#166534' }}>+ {v.ponto_forte}</Text></View>}
                {v.ponto_critico && <View style={s.hlAttention}><Text style={{ ...s.hlText, color: '#92400E' }}>! {v.ponto_critico}</Text></View>}
              </View>
            ))}
          </View>
        )}

        <PageFooter />
      </Page>

      {/* Competências Críticas + Treinamentos */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageBackground />

        {c.competencias_criticas?.length > 0 && (
          <View style={s.section}>
            <SectionTitle>{'Compet\u00eancias Cr\u00edticas \u2014 Onde Investir'}</SectionTitle>
            {c.competencias_criticas.map((comp, i) => {
              const cc = critColors[comp.criticidade] || critColors.ESTAVEL;
              return (
                <View key={i} style={s.critCard} wrap={false}>
                  <View style={{ ...s.critHeader, backgroundColor: cc.bg }}>
                    <Text style={s.critHeaderText}>{comp.competencia} {'\u2014'} {comp.criticidade}</Text>
                  </View>
                  <View style={{ ...s.critContent, backgroundColor: cc.contentBg }}>
                    <Text style={s.text}>{comp.motivo}</Text>
                    {(comp.impacto || comp.impacto_alunos) && <Text style={s.critImpacto}>{comp.impacto || comp.impacto_alunos}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.treinamentos_sugeridos?.length > 0 && (
          <View style={s.section}>
            <SectionTitle>{'Forma\u00e7\u00f5es e Treinamentos'}</SectionTitle>
            {c.treinamentos_sugeridos.map((t, i) => {
              const pc = prioColors[t.prioridade] || prioColors.DESEJAVEL;
              return (
                <View key={i} style={s.trainCard} wrap={false}>
                  <View style={{ ...s.trainHeader, backgroundColor: pc.bg }}>
                    <Text style={s.trainHeaderText}>{i + 1}. {t.titulo} [{t.prioridade}]</Text>
                  </View>
                  <View style={{ ...s.trainContent, backgroundColor: pc.contentBg }}>
                    <Text style={s.trainMeta}>{'P\u00fablico'}: {t.publico} | Formato: {t.formato} | Carga: {t.carga_horaria} | Custo: {t.custo || t.custo_relativo}</Text>
                    {t.justificativa && <Text style={s.text}>{t.justificativa}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.perfil_disc_organizacional && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Perfil DISC Organizacional</SectionTitle>
            <View style={s.box}><Text style={s.text}>{c.perfil_disc_organizacional.descricao}</Text></View>
            {(c.perfil_disc_organizacional.implicacao || c.perfil_disc_organizacional.implicacao_pedagogica) && (
              <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 6, padding: 10 }}>
                <Text style={{ fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: '#1E40AF', marginBottom: 3 }}>{'Implica\u00e7\u00e3o'}</Text>
                <Text style={s.text}>{c.perfil_disc_organizacional.implicacao || c.perfil_disc_organizacional.implicacao_pedagogica}</Text>
              </View>
            )}
          </View>
        )}

        <PageFooter />
      </Page>

      {/* Decisões + Plano */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageBackground />

        {c.decisoes_chave?.length > 0 && (
          <View style={s.section}>
            <SectionTitle>{'Decis\u00f5es-Chave'}</SectionTitle>
            <Text style={{ ...s.textIt, marginBottom: 8 }}>{'Estas decis\u00f5es exigem a\u00e7\u00e3o imediata e crit\u00e9rios claros de reavalia\u00e7\u00e3o.'}</Text>
            {c.decisoes_chave.map((d, i) => (
              <View key={i} style={s.decCard} wrap={false}>
                <View style={s.decHeader}><Text style={s.decHeaderText}>{d.colaborador}</Text></View>
                <View style={{ ...s.decRow, backgroundColor: '#F5F3FF' }}>
                  <Text style={s.decLabel}>{'Situa\u00e7\u00e3o'}</Text>
                  <Text style={s.text}>{d.situacao}</Text>
                </View>
                <View style={{ ...s.decRow, backgroundColor: '#FEF2F2' }}>
                  <Text style={{ ...s.decLabel, color: '#B91C1C' }}>{'A\u00e7\u00e3o'}</Text>
                  <Text style={{ fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600, color: '#B91C1C' }}>{d.acao || d.acao_imediata}</Text>
                </View>
                {d.criterio_reavaliacao && (
                  <View style={{ ...s.decRow, backgroundColor: '#EFF6FF' }}>
                    <Text style={s.decLabel}>{'Reavalia\u00e7\u00e3o'}</Text>
                    <Text style={s.text}>{d.criterio_reavaliacao}</Text>
                  </View>
                )}
                {d.consequencia && (
                  <View style={{ ...s.decRow, backgroundColor: '#FFFBEB' }}>
                    <Text style={{ ...s.decLabel, color: '#92400E' }}>{'Se n\u00e3o evoluir'}</Text>
                    <Text style={{ fontFamily: 'NotoSans', fontSize: 10, color: '#92400E' }}>{d.consequencia}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {c.plano_acao && (
          <View style={s.section}>
            <SectionTitle>{'Plano de A\u00e7\u00e3o \u2014 RH / T&D'}</SectionTitle>
            {acaoHorizontes.map(({ key, label, bg, contentBg }) => {
              const a = c.plano_acao[key];
              if (!a) return null;
              return (
                <View key={key} style={s.acaoCard} wrap={false}>
                  <View style={{ ...s.acaoHeader, backgroundColor: bg }}>
                    <Text style={s.acaoHeaderText}>{label}: {a.titulo}</Text>
                  </View>
                  <View style={{ ...s.acaoContent, backgroundColor: contentBg }}>
                    <Text style={s.text}>{a.descricao}</Text>
                    {a.impacto && <Text style={{ fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 }}>{a.impacto}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.mensagem_final && (
          <View wrap={false}><View style={s.divider} /><Text style={s.textIt}>{c.mensagem_final}</Text></View>
        )}

        <PageFooter />
      </Page>
    </Document>
  );
}
