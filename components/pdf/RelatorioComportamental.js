import React from 'react';
import { Document, Page, View, Text, StyleSheet, Svg, Polygon, Polyline, Line, Path, Circle, G } from '@react-pdf/renderer';
import PageBackground from './PageBackground';
import { colors as palette, pageStyles } from './styles';

// ── Paleta do relatório (alinhada à tela do app: sem vermelho) ──────────────
const NAVY = '#0F2B54';
const TEAL = '#0D9488';
const TXT = '#1E293B';
const TXT_MUTED = '#64748B';
const TXT_LIGHT = '#94A3B8';
const BG_GRAY = '#F8FAFC';
const BORDER = '#E2E8F0';

const DISC = {
  D: { bg: '#FEF9C3', border: '#FACC15', text: '#854D0E', bar: '#EAB308' },
  I: { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E', bar: '#F59E0B' },
  S: { bg: '#D1FAE5', border: '#34D399', text: '#065F46', bar: '#10B981' },
  C: { bg: '#DBEAFE', border: '#60A5FA', text: '#1E40AF', bar: '#3B82F6' },
};

// ── Layout base ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    fontFamily: 'NotoSans',
    paddingTop: 110,
    paddingBottom: 50,
    paddingHorizontal: 36,
    fontSize: 9.5,
    color: TXT,
  },
  // Header / footer absolutos (o background ja entrega visual; aqui só metadados)
  topMeta: {
    position: 'absolute',
    top: 60,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: TXT_LIGHT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    paddingTop: 5,
    fontSize: 7,
    color: NAVY,
    fontWeight: 700,
  },
  h1: { fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 2 },
  h2: { fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 2 },
  h3: { fontSize: 9, fontWeight: 700, color: TXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.8 },
  small: { fontSize: 8, color: TXT_LIGHT },
  body: { fontSize: 9, color: TXT_MUTED, lineHeight: 1.55 },

  card: {
    backgroundColor: BG_GRAY,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
});

function PageFrame({ children, pageNum, total }) {
  return (
    <Page size="A4" style={s.page}>
      <PageBackground />

      <View style={s.topMeta} fixed>
        <Text>Relatório Vertho.AI</Text>
        <Text>Relatório Comportamental</Text>
      </View>

      {children}

      <View style={s.footer} fixed>
        <Text>Vertho Mentor IA — Confidencial</Text>
        <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </View>
    </Page>
  );
}

// ── Sub: barra DISC (para listas Natural / Adaptado) ────────────────────────
function DISCBar({ label, value, barColor = '#94A3B8' }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
      <Text style={{ width: 12, fontSize: 9, fontWeight: 700, color: TXT_MUTED }}>{label}</Text>
      <View style={{
        flex: 1,
        height: 14,
        backgroundColor: '#F1F5F9',
        borderRadius: 7,
        overflow: 'hidden',
        position: 'relative',
      }}>
        <View style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: barColor,
          borderRadius: 7,
        }} />
        <Text style={{
          position: 'absolute',
          right: 6,
          top: 1,
          fontSize: 8,
          fontWeight: 700,
          color: TXT,
        }}>{Math.round(pct)}</Text>
      </View>
    </View>
  );
}

