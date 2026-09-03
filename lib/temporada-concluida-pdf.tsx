/**
 * PDF da tela "Temporada Concluída" — entregue ao colaborador no fechamento e
 * baixado pelo gestor a partir do detalhe do liderado.
 *
 * 🔑 POR QUE ELE FOI REESCRITO (03/09/2026)
 *
 * Era o único relatório do produto fora do design system: `fontFamily:
 * 'Helvetica'` contra a Inter dos outros sete, paleta própria (`#0d1426`,
 * `#e5e7eb`) contra `components/pdf/styles`, sem capa e sem cabeçalho de marca.
 * Ao lado de qualquer outro PDF da plataforma ele não parecia o mesmo produto —
 * e é justamente este que o gestor abre na frente do liderado.
 *
 * Junto vinha um `sanitize()` que apagava tudo fora do WinAnsi, porque as fontes
 * embutidas do PDF não têm esses glifos. O efeito colateral era o texto ter sido
 * escrito SEM ACENTO na mão ("Avaliacao de fechamento", "Niveis mapeados no
 * diagnostico") para não virar caractere perdido. Com a Inter registrada por
 * `components/pdf/styles` isso deixa de ser necessário: acento é do idioma, não
 * detalhe estético.
 *
 * ⚠️ `renderToBuffer` é importado ESTATICAMENTE. Um `await import(...)` dentro da
 * função de render resolve outra cópia do módulo sob `tsx`, e a fonte que
 * `components/pdf/styles` registrou fica na instância errada — o sintoma é
 * `Font family not registered: NotoSans` com a fonte registrada.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { colors, fonts, pageStyles } from '@/components/pdf/styles';
import PdfReportCover, { ReportSectionTitle } from '@/components/pdf/PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import type { MarcaPdf } from '@/lib/pdf-marca';

const s = StyleSheet.create({
  section: { marginBottom: 14 },
  text: { fontFamily: 'NotoSans', fontSize: fonts.body, color: colors.textPrimary, lineHeight: 1.6, marginBottom: 4 },
  muted: { fontFamily: 'NotoSans', fontSize: fonts.small, color: colors.textMuted, lineHeight: 1.5, marginTop: 4 },
  intro: { fontFamily: 'NotoSans', fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.55, marginBottom: 8 },
  quote: {
    fontFamily: 'NotoSans', fontSize: fonts.body, fontStyle: 'italic', color: colors.textSecondary,
    borderLeftWidth: 3, borderLeftColor: colors.cyan, paddingLeft: 10, marginBottom: 12, lineHeight: 1.55,
  },
  card: {
    borderWidth: 1, borderColor: colors.gray200, borderRadius: 6,
    padding: 10, marginBottom: 6, backgroundColor: colors.white,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontFamily: 'NotoSans', fontSize: fonts.body, fontWeight: 700, color: colors.textPrimary, flex: 1 },
  delta: { fontFamily: 'NotoSans', fontSize: fonts.body, fontWeight: 700 },
  pill: {
    fontFamily: 'NotoSans', fontSize: fonts.caption, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6,
    alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginTop: 5,
  },
  antesDepois: { fontFamily: 'NotoSans', fontSize: fonts.small, color: colors.textSecondary, marginTop: 4, lineHeight: 1.5 },
  rotulo: { fontFamily: 'NotoSans', fontSize: fonts.small, fontWeight: 600, color: colors.textMuted },
  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stat: { flex: 1, borderWidth: 1, borderColor: colors.gray200, borderRadius: 6, padding: 9 },
  statLabel: { fontFamily: 'NotoSans', fontSize: fonts.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  statValue: { fontFamily: 'NotoSans', fontSize: 20, fontWeight: 700, marginTop: 3 },
  eyebrow: { fontFamily: 'NotoSans', fontSize: fonts.caption, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  insight: { fontFamily: 'NotoSans', fontSize: fonts.small, fontStyle: 'italic', color: colors.textSecondary, lineHeight: 1.5 },
});

/** Cabeçalho navy fixo — o mesmo dos outros relatórios (`pageStyles.header`). */
function PageHeader({ logoBase64, label }: { logoBase64?: string | null; label: string }) {
  return (
    <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>{label}</Text>
    </View>
  );
}

