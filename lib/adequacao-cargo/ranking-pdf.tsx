/**
 * PDF CANÔNICO do Ranking de Adequação ao Cargo (@react-pdf/renderer).
 *
 * VIEW PURA do snapshot — recebe o resultado já assado (nunca recomputa). Documento
 * completo do pool (independe dos filtros da tela). TRAVAS: bloqueados só no anexo (sem
 * aderência); ordena por ADERÊNCIA (veredito imune ao pool), destacando o eixo que SEPARA
 * como foco de leitura + desempate; disclaimer apoio-à-decisão; data do snapshot;
 * narrativas vêm do snapshot (nunca gera nova) e degradam gracioso se vazias.
 *
 * VISUAL (01/07): layout editorial estilo Atman/Halifax do handoff do Rodrigo — capa navy
 * com faixa de métricas, régua de aderência com marcador circular, cards brancos, barra
 * segmentada de pesos. Paleta = Tinta & Sinal (a mesma do mockup); tipografia = Fraunces
 * (display) + Inter (corpo), o padrão dos PDFs Vertho (NÃO a sans-bold do mockup).
 */
import React from 'react';
import { Document, Page, View, Text, StyleSheet, Svg, Rect, Line, Circle, Font, renderToBuffer } from '@react-pdf/renderer';
import type { AdequacaoCargo, PessoaAdequacao, GateDef } from './aggregate';

const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';
// CORPO = Inter (não liga fi/fl, provado em todos os PDFs). DISPLAY = Fraunces (serifa T&S).
try {
  Font.register({ family: 'Fraunces', fonts: [{ src: `${CDN}/fraunces@latest/latin-600-normal.ttf`, fontWeight: 600 }] });
  Font.register({ family: 'Inter', fonts: [
    { src: `${CDN}/inter@latest/latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${CDN}/inter@latest/latin-600-normal.ttf`, fontWeight: 600 },
  ] });
  Font.registerHyphenationCallback((w: string) => [w]);
} catch { /* fontsource indisponível → default do react-pdf, render não quebra */ }
const DISPLAY = 'Fraunces';
const BODY = 'Inter';

// ── Tinta & Sinal ────────────────────────────────────────────────────────────
const T = { navy: '#0B1B2E', cyan: '#3DD2E6', teal: '#14808C', clay: '#E0A156', verde: '#1D9E75', vermelho: '#C0504D', off: '#F4F1EA', ink: '#22303C', mute: '#6B7B88' };
// Tons claros p/ zonas/faixas/cards (derivados da paleta, baixa saturação).
const CL = { card: '#FFFFFF', cardBorda: '#E9E3D6', track: '#ECE7DC', zVerde: '#D4EBDF', zClay: '#F5E5CE', zVerm: '#F0DBD7', faixa: '#D4EBDF', linha: '#E4DECF', navyLine: 'rgba(255,255,255,0.10)' };
const Cor = (status: string) => status === 'recomendado' ? T.verde : status === 'recomendado_com_ressalvas' ? T.clay : status === 'abaixo_do_corte' ? T.mute : T.vermelho;
const DIR_LABEL: Record<string, string> = { floor: 'piso — quanto mais, melhor', target: 'faixa-alvo', ceiling: 'teto — quanto menos, melhor' };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const s = StyleSheet.create({
  pageDark: { backgroundColor: T.navy, color: T.off, fontFamily: BODY, fontSize: 9, padding: 46, paddingBottom: 46 },
  pageLight: { backgroundColor: T.off, color: T.ink, fontFamily: BODY, fontSize: 9, padding: 40, paddingBottom: 48 },
  eyebrow: { fontSize: 8, letterSpacing: 1.6, textTransform: 'uppercase', color: T.teal, fontWeight: 600 },
  h2: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 22, color: T.navy },
  num: { fontFamily: DISPLAY, fontWeight: 600 },
  card: { backgroundColor: CL.card, borderRadius: 10, borderWidth: 1, borderColor: CL.cardBorda, padding: 20, marginBottom: 0 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 6.5, color: T.mute, textAlign: 'center' },
});
const DISCLAIMER = 'Apoio à decisão. Este documento reorganiza e apresenta o resultado da avaliação — não seleciona nem elimina candidatos. A escolha final cabe ao gestor ou psicólogo responsável.';
const fmtData = (iso?: string | null) => iso ? (() => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; })() : '—';
const fmtDataLonga = (iso?: string | null) => { if (!iso) return '—'; const M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']; const [y, m, d] = iso.slice(0, 10).split('-'); return `${Number(d)} de ${M[Number(m) - 1]} de ${y}`; };
// Aderência (número-herói) em 1 casa decimal, vírgula pt-BR.
const fmtBeta = (v: number) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');

// Marca Vertho (4 quadradinhos T&S) — substitui o badge "af" do mockup (Atman).
const Marca = ({ dark }: { dark?: boolean }) => (
  <View style={{ flexDirection: 'row', gap: 3 }}>
    {[T.cyan, T.clay, T.teal, T.verde].map((c, i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: c }} />)}
  </View>
);

