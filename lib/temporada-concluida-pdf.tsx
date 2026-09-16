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
import { Document, Page, Text, View, Image, StyleSheet, Svg, Path, renderToBuffer } from '@react-pdf/renderer';
import { colors, fonts, pageStyles } from '@/components/pdf/styles';
import PdfReportCover, { ReportSectionTitle } from '@/components/pdf/PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import type { MarcaPdf } from '@/lib/pdf-marca';
import { avancoExibido, rotuloConvergencia, CONVERGENCIA } from '@/lib/season-engine/convergencia';
import { COR_VEREDITO_PAPEL } from '@/lib/season-engine/convergencia-cores';
import { agruparPorCompetencia } from '@/lib/season-engine/evolucao-por-competencia';

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
  competenciaLinha: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10,
    marginTop: 8, marginBottom: 6,
  },
  competencia: { fontFamily: 'NotoSans', fontSize: fonts.body, fontWeight: 700, color: colors.navy },
  nivelLinha: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  nivel: { fontFamily: 'NotoSans', fontSize: fonts.small, color: colors.textSecondary },
  subiu: { fontFamily: 'NotoSans', fontSize: fonts.small, fontWeight: 700, color: COR_VEREDITO_PAPEL[CONVERGENCIA.CONFIRMADA].fg },
  competenciaAvanco: { fontFamily: 'NotoSans', fontSize: fonts.small, fontWeight: 700, color: colors.navy },
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
// soltos, e o RÓTULO vem de `rotuloConvergencia`, a mesma função das telas.
//
// 🔴 Sem "Regressão" (16/09/2026, pedido do dono olhando o PDF da Elisângela).
// A régua não tem esse veredito desde 01/09 (ninguém desaprende uma
// competência; queda entre diagnóstico e fechamento é variação do
// instrumento), e as telas de admin e do gestor perderam a coluna em 14/09.
// Este PDF ficou para trás com um card "Regressões 0" e o rótulo antigo
// "Estagnação": o documento que a pessoa leva para casa dizia o que a tela não
// diz mais.
//
// Cores: `COR_VEREDITO_PAPEL`, a paleta única dos vereditos (confirmada verde
// escuro, parcial verde claro; decisão do dono, 16/09/2026).
const CONV: Record<string, { cor: string; bg: string; label: string }> = Object.fromEntries(
  [CONVERGENCIA.CONFIRMADA, CONVERGENCIA.PARCIAL, CONVERGENCIA.ESTAVEL].map((v) => [
    v, { cor: COR_VEREDITO_PAPEL[v].fg, bg: COR_VEREDITO_PAPEL[v].bg, label: rotuloConvergencia(v) },
  ]),
);
const convDe = (k: string) => CONV[k] || CONV[CONVERGENCIA.ESTAVEL];

const primeiroNome = (nome: string) => String(nome || '').trim().split(/\s+/)[0] || '';

// Números em vírgula decimal: o documento inteiro é em português.
// ⚠️ Não use a seta "→" em texto de PDF: o subset `latin` da fonte do corpo PULA
// o U+2192 (medido 03/09/2026 com fontkit) e o glifo sai em branco.
const num = (v: any, casas = 1) => Number(v).toFixed(casas).replace('.', ',');

/**
 * O avanço de um descritor como o PDF escreve: "+1,2" quando andou, "0,0"
 * quando manteve, `null` quando falta nota.
 *
 * 🔴 SÓ O AVANÇO, COM PISO EM ZERO, e nenhuma nota (decisão do dono, 14/09 nas
 * telas e 16/09 neste PDF). O par "de 2,0 para 3,2" convida a comparar pessoas
 * por uma nota de partida que ninguém escolheu, e uma diferença negativa afirma
 * uma piora que a medição não sustenta. A régua é `avancoExibido`, a mesma das
 * telas: só a vírgula decimal é do PDF.
 */
export function avancoDoPdf(notaPre: unknown, notaPos: unknown): string | null {
  return avancoValorPdf(avancoExibido(notaPre, notaPos));
}

/** Um avanço JÁ calculado (piso zero) no formato do PDF: "+0,4" ou "0,0". */
export function avancoValorPdf(avanco: number | null | undefined): string | null {
  if (avanco == null || !Number.isFinite(avanco)) return null;
  return avanco > 0 ? `+${num(avanco)}` : num(0);
}

/** Estrela de "parabéns". Desenhada em SVG: emoji fora do subset da fonte sai em branco. */
function Estrela() {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z" fill="#F59E0B" />
    </Svg>
  );
}

/**
 * Os três contadores do topo. Relatório gravado antes de 01/09 ainda pode ter
 * `regressoes`: esse descritor manteve o patamar, então soma em "Estáveis" em
 * vez de desaparecer da conta.
 */
export function contadoresDoPdf(resumo: any) {
  return {
    confirmadas: Number(resumo?.confirmadas) || 0,
    parciais: Number(resumo?.parciais) || 0,
    estaveis: (Number(resumo?.estagnacoes) || 0) + (Number(resumo?.regressoes) || 0),
  };
}

function Stat({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={{ ...s.statValue, color: cor }}>{String(valor)}</Text>
    </View>
  );
}

