import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Svg, Line, Path, Circle, Link } from '@react-pdf/renderer';
import { colors, pageStyles } from './styles';
import PdfReportCover, { ReportSectionTitle } from './PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import { idiomaDoPdf, numeroNoPdf, percentualNoPdf, tradutorDoPdf, type PdfT } from '@/lib/pdf-i18n';
import { semDadoNoPdf } from '@/lib/relatorios/rotulos-sem-dado';
import type { ReportView } from '@/lib/engajamento/relatorio-model';

const s = StyleSheet.create({
  section: { marginBottom: 14 },
  meta: { fontSize: 8, color: colors.textMuted, marginBottom: 10 },
  box: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, padding: 14 },
  thesis: { fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 5 },
  text: { fontSize: 10, color: colors.textPrimary, lineHeight: 1.6 },
  caption: { fontSize: 8, color: colors.textMuted, lineHeight: 1.5 },
  kpiTable: { borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, overflow: 'hidden' },
  kpiRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  kpiLabel: { fontSize: 10, color: colors.textPrimary, flex: 1 },
  kpiValue: { fontSize: 10, fontWeight: 700, color: colors.textPrimary, width: 130 },
  kpiDelta: { fontSize: 8, color: colors.textMuted, width: 90, textAlign: 'right' },
  risk: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 6, padding: 10, marginBottom: 12 },
  riskTitle: { fontSize: 10, fontWeight: 600, color: colors.yellowText, marginBottom: 5 },
  card: { borderRadius: 6, overflow: 'hidden', marginBottom: 8 },
  cardHeader: { paddingVertical: 8, paddingHorizontal: 12 },
  cardTitle: { fontSize: 10, fontWeight: 700, color: colors.white },
  cardContent: { paddingVertical: 8, paddingHorizontal: 14 },
  subtitle: { fontSize: 9, color: colors.textMuted, marginBottom: 5 },
  legend: { flexDirection: 'row', gap: 18, marginTop: 8, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 12, height: 3, marginRight: 5 },
  cargo: { borderWidth: 1, borderColor: colors.gray200, borderRadius: 6, padding: 10, marginBottom: 8 },
  cargoName: { fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 4 },
  cargoMetrics: { flexDirection: 'row', marginTop: 10, marginBottom: 9 },
  cargoMetric: { flex: 1, paddingRight: 6 },
  cargoValue: { fontSize: 11, color: colors.navy, fontWeight: 600, marginTop: 4 },
  cargoAction: { borderTopWidth: 1, borderTopColor: colors.gray200, paddingTop: 8, fontSize: 9, color: colors.textSecondary, lineHeight: 1.5 },
});

const signalColors = {
  critical: { header: '#B91C1C', content: '#FEF2F2' },
  attention: { header: '#92400E', content: '#FFFBEB' },
  positive: { header: '#166534', content: '#F0FDF4' },
};

const series = [
  { key: 'activation' as const, color: '#1C8A90' },
  { key: 'consumption' as const, color: '#3B0A6D' },
  { key: 'evidence' as const, color: '#B45309' },
];

/** A variação em pontos percentuais: "Estável" quando não mexeu, "+5 pp" ou "-3 pp" quando mexeu (o "pp" é o mesmo nos quatro idiomas). */
function delta(value: number, t: PdfT, idioma: string) {
  return value === 0 ? t('engajamento.stable') : t('engajamento.deltaPoints', { value: `${value > 0 ? '+' : ''}${numeroNoPdf(value, idioma, 0)}` });
}

