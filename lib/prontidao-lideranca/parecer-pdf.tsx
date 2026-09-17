/**
 * PDF do PARECER DE PRONTIDÃO (individual) e do CONSOLIDADO da equipe:
 * @react-pdf/renderer, no molde visual de `lib/adequacao-cargo/ranking-pdf.tsx`
 * (Tinta & Sinal, Fraunces + Inter).
 *
 * VIEW PURA do que a agregação calculou: não recomputa, não chama IA. As
 * frases de gap chegam ANCORADAS (competência + média + corte) e são impressas
 * como vieram: o PDF não reescreve o parecer.
 *
 * ⚠️ Nada de "→" no texto: a subset Inter dos PDFs não cobre a seta e o glifo
 * sai em branco (medido: 19 glifos fora do subset). Usa "—".
 */
import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import type { Parecer, ProntidaoLideranca } from './agregar';
import { QUADRANTE_LABEL, RECOMENDACAO_POR_QUADRANTE, ORDEM_QUADRANTES, type Quadrante } from './matriz';
import { DESCRITORES_MIN_CONFIAVEL, POSICAO_LABEL } from './posicao';
import { ESTILO_LABEL } from './estilo';

const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';
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

const T = { navy: '#0B1B2E', cyan: '#3DD2E6', teal: '#14808C', clay: '#E0A156', verde: '#1D9E75', vermelho: '#C0504D', lilas: '#8E7CC3', off: '#F4F1EA', ink: '#22303C', mute: '#6B7B88' };
const CL = { card: '#FFFFFF', cardBorda: '#E9E3D6', linha: '#E4DECF', zVerde: '#D4EBDF', zClay: '#F5E5CE', zVerm: '#F0DBD7', zCyan: '#D7F1F5', zLilas: '#E6E1F3' };

const COR_Q: Record<Quadrante, { cor: string; fundo: string }> = {
  pronta: { cor: T.verde, fundo: CL.zVerde },
  pronta_com_custo: { cor: T.clay, fundo: CL.zClay },
  potencial: { cor: T.teal, fundo: CL.zCyan },
  nao_agora: { cor: T.vermelho, fundo: CL.zVerm },
};

const s = StyleSheet.create({
  pageDark: { backgroundColor: T.navy, color: T.off, fontFamily: BODY, fontSize: 9, padding: 46 },
  pageLight: { backgroundColor: T.off, color: T.ink, fontFamily: BODY, fontSize: 9, padding: 40, paddingBottom: 48 },
  eyebrow: { fontSize: 8, letterSpacing: 1.6, textTransform: 'uppercase', color: T.teal, fontWeight: 600 },
  eyebrowDark: { fontSize: 8, letterSpacing: 1.6, textTransform: 'uppercase', color: T.cyan, fontWeight: 600 },
  h1: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 28, color: T.off, marginTop: 6 },
  h2: { fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, color: T.navy, marginBottom: 8 },
  h3: { fontWeight: 600, fontSize: 10.5, color: T.navy, marginBottom: 4 },
  card: { backgroundColor: CL.card, borderRadius: 10, borderWidth: 1, borderColor: CL.cardBorda, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mute: { color: T.mute },
  small: { fontSize: 8, color: T.mute },
  pill: { fontSize: 7.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, fontSize: 6.5, color: T.mute, textAlign: 'center' },
  linha: { borderBottomWidth: 1, borderBottomColor: CL.linha, paddingVertical: 5 },
  quote: { fontSize: 8.5, color: T.ink, marginLeft: 10, marginTop: 2, borderLeftWidth: 2, borderLeftColor: CL.linha, paddingLeft: 6 },
});

const DISCLAIMER = 'Apoio à decisão. Este documento organiza o que a pessoa demonstrou e o que o perfil dela indica, sem decidir por ninguém. O parecer é insumo da empresa; a decisão é dela.';
const fmtNota = (v: number | null | undefined) => (v == null ? '—' : Number(v).toFixed(2).replace('.', ','));
const fmtPct = (v: number | null | undefined) => (v == null ? '—' : `${Number(v).toFixed(1).replace('.', ',')}%`);
const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
};

const Marca = () => (
  <View style={{ flexDirection: 'row', gap: 3 }}>
    {[T.cyan, T.clay, T.teal, T.verde].map((c, i) => <View key={i} style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: c }} />)}
  </View>
);

const Pill = ({ q }: { q: Quadrante }) => (
  <Text style={[s.pill, { color: COR_Q[q].cor, backgroundColor: COR_Q[q].fundo }]}>{QUADRANTE_LABEL[q]}</Text>
);

