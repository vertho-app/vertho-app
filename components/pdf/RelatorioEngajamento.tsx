import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Svg, Line, Path, Circle, Link } from '@react-pdf/renderer';
import { colors, pageStyles } from './styles';
import PdfReportCover, { ReportSectionTitle } from './PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
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
  { key: 'activation' as const, label: 'Ativação', color: '#1C8A90' },
  { key: 'consumption' as const, label: 'Consumo', color: '#3B0A6D' },
  { key: 'evidence' as const, label: 'Evidência', color: '#B45309' },
];

function delta(value: number) {
  return value === 0 ? 'Estável' : `${value > 0 ? '+' : ''}${value} pp`;
}

function Trend({ data }: { data: ReportView }) {
  const left = 30, right = 493, top = 14, bottom = 138;
  const x = (index: number) => left + index * (right - left) / Math.max(1, data.trend.length - 1);
  const y = (value: number) => bottom - value * (bottom - top) / 100;
  if (!data.trend.length) return <Text style={s.text}>Sem histórico semanal disponível.</Text>;
  return <>
    <View style={s.legend}>
      {series.map((item) => <View key={item.key} style={s.legendItem}>
        <View style={{ ...s.swatch, backgroundColor: item.color }} />
        <Text style={s.caption}>{item.label}: {data.trend.at(-1)![item.key]}%</Text>
      </View>)}
    </View>
    <Svg width="100%" height={164} viewBox="0 0 515 164">
      {[0, 25, 50, 75, 100].map((tick) => <React.Fragment key={tick}>
        <Line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke={colors.gray200} strokeWidth={0.6} />
        <Text x={0} y={y(tick) + 3} style={{ fontFamily: 'NotoSans', fontSize: 7, color: colors.textMuted }}>{tick}%</Text>
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
  data, empresaNome, semana, inscritos, geradoEm, logoBase64, mostrarVertho = true, detailUrl,
}: {
  data: ReportView;
  empresaNome: string;
  semana: number;
  inscritos: number;
  geradoEm: string;
  logoBase64?: string | null;
  mostrarVertho?: boolean;
  detailUrl: string;
}) {
  const metrics = [
    { label: 'Elegíveis', count: data.eligible, pct: data.eligible ? 100 : 0, delta: null },
    { label: 'Ativaram', ...data.activation },
    { label: 'Consumiram', ...data.consumption },
    { label: 'Evidenciaram', ...data.evidence },
  ];
  const label = `Engajamento semanal · ${data.eyebrow.replace('Leitura de ', '').replace('Leitura do ', '')}`;
  const period = `${semana ? `Semana ${semana} · ` : ''}${geradoEm}`;
  function Header() {
    return <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>{label}</Text>
    </View>;
  }
  function Footer() {
    return <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{mostrarVertho ? 'Vertho Mentor IA' : empresaNome} - Confidencial</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>;
  }
  return <Document title={`Relatório de engajamento - ${empresaNome}`} author={mostrarVertho ? 'Vertho' : empresaNome}>
    <PdfReportCover
      bgBase64={getReportCoverBgBase64()}
      logoBase64={logoBase64}
      mostrarVertho={mostrarVertho}
      mentorLabel={mostrarVertho ? 'Mentor IA' : null}
      overline={`Relatório semanal · ${data.eyebrow.replace('Leitura de ', '').replace('Leitura do ', '')}`}
      titulo={['Engajamento', 'Semanal']}
      nome={empresaNome}
      jornada={period}
      tagline="Do dado à decisão sobre pessoas."
    />
    <Page size="A4" style={pageStyles.page}>
      <Header />
      <Text style={s.meta}>{empresaNome} · {period}</Text>
      <View style={s.section} wrap={false}>
        <ReportSectionTitle>Resumo executivo</ReportSectionTitle>
        <View style={s.box}>
          <Text style={s.thesis}>{data.thesis}</Text>
          <Text style={s.text}>{data.explanation}</Text>
        </View>
      </View>
      <View style={s.section} wrap={false}>
        <ReportSectionTitle>Indicadores do fechamento</ReportSectionTitle>
        <View style={s.kpiTable}>
          {metrics.map((metric, index) => <View key={metric.label} style={{ ...s.kpiRow, backgroundColor: index % 2 ? '#FAFAFA' : colors.white }}>
            <Text style={s.kpiLabel}>{metric.label}</Text>
            <Text style={s.kpiValue}>{metric.count} · {metric.pct}% da base</Text>
            <Text style={{ ...s.kpiDelta, color: metric.delta !== null && metric.delta < 0 ? colors.flagRed : colors.textMuted }}>{metric.delta !== null && data.canCompare ? delta(metric.delta) : ''}</Text>
          </View>)}
        </View>
        <Text style={{ ...s.caption, marginTop: 7 }}>Base elegível da semana {semana}: {data.eligible} participantes. {data.canCompare ? `Variações em pontos percentuais. Base anterior: ${data.previousEligible} pessoas.${data.previousEligible !== data.eligible ? ' A população elegível mudou entre as semanas.' : ''}` : 'Sem comparação anterior disponível.'}</Text>
      </View>
      <View style={s.section} wrap={false}>
        <ReportSectionTitle>Evolução semanal</ReportSectionTitle>
        <Text style={s.caption}>Percentuais sobre os elegíveis de cada semana. O tamanho da base pode mudar.</Text>
        <Trend data={data} />
      </View>
      <View style={s.risk} wrap={false}>
        <Text style={s.riskTitle}>Acompanhamento geral: {data.risk.total} de {inscritos} inscritos</Text>
        <Text style={s.text}>{data.risk.critical} críticos · {data.risk.attention} em atenção. Cada pessoa na sua semana atual; esta base é diferente dos {data.eligible} elegíveis do fechamento.</Text>
      </View>
      <Link src={detailUrl.replace('&view=evolucao', '') + '#pessoas'} style={{ fontSize: 9, color: colors.linkBlue }}>Abrir a plataforma para revisar os sinais e orientar a próxima ação</Link>
      <Footer />
    </Page>
    <Page size="A4" style={pageStyles.page}>
      <Header />
      <Text style={s.meta}>{empresaNome} · {period}</Text>
      <View style={s.section}>
        <View wrap={false} minPresenceAhead={100}>
          <ReportSectionTitle>Prioridades e plano de ação</ReportSectionTitle>
          <Text style={{ ...s.caption, marginBottom: 8 }}>Grupos exclusivos da semana: {data.priorities.length ? data.priorities.map((item) => `${item.label}: ${item.count} (${item.pct}%)`).join(' · ') : 'nenhuma pendência registrada'}.</Text>
        </View>
        {data.actionPlan.map((action, index) => <View key={action.title} style={s.card} wrap={false}>
          <View style={{ ...s.cardHeader, backgroundColor: colors.navyLight }}>
            <Text style={s.cardTitle}>{index + 1}. {action.title}</Text>
          </View>
          <View style={{ ...s.cardContent, backgroundColor: '#F8FAFC' }}>
            <Text style={s.text}>{action.description}</Text>
            <Text style={{ ...s.caption, marginTop: 6 }}>Responsável sugerido: {action.owner} · Prazo sugerido: {action.deadline}</Text>
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
      </View>) : <Text style={s.text}>Ninguém em acompanhamento nesta semana.</Text>}
      <Footer />
    </Page>
    <Page size="A4" style={pageStyles.page}>
      <Header />
      <View style={{ paddingBottom: 12 }} wrap={false} minPresenceAhead={140}>
        <Text style={s.meta}>{empresaNome} · {period}</Text>
        <ReportSectionTitle>Engajamento por cargo</ReportSectionTitle>
        <Text style={s.text}>Onde concentrar o acompanhamento</Text>
        <Text style={{ ...s.caption, marginTop: 5 }}>Todos os cargos, em ordem de pessoas em risco; depois, casos críticos e inscritos.</Text>
        <Text style={{ ...s.caption, marginTop: 5 }}>Ativação, consumo e evidência: quantidade e percentual dos elegíveis na semana {semana}. Risco: quantidade e percentual dos inscritos no cargo, cada pessoa na sua semana atual. Sem elegíveis significa que o cargo ainda não chegou a este fechamento.</Text>
      </View>
      {data.cargos.length ? data.cargos.map((cargo) => <View key={cargo.cargo} style={s.cargo} wrap={false}>
        <Text style={s.cargoName}>{cargo.cargo}</Text>
        <Text style={s.subtitle}>{cargo.participantes} inscritos · {cargo.elegiveis} elegíveis na semana {semana}</Text>
        <View style={s.cargoMetrics}>
          {[
            { label: 'Ativaram', value: cargo.ativados, pct: cargo.ativacaoPct },
            { label: 'Consumiram', value: cargo.consumiram, pct: cargo.consumoPct },
            { label: 'Evidenciaram', value: cargo.evidencias, pct: cargo.evidenciaPct },
          ].map((metric) => <View key={metric.label} style={s.cargoMetric}>
            <Text style={s.caption}>{metric.label}</Text>
            <Text style={s.cargoValue}>{cargo.elegiveis ? `${metric.value} · ${metric.pct}%` : 'Sem elegíveis'}</Text>
          </View>)}
          <View style={s.cargoMetric}>
            <Text style={s.caption}>Em risco</Text>
            <Text style={{ ...s.cargoValue, color: cargo.emRisco ? colors.orangeText : colors.greenText }}>{cargo.emRisco} · {cargo.riscoPct}%</Text>
            <Text style={{ ...s.caption, marginTop: 4 }}>{cargo.criticos} críticos · {cargo.atencao} em atenção</Text>
          </View>
        </View>
        <Text style={s.cargoAction}><Text style={{ fontWeight: 600, color: colors.navy }}>Ação sugerida: </Text>{cargo.acao}</Text>
      </View>) : <Text style={s.text}>Sem dados por cargo disponíveis.</Text>}
      <View style={{ ...s.section, marginTop: 15 }} wrap={false}>
        <ReportSectionTitle>Como ler este relatório</ReportSectionTitle>
        <Text style={s.text}>Crítico: ausência de atividade na primeira semana ou em duas semanas consecutivas. Atenção: semana sem atividade, índice abaixo de 40 ou queda em relação à anterior. Índice operacional: ativação 20 + consumo 30 + evidência 40 + tutor 10. Mede atividade na jornada.</Text>
        <Text style={{ ...s.text, marginTop: 7 }}>A leitura de RH reúne prioridades por área e cargo; a do gestor permite acompanhamento nominal. O plano, os responsáveis e os prazos são sugestões para a equipe, sem atribuições ou envios automáticos.</Text>
        <Link src={detailUrl} style={{ fontSize: 9, color: colors.linkBlue, marginTop: 12 }}>Ver dados detalhados na plataforma</Link>
      </View>
      <Footer />
    </Page>
  </Document>;
}
