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
import { textosDoRelatorio } from '@/lib/season-engine/relatorio-texto';
import { descritorParaHumano } from '@/lib/descritor-humano';
import { createTranslator } from 'next-intl';
import mensagensPtBR from '@/messages/pt-BR.json';

/**
 * Os textos que a TELA também mostra (títulos, níveis, as explicações do
 * relatório) vêm das MESMAS traduções dela, em pt-BR: o papel e a tela não
 * podem explicar a régua de dois jeitos.
 */
const tr = createTranslator({ locale: 'pt-BR', messages: mensagensPtBR as any, namespace: 'SeasonDone' }) as any;

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
  // Destaque da competência no início: é o indicador da régua de maturidade.
  destaque: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
    borderWidth: 1, borderColor: colors.gray200, borderLeftWidth: 4, borderLeftColor: colors.navy,
    borderRadius: 6, backgroundColor: colors.summaryBg, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
  },
  destaqueNome: { fontFamily: 'NotoSans', fontSize: 12, fontWeight: 700, color: colors.navy },
  destaqueNivel: { fontFamily: 'NotoSans', fontSize: fonts.body, color: colors.textSecondary },
  destaqueNivelSubiu: { fontFamily: 'NotoSans', fontSize: fonts.body, fontWeight: 700, color: colors.navy },
  destaqueSubiu: { fontFamily: 'NotoSans', fontSize: fonts.body, fontWeight: 700, color: COR_VEREDITO_PAPEL[CONVERGENCIA.CONFIRMADA].fg },
  destaqueAvanco: { alignItems: 'flex-end' },
  escala: { flexDirection: 'row', gap: 3, marginTop: 8 },
  escalaDegrau: { flex: 1, borderRadius: 3, borderWidth: 1, paddingVertical: 3, alignItems: 'center' },
  escalaTexto: { fontFamily: 'NotoSans', fontSize: fonts.caption, fontWeight: 600 },
  destaqueFrase: { fontFamily: 'NotoSans', fontSize: fonts.small, color: colors.textSecondary, lineHeight: 1.5, marginTop: 6 },
  statExplicacao: { fontFamily: 'NotoSans', fontSize: fonts.caption, color: colors.textSecondary, lineHeight: 1.45, marginTop: 4 },
  destaqueAvancoValor: { fontFamily: 'NotoSans', fontSize: 22, fontWeight: 700, color: colors.navy, marginTop: 1 },
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
// 🔴 Sem "Regressão" (16/09/2026, pedido do dono olhando um PDF real).
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

/** Seta "de → para". Em SVG porque o U+2192 não existe no subset da fonte do corpo. */
function Seta({ tamanho = 9 }: { tamanho?: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Path d="M4 12h14M12 5l7 7-7 7" stroke={colors.navy} strokeWidth={2.6} fill="none" />
    </Svg>
  );
}