// ── Régua de aderência: base rosa (não-recomendado) + cápsula verde (≥corte) + marcador
//    circular colorido pelo status. É o VEREDITO visual — cada candidato posicionado. ──
function ReguaAderencia({ beta, emin, rec, cor, W = 230, H = 9, r = 6 }: { beta: number; emin: number; rec: number; cor: string; W?: number; H?: number; r?: number }) {
  const x = (v: number) => clamp(((clamp(v, emin, 100) - emin) / (100 - emin)) * W, r, W - r);
  return (
    <Svg width={W} height={H + 6}>
      <Rect x={0} y={3} width={W} height={H} rx={H / 2} fill={CL.zVerm} />
      <Rect x={x(rec) - r} y={3} width={W - (x(rec) - r)} height={H} rx={H / 2} fill={CL.zVerde} />
      <Circle cx={x(beta)} cy={3 + H / 2} r={r} fill={cor} stroke="#FFFFFF" strokeWidth={1.6} />
    </Svg>
  );
}

// ── Barra-contra-faixa (Análise Individual): track pill + faixa ideal destacada +
//    marcador CIRCULAR. Cor: gap→vermelho · dentro da faixa→verde · fora tolerável→clay. ──
function BarraTraco({ label, bruto, lo, hi, direcao, fitPct, isGap }: { label: string; bruto: number | null; lo: number | null; hi: number | null; direcao?: string; fitPct?: number | null; isGap?: boolean }) {
  const W = 210, H = 7, r = 5;
  const x = (v: number) => clamp((v / 100) * W, r, W - r);
  const L = lo ?? 0, Hh = hi ?? 100;
  const banda = direcao === 'floor' ? [L, 100] : direcao === 'ceiling' ? [0, Hh] : [L, Hh];
  const dentro = bruto != null && bruto >= banda[0] && bruto <= banda[1];
  const cor = fitPct == null ? (dentro ? T.verde : T.vermelho) : (isGap ? T.vermelho : dentro ? T.verde : T.clay);
  const bx0 = clamp((banda[0] / 100) * W, 0, W), bx1 = clamp((banda[1] / 100) * W, 0, W);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
      <Text style={{ width: 96, fontSize: 8, color: T.ink }}>{label}</Text>
      <Svg width={W} height={H + 6}>
        <Rect x={0} y={3} width={W} height={H} rx={H / 2} fill={CL.track} />
        <Rect x={bx0} y={3} width={Math.max(2, bx1 - bx0)} height={H} rx={H / 2} fill={CL.faixa} />
        {bruto != null && <Circle cx={x(bruto)} cy={3 + H / 2} r={r} fill={cor} stroke="#FFFFFF" strokeWidth={1.4} />}
      </Svg>
      <Text style={[s.num, { width: 26, textAlign: 'right', fontSize: 9.5, color: T.navy }]}>{bruto != null ? Math.round(bruto) : '—'}</Text>
      <Text style={{ width: 40, textAlign: 'right', fontSize: 6.5, color: T.mute }}>{fitPct != null ? `· ${Math.round(fitPct)}% fit` : ''}</Text>
    </View>
  );
}

const SeloStatus = ({ status, label }: { status: string; label: string }) => {
  const c = Cor(status);
  return <View style={{ backgroundColor: c + '22', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}><Text style={{ fontSize: 7.5, color: c, fontWeight: 600 }}>{label}</Text></View>;
};
const Legenda = () => (
  <View style={{ flexDirection: 'row', gap: 14, marginBottom: 10 }}>
    {[[T.verde, 'Dentro / ótimo'], [T.clay, 'Fora do ideal, tolerável'], [T.vermelho, 'Gap a desenvolver']].map(([c, t], i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} /><Text style={{ fontSize: 7, color: T.mute }}>{t}</Text></View>
    ))}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 12, height: 6, borderRadius: 3, backgroundColor: CL.faixa }} /><Text style={{ fontSize: 7, color: T.mute }}>Faixa ideal</Text></View>
  </View>
);

