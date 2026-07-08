/**
 * Perfil Organizacional (DNA comportamental DISC) — PDF premium branded.
 * Consome o agregado (lib/perfil-organizacional/aggregate) e renderiza o
 * relatório coletivo: perfil médio DISC, valores, liderança, mapa de
 * competências (radar), fatores altos/baixos, talentos, destaques e grid
 * individual. Reusa NotoSans + paleta Vertho. Sem emoji.
 */
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Svg, Path, Polygon, Line } from '@react-pdf/renderer';
import '@/components/pdf/styles';
import PdfReportCover from '@/components/pdf/PdfReportCover'; // registra Fraunces globalmente
import { getLogoCoverBase64, getReportCoverBgBase64 } from '@/lib/pdf-assets';
import type { PerfilOrg, DiscMedia, Fator } from './perfil-organizacional/aggregate';

const C = {
  navy: '#142F57', cyan: '#34C5CC', gold: '#C8941F', white: '#FFFFFF',
  text: '#142F57', sub: '#5F6B7A', border: '#E2E8F0', bg: '#F4F7FA',
  d: '#E5484D', i: '#F0922B', s: '#3FA66A', c: '#2BA3A8',
  natural: '#34C5CC', adaptado: '#E5484D',
};
const FAT_COLOR: Record<Fator, string> = { D: C.d, I: C.i, S: C.s, C: C.c };

const s = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 9, color: C.text, paddingBottom: 44 },
  // capa
  cover: { backgroundColor: C.navy, height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  coverLogo: { width: 230, height: 54, marginBottom: 8 }, // ratio natural ~4.23 (3148x744)
  coverKicker: { color: '#9FB0C6', fontSize: 16, marginTop: 30 },
  coverTitle: { color: C.white, fontSize: 30, fontWeight: 700, marginTop: 2 },
  coverMeta: { color: C.cyan, fontSize: 11, fontWeight: 700, marginTop: 18, letterSpacing: 0.5 },
  coverSub: { color: '#9FB0C6', fontSize: 9, marginTop: 4 },
  // header páginas internas
  header: { paddingHorizontal: 34, paddingTop: 26, paddingBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hTitle: { color: '#5B7BC4', fontSize: 23, fontWeight: 700 },
  hLogo: { width: 92, height: 22 }, // ratio natural ~4.23
  body: { paddingHorizontal: 34, paddingTop: 6 },
  p: { fontSize: 9.5, color: '#3A4658', lineHeight: 1.5, marginBottom: 8 },
  secBar: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  secBarV: { width: 5, height: 16, backgroundColor: C.cyan, marginRight: 7, borderRadius: 2 },
  secBarT: { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 13, color: C.navy },
  twoCol: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  // DISC capsule chart
  discBox: { backgroundColor: '#EAF6F6', borderRadius: 10, padding: 14, position: 'relative' },
  discBadge: { position: 'absolute', top: 10, right: 10, backgroundColor: C.s, color: C.white, fontSize: 10, fontWeight: 700, borderRadius: 14, width: 28, height: 28, textAlign: 'center', paddingTop: 7 },
  discTag: { position: 'absolute', top: 12, left: 12, backgroundColor: C.s, color: C.white, fontSize: 8, fontWeight: 700, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  discRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 130, marginTop: 30 },
  discCol: { alignItems: 'center', width: 42 },
  discVal: { fontSize: 11, fontWeight: 700, color: C.navy, marginBottom: 2 },
  discLetter: { fontSize: 10, fontWeight: 700, color: C.sub, marginTop: 4 },
  // factor foco cards
  focoCard: { borderWidth: 1, borderColor: C.border, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 7 },
  focoMedia: { fontSize: 10, fontWeight: 700, color: C.navy },
  focoTema: { fontSize: 9.5, fontWeight: 700 },
  // valores bars
  valRow: { marginBottom: 7 },
  valNome: { fontSize: 9.5, fontWeight: 700, color: C.navy },
  valBarBg: { height: 13, backgroundColor: '#E8EDF3', borderRadius: 7, marginTop: 3, flexDirection: 'row', alignItems: 'center' },
  valBar: { height: 13, borderRadius: 7 },
  valNum: { fontSize: 9, fontWeight: 700, color: C.navy, marginLeft: 6 },
  valMot: { fontSize: 8, color: C.sub, marginTop: 2 },
  grpLabel: { fontSize: 9, fontWeight: 700, color: C.navy, marginTop: 6, marginBottom: 2 },
  grpDesc: { fontSize: 7.5, color: C.sub, marginBottom: 4 },
  chip: { color: C.white, fontSize: 9, fontWeight: 700, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 5 },
  // fatores alto/baixo
  fbBar: { flexDirection: 'row', height: 34, borderRadius: 6, overflow: 'hidden', marginTop: 12 },
  fbLeft: { justifyContent: 'center', paddingHorizontal: 10 },
  fbRight: { justifyContent: 'center', paddingHorizontal: 10, alignItems: 'flex-end' },
  fbPct: { color: C.white, fontSize: 12, fontWeight: 700 },
  fbLbl: { color: C.white, fontSize: 7.5 },
  fbCounts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 6 },
  fbCount: { fontSize: 14, fontWeight: 700, color: C.navy },
  // talentos
  talRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  talNome: { width: 110, fontSize: 9, fontWeight: 700, color: C.navy },
  talBarBg: { flex: 1, height: 14, backgroundColor: '#E8EDF3', borderRadius: 7 },
  talBar: { height: 14, borderRadius: 7 },
  talPct: { width: 40, fontSize: 9, fontWeight: 700, color: C.navy, textAlign: 'right' },
  // destaques
  destRow: { flexDirection: 'row', marginBottom: 5, gap: 8 },
  destCell: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: C.navy, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8 },
  destDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: C.gold, marginRight: 7 },
  destTxt: { color: '#D8E0EC', fontSize: 8.5, fontWeight: 700 },
  // grid individual
  gItem: { width: '31.5%', backgroundColor: '#EAF6F6', borderRadius: 8, padding: 7, marginBottom: 8, marginRight: '1.5%' },
  gNome: { fontSize: 7.5, fontWeight: 700, color: C.navy, marginBottom: 3 },
  legendRow: { flexDirection: 'row', gap: 14, marginTop: 6, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendTx: { fontSize: 8, color: C.sub },
  footer: { position: 'absolute', bottom: 16, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#94A3B8' },
});

