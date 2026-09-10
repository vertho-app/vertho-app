import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Svg, Line, Path, Circle, Link } from '@react-pdf/renderer';
import { colors, pageStyles } from './styles';
import { ReportSectionTitle } from './PdfReportCover';
import type { ReportView } from '@/lib/engajamento/relatorio-model';

const s = StyleSheet.create({
  section: { marginBottom: 14 },
  meta: { fontSize: 8, color: colors.textMuted, marginBottom: 10 },
  box: { backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, padding: 12 },
  thesis: { fontSize: 12, fontWeight: 600, color: colors.navy, marginBottom: 5 },
  text: { fontSize: 9, color: colors.textSecondary, lineHeight: 1.5 },
  caption: { fontSize: 7.5, color: colors.textMuted, lineHeight: 1.4 },
  row: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.gray200, borderRadius: 6, padding: 10 },
  count: { fontSize: 23, fontWeight: 700, color: colors.navy },
  label: { fontSize: 8, color: colors.textSecondary, marginTop: 3, marginBottom: 4 },
  delta: { fontSize: 7, marginTop: 4 },
  risk: { backgroundColor: colors.melhorarBg, borderWidth: 1, borderColor: colors.melhorarBorder, borderRadius: 8, padding: 12, marginBottom: 12 },
  riskTitle: { fontSize: 10, fontWeight: 600, color: colors.orangeText, marginBottom: 5 },
  focus: { borderWidth: 1, borderColor: colors.gray200, borderRadius: 7, padding: 9, marginBottom: 7 },
  focusName: { fontSize: 10, fontWeight: 600, color: colors.navy, flex: 1 },
  actionTitle: { fontSize: 10, fontWeight: 600, color: colors.navy, marginBottom: 4 },
  badge: { fontSize: 7, fontWeight: 600, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, marginLeft: 8 },
  subtitle: { fontSize: 8, color: colors.textMuted, marginTop: 4, marginBottom: 5 },
  secondary: { flex: 1, padding: 10, borderWidth: 1, borderColor: colors.gray200, borderRadius: 6 },
  secondaryValue: { fontSize: 13, fontWeight: 600, color: colors.navy, marginBottom: 4 },
  legend: { flexDirection: 'row', gap: 18, marginTop: 8, marginBottom: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  swatch: { width: 12, height: 3, marginRight: 5 },
  cargo: { borderWidth: 1, borderColor: colors.gray200, borderRadius: 7, padding: 12, marginBottom: 12 },
  cargoName: { fontSize: 10, fontWeight: 600, color: colors.navy },
  cargoMetrics: { flexDirection: 'row', marginTop: 10, marginBottom: 9 },
  cargoMetric: { flex: 1, paddingRight: 6 },
  cargoValue: { fontSize: 11, color: colors.navy, fontWeight: 600, marginTop: 4 },
  cargoAction: { borderTopWidth: 1, borderTopColor: colors.gray200, paddingTop: 8, fontSize: 8, color: colors.textSecondary, lineHeight: 1.4 },
});

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
      <Text style={pageStyles.footerText}>Relatório de engajamento · Confidencial</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>;
  }
  return <Document title={`Relatório de engajamento - ${empresaNome}`} author={mostrarVertho ? 'Vertho' : empresaNome}>
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
        <View style={s.row}>
          {metrics.map((metric) => <View key={metric.label} style={s.metric}>
            <Text style={s.count}>{metric.count}</Text>
            <Text style={s.label}>{metric.label}</Text>
            <Text style={s.text}>{metric.pct}% da base</Text>
            {metric.delta !== null && data.canCompare && <Text style={{ ...s.delta, color: metric.delta < 0 ? colors.flagRed : colors.textMuted }}>{delta(metric.delta)}</Text>}
          </View>)}
        </View>
        <Text style={{ ...s.caption, marginTop: 7 }}>Base elegível da semana {semana}: {data.eligible} participantes. {data.canCompare ? `Variações em pontos percentuais. Base anterior: ${data.previousEligible} pessoas.${data.previousEligible !== data.eligible ? ' A população elegível mudou entre as semanas.' : ''}` : 'Sem comparação anterior disponível.'}</Text>
      </View>
      <View style={s.section}>
        <ReportSectionTitle>Prioridades e plano de ação</ReportSectionTitle>
        <Text style={{ ...s.caption, marginBottom: 8 }}>Grupos exclusivos da semana: {data.priorities.length ? data.priorities.map((item) => `${item.label}: ${item.count} (${item.pct}%)`).join(' · ') : 'nenhuma pendência registrada'}.</Text>
        {data.actionPlan.map((action, index) => <View key={action.title} style={s.focus} wrap={false}>
          <Text style={s.actionTitle}>{index + 1}. {action.title}</Text>
          <Text style={{ ...s.text, marginTop: 5 }}>{action.description}</Text>
          <Text style={{ ...s.caption, marginTop: 6 }}>Responsável sugerido: {action.owner} · Prazo sugerido: {action.deadline}</Text>
        </View>)}
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
      <View fixed style={{ paddingBottom: 12 }}>
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
    <Page size="A4" style={pageStyles.page}>
      <Header />
      <Text style={s.meta}>{empresaNome} · {period}</Text>
      <View style={s.section} wrap={false}>
        <ReportSectionTitle>Evolução semanal</ReportSectionTitle>
        <Text style={s.caption}>Percentuais sobre os elegíveis de cada semana. O tamanho da base pode mudar.</Text>
        <Trend data={data} />
      </View>
      <ReportSectionTitle>{data.focusTitle}</ReportSectionTitle>
      <Text style={{ ...s.text, marginBottom: 12 }}>{data.focusSubtitle}</Text>
      <View style={s.risk} wrap={false}>
        <Text style={s.riskTitle}>{data.risk.total} pessoas requerem acompanhamento</Text>
        <Text style={s.text}>{data.risk.critical} em trajetória crítica · {data.risk.attention} em atenção</Text>
        <Text style={{ ...s.caption, marginTop: 5 }}>Base do risco: trajetória individual dos {inscritos} inscritos, cada um na sua semana atual. Base dos indicadores: {data.eligible} elegíveis na semana {semana}.</Text>
      </View>
      {data.focusItems.length ? data.focusItems.map((item, index) => <View key={`${item.name}-${index}`} style={s.focus} wrap={false}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text style={s.focusName}>{index + 1}. {item.name}</Text>
          <Text style={{ ...s.badge, backgroundColor: item.signal === 'critical' ? '#FEF2F2' : item.signal === 'positive' ? '#F0FDF4' : '#FFFBEB', color: item.signal === 'critical' ? colors.flagRed : item.signal === 'positive' ? colors.greenText : colors.yellowText }}>{item.label}</Text>
        </View>
        <Text style={s.subtitle}>{item.context}</Text>
        <Text style={s.text}>{item.reason}</Text>
      </View>) : <Text style={s.text}>Ninguém em acompanhamento nesta semana.</Text>}
      <Footer />
    </Page>
  </Document>;
}
