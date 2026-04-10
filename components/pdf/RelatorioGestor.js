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
  // Evolução
  evolBox: { backgroundColor: '#E8F5E9', padding: 10, borderRadius: 6, marginBottom: 3, borderLeftWidth: 3, borderLeftColor: '#2E7D32' },
  evolItem: { fontFamily: 'NotoSans', fontSize: 10, color: '#2E7D32', marginBottom: 2 },
  // Ranking
  rankUrgente: { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: '#B91C1C' },
  rankImportante: { backgroundColor: '#FFFBEB', borderLeftWidth: 3, borderLeftColor: '#D97706' },
  rankOutro: { backgroundColor: '#F0FDF4', borderLeftWidth: 3, borderLeftColor: '#16A34A' },
  rankCard: { borderRadius: 6, padding: 10, marginBottom: 6 },
  rankName: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: colors.textPrimary, marginBottom: 2 },
  rankMotivo: { fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, fontStyle: 'italic' },
  // Badge
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, marginLeft: 6 },
  badgeText: { fontFamily: 'NotoSans', fontSize: 8, fontWeight: 600 },
  // Ações por horizonte
  acaoCard: { borderRadius: 6, marginBottom: 6, overflow: 'hidden' },
  acaoHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  acaoHeaderText: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#FFFFFF' },
  acaoContent: { paddingVertical: 8, paddingHorizontal: 14 },
  acaoTitulo: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600, color: colors.textPrimary, marginBottom: 3 },
  // DISC
  discForce: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#D1FAE5', borderRadius: 6, padding: 10, marginBottom: 6 },
  discRisk: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 6, padding: 10, marginBottom: 6 },
  discLabel: { fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, marginBottom: 3 },
  // Papel gestor
  papelCard: { borderRadius: 6, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.gray200 },
  papelLabel: { fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  // Ação principal
  acaoPrincipal: { backgroundColor: colors.navy, borderRadius: 6, padding: 14, marginBottom: 10 },
  acaoPrincipalText: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 700, color: '#FFFFFF' },
  acaoPrincipalSub: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textSecondary, fontStyle: 'italic', marginTop: 6 },
});

function PageFooter() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{'Vertho Mentor IA \u2014 Confidencial'}</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

const acoes = [
  { key: 'esta_semana', label: 'Esta Semana', bg: '#B91C1C', contentBg: '#FEF2F2' },
  { key: 'proximas_semanas', label: 'Pr\u00f3ximas 2\u20134 Semanas', bg: '#2563EB', contentBg: '#EFF6FF' },
  { key: 'medio_prazo', label: 'M\u00e9dio Prazo (1\u20132 meses)', bg: '#16A34A', contentBg: '#F0FDF4' },
];