const Rodape = ({ empresaNome }: { empresaNome: string }) => (
  <Text style={s.footer} fixed render={({ pageNumber, totalPages }) => `${empresaNome} · Simulador de liderança · ${pageNumber}/${totalPages} · ${DISCLAIMER}`} />
);

// ── PARECER INDIVIDUAL ───────────────────────────────────────────────────────

export interface ParecerPDFInput {
  empresaNome: string;
  parecer: Parecer;
  competencias: string[];
}

function CapaParecer({ p, empresaNome }: { p: Parecer; empresaNome: string }) {
  const l = p.linha;
  return (
    <Page size="A4" style={s.pageDark}>
      <View style={s.row}><Marca /><Text style={s.eyebrowDark}>{empresaNome}</Text></View>
      <View style={{ marginTop: 120 }}>
        <Text style={s.eyebrowDark}>Parecer do simulador de liderança</Text>
        <Text style={s.h1}>{l.nome}</Text>
        <Text style={{ color: T.off, opacity: 0.8, marginTop: 4, fontSize: 10 }}>{l.cargo || 'sem cargo'}  ·  perfil-alvo: {p.cargoAlvo}</Text>
        <View style={{ marginTop: 22, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pill q={l.quadrante as Quadrante} />
        </View>
        <Text style={{ color: T.off, opacity: 0.85, marginTop: 18, fontSize: 9.5, lineHeight: 1.5, maxWidth: 420 }}>{RECOMENDACAO_POR_QUADRANTE[l.quadrante as Quadrante]}</Text>
      </View>
      <View style={{ position: 'absolute', bottom: 46, left: 46, right: 46 }}>
        <View style={s.row}>
          <View><Text style={s.eyebrowDark}>Competência demonstrada</Text><Text style={{ fontFamily: DISPLAY, fontSize: 22, color: T.off }}>{fmtNota(l.posicao.mediaGeral)}</Text><Text style={{ fontSize: 7.5, color: T.off, opacity: 0.7 }}>média geral · corte {fmtNota(p.corte)}</Text></View>
          <View><Text style={s.eyebrowDark}>Aderência de estilo</Text><Text style={{ fontFamily: DISPLAY, fontSize: 22, color: T.off }}>{fmtPct(l.estilo.aderenciaPct)}</Text><Text style={{ fontSize: 7.5, color: T.off, opacity: 0.7 }}>{ESTILO_LABEL[l.estilo.estilo]}</Text></View>
          <View><Text style={s.eyebrowDark}>Calculado em</Text><Text style={{ fontSize: 10, color: T.off, marginTop: 6 }}>{fmtDataHora(p.calculadoEm)}</Text><Text style={{ fontSize: 7.5, color: T.off, opacity: 0.7 }}>não é snapshot</Text></View>
        </View>
      </View>
    </Page>
  );
}

function PaginaPosicao({ p, empresaNome }: { p: Parecer; empresaNome: string }) {
  const l = p.linha;
  return (
    <Page size="A4" style={s.pageLight}>
      <Text style={s.eyebrow}>Camada 1 · o que a pessoa demonstrou</Text>
      <Text style={s.h2}>Posição por competência</Text>
      <View style={s.card}>
        <View style={s.row}><Text style={s.h3}>Média geral {fmtNota(l.posicao.mediaGeral)} · {POSICAO_LABEL[l.posicao.posicao!]}</Text><Text style={s.small}>corte {fmtNota(p.corte)}</Text></View>
        {l.posicao.competencias.map((c) => (
          <View key={c.competencia} style={[s.linha, s.row]}>
            <Text style={{ flex: 1, color: c.gap ? T.vermelho : T.ink }}>{c.competencia}{c.parcial ? ' *' : ''}</Text>
            <Text style={{ width: 60, textAlign: 'right' }}>{fmtNota(c.media)}</Text>
            <Text style={{ width: 46, textAlign: 'right', color: T.mute }}>{c.descritores} desc.</Text>
            <Text style={{ width: 30, textAlign: 'right', color: T.mute }}>N{c.nivel ?? '—'}</Text>
            <Text style={{ width: 90, textAlign: 'right', color: T.mute }}>{c.posicao ? POSICAO_LABEL[c.posicao] : '—'}</Text>
          </View>
        ))}
        {l.posicao.parciais.length > 0 && (
          <Text style={{ marginTop: 8, color: T.clay }}>
            * {l.posicao.parciais.join(', ')} · coberta(s) por menos de {DESCRITORES_MIN_CONFIAVEL} descritores. A média ali é sinal fraco: leia as evidências antes de usá-la.
          </Text>
        )}
        {l.frasesGap.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={[s.eyebrow, { color: T.vermelho }]}>Gaps nomeados</Text>
            {l.frasesGap.map((f) => <Text key={f} style={{ marginTop: 3 }}>{f}</Text>)}
          </View>
        )}
        {l.auditoriaPendente && <Text style={{ marginTop: 10, color: T.clay }}>A auditoria da segunda IA pediu revisão em ao menos uma avaliação desta pessoa. Leia as evidências antes de decidir.</Text>}
      </View>

      <Text style={s.eyebrow}>Camada 2 · leitura de estilo (não decide)</Text>
      <Text style={s.h2}>Aderência ao perfil-alvo</Text>
      <View style={s.card}>
        <View style={s.row}><Text style={s.h3}>{fmtPct(l.estilo.aderenciaPct)} · {ESTILO_LABEL[l.estilo.estilo]}</Text><Text style={s.small}>{l.estilo.statusLabel}</Text></View>
        <Text style={{ color: T.mute, marginBottom: 6, lineHeight: 1.4 }}>O estilo mostra onde o papel vai custar mais energia. Ele não altera a posição: os quatro blocos do perfil derivam da mesma medida comportamental e não separam cargos vizinhos.</Text>
        {l.estilo.bloqueadoNoAlvo && <Text style={{ color: T.clay, marginBottom: 6 }}>Requisito eliminatório do gabarito não atendido: {l.estilo.motivosBloqueio.join('; ') || 'ver gabarito'}. Aqui é leitura, não desqualificação.</Text>}
        {l.estilo.lacunas.length ? l.estilo.lacunas.map((g) => (
          <View key={g.traco} style={[s.linha, s.row]}><Text>{g.traco} <Text style={s.mute}>({g.bloco})</Text></Text><Text style={s.mute}>fit {fmtPct(g.fitPct)}</Text></View>
        )) : <Text style={s.mute}>Sem lacunas relevantes.</Text>}
      </View>
      <Rodape empresaNome={empresaNome} />
    </Page>
  );
}

function PaginaEvidencias({ p, empresaNome }: { p: Parecer; empresaNome: string }) {
  return (
    <Page size="A4" style={s.pageLight} wrap>
      <Text style={s.eyebrow}>Evidências · trechos da própria resposta</Text>
      <Text style={s.h2}>O que sustenta cada nota</Text>
      {p.evidencias.map((ev) => (
        <View key={ev.competencia} style={s.card}>
          <View style={s.row}>
            <Text style={s.h3}>{ev.competencia}</Text>
            <Text style={s.small}>{ev.auditoria ? `auditoria: ${ev.auditoria.replace(/_/g, ' ')}` : ev.descritores.length ? 'sem auditoria' : 'sem avaliação'}</Text>
          </View>
          {ev.descritores.length ? ev.descritores.map((d) => (
            <View key={d.descritor} style={{ marginTop: 4 }}>
              <Text><Text style={{ fontWeight: 600 }}>{d.descritor}</Text> · {fmtNota(d.nota)}{d.sustentacao ? ` · sustentação ${d.sustentacao}` : ''}</Text>
              {d.evidencias.map((e, i) => <Text key={i} style={s.quote}>“{e.trecho}” <Text style={s.mute}>· {e.resposta}{e.forca ? `, ${e.forca}` : ''}</Text></Text>)}
              {!d.evidencias.length && d.limites.length > 0 && <Text style={[s.quote, { color: T.clay }]}>sem trecho; limites: {d.limites.join('; ')}</Text>}
            </View>
          )) : <Text style={s.mute}>Resposta ainda não avaliada.</Text>}
        </View>
      ))}
      <Rodape empresaNome={empresaNome} />
    </Page>
  );
}

export async function renderParecerPDF(input: ParecerPDFInput): Promise<Buffer> {
  const { parecer: p, empresaNome } = input;
  return renderToBuffer(
    <Document producer="Vertho" creator="Vertho" title={`Parecer do simulador de liderança · ${p.linha.nome}`}>
      <CapaParecer p={p} empresaNome={empresaNome} />
      <PaginaPosicao p={p} empresaNome={empresaNome} />
      <PaginaEvidencias p={p} empresaNome={empresaNome} />
    </Document>,
  );
}

// ── CONSOLIDADO DA EQUIPE ────────────────────────────────────────────────────

export interface ConsolidadoPDFInput {
  empresaNome: string;
  data: ProntidaoLideranca;
}

export async function renderConsolidadoPDF(input: ConsolidadoPDFInput): Promise<Buffer> {
  const { data, empresaNome } = input;
  const porQ = (q: Quadrante) => data.linhas.filter((l) => l.quadrante === q);
  return renderToBuffer(
    <Document producer="Vertho" creator="Vertho" title={`Simulador de liderança · ${data.cargoAlvo}`}>
      <Page size="A4" style={s.pageDark}>
        <View style={s.row}><Marca /><Text style={s.eyebrowDark}>{empresaNome}</Text></View>
        <View style={{ marginTop: 120 }}>
          <Text style={s.eyebrowDark}>Consolidado da equipe</Text>
          <Text style={s.h1}>Simulador de liderança</Text>
          <Text style={{ color: T.off, opacity: 0.8, marginTop: 4, fontSize: 10 }}>perfil-alvo: {data.cargoAlvo} · calculado em {fmtDataHora(data.calculadoEm)}</Text>
          <Text style={{ color: T.off, opacity: 0.75, marginTop: 10, fontSize: 9 }}>Competências: {data.competencias.join(' · ')}</Text>
        </View>
        <View style={{ position: 'absolute', bottom: 46, left: 46, right: 46, flexDirection: 'row', gap: 14 }}>
          {ORDEM_QUADRANTES.map((q) => (
            <View key={q}><Text style={{ fontFamily: DISPLAY, fontSize: 22, color: COR_Q[q].cor }}>{data.porQuadrante[q]}</Text><Text style={{ fontSize: 7.5, color: T.off, opacity: 0.75 }}>{QUADRANTE_LABEL[q]}</Text></View>
          ))}
          <View><Text style={{ fontFamily: DISPLAY, fontSize: 22, color: T.off }}>{data.populacao}</Text><Text style={{ fontSize: 7.5, color: T.off, opacity: 0.75 }}>na população</Text></View>
        </View>
      </Page>
      <Page size="A4" style={s.pageLight} wrap>
        <Text style={s.eyebrow}>Matriz · competência demonstrada × aderência de estilo</Text>
        <Text style={s.h2}>Quem está onde</Text>
        {ORDEM_QUADRANTES.map((q) => (
          <View key={q} style={s.card}>
            <View style={s.row}><Pill q={q} /><Text style={s.small}>{porQ(q).length} pessoa(s)</Text></View>
            <Text style={{ color: T.mute, marginTop: 6, marginBottom: 6, lineHeight: 1.4 }}>{RECOMENDACAO_POR_QUADRANTE[q]}</Text>
            {porQ(q).map((l) => (
              <View key={l.colaboradorId} style={[s.linha, s.row]}>
                <Text style={{ flex: 1 }}>{l.nome} <Text style={s.mute}>· {l.cargo || '—'}</Text></Text>
                <Text style={{ width: 70, textAlign: 'right' }}>{fmtNota(l.posicao.mediaGeral)}</Text>
                <Text style={{ width: 70, textAlign: 'right', color: T.mute }}>{fmtPct(l.estilo.aderenciaPct)}</Text>
              </View>
            ))}
            {!porQ(q).length && <Text style={s.mute}>ninguém aqui</Text>}
          </View>
        ))}
        {(data.incompletos.length > 0 || data.semEstilo.length > 0 || data.naoIniciados > 0) && (
          <View style={s.card}>
            <Text style={s.h3}>Fora da matriz</Text>
            {data.naoIniciados > 0 && <Text>{data.naoIniciados} não iniciaram o mapeamento de liderança.</Text>}
            {data.incompletos.map((i) => <Text key={i.colaboradorId}>{i.nome} · mapeamento incompleto ({i.cobertas}/{i.total}; faltam {i.faltantes.join(', ')})</Text>)}
            {data.semEstilo.map((x) => <Text key={x.colaboradorId}>{x.nome} · {x.motivo}</Text>)}
          </View>
        )}
        {data.avisos.length > 0 && (
          <View style={s.card}><Text style={s.h3}>Avisos do cálculo</Text>{data.avisos.map((a) => <Text key={a} style={{ color: T.clay }}>{a}</Text>)}</View>
        )}
        <Rodape empresaNome={empresaNome} />
      </Page>
    </Document>,
  );
}
