/**
 * PDF CANÔNICO do Ranking de Adequação ao Cargo (@react-pdf/renderer).
 *
 * VIEW PURA do snapshot — recebe o resultado já assado (nunca recomputa). Documento
 * completo do pool (independe dos filtros da tela). TRAVAS: bloqueados só no anexo (sem
 * aderência); ordena/destaca pelo eixo que SEPARA; disclaimer apoio-à-decisão; data do
 * snapshot; narrativas vêm do snapshot (nunca gera nova) e degradam gracioso se vazias.
 *
 * Fontes via fontsource CDN (mesmo mecanismo do Inter do projeto), pesos ESTÁTICOS:
 * Fraunces 600 (display/números) + Plus Jakarta Sans 400/600 (corpo). Fallback: Inter.
 */
import React from 'react';
import { Document, Page, View, Text, StyleSheet, Svg, Rect, Line, Font, renderToBuffer } from '@react-pdf/renderer';
import type { AdequacaoCargo, PessoaAdequacao, GateDef } from './aggregate';

const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';
// CORPO = Inter. A Plus Jakarta do fontsource aplica a ligadura fi/fl DESTRUTIVA
// ("final"→"ﬁnal" com i sem pingo → lê como letra faltando), mesma armadilha que já
// tinha aposentado a NotoSans no projeto. A Inter do fontsource NÃO liga fi (i pontuado
// normal) — é a fonte de corpo provada de todos os PDFs. DISPLAY = Fraunces (serifa T&S;
// nenhum título do template contém "fi", então a ligadura da Fraunces não dispara).
try {
  Font.register({ family: 'Fraunces', fonts: [{ src: `${CDN}/fraunces@latest/latin-600-normal.ttf`, fontWeight: 600 }] });
  Font.register({ family: 'Inter', fonts: [
    { src: `${CDN}/inter@latest/latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${CDN}/inter@latest/latin-600-normal.ttf`, fontWeight: 600 },
  ] });
  Font.registerHyphenationCallback((w: string) => [w]);
} catch { /* fontsource indisponível → cai p/ default do react-pdf, render não quebra */ }
const DISPLAY = 'Fraunces';
const BODY = 'Inter';

// ── Tinta & Sinal ────────────────────────────────────────────────────────────
const T = { navy: '#0B1B2E', cyan: '#3DD2E6', teal: '#14808C', clay: '#E0A156', verde: '#1D9E75', vermelho: '#C0504D', off: '#F4F1EA', ink: '#22303C', mute: '#6B7B88' };
const Cor = (status: string) => status === 'recomendado' ? T.verde : status === 'recomendado_com_ressalvas' ? T.clay : T.mute;
const DIR_LABEL: Record<string, string> = { floor: '(piso — quanto mais, melhor)', target: '(faixa-alvo)', ceiling: '(teto — quanto menos, melhor)' };

const s = StyleSheet.create({
  // escuras (pontua)
  pageDark: { backgroundColor: T.navy, color: T.off, fontFamily: BODY, fontSize: 9, padding: 36, paddingBottom: 46 },
  // claras (carrega)
  pageLight: { backgroundColor: T.off, color: T.ink, fontFamily: BODY, fontSize: 9, padding: 36, paddingBottom: 46 },
  h1: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 30, color: T.off },
  h2: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 15 },
  num: { fontFamily: DISPLAY, fontWeight: 600 },
  eyebrow: { fontSize: 7.5, letterSpacing: 1.2, textTransform: 'uppercase', color: T.cyan },
  card: { borderRadius: 6, padding: 8, marginBottom: 4 },
  footer: { position: 'absolute', bottom: 22, left: 36, right: 36, fontSize: 7, color: T.mute, textAlign: 'center' },
});
const DISCLAIMER = 'Apoio à decisão. Este documento reorganiza e apresenta o resultado da avaliação — não seleciona nem elimina candidatos. A escolha final cabe ao gestor ou psicólogo responsável.';
const fmtData = (iso?: string | null) => iso ? (() => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; })() : '—';
const iniciais = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');