function CardDescritor({ d }: { d: any }) {
  const cfg = convDe(d.convergencia);
  const avanco = avancoDoPdf(d.nota_pre, d.nota_pos);
  return (
    <View style={{ ...s.card, backgroundColor: cfg.bg, borderColor: cfg.bg }} wrap={false}>
      <View style={s.row}>
        <Text style={s.cardTitle}>{d.descritor}</Text>
        {avanco && <Text style={{ ...s.delta, color: cfg.cor }}>{avanco}</Text>}
      </View>
      <Text style={{ ...s.pill, color: cfg.cor, backgroundColor: colors.white }}>{cfg.label}</Text>
      {d.antes && <Text style={s.antesDepois}><Text style={s.rotulo}>Antes: </Text>{d.antes}</Text>}
      {d.depois && <Text style={s.antesDepois}><Text style={s.rotulo}>Depois: </Text>{d.depois}</Text>}
    </View>
  );
}

function MomentosDeInsight({ momentos }: { momentos: any[] }) {
  if (!momentos?.length) return null;
  return (
    <View style={s.section}>
      {momentos.map((m: any, i: number) => {
        const card = (
          <View key={i} style={s.card} wrap={false}>
            <Text style={s.eyebrow}>Semana {m.semana}{m.descritor ? ` · ${m.descritor}` : ''}</Text>
            <Text style={s.insight}>{m.insight}</Text>
          </View>
        );
        // Título preso ao primeiro card (ver "Missões executadas").
        return i === 0
          ? <View key={i} wrap={false}><ReportSectionTitle>Momentos de insight</ReportSectionTitle>{card}</View>
          : card;
      })}
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
  const contadores = contadoresDoPdf(evolutionReport?.resumo);
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
            <Stat label="Confirmadas" valor={contadores.confirmadas} cor={CONV[CONVERGENCIA.CONFIRMADA].cor} />
            <Stat label="Parciais" valor={contadores.parciais} cor={CONV[CONVERGENCIA.PARCIAL].cor} />
            <Stat label="Estáveis" valor={contadores.estaveis} cor={CONV[CONVERGENCIA.ESTAVEL].cor} />
          </View>

          {evolutionReport?.insight_geral && (
            <Text style={s.quote}>{evolutionReport.insight_geral}</Text>
          )}
        </View>

        <View style={s.section}>
          <ReportSectionTitle>Descritor a descritor</ReportSectionTitle>
          {/* Agrupado por competência: a trilha DUO tem duas, e a lista corrida
              não dizia a qual cada comportamento pertence. */}
          {agruparPorCompetencia(descritores).map((grupo, g) => (
            <View key={g}>
              {/* O título da competência vai PRESO ao primeiro card: sozinho, ele
                  caiu no pé da página 2 com os cards na 3 (medido na folha de
                  contato do PDF da Elisângela, 16/09). `minPresenceAhead` não
                  segurou; `wrap={false}` no par segura. */}
              <View wrap={false}>
                {grupo.competencia && (
                  <View style={s.competenciaLinha}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.competencia}>{grupo.competencia}</Text>
                      {/* Nível da MÉDIA da competência, nunca a nota; estrela quando subiu. */}
                      {grupo.nivelFinal != null && (
                        <View style={s.nivelLinha}>
                          <Text style={s.nivel}>{`Nível final N${grupo.nivelFinal}`}</Text>
                          {grupo.subiuDeNivel && <Estrela />}
                          {grupo.subiuDeNivel && <Text style={s.subiu}>Subiu de nível</Text>}
                        </View>
                      )}
                    </View>
                    {/* O resultado da COMPETÊNCIA é o avanço médio dos descritores. */}
                    {avancoValorPdf(grupo.avancoMedio) && (
                      <Text style={s.competenciaAvanco}>{`Avanço médio ${avancoValorPdf(grupo.avancoMedio)}`}</Text>
                    )}
                  </View>
                )}
                {grupo.descritores[0] && <CardDescritor d={grupo.descritores[0]} />}
              </View>
              {grupo.descritores.slice(1).map((d: any, i: number) => <CardDescritor key={i} d={d} />)}
            </View>
          ))}
        </View>

        <MomentosDeInsight momentos={momentos} />

        {missoes?.length > 0 && (
          <View style={s.section}>
            {missoes.map((m: any, i: number) => {
              const card = (
                <View key={i} style={s.card} wrap={false}>
                  <Text style={s.eyebrow}>
                    Semana {m.semana} · {m.modo === 'pratica' ? 'Missão real' : 'Cenário escrito'}
                  </Text>
                  {m.compromisso && <Text style={s.antesDepois}><Text style={s.rotulo}>Compromisso: </Text>{m.compromisso}</Text>}
                  {m.sintese && <Text style={s.antesDepois}><Text style={s.rotulo}>Síntese: </Text>{m.sintese}</Text>}
                </View>
              );
              // Título preso ao primeiro card: solto, caía no pé da página 4 do
              // PDF do Helmar com a missão na 5 (16/09/2026). O maior card de
              // missão da base (2.665 caracteres, o dele) ocupa ~80% da página,
              // então título + card ainda cabem.
              return i === 0
                ? <View key={i} wrap={false}><ReportSectionTitle>Missões executadas</ReportSectionTitle>{card}</View>
                : card;
            })}
          </View>
        )}

        {sem14 && (
          // Título e devolutiva juntos: separados, "Avaliação final / Devolutiva"
          // ficava no pé de uma página e o texto na seguinte. A maior devolutiva
          // da base tem 1.589 caracteres (medido 16/09), cabe numa página.
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>Avaliação final</ReportSectionTitle>
            {sem14?.resumo_avaliacao?.mensagem_geral && (
              <View style={s.card}>
                <Text style={s.rotulo}>Devolutiva</Text>
                <Text style={{ ...s.text, marginTop: 3 }}>{sem14.resumo_avaliacao.mensagem_geral}</Text>
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
