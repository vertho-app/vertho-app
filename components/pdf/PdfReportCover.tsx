import React from 'react';
import { Page, View, Text, Image, StyleSheet, Svg, Defs, LinearGradient, Stop, Rect } from '@react-pdf/renderer';
import './styles'; // side-effect: registra as fontes (via ./fontes) e o alias 'NotoSans'
import { FONTE_TEXTO, FONTE_TITULO } from './fontes';
import { brand } from './tokens';
import { tradutorDoPdf } from '@/lib/pdf-i18n';
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

// ── Fontes: Codec Bold (título) e Roboto (texto), registradas em `./fontes`. ──
const CYAN_LIGHT = '#9AE2E6';
const SUB = '#8FA6C4';

/** `vertho.ai` é sempre em caixa baixa (brand book out/2026), inclusive dentro de um rótulo em caixa alta.
 *  O `textTransform: 'uppercase'` do estilo pai o transformaria; o Text interno o desfaz. */
function ComMarca({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(vertho\.ai)/i).map((parte, i) =>
        /^vertho\.ai$/i.test(parte)
          ? <Text key={i} style={{ textTransform: 'none' }}>vertho.ai</Text>
          : parte)}
    </>
  );
}

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
  mentor: { fontFamily: FONTE_TEXTO, fontWeight: 500, fontSize: 7.5, letterSpacing: 1.3, textTransform: 'uppercase', color: CYAN_LIGHT, paddingTop: 4 },
  block: { marginTop: 88 },
  overline: { fontFamily: FONTE_TEXTO, fontWeight: 600, fontSize: 8.25, letterSpacing: 1.6, textTransform: 'uppercase', color: CYAN_LIGHT, marginBottom: 16 },
  h1: { fontFamily: FONTE_TITULO, fontWeight: 400, fontSize: 42, color: '#FFFFFF', lineHeight: 1 },
  h1b: { fontFamily: FONTE_TITULO, fontWeight: 600, fontSize: 42, color: brand.cyan[500], lineHeight: 1.02 },
  name: { fontFamily: FONTE_TEXTO, fontWeight: 500, fontSize: 12.75, color: brand.cyan[500], marginTop: 15 },
  sub: { fontFamily: 'NotoSans', fontSize: 9.4, color: SUB, marginTop: 3 },
  jornada: { fontFamily: FONTE_TEXTO, fontWeight: 500, fontSize: 9, color: CYAN_LIGHT, marginTop: 12 },
  spacer: { flex: 1 },
  tagline: { fontFamily: FONTE_TITULO, fontStyle: 'italic', fontSize: 11.25, color: '#FFFFFF' },
  confid: { fontFamily: FONTE_TEXTO, fontWeight: 500, fontSize: 7.5, letterSpacing: 1, textTransform: 'uppercase', color: SUB, marginTop: 5 },
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
  bgBase64, logoBase64, titulo: tituloPedido, overline: overlinePedido,
  nome, cargo, empresa, tagline: taglinePedida, mentorLabel = 'Mentor IA', jornada,
  mostrarVertho = true, locale,
}: {
  bgBase64?: string | null;
  logoBase64?: string | null;
  /**
   * false = tenant white-label: nenhuma identificação da Vertho nesta página.
   * Some o logo/texto "vertho.ai" do topo, o "· vertho.ai" da linha de
   * confidencialidade e o slogan. Ver `lib/pdf-marca.ts`.
   */
  mostrarVertho?: boolean;
  titulo?: [string, string];
  overline?: string | null;
  nome?: string;
  cargo?: string;
  empresa?: string;
  tagline?: string;
  /** Selo "Mentor IA" no topo. Passar null/'' esconde (ex.: PDI). */
  mentorLabel?: string | null;
  /** Linha descritiva sob o nome (ex.: "Uma jornada de 14 semanas de aprendizagem"). */
  jornada?: string | null;
  /**
   * Idioma do texto fixo da capa (os padrões de título, overline e slogan e a
   * linha de confidencialidade). Sem ele, pt-BR: DNA, Perfil Organizacional e
   * Adequação, que não são desta onda, seguem como estavam.
   */
  locale?: string | null;
}) {
  const t = tradutorDoPdf(locale);
  // `undefined` pede o padrão do idioma; `null` (overline) esconde a linha, como sempre.
  const titulo = tituloPedido ?? [t('cover.defaultTitleLine1'), t('cover.defaultTitleLine2')];
  const overline = overlinePedido === undefined ? t('cover.defaultOverline') : overlinePedido;
  const tagline = taglinePedida ?? t('cover.tagline');
  const subtitulo = [cargo, empresa].filter(Boolean).join(' · ');
  // Sem logo explícito e COM a marca Vertho liberada, a capa mostra o logo oficial (antes escrevia o texto
  // "vertho.ai"). Tenant white-label (`mostrarVertho=false`) segue sem nada da Vertho: ver `lib/pdf-marca.ts`.
  const logo = logoBase64 ?? (mostrarVertho ? getLogoCoverBase64() : null);
  return (
    <Page size="A4" style={s.page}>
      {bgBase64 ? <View style={s.bgWrap}><Image src={bgBase64} style={s.bgImg} /></View> : null}
      <View style={s.content}>
        <View style={s.topRow}>
          {logo
            ? <Image src={logo} style={s.logo} />
            : mostrarVertho ? <Text style={{ ...s.mentor, fontSize: 12, textTransform: 'none' }}>vertho.ai</Text> : <View />}
          {mentorLabel ? <Text style={s.mentor}>{mentorLabel}</Text> : null}
        </View>

        <View style={s.block}>
          {overline ? <Text style={s.overline}>{overline}</Text> : null}
          <Text style={s.h1}>{titulo[0]}</Text>
          <Text style={s.h1b}>{titulo[1]}</Text>
          <Divider />
          {nome ? <Text style={s.name}>{nome}</Text> : null}
          {subtitulo ? <Text style={s.sub}>{subtitulo}</Text> : null}
          {jornada ? <Text style={s.jornada}>{jornada}</Text> : null}
        </View>

        <View style={s.spacer} />

        {tagline && mostrarVertho ? <Text style={s.tagline}>{tagline}</Text> : null}
        <Text style={s.confid}><ComMarca texto={mostrarVertho ? t('cover.confidentialUseBrand') : t('cover.confidentialUse')} /></Text>
      </View>
    </Page>
  );
}

// ── Bridge: título de seção (Codec Bold) p/ o miolo do relatório ──
const ts = StyleSheet.create({
  wrap: { marginBottom: 7, marginTop: 2, flexDirection: 'row', alignItems: 'center' },
  accent: { width: 3, height: 15, borderRadius: 1.5, backgroundColor: brand.cyan[500], marginRight: 8 },
  title: { fontFamily: FONTE_TITULO, fontWeight: 600, fontSize: 15, color: brand.navy[500], letterSpacing: -0.15 },
});

export function ReportSectionTitle({ children }: { children?: React.ReactNode }) {
  return (
    <View style={ts.wrap}>
      <View style={ts.accent} />
      <Text style={ts.title}>{children}</Text>
    </View>
  );
}