// ── Sub: Radar de competências (SVG do react-pdf) ───────────────────────────
function RadarCompetencias({ competencias }) {
  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const levels = 5;
  const maxVal = 100;
  const n = competencias.length;
  const r0 = size / 2 - 30;

  const point = (i, value) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (value / maxVal) * r0;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  const grid = [];
  for (let l = 1; l <= levels; l++) {
    const r = (l / levels) * r0;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2;
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
    }
    grid.push(pts.join(' '));
  }

  const naturalPts = competencias.map((c, i) => point(i, c.natural).join(',')).join(' ');
  const adaptadoPts = competencias.map((c, i) => point(i, c.adaptado).join(',')).join(' ');

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {grid.map((pts, i) => (
        <Polygon key={`g${i}`} points={pts} fill="none" stroke={BORDER} strokeWidth={0.5} />
      ))}
      {competencias.map((_, i) => {
        const [x, y] = point(i, maxVal);
        return <Line key={`a${i}`} x1={cx} y1={cy} x2={x} y2={y} stroke={BORDER} strokeWidth={0.5} />;
      })}
      <Polygon points={naturalPts} fill="rgba(45,212,191,0.18)" stroke={TEAL} strokeWidth={1.5} />
      <Polygon points={adaptadoPts} fill="rgba(252,211,77,0.10)" stroke="#FCD34D" strokeWidth={1} strokeDasharray="3,2" />
      {competencias.map((c, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lr = size / 2 - 8;
        const x = cx + lr * Math.cos(angle);
        const y = cy + lr * Math.sin(angle);
        const abbr = c.nome.slice(0, 3).toUpperCase();
        return (
          <Text key={`l${i}`} x={x} y={y + 2} style={{ fontSize: 6, fill: TXT_MUTED, textAnchor: 'middle' }}>
            {abbr}
          </Text>
        );
      })}
    </Svg>
  );
}

