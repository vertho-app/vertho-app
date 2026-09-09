/**
 * PDF EXECUTIVO DE EVOLUÇÃO — o documento que responde "quem evoluiu, em quê e
 * quanto", para o RH levar à reunião sem precisar abrir o sistema.
 *
 * TRÊS DECISÕES QUE ESTE ARQUIVO CARREGA:
 *
 * 1. **Os números vêm do MESMO agregador da tela** (`carregarEvolucaoRH` →
 *    `EvolucaoCentro`). Nada é recalculado aqui. Um PDF que refaz a conta é o
 *    caminho mais curto para o cliente receber um papel que discorda da tela que
 *    ele acabou de ver — e o papel é o que circula na organização dele.
 *
 * 2. **O rótulo do veredito sai de `rotuloConvergencia`.** Escrever "Estável" à
 *    mão aqui recriaria a divergência que a régua única existe para impedir.
 *
 * 3. **A última página diz como isto foi medido, inclusive o erro.** É a página
 *    que separa um relatório bonito de um relatório defensável: ela declara o
 *    ruído do instrumento (`RUIDO_MEDIDO`), e com isso o leitor sabe quais
 *    diferenças valem conversa e quais são pequenas demais para afirmar. Um
 *    painel que só mostra a seta para cima convida o cliente a perguntar "como
 *    vocês sabem?" — e essa pergunta merece uma página, não uma frase.
 *
 * ⚠️ NENHUM GLIFO FORA DO SUBSET DA INTER (sem → ✓ ● ★ ≥). O guard
 * `tests/unit/pdf-glifos-guard.test.ts` falha se um entrar; o efeito no papel é
 * um buraco em branco no lugar exato do sentido da frase.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, pageStyles, fonts } from './styles';
import PdfReportCover, { ReportSectionTitle } from './PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import {
  CONVERGENCIA, rotuloConvergencia, CORTE_CONFIRMADA, CORTE_PARCIAL, NIVEL_META_CONFIRMADA,
} from '@/lib/season-engine/convergencia';
import { RUIDO_MEDIDO } from '@/lib/season-engine/prompts/extrator-conversa';
import { TETO_N3 } from '@/lib/nivel-regua';
import type { EvolucaoCentro, EvolucaoAgregado, EvolucaoPessoa } from '@/lib/relatorios/evolucao-center';

const s = StyleSheet.create({
  section: { marginBottom: 16 },
  p: { fontFamily: 'NotoSans', fontSize: 9.5, color: colors.textSecondary, lineHeight: 1.55, marginBottom: 5 },
  pStrong: { fontFamily: 'NotoSans', fontSize: 9.5, color: colors.textPrimary, lineHeight: 1.55, marginBottom: 5 },
  h3: { fontFamily: 'NotoSans', fontSize: 10.5, fontWeight: 600, color: colors.navyLight, marginBottom: 6, marginTop: 10 },
  caption: { fontFamily: 'NotoSans', fontSize: 7.5, color: colors.textMuted, lineHeight: 1.4 },
  box: { backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, padding: 12, marginBottom: 10 },
  boxAccent: { backgroundColor: colors.perfilBg, borderWidth: 1, borderColor: colors.perfilBorder, borderRadius: 8, padding: 12, marginBottom: 10 },

  // Cartões de veredito
  cards: { flexDirection: 'row', marginBottom: 10 },
  card: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10, marginRight: 6 },
  cardLast: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 10 },
  cardNum: { fontFamily: 'NotoSans', fontSize: 22, fontWeight: 700, lineHeight: 1.1 },
  cardLabel: { fontFamily: 'NotoSans', fontSize: 7.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 3 },
  cardHint: { fontFamily: 'NotoSans', fontSize: 7, color: colors.textMuted, marginTop: 3, lineHeight: 1.3 },

  // Linha de competência com barra
  compRow: { marginBottom: 11, paddingBottom: 9, borderBottomWidth: 0.5, borderBottomColor: colors.gray200 },
  compHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  compName: { fontFamily: 'NotoSans', fontSize: 10, fontWeight: 600, color: colors.textPrimary, flex: 1, paddingRight: 8 },
  compMeta: { fontFamily: 'NotoSans', fontSize: 8, color: colors.textMuted, marginBottom: 5 },
  compDelta: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 700, width: 52, textAlign: 'right' },

  // Barras: escala fixa de 1 a 4 (o trilho é a régua inteira, então dois
  // relatórios diferentes são comparáveis a olho).
  trilho: { height: 9, backgroundColor: colors.gray200, borderRadius: 5, marginBottom: 3, position: 'relative' },
  barra: { height: 9, borderRadius: 5 },
  barraAntes: { backgroundColor: colors.gray400 },
  barraDepois: { backgroundColor: colors.cyan },
  marcas: { flexDirection: 'row', marginTop: 1 },
  marcaTexto: { fontFamily: 'NotoSans', fontSize: 6.5, color: colors.textMuted },
  legenda: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  legendaPonto: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  legendaTexto: { fontFamily: 'NotoSans', fontSize: 7.5, color: colors.textMuted, marginRight: 12 },

  // Tabelas
  th: { flexDirection: 'row', backgroundColor: colors.navy, paddingVertical: 5, paddingHorizontal: 8, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  thText: { fontFamily: 'NotoSans', fontSize: 7, fontWeight: 700, color: colors.white, textTransform: 'uppercase', letterSpacing: 0.4 },
  tr: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: colors.gray200 },
  trAlt: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: colors.gray200, backgroundColor: colors.gray100 },
  td: { fontFamily: 'NotoSans', fontSize: 8, color: colors.textSecondary },
  tdStrong: { fontFamily: 'NotoSans', fontSize: 8, color: colors.textPrimary, fontWeight: 600 },

  // Pílula de veredito
  pill: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 7, alignSelf: 'flex-start' },
  pillText: { fontFamily: 'NotoSans', fontSize: 6.5, fontWeight: 600 },

  vazio: { backgroundColor: colors.melhorarBg, borderWidth: 1, borderColor: colors.melhorarBorder, borderRadius: 8, padding: 14 },
});

/** Paleta por veredito. Uma só, para a pílula e o cartão não divergirem. */
const TINTA = {
  [CONVERGENCIA.CONFIRMADA]: { fg: '#14532D', bg: '#F0FDF4', border: '#BBF7D0' },
  [CONVERGENCIA.PARCIAL]: { fg: '#0C4A6E', bg: '#F0F9FF', border: '#BAE6FD' },
  [CONVERGENCIA.ESTAVEL]: { fg: '#78350F', bg: '#FFFBEB', border: '#FDE68A' },
  semVeredito: { fg: colors.gray600, bg: colors.gray100, border: colors.gray200 },
};

