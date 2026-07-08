/**
 * Relatório de Adequação ao Cargo — PDF premium branded (réplica do "Match Perfil
 * Ideal"). Consome o agregado (lib/adequacao-cargo/aggregate) + narrativas IA.
 * Páginas: capa · Filtros e Mapeamento (perfil ideal do cargo) · cards de
 * resultado por colaborador (anel Beta + 4 sub-scores coloridos) · análise individual.
 * Reusa NotoSans + paleta Vertho. Sem emoji.
 */
import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Svg, Circle, renderToBuffer } from '@react-pdf/renderer';
import '@/components/pdf/styles';
import PdfReportCover from '@/components/pdf/PdfReportCover';
import { getLogoCoverBase64, getReportCoverBgBase64 } from '@/lib/pdf-assets';
import type { AdequacaoCargo, PessoaAdequacao, SubScore, Classe } from './adequacao-cargo/aggregate';
import { formatLinhaBloqueio } from './adequacao-cargo/evidencia';
import { formatFaixaPorDirecao } from './scoring/faixa-display';
import { trilhaParaTraco } from './adequacao-cargo/trilhas';

const C = {
  navy: '#142F57', cyan: '#34C5CC', gold: '#C8941F', white: '#FFFFFF',
  text: '#142F57', sub: '#5F6B7A', border: '#E2E8F0', bg: '#F4F7FA',
  alta: '#22B07D', razoavel: '#F0922B', baixa: '#E5484D', muted: '#94A3B8',
};
const CLASSE_COLOR: Record<Classe, string> = { alta: C.alta, razoavel: C.razoavel, baixa: C.baixa };

// Status (4 estados) → cor do selo. bloqueado (gate, vermelho) ≠ abaixo_do_corte
// (desenvolvível, índigo) — mensagens opostas, selos distintos.
const STATUS_COLOR: Record<string, string> = {
  recomendado: C.alta, recomendado_com_ressalvas: C.razoavel,
  abaixo_do_corte: '#6366F1', bloqueado: C.baixa,
};
// Direção do traço → rótulo legível (sem glifos especiais; subset Inter não cobre setas).
function direcaoLabel(d?: string): string | null {
  if (d === 'floor') return 'mais é melhor';
  if (d === 'ceiling') return 'manter moderado';
  if (d === 'target') return 'faixa-alvo';
  return null;
}