// ── DISC capsule chart ──────────────────────────────────────────────────────
function DiscChart({ m, label, badge }: { m: DiscMedia; label: string; badge: string }) {
  const bars: [Fator, number, string][] = [['D', m.d, C.d], ['I', m.i, C.i], ['S', m.s, C.s], ['C', m.c, C.c]];
  return (
    <View style={s.discBox}>
      <Text style={s.discTag}>{label}</Text>
      <Text style={s.discBadge}>{badge}</Text>
      <View style={s.discRow}>
        {bars.map(([f, v, col]) => (
          <View key={f} style={s.discCol}>
            <Text style={s.discVal}>{Math.round(v)}</Text>
            <View style={{ width: 20, height: Math.max(6, (v / 100) * 96), backgroundColor: col, borderRadius: 10 }} />
            <Text style={s.discLetter}>{f}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function FocoCards({ p }: { p: PerfilOrg }) {
  return (
    <View>
      {p.fatoresOrdem.map((f) => (
        <View key={f.fator} style={s.focoCard}>
          <Text style={s.focoMedia}>{f.nome} Média: {f.media}</Text>
          <Text style={[s.focoTema, { color: FAT_COLOR[f.fator] }]}>Indica Foco Em {f.foco}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Pizza de liderança (SVG) ────────────────────────────────────────────────
function LiderancaPie({ p }: { p: PerfilOrg }) {
  const cx = 80, cy = 80, R = 72;
  const cols = [C.d, C.i, C.s, C.c];
  let acc = -Math.PI / 2;
  const slices = p.lideranca.dist.map((d, idx) => {
    const ang = (d.pct / 100) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(acc), y1 = cy + R * Math.sin(acc);
    acc += ang;
    const x2 = cx + R * Math.cos(acc), y2 = cy + R * Math.sin(acc);
    const large = ang > Math.PI ? 1 : 0;
    const mid = acc - ang / 2;
    return { path: `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`, col: cols[idx], lx: cx + R * 0.6 * Math.cos(mid), ly: cy + R * 0.6 * Math.sin(mid), pct: d.pct, nome: d.nome };
  });
  return (
    <Svg width={160} height={160}>
      {slices.map((sl, i) => <Path key={i} d={sl.path} fill={sl.col} />)}
      {slices.map((sl, i) => <Text key={'t' + i} x={sl.lx} y={sl.ly} style={{ fontSize: 8, fontWeight: 700 }} fill={C.white} textAnchor="middle">{sl.pct}%</Text>)}
    </Svg>
  );
}

// ── Radar de competências (SVG) ─────────────────────────────────────────────
function CompRadar({ p }: { p: PerfilOrg }) {
  const cx = 150, cy = 150, R = 120;
  const N = p.competencias.length;
  const pt = (val: number, idx: number) => {
    const ang = -Math.PI / 2 + (idx / N) * 2 * Math.PI;
    const r = (val / 100) * R;
    return [cx + r * Math.cos(ang), cy + r * Math.sin(ang)];
  };
  const poly = (key: 'natural' | 'adaptado') => p.competencias.map((c, i) => pt(c[key], i).join(',')).join(' ');
  const rings = [25, 50, 75, 100];
  return (
    <Svg width={300} height={300}>
      {rings.map((rg, i) => <Polygon key={i} points={p.competencias.map((_, idx) => pt(rg, idx).join(',')).join(' ')} stroke="#CBD5E1" strokeWidth={0.5} fill="none" />)}
      {p.competencias.map((c, i) => { const [x, y] = pt(100, i); return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#E2E8F0" strokeWidth={0.5} />; })}
      {p.temCompAdapt ? <Polygon points={poly('adaptado')} stroke={C.adaptado} strokeWidth={1.5} fill={C.adaptado} fillOpacity={0.12} /> : null}
      <Polygon points={poly('natural')} stroke={C.natural} strokeWidth={1.5} fill={C.natural} fillOpacity={0.18} />
      {p.competencias.map((c, i) => { const [x, y] = pt(112, i); return <Text key={i} x={x} y={y} style={{ fontSize: 5.5 }} fill={C.sub} textAnchor="middle">{c.nome}</Text>; })}
    </Svg>
  );
}

function CompCompare({ c, temAdapt }: { c: PerfilOrg['competencias'][number]; temAdapt: boolean }) {
  const linhas: [string, number, string][] = temAdapt
    ? [['Natural', c.natural, C.natural], ['Adaptado', c.adaptado, C.adaptado]]
    : [['Natural', c.natural, C.natural]];
  return (
    <View style={{ marginBottom: 7 }}>
      <Text style={{ fontSize: 9, fontWeight: 700, color: C.navy }}>{c.nome.toUpperCase()}</Text>
      <Text style={{ fontSize: 7.5, color: C.sub, marginBottom: 3 }}>{c.desc}</Text>
      {linhas.map(([lbl, v, col]) => (
        <View key={lbl} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
          <Text style={{ width: 48, fontSize: 7, color: C.sub }}>{lbl}</Text>
          <View style={{ flex: 1, height: 11, backgroundColor: '#E8EDF3', borderRadius: 6 }}>
            <View style={{ width: `${Math.min(100, v)}%`, height: 11, backgroundColor: col, borderRadius: 6 }} />
          </View>
          <Text style={{ width: 34, fontSize: 8, fontWeight: 700, color: C.navy, textAlign: 'right' }}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

function SecTitle({ children }: { children: string }) {
  return <View style={s.secBar}><View style={s.secBarV} /><Text style={s.secBarT}>{children}</Text></View>;
}
function PageHeader({ title }: { title: string }) {
  const logo = getLogoCoverBase64();
  return <View style={s.header}><Text style={s.hTitle}>{title}</Text>{logo ? <Image src={logo} style={s.hLogo} /> : null}</View>;
}
function Footer() {
  return <View style={s.footer} fixed><Text>Vertho — Perfil Organizacional</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>;
}

interface Params { empresaNome: string; dataRef: string; solicitadoPor?: string | null; p: PerfilOrg }

function PerfilOrgDoc({ empresaNome, p }: Params) {
  const logo = getLogoCoverBase64();
  const badge = p.perfilDominante;
  return (
    <Document title={`Perfil Organizacional — ${empresaNome}`} author="Vertho">
      {/* Capa editorial */}
      <PdfReportCover
        bgBase64={getReportCoverBgBase64()}
        logoBase64={logo}
        overline={'Perfil Organizacional · DISC'}
        titulo={['Perfil', 'Organizacional']}
        nome={empresaNome}
        tagline={'O DNA comportamental da sua equipe.'}
      />

      {/* Visão Panorâmica */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Visão Panorâmica" />
        <View style={s.body}>
          <Text style={{ fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Perfil MÉDIO do Grupo  ·  {p.arquetipo.nome} ({p.perfilDominante})</Text>
          <View style={s.twoCol}>
            <View style={s.col}><DiscChart m={p.natural} label="NATURAL" badge={badge} /></View>
            <View style={s.col}><FocoCards p={p} /></View>
          </View>
          <View style={[s.twoCol, { marginTop: 16 }]}>
            <View style={s.col}>
              <Text style={s.grpLabel}>Estilo de Liderança Médio</Text>
              <Text style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>O {p.lideranca.nome}</Text>
              <Text style={{ fontSize: 9, color: C.sub, marginBottom: 8 }}>{p.lideranca.vinculo}</Text>
              {p.lideranca.dist.map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                  <Text style={{ width: 78, fontSize: 8.5, fontWeight: 700, color: C.navy }}>{d.nome}</Text>
                  <View style={{ flex: 1, height: 11, backgroundColor: '#E8EDF3', borderRadius: 6 }}>
                    <View style={{ width: `${d.pct}%`, height: 11, backgroundColor: [C.d, C.i, C.s, C.c][i], borderRadius: 6 }} />
                  </View>
                  <Text style={{ width: 36, fontSize: 8.5, fontWeight: 700, color: C.navy, textAlign: 'right' }}>{d.pct}%</Text>
                </View>
              ))}
            </View>
            <View style={s.col}>
              <Text style={s.grpLabel}>Competências — Mais desenvolvidas</Text>
              {p.compMais.map((c, i) => <Text key={i} style={[s.chip, { backgroundColor: i < 2 ? C.s : C.i }]}>{c.nome}</Text>)}
              <Text style={[s.grpLabel, { marginTop: 8 }]}>Menos desenvolvidas</Text>
              {p.compMenos.map((c, i) => <Text key={i} style={[s.chip, { backgroundColor: i === 0 ? C.d : C.c }]}>{c.nome}</Text>)}
            </View>
          </View>
        </View>
        <Footer />
      </Page>

      {/* Perfil Médio: Natural e Adaptado */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Perfil Médio: Natural e Adaptado" />
        <View style={s.body}>
          <Text style={s.p}>Compara o perfil comportamental natural (mais espontâneo) com o adaptado (o que o grupo percebe que precisaria demonstrar neste ambiente). A diferença indica o nível de adaptação, conforto ou esforço percebido.</Text>
          <View style={s.twoCol}>
            <View style={s.col}><DiscChart m={p.natural} label="NATURAL" badge={badge} /></View>
            <View style={s.col}><DiscChart m={p.adaptado} label="ADAPTADO" badge={badge} /></View>
          </View>
          <View style={[s.twoCol, { marginTop: 12 }]}>
            <View style={s.col}><FocoCards p={p} /></View>
            <View style={s.col} />
          </View>
        </View>
        <Footer />
      </Page>

      {/* Estilo de Liderança */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Estilo de Liderança" />
        <View style={s.body}>
          <Text style={s.p}>A média do estilo de liderança considera todos os perfis (não apenas gestores) e indica como o grupo tende a conduzir processos e o que valoriza numa liderança.</Text>
          <View style={[s.twoCol, { alignItems: 'center' }]}>
            <View style={{ width: 170, alignItems: 'center' }}><LiderancaPie p={p} /></View>
            <View style={s.col}>
              <Text style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>O {p.lideranca.nome}</Text>
              <Text style={{ fontSize: 10, color: C.sub, marginBottom: 6 }}>{p.lideranca.vinculo} ({p.lideranca.pct}%)</Text>
              {p.lideranca.dist.map((d, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, marginRight: 6, backgroundColor: [C.d, C.i, C.s, C.c][i] }} />
                  <Text style={{ fontSize: 9, color: C.navy, fontWeight: 700, width: 90 }}>{d.nome}</Text>
                  <Text style={{ fontSize: 9, color: C.sub }}>{d.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        <Footer />
      </Page>

      {/* Mapa de Competências */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Mapa de Competências" />
        <View style={s.body}>
          <Text style={s.p}>Nível médio de 16 competências do grupo — tendências comportamentais mais ou menos presentes. Compara o perfil natural com o adaptado.</Text>
          <View style={{ alignItems: 'center' }}><CompRadar p={p} /></View>
          <View style={s.legendRow}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.natural }]} /><Text style={s.legendTx}>Natural</Text></View>
            {p.temCompAdapt ? <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.adaptado }]} /><Text style={s.legendTx}>Adaptado</Text></View> : null}
          </View>
          <View style={s.twoCol}>
            <View style={s.col}>
              <Text style={s.grpLabel}>As 3 Mais Desenvolvidas (Natural)</Text>
              {p.compMais.map((c, i) => <CompCompare key={i} c={c} temAdapt={p.temCompAdapt} />)}
            </View>
            <View style={s.col}>
              <Text style={s.grpLabel}>As 3 Menos Desenvolvidas (Natural)</Text>
              {p.compMenos.map((c, i) => <CompCompare key={i} c={c} temAdapt={p.temCompAdapt} />)}
            </View>
          </View>
        </View>
        <Footer />
      </Page>

      {/* Fatores Altos e Baixos */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Fatores Altos e Baixos" />
        <View style={s.body}>
          <Text style={s.p}>Para cada fator DISC, o percentual de perfis com presença Alta (acima de 50 pontos) versus Baixa, considerando todo o grupo.</Text>
          {p.fatoresAltoBaixo.map((f) => (
            <View key={f.fator} style={{ marginBottom: 10 }}>
              <View style={s.fbBar}>
                <View style={[s.fbLeft, { width: `${f.pctAlto}%`, backgroundColor: FAT_COLOR[f.fator] }]}><Text style={s.fbPct}>{f.pctAlto}%</Text><Text style={s.fbLbl}>{f.nome} Alto</Text></View>
                <View style={[s.fbRight, { width: `${f.pctBaixo}%`, backgroundColor: FAT_COLOR[f.fator], opacity: 0.4 }]}><Text style={s.fbPct}>{f.pctBaixo}%</Text><Text style={s.fbLbl}>{f.nome} Baixo</Text></View>
              </View>
              <View style={s.fbCounts}><Text style={s.fbCount}>{f.nAlto} <Text style={{ fontSize: 8, color: C.sub, fontWeight: 400 }}>perfis acima de 50</Text></Text><Text style={s.fbCount}>{f.nBaixo} <Text style={{ fontSize: 8, color: C.sub, fontWeight: 400 }}>até 50</Text></Text></View>
            </View>
          ))}
        </View>
        <Footer />
      </Page>

      {/* Talentos */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Distribuição de Talentos" />
        <View style={s.body}>
          <Text style={s.p}>O Octógono de Talentos combina os fatores DISC em 8 talentos. A distribuição mostra a predominância das tendências comportamentais no grupo (% de perfis com cada fator em evidência).</Text>
          {p.talentos.map((t) => (
            <View key={t.nome} style={s.talRow}>
              <Text style={s.talNome}>{t.nome}</Text>
              <View style={s.talBarBg}><View style={[s.talBar, { width: `${t.pct}%`, backgroundColor: C.cyan }]} /></View>
              <Text style={s.talPct}>{t.pct}%</Text>
            </View>
          ))}
        </View>
        <Footer />
      </Page>

      {/* Destaques Comportamentais */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Destaques Comportamentais" />
        <View style={s.body}>
          <Text style={s.p}>Para cada par de tendências opostas, o lado destacado (marcador dourado) indica a inclinação predominante do grupo.</Text>
          {p.destaques.map((d, i) => (
            <View key={i} style={s.destRow}>
              <View style={[s.destCell, { opacity: d.ladoEsquerdo ? 1 : 0.4 }]}><View style={[s.destDot, { backgroundColor: d.ladoEsquerdo ? C.gold : 'transparent' }]} /><Text style={s.destTxt}>{d.esquerda}</Text></View>
              <View style={[s.destCell, { opacity: d.ladoEsquerdo ? 0.4 : 1 }]}><View style={[s.destDot, { backgroundColor: d.ladoEsquerdo ? 'transparent' : C.gold }]} /><Text style={s.destTxt}>{d.direita}</Text></View>
            </View>
          ))}
        </View>
        <Footer />
      </Page>

      {/* Gráficos Individuais */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Gráficos Individuais" />
        <View style={s.body}>
          <Text style={s.p}>Perfil natural de cada pessoa do mapeamento. O número identifica o colaborador no grupo.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {p.pessoas.map((pe) => (
              <View key={pe.numero} style={s.gItem} wrap={false}>
                <Text style={s.gNome}>{pe.numero}. {pe.nome.length > 22 ? pe.nome.slice(0, 21) + '…' : pe.nome}  ({pe.perfil})</Text>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 44 }}>
                  {([['D', pe.natural.d, C.d], ['I', pe.natural.i, C.i], ['S', pe.natural.s, C.s], ['C', pe.natural.c, C.c]] as [string, number, string][]).map(([f, v, col]) => (
                    <View key={f} style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 6.5, fontWeight: 700, color: C.navy }}>{Math.round(v)}</Text>
                      <View style={{ width: 9, height: Math.max(3, (v / 100) * 34), backgroundColor: col, borderRadius: 5 }} />
                      <Text style={{ fontSize: 6, color: C.sub }}>{f}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

export async function renderPerfilOrgPDF(params: Params): Promise<Uint8Array> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(<PerfilOrgDoc {...params} />);
}