// ── Barra-contra-faixa (SVG): banda lo→hi (target) / lo→100 (floor) / 0→hi (ceiling),
//    linha no piso, marcador do bruto (verde dentro / vermelho fora), escala 0-100. ──
function BarraTraco({ label, bruto, lo, hi, direcao, fitPct }: { label: string; bruto: number | null; lo: number | null; hi: number | null; direcao?: string; fitPct?: number | null }) {
  const W = 200, H = 9;
  const x = (v: number) => Math.max(0, Math.min(W, (v / 100) * W));
  const L = lo ?? 0, Hh = hi ?? 100;
  const banda = direcao === 'floor' ? [L, 100] : direcao === 'ceiling' ? [0, Hh] : [L, Hh];
  const dentro = bruto != null && bruto >= banda[0] && bruto <= banda[1];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
      <Text style={{ width: 92, fontSize: 7.5, color: T.ink }}>{label}</Text>
      <Svg width={W} height={H + 2}>
        <Rect x={0} y={H / 2 - 0.5} width={W} height={1} fill="#D8D2C4" />
        <Rect x={x(banda[0])} y={0} width={x(banda[1]) - x(banda[0])} height={H} rx={1.5} fill={T.verde} fillOpacity={0.18} />
        {lo != null && <Line x1={x(L)} y1={0} x2={x(L)} y2={H} stroke={T.teal} strokeWidth={0.8} strokeDasharray="1.5 1.5" />}
        {bruto != null && <Rect x={x(bruto) - 1.2} y={-1} width={2.4} height={H + 2} rx={1} fill={dentro ? T.verde : T.vermelho} />}
      </Svg>
      <Text style={[s.num, { width: 22, textAlign: 'right', fontSize: 8, color: dentro ? T.verde : T.vermelho }]}>{bruto != null ? Math.round(bruto) : '—'}</Text>
      <Text style={{ width: 34, textAlign: 'right', fontSize: 6.5, color: T.mute }}>{fitPct != null ? `${Math.round(fitPct)}% fit` : ''}</Text>
    </View>
  );
}

// ── CAPA ─────────────────────────────────────────────────────────────────────
function Capa({ empresaNome, cargo, dataISO }: any) {
  return (
    <Page size="A4" style={s.pageDark}>
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 40 }}>
        {[T.cyan, T.clay, T.teal, T.verde].map((c, i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} />)}
      </View>
      <Text style={s.eyebrow}>Documento canônico</Text>
      <Text style={[s.h1, { marginTop: 8, marginBottom: 4 }]}>Ranking de Adequação</Text>
      <Text style={[s.h1, { fontSize: 20, color: T.cyan }]}>ao Cargo</Text>
      <View style={{ marginTop: 'auto' }}>
        <Text style={{ fontSize: 13, color: T.off, marginBottom: 2 }}>{cargo}</Text>
        <Text style={{ fontSize: 10, color: T.cyan }}>{empresaNome}</Text>
        <Text style={{ fontSize: 8, color: T.mute, marginTop: 10 }}>Ranking de {fmtData(dataISO)} — foto da geração.</Text>
        <Text style={{ fontSize: 7, color: T.mute, marginTop: 14, maxWidth: 380 }}>{DISCLAIMER}</Text>
      </View>
    </Page>
  );
}

