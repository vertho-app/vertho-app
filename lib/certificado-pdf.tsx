/**
 * Certificado de Conclusão de Temporada — 1 página A4 paisagem.
 * Usa @react-pdf/renderer (mesma lib de lib/temporada-concluida-pdf.ts).
 *
 * Alinhado ao PADRÃO VERTHO (design bundle "Certificado Jornada Vertho", 23/07):
 * selo/medalhão com gradiente ciano→roxo, tipografia Fraunces (display) + Plus
 * Jakarta Sans (rótulos) + Inter (corpo) + Dancing Script (assinatura), molduras
 * arredondadas + cantos em L gradientes, glows suaves, linha gradiente sob o nome,
 * meta-row (participação | emitido) e bloco de assinatura (Vertho Sócio).
 *
 * Os TOKENS do DS são a verdade (cores/fontes); o .dc.html é referência de layout.
 * Fontes via fontsource CDN — mesmo padrão de components/pdf/styles.ts e ranking-pdf.
 * Idioma pelo `empresas.default_locale` (mapa inline; next-intl não entra no PDF).
 */
import {
  Document, Page, View, Text, Image, StyleSheet, Font, renderToBuffer,
  Svg, Defs, LinearGradient, Stop, Circle, Rect,
} from '@react-pdf/renderer';
import React from 'react';
import { getLogoDarkHBase64, getIconDarkBase64 } from '@/lib/pdf-assets';

// ---- Tokens de cor (DS Vertho — tokens/colors.css) ----
const INK = '#0f2b54';        // navy — texto/ação primário
const BODY = '#403c56';       // corpo
const MUTED = '#7d7994';      // secundário
const ACCENT_INK = '#1c8a90'; // cyan-700 — eyebrow/rótulos de destaque
const CYAN = '#34c5cc';       // cyan-500
const PURPLE = '#9e4edd';     // purple-500
const BG = '#f8f8fc';         // fundo do certificado
const FRAME = 'rgba(15,43,84,0.16)';   // OK em backgroundColor (divisores)
const FRAME2 = 'rgba(15,43,84,0.08)';
// borderColor NÃO aceita rgba no @react-pdf (renderiza laranja) → hex pré-mesclado
// de navy 16%/8% sobre o fundo #f8f8fc.
const FRAME_BORDER = '#d0d5e0';
const FRAME2_BORDER = '#e5e7ee';

// ---- Fontes (fontsource CDN — padrão dos PDFs Vertho) ----
const FS = 'https://cdn.jsdelivr.net/fontsource/fonts';
Font.register({ family: 'Fraunces', fonts: [
  { src: `${FS}/fraunces@latest/latin-500-normal.ttf`, fontWeight: 500 },
  { src: `${FS}/fraunces@latest/latin-600-normal.ttf`, fontWeight: 600 },
  { src: `${FS}/fraunces@latest/latin-500-italic.ttf`, fontWeight: 500, fontStyle: 'italic' },
] });
Font.register({ family: 'Inter', fonts: [
  { src: `${FS}/inter@latest/latin-400-normal.ttf`, fontWeight: 400 },
  { src: `${FS}/inter@latest/latin-500-normal.ttf`, fontWeight: 500 },
  { src: `${FS}/inter@latest/latin-600-normal.ttf`, fontWeight: 600 },
] });
Font.register({ family: 'Jakarta', fonts: [
  { src: `${FS}/plus-jakarta-sans@latest/latin-600-normal.ttf`, fontWeight: 600 },
] });
Font.register({ family: 'Dancing', fonts: [
  { src: `${FS}/dancing-script@latest/latin-600-normal.ttf`, fontWeight: 600 },
] });
Font.registerHyphenationCallback((w: string) => [w]);

// Assinatura institucional (Vertho) — o certificado é co-emitido pela plataforma.
const SIGNATARIO = { nome: 'Samuel Protetti' };

