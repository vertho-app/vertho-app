import React from 'react';
import { Page, View, Text, Image, StyleSheet, Font, Svg, Defs, LinearGradient, Stop, Rect } from '@react-pdf/renderer';
import './styles'; // side-effect: registra 'NotoSans' (Inter) p/ o subtítulo
import { brand } from './tokens';

// ── Fontes do design system (display + UI). Inter (corpo) já é 'NotoSans'. ──
const CDN = 'https://cdn.jsdelivr.net/fontsource/fonts';
try {
  Font.register({ family: 'Fraunces', fonts: [
    { src: `${CDN}/fraunces@latest/latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${CDN}/fraunces@latest/latin-600-normal.ttf`, fontWeight: 600 },
    { src: `${CDN}/fraunces@latest/latin-400-italic.ttf`, fontWeight: 400, fontStyle: 'italic' },
  ] });
  Font.register({ family: 'Jakarta', fonts: [
    { src: `${CDN}/plus-jakarta-sans@latest/latin-500-normal.ttf`, fontWeight: 500 },
    { src: `${CDN}/plus-jakarta-sans@latest/latin-600-normal.ttf`, fontWeight: 600 },
  ] });
} catch { /* fontsource indisponível → fallback do react-pdf, não quebra */ }

const CYAN_LIGHT = '#9AE2E6';
const SUB = '#8FA6C4';

const s = StyleSheet.create({
  page: { position: 'relative', backgroundColor: '#FFFFFF' },
  // O Image vai DENTRO de um View absoluto que preenche a página (inset 0); como
  // filho direto do Page o react-pdf o trata como bloco de fluxo "maior que a
  // página" e quebra p/ a próxima. Aqui ele é 100% de um box já do tamanho certo.
  bgWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bgImg: { width: '100%', height: '100%' },
  // inset = card 26px + padding texto 48/52px, em pt (×0.75)
  content: { position: 'absolute', top: 58, left: 55, right: 55, bottom: 56, flexDirection: 'column' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { height: 22, width: 92, objectFit: 'contain' },
  mentor: { fontFamily: 'Jakarta', fontWeight: 500, fontSize: 7.5, letterSpacing: 1.3, textTransform: 'uppercase', color: CYAN_LIGHT, paddingTop: 4 },
  block: { marginTop: 88 },
  overline: { fontFamily: 'Jakarta', fontWeight: 600, fontSize: 8.25, letterSpacing: 1.6, textTransform: 'uppercase', color: CYAN_LIGHT, marginBottom: 16 },
  h1: { fontFamily: 'Fraunces', fontWeight: 400, fontSize: 42, color: '#FFFFFF', lineHeight: 1 },
  h1b: { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 42, color: '#FFFFFF', lineHeight: 1.02 },
  name: { fontFamily: 'Jakarta', fontWeight: 500, fontSize: 12.75, color: brand.cyan[500], marginTop: 15 },
  sub: { fontFamily: 'NotoSans', fontSize: 9.4, color: SUB, marginTop: 3 },
  spacer: { flex: 1 },
  tagline: { fontFamily: 'Fraunces', fontStyle: 'italic', fontSize: 11.25, color: '#FFFFFF' },
  confid: { fontFamily: 'Jakarta', fontWeight: 500, fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: SUB, marginTop: 5 },
});

function Divider() {
  return (
    <Svg width={42} height={2.5} style={{ marginTop: 16 }}>
      <Defs>
        <LinearGradient id="rc-dv" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={brand.cyan[500]} />
          <Stop offset="1" stopColor={brand.purple[500]} />
        </LinearGradient>
      </Defs>
      <Rect width={42} height={2.5} rx={1.2} fill="url(#rc-dv)" />
    </Svg>
  );
}

export default function PdfReportCover({
  bgBase64, logoBase64, titulo = ['Plano de', 'Desenvolvimento'], overline = 'Plano de desenvolvimento individual',
  nome, cargo, empresa, tagline = 'Pequenos ajustes, grande impacto.', mentorLabel = 'Mentor IA',
}: {
  bgBase64?: string | null;
  logoBase64?: string | null;
  titulo?: [string, string];
  overline?: string | null;
  nome?: string;
  cargo?: string;
  empresa?: string;
  tagline?: string;
  /** Selo "Mentor IA" no topo. Passar null/'' esconde (ex.: PDI). */
  mentorLabel?: string | null;
}) {
  const subtitulo = [cargo, empresa].filter(Boolean).join(' · ');
  return (
    <Page size="A4" style={s.page}>
      {bgBase64 ? <View style={s.bgWrap}><Image src={bgBase64} style={s.bgImg} /></View> : null}
      <View style={s.content}>
        <View style={s.topRow}>
          {logoBase64 ? <Image src={logoBase64} style={s.logo} /> : <Text style={{ ...s.mentor, fontSize: 12 }}>vertho.ai</Text>}
          {mentorLabel ? <Text style={s.mentor}>{mentorLabel}</Text> : null}
        </View>

        <View style={s.block}>
          {overline ? <Text style={s.overline}>{overline}</Text> : null}
          <Text style={s.h1}>{titulo[0]}</Text>
          <Text style={s.h1b}>{titulo[1]}</Text>
          <Divider />
          {nome ? <Text style={s.name}>{nome}</Text> : null}
          {subtitulo ? <Text style={s.sub}>{subtitulo}</Text> : null}
        </View>

        <View style={s.spacer} />

        {tagline ? <Text style={s.tagline}>{tagline}</Text> : null}
        <Text style={s.confid}>Confidencial — uso restrito · vertho.ai</Text>
      </View>
    </Page>
  );
}

// ── Bridge: título de seção editorial (Fraunces) p/ o miolo do relatório ──
const ts = StyleSheet.create({
  wrap: { marginBottom: 7, marginTop: 2, flexDirection: 'row', alignItems: 'center' },
  accent: { width: 3, height: 15, borderRadius: 1.5, backgroundColor: brand.cyan[500], marginRight: 8 },
  title: { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 15, color: brand.navy[500], letterSpacing: -0.15 },
});

export function ReportSectionTitle({ children }: { children?: React.ReactNode }) {
  return (
    <View style={ts.wrap}>
      <View style={ts.accent} />
      <Text style={ts.title}>{children}</Text>
    </View>
  );
}