// ── CAPA (navy) — marca, título, régua de distribuição, métricas, disclaimer ──
function Capa({ empresaNome, cargo, dataISO, metricas, emin, faixas, elegiveis }: any) {
  const rec = faixas?.recomendadoMin ?? 86.5;
  const W = 380;
  const x = (v: number) => clamp(((clamp(v, emin, 100) - emin) / (100 - emin)) * W, 4, W - 4);
  return (
    <Page size="A4" style={s.pageDark}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Marca dark />
        <Text style={{ fontSize: 8, color: T.mute, letterSpacing: 1 }}>{fmtData(dataISO)?.replace(/\//g, ' · ')}</Text>
      </View>
      <View style={{ marginTop: 90 }}>
        <Text style={{ fontSize: 9, letterSpacing: 2, color: T.cyan, textTransform: 'uppercase', fontWeight: 600, marginBottom: 12 }}>Ranking de Adequação ao Cargo</Text>
        <Text style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 46, color: T.off, lineHeight: 1.05 }}>{cargo}</Text>
        <Text style={{ fontSize: 15, color: T.cyan, marginTop: 14, fontWeight: 600 }}>{empresaNome}</Text>
        <Text style={{ fontSize: 8, color: T.mute, marginTop: 6 }}>Gerado em {fmtDataLonga(dataISO)}</Text>
      </View>
      <View style={{ marginTop: 'auto' }}>
        {/* Distribuição do pool: barra clay (abaixo do corte) + verde (recomendado),
            um ponto por candidato espalhado em 3 fileiras (jitter Y) p/ não empilhar. */}
        {faixas && elegiveis.length > 0 && (() => {
          const acima = elegiveis.filter((p: any) => p.beta.pct >= rec).length;
          const BH = 36, rows = [BH * 0.32, BH * 0.5, BH * 0.68];
          const corPt = (st: string) => st === 'recomendado' ? T.off : st === 'recomendado_com_ressalvas' ? T.clay : T.mute;
          return (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 8.5, color: T.mute, marginBottom: 8 }}>Aderência dos <Text style={{ color: T.off, fontWeight: 600 }}>{elegiveis.length} candidatos elegíveis</Text> — {acima === elegiveis.length ? 'todos' : `${acima} de ${elegiveis.length}`} acima do corte de recomendação</Text>
              <Svg width={W} height={BH}>
                <Rect x={0} y={0} width={W} height={BH} rx={7} fill={T.clay} />
                <Rect x={x(rec)} y={0} width={W - x(rec)} height={BH} rx={7} fill={T.verde} />
                {elegiveis.map((p: any, i: number) => <Circle key={i} cx={x(p.beta.pct)} cy={rows[i % 3]} r={4.2} fill={corPt(p.status)} stroke={T.navy} strokeWidth={0.8} />)}
              </Svg>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: W, marginTop: 5 }}>
                <Text style={{ fontSize: 7, color: T.mute }}>{emin}</Text>
                <Text style={{ fontSize: 7, color: T.off }}>{fmtBeta(rec)} · recomendado</Text>
                <Text style={{ fontSize: 7, color: T.mute }}>100</Text>
              </View>
            </View>
          );
        })()}
        <View style={{ borderTopWidth: 1, borderTopColor: CL.navyLine, paddingTop: 16, flexDirection: 'row', gap: 30 }}>
          {metricas.map((m: any, i: number) => (
            <View key={i}>
              <Text style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 24, color: m.cor }}>{m.n}</Text>
              <Text style={{ fontSize: 8, color: T.mute, marginTop: 1 }}>{m.label}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 7, color: T.mute, marginTop: 16, maxWidth: 420 }}><Text style={{ color: T.off }}>Apoio à decisão.</Text> Este documento reorganiza e apresenta o resultado da avaliação — não seleciona nem elimina candidatos. A escolha final cabe ao gestor ou psicólogo responsável.</Text>
      </View>
    </Page>
  );
}

