import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { colors, pageStyles, fonts } from './styles';
import PdfCover from './PdfCover';
import { SectionTitle } from './SectionTitle';

const s = StyleSheet.create({
  text: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, lineHeight: 1.6, marginBottom: 4 },
  textSm: { fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, lineHeight: 1.5 },
  h3: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 6, marginTop: 10 },
  cardsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  kpiCard: { width: '32%', borderWidth: 1, borderColor: colors.gray200, borderRadius: 6, padding: 8 },
  kpiLabel: { fontFamily: 'NotoSans', fontSize: 7, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontFamily: 'NotoSans', fontSize: 16, fontWeight: 700, color: colors.navy, marginTop: 3 },
  kpiHint: { fontFamily: 'NotoSans', fontSize: 8, color: colors.textMuted, marginTop: 2 },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: colors.gray200 },
  dimName: { flex: 1, fontFamily: 'NotoSans', fontSize: 9.5, color: colors.textPrimary, fontWeight: 500 },
  dimScore: { width: 50, fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, textAlign: 'right' },
  dimDelta: { width: 50, fontFamily: 'NotoSans', fontSize: 9, textAlign: 'right' },
  themeChip: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10, borderWidth: 0.5, marginRight: 5, marginBottom: 4,
  },
  themeChipText: { fontFamily: 'NotoSans', fontSize: 8, fontWeight: 600 },
  itemBlock: {
    backgroundColor: '#F8FAFC', borderLeftWidth: 3, borderRadius: 4,
    paddingLeft: 10, paddingVertical: 6, paddingRight: 8, marginBottom: 5,
  },
  itemTitle: { fontFamily: 'NotoSans', fontSize: 9.5, fontWeight: 700, color: colors.textPrimary, marginBottom: 2 },
  itemDetail: { fontFamily: 'NotoSans', fontSize: 8.5, color: colors.textSecondary, lineHeight: 1.5 },
  privacyBox: {
    backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: colors.perfilBorder,
    borderRadius: 6, padding: 10, marginBottom: 14,
  },
  privacyText: { fontFamily: 'NotoSans', fontSize: 8.5, color: colors.blueText, lineHeight: 1.5 },
});

function Footer() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{'Vertho — Pulso de Desenvolvimento'}</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function bandColor(score: number | null) {
  if (score == null) return colors.gray400;
  if (score >= 4.2) return colors.green;
  if (score >= 3.5) return colors.cyan;
  if (score >= 2.8) return colors.orange;
  return colors.flagRed;
}

function deltaColor(d: number | null) {
  if (d == null || d === 0) return colors.textMuted;
  return d > 0 ? colors.green : colors.flagRed;
}

const POLARITY_BG: Record<string, { bg: string; border: string; text: string }> = {
  positive: { bg: '#F0FDF4', border: '#BBF7D0', text: '#14532D' },
  negative: { bg: '#FFFBEB', border: '#FDE68A', text: '#78350F' },
  neutral:  { bg: '#F8FAFC', border: '#E2E8F0', text: colors.textSecondary },
};

interface PulseReportData {
  ciclo: { nome: string; descricao?: string | null };
  empresa: { nome: string };
  generated_at: string;
  group_label: string;            // ex: "Empresa toda" ou "Área: Pedagogia"
  n_t0: number;
  n_t2: number;
  indice_geral: { t0: number | null; t2: number | null; delta: number | null };
  classificacao: { band: string; label: string } | null;
  dimensions: Array<{ dimension_name: string; t0: number | null; t2: number | null; delta: number | null }>;
  signals?: Array<{ label: string; score: number; raw: any }>;
  themes?: Array<{ theme_label: string; polarity: string; count: number; pct: number }>;
  triangulation: {
    summary: string;
    accelerators: Array<{ title: string; detail: string }>;
    blockers: Array<{ title: string; detail: string }>;
    alerts: Array<{ title: string; detail: string }>;
    recommendations: Array<{ title: string; detail: string }>;
    divergences: Array<{ title: string; detail: string }>;
    confidence_level: string;
  };
}