const styles = StyleSheet.create({
  page: { backgroundColor: BG, fontFamily: 'Inter', color: INK, position: 'relative' },

  // molduras decorativas (props separadas — o shorthand quebra com vírgulas do rgba)
  frame1: { position: 'absolute', top: 19.5, left: 19.5, right: 19.5, bottom: 19.5, borderWidth: 1.125, borderStyle: 'solid', borderColor: FRAME_BORDER, borderRadius: 7.5 },
  frame2: { position: 'absolute', top: 25.5, left: 25.5, right: 25.5, bottom: 25.5, borderWidth: 0.75, borderStyle: 'solid', borderColor: FRAME2_BORDER, borderRadius: 4.5 },

  content: { flex: 1, alignItems: 'center', paddingTop: 46.5, paddingHorizontal: 72, paddingBottom: 40.5 },

  seal: { width: 69, height: 69, position: 'relative' },
  sealIcon: { position: 'absolute', top: 21, left: 21, width: 27, height: 27, objectFit: 'contain' },

  eyebrow: { fontFamily: 'Jakarta', fontSize: 9, fontWeight: 600, letterSpacing: 2.1, textTransform: 'uppercase', color: ACCENT_INK, marginTop: 16.5 },
  titulo: { fontFamily: 'Fraunces', fontWeight: 500, fontSize: 37.5, letterSpacing: -0.5, color: INK, marginTop: 9 },
  certify: { fontFamily: 'Jakarta', fontSize: 9.75, color: MUTED, marginTop: 19.5 },
  nome: { fontFamily: 'Fraunces', fontWeight: 600, fontSize: 34.5, color: INK, marginTop: 6, textAlign: 'center' },

  corpo: { fontFamily: 'Inter', fontSize: 12, lineHeight: 1.7, color: BODY, textAlign: 'center', maxWidth: 540, marginTop: 19.5 },
  corpoStrong: { fontFamily: 'Inter', fontWeight: 600, color: INK },
  comps: { fontFamily: 'Fraunces', fontStyle: 'italic', fontWeight: 500, fontSize: 18.75, lineHeight: 1.25, color: INK, textAlign: 'center', marginTop: 6 },
  periodo: { fontFamily: 'Inter', fontSize: 10.5, lineHeight: 1.6, color: MUTED, marginTop: 9, textAlign: 'center' },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 19.5 },
  metaCell: { alignItems: 'center' },
  metaLabel: { fontFamily: 'Jakarta', fontSize: 8.25, fontWeight: 600, letterSpacing: 1.3, textTransform: 'uppercase', color: MUTED },
  metaValue: { fontFamily: 'Inter', fontSize: 11.25, fontWeight: 500, color: INK, marginTop: 5.25 },
  metaDivider: { width: 0.75, height: 34.5, backgroundColor: FRAME, marginHorizontal: 23 },

  spacer: { flexGrow: 1 },

  footer: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footerLeft: { flexDirection: 'row', alignItems: 'center' },
  logoVertho: { width: 77, height: 19.5, objectFit: 'contain' },
  footerDivider: { width: 0.75, height: 22.5, backgroundColor: FRAME, marginHorizontal: 10.5 },
  instLabel: { fontFamily: 'Jakarta', fontSize: 7.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: MUTED },
  instValue: { fontFamily: 'Inter', fontSize: 10.5, fontWeight: 600, color: INK, marginTop: 3 },

  sigWrap: { alignItems: 'center' },
  sigCursive: { fontFamily: 'Dancing', fontSize: 25.5, color: INK },
  sigLine: { width: 180, height: 0.75, backgroundColor: 'rgba(15,43,84,0.28)', marginTop: 3 },
  sigNome: { fontFamily: 'Inter', fontSize: 10.5, fontWeight: 600, color: INK, marginTop: 5.25 },
  sigCargo: { fontFamily: 'Jakarta', fontSize: 7.5, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: MUTED, marginTop: 2.25 },
});

// Gradiente ciano→roxo reutilizável dentro de um <Svg>.
function GradDef({ id }: { id: string }) {
  return (
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={CYAN} />
        <Stop offset="1" stopColor={PURPLE} />
      </LinearGradient>
    </Defs>
  );
}