// ── RANKING — card claro, régua de aderência por candidato ───────────────────
function PaginaRanking({ elegiveis, sep, divergencia, cargo, emin, faixas }: any) {
  const rec = faixas?.recomendadoMin ?? 86.5;
  const RW = 230;
  return (
    <Page size="A4" style={s.pageLight}>
      <View style={s.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
          <View>
            <Text style={s.eyebrow}>Ranking · {cargo}</Text>
            <Text style={[s.h2, { marginTop: 4 }]}>Aderência ao cargo</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.verde }} /><Text style={{ fontSize: 7.5, color: T.mute }}>Recomendado</Text></View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: T.clay }} /><Text style={{ fontSize: 7.5, color: T.mute }}>Com ressalvas</Text></View>
          </View>
        </View>
        <Text style={{ fontSize: 8, color: T.mute, lineHeight: 1.4, marginBottom: 10, maxWidth: 400 }}>Cada candidato posicionado na régua de aderência ({emin} → 100) — a nota final que resume o encaixe do perfil no cargo. Quanto mais à direita, maior a adequação.</Text>
        {divergencia && (
          <View style={{ backgroundColor: 'rgba(224,161,86,0.10)', borderRadius: 6, padding: 8, marginBottom: 10 }}>
            <Text style={{ fontSize: 7.5, color: T.clay, lineHeight: 1.4 }}>Neste grupo, {divergencia.eixo} (bloco de maior peso) quase não diferencia os candidatos (dispersão {divergencia.sdEixo}). A ordem segue a aderência; quem de fato separa é {divergencia.real} — é nela que a entrevista deve focar.</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: CL.linha, paddingBottom: 4, marginBottom: 5 }}>
          <Text style={{ width: 22, fontSize: 6.5, color: T.mute, letterSpacing: 0.5 }}></Text>
          <Text style={{ flex: 1, fontSize: 6.5, color: T.mute, letterSpacing: 1, textTransform: 'uppercase' }}>Candidato</Text>
          <View style={{ width: RW, flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 6.5, color: T.mute }}>{emin}</Text><Text style={{ fontSize: 6.5, color: T.teal }}>{fmtBeta(rec)} · recom.</Text><Text style={{ fontSize: 6.5, color: T.mute }}>100</Text></View>
          <Text style={{ width: 44, fontSize: 6.5, color: T.mute, textAlign: 'right', letterSpacing: 1 }}>FIT</Text>
        </View>
        {elegiveis.map((p: PessoaAdequacao, i: number) => (
          <View key={p.id || p.nome} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3.5, borderBottomWidth: i < elegiveis.length - 1 ? 0.5 : 0, borderBottomColor: '#F0ECE2' }}>
            <Text style={[s.num, { width: 22, fontSize: 8.5, color: T.teal }]}>{String(i + 1).padStart(2, '0')}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9, color: T.navy, fontWeight: 600 }}>{p.nome}{p.borderline ? <Text style={{ fontSize: 6.5, color: T.clay }}>  ± {p.betaSemDelta}</Text> : ''}</Text>
            </View>
            <View style={{ width: RW }}><ReguaAderencia beta={p.beta.pct} emin={emin} rec={rec} cor={Cor(p.status)} W={RW} /></View>
            <Text style={[s.num, { width: 44, textAlign: 'right', fontSize: 11, color: T.navy }]}>{fmtBeta(p.beta.pct)}%</Text>
          </View>
        ))}
      </View>
      <Text style={s.footer} fixed>{DISCLAIMER}</Text>
    </Page>
  );
}