const s = StyleSheet.create({
  page: { fontFamily: 'NotoSans', fontSize: 9, color: C.text, paddingBottom: 44 },
  cover: { backgroundColor: C.navy, height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  coverLogo: { width: 230, height: 54, marginBottom: 8 },
  coverTitle: { color: C.white, fontSize: 30, fontWeight: 700, marginTop: 30, textAlign: 'center' },
  coverKicker: { color: '#9FB0C6', fontSize: 13, marginTop: 18 },
  coverCargo: { color: C.cyan, fontSize: 16, fontWeight: 700, marginTop: 2 },
  coverMeta: { color: '#9FB0C6', fontSize: 9, fontWeight: 700, marginTop: 14, letterSpacing: 0.5 },
  header: { paddingHorizontal: 34, paddingTop: 26, paddingBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hTitle: { color: '#5B7BC4', fontSize: 23, fontWeight: 700 },
  hLogo: { width: 92, height: 22 },
  body: { paddingHorizontal: 34, paddingTop: 6 },
  secBar: { flexDirection: 'row', alignItems: 'center', marginTop: 12, marginBottom: 8 },
  secBarV: { width: 5, height: 16, backgroundColor: C.cyan, marginRight: 7, borderRadius: 2 },
  secBarT: { fontFamily: 'Fraunces', fontSize: 14, fontWeight: 600, color: C.navy, letterSpacing: -0.15 },
  // legenda
  legendBox: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, marginBottom: 10 },
  legendRow: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendTx: { fontSize: 8, color: C.sub },
  // perfil ideal — chips
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  chip: { backgroundColor: '#EAF1F7', color: C.navy, fontSize: 8, fontWeight: 700, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  // perfil ideal — linhas com faixa
  rangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11, marginBottom: 6 },
  rangeNome: { fontSize: 9.5, fontWeight: 700, color: C.navy },
  rangeVal: { fontSize: 9, fontWeight: 700, color: C.sub },
  twoCol: { flexDirection: 'row', gap: 16 },
  col: { flex: 1 },
  lidRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 11, marginBottom: 6 },
  // cards de resultado
  cardsRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  card: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 11 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardNome: { fontSize: 11, fontWeight: 700, color: '#5B7BC4', marginBottom: 6 },
  recChip: { alignSelf: 'flex-start', fontSize: 7, fontWeight: 700, color: C.white, borderRadius: 7, paddingVertical: 2, paddingHorizontal: 6, marginBottom: 6 },
  flagTx: { fontSize: 7, color: C.razoavel, marginTop: 4 },
  limTx: { fontSize: 6.5, color: C.razoavel, fontWeight: 700, marginTop: 2, textAlign: 'center' },
  knockTx: { fontSize: 7, color: C.baixa, marginTop: 3 },
  knockOrigem: { fontSize: 7.5, color: C.baixa, fontWeight: 700, marginTop: 4 },
  carimboTx: { fontSize: 6.5, color: C.muted, marginTop: 4, fontStyle: 'italic' },
  carimboBar: { fontSize: 7.5, color: C.sub, marginBottom: 8, marginTop: 2 },
  calibBox: { borderWidth: 1, borderColor: C.razoavel, backgroundColor: '#FFF7ED', borderRadius: 8, padding: 9, marginBottom: 10 },
  calibTitle: { fontSize: 8.5, fontWeight: 700, color: C.razoavel, marginBottom: 3 },
  calibTx: { fontSize: 8, color: '#7C2D12', lineHeight: 1.4 },
  devGap: { fontSize: 9, color: '#3A4658', marginBottom: 2, lineHeight: 1.4 },
  devNote: { fontSize: 8, color: C.muted, fontStyle: 'italic', marginTop: 4 },
  dirTx: { fontSize: 7.5, color: C.muted, fontWeight: 400 },
  pesoRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2, marginBottom: 4 },
  pesoChip: { backgroundColor: '#EEF3F8', color: C.sub, fontSize: 8, fontWeight: 700, borderRadius: 7, paddingVertical: 3, paddingHorizontal: 7 },
  discBadges: { flexDirection: 'row', gap: 5 },
  discBadge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  discBadgeT: { color: C.white, fontSize: 8.5, fontWeight: 700 },
  betaWrap: { alignItems: 'center', width: 60 },
  betaLbl: { fontSize: 7.5, color: C.sub, marginBottom: 2 },
  betaPct: { position: 'absolute', top: 32, width: 56, textAlign: 'center', fontSize: 10, fontWeight: 700 },
  subWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  subItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  subDot: { width: 8, height: 8, borderRadius: 4 },
  subTx: { fontSize: 8.5, color: C.text },
  // análise IA
  anItem: { borderWidth: 1, borderColor: C.border, borderRadius: 8, padding: 10, marginBottom: 8 },
  anHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  anNome: { fontSize: 10.5, fontWeight: 700, color: C.navy },
  anBeta: { fontSize: 10, fontWeight: 700 },
  anTxt: { fontSize: 9, color: '#3A4658', lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 16, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: '#94A3B8' },
  // Tabela ranqueada (n > 10)
  tHead: { flexDirection: 'row', backgroundColor: C.navy, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 3 },
  tHeadC: { color: C.white, fontSize: 7.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 },
  tRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.border, alignItems: 'center' },
  tRowAlt: { backgroundColor: '#F8FAFC' },
  tCell: { fontSize: 8.5, color: C.text },
});

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Vertho · Relatório de Adequação ao Cargo</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function PageHeader({ title }: { title: string }) {
  return (
    <View style={s.header}>
      <Text style={s.hTitle}>{title}</Text>
      <Image style={s.hLogo} src={getLogoCoverBase64()} />
    </View>
  );
}

function Legenda() {
  return (
    <View style={s.legendBox}>
      <Text style={{ fontSize: 9, fontWeight: 700, color: C.navy }}>Legenda</Text>
      <View style={s.legendRow}>
        <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.alta }]} /><Text style={s.legendTx}>Compatibilidade Alta (85%+)</Text></View>
        <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.razoavel }]} /><Text style={s.legendTx}>Compatibilidade Razoável (60% - 84%)</Text></View>
        <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.baixa }]} /><Text style={s.legendTx}>Compatibilidade Baixa (0% - 59%)</Text></View>
      </View>
    </View>
  );
}