export default function RelatorioPulsoExecutivoPDF({
  data, empresaNome, logoBase64,
}: {
  data: any;
  empresaNome?: string;
  logoBase64?: string;
}) {
  const c: PulseReportData = (data?.conteudo ?? data) as PulseReportData;
  if (!c) return null;
  const scoreVigente = c.indice_geral.t2 ?? c.indice_geral.t0;

  return (
    <Document>
      <PdfCover
        logoBase64={logoBase64}
        nome={c.empresa.nome || empresaNome || ''}
        cargo={c.ciclo.nome}
        empresa={c.group_label}
        data={c.generated_at}
        tipo={'Pulso de Desenvolvimento — Relatório Executivo'}
      />

      <Page size="A4" style={pageStyles.page} wrap>
        <View>
          <SectionTitle>Visão Geral</SectionTitle>

          <View style={s.cardsRow}>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Índice Geral</Text>
              <Text style={[s.kpiValue, { color: bandColor(scoreVigente) }]}>
                {scoreVigente != null ? scoreVigente.toFixed(2) : '—'}
              </Text>
              <Text style={s.kpiHint}>{c.classificacao?.label || ''}</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Respondentes</Text>
              <Text style={s.kpiValue}>{Math.max(c.n_t0, c.n_t2)}</Text>
              <Text style={s.kpiHint}>T0: {c.n_t0} · T2: {c.n_t2}</Text>
            </View>
            <View style={s.kpiCard}>
              <Text style={s.kpiLabel}>Δ Geral</Text>
              <Text style={[s.kpiValue, { color: deltaColor(c.indice_geral.delta) }]}>
                {c.indice_geral.delta != null
                  ? (c.indice_geral.delta > 0 ? '+' : '') + c.indice_geral.delta.toFixed(2)
                  : '—'}
              </Text>
              <Text style={s.kpiHint}>T2 − T0</Text>
            </View>
          </View>

          <View style={s.privacyBox}>
            <Text style={s.privacyText}>
              Este relatório apresenta dados agregados, respeitando o anonimato dos respondentes.
              Recortes com menos de 7 participantes não são exibidos. Respostas abertas individuais não são
              expostas — apenas temas dominantes.
            </Text>
          </View>

          <SectionTitle>Resumo da Leitura</SectionTitle>
          <Text style={s.text}>{c.triangulation.summary || 'Dados ainda insuficientes para leitura consolidada.'}</Text>

          <SectionTitle>Médias por Dimensão</SectionTitle>
          <View>
            {c.dimensions.map(d => (
              <View key={d.dimension_name} style={s.dimRow}>
                <Text style={s.dimName}>{d.dimension_name}</Text>
                <Text style={[s.dimScore, { color: bandColor(d.t0) }]}>
                  {d.t0 != null ? d.t0.toFixed(2) : '—'}
                </Text>
                <Text style={[s.dimScore, { color: bandColor(d.t2) }]}>
                  {d.t2 != null ? d.t2.toFixed(2) : '—'}
                </Text>
                <Text style={[s.dimDelta, { color: deltaColor(d.delta) }]}>
                  {d.delta != null ? (d.delta > 0 ? '+' : '') + d.delta.toFixed(2) : '—'}
                </Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', paddingTop: 4 }}>
              <Text style={[s.textSm, { flex: 1 }]}> </Text>
              <Text style={[s.dimScore, { color: colors.textMuted, fontSize: 8 }]}>T0</Text>
              <Text style={[s.dimScore, { color: colors.textMuted, fontSize: 8 }]}>T2</Text>
              <Text style={[s.dimDelta, { color: colors.textMuted, fontSize: 8 }]}>Δ</Text>
            </View>
          </View>

          {c.signals && c.signals.length > 0 && (
            <>
              <SectionTitle>Sinais da Jornada</SectionTitle>
              <Text style={s.textSm}>
                Indicadores comportamentais derivados de uso da MentorIA, respostas e completude.
                Linguagem cautelosa — complementam, não substituem, a leitura do pulso declarado.
              </Text>
              <View style={{ marginTop: 6 }}>
                {c.signals.map(sg => (
                  <View key={sg.label} style={s.dimRow}>
                    <Text style={s.dimName}>{sg.label}</Text>
                    <Text style={[s.dimScore, { color: bandColor(sg.score) }]}>{sg.score}/5</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {c.themes && c.themes.length > 0 && (
            <>
              <SectionTitle>Temas Dominantes — Respostas Abertas</SectionTitle>
              <Text style={s.textSm}>
                Temas classificados por IA (Dual-IA com auditoria). Respostas brutas não são exibidas
                para preservar anonimato.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
                {c.themes.map(t => {
                  const pal = POLARITY_BG[t.polarity] || POLARITY_BG.neutral;
                  return (
                    <View key={t.theme_label}
                      style={[s.themeChip, { backgroundColor: pal.bg, borderColor: pal.border }]}>
                      <Text style={[s.themeChipText, { color: pal.text }]}>
                        {t.theme_label} · {t.count} ({t.pct}%)
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>
        <Footer />
      </Page>

      <Page size="A4" style={pageStyles.page} wrap>
        <View>
          <SectionTitle>Aceleradores</SectionTitle>
          {c.triangulation.accelerators.length === 0 ? (
            <Text style={s.textSm}>Sem aceleradores identificados nesta leitura.</Text>
          ) : c.triangulation.accelerators.map((it, i) => (
            <View key={i} style={[s.itemBlock, { borderLeftColor: colors.green }]}>
              <Text style={s.itemTitle}>{it.title}</Text>
              <Text style={s.itemDetail}>{it.detail}</Text>
            </View>
          ))}

          <SectionTitle>Bloqueadores</SectionTitle>
          {c.triangulation.blockers.length === 0 ? (
            <Text style={s.textSm}>Sem bloqueadores significativos.</Text>
          ) : c.triangulation.blockers.map((it, i) => (
            <View key={i} style={[s.itemBlock, { borderLeftColor: colors.orange }]}>
              <Text style={s.itemTitle}>{it.title}</Text>
              <Text style={s.itemDetail}>{it.detail}</Text>
            </View>
          ))}

          {c.triangulation.alerts.length > 0 && (
            <>
              <SectionTitle>Alertas</SectionTitle>
              {c.triangulation.alerts.map((it, i) => (
                <View key={i} style={[s.itemBlock, { borderLeftColor: colors.flagRed }]}>
                  <Text style={s.itemTitle}>{it.title}</Text>
                  <Text style={s.itemDetail}>{it.detail}</Text>
                </View>
              ))}
            </>
          )}

          {c.triangulation.divergences.length > 0 && (
            <>
              <SectionTitle>Divergências (Declarado vs Comportamental)</SectionTitle>
              {c.triangulation.divergences.map((it, i) => (
                <View key={i} style={[s.itemBlock, { borderLeftColor: colors.purple }]}>
                  <Text style={s.itemTitle}>{it.title}</Text>
                  <Text style={s.itemDetail}>{it.detail}</Text>
                </View>
              ))}
            </>
          )}

          <SectionTitle>Recomendações para Liderança e RH</SectionTitle>
          {c.triangulation.recommendations.length === 0 ? (
            <Text style={s.textSm}>Aguardando mais dados para gerar recomendações.</Text>
          ) : c.triangulation.recommendations.map((it, i) => (
            <View key={i} style={[s.itemBlock, { borderLeftColor: colors.cyan }]}>
              <Text style={s.itemTitle}>{it.title}</Text>
              <Text style={s.itemDetail}>{it.detail}</Text>
            </View>
          ))}

          <Text style={[s.textSm, { marginTop: 14, fontStyle: 'italic', color: colors.textMuted }]}>
            Confiança da leitura: {c.triangulation.confidence_level.toUpperCase()}.
            Insights gerados com regras de triangulação Pulso × Sinais × Temas (Dual-IA).
          </Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}