// ── GABARITO — barra segmentada de pesos, cortes, faixas, gates ──────────────
function PaginaGabarito({ perfilIdeal }: { perfilIdeal: AdequacaoCargo['perfilIdeal'] }) {
  const gates = (perfilIdeal as any).gates as GateDef[] | undefined;
  const faixas = (perfilIdeal as any).faixas as { recomendadoMin: number; ressalvasMin: number } | undefined;
  const pesos = perfilIdeal.pesos || [];
  const CORPESO = [T.navy, T.teal, T.clay, T.mute];
  return (
    <Page size="A4" style={s.pageLight}>
      <View style={s.card}>
        <Text style={s.eyebrow}>Critério do cargo</Text>
        <Text style={[s.h2, { marginTop: 4, marginBottom: 4 }]}>Gabarito do cargo</Text>
        <Text style={{ fontSize: 8, color: T.mute, lineHeight: 1.4, marginBottom: 14, maxWidth: 400 }}>Como a adequação é calculada: o peso de cada bloco, os cortes que definem o rótulo, as faixas ideais de cada competência e os requisitos que eliminam.</Text>

        <Text style={{ fontSize: 8.5, fontWeight: 600, marginBottom: 5, color: T.navy }}>Pesos por bloco</Text>
        <View style={{ flexDirection: 'row', height: 26, borderRadius: 5, overflow: 'hidden', marginBottom: 16 }}>
          {pesos.map((p, i) => (
            <View key={p.bloco} style={{ width: `${p.pct}%`, backgroundColor: CORPESO[i % CORPESO.length], justifyContent: 'center', paddingHorizontal: 7 }}>
              <Text style={{ fontSize: 7.5, color: '#FFFFFF', fontWeight: 600 }}>{p.pct >= 15 ? `${p.bloco} · ${p.pct}%` : `${p.pct}%`}</Text>
            </View>
          ))}
        </View>

        <Text style={{ fontSize: 8.5, fontWeight: 600, marginBottom: 5, color: T.navy }}>Cortes de aderência (o que decide o rótulo)</Text>
        {faixas ? (
          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 5, marginBottom: 4 }}>
              {[[T.verde, `Recomendado ${fmtBeta(faixas.recomendadoMin)}%+`], [T.clay, `Com ressalvas ${fmtBeta(faixas.ressalvasMin)}%+`], [T.mute, `Abaixo do corte < ${fmtBeta(faixas.ressalvasMin)}%`]].map(([c, t], i) => (
                <View key={i} style={{ backgroundColor: c, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 }}><Text style={{ fontSize: 7.5, color: '#FFFFFF', fontWeight: 600 }}>{t}</Text></View>
              ))}
            </View>
            <Text style={{ fontSize: 7, color: T.mute, lineHeight: 1.4 }}>A aderência é a média ponderada dos blocos. "Abaixo do corte" NÃO é eliminação por requisito — é nota de aderência insuficiente (não bloqueia, mas não recomenda). Eliminatórios são os gates abaixo.</Text>
          </View>
        ) : <Text style={{ fontSize: 8, color: T.mute, marginBottom: 16 }}>Cortes não gravados neste snapshot. Regere o relatório para incluí-los.</Text>}

        <Text style={{ fontSize: 8.5, fontWeight: 600, marginBottom: 5, color: T.navy }}>Faixas ideais por competência</Text>
        <View style={{ marginBottom: 14 }}>
          {perfilIdeal.competencias.slice(0, 14).map((c: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 2.5, paddingVertical: 1 }}>
              <Text style={{ width: 150, fontSize: 8, color: T.ink }}>{c.nome}</Text>
              <Text style={[s.num, { fontSize: 8.5, color: T.navy, width: 60 }]}>{c.min}{c.max ? `–${c.max}` : ''}</Text>
              <Text style={{ fontSize: 7, color: T.mute }}>{DIR_LABEL[c.direcao] || ''}</Text>
            </View>
          ))}
        </View>

        <Text style={{ fontSize: 8.5, fontWeight: 600, marginBottom: 5, color: T.vermelho }}>Requisitos eliminatórios (gates)</Text>
        {gates && gates.length > 0 ? gates.map((g, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 2 }}>
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: T.vermelho, marginRight: 6, marginTop: 3 }} />
            <Text style={{ fontSize: 8, color: T.ink }}>{g.label}{g.tipo === 'trait' && g.piso != null ? ` — mínimo ${g.piso} (aderência ${g.minPct}%+)` : ` — aderência do bloco ${g.minPct}%+`}</Text>
          </View>
        )) : <Text style={{ fontSize: 8, color: T.mute }}>Sem requisitos eliminatórios. O corte é só por aderência.</Text>}
      </View>
      <Text style={s.footer} fixed>{DISCLAIMER}</Text>
    </Page>
  );
}