function Donut({ pct, color }: { pct: number; color: string }) {
  const r = 22, cx = 28, cy = 28, circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(100, pct)) / 100 * circ;
  return (
    <View style={{ width: 56, height: 56 }}>
      <Svg width={56} height={56}>
        <Circle cx={cx} cy={cy} r={r} stroke="#E8EDF3" strokeWidth={5} fill="none" />
        <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={5} fill="none"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 10, fontWeight: 700, color }}>{pct}%</Text>
      </View>
    </View>
  );
}

function SubLine({ label, sc }: { label: string; sc: SubScore }) {
  if (!sc.aplicavel) {
    return (
      <View style={s.subItem}>
        <View style={[s.subDot, { backgroundColor: C.muted }]} />
        <Text style={[s.subTx, { color: C.muted }]}>{label} n/a</Text>
      </View>
    );
  }
  return (
    <View style={s.subItem}>
      <View style={[s.subDot, { backgroundColor: CLASSE_COLOR[sc.classe] }]} />
      <Text style={s.subTx}>{label} {Math.round(sc.pct)}%</Text>
    </View>
  );
}

function CardPessoa({ p }: { p: PessoaAdequacao }) {
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardNome}>{p.nome}</Text>
          <Text style={[s.recChip, { backgroundColor: STATUS_COLOR[p.status] || C.muted }]}>{p.statusLabel.toUpperCase()}</Text>
          <View style={s.discBadges}>
            {p.disc.map((d) => (
              <View key={d.fator} style={[s.discBadge, { backgroundColor: CLASSE_COLOR[d.classe] }]}>
                <Text style={s.discBadgeT}>{d.score}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.betaWrap}>
          <Text style={s.betaLbl}>Aderência</Text>
          <Donut pct={p.beta.pct} color={p.status === 'bloqueado' ? C.baixa : CLASSE_COLOR[p.beta.classe]} />
          {p.borderline && p.status !== 'bloqueado' && <Text style={s.limTx}>limítrofe ·±{p.betaSemDelta}</Text>}
        </View>
      </View>
      <View style={s.subWrap}>
        <SubLine label="Mapeamento" sc={p.mapeamento} />
        <SubLine label="Competência" sc={p.competencia} />
        <SubLine label="Liderança" sc={p.lideranca} />
        <SubLine label="DISC" sc={p.discScore} />
      </View>
      {p.knockoutFailed && p.knockoutEvidencias.length > 0 && (
        <View>
          {p.origemBloqueioLabel && <Text style={s.knockOrigem}>{p.origemBloqueioLabel}</Text>}
          {p.knockoutEvidencias.map((ev, i) => (
            <Text key={i} style={s.knockTx}>Bloqueio: {formatLinhaBloqueio(ev)}</Text>
          ))}
          <Text style={s.carimboTx}>Apoio à decisão — validação humana requerida.</Text>
        </View>
      )}
    </View>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

const TCOL = { pos: '6%', nome: '34%', beta: '12%', status: '22%', ko: '18%', lim: '8%' };
const ORIGEM_CURTA: Record<string, string> = { competencia: 'Competência', comportamental: 'Comportam.', misto: 'Misto' };
function TabelaResultados({ pessoas, startPos }: { pessoas: PessoaAdequacao[]; startPos: number }) {
  return (
    <View>
      <View style={s.tHead}>
        <Text style={[s.tHeadC, { width: TCOL.pos }]}>#</Text>
        <Text style={[s.tHeadC, { width: TCOL.nome }]}>Colaborador</Text>
        <Text style={[s.tHeadC, { width: TCOL.beta, textAlign: 'center' }]}>Aderência</Text>
        <Text style={[s.tHeadC, { width: TCOL.status }]}>Status</Text>
        <Text style={[s.tHeadC, { width: TCOL.ko }]}>Bloqueio</Text>
        <Text style={[s.tHeadC, { width: TCOL.lim, textAlign: 'center' }]}>Lim.</Text>
      </View>
      {pessoas.map((p, i) => {
        const bloqueado = p.status === 'bloqueado';
        return (
        <View key={i} style={[s.tRow, ...(i % 2 ? [s.tRowAlt] : [])]}>
          <Text style={[s.tCell, { width: TCOL.pos, color: C.sub }]}>{startPos + i + 1}</Text>
          <Text style={[s.tCell, { width: TCOL.nome, fontWeight: 700, color: C.navy }]}>{p.nome}</Text>
          <Text style={[s.tCell, { width: TCOL.beta, textAlign: 'center', fontWeight: 700, color: bloqueado ? C.baixa : CLASSE_COLOR[p.beta.classe] }]}>{p.beta.pct}%</Text>
          <Text style={[s.tCell, { width: TCOL.status, color: STATUS_COLOR[p.status] || C.text, fontWeight: 700 }]}>{p.statusLabel}</Text>
          <Text style={[s.tCell, { width: TCOL.ko, color: C.baixa }]}>{p.origemBloqueio ? ORIGEM_CURTA[p.origemBloqueio] : '—'}</Text>
          <Text style={[s.tCell, { width: TCOL.lim, textAlign: 'center', color: C.razoavel }]}>{p.borderline && !bloqueado ? `±${p.betaSemDelta}` : '—'}</Text>
        </View>
        );
      })}
    </View>
  );
}

export function AdequacaoCargoPDF({ data, empresaNome, dataISO, narrativas, mostrarCalibracao = false }: {
  data: AdequacaoCargo; empresaNome: string; dataISO: string; narrativas: Record<string, string>; mostrarCalibracao?: boolean;
}) {
  const pi = data.perfilIdeal;
  // n ≤ 10 → cards (8/página). n > 10 → tabela ranqueada (cards não escalam).
  const usarTabela = data.pessoas.length > 10;
  const paginas = chunk(data.pessoas, 8);
  const paginasTabela = chunk(data.pessoas, 24);
  const paginasAnalise = chunk(data.pessoas.filter((p) => narrativas[p.nome]), 6);
  // Plano de Desenvolvimento: só desenvolvíveis (com ressalvas / abaixo do corte) — NUNCA bloqueado.
  const paginasDev = chunk(data.pessoas.filter((p) => p.status === 'abaixo_do_corte' || p.status === 'recomendado_com_ressalvas'), 5);

  // Metadados PINADOS no dataISO do snapshot → re-render reproduz byte-a-byte (sem
  // isto o @react-pdf carimba a data do relógio e o byte-equal falha por metadado, não
  // por conteúdo). O PDF reproduzido carrega a data do ORIGINAL.
  return (
    <Document creationDate={new Date(dataISO)} modificationDate={new Date(dataISO)} producer="Vertho" creator="Vertho">
      {/* Capa editorial */}
      <PdfReportCover
        bgBase64={getReportCoverBgBase64()}
        logoBase64={getLogoCoverBase64()}
        overline={'Adequação ao Cargo'}
        titulo={['Adequação', 'ao Cargo']}
        nome={data.cargo || undefined}
        empresa={empresaNome}
        tagline={'Do perfil ideal à decisão sobre pessoas.'}
      />

      {/* Filtros e Mapeamento (perfil ideal do cargo) */}
      <Page size="A4" style={s.page}>
        <PageHeader title="Filtros e Mapeamento" />
        <View style={s.body}>
          {pi.caracteristicas.length > 0 && (
            <View style={s.chipsWrap}>
              {pi.caracteristicas.map((c, i) => <Text key={i} style={s.chip}>{(c.polo || c.par).toUpperCase()}</Text>)}
            </View>
          )}
          {pi.pesos.length > 0 && (
            <>
              <View style={s.secBar}><View style={s.secBarV} /><Text style={s.secBarT}>Pesos por bloco</Text></View>
              <View style={s.pesoRow}>
                {pi.pesos.map((w, i) => <Text key={i} style={s.pesoChip}>{w.bloco} {w.pct}%</Text>)}
              </View>
            </>
          )}
          {/* Painel de calibração = instrumentação INTERNA de autoria (diz "piso baixo/
              régua frouxa"). NÃO entra no PDF entregue ao cliente (vazamento de camada:
              andaime de engenharia de gabarito num relatório de decisão de pessoas). Só
              renderiza com mostrarCalibracao=true (preview interno). Default off. */}
          {mostrarCalibracao && data.avisosCalibracao.length > 0 && (
            <View style={s.calibBox}>
              {/* DETECÇÃO, não prescrição. O painel não conhece ρ nem o constructo, então
                  NÃO sugere remédio (piso/faixa-alvo podem estar errados: faixa-alvo capa o
                  lado bom de um traço monotônico; subir piso é frágil). Só sinaliza p/ a mesa. */}
              <Text style={s.calibTitle}>Saturação detectada — investigar antes de mudar a régua</Text>
              {data.avisosCalibracao.map((a, i) => (
                a.tipo === 'teto'
                  ? <Text key={i} style={s.calibTx}>• {a.traco} satura (aderência ~100%) em {a.pct}% — a faixa não discrimina. ANTES de mudar a forma, rodar ρ(traço, veredito): se a dispersão concorda com o veredito há sinal real (avaliar recuperar); se é ortogonal, é design-by-choice (não tocar). NÃO assumir "subir piso" nem "faixa-alvo".</Text>
                  : <Text key={i} style={s.calibTx}>• {a.traco} zera (aderência ~0%) em {a.pct}% — pode ser alvo mal posto OU déficit real do grupo. Inspecionar os brutos / rodar ρ antes de revisar o alvo.</Text>
              ))}
            </View>
          )}
          <View style={s.twoCol}>
            <View style={s.col}>
              <View style={s.secBar}><View style={s.secBarV} /><Text style={s.secBarT}>Competência (min - max)</Text></View>
              {pi.competencias.map((c, i) => (
                <View key={i} style={s.rangeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rangeNome}>{c.nome}</Text>
                    {direcaoLabel(c.direcao) && <Text style={s.dirTx}>{direcaoLabel(c.direcao)}</Text>}
                  </View>
                  <Text style={s.rangeVal}>{formatFaixaPorDirecao(c.min, c.max, c.direcao)}</Text>
                </View>
              ))}
            </View>
            <View style={s.col}>
              <View style={s.secBar}><View style={s.secBarV} /><Text style={s.secBarT}>Perfil DISC (min - max)</Text></View>
              {pi.disc.map((d) => (
                <View key={d.fator} style={s.rangeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rangeNome}>{d.nome}</Text>
                    {direcaoLabel(d.direcao) && <Text style={s.dirTx}>{direcaoLabel(d.direcao)}</Text>}
                  </View>
                  <Text style={s.rangeVal}>{formatFaixaPorDirecao(d.min, d.max, d.direcao)}</Text>
                </View>
              ))}
              {pi.liderancaAplicavel && (
                <>
                  <View style={s.secBar}><View style={s.secBarV} /><Text style={s.secBarT}>Liderança</Text></View>
                  {pi.lideranca.map((l) => (
                    <View key={l.key} style={s.lidRow}>
                      <Text style={s.rangeNome}>{l.nome}</Text>
                      <Text style={s.rangeVal}>{Math.round(l.pct)}%{l.nome === pi.estiloPredominante ? ' (predominante)' : ''}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          </View>
        </View>
        <Footer />
      </Page>

      {/* Resultados — cards (n ≤ 10) */}
      {!usarTabela && paginas.map((grupo, gi) => (
        <Page key={`r${gi}`} size="A4" style={s.page}>
          <PageHeader title="Resultados" />
          <View style={s.body}>
            <Legenda />
            <Text style={s.carimboBar}>Apoio à decisão. A recomendação final cabe ao gestor/psicólogo responsável.</Text>
            {chunk(grupo, 2).map((par, pi2) => (
              <View key={pi2} style={s.cardsRow}>
                <CardPessoa p={par[0]} />
                {par[1] ? <CardPessoa p={par[1]} /> : <View style={{ flex: 1 }} />}
              </View>
            ))}
          </View>
          <Footer />
        </Page>
      ))}

      {/* Resultados — tabela ranqueada (n > 10) */}
      {usarTabela && paginasTabela.map((grupo, gi) => (
        <Page key={`tb${gi}`} size="A4" style={s.page}>
          <PageHeader title="Resultados" />
          <View style={s.body}>
            {gi === 0 && <Legenda />}
            {gi === 0 && <Text style={s.carimboBar}>Apoio à decisão. A recomendação final cabe ao gestor/psicólogo responsável.</Text>}
            <TabelaResultados pessoas={grupo} startPos={gi * 24} />
          </View>
          <Footer />
        </Page>
      ))}

      {/* Análise individual (IA) */}
      {paginasAnalise.map((grupo, gi) => (
        <Page key={`a${gi}`} size="A4" style={s.page}>
          <PageHeader title="Análise Individual" />
          <View style={s.body}>
            {grupo.map((p, i) => (
              <View key={i} style={s.anItem} wrap={false}>
                <View style={s.anHead}>
                  <Text style={s.anNome}>{p.nome}</Text>
                  <Text style={[s.anBeta, { color: STATUS_COLOR[p.status] || CLASSE_COLOR[p.beta.classe] }]}>{p.statusLabel} · Aderência {p.beta.pct}%</Text>
                </View>
                <Text style={s.anTxt}>{narrativas[p.nome]}</Text>
              </View>
            ))}
          </View>
          <Footer />
        </Page>
      ))}

      {/* Plano de Desenvolvimento (apenas desenvolvíveis — nunca bloqueado) */}
      {paginasDev.map((grupo, gi) => (
        <Page key={`dev${gi}`} size="A4" style={s.page}>
          <PageHeader title="Plano de Desenvolvimento" />
          <View style={s.body}>
            {gi === 0 && <Text style={s.carimboBar}>Apoio ao desenvolvimento — gaps desenvolvíveis com janela de reavaliação. Não garante resultado automático.</Text>}
            {grupo.map((p, i) => (
              <View key={i} style={s.anItem} wrap={false}>
                <View style={s.anHead}>
                  <Text style={s.anNome}>{p.nome}</Text>
                  <Text style={[s.anBeta, { color: STATUS_COLOR[p.status] || CLASSE_COLOR[p.beta.classe] }]}>{p.statusLabel} · Aderência {p.beta.pct}%</Text>
                </View>
                {p.gaps.length === 0 ? (
                  <Text style={s.anTxt}>Sem traços abaixo do alvo destacados — manter consistência.</Text>
                ) : p.gaps.map((g, j) => {
                  const tr = trilhaParaTraco(g.traco);
                  return <Text key={j} style={s.devGap}>• {g.traco} ({g.bloco}) — aderência {g.fitPct}% · {tr ? tr.titulo : 'trilha de Mentor IA a definir'}</Text>;
                })}
                <Text style={s.devNote}>Reavaliar em 90 dias.</Text>
              </View>
            ))}
          </View>
          <Footer />
        </Page>
      ))}
    </Document>
  );
}

/** Render → Buffer (consumido pela action). */
export interface AdequacaoRenderInput {
  data: AdequacaoCargo; empresaNome: string; dataISO: string; narrativas: Record<string, string>; mostrarCalibracao?: boolean;
}

export async function renderAdequacaoCargoPDF(props: AdequacaoRenderInput): Promise<Buffer> {
  return renderToBuffer(<AdequacaoCargoPDF {...props} />);
}

/**
 * RE-RENDER PURO a partir do SNAPSHOT (reprodução de relatório entregue).
 *
 * O snapshot É o renderInput inteiro ({data, empresaNome, dataISO, narrativas}) —
 * o RESULTADO já assado, não o input do qual ele se deriva. Esta função (e este
 * módulo) NÃO importa nem chama o motor (scoring/engine, role-spec, aggregate, IA
 * de narrativa): `AdequacaoCargo` entra como `import type` (apagado em runtime), a
 * cor vem de lookup por campo gravado (`p.beta.classe`/`p.status`), e nada é
 * recomputado. Logo o mesmo candidato NUNCA muda de status/cor entre versões da
 * régua/gabarito — o PDF reproduzido é função pura do snapshot.
 *
 * TESTE de completude: se o re-render precisar de QUALQUER módulo do motor pra
 * rodar, o snapshot está incompleto.
 */
export async function reRenderAdequacaoFromSnapshot(snapshot: string | AdequacaoRenderInput): Promise<Buffer> {
  const props: AdequacaoRenderInput = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
  return renderAdequacaoCargoPDF(props);
}
