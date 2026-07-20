/**
 * DNA Organizacional — "Retrato de Competências" (PDF premium branded).
 * Consome o agregado (lib/dna-organizacional/aggregate) + a narrativa IA
 * (lib/dna-organizacional/narrative) e renderiza o relatório coletivo anônimo.
 * Reusa a infra premium (paleta Vertho + NotoSans). Sem emoji (NotoSans não
 * cobre) — usa barras/cores e marcadores textuais.
 */
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import '@/components/pdf/styles'; // registra NotoSans (efeito colateral)
import PdfReportCover from '@/components/pdf/PdfReportCover'; // capa editorial + registra Fraunces
import { getLogoCoverBase64, getReportCoverBgBase64 } from '@/lib/pdf-assets';
import type { DnaAggregate, CompetenciaStat, Dist } from './dna-organizacional/aggregate';
import type { DnaNarrative } from './dna-organizacional/narrative';

const C = {
  navy: '#142F57', cyan: '#34C5CC', gold: '#C8941F', white: '#FFFFFF',
  text: '#142F57', sub: '#5F6B7A', border: '#E2E8F0', bg: '#F4F7FA',
  n1Bg: '#FDECEC', n1Tx: '#C0392B', n2Bg: '#FEF6E0', n2Tx: '#9A6A0A',
  n3Bg: '#E9F7EF', n3Tx: '#1E8449', n4Bg: '#EAF2FB', n4Tx: '#2471A3',
  cardTeal: '#EAF6F6', cardBlue: '#EAF0F8', cardGold: '#FBF3E2',
};
const NIVEIS = [
  { key: 'n1', label: 'Nível 1 — GAP', sig: 'Precisa de desenvolvimento estruturado', bg: C.n1Bg, tx: C.n1Tx },
  { key: 'n2', label: 'Nível 2 — Em Desenvolvimento', sig: 'Boa intenção, execução a melhorar', bg: C.n2Bg, tx: C.n2Tx },
  { key: 'n3', label: 'Nível 3 — META', sig: 'Prática consistente', bg: C.n3Bg, tx: C.n3Tx },
  { key: 'n4', label: 'Nível 4 — Referência', sig: 'Excelência que inspira', bg: C.n4Bg, tx: C.n4Tx },
] as const;