// ── Sub: pizza de liderança ─────────────────────────────────────────────────
function LeadershipPie({ data }) {
  const segments = [
    { label: 'Executivo', value: data.executivo, color: DISC.D.bar },
    { label: 'Motivador', value: data.motivador, color: DISC.I.bar },
    { label: 'Metódico', value: data.metodico, color: DISC.S.bar },
    { label: 'Sistemático', value: data.sistematico, color: DISC.C.bar },
  ];
  const total = segments.reduce((acc, s) => acc + (s.value || 0), 0) || 100;
  const cx = 60;
  const cy = 60;
  const r = 50;
  let cumulative = 0;
  const paths = segments.map((seg) => {
    const start = cumulative;
    cumulative += seg.value || 0;
    const startAngle = (start / total) * 2 * Math.PI - Math.PI / 2;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = (seg.value || 0) > total / 2 ? 1 : 0;
    return { d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, color: seg.color };
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Svg width={120} height={120} viewBox="0 0 120 120">
        {paths.map((p, i) => (
          <Path key={i} d={p.d} fill={p.color} stroke="#FFFFFF" strokeWidth={1} />
        ))}
      </Svg>
      <View style={{ marginLeft: 10 }}>
        {segments.map(seg => (
          <View key={seg.label} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: seg.color, marginRight: 5 }} />
            <Text style={{ fontSize: 9, color: TXT_MUTED }}>
              {seg.label}: <Text style={{ fontWeight: 700, color: TXT }}>{Math.round(seg.value || 0)}%</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Sub: barra Tipo Psicológico (centro-pivot) ──────────────────────────────
function PsychBar({ left, right, value }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
      <Text style={{ width: 70, fontSize: 8, color: TXT_MUTED, textAlign: 'right', fontWeight: 700 }}>
        {left} {Math.round(v)}%
      </Text>
      <View style={{ flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, marginHorizontal: 6, overflow: 'hidden' }}>
        <View style={{ width: `${v}%`, height: '100%', backgroundColor: '#A5B4FC', borderRadius: 4 }} />
      </View>
      <Text style={{ width: 70, fontSize: 8, color: TXT_LIGHT }}>
        {right} {Math.round(100 - v)}%
      </Text>
    </View>
  );
}

// ============================================================
// PAGE 1 — Capa + DISC intro + snapshot + síntese
// ============================================================
function Page1({ raw, texts }) {
  const discDesc = [
    { letter: 'D', title: 'Dominância', sub: 'Como lida com desafios', desc: 'Resultados, ação e ousadia' },
    { letter: 'I', title: 'Influência', sub: 'Como lida com pessoas', desc: 'Comunicação, entusiasmo e persuasão' },
    { letter: 'S', title: 'Estabilidade', sub: 'Como dita o ritmo', desc: 'Paciência, consistência, equilíbrio' },
    { letter: 'C', title: 'Conformidade', sub: 'Como lida com regras', desc: 'Precisão, organização e cautela' },
  ];

  return (
    <PageFrame pageNum={1}>
      {/* Capa central */}
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <Text style={{ fontSize: 8, color: TXT_LIGHT, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 2 }}>
          Mapeamento de Perfil Comportamental
        </Text>
        <Text style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 2 }}>{raw.nome}</Text>
        <Text style={{ fontSize: 8, color: TXT_LIGHT }}>
          Realizado em {new Date(raw.data_realizacao).toLocaleDateString('pt-BR')}
        </Text>
      </View>

      {/* Micro-explicação DISC */}
      <View style={{ backgroundColor: BG_GRAY, borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <Text style={{ fontSize: 8.5, color: TXT_MUTED, textAlign: 'center', marginBottom: 8, lineHeight: 1.5 }}>
          Este relatório mapeia seu perfil em 4 dimensões comportamentais que descrevem como você lida com desafios,
          pessoas, ritmo e regras. Todos nós temos as 4 dimensões em intensidades diferentes — não existe perfil certo
          ou errado.
        </Text>
        <View style={{ flexDirection: 'row' }}>
          {discDesc.map(d => {
            const c = DISC[d.letter];
            return (
              <View key={d.letter} style={{
                flex: 1,
                marginHorizontal: 2,
                backgroundColor: c.bg,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 6,
                padding: 6,
                alignItems: 'center',
              }}>
                <Text style={{ fontSize: 22, fontWeight: 700, color: c.text }}>{d.letter}</Text>
                <Text style={{ fontSize: 8, fontWeight: 700, color: TXT }}>{d.title}</Text>
                <Text style={{ fontSize: 6.5, color: TXT_MUTED, marginTop: 1 }}>{d.sub}</Text>
                <Text style={{ fontSize: 6.5, color: TXT_LIGHT, textAlign: 'center', marginTop: 1 }}>{d.desc}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Badge perfil dominante + índices */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <View style={{
          backgroundColor: NAVY,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
          marginRight: 14,
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: 700 }}>PERFIL {raw.perfil_dominante}</Text>
        </View>
        {[
          { l: 'Positividade', v: raw.indices.positividade },
          { l: 'Estima', v: raw.indices.estima },
          { l: 'Flexibilidade', v: raw.indices.flexibilidade },
        ].map(idx => (
          <View key={idx.l} style={{ alignItems: 'center', marginHorizontal: 8 }}>
            <Text style={{ fontSize: 7, color: TXT_LIGHT }}>{idx.l}</Text>
            <Text style={{ fontSize: 11, fontWeight: 700, color: TEAL }}>{Number(idx.v).toFixed(2)}</Text>
          </View>
        ))}
      </View>

      {/* DISC Natural / Adaptado lado a lado */}
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ ...s.h3, textAlign: 'center', marginBottom: 6 }}>
            Natural — quem você é
          </Text>
          {['D', 'I', 'S', 'C'].map(d => (
            <DISCBar key={`n${d}`} label={d} value={raw.disc_natural[d]} barColor={DISC[d].bar} />
          ))}
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={{ ...s.h3, textAlign: 'center', marginBottom: 6 }}>
            Adaptado — exigência do ambiente
          </Text>
          {['D', 'I', 'S', 'C'].map(d => (
            <DISCBar key={`a${d}`} label={d} value={raw.disc_adaptado[d]} barColor="#94A3B8" />
          ))}
        </View>
      </View>

      {/* Síntese (navy) */}
      <View style={{ backgroundColor: NAVY, borderRadius: 8, padding: 12 }}>
        <Text style={{ fontSize: 9.5, color: '#FFFFFF', lineHeight: 1.6 }}>
          {texts.sintese_perfil}
        </Text>
      </View>
    </PageFrame>
  );
}

// ============================================================
// PAGE 2 — 4 quadrantes DISC
// ============================================================
function Page2({ raw, texts }) {
  const quadrants = [
    { key: 'D', title: 'Como lida com desafios', data: texts.quadrante_D, n: raw.disc_natural.D, a: raw.disc_adaptado.D },
    { key: 'I', title: 'Como lida com pessoas', data: texts.quadrante_I, n: raw.disc_natural.I, a: raw.disc_adaptado.I },
    { key: 'S', title: 'Como dita o ritmo', data: texts.quadrante_S, n: raw.disc_natural.S, a: raw.disc_adaptado.S },
    { key: 'C', title: 'Como lida com regras', data: texts.quadrante_C, n: raw.disc_natural.C, a: raw.disc_adaptado.C },
  ];

  return (
    <PageFrame pageNum={2}>
      <Text style={s.h1}>Como Você Funciona</Text>
      <Text style={{ ...s.small, marginBottom: 12 }}>Seus 4 estilos comportamentais em detalhe</Text>

      {/* 2x2 grid */}
      {[0, 2].map(rowStart => (
        <View key={rowStart} style={{ flexDirection: 'row', marginBottom: 8 }}>
          {[0, 1].map(off => {
            const q = quadrants[rowStart + off];
            const c = DISC[q.key];
            return (
              <View key={q.key} style={{
                flex: 1,
                marginHorizontal: 4,
                backgroundColor: c.bg,
                borderLeftWidth: 4,
                borderLeftColor: c.bar,
                borderRadius: 6,
                padding: 10,
              }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 7, color: TXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {q.title}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>
                      {q.data?.titulo_traco || '—'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: 6 }}>
                    <Text style={{ fontSize: 6.5, color: TXT_LIGHT }}>Natural</Text>
                    <Text style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{Math.round(q.n)}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 8.5, color: TXT_MUTED, lineHeight: 1.5, marginBottom: 4 }}>
                  {q.data?.descricao || ''}
                </Text>
                {q.data?.adaptacao ? (
                  <Text style={{ fontSize: 7.5, color: TXT_LIGHT, fontStyle: 'italic', borderTopWidth: 0.5, borderTopColor: BORDER, paddingTop: 4 }}>
                    Adaptado {Math.round(q.a)} — {q.data.adaptacao}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </PageFrame>
  );
}

// ============================================================
// PAGE 3 — Mapa de competências (radar) + Top 5 forças/desenvolver
// ============================================================
function Page3({ raw, texts }) {
  const compMap = Object.fromEntries((raw.competencias || []).map(c => [c.nome, c.natural]));

  return (
    <PageFrame pageNum={3}>
      <Text style={s.h1}>Mapa de Competências</Text>
      <Text style={{ ...s.small, marginBottom: 8 }}>
        16 competências comportamentais — natural (verde-azulado) e adaptado (amarelo tracejado)
      </Text>

      <View style={{ alignItems: 'center', marginBottom: 6 }}>
        <RadarCompetencias competencias={raw.competencias} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 14 }}>
          <View style={{ width: 10, height: 2, backgroundColor: TEAL, marginRight: 4 }} />
          <Text style={{ fontSize: 7, color: TXT_MUTED }}>Natural</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 10, height: 2, backgroundColor: '#FCD34D', marginRight: 4 }} />
          <Text style={{ fontSize: 7, color: TXT_MUTED }}>Adaptado</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <Text style={{ fontSize: 8.5, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
            Suas 5 maiores forças
          </Text>
          {(texts.top5_forcas || []).map((f, i) => (
            <View key={i} style={{
              backgroundColor: '#ECFDF5',
              borderRadius: 4,
              padding: 6,
              marginBottom: 4,
              flexDirection: 'row',
              alignItems: 'flex-start',
            }}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: '#059669', width: 22, textAlign: 'right' }}>
                {compMap[f.competencia] != null ? Math.round(compMap[f.competencia]) : '-'}
              </Text>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={{ fontSize: 8.5, fontWeight: 700, color: TXT }}>{f.competencia}</Text>
                <Text style={{ fontSize: 7.5, color: TXT_MUTED, lineHeight: 1.4 }}>{f.frase}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={{ fontSize: 8.5, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>
            5 oportunidades de desenvolvimento
          </Text>
          {(texts.top5_desenvolver || []).map((d, i) => (
            <View key={i} style={{
              backgroundColor: '#FEF3C7',
              borderRadius: 4,
              padding: 6,
              marginBottom: 4,
              flexDirection: 'row',
              alignItems: 'flex-start',
            }}>
              <Text style={{ fontSize: 11, fontWeight: 700, color: '#D97706', width: 22, textAlign: 'right' }}>
                {compMap[d.competencia] != null ? Math.round(compMap[d.competencia]) : '-'}
              </Text>
              <View style={{ flex: 1, marginLeft: 6 }}>
                <Text style={{ fontSize: 8.5, fontWeight: 700, color: TXT }}>{d.competencia}</Text>
                <Text style={{ fontSize: 7.5, color: TXT_MUTED, lineHeight: 1.4 }}>{d.frase}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </PageFrame>
  );
}

// ============================================================
// PAGE 4 — Liderança + Tipo Psicológico
// ============================================================
function Page4({ raw, texts }) {
  return (
    <PageFrame pageNum={4}>
      <Text style={s.h1}>Estilo de Liderança</Text>
      <Text style={{ ...s.small, marginBottom: 10 }}>Como você tende a liderar e influenciar sua equipe</Text>

      <View style={{ flexDirection: 'row', marginBottom: 14 }}>
        <View style={{ marginRight: 14 }}>
          <LeadershipPie data={raw.lideranca} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 9, color: TXT_MUTED, lineHeight: 1.55, marginBottom: 8 }}>
            {texts.lideranca_sintese}
          </Text>
          <View style={{ backgroundColor: '#FEF3C7', borderLeftWidth: 2, borderLeftColor: '#F59E0B', padding: 8, borderRadius: 4 }}>
            <Text style={{ fontSize: 8, fontWeight: 700, color: '#92400E', marginBottom: 2 }}>Oportunidades</Text>
            <Text style={{ fontSize: 8.5, color: TXT_MUTED, lineHeight: 1.5 }}>{texts.lideranca_trabalhar}</Text>
          </View>
        </View>
      </View>

      <View style={{ borderTopWidth: 0.5, borderTopColor: BORDER, marginVertical: 10 }} />

      <Text style={s.h1}>Tipo Psicológico</Text>
      <Text style={{ ...s.small, marginBottom: 10 }}>
        Baseado nos conceitos de Carl G. Jung — como você foca atenção, capta informações e tira conclusões
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{
          backgroundColor: NAVY,
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 6,
          marginRight: 12,
        }}>
          <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
            {raw.tipo_psicologico.tipo}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <PsychBar left="Extroversão" right="Introversão" value={raw.tipo_psicologico.extroversao} />
          <PsychBar left="Intuição" right="Sensação" value={raw.tipo_psicologico.intuicao} />
          <PsychBar left="Pensamento" right="Sentimento" value={raw.tipo_psicologico.pensamento} />
        </View>
      </View>

      <View style={{ flexDirection: 'row' }}>
        {[
          {
            label: 'Onde foca atenção',
            val: raw.tipo_psicologico.extroversao,
            high: 'Extroversão — foco no mundo exterior, pessoas e experiências',
            low: 'Introversão — foco no mundo interior, reflexões e emoções',
          },
          {
            label: 'Como capta informações',
            val: raw.tipo_psicologico.intuicao,
            high: 'Intuição — visão global, possibilidades e futuro',
            low: 'Sensação — fatos concretos, detalhes e experiência',
          },
          {
            label: 'Como tira conclusões',
            val: raw.tipo_psicologico.pensamento,
            high: 'Pensamento — lógica, análise e causa-efeito',
            low: 'Sentimento — valores pessoais, impacto nas pessoas',
          },
        ].map(item => (
          <View key={item.label} style={{
            flex: 1,
            backgroundColor: BG_GRAY,
            borderRadius: 5,
            padding: 8,
            marginHorizontal: 3,
          }}>
            <Text style={{ fontSize: 7, fontWeight: 700, color: TXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
              {item.label}
            </Text>
            <Text style={{ fontSize: 8, color: TXT_MUTED, lineHeight: 1.45 }}>
              {item.val > 50 ? item.high : item.val < 50 ? item.low : 'Equilíbrio entre as duas orientações'}
            </Text>
          </View>
        ))}
      </View>
    </PageFrame>
  );
}

// ============================================================
// PAGE 5 — Pontos a desenvolver + plano de ação
// ============================================================
function Page5({ raw, texts }) {
  const firstName = (raw.nome || '').split(' ')[0] || raw.nome;
  const pontos = texts.pontos_desenvolver_pressao || [];

  return (
    <PageFrame pageNum={5}>
      <Text style={s.h1}>Pontos a Desenvolver</Text>
      <Text style={{ ...s.small, marginBottom: 10 }}>
        Sob pressão ou estresse, pessoas com perfil {raw.perfil_dominante} podem apresentar estes comportamentos.
        Marque os que você reconhece em si:
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
        {pontos.map((p, i) => (
          <View key={i} style={{
            width: '48%',
            marginRight: i % 2 === 0 ? '4%' : 0,
            marginBottom: 6,
            backgroundColor: NAVY,
            borderRadius: 4,
            padding: 8,
            flexDirection: 'row',
            alignItems: 'flex-start',
          }}>
            <View style={{
              width: 10,
              height: 10,
              borderWidth: 1.5,
              borderColor: '#FCD34D',
              borderRadius: 2,
              marginRight: 6,
              marginTop: 1,
            }} />
            <Text style={{ flex: 1, fontSize: 8.5, color: '#FFFFFF', lineHeight: 1.4 }}>{p}</Text>
          </View>
        ))}
      </View>

      <View style={{ backgroundColor: BG_GRAY, borderRadius: 8, padding: 14 }}>
        <Text style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Meu Plano de Ação</Text>
        <Text style={{ fontSize: 8.5, color: TXT_MUTED, marginBottom: 12 }}>
          {firstName}, use as reflexões deste relatório para traçar seu plano de desenvolvimento.
        </Text>

        {[
          { num: '1', q: 'O que vou desenvolver?', hint: 'Escolha 1 a 3 comportamentos que mais impactam sua eficácia' },
          { num: '2', q: 'Como vou fazer?', hint: 'Ações concretas, cursos, prática no dia a dia, mentoria...' },
          { num: '3', q: 'Até quando?', hint: 'Defina um prazo realista para ver os primeiros resultados' },
        ].map(item => (
          <View key={item.num} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <View style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: TEAL,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 6,
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: 700 }}>{item.num}</Text>
              </View>
              <Text style={{ fontSize: 10, fontWeight: 700, color: TXT }}>{item.q}</Text>
            </View>
            <Text style={{ fontSize: 7.5, color: TXT_LIGHT, marginLeft: 22, marginBottom: 4 }}>{item.hint}</Text>
            <View style={{ marginLeft: 22, borderBottomWidth: 0.5, borderBottomColor: '#CBD5E1', height: 18 }} />
          </View>
        ))}
      </View>
    </PageFrame>
  );
}

// ============================================================
// MAIN
// ============================================================
export default function RelatorioComportamentalPDF({ data }) {
  if (!data?.raw || !data?.texts) return null;
  const { raw, texts } = data;
  return (
    <Document title={`Relatório Comportamental — ${raw.nome}`}>
      <Page1 raw={raw} texts={texts} />
      <Page2 raw={raw} texts={texts} />
      <Page3 raw={raw} texts={texts} />
      <Page4 raw={raw} texts={texts} />
      <Page5 raw={raw} texts={texts} />
    </Document>
  );
}