function Trend({ data, t, idioma }: { data: ReportView; t: PdfT; idioma: string }) {
  const left = 30, right = 493, top = 14, bottom = 138;
  const x = (index: number) => left + index * (right - left) / Math.max(1, data.trend.length - 1);
  const y = (value: number) => bottom - value * (bottom - top) / 100;
  if (!data.trend.length) return <Text style={s.text}>{t('engajamento.noWeeklyHistory')}</Text>;
  return <>
    <View style={s.legend}>
      {series.map((item) => <View key={item.key} style={s.legendItem}>
        <View style={{ ...s.swatch, backgroundColor: item.color }} />
        <Text style={s.caption}>{t(`engajamento.series.${item.key}`)}: {percentualNoPdf(data.trend.at(-1)![item.key], idioma)}</Text>
      </View>)}
    </View>
    <Svg width="100%" height={164} viewBox="0 0 515 164">
      {[0, 25, 50, 75, 100].map((tick) => <React.Fragment key={tick}>
        <Line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke={colors.gray200} strokeWidth={0.6} />
        <Text x={0} y={y(tick) + 3} style={{ fontFamily: 'NotoSans', fontSize: 7, color: colors.textMuted }}>{percentualNoPdf(tick, idioma)}</Text>
      </React.Fragment>)}
      {series.map((item) => <React.Fragment key={item.key}>
        <Path d={data.trend.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point[item.key])}`).join(' ')} fill="none" stroke={item.color} strokeWidth={1.8} />
        {data.trend.map((point, index) => <Circle key={point.label} cx={x(index)} cy={y(point[item.key])} r={2.6} fill={colors.white} stroke={item.color} strokeWidth={1.5} />)}
      </React.Fragment>)}
      {data.trend.map((point, index) => <Text key={point.label} x={x(index)} y={156} textAnchor="middle" style={{ fontFamily: 'NotoSans', fontSize: 7, color: colors.textMuted }}>{point.label}</Text>)}
    </Svg>
  </>;
}

export default function RelatorioEngajamentoPDF({
  data, empresaNome, semana, inscritos, geradoEm, logoBase64, mostrarVertho = true, detailUrl, locale,
}: {
  data: ReportView;
  empresaNome: string;
  semana: number;
  inscritos: number;
  geradoEm: string;
  logoBase64?: string | null;
  mostrarVertho?: boolean;
  detailUrl: string;
  /**
   * Idioma do texto fixo, dos números e dos percentuais do papel: o de quem baixa
   * (`lib/pdf-locale.ts`). O `data` já vem escrito no mesmo idioma por `buildViews({ locale })`.
   * Sem ele, pt-BR.
   */
  locale?: string | null;
}) {
  const t = tradutorDoPdf(locale);
  const idioma = idiomaDoPdf(locale);
  const pct = (valor: number) => percentualNoPdf(valor, idioma);
  const metrics = [
    { label: t('engajamento.eligible'), count: data.eligible, pct: data.eligible ? 100 : 0, delta: null },
    { label: t('engajamento.activated'), ...data.activation },
    { label: t('engajamento.consumed'), ...data.consumption },
    { label: t('engajamento.evidenced'), ...data.evidence },
  ];
  const label = `${t('engajamento.weeklyEngagement')} · ${data.audienceLabel}`;
  const period = `${semana ? `${t('engajamento.weekN', { n: semana })} · ` : ''}${geradoEm}`;
  const peopleUrl = new URL(detailUrl);
  peopleUrl.searchParams.delete('view');
  peopleUrl.hash = 'pessoas';
  function Header() {
    return <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>{label}</Text>
    </View>;
  }
  function Footer() {
    return <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{t('engajamento.footer', { name: mostrarVertho ? 'Vertho Mentor IA' : empresaNome })}</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>;
  }
  return <Document title={t('engajamento.docTitle', { company: empresaNome })} author={mostrarVertho ? 'Vertho' : empresaNome}>
    <PdfReportCover
      bgBase64={getReportCoverBgBase64()}
      logoBase64={logoBase64}
      mostrarVertho={mostrarVertho}
      mentorLabel={mostrarVertho ? 'Mentor IA' : null}
      overline={`${t('engajamento.coverOverline')} · ${data.audienceLabel}`}
      titulo={[t('engajamento.coverTitle1'), t('engajamento.coverTitle2')]}
      nome={empresaNome}
      jornada={period}
      tagline={t('engajamento.tagline')}
      locale={idioma}
    />
    <Page size="A4" style={pageStyles.page}>
      <Header />
      <Text style={s.meta}>{empresaNome} · {period}</Text>
      <View style={s.section} wrap={false}>
        <ReportSectionTitle>{t('engajamento.executiveSummary')}</ReportSectionTitle>
        <View style={s.box}>
          <Text style={s.thesis}>{data.thesis}</Text>
          <Text style={s.text}>{data.explanation}</Text>
        </View>
      </View>
      <View style={s.section} wrap={false}>
        <ReportSectionTitle>{t('engajamento.closingIndicators')}</ReportSectionTitle>
        <View style={s.kpiTable}>
          {metrics.map((metric, index) => <View key={metric.label} style={{ ...s.kpiRow, backgroundColor: index % 2 ? '#FAFAFA' : colors.white }}>
            <Text style={s.kpiLabel}>{metric.label}</Text>
            <Text style={s.kpiValue}>{t('engajamento.ofBase', { count: metric.count, pct: pct(metric.pct) })}</Text>
            <Text style={{ ...s.kpiDelta, color: metric.delta !== null && metric.delta < 0 ? colors.flagRed : colors.textMuted }}>{metric.delta !== null && data.canCompare ? delta(metric.delta, t, idioma) : ''}</Text>
          </View>)}
        </View>
        <Text style={{ ...s.caption, marginTop: 7 }}>{t('engajamento.eligibleBase', {
          week: semana, eligible: data.eligible, mode: data.canCompare ? 'compare' : 'none',
          previous: data.previousEligible ?? 0, changed: data.previousEligible !== data.eligible ? 'yes' : 'no',
        })}</Text>
      </View>
      <View style={s.section} wrap={false}>
        <ReportSectionTitle>{t('engajamento.weeklyEvolution')}</ReportSectionTitle>
        <Text style={s.caption}>{t('engajamento.weeklyEvolutionNote')}</Text>
        <Trend data={data} t={t} idioma={idioma} />
      </View>
      <View style={s.risk} wrap={false}>
        <Text style={s.riskTitle}>{t('engajamento.overallFollowUp', { total: data.risk.total, enrolled: inscritos })}</Text>
        <Text style={s.text}>{t('engajamento.riskLine', { critical: data.risk.critical, attention: data.risk.attention, eligible: data.eligible })}</Text>
      </View>
      <Link src={peopleUrl.toString()} style={{ fontSize: 9, color: colors.linkBlue }}>{t('engajamento.openPlatform')}</Link>
      <Footer />
    </Page>
    <Page size="A4" style={pageStyles.page}>
      <Header />
      <Text style={s.meta}>{empresaNome} · {period}</Text>
      <View style={s.section}>
        <View wrap={false} minPresenceAhead={100}>
          <ReportSectionTitle>{t('engajamento.prioritiesTitle')}</ReportSectionTitle>
          <Text style={{ ...s.caption, marginBottom: 8 }}>{t('engajamento.exclusiveGroups', {
            groups: data.priorities.length ? data.priorities.map((item) => `${item.label}: ${item.count} (${pct(item.pct)})`).join(' · ') : t('engajamento.noPending'),
          })}</Text>
        </View>
        {data.actionPlan.map((action, index) => <View key={action.title} style={s.card} wrap={false}>
          <View style={{ ...s.cardHeader, backgroundColor: colors.navyLight }}>
            <Text style={s.cardTitle}>{index + 1}. {action.title}</Text>
          </View>
          <View style={{ ...s.cardContent, backgroundColor: '#F8FAFC' }}>
            <Text style={s.text}>{action.description}</Text>
            <Text style={{ ...s.caption, marginTop: 6 }}>{t('engajamento.suggestedOwnerDeadline', { owner: action.owner, deadline: action.deadline })}</Text>
          </View>
        </View>)}
      </View>
      <View wrap={false} minPresenceAhead={100}>
        <ReportSectionTitle>{data.focusTitle}</ReportSectionTitle>
        <Text style={{ ...s.text, marginBottom: 12 }}>{data.focusSubtitle}</Text>
      </View>
      {data.focusItems.length ? data.focusItems.map((item, index) => <View key={`${item.name}-${index}`} style={s.card} wrap={false}>
        <View style={{ ...s.cardHeader, backgroundColor: signalColors[item.signal].header }}>
          <Text style={s.cardTitle}>{index + 1}. {item.name} · {item.label}</Text>
        </View>
        <View style={{ ...s.cardContent, backgroundColor: signalColors[item.signal].content }}>
          <Text style={s.subtitle}>{item.context}</Text>
          <Text style={s.text}>{item.reason}</Text>
        </View>
      </View>) : <Text style={s.text}>{t('engajamento.nobodyFollowedUp')}</Text>}
      <Footer />
    </Page>
    <Page size="A4" style={pageStyles.page}>
      <Header />
      <View style={{ paddingBottom: 12 }} wrap={false} minPresenceAhead={140}>
        <Text style={s.meta}>{empresaNome} · {period}</Text>
        <ReportSectionTitle>{t('engajamento.byRole')}</ReportSectionTitle>
        <Text style={s.text}>{t('engajamento.byRoleSubtitle')}</Text>
        <Text style={{ ...s.caption, marginTop: 5 }}>{t('engajamento.byRoleOrder')}</Text>
        <Text style={{ ...s.caption, marginTop: 5 }}>{t('engajamento.byRoleHowToRead', { week: semana })}</Text>
      </View>
      {data.cargos.length ? data.cargos.map((cargo) => <View key={cargo.cargo} style={s.cargo} wrap={false}>
        <Text style={s.cargoName}>{semDadoNoPdf(cargo.cargo, t)}</Text>
        <Text style={s.subtitle}>{t('engajamento.roleCounts', { enrolled: cargo.participantes, eligible: cargo.elegiveis, week: semana })}</Text>
        <View style={s.cargoMetrics}>
          {[
            { label: t('engajamento.activated'), value: cargo.ativados, pct: cargo.ativacaoPct },
            { label: t('engajamento.consumed'), value: cargo.consumiram, pct: cargo.consumoPct },
            { label: t('engajamento.evidenced'), value: cargo.evidencias, pct: cargo.evidenciaPct },
          ].map((metric) => <View key={metric.label} style={s.cargoMetric}>
            <Text style={s.caption}>{metric.label}</Text>
            <Text style={s.cargoValue}>{cargo.elegiveis ? `${metric.value} · ${pct(metric.pct)}` : t('engajamento.noEligible')}</Text>
          </View>)}
          <View style={s.cargoMetric}>
            <Text style={s.caption}>{t('engajamento.atRisk')}</Text>
            <Text style={{ ...s.cargoValue, color: cargo.emRisco ? colors.orangeText : colors.greenText }}>{cargo.emRisco} · {pct(cargo.riscoPct)}</Text>
            <Text style={{ ...s.caption, marginTop: 4 }}>{t('engajamento.criticalAttention', { critical: cargo.criticos, attention: cargo.atencao })}</Text>
          </View>
        </View>
        <Text style={s.cargoAction}><Text style={{ fontWeight: 600, color: colors.navy }}>{t('engajamento.suggestedAction')} </Text>{cargo.acao}</Text>
      </View>) : <Text style={s.text}>{t('engajamento.noRoleData')}</Text>}
      <View style={{ ...s.section, marginTop: 15 }} wrap={false}>
        <ReportSectionTitle>{t('engajamento.howToRead')}</ReportSectionTitle>
        <Text style={s.text}>{t('engajamento.howToReadDefinitions')}</Text>
        <Text style={{ ...s.text, marginTop: 7 }}>{t('engajamento.howToReadAudiences')}</Text>
        <Link src={detailUrl} style={{ fontSize: 9, color: colors.linkBlue, marginTop: 12 }}>{t('engajamento.seeDetailedData')}</Link>
      </View>
      <Footer />
    </Page>
  </Document>;
}