function PageFooter({ label }: { label: string }) {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{label}</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

// Status de convergência: a cor vem da paleta do DS (`colors`), não de hex
// soltos — a mesma régua que pinta o veredito nas telas.
const CONV: Record<string, { cor: string; bg: string; label: string }> = {
  evolucao_confirmada: { cor: colors.green,   bg: '#F0FDF4',      label: 'Evolução confirmada' },
  evolucao_parcial:    { cor: colors.orange,  bg: '#FFF7ED',      label: 'Evolução parcial' },
  estagnacao:          { cor: colors.gray500, bg: colors.gray100, label: 'Estagnação' },
  regressao:           { cor: colors.flagRed, bg: '#FEF2F2',      label: 'Regressão' },
};
const convDe = (k: string) => CONV[k] || CONV.estagnacao;

const primeiroNome = (nome: string) => String(nome || '').trim().split(/\s+/)[0] || '';

// 🔴 A SETA "→" NÃO EXISTE NA FONTE DOS PDFs.
//
// O corpo é a Inter no subset `latin` do fontsource (registrada como 'NotoSans'
// em `components/pdf/styles`), e esse subset cobre U+2191 e U+2193 mas PULA o
// U+2192. Medido em 03/09/2026 com fontkit sobre o TTF que o PDF baixa. O
// arquivo anterior escrevia `${nota_pre} → ${nota_pos}` e o `sanitize()` engolia
// a seta antes de ela chegar ao render — o card saía "2  4", com o buraco no
// lugar exato onde mora o sentido da frase. Aqui a transição é dita em
// português, que é o que o leitor lê de qualquer jeito.
//
// Números em vírgula decimal: o documento inteiro é em português.
const num = (v: any, casas = 1) => Number(v).toFixed(casas).replace('.', ',');
const transicao = (pre: any, pos: any) => `de ${num(pre)} para ${num(pos)}`;

function Stat({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={{ ...s.statValue, color: cor }}>{String(valor)}</Text>
    </View>
  );
}

function MomentosDeInsight({ momentos }: { momentos: any[] }) {
  if (!momentos?.length) return null;
  return (
    <View style={s.section}>
      <ReportSectionTitle>Momentos de insight</ReportSectionTitle>
      {momentos.map((m: any, i: number) => (
        <View key={i} style={s.card} wrap={false}>
          <Text style={s.eyebrow}>Semana {m.semana}{m.descritor ? ` · ${m.descritor}` : ''}</Text>
          <Text style={s.insight}>{m.insight}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Variante PILOTO: SEM bloco de evolução / delta antes→depois. A competência
 * aparece como PONTO DE PARTIDA (baseline) e o fechamento como DEMONSTRAÇÃO
 * da avaliação — 2 semanas não medem evolução. A riqueza vem do diagnóstico
 * (baseline por descritor) + engajamento (momentos de insight).
 */
function TemporadaPilotoPDF({ dados, marca }: { dados: any; marca: MarcaPdf }) {
  const { colab, trilha, evolutionReport, momentos, sem14 } = dados;
  const descritores = evolutionReport?.descritores || [];
  const rodape = marca.mostrarVertho ? 'Vertho Mentor IA · Piloto' : 'Piloto';

  return (
    <Document title={`Piloto — ${colab?.nome || ''}`}>
      <PdfReportCover
        bgBase64={getReportCoverBgBase64()}
        logoBase64={marca.logoBase64}
        mostrarVertho={marca.mostrarVertho}
        overline="Piloto concluído"
        titulo={['Sua', 'Degustação']}
        nome={colab?.nome}
        cargo={colab?.cargo}
        jornada={`2 semanas em ${trilha?.competencia || ''}`}
      />

      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={marca.logoBase64} label="Piloto concluído" />

        <View style={s.section}>
          <ReportSectionTitle>{`${primeiroNome(colab?.nome)}, você experimentou a jornada completa`}</ReportSectionTitle>
          <Text style={s.intro}>
            {`Duas semanas de degustação em ${trilha?.competencia || ''} — diagnóstico, conteúdo personalizado e avaliação com IA.`}
          </Text>
        </View>

        <View style={s.section}>
          <ReportSectionTitle>Seu ponto de partida</ReportSectionTitle>
          <Text style={s.intro}>
            Níveis mapeados no diagnóstico — a base sobre a qual uma temporada completa trabalha.
          </Text>
          {descritores.map((d: any, i: number) => (
            <View key={i} style={s.card} wrap={false}>
              <View style={s.row}>
                <Text style={s.cardTitle}>{d.descritor}</Text>
                {d.baseline != null && (
                  <Text style={{ ...s.delta, color: colors.navy }}>{`${num(d.baseline)}/4,0`}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        <MomentosDeInsight momentos={momentos} />

        {sem14 && (
          <View style={s.section}>
            <ReportSectionTitle>Avaliação de fechamento (demonstração)</ReportSectionTitle>
            <Text style={s.intro}>
              Como a avaliação por cenário funciona na temporada completa. Em duas semanas ela demonstra o método — não mede evolução.
            </Text>
            {sem14?.resumo_avaliacao?.mensagem_geral && (
              <View style={s.card}>
                <Text style={s.rotulo}>Devolutiva</Text>
                <Text style={{ ...s.text, marginTop: 3 }}>{sem14.resumo_avaliacao.mensagem_geral}</Text>
                {sem14.nota_media_pos != null && (
                  <Text style={s.muted}>{`Nota da demonstração: ${num(sem14.nota_media_pos)}/4,0`}</Text>
                )}
              </View>
            )}
          </View>
        )}

        <PageFooter label={rodape} />
      </Page>
    </Document>
  );
}

export function TemporadaConcluidaPDF({ dados, marca }: { dados: any; marca: MarcaPdf }) {
  const { colab, trilha, evolutionReport, momentos, missoes, sem14 } = dados;
  if (evolutionReport?.modo === 'piloto') return <TemporadaPilotoPDF dados={dados} marca={marca} />;

  const descritores = evolutionReport?.descritores || [];
  const resumo = evolutionReport?.resumo || {};
  const totalSemanas = trilha?.totalSemanas || 14;
  const rodape = marca.mostrarVertho ? 'Vertho Mentor IA' : 'Relatório de temporada';

  return (
    <Document title={`Temporada ${trilha?.numeroTemporada} — ${colab?.nome || ''}`}>
      <PdfReportCover
        bgBase64={getReportCoverBgBase64()}
        logoBase64={marca.logoBase64}
        mostrarVertho={marca.mostrarVertho}
        overline={`Temporada ${trilha?.numeroTemporada} concluída`}
        titulo={['O que', 'Mudou']}
        nome={colab?.nome}
        cargo={colab?.cargo}
        jornada={`${totalSemanas} semanas dedicadas a ${trilha?.competencia || ''}`}
      />

      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={marca.logoBase64} label={`Temporada ${trilha?.numeroTemporada}`} />

        <View style={s.section}>
          <ReportSectionTitle>{`${primeiroNome(colab?.nome)}, veja o que mudou em você`}</ReportSectionTitle>
          <Text style={s.intro}>{`${totalSemanas} semanas dedicadas a ${trilha?.competencia || ''}.`}</Text>

          <View style={s.statGrid}>
            <Stat label="Confirmadas" valor={resumo.confirmadas || 0} cor={CONV.evolucao_confirmada.cor} />
            <Stat label="Parciais" valor={resumo.parciais || 0} cor={CONV.evolucao_parcial.cor} />
            <Stat label="Estáveis" valor={resumo.estagnacoes || 0} cor={CONV.estagnacao.cor} />
            <Stat label="Regressões" valor={resumo.regressoes || 0} cor={CONV.regressao.cor} />
          </View>

          {evolutionReport?.insight_geral && (
            <Text style={s.quote}>{evolutionReport.insight_geral}</Text>
          )}
        </View>

        <View style={s.section}>
          <ReportSectionTitle>Descritor a descritor</ReportSectionTitle>
          {descritores.map((d: any, i: number) => {
            const cfg = convDe(d.convergencia);
            const deltaNum = Number(d.nota_pos) - Number(d.nota_pre);
            return (
              <View key={i} style={{ ...s.card, backgroundColor: cfg.bg, borderColor: cfg.bg }} wrap={false}>
                <View style={s.row}>
                  <Text style={s.cardTitle}>{d.descritor}</Text>
                  <Text style={{ ...s.delta, color: cfg.cor }}>
                    {`${transicao(d.nota_pre, d.nota_pos)} (${deltaNum > 0 ? '+' : ''}${num(deltaNum)})`}
                  </Text>
                </View>
                <Text style={{ ...s.pill, color: cfg.cor, backgroundColor: colors.white }}>{cfg.label}</Text>
                {d.antes && <Text style={s.antesDepois}><Text style={s.rotulo}>Antes: </Text>{d.antes}</Text>}
                {d.depois && <Text style={s.antesDepois}><Text style={s.rotulo}>Depois: </Text>{d.depois}</Text>}
              </View>
            );
          })}
        </View>

        <MomentosDeInsight momentos={momentos} />

        {missoes?.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>Missões executadas</ReportSectionTitle>
            {missoes.map((m: any, i: number) => (
              <View key={i} style={s.card} wrap={false}>
                <Text style={s.eyebrow}>
                  Semana {m.semana} · {m.modo === 'pratica' ? 'Missão real' : 'Cenário escrito'}
                </Text>
                {m.compromisso && <Text style={s.antesDepois}><Text style={s.rotulo}>Compromisso: </Text>{m.compromisso}</Text>}
                {m.sintese && <Text style={s.antesDepois}><Text style={s.rotulo}>Síntese: </Text>{m.sintese}</Text>}
              </View>
            ))}
          </View>
        )}

        {sem14 && (
          <View style={s.section}>
            <ReportSectionTitle>Avaliação final</ReportSectionTitle>
            {sem14?.resumo_avaliacao?.mensagem_geral && (
              <View style={s.card}>
                <Text style={s.rotulo}>Devolutiva</Text>
                <Text style={{ ...s.text, marginTop: 3 }}>{sem14.resumo_avaliacao.mensagem_geral}</Text>
                {sem14.nota_media_pos != null && (
                  <Text style={s.muted}>{`Nota média pós-temporada: ${num(sem14.nota_media_pos)}/4,0`}</Text>
                )}
              </View>
            )}
          </View>
        )}

        {evolutionReport?.proximo_passo && (
          <View style={s.section}>
            <ReportSectionTitle>Próximos passos</ReportSectionTitle>
            <Text style={s.text}>{evolutionReport.proximo_passo}</Text>
          </View>
        )}

        <PageFooter label={rodape} />
      </Page>
    </Document>
  );
}

export async function renderTemporadaConcluidaPDF(dados: any, marca: MarcaPdf) {
  return renderToBuffer(<TemporadaConcluidaPDF dados={dados} marca={marca} />);
}