// ── ANÁLISE INDIVIDUAL — um card branco por candidato ────────────────────────
function AnaliseIndividual({ elegiveis, narrativas, gates }: any) {
  const gateLabels = new Set<string>((gates || []).map((g: GateDef) => g.label));
  return (
    <Page size="A4" style={s.pageLight} wrap>
      <Text style={s.eyebrow}>Análise individual</Text>
      <Text style={[s.h2, { marginTop: 4, marginBottom: 4 }]}>Candidatos elegíveis</Text>
      <Text style={{ fontSize: 7.5, color: T.mute, marginBottom: 8, lineHeight: 1.4, maxWidth: 460 }}>Cada barra mostra o valor bruto (0–100) do traço contra a faixa ideal (área destacada). O marcador indica onde o candidato está.</Text>
      <Legenda />
      {elegiveis.map((p: PessoaAdequacao) => {
        const narr = narrativas?.[p.nome];
        const gapLabels = new Set((p.gaps || []).map((g) => g.traco));
        const relevantes = (p.tracos || []).filter((t) => gapLabels.has(t.label) || gateLabels.has(t.label) || (t.fitPct ?? 100) < 90);
        const resto = (p.tracos || []).length - relevantes.length;
        return (
          <View key={p.id || p.nome} style={[s.card, { padding: 14, marginBottom: 8 }]} wrap={false}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11.5, fontWeight: 600, color: T.navy, marginBottom: 3 }}>{p.nome}</Text>
                <SeloStatus status={p.status} label={p.statusLabel} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={[s.num, { fontSize: 20, color: Cor(p.status) }]}>{fmtBeta(p.beta.pct)}</Text>
                <Text style={{ fontSize: 9, color: Cor(p.status), marginLeft: 1 }}>%</Text>
              </View>
            </View>
            <Text style={{ fontSize: 6.5, color: T.mute, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right', marginTop: -2, marginBottom: 4 }}>Aderência</Text>
            {narr && <Text style={{ fontSize: 8, color: T.ink, lineHeight: 1.5, marginBottom: 6 }}>{narr}</Text>}
            {relevantes.map((t, i) => <BarraTraco key={i} label={t.label} bruto={t.bruto} lo={t.lo} hi={t.hi} direcao={t.direcao} fitPct={t.fitPct} isGap={gapLabels.has(t.label)} />)}
            {relevantes.length === 0
              ? <Text style={{ fontSize: 7.5, color: T.verde, marginTop: 1 }}>Todos os {resto} traços dentro do ideal.</Text>
              : resto > 0 && <Text style={{ fontSize: 7, color: T.mute, marginTop: 2 }}>+ {resto} traços dentro do ideal.</Text>}
          </View>
        );
      })}
      <Text style={s.footer} fixed>{DISCLAIMER}</Text>
    </Page>
  );
}

// ── PLANO ────────────────────────────────────────────────────────────────────
function PlanoDesenvolvimento({ elegiveis }: any) {
  const comGap = elegiveis.filter((p: PessoaAdequacao) => (p.gaps || []).length > 0);
  return (
    <Page size="A4" style={s.pageLight}>
      <View style={s.card}>
        <Text style={s.eyebrow}>Desenvolvimento</Text>
        <Text style={[s.h2, { marginTop: 4, marginBottom: 10 }]}>Plano — gaps desenvolvíveis</Text>
        <Text style={{ fontSize: 7.5, color: T.mute, marginBottom: 10 }}>Janela sugerida de 90 dias. Só traços desenvolvíveis (nunca requisito eliminatório).</Text>
        {comGap.length === 0 && <Text style={{ fontSize: 8, color: T.mute }}>Nenhum candidato elegível com gap desenvolvível.</Text>}
        {comGap.map((p: PessoaAdequacao) => (
          <View key={p.id || p.nome} style={{ marginBottom: 8, borderTopWidth: 0.5, borderTopColor: CL.linha, paddingTop: 6 }}>
            <Text style={{ fontSize: 9.5, fontWeight: 600, color: T.navy, marginBottom: 2 }}>{p.nome}</Text>
            {(p.gaps || []).map((g, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 1.5 }}>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: T.clay, marginRight: 6, marginTop: 3 }} />
                <Text style={{ fontSize: 8, color: T.ink }}>{g.traco} — {g.valorBruto != null && g.lo != null ? `bruto ${Math.round(g.valorBruto)} · ` : ''}fit {g.fitPct}%{g.lo != null ? ` (faixa começa em ${g.lo})` : ''} — trilha Mentor IA a definir.</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <Text style={s.footer} fixed>{DISCLAIMER}</Text>
    </Page>
  );
}

// ── ANEXO ────────────────────────────────────────────────────────────────────
function AnexoNaoElegiveis({ anexo }: { anexo: PessoaAdequacao[] }) {
  return (
    <Page size="A4" style={s.pageLight}>
      <View style={s.card}>
        <Text style={[s.eyebrow, { color: T.vermelho }]}>Anexo</Text>
        <Text style={[s.h2, { marginTop: 4, marginBottom: 4 }]}>Não elegíveis por requisito</Text>
        <Text style={{ fontSize: 7.5, color: T.mute, marginBottom: 10, lineHeight: 1.4, maxWidth: 440 }}>Bloqueados por um critério inegociável do cargo. Aderência não se aplica — o requisito não atendido é o que decide.</Text>
        {anexo.length === 0
          ? <Text style={{ fontSize: 9, color: T.mute }}>Nenhum candidato bloqueado neste pool.</Text>
          : anexo.map((p) => (
            <View key={p.id || p.nome} style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4, borderTopWidth: 0.5, borderTopColor: CL.linha, paddingTop: 4 }}>
              <Text style={{ fontSize: 9, fontWeight: 600, color: T.navy, width: 160 }}>{p.nome}</Text>
              <Text style={{ flex: 1, fontSize: 8, color: T.vermelho }}>{(p.knockoutEvidencias || []).map((e) => e.ehBloco ? `${e.traco} ${Math.round(e.medidoPct ?? 0)}% < ${Math.round(e.minPct ?? 0)}%` : `${e.traco} ${e.valorBruto} < ${e.piso}`).join(' · ')}</Text>
            </View>
          ))}
      </View>
      <Text style={s.footer} fixed>{DISCLAIMER}</Text>
    </Page>
  );
}

