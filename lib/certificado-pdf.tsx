/**
 * Certificado de Conclusão de Temporada — 1 página A4 paisagem.
 * Usa @react-pdf/renderer (mesma lib de lib/temporada-concluida-pdf.ts).
 *
 * Branding DUPLA: logo Vertho (escuro horizontal, fundo branco — pdf-assets)
 * à esquerda + logo do tenant (ou nome em texto) à direita.
 * Idioma pelo `empresas.default_locale` (mapa inline — os textos são poucos e
 * autocontidos; next-intl não entra no render de PDF).
 */
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getLogoDarkHBase64 } from '@/lib/pdf-assets';

const NAVY = '#0d1426';
const CYAN = '#06B6D4';
const GRAY = '#6b7280';
const LIGHT = '#9ca3af';

const styles = StyleSheet.create({
  page: { backgroundColor: '#ffffff', fontFamily: 'Helvetica', color: NAVY },
  frameOuter: { position: 'absolute', top: 16, left: 16, right: 16, bottom: 16, border: `2 solid ${NAVY}` },
  frameInner: { position: 'absolute', top: 21, left: 21, right: 21, bottom: 21, border: `0.75 solid ${CYAN}` },
  body: { flex: 1, paddingHorizontal: 64, paddingTop: 34, paddingBottom: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  logoVertho: { width: 110, height: 28, objectFit: 'contain' },
  logoEmpresa: { maxWidth: 130, maxHeight: 40, objectFit: 'contain' },
  empresaNome: { fontSize: 13, fontWeight: 700, color: NAVY },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: CYAN, marginBottom: 6 },
  titulo: { fontSize: 30, fontWeight: 700, color: NAVY, marginBottom: 18 },
  certify: { fontSize: 11, color: GRAY, marginBottom: 4 },
  nome: { fontSize: 24, fontWeight: 700, color: NAVY, marginBottom: 14, textAlign: 'center' },
  texto: { fontSize: 11, color: '#374151', lineHeight: 1.7, textAlign: 'center', maxWidth: 560 },
  comps: { fontWeight: 700, color: NAVY },
  participacao: { marginTop: 14, fontSize: 10, color: GRAY, border: `0.75 solid #e5e7eb`, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  footerTxt: { fontSize: 8.5, color: LIGHT },
});

// Sanitiza chars fora WinAnsi (fontes Helvetica padrão não suportam todos unicode)
function sanitize(s: unknown): string {
  return String(s || '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
}

type Locale = 'pt-BR' | 'pt-PT' | 'es-ES' | 'en-US';

interface BodyParams {
  numero: number | string;
  comps: string;
  inicio: string;
  fim: string;
  semanas: number;
  total: number;
  pct: number;
}

const STRINGS: Record<Locale, {
  eyebrow: string;
  titulo: string;
  certify: string;
  body: (p: BodyParams) => string;
  participacao: (p: BodyParams) => string;
  emitido: (data: string) => string;
}> = {
  'pt-BR': {
    eyebrow: 'Vertho · Jornada de Desenvolvimento',
    titulo: 'Certificado de Conclusão',
    certify: 'Certificamos que',
    body: (p) => `concluiu a Temporada ${p.numero} da Jornada de Desenvolvimento, dedicada a ${p.comps}, no período de ${p.inicio} a ${p.fim}.`,
    participacao: (p) => `Participação: ${p.semanas} de ${p.total} semanas (${p.pct}%)`,
    emitido: (d) => `Emitido em ${d}`,
  },
  'pt-PT': {
    eyebrow: 'Vertho · Jornada de Desenvolvimento',
    titulo: 'Certificado de Conclusão',
    certify: 'Certificamos que',
    body: (p) => `concluiu a Temporada ${p.numero} da Jornada de Desenvolvimento, dedicada a ${p.comps}, no período de ${p.inicio} a ${p.fim}.`,
    participacao: (p) => `Participação: ${p.semanas} de ${p.total} semanas (${p.pct}%)`,
    emitido: (d) => `Emitido em ${d}`,
  },
  'es-ES': {
    eyebrow: 'Vertho · Programa de Desarrollo',
    titulo: 'Certificado de Finalización',
    certify: 'Certificamos que',
    body: (p) => `completó la Temporada ${p.numero} del Programa de Desarrollo, dedicada a ${p.comps}, en el período del ${p.inicio} al ${p.fim}.`,
    participacao: (p) => `Participación: ${p.semanas} de ${p.total} semanas (${p.pct}%)`,
    emitido: (d) => `Emitido el ${d}`,
  },
  'en-US': {
    eyebrow: 'Vertho · Development Journey',
    titulo: 'Certificate of Completion',
    certify: 'We hereby certify that',
    body: (p) => `completed Season ${p.numero} of the Development Journey, focused on ${p.comps}, from ${p.inicio} to ${p.fim}.`,
    participacao: (p) => `Participation: ${p.semanas} of ${p.total} weeks (${p.pct}%)`,
    emitido: (d) => `Issued on ${d}`,
  },
};

function fmtData(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
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
  logoEmpresaBase64?: string | null;
}

export function CertificadoPDF({ dados }: { dados: CertificadoDados }) {
  const locale: Locale = (dados.empresa.locale as Locale) in STRINGS ? (dados.empresa.locale as Locale) : 'pt-BR';
  const S = STRINGS[locale];
  const p: BodyParams = {
    numero: dados.trilha.numeroTemporada,
    comps: sanitize((dados.trilha.competencias || []).filter(Boolean).join(' + ')),
    inicio: fmtData(dados.trilha.dataInicio, locale),
    fim: fmtData(dados.trilha.dataConclusao, locale),
    semanas: dados.participacao.semanasComEntrega,
    total: dados.participacao.totalSemanas,
    pct: Math.round(dados.participacao.pct * 100),
  };
  const logoVertho = getLogoDarkHBase64();
  const hoje = fmtData(new Date().toISOString(), locale);

  return (
    <Document title={`${S.titulo} — ${sanitize(dados.colab.nome)}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.frameOuter} fixed />
        <View style={styles.frameInner} fixed />
        <View style={styles.body}>
          <View style={styles.header}>
            {logoVertho
              ? <Image src={logoVertho} style={styles.logoVertho} />
              : <Text style={styles.empresaNome}>vertho.ai</Text>}
            {dados.logoEmpresaBase64
              ? <Image src={dados.logoEmpresaBase64} style={styles.logoEmpresa} />
              : <Text style={styles.empresaNome}>{sanitize(dados.empresa.nome)}</Text>}
          </View>

          <View style={styles.center}>
            <Text style={styles.eyebrow}>{S.eyebrow}</Text>
            <Text style={styles.titulo}>{S.titulo}</Text>
            <Text style={styles.certify}>{S.certify}</Text>
            <Text style={styles.nome}>{sanitize(dados.colab.nome)}</Text>
            <Text style={styles.texto}>{sanitize(S.body(p))}</Text>
            <Text style={styles.participacao}>{sanitize(S.participacao(p))}</Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerTxt}>{sanitize(S.emitido(hoje))}</Text>
            <Text style={styles.footerTxt}>{sanitize(`Vertho · ${dados.empresa.nome}`)}</Text>
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