const s = StyleSheet.create({
  // paddingTop dá a margem superior às páginas de CONTINUAÇÃO (o header navy só
  // existe na 1ª página de conteúdo). O header é puxado de volta ao topo com
  // marginTop negativo, pra continuar coladinho na borda da página 1.
  page: { fontFamily: 'NotoSans', fontSize: 9, color: C.text, paddingTop: 30, paddingBottom: 48 },
  header: { backgroundColor: C.navy, marginTop: -30, paddingHorizontal: 36, paddingTop: 34, paddingBottom: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hTitle: { color: C.white, fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: 0.5 },
  hEmpresa: { color: C.cyan, fontSize: 15, fontWeight: 700, marginTop: 8 },
  hMeta: { color: '#B9C4D4', fontSize: 9, marginTop: 4 },
  hLogo: { width: 84, height: 20 }, // ratio natural ~4.23 (logo-vertho.png 3148x744)
  body: { paddingHorizontal: 36, paddingTop: 18 },
  anon: { fontStyle: 'italic', color: C.sub, fontSize: 8.5, marginBottom: 10 },
  intro: { fontStyle: 'italic', color: '#2A3B55', fontSize: 10, lineHeight: 1.5, marginBottom: 18 },
  secTitleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginBottom: 10 },
  secBar: { width: 5, height: 18, backgroundColor: C.cyan, marginRight: 8, borderRadius: 2 },
  secTitle: { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 15, color: C.navy, letterSpacing: 0.3 },
  forcaCard: { backgroundColor: C.cardTeal, borderLeftWidth: 4, borderLeftColor: C.cyan, borderRadius: 4, padding: 12, marginBottom: 9 },
  forcaTit: { color: '#0F6B70', fontSize: 10, fontWeight: 700 },
  forcaDest: { color: C.navy, fontSize: 19, fontWeight: 700, marginVertical: 3 },
  forcaDesc: { color: '#3A4658', fontSize: 9, lineHeight: 1.45 },
  forcaReforco: { color: '#0F6B70', fontSize: 8.5, fontStyle: 'italic', marginTop: 4 },
  // tabela retrato geral
  trHead: { flexDirection: 'row', backgroundColor: C.navy, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  thNivel: { flex: 2, color: C.white, fontSize: 9, fontWeight: 700, padding: 7 },
  thPct: { flex: 1, color: C.white, fontSize: 9, fontWeight: 700, padding: 7, textAlign: 'center' },
  thSig: { flex: 3, color: C.white, fontSize: 9, fontWeight: 700, padding: 7 },
  trRow: { flexDirection: 'row', alignItems: 'center' },
  tdNivel: { flex: 2, fontSize: 9, fontWeight: 700, padding: 8 },
  tdPct: { flex: 1, fontSize: 16, fontWeight: 700, padding: 6, textAlign: 'center' },
  tdSig: { flex: 3, fontSize: 8.5, color: C.sub, padding: 8 },
  // competência
  compBox: { borderRadius: 4, padding: 11, marginTop: 12, marginBottom: 7 },
  compNome: { fontSize: 12, fontWeight: 700 },
  compMediaRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  compMediaLbl: { fontSize: 9, color: C.sub },
  compMedia: { fontSize: 18, fontWeight: 700, marginHorizontal: 4 },
  compDistLine: { fontSize: 8.5, color: C.sub, marginTop: 3 },
  dHead: { flexDirection: 'row', backgroundColor: '#27406A', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  dhDesc: { flex: 4, color: C.white, fontSize: 8, fontWeight: 700, padding: 6 },
  dhN: { flex: 1.3, color: C.white, fontSize: 7.5, fontWeight: 700, padding: 6, textAlign: 'center' },
  dRow: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: C.border },
  dDesc: { flex: 4, fontSize: 8.5, color: C.text, padding: 6 },
  dCell: { flex: 1.3, fontSize: 8.5, fontWeight: 700, paddingVertical: 6, textAlign: 'center' },
  compFoot: { backgroundColor: C.bg, padding: 7, fontSize: 8, marginTop: 1, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  // padrões
  padCard: { backgroundColor: C.cardBlue, borderRadius: 4, padding: 11, marginBottom: 8, flexDirection: 'row' },
  padNum: { backgroundColor: C.navy, color: C.white, fontSize: 14, fontWeight: 700, width: 26, height: 26, textAlign: 'center', paddingTop: 5, borderRadius: 4, marginRight: 10 },
  padTit: { fontSize: 10.5, fontWeight: 700, color: C.navy, marginBottom: 2 },
  padTxt: { fontSize: 9, color: '#3A4658', lineHeight: 1.45 },
  // prioridades (3 col)
  prioBanner: { backgroundColor: C.gold, borderRadius: 4, paddingVertical: 9, paddingHorizontal: 12, marginTop: 14, marginBottom: 10 },
  prioBannerTx: { color: C.white, fontSize: 14, fontWeight: 700, letterSpacing: 0.3 },
  prioRow: { flexDirection: 'row', gap: 10 },
  prioCol: { flex: 1, backgroundColor: C.bg, borderRadius: 4, padding: 10 },
  prioNum: { color: C.gold, fontSize: 30, fontWeight: 700, textAlign: 'center' },
  prioDesc: { fontSize: 9.5, fontWeight: 700, color: C.navy, marginTop: 2 },
  prioComp: { fontSize: 7.5, color: C.sub, marginBottom: 4 },
  prioDado: { fontSize: 8.5, color: '#3A4658', marginBottom: 4 },
  prioPorque: { fontSize: 8, color: '#3A4658', fontStyle: 'italic', marginBottom: 4, lineHeight: 1.4 },
  prioAcao: { fontSize: 8, color: C.navy, lineHeight: 1.4 },
  // ações
  acaoCard: { flexDirection: 'row', backgroundColor: C.cardTeal, borderRadius: 4, padding: 11, marginBottom: 8 },
  acaoNum: { backgroundColor: '#0F6B70', color: C.white, fontSize: 14, fontWeight: 700, width: 26, height: 26, textAlign: 'center', paddingTop: 5, borderRadius: 4, marginRight: 10 },
  acaoTit: { fontSize: 10.5, fontWeight: 700, color: C.navy },
  acaoMeta: { fontSize: 8, color: C.sub, marginVertical: 2 },
  acaoRes: { fontSize: 8.5, color: '#1E5B40', fontWeight: 700, lineHeight: 1.4 },
  // referência + fecho
  refBox: { backgroundColor: C.cardGold, borderRadius: 4, padding: 12, marginTop: 8, marginBottom: 14 },
  refTxt: { fontSize: 9, color: '#5A4A1E', lineHeight: 1.5 },
  fechoBox: { backgroundColor: C.navy, borderRadius: 6, borderWidth: 1.5, borderColor: C.gold, padding: 20, marginTop: 6 },
  fechoStars: { color: C.gold, fontSize: 11, textAlign: 'center', marginBottom: 8, letterSpacing: 4 },
  fechoTxt: { color: '#E8EEF6', fontSize: 10, fontStyle: 'italic', textAlign: 'center', lineHeight: 1.55 },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#94A3B8' },
});

const cellStyle = (key: keyof Dist) => {
  const n = NIVEIS.find((x) => x.key === key)!;
  return { backgroundColor: n.bg, color: n.tx };
};

interface Params { empresaNome: string; dataRef: string; segmento?: string | null; dna: DnaAggregate; narrativa: DnaNarrative }

function CompetenciaBlock({ c }: { c: CompetenciaStat }) {
  const headerBg = c.prioridade ? C.n1Bg : C.cardTeal;
  const accent = c.prioridade ? C.n1Tx : '#0F6B70';
  return (
    <View wrap={false} style={{ marginBottom: 6 }}>
      <View style={[s.compBox, { backgroundColor: headerBg, borderLeftWidth: 4, borderLeftColor: accent }]}>
        <Text style={[s.compNome, { color: C.navy }]}>{c.nome.toUpperCase()}</Text>
        <View style={s.compMediaRow}>
          <Text style={s.compMediaLbl}>Média:</Text>
          <Text style={[s.compMedia, { color: accent }]}>{c.media.toFixed(2)}</Text>
          {c.prioridade ? <Text style={{ fontSize: 8.5, fontWeight: 700, color: C.n1Tx }}>PRIORIDADE</Text> : null}
        </View>
        <Text style={s.compDistLine}>Nível 1: {c.pct.n1}%  |  Nível 2: {c.pct.n2}%  |  Nível 3: {c.pct.n3}%  |  Nível 4: {c.pct.n4}%</Text>
      </View>
      <View style={s.dHead}>
        <Text style={s.dhDesc}>Descritor</Text>
        <Text style={s.dhN}>N1 (Gap)</Text><Text style={s.dhN}>N2 (Desenv.)</Text><Text style={s.dhN}>N3 (Meta)</Text><Text style={s.dhN}>N4 (Ref.)</Text>
      </View>
      {c.descritores.map((d, i) => (
        <View key={i} style={s.dRow}>
          <Text style={s.dDesc}>{d.descritor}</Text>
          <Text style={[s.dCell, cellStyle('n1')]}>{d.pct.n1}%</Text>
          <Text style={[s.dCell, cellStyle('n2')]}>{d.pct.n2}%</Text>
          <Text style={[s.dCell, cellStyle('n3')]}>{d.pct.n3}%</Text>
          <Text style={[s.dCell, cellStyle('n4')]}>{d.pct.n4}%</Text>
        </View>
      ))}
      <View style={s.compFoot}>
        {c.forca ? <Text style={{ color: C.n3Tx }}>Força: {c.forca.descritor} — {c.forca.nivelPct}% em N3/N4</Text> : null}
        {c.oportunidade ? <Text style={{ color: C.n1Tx, marginTop: 1 }}>Oportunidade: {c.oportunidade.descritor} — {c.oportunidade.n1pct}% em N1</Text> : null}
      </View>
    </View>
  );
}

function SecTitle({ children }: { children: string }) {
  return <View style={s.secTitleRow}><View style={s.secBar} /><Text style={s.secTitle}>{children}</Text></View>;
}

// ── Bloco compacto do DNA de um cargo (distribuição N1-N4 + maior gap) ───────
function CargoDnaBlock({ cargo, avaliados, dna }: { cargo: string; avaliados: number; dna: DnaAggregate }) {
  const p = dna.distGeralPct;
  const segs: [string, number, string][] = [['N1', p.n1, C.n1Tx], ['N2', p.n2, C.n2Tx], ['N3', p.n3, C.n3Tx], ['N4', p.n4, C.n4Tx]];
  const gap = dna.topGaps[0];
  return (
    <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 11, marginBottom: 9 }} wrap={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
        <Text style={{ fontSize: 11.5, fontWeight: 700, color: C.navy, flex: 1 }}>{cargo}</Text>
        <Text style={{ fontSize: 8.5, color: C.sub }}>{avaliados} avaliado{avaliados === 1 ? '' : 's'} · {dna.competencias.length} competência{dna.competencias.length === 1 ? '' : 's'}</Text>
      </View>
      {/* barra empilhada N1..N4 */}
      <View style={{ flexDirection: 'row', height: 15, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
        {segs.map(([lbl, v, col]) => v > 0 ? (
          <View key={lbl} style={{ width: `${v}%`, backgroundColor: col, justifyContent: 'center', alignItems: 'center' }}>
            {v >= 8 ? <Text style={{ fontSize: 7, color: C.white, fontWeight: 700 }}>{v}%</Text> : null}
          </View>
        ) : null)}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 5 }}>
        {segs.map(([lbl, v, col]) => (
          <View key={lbl} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: col }} />
            <Text style={{ fontSize: 7, color: C.sub }}>{lbl} {v}%</Text>
          </View>
        ))}
      </View>
      {gap ? <Text style={{ fontSize: 8, color: C.sub }}>Maior gap: <Text style={{ fontWeight: 700, color: C.n1Tx }}>{gap.descritor}</Text> ({gap.competencia}) — {gap.n1pct}% em N1</Text> : null}
    </View>
  );
}