// ── PÁGINA RANKING (escura) ──────────────────────────────────────────────────
function PaginaRanking({ elegiveis, eixo, sep, divergencia, narrCount, cargo }: any) {
  const eixoMorto = divergencia ? eixo.label : null;
  return (
    <Page size="A4" style={s.pageDark}>
      <Text style={s.eyebrow}>Ranking · {cargo}</Text>
      <Text style={[s.h2, { color: T.off, marginTop: 3, marginBottom: 2 }]}>{elegiveis.length} candidatos elegíveis</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8, fontSize: 7.5, color: T.mute }}>
        <Text>Eixo do cargo: <Text style={{ color: T.cyan }}>{sep}</Text>{divergencia ? ' (o que separa)' : ` (peso ${eixo.peso ?? '—'}%)`}</Text>
        <Text><Text style={{ color: T.verde }}>■</Text> Recomendado  <Text style={{ color: T.clay }}>■</Text> Com ressalvas  <Text style={{ color: T.mute }}>■</Text> Abaixo do corte</Text>
      </View>
      {divergencia && (
        <View style={[s.card, { backgroundColor: 'rgba(224,161,86,0.12)', marginBottom: 8 }]}>
          <Text style={{ fontSize: 7.5, color: T.clay }}>Neste grupo, {divergencia.eixo} (bloco de maior peso) quase não diferencia os candidatos (dispersão {divergencia.sdEixo}). Quem separa de fato é {divergencia.real} — ordenamos e destacamos por ela; {divergencia.eixo} aparece como contexto.</Text>
        </View>
      )}
      {elegiveis.map((p: PessoaAdequacao, i: number) => {
        const cor = Cor(p.status); const sepFit = (p as any).__sepFit; const morto = eixoMorto ? (p as any).__mortoFit : null;
        return (
          <View key={p.id || p.nome} style={{ flexDirection: 'row', alignItems: 'center', borderLeftWidth: 3, borderLeftColor: cor, paddingLeft: 6, paddingVertical: 3, marginBottom: 1 }}>
            <Text style={[s.num, { width: 18, fontSize: 9, color: T.mute }]}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 9.5, color: T.off }}>{p.nome} {p.borderline && <Text style={{ fontSize: 7, color: T.clay }}>  ± {p.betaSemDelta}</Text>}</Text>
              <Text style={{ fontSize: 6.5, color: T.mute }}>{p.statusLabel}{p.gaps?.length ? ` · a desenvolver: ${p.gaps.map((g) => g.traco).join(', ')}` : ''}</Text>
            </View>
            <Text style={{ fontSize: 7, color: T.cyan, width: 96, textAlign: 'right' }}>{sep} {sepFit != null ? Math.round(sepFit) + '%' : '—'}{morto != null ? ` · ${eixoMorto} ${Math.round(morto)}%` : ''}</Text>
            <Text style={[s.num, { width: 40, textAlign: 'right', fontSize: 12, color: cor }]}>{Math.round(p.beta.pct)}%</Text>
          </View>
        );
      })}
      <Text style={s.footer} fixed>{DISCLAIMER}</Text>
    </Page>
  );
}

// ── PÁGINA GABARITO (clara) ──────────────────────────────────────────────────
function PaginaGabarito({ perfilIdeal }: { perfilIdeal: AdequacaoCargo['perfilIdeal'] }) {
  const gates = (perfilIdeal as any).gates as GateDef[] | undefined;
  const faixas = (perfilIdeal as any).faixas as { recomendadoMin: number; ressalvasMin: number } | undefined;
  return (
    <Page size="A4" style={s.pageLight}>
      <Text style={[s.eyebrow, { color: T.teal }]}>Critério do cargo</Text>
      <Text style={[s.h2, { color: T.ink, marginTop: 3, marginBottom: 8 }]}>Gabarito — pesos, faixas, aderência e eliminatórias</Text>

      <Text style={{ fontSize: 9, fontWeight: 600, marginBottom: 3, color: T.teal }}>Pesos por bloco</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
        {perfilIdeal.pesos.map((p) => <View key={p.bloco} style={{ borderWidth: 1, borderColor: '#D8D2C4', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 }}><Text style={{ fontSize: 8 }}>{p.bloco} <Text style={s.num}>{p.pct}%</Text></Text></View>)}
      </View>

      <Text style={{ fontSize: 9, fontWeight: 600, marginBottom: 3, color: T.teal }}>Cortes de aderência (o que decide o rótulo)</Text>
      {faixas ? (
        <View style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 3 }}>
            <View style={{ backgroundColor: T.verde, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 7.5, color: '#fff' }}>Recomendado ≥ {faixas.recomendadoMin}%</Text></View>
            <View style={{ backgroundColor: T.clay, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 7.5, color: '#fff' }}>Com ressalvas {faixas.ressalvasMin}–{faixas.recomendadoMin - 1}%</Text></View>
            <View style={{ backgroundColor: T.mute, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 }}><Text style={{ fontSize: 7.5, color: '#fff' }}>Abaixo do corte &lt; {faixas.ressalvasMin}%</Text></View>
          </View>
          <Text style={{ fontSize: 7, color: T.mute }}>A aderência é a média ponderada dos blocos. "Abaixo do corte" NÃO é eliminação por requisito — é nota de aderência insuficiente (não bloqueia, mas não recomenda). Eliminatórios são os gates abaixo.</Text>
        </View>
      ) : <Text style={{ fontSize: 8, color: T.mute, marginBottom: 10 }}>Cortes de aderência não gravados neste snapshot (gerado antes do enriquecimento). Regere o relatório para incluí-los.</Text>}

      <Text style={{ fontSize: 9, fontWeight: 600, marginBottom: 3, color: T.teal }}>Faixas ideais por competência</Text>
      {perfilIdeal.competencias.slice(0, 12).map((c: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 1.5 }}>
          <Text style={{ width: 130, fontSize: 8 }}>{c.nome}</Text>
          <Text style={{ fontSize: 8, color: T.mute }}>{c.min}{c.max ? ` – ${c.max}` : ''}{DIR_LABEL[c.direcao] ? `  ${DIR_LABEL[c.direcao]}` : ''}</Text>
        </View>
      ))}

      <Text style={{ fontSize: 9, fontWeight: 600, marginTop: 10, marginBottom: 3, color: T.vermelho }}>Requisitos eliminatórios (gates)</Text>
      {gates && gates.length > 0 ? gates.map((g, i) => (
        <Text key={i} style={{ fontSize: 8, marginBottom: 1.5 }}>• {g.label}{g.tipo === 'trait' && g.piso != null ? ` — mínimo ${g.piso} (aderência ≥ ${g.minPct}%)` : ` — aderência do bloco ≥ ${g.minPct}%`}</Text>
      )) : <Text style={{ fontSize: 8, color: T.mute }}>Sem requisitos eliminatórios gravados neste snapshot. Se o cargo tem gates, regere o relatório para exibi-los; caso contrário, não há eliminatórias — o corte é só por aderência (acima).</Text>}
    </Page>
  );
}

