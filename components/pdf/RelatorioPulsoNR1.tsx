import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { colors, pageStyles } from './styles';
import PdfCover from './PdfCover';
import { SectionTitle } from './SectionTitle';

/**
 * Relatório Complementar — Subsídios Organizacionais para Gestão de Fatores Psicossociais.
 *
 * REGRAS OBRIGATÓRIAS (spec):
 * - NÃO é diagnóstico técnico de riscos psicossociais.
 * - NÃO substitui PGR, PCMSO, SESMT, laudos ocupacionais.
 * - Disclaimer DEVE aparecer com destaque visual.
 * - Mapeamento conceitual das 6 dimensões em linguagem de fatores
 *   organizacionais — sem rótulos de diagnóstico clínico.
 */

const s = StyleSheet.create({
  text: { fontFamily: 'NotoSans', fontSize: 10, color: colors.textPrimary, lineHeight: 1.65, marginBottom: 6 },
  textSm: { fontFamily: 'NotoSans', fontSize: 9, color: colors.textSecondary, lineHeight: 1.6 },
  h3: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 600, color: colors.navyLight, marginBottom: 6, marginTop: 10 },
  disclaimerBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1, borderColor: '#FDE68A', borderLeftWidth: 4, borderLeftColor: '#D97706',
    borderRadius: 6, padding: 14, marginBottom: 14,
  },
  disclaimerTitle: {
    fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, color: '#78350F',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  disclaimerText: { fontFamily: 'NotoSans', fontSize: 9, color: '#78350F', lineHeight: 1.7 },
  mapBox: {
    flexDirection: 'row', paddingVertical: 8,
    borderBottomWidth: 0.5, borderBottomColor: colors.gray200,
  },
  mapDim: { width: '32%', fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600, color: colors.navy },
  mapConcept: { flex: 1, fontFamily: 'NotoSans', fontSize: 9.5, color: colors.textSecondary, lineHeight: 1.6 },
  dimRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: colors.gray200 },
  dimName: { flex: 1, fontFamily: 'NotoSans', fontSize: 9.5, color: colors.textPrimary, fontWeight: 500 },
  dimScore: { width: 50, fontFamily: 'NotoSans', fontSize: 10, fontWeight: 700, textAlign: 'right' },
  itemBlock: {
    backgroundColor: '#F8FAFC', borderLeftWidth: 3, borderRadius: 4,
    paddingLeft: 10, paddingVertical: 6, paddingRight: 8, marginBottom: 5,
  },
  itemTitle: { fontFamily: 'NotoSans', fontSize: 9.5, fontWeight: 700, color: colors.textPrimary, marginBottom: 2 },
  itemDetail: { fontFamily: 'NotoSans', fontSize: 8.5, color: colors.textSecondary, lineHeight: 1.5 },
});

const MAPEAMENTO_NR1 = [
  { dim: 'Clareza',                    conceito: 'Ambiguidade de papel, prioridades e expectativas. Sinaliza percepção dos profissionais sobre o que se espera deles.' },
  { dim: 'Condições',                  conceito: 'Recursos, tempo, carga e viabilidade de execução. Indica se o trabalho pode ser realizado com qualidade.' },
  { dim: 'Liderança',                  conceito: 'Apoio, feedback e acompanhamento. Reflete consistência da gestão direta no desenvolvimento das pessoas.' },
  { dim: 'Segurança para aprender',    conceito: 'Abertura para falar, pedir ajuda e aprender com o erro. Sinal de cultura de aprendizado organizacional.' },
  { dim: 'Aplicação prática',          conceito: 'Autonomia e possibilidade real de mudança. Sinal de conexão entre formação e trabalho cotidiano.' },
  { dim: 'Futuro e permanência',       conceito: 'Reconhecimento, pertencimento e perspectiva. Sinaliza vínculo e percepção de carreira na organização.' },
];

const DISCLAIMER_OFICIAL = `A Vertho não realiza diagnóstico técnico de riscos psicossociais, não substitui PGR, PCMSO, SESMT, laudos ocupacionais, profissionais habilitados ou parecer jurídico. Este relatório apresenta sinais agregados de desenvolvimento e ambiente, que podem apoiar RH, liderança e especialistas técnicos como insumo complementar.`;

function Footer() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{'Vertho — Subsídios Complementares — NÃO substitui análise técnica'}</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function bandColor(score: number | null) {
  if (score == null) return colors.gray400;
  if (score >= 4.2) return colors.green;
  if (score >= 3.5) return colors.cyan;
  if (score >= 2.8) return colors.orange;
  return colors.flagRed;
}