function DnaDoc({ empresaNome, dataRef, segmento, dna, narrativa }: Params) {
  const logo = getLogoCoverBase64();
  return (
    <Document title={`DNA Organizacional — ${empresaNome}`} author="Vertho">
      <PdfReportCover
        bgBase64={getReportCoverBgBase64()}
        logoBase64={logo}
        overline={'Retrato de Competências'}
        titulo={['Retrato de', 'Competências']}
        mentorLabel={null}
        nome={empresaNome}
        tagline={'Do dado coletivo à ação de desenvolvimento.'}
      />
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.hTitle}>RETRATO DE{'\n'}COMPETÊNCIAS</Text>
            <Text style={s.hEmpresa}>{empresaNome}</Text>
            <Text style={s.hMeta}>{dataRef}  •  {dna.avaliados} profissionais avaliados</Text>
          </View>
          {logo ? <Image src={logo} style={s.hLogo} /> : null}
        </View>

        <View style={s.body}>
          <Text style={s.anon}>Diagnóstico coletivo e anônimo para desenvolvimento da equipe. Nenhum profissional é identificado.</Text>
          <Text style={s.intro}>{narrativa.intro}</Text>

          <SecTitle>NOSSAS FORÇAS</SecTitle>
          {narrativa.forcas.map((f, i) => (
            <View key={i} style={s.forcaCard}>
              <Text style={s.forcaTit}>{f.titulo}</Text>
              <Text style={s.forcaDest}>{f.destaque}</Text>
              <Text style={s.forcaDesc}>{f.descricao}</Text>
              {f.reforco ? <Text style={s.forcaReforco}>{f.reforco}</Text> : null}
            </View>
          ))}

          <SecTitle>RETRATO GERAL</SecTitle>
          <View style={s.trHead}><Text style={s.thNivel}>Nível</Text><Text style={s.thPct}>% Equipe</Text><Text style={s.thSig}>Significado</Text></View>
          {NIVEIS.map((n, i) => (
            <View key={i} style={[s.trRow, { backgroundColor: n.bg }]}>
              <Text style={[s.tdNivel, { color: n.tx }]}>{n.label}</Text>
              <Text style={[s.tdPct, { color: n.tx }]}>{(dna.distGeralPct as any)[n.key]}%</Text>
              <Text style={s.tdSig}>{n.sig}</Text>
            </View>
          ))}

          {dna.porCargo && dna.porCargo.length > 0 ? (
            <>
              {/* Cada cargo abre em página própria. `break` fica só em elementos
                  PEQUENOS (título da seção / card do cargo): um wrapper grande
                  com `break` contendo filhos wrap={false} força quebra interna
                  e o react-pdf DUPLICA o filho na fronteira (visto no render:
                  card do cargo 2× + página quase vazia). As tabelas fluem como
                  irmãs — cada CompetenciaBlock já é wrap={false} e se move
                  inteiro sozinho. */}
              {dna.porCargo.flatMap((pc, idx) => [
                idx === 0 ? (
                  <View key="sec-cargo" break>
                    <SecTitle>DESCRITORES POR COMPETÊNCIA — POR CARGO</SecTitle>
                    <Text style={s.anon}>A distribuição de níveis e os descritores de cada competência, recortados por cargo — cada cargo abre em página própria. Cargos com menos de 3 avaliados não aparecem.</Text>
                  </View>
                ) : null,
                <View key={pc.cargo} break={idx > 0}>
                  <CargoDnaBlock cargo={pc.cargo} avaliados={pc.avaliados} dna={pc.dna} />
                </View>,
                // Tabelas como IRMÃS diretas (sem wrapper): um View envolvendo
                // todas se move em bloco quando o cargo não cabe na página,
                // deixando-a semi-vazia. Cada tabela é wrap={false} e decide
                // sozinha se cabe ou vai pra próxima.
                ...pc.dna.competencias.map((c, i) => (
                  <View key={`${pc.cargo}-comp-${i}`} style={{ marginLeft: 8, marginBottom: i === pc.dna.competencias.length - 1 ? 10 : 0 }}>
                    <CompetenciaBlock c={c} />
                  </View>
                )),
              ]).filter(Boolean)}
            </>
          ) : (
            <>
              <SecTitle>DESCRITORES POR COMPETÊNCIA</SecTitle>
              {dna.competencias.map((c, i) => <CompetenciaBlock key={i} c={c} />)}
            </>
          )}

          {narrativa.leituraGeral ? <Text style={[s.intro, { marginTop: 12 }]}>{narrativa.leituraGeral}</Text> : null}

          <SecTitle>PADRÕES IDENTIFICADOS</SecTitle>
          {narrativa.padroes.map((p, i) => (
            <View key={i} style={s.padCard} wrap={false}>
              <Text style={s.padNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}><Text style={s.padTit}>{p.titulo}</Text><Text style={s.padTxt}>{p.texto}</Text></View>
            </View>
          ))}

          <View style={s.prioBanner}><Text style={s.prioBannerTx}>PRIORIDADES DE FORMAÇÃO</Text></View>
          <View style={s.prioRow}>
            {narrativa.prioridades.map((p, i) => (
              <View key={i} style={s.prioCol}>
                <Text style={s.prioNum}>{i + 1}</Text>
                <Text style={s.prioDesc}>{p.descritor}</Text>
                <Text style={s.prioComp}>Competência: {p.competencia}</Text>
                <Text style={s.prioDado}>{p.dado}</Text>
                <Text style={s.prioPorque}>{p.porque}</Text>
                <Text style={s.prioAcao}>{p.acao}</Text>
              </View>
            ))}
          </View>

          <SecTitle>O QUE JÁ PODEMOS FAZER JUNTOS</SecTitle>
          {narrativa.acoes.map((a, i) => (
            <View key={i} style={s.acaoCard} wrap={false}>
              <Text style={s.acaoNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.acaoTit}>{a.titulo}</Text>
                <Text style={s.acaoMeta}>{a.quando}  •  {a.quem}</Text>
                <Text style={s.acaoRes}>Em 30 dias: {a.resultado}</Text>
              </View>
            </View>
          ))}

          <SecTitle>NOSSOS PROFISSIONAIS REFERÊNCIA</SecTitle>
          <View style={s.refBox}><Text style={s.refTxt}>{narrativa.profissionaisReferencia}</Text></View>

          <View style={s.fechoBox} wrap={false}>
            <Text style={s.fechoStars}>{'❖  ❖  ❖'}</Text>
            <Text style={s.fechoTxt}>{narrativa.fecho}</Text>
            <Text style={[s.fechoStars, { marginTop: 8, marginBottom: 0 }]}>{'❖  ❖  ❖'}</Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>Vertho — Retrato de Competências</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderDnaPDF(params: Params): Promise<Uint8Array> {
  return renderToBuffer(<DnaDoc {...params} />);
}