// ── Documento + render ───────────────────────────────────────────────────────
export interface RankingPDFInput {
  empresaNome: string; cargo: string; dataISO: string | null;
  perfilIdeal: AdequacaoCargo['perfilIdeal'];
  eixo: { label: string; peso: number | null };
  sep: string;
  divergencia: { eixo: string; real: string; sdEixo: number } | null;
  elegiveis: PessoaAdequacao[];   // FULL, já ordenados por aderência (desempate sep), com __sepFit/__mortoFit
  anexo: PessoaAdequacao[];
  narrativas: Record<string, string>;
}

export async function renderRankingAdequacaoPDF(p: RankingPDFInput): Promise<Buffer> {
  const gates = (p.perfilIdeal as any).gates;
  const faixas = (p.perfilIdeal as any).faixas as { recomendadoMin: number; ressalvasMin: number } | undefined;
  // Escala da régua: cobre o menor beta elegível (com margem), teto 75 — nunca corta ninguém.
  const betas = p.elegiveis.map((x) => x.beta.pct);
  const emin = Math.max(0, Math.min(75, Math.floor((Math.min(...betas, faixas?.ressalvasMin ?? 75) - 2) / 5) * 5));
  // Métricas da capa (só as com contagem relevante).
  const cont = (st: string) => p.elegiveis.filter((x) => x.status === st).length;
  const metricas = [
    { n: p.elegiveis.length, label: 'elegíveis', cor: T.cyan },
    { n: cont('recomendado'), label: 'recomendados', cor: T.verde },
    { n: cont('recomendado_com_ressalvas'), label: 'com ressalvas', cor: T.clay },
    ...(cont('abaixo_do_corte') > 0 ? [{ n: cont('abaixo_do_corte'), label: 'abaixo do corte', cor: T.mute }] : []),
    { n: p.anexo.length, label: 'não elegíveis', cor: T.mute },
  ];
  return renderToBuffer(
    <Document creationDate={p.dataISO ? new Date(p.dataISO) : undefined} producer="Vertho" creator="Vertho">
      <Capa empresaNome={p.empresaNome} cargo={p.cargo} dataISO={p.dataISO} metricas={metricas} emin={emin} faixas={faixas} elegiveis={p.elegiveis} />
      <PaginaRanking elegiveis={p.elegiveis} sep={p.sep} divergencia={p.divergencia} cargo={p.cargo} emin={emin} faixas={faixas} />
      <PaginaGabarito perfilIdeal={p.perfilIdeal} />
      <AnaliseIndividual elegiveis={p.elegiveis} narrativas={p.narrativas} gates={gates} />
      <PlanoDesenvolvimento elegiveis={p.elegiveis} />
      <AnexoNaoElegiveis anexo={p.anexo} />
    </Document>,
  );
}