// Canto em L (bracket gradiente) — arms de 22.5×2.25 encontrando-se no vértice.
function Corner({ h, v, id }: { h: 'left' | 'right'; v: 'top' | 'bottom'; id: string }) {
  const pos: any = { position: 'absolute', [v]: 19.5, [h]: 19.5 };
  // vértice = canto da página; arms partem dele.
  const hx = h === 'left' ? 0 : 2.25;   // barra horizontal
  const vx = h === 'left' ? 0 : 22.75;  // barra vertical
  const hy = v === 'top' ? 0 : 22.75;
  const vy = v === 'top' ? 0 : 2.25;
  return (
    <Svg width={25} height={25} style={pos}>
      <GradDef id={id} />
      <Rect x={hx} y={hy} width={22.5} height={2.25} rx={1.125} fill={`url(#${id})`} />
      <Rect x={vx} y={vy} width={2.25} height={22.5} rx={1.125} fill={`url(#${id})`} />
    </Svg>
  );
}

// Sanitiza chars fora do subset latin das fontes (mantém acentos Latin-1).
function sanitize(s: unknown): string {
  return String(s || '').replace(/[^\x20-\x7E -ÿ]/g, '');
}

type Locale = 'pt-BR' | 'pt-PT' | 'es-ES' | 'en-US';

const STRINGS: Record<Locale, {
  eyebrow: string;
  titulo: string;
  certify: string;
  bodyBefore: string;
  temporada: (n: number | string) => string;
  bodyAfter: string;
  periodo: (i: string, f: string) => string;
  participacaoLabel: string;
  participacaoValue: (s: number, t: number, pct: number) => string;
  emitidoLabel: string;
  instituicaoLabel: string;
  socioLabel: string;
}> = {
  'pt-BR': {
    eyebrow: 'Jornada de Desenvolvimento',
    titulo: 'Certificado de Conclusão',
    certify: 'Certificamos que',
    bodyBefore: 'concluiu a',
    temporada: (n) => `Temporada ${n}`,
    bodyAfter: 'da Jornada de Desenvolvimento, dedicada a',
    periodo: (i, f) => `no período de ${i} a ${f}`,
    participacaoLabel: 'Participação',
    participacaoValue: (s, t, pct) => `${s} de ${t} semanas · ${pct}%`,
    emitidoLabel: 'Emitido em',
    instituicaoLabel: 'Instituição',
    socioLabel: 'Sócio',
  },
  'pt-PT': {
    eyebrow: 'Jornada de Desenvolvimento',
    titulo: 'Certificado de Conclusão',
    certify: 'Certificamos que',
    bodyBefore: 'concluiu a',
    temporada: (n) => `Temporada ${n}`,
    bodyAfter: 'da Jornada de Desenvolvimento, dedicada a',
    periodo: (i, f) => `no período de ${i} a ${f}`,
    participacaoLabel: 'Participação',
    participacaoValue: (s, t, pct) => `${s} de ${t} semanas · ${pct}%`,
    emitidoLabel: 'Emitido em',
    instituicaoLabel: 'Instituição',
    socioLabel: 'Sócio',
  },
  'es-ES': {
    eyebrow: 'Programa de Desarrollo',
    titulo: 'Certificado de Finalización',
    certify: 'Certificamos que',
    bodyBefore: 'completó la',
    temporada: (n) => `Temporada ${n}`,
    bodyAfter: 'del Programa de Desarrollo, dedicada a',
    periodo: (i, f) => `del ${i} al ${f}`,
    participacaoLabel: 'Participación',
    participacaoValue: (s, t, pct) => `${s} de ${t} semanas · ${pct}%`,
    emitidoLabel: 'Emitido el',
    instituicaoLabel: 'Institución',
    socioLabel: 'Socio',
  },
  'en-US': {
    eyebrow: 'Development Journey',
    titulo: 'Certificate of Completion',
    certify: 'This certifies that',
    bodyBefore: 'completed',
    temporada: (n) => `Season ${n}`,
    bodyAfter: 'of the Development Journey, focused on',
    periodo: (i, f) => `from ${i} to ${f}`,
    participacaoLabel: 'Participation',
    participacaoValue: (s, t, pct) => `${s} of ${t} weeks · ${pct}%`,
    emitidoLabel: 'Issued on',
    instituicaoLabel: 'Institution',
    socioLabel: 'Partner',
  },
};

function fmtData(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });
}

export interface CertificadoDados {
  colab: { nome: string; cargo?: string | null };
  trilha: {
    numeroTemporada: number | string;
    competencias: string[];
    dataInicio?: string | null;
    dataConclusao?: string | null;
  };
  empresa: { nome: string; locale?: string };
  participacao: { semanasComEntrega: number; totalSemanas: number; pct: number };
}