// ── ANÁLISE INDIVIDUAL (clara) ───────────────────────────────────────────────
function AnaliseIndividual({ elegiveis, narrativas, sep, gates }: any) {
  const gateLabels = new Set<string>((gates || []).map((g: GateDef) => g.label));
  return (
    <Page size="A4" style={s.pageLight} wrap>
      <Text style={[s.eyebrow, { color: T.teal }]}>Análise individual</Text>
      <Text style={[s.h2, { color: T.ink, marginTop: 3, marginBottom: 2 }]}>Candidatos elegíveis</Text>
      <Text style={{ fontSize: 7, color: T.mute, marginBottom: 6 }}>Cada barra é o <Text style={{ color: T.ink }}>valor bruto (0–100)</Text> do traço contra a <Text style={{ color: T.verde }}>faixa ideal</Text>; o traço da linha marca o piso. À direita: bruto e o <Text style={{ color: T.ink }}>fit%</Text> (aderência do traço à faixa). Mostramos os traços fora da faixa e os drivers; os que estão dentro são resumidos.</Text>
      {elegiveis.map((p: PessoaAdequacao) => {
        const narr = narrativas?.[p.nome];
        const gapLabels = new Set((p.gaps || []).map((g) => g.traco));
        // Relevância = FORA da faixa (fit<100) OU driver/gate. sep (eixo) é bloco escalar
        // sem traço-a-traço (Liderança/Mapeamento) → não filtra por ele. Isto faz as
        // barras APARECEREM: Comando-acima-do-teto, Conformidade-fora-da-banda etc.
        const relevantes = (p.tracos || []).filter((t) => (t.fitPct ?? 100) < 100 || gapLabels.has(t.label) || gateLabels.has(t.label));
        const resto = (p.tracos || []).length - relevantes.length;
        return (
          <View key={p.id || p.nome} style={{ marginBottom: 9, borderTopWidth: 1, borderTopColor: '#E4DECF', paddingTop: 6 }} wrap={false}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 10.5, fontWeight: 600, flex: 1 }}>{p.nome}</Text>
              <Text style={{ fontSize: 8, color: Cor(p.status) }}>{p.statusLabel}</Text>
              <Text style={[s.num, { fontSize: 12, color: Cor(p.status), marginLeft: 8 }]}>{Math.round(p.beta.pct)}%</Text>
            </View>
            {narr && <Text style={{ fontSize: 8, color: T.ink, lineHeight: 1.45, marginTop: 2, marginBottom: 3 }}>{narr}</Text>}
            {relevantes.map((t, i) => <BarraTraco key={i} label={t.label} bruto={t.bruto} lo={t.lo} hi={t.hi} direcao={t.direcao} fitPct={t.fitPct} />)}
            {relevantes.length === 0
              ? <Text style={{ fontSize: 7.5, color: T.verde, marginTop: 1 }}>Todos os {resto} traços dentro da faixa ideal.</Text>
              : resto > 0 && <Text style={{ fontSize: 7, color: T.mute, marginTop: 1 }}>+ {resto} traços dentro da faixa.</Text>}
          </View>
        );
      })}
    </Page>
  );
}