function num(v: number, casas = 2): string {
  return (v ?? 0).toFixed(casas).replace('.', ',');
}
export function comSinal(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '' : ''}${num(v)}`;
}
/** Posição de uma nota no trilho de 1 a 4, em porcentagem. */
export function pct(nota: number): string {
  const n = Math.max(1, Math.min(4, nota || 1));
  return `${Math.round(((n - 1) / 3) * 100)}%`;
}
function dataBr(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PageFooter() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{'Relatório de evolução · Confidencial'}</Text>
      <Text style={pageStyles.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function PageHeader({ logoBase64, label }: { logoBase64?: string; label: string }) {
  return (
    <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>{label}</Text>
    </View>
  );
}

function Pill({ veredito, rotulo }: { veredito: string | null; rotulo: string }) {
  const t = TINTA[veredito as keyof typeof TINTA] || TINTA.semVeredito;
  return (
    <View style={{ ...s.pill, backgroundColor: t.bg, borderWidth: 0.5, borderColor: t.border }}>
      <Text style={{ ...s.pillText, color: t.fg }}>{rotulo}</Text>
    </View>
  );
}

/**
 * A barra de uma competência. Duas barras no mesmo trilho de 1 a 4: a de partida
 * em cinza, a de chegada em cyan. O trilho é a régua inteira de propósito — barra
 * normalizada pelo próprio valor faz um avanço de 0,1 parecer enorme.
 */
function BarraEvolucao({ item }: { item: EvolucaoAgregado }) {
  const positivo = item.delta > 0;
  return (
    <View style={s.compRow} wrap={false}>
      <View style={s.compHead}>
        <Text style={s.compName}>{item.chave}</Text>
        <Text style={{ ...s.compDelta, color: positivo ? colors.green : colors.textMuted }}>{comSinal(item.delta)}</Text>
      </View>
      <Text style={s.compMeta}>
        {item.competencia ? `${item.competencia}  ·  ` : ''}
        {item.n === 1 ? '1 pessoa' : `${item.n} pessoas`}
        {'  ·  '}
        {`de ${num(item.mediaPre)} para ${num(item.mediaPos)}`}
        {'  ·  '}
        {`N${item.nivelPre} para N${item.nivelPos}`}
      </Text>

      <View style={s.trilho}>
        <View style={{ ...s.barra, ...s.barraAntes, width: pct(item.mediaPre) }} />
      </View>
      <View style={s.trilho}>
        <View style={{ ...s.barra, ...s.barraDepois, width: pct(item.mediaPos) }} />
      </View>
      <View style={s.marcas}>
        <Text style={{ ...s.marcaTexto, flex: 1 }}>N1</Text>
        <Text style={{ ...s.marcaTexto, flex: 1, textAlign: 'center' }}>N2</Text>
        <Text style={{ ...s.marcaTexto, flex: 1, textAlign: 'center' }}>N3</Text>
        <Text style={{ ...s.marcaTexto, textAlign: 'right' }}>N4</Text>
      </View>
    </View>
  );
}

function CartaoVeredito({
  n, total, veredito, hint, ultimo,
}: { n: number; total: number; veredito: string | null; hint: string; ultimo?: boolean }) {
  const t = TINTA[veredito as keyof typeof TINTA] || TINTA.semVeredito;
  const share = total ? Math.round((n / total) * 100) : 0;
  return (
    <View style={{ ...(ultimo ? s.cardLast : s.card), backgroundColor: t.bg, borderColor: t.border }}>
      <Text style={{ ...s.cardNum, color: t.fg }}>{n}</Text>
      <Text style={{ ...s.cardLabel, color: t.fg }}>
        {veredito ? rotuloConvergencia(veredito) : 'Sem medição'}
      </Text>
      <Text style={s.cardHint}>{total ? `${share}% de quem concluiu` : '—'}</Text>
      <Text style={s.cardHint}>{hint}</Text>
    </View>
  );
}

export default function RelatorioEvolucaoPDF({
  data, empresaNome, logoBase64, mostrarVertho = true, recorte,
}: {
  data: EvolucaoCentro;
  empresaNome?: string;
  logoBase64?: string;
  mostrarVertho?: boolean;
  /** Nome da turma/recorte, quando o RH filtrou a central antes de exportar. */
  recorte?: string | null;
}) {
  const { cobertura, resumo, porCompetencia, porDescritor, pessoas, proximasAcoes } = data;
  const label = 'Evolução da jornada';
  const ultimaMedicao = pessoas.map((p) => p.concluidoEm).filter(Boolean).sort().reverse()[0] || null;
  // `pessoas` já vem ordenado por delta decrescente do agregador.
  const multiplicadores = pessoas.filter((p) => p.veredito === CONVERGENCIA.CONFIRMADA).slice(0, 3);

  const capa = (
    <PdfReportCover
      bgBase64={getReportCoverBgBase64()}
      logoBase64={logoBase64}
      overline={'Relatório executivo · Fim de jornada'}
      titulo={['Evolução', 'da Jornada']}
      nome={empresaNome}
      cargo={recorte || undefined}
      tagline={'O que mudou, em quem, e como sabemos.'}
      mostrarVertho={mostrarVertho}
    />
  );

  // Sem ninguém medido o documento ainda sai — dizendo o que falta. Um PDF que
  // se recusa a existir manda o RH perguntar por e-mail o que a página responde.
  if (!pessoas.length) {
    return (
      <Document>
        {capa}
        <Page size="A4" style={pageStyles.page} wrap>
          <PageHeader logoBase64={logoBase64} label={label} />
          <ReportSectionTitle>Ainda não há evolução medida</ReportSectionTitle>
          <View style={s.vazio}>
            <Text style={s.pStrong}>
              {data.indisponivel
                ? 'Não foi possível ler os dados de evolução neste momento. Isto é uma falha de leitura nossa, não um resultado do programa — nenhuma conclusão deve ser tirada desta página.'
                : 'A medição de evolução nasce no fechamento da jornada, quando o cenário final é avaliado e comparado com o diagnóstico inicial. Nenhum participante deste recorte chegou a esse ponto ainda.'}
            </Text>
            {!data.indisponivel && (
              <Text style={s.p}>
                {`Participantes no recorte: ${cobertura.participantes}. Em jornada agora: ${cobertura.emJornada}. Com fechamento concluído: ${cobertura.medidos}.`}
              </Text>
            )}
          </View>
          <PageFooter />
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      {capa}

      {/* ───────────────── 1. Panorama ───────────────── */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={label} />

        <View style={s.section}>
          <ReportSectionTitle>Onde a jornada chegou</ReportSectionTitle>
          <Text style={s.pStrong}>
            {`${cobertura.medidos} ${cobertura.medidos === 1 ? 'pessoa concluiu' : 'pessoas concluíram'} a jornada e ${cobertura.medidos === 1 ? 'tem' : 'têm'} evolução medida`}
            {cobertura.participantes ? `, de ${cobertura.participantes} no recorte (${cobertura.percentual}%).` : '.'}
            {cobertura.emJornada ? ` Outras ${cobertura.emJornada} seguem em jornada e serão medidas no fechamento delas.` : ''}
          </Text>
          <Text style={s.p}>
            {`A leitura abaixo vem de ${resumo.descritoresMedidos} ${resumo.descritoresMedidos === 1 ? 'avaliação' : 'avaliações'} de comportamento, em ${porDescritor.length} ${porDescritor.length === 1 ? 'comportamento distinto' : 'comportamentos distintos'}`}
            {ultimaMedicao ? `, com a medição mais recente em ${dataBr(ultimaMedicao)}.` : '.'}
            {` O avanço médio por pessoa foi de ${comSinal(resumo.deltaMedio)} ponto na régua de 1 a 4.`}
          </Text>
        </View>

        <View style={s.section}>
          <View style={s.cards}>
            <CartaoVeredito
              n={resumo.confirmadas} total={cobertura.medidos} veredito={CONVERGENCIA.CONFIRMADA}
              hint={'Aplicou sem ser induzido e sustentou sob restrição nova.'}
            />
            <CartaoVeredito
              n={resumo.parciais} total={cobertura.medidos} veredito={CONVERGENCIA.PARCIAL}
              hint={'Avançou, ainda apoiado na estrutura da conversa.'}
            />
            <CartaoVeredito
              n={resumo.estaveis} total={cobertura.medidos} veredito={CONVERGENCIA.ESTAVEL}
              hint={'Reconhece o caminho; o fechamento não trouxe um caso real.'}
            />
            <CartaoVeredito
              n={resumo.semVeredito} total={cobertura.medidos} veredito={null} ultimo
              hint={'Fechamento sem as duas fontes exigidas pela régua.'}
            />
          </View>
          <Text style={s.caption}>
            {'Ninguém aparece como "piorou": a régua não tem veredito de regressão, porque uma nota que cai entre o diagnóstico e o fechamento descreve a variação da medição, não alguém que desaprendeu. Esse caso entra como estável — ver a última página.'}
          </Text>
        </View>

        <View style={s.section}>
          <ReportSectionTitle>Onde o grupo mais avançou</ReportSectionTitle>
          {porCompetencia.slice(0, 6).map((c) => <BarraEvolucao key={c.chave} item={c} />)}
          <View style={s.legenda}>
            <View style={{ ...s.legendaPonto, backgroundColor: colors.gray400 }} />
            <Text style={s.legendaTexto}>No diagnóstico inicial</Text>
            <View style={{ ...s.legendaPonto, backgroundColor: colors.cyan }} />
            <Text style={s.legendaTexto}>No fechamento da jornada</Text>
          </View>
          <Text style={s.caption}>
            {'As barras estão na escala completa da régua (1 a 4), e não ajustadas ao maior valor — um avanço pequeno tem que parecer pequeno.'}
          </Text>
        </View>

        <PageFooter />
      </Page>

      {/* ───────────────── 2. Comportamentos ───────────────── */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={label} />

        <View style={s.section}>
          <ReportSectionTitle>Comportamento por comportamento</ReportSectionTitle>
          <Text style={s.p}>
            {'A competência é o título; o que se observa é o comportamento. Esta é a lista que serve para escolher o foco do próximo ciclo.'}
          </Text>

          <View style={s.th}>
            <Text style={{ ...s.thText, flex: 3, paddingRight: 8 }}>Comportamento</Text>
            <Text style={{ ...s.thText, flex: 2.4 }}>Competência</Text>
            <Text style={{ ...s.thText, width: 38, textAlign: 'right' }}>Pess.</Text>
            <Text style={{ ...s.thText, width: 42, textAlign: 'right' }}>Antes</Text>
            <Text style={{ ...s.thText, width: 42, textAlign: 'right' }}>Depois</Text>
            <Text style={{ ...s.thText, width: 40, textAlign: 'right' }}>Avanço</Text>
          </View>
          {porDescritor.map((d, i) => (
            <View key={`${d.competencia} :: ${d.chave}`} style={i % 2 ? s.trAlt : s.tr} wrap={false}>
              <Text style={{ ...s.tdStrong, flex: 3, paddingRight: 8 }}>{d.chave}</Text>
              <Text style={{ ...s.td, flex: 2.4, fontSize: 7.5 }}>{d.competencia || '—'}</Text>
              <Text style={{ ...s.td, width: 38, textAlign: 'right' }}>{d.n}</Text>
              <Text style={{ ...s.td, width: 42, textAlign: 'right' }}>{num(d.mediaPre)}</Text>
              <Text style={{ ...s.td, width: 42, textAlign: 'right' }}>{num(d.mediaPos)}</Text>
              <Text style={{ ...s.tdStrong, width: 40, textAlign: 'right', color: d.delta > 0 ? colors.green : colors.textMuted }}>
                {comSinal(d.delta)}
              </Text>
            </View>
          ))}
        </View>

        <PageFooter />
      </Page>

      {/* ───────────────── 3. Pessoas ───────────────── */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={label} />

        <View style={s.section}>
          <ReportSectionTitle>Pessoa por pessoa</ReportSectionTitle>
          <Text style={s.p}>
            {'Ordenado pelo avanço. A coluna de sustentação diz quantas fontes independentes apoiam a leitura: ela existe para que uma conversa curta não pese o mesmo que um fechamento completo.'}
          </Text>
          <View style={s.th}>
            <Text style={{ ...s.thText, flex: 3 }}>Pessoa</Text>
            <Text style={{ ...s.thText, flex: 2 }}>Cargo</Text>
            <Text style={{ ...s.thText, width: 40, textAlign: 'right' }}>Antes</Text>
            <Text style={{ ...s.thText, width: 44, textAlign: 'right' }}>Depois</Text>
            <Text style={{ ...s.thText, width: 40, textAlign: 'right' }}>Avanço</Text>
            <Text style={{ ...s.thText, width: 96, paddingLeft: 6 }}>Leitura</Text>
            <Text style={{ ...s.thText, width: 34 }}>Sust.</Text>
          </View>
          {pessoas.map((p, i) => (
            <View key={p.colaboradorId} style={i % 2 ? s.trAlt : s.tr} wrap={false}>
              <Text style={{ ...s.tdStrong, flex: 3 }}>{p.nome}</Text>
              <Text style={{ ...s.td, flex: 2 }}>{p.cargo || '—'}</Text>
              <Text style={{ ...s.td, width: 40, textAlign: 'right' }}>{num(p.mediaPre)}</Text>
              <Text style={{ ...s.td, width: 44, textAlign: 'right' }}>{num(p.mediaPos)}</Text>
              <Text style={{ ...s.tdStrong, width: 40, textAlign: 'right', color: p.delta > 0 ? colors.green : colors.textMuted }}>
                {comSinal(p.delta)}
              </Text>
              <View style={{ width: 96, paddingLeft: 6 }}>
                <Pill veredito={p.veredito} rotulo={p.vereditoRotulo} />
              </View>
              <Text style={{ ...s.td, width: 34 }}>{p.sustentacao === 'media' ? 'Média' : 'Baixa'}</Text>
            </View>
          ))}
        </View>

        <PageFooter />
      </Page>


      {/* ───────────────── 4. Próximos passos ───────────────── */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={label} />

        {proximasAcoes.proximoCiclo.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>Candidatos ao próximo ciclo</ReportSectionTitle>
            <View style={s.boxAccent}>
              <Text style={s.p}>
                {'Os comportamentos em que o grupo menos avançou. São os que mais provavelmente precisam de outra abordagem — não de mais do mesmo conteúdo.'}
              </Text>
              {proximasAcoes.proximoCiclo.map((d) => (
                <Text key={`${d.competencia} :: ${d.chave}`} style={s.pStrong}>
                  {`• ${d.chave}`}
                  {d.competencia ? ` (${d.competencia})` : ''}
                  {` — ${d.n === 1 ? '1 pessoa' : `${d.n} pessoas`}, avanço de ${comSinal(d.delta)}`}
                </Text>
              ))}
            </View>
          </View>
        )}

        {proximasAcoes.precisamApoio.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>Conversas a ter primeiro</ReportSectionTitle>
            <View style={s.box}>
              <Text style={s.p}>
                {'Quem terminou a jornada sem evolução confirmada em nenhum comportamento. Não é uma lista de problema: é onde uma conversa de gestor muda mais o resultado do próximo ciclo.'}
              </Text>
              {proximasAcoes.precisamApoio.slice(0, 10).map((p) => (
                <Text key={p.colaboradorId} style={s.pStrong}>
                  {`• ${p.nome}`}
                  {p.cargo ? ` — ${p.cargo}` : ''}
                  {`: ${p.vereditoRotulo}, avanço de ${comSinal(p.delta)}`}
                  {p.proximoPasso ? `. Próximo passo sugerido: ${p.proximoPasso}` : ''}
                </Text>
              ))}
            </View>
          </View>
        )}

        {multiplicadores.length > 0 && (
          <View style={s.section}>
            <ReportSectionTitle>Quem pode multiplicar</ReportSectionTitle>
            <View style={s.box}>
              <Text style={s.p}>
                {'Quem sustentou a mudança sob restrição nova. São as pessoas com caso próprio para contar — e o caso de um par convence mais do que o conteúdo.'}
              </Text>
              {multiplicadores.map((p) => (
                <View key={p.colaboradorId} style={{ marginBottom: 6 }}>
                  <Text style={s.pStrong}>
                    {`• ${p.nome}`}
                    {p.cargo ? ` — ${p.cargo}` : ''}
                    {`: avanço de ${comSinal(p.delta)} em ${p.competencia || "competência do ciclo"}`}
                  </Text>
                  {p.insight ? <Text style={{ ...s.caption, marginLeft: 10 }}>{p.insight}</Text> : null}
                </View>
              ))}
            </View>
          </View>
        )}

        <PageFooter />
      </Page>
      {/* ───────────────── 5. Método ───────────────── */}
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} label={label} />

        <View style={s.section}>
          <ReportSectionTitle>Como isto foi medido</ReportSectionTitle>
          <Text style={s.h3}>As duas pontas da comparação</Text>
          <Text style={s.p}>
            {'O ponto de partida de cada comportamento vem do diagnóstico feito no início da jornada. O ponto de chegada vem do fechamento, que tem duas fontes: a conversa de reflexão, em que a pessoa relata o que mudou na prática dela, e um cenário situacional novo, respondido e avaliado comportamento a comportamento. As duas notas estão na mesma régua de 1 a 4.'}
          </Text>

          <Text style={s.h3}>Os quatro níveis</Text>
          <Text style={s.p}>
            {`N1 de 1,00 a 1,99 (lacuna) · N2 de 2,00 a 2,99 (em desenvolvimento) · N3 de 3,00 a ${num(TETO_N3)} (consistente) · N4 acima de ${num(TETO_N3)} (referência).`}
          </Text>

          <Text style={s.h3}>Quando a evolução é chamada de confirmada</Text>
          <Text style={s.p}>
            {`Confirmada exige três coisas ao mesmo tempo: avanço de ao menos ${num(CORTE_CONFIRMADA)} ponto, o relato da própria pessoa sustentando a mudança, e a nota de chegada alcançando N${NIVEL_META_CONFIRMADA}. Subir muito sem chegar a N${NIVEL_META_CONFIRMADA} é evolução parcial: "confirmada" se lê como "pode contar com isso", e essa promessa exige o patamar, não só o movimento.`}
          </Text>
          <Text style={s.p}>
            {`Parcial cobre avanço de ao menos ${num(CORTE_PARCIAL)} ponto, ou o relato sustentando a mudança sozinho. Estável é o piso: o patamar de partida se manteve, e é só isso que a medição sustenta.`}
          </Text>

          <Text style={s.h3}>A precisão do instrumento</Text>
          <Text style={s.pStrong}>
            {`Medimos o erro da nossa própria medição em ${RUIDO_MEDIDO.medidoEm}: ${RUIDO_MEDIDO.conversas} conversas reais de fechamento foram reavaliadas ${RUIDO_MEDIDO.repeticoes} vezes cada, do zero, pelo mesmo avaliador.`}
          </Text>
          <Text style={s.p}>
            {`A nota de uma pessoa variou, entre releituras da MESMA conversa, com desvio de ${num(RUIDO_MEDIDO.dpPorConversa)} ponto, e no pior caso ${num(RUIDO_MEDIDO.amplitudeMaximaPorConversa)} ponto. Três consequências práticas para ler este relatório:`}
          </Text>
          <Text style={s.p}>
            {`• Um avanço de ${num(CORTE_CONFIRMADA)} ponto ou mais está acima desse erro com folga. Evolução confirmada não sai de variação da medição.`}
          </Text>
          <Text style={s.p}>
            {`• Diferenças pequenas, abaixo de ${num(RUIDO_MEDIDO.amplitudeMaximaPorConversa)} ponto, não sustentam afirmação sobre uma pessoa isolada. Elas valem como tendência do grupo, não como diagnóstico individual.`}
          </Text>
          <Text style={s.p}>
            {`• O número é mais confiável que o nível. Uma nota de 2,00 fica na fronteira entre N1 e N2, e um centésimo a move de lado: em ${RUIDO_MEDIDO.paresComNivelInstavel} dos ${RUIDO_MEDIDO.pares} casos medidos o nível trocou entre releituras, enquanto a nota praticamente não mudou. Por isso compare notas, e trate o nível como faixa.`}
          </Text>

          <Text style={s.h3}>O que este relatório não afirma</Text>
          <Text style={s.p}>
            {'Que ninguém regrediu — a régua não mede isso, por decisão: uma queda de nota entre duas conversas diferentes descreve a variação do instrumento, e chamar isso de regressão transformaria ruído numa afirmação sobre a pessoa, dentro de um documento que o gestor dela lê.'}
          </Text>
          <Text style={s.p}>
            {'Que quem não aparece aqui não evoluiu. Quem ainda está em jornada não tem fechamento, e sem fechamento não há segunda medição — ausência de medição não é medição de ausência.'}
          </Text>
          <Text style={s.p}>
            {`Que a média de um grupo pequeno vale como taxa. Cada número deste relatório carrega o próprio n, e aqui ele é ${cobertura.medidos}.`}
          </Text>
        </View>

        <PageFooter />
      </Page>
    </Document>
  );
}