export function CertificadoPDF({ dados }: { dados: CertificadoDados }) {
  const locale: Locale = (dados.empresa.locale as Locale) in STRINGS ? (dados.empresa.locale as Locale) : 'pt-BR';
  const S = STRINGS[locale];
  const comps = sanitize((dados.trilha.competencias || []).filter(Boolean).join(' + '));
  const inicio = fmtData(dados.trilha.dataInicio, locale);
  const fim = fmtData(dados.trilha.dataConclusao, locale);
  const semanas = dados.participacao.semanasComEntrega;
  const total = dados.participacao.totalSemanas;
  const pct = Math.round(dados.participacao.pct * 100);
  const hoje = fmtData(new Date().toISOString(), locale);

  const logoVertho = getLogoDarkHBase64();
  const icone = getIconDarkBase64();

  return (
    <Document title={`${S.titulo} — ${sanitize(dados.colab.nome)}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* molduras + cantos */}
        <View style={styles.frame1} fixed />
        <View style={styles.frame2} fixed />
        <Corner h="left" v="top" id="cTL" />
        <Corner h="right" v="top" id="cTR" />
        <Corner h="left" v="bottom" id="cBL" />
        <Corner h="right" v="bottom" id="cBR" />

        <View style={styles.content}>
          {/* selo / medalhão */}
          <View style={styles.seal}>
            <Svg width={69} height={69}>
              <GradDef id="gSeal" />
              <Circle cx={34.5} cy={34.5} r={34.5} fill="url(#gSeal)" />
              <Circle cx={34.5} cy={34.5} r={28.5} fill="#ffffff" />
            </Svg>
            {icone ? <Image src={icone} style={styles.sealIcon} /> : null}
          </View>

          <Text style={styles.eyebrow}>{S.eyebrow}</Text>
          <Text style={styles.titulo}>{S.titulo}</Text>
          <Text style={styles.certify}>{S.certify}</Text>
          <Text style={styles.nome}>{sanitize(dados.colab.nome)}</Text>

          {/* linha gradiente */}
          <Svg width={165} height={3} style={{ marginTop: 10.5 }}>
            <GradDef id="gLine" />
            <Rect x={0} y={0} width={165} height={3} rx={1.5} fill="url(#gLine)" />
          </Svg>

          <Text style={styles.corpo}>
            {S.bodyBefore + ' '}
            <Text style={styles.corpoStrong}>{S.temporada(dados.trilha.numeroTemporada)}</Text>
            {' ' + S.bodyAfter}
          </Text>
          <Text style={styles.comps}>{comps}</Text>
          {inicio && fim ? <Text style={styles.periodo}>{sanitize(S.periodo(inicio, fim))}</Text> : null}

          {/* meta-row */}
          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>{S.participacaoLabel}</Text>
              <Text style={styles.metaValue}>{sanitize(S.participacaoValue(semanas, total, pct))}</Text>
            </View>
            <View style={styles.metaDivider} />
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>{S.emitidoLabel}</Text>
              <Text style={styles.metaValue}>{hoje}</Text>
            </View>
          </View>

          <View style={styles.spacer} />

          {/* rodapé: instituição | assinatura */}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              {logoVertho ? <Image src={logoVertho} style={styles.logoVertho} /> : <Text style={{ fontFamily: 'Jakarta', fontSize: 12, color: INK }}>vertho.ai</Text>}
              <View style={styles.footerDivider} />
              <View>
                <Text style={styles.instLabel}>{S.instituicaoLabel}</Text>
                <Text style={styles.instValue}>{sanitize(dados.empresa.nome)}</Text>
              </View>
            </View>

            <View style={styles.sigWrap}>
              <Text style={styles.sigCursive}>{SIGNATARIO.nome}</Text>
              <View style={styles.sigLine} />
              <Text style={styles.sigNome}>{SIGNATARIO.nome}</Text>
              <Text style={styles.sigCargo}>{S.socioLabel}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderCertificadoPDF(dados: CertificadoDados) {
  // @ts-ignore - JSX em renderToBuffer (mesmo padrão das rotas de PDF do repo)
  return renderToBuffer(<CertificadoPDF dados={dados} />);
}