/** Estrela de "parabéns". Desenhada em SVG: emoji fora do subset da fonte sai em branco. */
function Estrela({ tamanho = 9 }: { tamanho?: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
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

function Stat({ label, valor, cor, explicacao }: { label: string; valor: number; cor: string; explicacao?: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={{ ...s.statValue, color: cor }}>{String(valor)}</Text>
      {explicacao && <Text style={s.statExplicacao}>{explicacao}</Text>}
    </View>
  );
}

/**
 * A régua de 4 níveis, para a pessoa se situar: até o nível de partida em
 * navy, o que subiu nesta temporada em verde, o resto em cinza.
 */
function EscalaDeNiveis({ inicial, final }: { inicial: number | null; final: number }) {
  const partida = inicial ?? final;
  return (
    <View style={s.escala}>
      {[1, 2, 3, 4].map((n) => {
        const conquistado = n > partida && n <= final;
        const alcancado = n <= partida;
        const bg = conquistado ? COR_VEREDITO_PAPEL[CONVERGENCIA.CONFIRMADA].fg : alcancado ? colors.navy : colors.white;
        return (
          <View key={n} style={{ ...s.escalaDegrau, backgroundColor: bg, borderColor: conquistado || alcancado ? bg : colors.gray300 }}>
            <Text style={{ ...s.escalaTexto, color: conquistado || alcancado ? colors.white : colors.textMuted }}>{tr('level', { n })}</Text>
          </View>
        );
      })}
    </View>
  );
}

function CardDescritor({ d }: { d: any }) {
  const cfg = convDe(d.convergencia);
  const avanco = avancoDoPdf(d.nota_pre, d.nota_pos);
  return (
    <View style={{ ...s.card, backgroundColor: cfg.bg, borderColor: cfg.bg }} wrap={false}>
      <View style={s.row}>
        <Text style={s.cardTitle}>{descritorParaHumano(d.descritor)}</Text>
        {avanco && <Text style={{ ...s.delta, color: cfg.cor }}>{avanco}</Text>}
      </View>
      <Text style={{ ...s.pill, color: cfg.cor, backgroundColor: colors.white }}>{cfg.label}</Text>
      {d.antes && <Text style={s.antesDepois}><Text style={s.rotulo}>Antes: </Text>{d.antes}</Text>}
      {d.depois && <Text style={s.antesDepois}><Text style={s.rotulo}>Depois: </Text>{d.depois}</Text>}
    </View>
  );
}

/**
 * Uma competência no destaque do início: nome, nível e avanço.
 *
 * 🔑 É o indicador da régua de maturidade, por isso abre o documento (pedido do
 * dono, 16/09/2026). Nível da MÉDIA das notas finais, que nunca cai abaixo do de
 * partida; avanço = média dos avanços exibidos dos descritores. Nenhuma nota.
 * O rótulo é "Avanço", sem "médio" (mesmo pedido).
 */
function DestaqueCompetencia({ grupo }: { grupo: ReturnType<typeof agruparPorCompetencia>[number] }) {
  const avanco = avancoValorPdf(grupo.avancoMedio);
  return (
    <View style={s.destaque} wrap={false}>
      <View style={{ flex: 1 }}>
        <Text style={s.destaqueNome}>{grupo.competencia}</Text>
        {/* Subiu: "Nível 1 → Nível 2 ★ Parabéns!…" (texto do dono, 16/09/2026). Manteve: só o nível. */}
        {grupo.nivelFinal != null && grupo.subiuDeNivel && (
          <View style={{ ...s.nivelLinha, marginTop: 4 }}>
            <Text style={s.destaqueNivelSubiu}>{tr('level', { n: grupo.nivelInicial })}</Text>
            <Seta tamanho={10} />
            <Text style={s.destaqueNivelSubiu}>{tr('level', { n: grupo.nivelFinal })}</Text>
            <Estrela tamanho={10} />
            <Text style={s.destaqueSubiu}>{tr('levelUp')}</Text>
          </View>
        )}
        {grupo.nivelFinal != null && !grupo.subiuDeNivel && (
          <View style={{ ...s.nivelLinha, marginTop: 4 }}>
            <Text style={s.destaqueNivel}>{tr('level', { n: grupo.nivelFinal })}</Text>
          </View>
        )}
        {/* Revisão de 17/09/2026: dizer com todas as letras de qual competência
            é o resultado, de onde a pessoa partiu, aonde chegou e que a escala
            tem 4 níveis ("prefiro pecar pelo excesso"). */}
        {grupo.nivelFinal != null && (
          <>
            <EscalaDeNiveis inicial={grupo.nivelInicial} final={grupo.nivelFinal} />
            <Text style={s.destaqueFrase}>
              {grupo.subiuDeNivel
                ? tr('levelFromTo', { competency: grupo.competencia, from: grupo.nivelInicial, to: grupo.nivelFinal })
                : tr('levelKept', { competency: grupo.competencia, n: grupo.nivelFinal })}
            </Text>
          </>
        )}
      </View>
      {avanco && (
        <View style={s.destaqueAvanco}>
          <Text style={s.statLabel}>{tr('competencyProgress')}</Text>
          <Text style={s.destaqueAvancoValor}>{avanco}</Text>
        </View>
      )}
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
            <Text style={s.eyebrow}>Semana {m.semana}{m.descritor ? ` · ${descritorParaHumano(m.descritor)}` : ''}</Text>
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
  const rodape = marca.mostrarVertho ? 'Vertho.ai · Piloto' : 'Piloto';

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
                <Text style={s.cardTitle}>{descritorParaHumano(d.descritor)}</Text>
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

export function TemporadaConcluidaPDF({ dados: dadosBrutos, marca }: { dados: any; marca: MarcaPdf }) {
  const dados = textosDoRelatorio(dadosBrutos);
  const { colab, trilha, evolutionReport, momentos, missoes, sem14 } = dados;
  if (evolutionReport?.modo === 'piloto') return <TemporadaPilotoPDF dados={dados} marca={marca} />;

  const descritores = evolutionReport?.descritores || [];
  const grupos = agruparPorCompetencia(descritores);
  const comCompetencia = grupos.filter((g) => g.competencia);
  const contadores = contadoresDoPdf(evolutionReport?.resumo);
  const totalSemanas = trilha?.totalSemanas || 14;
  // "Vertho.ai" no rodapé (revisão de 17/09/2026), a marca como a pessoa a encontra.
  const rodape = marca.mostrarVertho ? 'Vertho.ai' : 'Relatório de temporada';
  const devolutiva = sem14?.resumo_avaliacao?.mensagem_geral;

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

        {/* ORDEM DO DOCUMENTO (dono, 16/09/2026): abre com a devolutiva da
            avaliação final, que "já traz de bate pronto o resumo da evolução";
            depois as competências em destaque; o `insight_geral`, que abria o
            documento, fecha como "Mensagem final". */}
        <View style={s.section}>
          <ReportSectionTitle>{`${primeiroNome(colab?.nome)}, veja o que mudou em você`}</ReportSectionTitle>
          {devolutiva
            ? <Text style={s.text}>{devolutiva}</Text>
            : <Text style={s.intro}>{`${totalSemanas} semanas dedicadas a ${trilha?.competencia || ''}.`}</Text>}
        </View>

        {comCompetencia.length > 0 && (
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{tr('sections.competencies', { count: comCompetencia.length })}</ReportSectionTitle>
            <Text style={s.intro}>{tr('competenciesIntro')}</Text>
            {comCompetencia.map((grupo, g) => <DestaqueCompetencia key={g} grupo={grupo} />)}
          </View>
        )}

        <View style={s.section}>
          {/* Os contadores contam COMPORTAMENTOS, então abrem esta seção, cada
              um com o que significa (revisão de 17/09/2026: explicar de forma
              didática e sem desvalorizar a evolução parcial). Presos ao título
              para ele não ficar sozinho no pé da página. */}
          <View wrap={false}>
            <ReportSectionTitle>{tr('sections.descriptor')}</ReportSectionTitle>
            <Text style={s.intro}>{tr('behaviorsIntro')}</Text>
            <Text style={{ ...s.intro, marginBottom: 6 }}>{tr('countersIntro', { total: descritores.length })}</Text>
            <View style={s.statGrid}>
              <Stat label={tr('stats.confirmed')} valor={contadores.confirmadas} cor={CONV[CONVERGENCIA.CONFIRMADA].cor} explicacao={tr('legend.confirmed')} />
              <Stat label={tr('stats.partial')} valor={contadores.parciais} cor={CONV[CONVERGENCIA.PARCIAL].cor} explicacao={tr('legend.partial')} />
              <Stat label={tr('stats.stagnated')} valor={contadores.estaveis} cor={CONV[CONVERGENCIA.ESTAVEL].cor} explicacao={tr('legend.stable')} />
            </View>
          </View>
          {/* Agrupado por competência: a trilha DUO tem duas, e a lista corrida
              não dizia a qual cada comportamento pertence. Nível e avanço ficam
              no destaque do início; aqui só o nome, para não repetir. */}
          {grupos.map((grupo, g) => (
            <View key={g}>
              {/* O nome da competência vai PRESO ao primeiro card: sozinho, ele
                  caiu no pé da página 2 com os cards na 3 (medido na folha de
                  contato de um PDF real, 16/09). `minPresenceAhead` não
                  segurou; `wrap={false}` no par segura. */}
              <View wrap={false}>
                {grupo.competencia && (
                  <View style={s.competenciaLinha}>
                    <Text style={s.competencia}>{grupo.competencia}</Text>
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
              // PDF real com a missão na 5 (16/09/2026). O maior card de
              // missão da base (2.665 caracteres, o desse PDF) ocupa ~80% da página,
              // então título + card ainda cabem.
              return i === 0
                ? <View key={i} wrap={false}><ReportSectionTitle>Missões executadas</ReportSectionTitle>{card}</View>
                : card;
            })}
          </View>
        )}

        {evolutionReport?.proximo_passo && (
          <View style={s.section}>
            <ReportSectionTitle>Próximos passos</ReportSectionTitle>
            <Text style={s.text}>{evolutionReport.proximo_passo}</Text>
          </View>
        )}

        {evolutionReport?.insight_geral && (
          // Título e texto juntos, pelo mesmo motivo dos outros títulos: o maior
          // `insight_geral` da base tem 556 caracteres (medido 16/09).
          <View style={s.section} wrap={false}>
            <ReportSectionTitle>{tr('sections.finalMessage')}</ReportSectionTitle>
            <Text style={s.quote}>{evolutionReport.insight_geral}</Text>
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