export default function RelatorioPulsoNR1PDF({
  data, empresaNome, logoBase64,
}: {
  data: any;
  empresaNome?: string;
  logoBase64?: string;
}) {
  const c = (data?.conteudo ?? data) as any;
  if (!c) return null;
  const scoreVigente = c.indice_geral?.t2 ?? c.indice_geral?.t0;

  return (
    <Document>
      <PdfCover
        logoBase64={logoBase64}
        nome={c.empresa?.nome || empresaNome || ''}
        cargo={c.ciclo?.nome || ''}
        empresa={c.group_label || 'Empresa toda'}
        data={c.generated_at}
        tipo={'Subsídios Organizacionais para Gestão de Fatores Psicossociais'}
      />

      <Page size="A4" style={pageStyles.page} wrap>
        <View>
          <View style={s.disclaimerBox}>
            <Text style={s.disclaimerTitle}>Disclaimer Obrigatório</Text>
            <Text style={s.disclaimerText}>{DISCLAIMER_OFICIAL}</Text>
          </View>

          <SectionTitle>Sobre este relatório</SectionTitle>
          <Text style={s.text}>
            Este documento é um <Text style={{ fontWeight: 700 }}>insumo complementar</Text> produzido a partir
            da pesquisa Pulso de Desenvolvimento. Ele apresenta sinais agregados sobre o ambiente percebido
            pelos profissionais — clareza, condições, liderança, segurança para aprender, aplicação prática
            e futuro — em linguagem de desenvolvimento organizacional.
          </Text>
          <Text style={s.text}>
            Os dados aqui não substituem instrumentos técnicos exigidos por normas, laudos ocupacionais ou
            análise por profissional habilitado. São oferecidos como subsídio para que RH, liderança e
            especialistas técnicos possam dialogar com evidências organizacionais ao tomar decisões.
          </Text>

          <SectionTitle>Mapeamento Conceitual</SectionTitle>
          <Text style={s.textSm}>
            Tradução das dimensões do Pulso em conceitos de gestão organizacional. Não usar como diagnóstico.
          </Text>
          <View style={{ marginTop: 8 }}>
            {MAPEAMENTO_NR1.map(m => (
              <View key={m.dim} style={s.mapBox}>
                <Text style={s.mapDim}>{m.dim}</Text>
                <Text style={s.mapConcept}>{m.conceito}</Text>
              </View>
            ))}
          </View>

          <SectionTitle>Índice Agregado</SectionTitle>
          <Text style={s.text}>
            Índice Geral: <Text style={{ fontWeight: 700, color: bandColor(scoreVigente) }}>
              {scoreVigente != null ? scoreVigente.toFixed(2) : '—'} / 5.00
            </Text> ·
            Respondentes: <Text style={{ fontWeight: 700 }}>{Math.max(c.n_t0 || 0, c.n_t2 || 0)}</Text>
          </Text>

          <Text style={s.h3}>Sinais por dimensão</Text>
          <View>
            {(c.dimensions || []).map((d: any) => (
              <View key={d.dimension_name} style={s.dimRow}>
                <Text style={s.dimName}>{d.dimension_name}</Text>
                <Text style={[s.dimScore, { color: bandColor(d.t0) }]}>
                  {d.t0 != null ? d.t0.toFixed(2) : '—'}
                </Text>
                <Text style={[s.dimScore, { color: bandColor(d.t2) }]}>
                  {d.t2 != null ? d.t2.toFixed(2) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <Footer />
      </Page>

      <Page size="A4" style={pageStyles.page} wrap>
        <View>
          <SectionTitle>Sinais Organizacionais Identificados</SectionTitle>
          <Text style={s.textSm}>
            Listagem agregada para apoiar leitura técnica. Não constituem diagnóstico individual.
          </Text>

          {c.triangulation?.blockers?.length > 0 && (
            <>
              <Text style={s.h3}>Sinais com atenção</Text>
              {c.triangulation.blockers.map((it: any, i: number) => (
                <View key={i} style={[s.itemBlock, { borderLeftColor: colors.orange }]}>
                  <Text style={s.itemTitle}>{it.title}</Text>
                  <Text style={s.itemDetail}>{it.detail}</Text>
                </View>
              ))}
            </>
          )}

          {c.triangulation?.accelerators?.length > 0 && (
            <>
              <Text style={s.h3}>Sinais favoráveis</Text>
              {c.triangulation.accelerators.map((it: any, i: number) => (
                <View key={i} style={[s.itemBlock, { borderLeftColor: colors.green }]}>
                  <Text style={s.itemTitle}>{it.title}</Text>
                  <Text style={s.itemDetail}>{it.detail}</Text>
                </View>
              ))}
            </>
          )}

          {c.triangulation?.alerts?.length > 0 && (
            <>
              <Text style={s.h3}>Pontos para investigação</Text>
              {c.triangulation.alerts.map((it: any, i: number) => (
                <View key={i} style={[s.itemBlock, { borderLeftColor: colors.flagRed }]}>
                  <Text style={s.itemTitle}>{it.title}</Text>
                  <Text style={s.itemDetail}>{it.detail}</Text>
                </View>
              ))}
            </>
          )}

          <SectionTitle>Encaminhamentos Sugeridos</SectionTitle>
          {(c.triangulation?.recommendations || []).length === 0 ? (
            <Text style={s.textSm}>Aguardando mais dados para gerar encaminhamentos.</Text>
          ) : (c.triangulation.recommendations as any[]).map((it: any, i: number) => (
            <View key={i} style={[s.itemBlock, { borderLeftColor: colors.cyan }]}>
              <Text style={s.itemTitle}>{it.title}</Text>
              <Text style={s.itemDetail}>{it.detail}</Text>
            </View>
          ))}

          <View style={[s.disclaimerBox, { marginTop: 14 }]}>
            <Text style={s.disclaimerTitle}>Importante</Text>
            <Text style={s.disclaimerText}>
              Para análise técnica de fatores psicossociais conforme regulamentações vigentes, a organização
              deve contratar profissional habilitado e instrumentos validados. Este relatório serve apenas
              como contexto qualitativo complementar.
            </Text>
          </View>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}