export default function RelatorioGestorPDF({ data, empresaNome, logoBase64 }) {
  const c = data.conteudo;
  if (!c) return null;

  return (
    <Document>
      {/* Capa */}
      <PdfCover logoBase64={logoBase64} nome={empresaNome} cargo={'Relat\u00f3rio do Gestor'} empresa={''} data={data.gerado_em} tipo={'Relat\u00f3rio do Gestor \u2014 Fase 3'} />

      {/* Resumo + Evolução + Ranking */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageBackground />

        {c.resumo_executivo && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Resumo Executivo</SectionTitle>
            <View style={s.box}><Text style={s.text}>{c.resumo_executivo}</Text></View>
          </View>
        )}

        {c.destaques_evolucao?.length > 0 && (
          <View style={s.section} wrap={false}>
            <SectionTitle>{'Destaques de Evolu\u00e7\u00e3o'}</SectionTitle>
            <View style={s.evolBox}>
              {c.destaques_evolucao.map((d, i) => (
                <Text key={i} style={s.evolItem}>+ {d}</Text>
              ))}
            </View>
          </View>
        )}

        {(c.ranking_atencao || c.ranking_qualificado)?.length > 0 && (
          <View style={s.section}>
            <SectionTitle>{'Ranking de Aten\u00e7\u00e3o'}</SectionTitle>
            {(c.ranking_atencao || c.ranking_qualificado).map((r, i) => {
              const bgStyle = r.urgencia === 'URGENTE' ? s.rankUrgente : r.urgencia === 'IMPORTANTE' ? s.rankImportante : s.rankOutro;
              return (
                <View key={i} style={{ ...s.rankCard, ...bgStyle }} wrap={false}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={s.rankName}>{r.nome} {'\u2014'} {r.competencia} (N{r.nivel || r.nivel_fase3})</Text>
                    <View style={{ ...s.badge, backgroundColor: r.urgencia === 'URGENTE' ? '#FEE2E2' : r.urgencia === 'IMPORTANTE' ? '#FEF3C7' : '#ECFDF3' }}>
                      <Text style={{ ...s.badgeText, color: r.urgencia === 'URGENTE' ? '#991B1B' : r.urgencia === 'IMPORTANTE' ? '#92400E' : '#166534' }}>{r.urgencia}</Text>
                    </View>
                  </View>
                  {(r.motivo || r.motivo_curto) && <Text style={s.rankMotivo}>{r.motivo || r.motivo_curto}</Text>}
                </View>
              );
            })}
          </View>
        )}

        <PageFooter />
      </Page>

      {/* Análise + DISC + Ações */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageBackground />

        {c.analise_por_competencia?.length > 0 && (
          <View style={s.section}>
            <SectionTitle>{'An\u00e1lise por Compet\u00eancia'}</SectionTitle>
            {c.analise_por_competencia.map((a, i) => (
              <View key={i} wrap={false} style={{ marginBottom: 10 }}>
                <Text style={s.h3}>{a.competencia} {'\u2014'} {'M\u00e9dia'}: {a.media_nivel || a.media}</Text>
                {a.distribuicao && <Text style={s.textIt}>{'Distribui\u00e7\u00e3o'}: N1:{a.distribuicao.n1} | N2:{a.distribuicao.n2} | N3:{a.distribuicao.n3} | N4:{a.distribuicao.n4}</Text>}
                <Text style={s.text}>{a.padrao_observado}</Text>
                {a.acao_gestor && (
                  <View style={{ backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 6, padding: 10, marginTop: 4 }}>
                    <Text style={{ fontFamily: 'NotoSans', fontSize: 9, fontWeight: 600, color: '#1E40AF', marginBottom: 3 }}>{'A\u00e7\u00e3o do Gestor'}</Text>
                    <Text style={s.text}>{a.acao_gestor}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {c.perfil_disc_equipe && (
          <View style={s.section} wrap={false}>
            <SectionTitle>Perfil DISC da Equipe</SectionTitle>
            <View style={s.box}><Text style={s.text}>{c.perfil_disc_equipe.descricao}</Text></View>
            {c.perfil_disc_equipe.forca_coletiva && (
              <View style={s.discForce}>
                <Text style={{ ...s.discLabel, color: '#166534' }}>{'For\u00e7a coletiva'}</Text>
                <Text style={s.text}>{c.perfil_disc_equipe.forca_coletiva}</Text>
              </View>
            )}
            {c.perfil_disc_equipe.risco_coletivo && (
              <View style={s.discRisk}>
                <Text style={{ ...s.discLabel, color: '#92400E' }}>Risco coletivo</Text>
                <Text style={s.text}>{c.perfil_disc_equipe.risco_coletivo}</Text>
              </View>
            )}
          </View>
        )}

        {c.acoes && (
          <View style={s.section}>
            <SectionTitle>{'Plano de A\u00e7\u00e3o'}</SectionTitle>
            {c.acoes.acao_principal && (
              <View style={s.acaoPrincipal} wrap={false}>
                <Text style={s.acaoPrincipalText}>{'COMECE POR AQUI: '}{typeof c.acoes.acao_principal === 'string' ? c.acoes.acao_principal : c.acoes.acao_principal.titulo}</Text>
                <Text style={s.acaoPrincipalSub}>{'Voc\u00ea n\u00e3o precisa fazer tudo na segunda-feira. Comece por esta a\u00e7\u00e3o.'}</Text>
              </View>
            )}
            {acoes.map(({ key, label, bg, contentBg }) => {
              const a = c.acoes[key];
              if (!a) return null;
              return (
                <View key={key} style={s.acaoCard} wrap={false}>
                  <View style={{ ...s.acaoHeader, backgroundColor: bg }}>
                    <Text style={s.acaoHeaderText}>{label}</Text>
                  </View>
                  <View style={{ ...s.acaoContent, backgroundColor: contentBg }}>
                    <Text style={s.acaoTitulo}>{a.titulo}</Text>
                    <Text style={s.text}>{a.descricao}</Text>
                    {a.impacto && <Text style={{ fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 }}>{a.impacto}</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {c.papel_do_gestor && (
          <View style={s.section}>
            <SectionTitle>Papel do Gestor</SectionTitle>
            {[{ label: 'Semanal', val: c.papel_do_gestor.semanal },
              { label: 'Quinzenal', val: c.papel_do_gestor.quinzenal },
              { label: 'Pr\u00f3ximo ciclo', val: c.papel_do_gestor.proximo_ciclo },
            ].filter(p => p.val).map((p, i) => (
              <View key={i} style={s.papelCard}>
                <Text style={s.papelLabel}>{p.label}</Text>
                <Text style={s.text}>{p.val}</Text>
              </View>
            ))}
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