// ── PLANO DE DESENVOLVIMENTO (clara) ─────────────────────────────────────────
function PlanoDesenvolvimento({ elegiveis }: any) {
  const comGap = elegiveis.filter((p: PessoaAdequacao) => (p.gaps || []).length > 0);
  return (
    <Page size="A4" style={s.pageLight}>
      <Text style={[s.eyebrow, { color: T.teal }]}>Desenvolvimento</Text>
      <Text style={[s.h2, { color: T.ink, marginTop: 3, marginBottom: 8 }]}>Plano — gaps desenvolvíveis (janela 90 dias)</Text>
      {comGap.length === 0 && <Text style={{ fontSize: 8, color: T.mute }}>Nenhum candidato elegível com gap desenvolvível.</Text>}
      {comGap.map((p: PessoaAdequacao) => (
        <View key={p.id || p.nome} style={{ marginBottom: 5 }}>
          <Text style={{ fontSize: 9, fontWeight: 600 }}>{p.nome}</Text>
          {(p.gaps || []).map((g, i) => <Text key={i} style={{ fontSize: 8, color: T.ink, marginLeft: 8 }}>• {g.traco} — {g.valorBruto != null ? `bruto ${g.valorBruto} → ` : ''}fit {g.fitPct}%{g.lo != null ? ` (faixa começa em ${g.lo})` : ''} — trilha Mentor IA a definir.</Text>)}
        </View>
      ))}
    </Page>
  );
}

// ── ANEXO NÃO-ELEGÍVEIS (clara) ──────────────────────────────────────────────
function AnexoNaoElegiveis({ anexo }: { anexo: PessoaAdequacao[] }) {
  return (
    <Page size="A4" style={s.pageLight}>
      <Text style={[s.eyebrow, { color: T.vermelho }]}>Anexo</Text>
      <Text style={[s.h2, { color: T.ink, marginTop: 3, marginBottom: 2 }]}>Não elegíveis por requisito eliminatório</Text>
      <Text style={{ fontSize: 7.5, color: T.mute, marginBottom: 8 }}>Bloqueados por um critério inegociável do cargo. Aderência não se aplica — o requisito não atendido é o que decide.</Text>
      {anexo.length === 0
        ? <Text style={{ fontSize: 9, color: T.mute }}>Nenhum candidato bloqueado neste pool.</Text>
        : anexo.map((p) => (
          <View key={p.id || p.nome} style={{ flexDirection: 'row', marginBottom: 2, alignItems: 'baseline' }}>
            <Text style={{ fontSize: 9, fontWeight: 600, width: 150 }}>{p.nome}</Text>
            <Text style={{ fontSize: 8, color: T.vermelho }}>{(p.knockoutEvidencias || []).map((e) => e.ehBloco ? `${e.traco} ${Math.round(e.medidoPct ?? 0)}% < ${Math.round(e.minPct ?? 0)}%` : `${e.traco} ${e.valorBruto} < ${e.piso}`).join(' · ')}</Text>
          </View>
        ))}
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
  elegiveis: PessoaAdequacao[];   // FULL, já ordenados por sep, com __sepFit/__mortoFit
  anexo: PessoaAdequacao[];
  narrativas: Record<string, string>;
}

export async function renderRankingAdequacaoPDF(p: RankingPDFInput): Promise<Buffer> {
  const gates = (p.perfilIdeal as any).gates;
  return renderToBuffer(
    <Document creationDate={p.dataISO ? new Date(p.dataISO) : undefined} producer="Vertho" creator="Vertho">
      <Capa empresaNome={p.empresaNome} cargo={p.cargo} dataISO={p.dataISO} />
      <PaginaRanking elegiveis={p.elegiveis} eixo={p.eixo} sep={p.sep} divergencia={p.divergencia} cargo={p.cargo} />
      <PaginaGabarito perfilIdeal={p.perfilIdeal} />
      <AnaliseIndividual elegiveis={p.elegiveis} narrativas={p.narrativas} sep={p.sep} gates={gates} />
      <PlanoDesenvolvimento elegiveis={p.elegiveis} />
      <AnexoNaoElegiveis anexo={p.anexo} />
    </Document>,
  );
}
