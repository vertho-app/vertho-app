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
 * 2. **A medida externa é cenário contra cenário.** Evidências continuam
 *    obrigatórias na jornada e podem alimentar análises internas, mas não
 *    classificam nem alteram as notas deste documento.
 *
 * 3. **Cargo é fronteira de análise.** Médias de funções diferentes podem
 *    esconder tanto um avanço forte quanto uma necessidade específica. Por
 *    isso o PDF recebe do agregador recortes independentes e nunca recompõe uma
 *    média cruzando cargos.
 *
 * ⚠️ NENHUM GLIFO FORA DO SUBSET DA INTER (sem → ✓ ● ★ ≥). O guard
 * `tests/unit/pdf-glifos-guard.test.ts` falha se um entrar; o efeito no papel é
 * um buraco em branco no lugar exato do sentido da frase.
 */
import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Svg, Polygon, Line, Circle } from '@react-pdf/renderer';
import { colors, pageStyles } from './styles';
import PdfReportCover, { ReportSectionTitle } from './PdfReportCover';
import { getReportCoverBgBase64 } from '@/lib/pdf-assets';
import { nivelDaNota, rotuloNivel } from '@/lib/nivel-regua';
import { descritorParaHumano } from '@/lib/descritor-humano';
import {
  arredondarParaPdf, compararNomes, dataNoPdf, idiomaDoPdf, numeroNoPdf, tradutorDoPdf, type PdfT,
} from '@/lib/pdf-i18n';
import { CARGO_NAO_INFORMADO, semDadoNoPdf } from '@/lib/relatorios/rotulos-sem-dado';
import type {
  EvolucaoCentro, EvolucaoAgregado, EvolucaoPessoa, EvolucaoRecorteCargo,
} from '@/lib/relatorios/evolucao-center';

const s = StyleSheet.create({
  section: { marginBottom: 16 },
  p: { fontFamily: 'NotoSans', fontSize: 9.5, color: colors.textSecondary, lineHeight: 1.55, marginBottom: 5 },
  pStrong: { fontFamily: 'NotoSans', fontSize: 9.5, color: colors.textPrimary, lineHeight: 1.55, marginBottom: 5 },
  h3: { fontFamily: 'NotoSans', fontSize: 10.5, fontWeight: 600, color: colors.navyLight, marginBottom: 6, marginTop: 10 },
  caption: { fontFamily: 'NotoSans', fontSize: 7.5, color: colors.textMuted, lineHeight: 1.4 },
  box: { backgroundColor: colors.gray100, borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, padding: 12, marginBottom: 10 },
  boxAccent: { backgroundColor: colors.perfilBg, borderWidth: 1, borderColor: colors.perfilBorder, borderRadius: 8, padding: 12, marginBottom: 10 },

  // Cartões factuais do panorama (sem classificação por evidência)
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
  compMetaLinha: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  compMeta: { fontFamily: 'NotoSans', fontSize: 8, color: colors.textMuted, flex: 1 },
  compDelta: { fontFamily: 'NotoSans', fontSize: 11, fontWeight: 700, width: 52, textAlign: 'right' },
  nivelMudou: { backgroundColor: '#DCFCE7', borderWidth: 0.5, borderColor: '#86EFAC', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  nivelMudouTexto: { fontFamily: 'NotoSans', fontSize: 6.5, fontWeight: 700, color: '#166534' },
  nivelManteve: { fontFamily: 'NotoSans', fontSize: 7, color: colors.textMuted, marginLeft: 8 },

  // Barras: escala fixa de 1 a 4 (o trilho é a régua inteira, então dois
  // relatórios diferentes são comparáveis a olho).
  trilho: { height: 9, backgroundColor: colors.gray200, borderRadius: 5, marginBottom: 3, position: 'relative', overflow: 'hidden' },
  barra: { height: 9, borderRadius: 5 },
  barraAntes: { backgroundColor: colors.gray400 },
  barraDepois: { backgroundColor: colors.cyan },
  corteNivel: { position: 'absolute', top: 0, bottom: 0, width: 0.75, backgroundColor: colors.white, opacity: 0.95 },
  faixas: { flexDirection: 'row', marginTop: 2 },
  faixa: { height: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: colors.gray300, backgroundColor: colors.gray100 },
  faixaConquistada: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  faixaTexto: { fontFamily: 'NotoSans', fontSize: 5.5, color: colors.textMuted },
  faixaTextoConquistada: { color: '#166534', fontWeight: 700 },
  legenda: { flexDirection: 'row', alignItems: 'center', marginTop: 1, marginBottom: 8 },
  legendaPonto: { width: 7, height: 7, borderRadius: 4, marginRight: 4 },
  legendaTexto: { fontFamily: 'NotoSans', fontSize: 7.5, color: colors.textMuted, marginRight: 12 },

  // O cargo funciona como cabeçalho de recorte, não como filtro escondido.
  cargoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: colors.gray200 },
  cargoEyebrow: { fontFamily: 'NotoSans', fontSize: 6.5, fontWeight: 700, color: colors.nivelCyan, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  cargoNome: { fontFamily: 'NotoSans', fontSize: 12, fontWeight: 700, color: colors.navyLight },
  cargoContagem: { fontFamily: 'NotoSans', fontSize: 7.5, color: colors.textMuted, textAlign: 'right' },
  cargoResumo: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  cargoResumoItem: { width: '48%', borderWidth: 1, borderColor: colors.gray200, borderRadius: 7, padding: 9, marginRight: 8, marginBottom: 8, backgroundColor: colors.gray100 },
  cargoResumoNome: { fontFamily: 'NotoSans', fontSize: 9, fontWeight: 700, color: colors.navyLight, marginBottom: 2 },
  cargoResumoMeta: { fontFamily: 'NotoSans', fontSize: 7, color: colors.textMuted },

  // Radar por competência. Os eixos recebem números e a descrição completa
  // fica ao lado: rótulos longos não colidem com o desenho nem ficam ilegíveis.
  radarCard: { borderWidth: 1, borderColor: colors.gray200, borderRadius: 8, padding: 11, marginBottom: 10, backgroundColor: colors.white },
  radarTitle: { fontFamily: 'NotoSans', fontSize: 10.5, fontWeight: 700, color: colors.navyLight, marginBottom: 3 },
  radarSub: { fontFamily: 'NotoSans', fontSize: 7.5, color: colors.textMuted, marginBottom: 7 },
  radarBody: { flexDirection: 'row', alignItems: 'center' },
  radarGrafico: { width: 190, alignItems: 'center', justifyContent: 'center' },
  radarLista: { flex: 1, paddingLeft: 10 },
  radarLinha: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  radarNumero: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', marginRight: 5, marginTop: 1 },
  radarNumeroTexto: { fontFamily: 'NotoSans', fontSize: 6.5, fontWeight: 700, color: colors.white },
  radarDescritor: { fontFamily: 'NotoSans', fontSize: 7.5, fontWeight: 600, color: colors.textPrimary, lineHeight: 1.25 },
  radarValores: { fontFamily: 'NotoSans', fontSize: 6.7, color: colors.textMuted, lineHeight: 1.25 },
  radarLegenda: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  radarAviso: { fontFamily: 'NotoSans', fontSize: 8, color: colors.textMuted, lineHeight: 1.4, paddingVertical: 28, textAlign: 'center' },

  // Tabelas
  th: { flexDirection: 'row', backgroundColor: colors.navy, paddingVertical: 5, paddingHorizontal: 8, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  thText: { fontFamily: 'NotoSans', fontSize: 7, fontWeight: 700, color: colors.white, textTransform: 'uppercase', letterSpacing: 0.4 },
  tr: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: colors.gray200 },
  trAlt: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: colors.gray200, backgroundColor: colors.gray100 },
  td: { fontFamily: 'NotoSans', fontSize: 8, color: colors.textSecondary },
  tdStrong: { fontFamily: 'NotoSans', fontSize: 8, color: colors.textPrimary, fontWeight: 600 },

  vazio: { backgroundColor: colors.melhorarBg, borderWidth: 1, borderColor: colors.melhorarBorder, borderRadius: 8, padding: 14 },
});

const TOM_METRICA = {
  ciano: { fg: colors.navyLight, bg: colors.perfilBg, border: colors.perfilBorder },
  verde: { fg: colors.greenText, bg: colors.fezBemBg, border: colors.fezBemBorder },
  neutro: { fg: colors.textPrimary, bg: colors.gray100, border: colors.gray200 },
};

/**
 * Uma casa decimal, com arredondamento convencional; o dado-fonte segue em 2 casas.
 * O separador decimal é o do idioma de quem lê (3,5 em pt e es; 3.5 em en); sem
 * idioma, pt-BR, como sempre.
 */
export function formatarNumeroRelatorio(v: number, casas = 1, locale?: string | null): string {
  return numeroNoPdf(v, locale, casas);
}
export function comSinal(v: number, locale?: string | null): string {
  const avanco = arredondarParaPdf(Math.max(0, Number(v) || 0), 1);
  return `${avanco > 0 ? '+' : ''}${numeroNoPdf(avanco, locale, 1)}`;
}
/** Posição de uma nota no trilho de 1 a 4, em porcentagem. */
export function pct(nota: number): string {
  const n = Math.max(1, Math.min(4, nota || 1));
  return `${Math.round(((n - 1) / 3) * 100)}%`;
}
/**
 * Os níveis de um agregado ou de uma pessoa, em texto: "N2 para N3" quando subiu e
 * "N3" quando manteve. O papel mostra NÍVEL e avanço, nunca a média das notas
 * (R-32, 04/10/2026: o PDF imprimia "de 2,1 para 2,5" por competência e por
 * comportamento, e as colunas Antes e Depois com a nota de cada pessoa nomeada).
 */
export function textoDosNiveis(pre: number, pos: number, t: PdfT = tradutorDoPdf()): string {
  return pos > pre
    ? t('evolucao.levelUp', { from: rotuloNivel(pre, { forma: 'curto' }), to: rotuloNivel(pos, { forma: 'curto' }) })
    : rotuloNivel(pos, { forma: 'curto' });
}

function PageFooter({ t }: { t: PdfT }) {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>{t('evolucao.footer')}</Text>
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

function CabecalhoCargo({ recorte, t }: { recorte: EvolucaoRecorteCargo; t: PdfT }) {
  return (
    <View style={s.cargoHead} wrap={false}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.cargoEyebrow}>{t('evolucao.role')}</Text>
        <Text style={s.cargoNome}>{semDadoNoPdf(recorte.cargo, t)}</Text>
      </View>
      <Text style={s.cargoContagem}>
        {t('evolucao.peopleMeasured', { n: recorte.pessoasMedidas })}
      </Text>
    </View>
  );
}

function CortesDaRegua() {
  return (
    <>
      <View style={{ ...s.corteNivel, left: '33.33%' }} />
      <View style={{ ...s.corteNivel, left: '66.67%' }} />
      <View style={{ ...s.corteNivel, left: '83.33%' }} />
    </>
  );
}

/**
 * Os segmentos respeitam o tamanho real de cada faixa na escala numérica.
 * O leitor vê só o nível; os cortes detalhados pertencem à régua do produto,
 * não a este resumo executivo.
 */
function FaixasDaRegua({ item }: { item: EvolucaoAgregado }) {
  const faixas = [
    { nivel: 1, width: '33.33%', label: rotuloNivel(1, { forma: 'curto' }) },
    { nivel: 2, width: '33.34%', label: rotuloNivel(2, { forma: 'curto' }) },
    { nivel: 3, width: '16.66%', label: rotuloNivel(3, { forma: 'curto' }) },
    { nivel: 4, width: '16.67%', label: rotuloNivel(4, { forma: 'curto' }) },
  ];
  return (
    <View style={s.faixas}>
      {faixas.map((faixa) => {
        const conquistada = faixa.nivel > item.nivelPre && faixa.nivel <= item.nivelPos;
        return (
          <View key={faixa.nivel} style={{ ...s.faixa, ...(conquistada ? s.faixaConquistada : {}), width: faixa.width }}>
            <Text style={{ ...s.faixaTexto, ...(conquistada ? s.faixaTextoConquistada : {}) }}>{faixa.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * A barra de uma competência. Duas barras no mesmo trilho de 1 a 4: a de partida
 * em cinza, a de chegada em cyan. O trilho é a régua inteira de propósito — barra
 * normalizada pelo próprio valor faz um avanço de 0,1 parecer enorme.
 */
function BarraEvolucao({ item, t, idioma }: { item: EvolucaoAgregado; t: PdfT; idioma: string }) {
  const positivo = item.delta > 0;
  const mudouNivel = item.nivelPos > item.nivelPre;
  return (
    <View style={s.compRow} wrap={false}>
      <View style={s.compHead}>
        <Text style={s.compName}>{item.chave}</Text>
        <Text style={{ ...s.compDelta, color: positivo ? colors.green : colors.textMuted }}>{comSinal(item.delta, idioma)}</Text>
      </View>
      <View style={s.compMetaLinha}>
        <Text style={s.compMeta}>
          {item.competencia ? `${item.competencia}  ·  ` : ''}
          {t('evolucao.peopleCount', { n: item.n })}
        </Text>
        {mudouNivel ? (
          <View style={s.nivelMudou}>
            <Text style={s.nivelMudouTexto}>{t('evolucao.levelChange', { from: rotuloNivel(item.nivelPre, { forma: 'curto' }), to: rotuloNivel(item.nivelPos, { forma: 'curto' }) })}</Text>
          </View>
        ) : (
          <Text style={s.nivelManteve}>{t('evolucao.levelCurrent', { level: rotuloNivel(item.nivelPos, { forma: 'curto' }) })}</Text>
        )}
      </View>

      <View style={s.trilho}>
        <View style={{ ...s.barra, ...s.barraAntes, width: pct(item.mediaPre) }} />
        <CortesDaRegua />
      </View>
      <View style={s.trilho}>
        <View style={{ ...s.barra, ...s.barraDepois, width: pct(item.mediaPos) }} />
        <CortesDaRegua />
      </View>
      <FaixasDaRegua item={item} />
    </View>
  );
}

function CartaoMetrica({
  n, label, hint, tom, ultimo,
}: {
  n: number;
  label: string;
  hint: string;
  tom: keyof typeof TOM_METRICA;
  ultimo?: boolean;
}) {
  const t = TOM_METRICA[tom];
  return (
    <View style={{ ...(ultimo ? s.cardLast : s.card), backgroundColor: t.bg, borderColor: t.border }}>
      <Text style={{ ...s.cardNum, color: t.fg }}>{n}</Text>
      <Text style={{ ...s.cardLabel, color: t.fg }}>{label}</Text>
      <Text style={s.cardHint}>{hint}</Text>
    </View>
  );
}

/**
 * Evita que a tabela nominal deixe uma ou duas linhas órfãs numa página nova.
 * Relatórios DUO costumam dobrar a quantidade de linhas porque cada pessoa
 * aparece uma vez por competência; as páginas ficam equilibradas entre si.
 */
export function paginarPessoas(pessoas: EvolucaoPessoa[], maximoPorPagina = 18): EvolucaoPessoa[][] {
  if (!pessoas.length) return [];
  const paginas = Math.ceil(pessoas.length / maximoPorPagina);
  const porPagina = Math.ceil(pessoas.length / paginas);
  const grupos: EvolucaoPessoa[][] = [];
  for (let i = 0; i < pessoas.length; i += porPagina) grupos.push(pessoas.slice(i, i + porPagina));
  return grupos;
}

export function paginarComportamentos(
  comportamentos: EvolucaoAgregado[],
  maximoPorPagina = 22,
): EvolucaoAgregado[][] {
  const paginas: EvolucaoAgregado[][] = [];
  for (let i = 0; i < comportamentos.length; i += maximoPorPagina) {
    paginas.push(comportamentos.slice(i, i + maximoPorPagina));
  }
  return paginas;
}

/**
 * Agrupa recortes pequenos na mesma página de barras sem cruzar suas médias.
 * Uma unidade representa o cabeçalho do cargo ou uma competência exibida.
 */
export function paginarCargosNoAvanco(
  recortes: EvolucaoRecorteCargo[],
  maximoDeUnidades = 7,
): EvolucaoRecorteCargo[][] {
  const paginas: EvolucaoRecorteCargo[][] = [];
  let atual: EvolucaoRecorteCargo[] = [];
  let unidades = 0;
  for (const recorte of recortes) {
    const peso = 1 + Math.min(6, recorte.porCompetencia.length);
    if (atual.length && unidades + peso > maximoDeUnidades) {
      paginas.push(atual);
      atual = [];
      unidades = 0;
    }
    atual.push(recorte);
    unidades += peso;
  }
  if (atual.length) paginas.push(atual);
  return paginas;
}

export type CompetenciaRadar = {
  competencia: EvolucaoAgregado;
  descritores: EvolucaoAgregado[];
};

/**
 * Mantém a fronteira semântica do relatório: cada radar recebe somente os
 * descritores da própria competência. A ordem alfabética torna os eixos
 * estáveis mesmo quando o ranking de avanço muda entre relatórios.
 */
export function montarRadaresPorCompetencia(
  porCompetencia: EvolucaoAgregado[],
  porDescritor: EvolucaoAgregado[],
  locale: string | null = 'pt-BR',
): CompetenciaRadar[] {
  return porCompetencia.map((competencia) => ({
    competencia,
    descritores: porDescritor
      .filter((descritor) => descritor.competencia === competencia.chave)
      .slice()
      .sort((a, b) => compararNomes(descritorParaHumano(a.chave), descritorParaHumano(b.chave), locale)),
  })).filter((item) => item.descritores.length > 0);
}

export function paginarRadares(radares: CompetenciaRadar[], maximoPorPagina = 2): CompetenciaRadar[][] {
  const paginas: CompetenciaRadar[][] = [];
  for (let i = 0; i < radares.length; i += maximoPorPagina) paginas.push(radares.slice(i, i + maximoPorPagina));
  return paginas;
}

function pontoRadar(valor: number, indice: number, total: number, centro = 90, raio = 68): [number, number] {
  const nota = Math.max(0, Math.min(4, Number(valor) || 0));
  const angulo = -Math.PI / 2 + (indice / total) * Math.PI * 2;
  const distancia = (nota / 4) * raio;
  return [centro + Math.cos(angulo) * distancia, centro + Math.sin(angulo) * distancia];
}

/** Coordenadas SVG de notas na régua 0 a 4, exportadas para o guard geométrico. */
export function pontosRadar(valores: number[], centro = 90, raio = 68): string {
  return valores.map((valor, indice) => pontoRadar(valor, indice, valores.length, centro, raio).join(',')).join(' ');
}

function RadarCompetencia({ item, t, idioma }: { item: CompetenciaRadar; t: PdfT; idioma: string }) {
  const { competencia, descritores } = item;
  const total = descritores.length;
  const valoresAntes = descritores.map((descritor) => descritor.mediaPre);
  const valoresDepois = descritores.map((descritor) => descritor.mediaPos);
  const niveis = [1, 2, 3, 4];

  return (
    <View style={s.radarCard} wrap={false}>
      <Text style={s.radarTitle}>{competencia.chave}</Text>
      <Text style={s.radarSub}>
        {`${t('evolucao.peopleCount', { n: competencia.n })} · ${textoDosNiveis(competencia.nivelPre, competencia.nivelPos, t)} · ${t('evolucao.progressValue', { value: comSinal(competencia.delta, idioma) })}`}
      </Text>
      <View style={s.radarLegenda}>
        <View style={{ ...s.legendaPonto, backgroundColor: colors.gray400 }} />
        <Text style={s.legendaTexto}>{t('evolucao.initialDiagnosis')}</Text>
        <View style={{ ...s.legendaPonto, backgroundColor: colors.cyan }} />
        <Text style={s.legendaTexto}>{t('evolucao.journeyClosing')}</Text>
      </View>

      {total >= 3 ? (
        <View style={s.radarBody}>
          <View style={s.radarGrafico}>
            <Svg width={180} height={180} viewBox="0 0 180 180">
              {niveis.map((nivel) => (
                <Polygon
                  key={`nivel-${nivel}`}
                  points={pontosRadar(Array(total).fill(nivel))}
                  stroke={nivel === 4 ? colors.gray300 : colors.gray200}
                  strokeWidth={nivel === 4 ? 0.9 : 0.55}
                  fill="none"
                />
              ))}
              {descritores.map((_, indice) => {
                const [x, y] = pontoRadar(4, indice, total);
                return <Line key={`eixo-${indice}`} x1={90} y1={90} x2={x} y2={y} stroke={colors.gray200} strokeWidth={0.55} />;
              })}
              <Polygon points={pontosRadar(valoresAntes)} stroke={colors.gray500} strokeWidth={1.25} fill={colors.gray400} fillOpacity={0.12} />
              <Polygon points={pontosRadar(valoresDepois)} stroke={colors.cyan} strokeWidth={1.7} fill={colors.cyan} fillOpacity={0.18} />
              {valoresAntes.map((valor, indice) => {
                const [x, y] = pontoRadar(valor, indice, total);
                return <Circle key={`antes-${indice}`} cx={x} cy={y} r={1.8} fill={colors.gray500} />;
              })}
              {valoresDepois.map((valor, indice) => {
                const [x, y] = pontoRadar(valor, indice, total);
                return <Circle key={`depois-${indice}`} cx={x} cy={y} r={2.1} fill={colors.cyan} />;
              })}
              {descritores.map((_, indice) => {
                const [x, y] = pontoRadar(4, indice, total, 90, 80);
                return (
                  <React.Fragment key={`rotulo-${indice}`}>
                    <Circle cx={x} cy={y} r={6.5} fill={colors.navy} />
                    <Text x={x} y={y + 2.2} style={{ fontFamily: 'NotoSans', fontSize: 6.5, fontWeight: 700 }} fill={colors.white} textAnchor="middle">
                      {indice + 1}
                    </Text>
                  </React.Fragment>
                );
              })}
              {niveis.map((nivel) => {
                const y = 90 - (nivel / 4) * 68;
                return <Text key={`escala-${nivel}`} x={94} y={y + 2} style={{ fontFamily: 'NotoSans', fontSize: 5.2 }} fill={colors.textMuted}>{nivel}</Text>;
              })}
            </Svg>
          </View>
          <View style={s.radarLista}>
            {descritores.map((eixo, indice) => (
              <View key={`${competencia.chave}::${eixo.chave}`} style={s.radarLinha}>
                <View style={s.radarNumero}><Text style={s.radarNumeroTexto}>{indice + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.radarDescritor}>{descritorParaHumano(eixo.chave)}</Text>
                  <Text style={s.radarValores}>
                    {`${textoDosNiveis(eixo.nivelPre, eixo.nivelPos, t)} · ${t('evolucao.progressValue', { value: comSinal(eixo.delta, idioma) })}`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View>
          <Text style={s.radarAviso}>
            {t('evolucao.radarFewDescriptors')}
          </Text>
          {descritores.map((eixo, indice) => (
            <View key={`${competencia.chave}::${eixo.chave}`} style={s.radarLinha}>
              <View style={s.radarNumero}><Text style={s.radarNumeroTexto}>{indice + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.radarDescritor}>{descritorParaHumano(eixo.chave)}</Text>
                <Text style={s.radarValores}>{`${textoDosNiveis(eixo.nivelPre, eixo.nivelPos, t)} · ${t('evolucao.progressValue', { value: comSinal(eixo.delta, idioma) })}`}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** N4 é o único patamar habilitado a multiplicar a prática para o grupo. */
export function selecionarMultiplicadores(pessoas: EvolucaoPessoa[], limite = 3): EvolucaoPessoa[] {
  return pessoas.filter((p) => nivelDaNota(p.mediaPos) === 4).slice(0, limite);
}

function TabelaPessoas({ pessoas, t, idioma }: { pessoas: EvolucaoPessoa[]; t: PdfT; idioma: string }) {
  return (
    <>
      <View style={s.th}>
        <Text style={{ ...s.thText, flex: 2.6, paddingRight: 7 }}>{t('evolucao.person')}</Text>
        <Text style={{ ...s.thText, flex: 1.5, paddingRight: 7 }}>{t('evolucao.role')}</Text>
        <Text style={{ ...s.thText, flex: 2.3, paddingRight: 7 }}>{t('evolucao.competency')}</Text>
        <Text style={{ ...s.thText, width: 50, textAlign: 'center' }}>{t('evolucao.start')}</Text>
        <Text style={{ ...s.thText, width: 50, textAlign: 'center' }}>{t('evolucao.arrival')}</Text>
        <Text style={{ ...s.thText, width: 46, textAlign: 'center' }}>{t('evolucao.progress')}</Text>
      </View>
      {pessoas.map((p, i) => (
        <View key={`${p.colaboradorId}::${p.competencia}::${p.concluidoEm || i}`} style={i % 2 ? s.trAlt : s.tr} wrap={false}>
          <Text style={{ ...s.tdStrong, flex: 2.6, paddingRight: 7 }}>{p.nome}</Text>
          <Text style={{ ...s.td, flex: 1.5, paddingRight: 7 }}>{semDadoNoPdf(p.cargo, t) || '\u2014'}</Text>
          <Text style={{ ...s.td, flex: 2.3, fontSize: 7.5, paddingRight: 7 }}>{p.competencia || '—'}</Text>
          <Text style={{ ...s.td, width: 50, textAlign: 'center' }}>{rotuloNivel(p.nivelPre, { forma: 'curto' })}</Text>
          <Text style={{ ...s.td, width: 50, textAlign: 'center' }}>{rotuloNivel(p.nivelPos, { forma: 'curto' })}</Text>
          <Text style={{ ...s.tdStrong, width: 46, textAlign: 'center', color: p.delta > 0 ? colors.green : colors.textMuted }}>
            {comSinal(p.delta, idioma)}
          </Text>
        </View>
      ))}
    </>
  );
}

function TabelaComportamentos({ comportamentos, t, idioma }: { comportamentos: EvolucaoAgregado[]; t: PdfT; idioma: string }) {
  return (
    <>
      <View style={s.th}>
        <Text style={{ ...s.thText, flex: 3, paddingRight: 8 }}>{t('evolucao.behavior')}</Text>
        <Text style={{ ...s.thText, flex: 2.4 }}>{t('evolucao.competency')}</Text>
        <Text style={{ ...s.thText, width: 46, textAlign: 'center' }}>{t('evolucao.people')}</Text>
        <Text style={{ ...s.thText, width: 46, textAlign: 'center' }}>{t('evolucao.start')}</Text>
        <Text style={{ ...s.thText, width: 46, textAlign: 'center' }}>{t('evolucao.arrival')}</Text>
        <Text style={{ ...s.thText, width: 40, textAlign: 'center' }}>{t('evolucao.progress')}</Text>
      </View>
      {comportamentos.map((d, i) => (
        <View key={`${d.competencia} :: ${d.chave}`} style={i % 2 ? s.trAlt : s.tr} wrap={false}>
          <Text style={{ ...s.tdStrong, flex: 3, paddingRight: 8 }}>{descritorParaHumano(d.chave)}</Text>
          <Text style={{ ...s.td, flex: 2.4, fontSize: 7.5 }}>{d.competencia || '—'}</Text>
          <Text style={{ ...s.td, width: 46, textAlign: 'center' }}>{d.n}</Text>
          <Text style={{ ...s.td, width: 46, textAlign: 'center' }}>{rotuloNivel(d.nivelPre, { forma: 'curto' })}</Text>
          <Text style={{ ...s.td, width: 46, textAlign: 'center' }}>{rotuloNivel(d.nivelPos, { forma: 'curto' })}</Text>
          <Text style={{ ...s.tdStrong, width: 40, textAlign: 'center', color: d.delta > 0 ? colors.green : colors.textMuted }}>
            {comSinal(d.delta, idioma)}
          </Text>
        </View>
      ))}
    </>
  );
}

export default function RelatorioEvolucaoPDF({
  data, empresaNome, logoBase64, mostrarVertho = true, recorte, locale,
}: {
  data: EvolucaoCentro;
  empresaNome?: string;
  logoBase64?: string;
  mostrarVertho?: boolean;
  /** Nome da turma/recorte, quando o RH filtrou a central antes de exportar. */
  recorte?: string | null;
  /** Idioma do texto fixo, dos números e das datas do papel: o de quem baixa (`lib/pdf-locale.ts`). Sem ele, pt-BR. */
  locale?: string | null;
}) {
  const t = tradutorDoPdf(locale);
  const idioma = idiomaDoPdf(locale);
  const { cobertura, resumo, porCompetencia, porDescritor, pessoas, proximasAcoes } = data;
  const label = t('evolucao.headerLabel');
  const ultimaMedicao = pessoas.map((p) => p.concluidoEm).filter(Boolean).sort().reverse()[0] || null;
  // Compatibilidade com payloads materializados antes da separação por cargo.
  // A produção já recebe `porCargo` do agregador; o fallback evita que um PDF
  // histórico deixe de abrir e o identifica como um único recorte explícito.
  const recortesCargo: EvolucaoRecorteCargo[] = data.porCargo?.length ? data.porCargo : [{
    cargo: recorte || CARGO_NAO_INFORMADO,
    pessoasMedidas: cobertura.medidos,
    porCompetencia,
    porDescritor,
    pessoas,
    proximasAcoes,
  }];

  const capa = (
    <PdfReportCover
      bgBase64={getReportCoverBgBase64()}
      logoBase64={logoBase64}
      overline={t('evolucao.coverOverline')}
      titulo={[t('evolucao.coverTitle1'), t('evolucao.coverTitle2')]}
      nome={empresaNome}
      cargo={recorte || undefined}
      tagline={t('evolucao.tagline')}
      mostrarVertho={mostrarVertho}
      locale={idioma}
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
          <ReportSectionTitle>{t('evolucao.emptyTitle')}</ReportSectionTitle>
          <View style={s.vazio}>
            <Text style={s.pStrong}>
              {data.indisponivel ? t('evolucao.emptyUnavailable') : t('evolucao.emptyNotYet')}
            </Text>
            {!data.indisponivel && (
              <Text style={s.p}>
                {t('evolucao.emptyCounts', { participants: cobertura.participantes, inJourney: cobertura.emJornada, closed: cobertura.medidos })}
              </Text>
            )}
          </View>
          <PageFooter t={t} />
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
          <ReportSectionTitle>{t('evolucao.whereJourneyArrived')}</ReportSectionTitle>
          <Text style={s.pStrong}>
            {t('evolucao.coverageLine', { n: cobertura.medidos, hasTotal: cobertura.participantes ? 'yes' : 'no', total: cobertura.participantes, percent: `${cobertura.percentual}%` })}
            {cobertura.emJornada ? ` ${t('evolucao.othersInJourney', { n: cobertura.emJornada })}` : ''}
          </Text>
          <Text style={s.p}>
            {t('evolucao.readingFrom', { assessments: resumo.descritoresMedidos, behaviors: porDescritor.length, hasDate: ultimaMedicao ? 'yes' : 'no', date: dataNoPdf(ultimaMedicao, idioma) })}
            {` ${t('evolucao.averageProgress', { value: comSinal(resumo.deltaMedio, idioma) })}`}
          </Text>
          <View style={s.boxAccent} wrap={false}>
            <Text style={s.pStrong}>{t('evolucao.readingRule')}</Text>
            <Text style={s.p}>
              {t('evolucao.readingRuleText')}
            </Text>
          </View>
        </View>

        <View style={s.section}>
          <View style={s.cards}>
            <CartaoMetrica
              n={cobertura.medidos} label={t('evolucao.cardPeopleMeasured')} tom="ciano"
              hint={t('evolucao.cardPeopleMeasuredHint')}
            />
            <CartaoMetrica
              n={recortesCargo.length} label={t('evolucao.cardRoles')} tom="neutro"
              hint={t('evolucao.cardRolesHint')}
            />
            <CartaoMetrica
              n={porCompetencia.length} label={t('evolucao.cardCompetencies')} tom="verde" ultimo
              hint={t('evolucao.cardCompetenciesHint')}
            />
          </View>
        </View>

        <View style={s.section}>
          <ReportSectionTitle>{t('evolucao.cutsTitle')}</ReportSectionTitle>
          <Text style={s.p}>
            {t('evolucao.cutsIntro', { n: recortesCargo.length })}
          </Text>
          <View style={s.cargoResumo}>
            {recortesCargo.map((cargo) => (
              <View key={cargo.cargo} style={s.cargoResumoItem} wrap={false}>
                <Text style={s.cargoResumoNome}>{semDadoNoPdf(cargo.cargo, t)}</Text>
                <Text style={s.cargoResumoMeta}>
                  {`${t('evolucao.peopleMeasured', { n: cargo.pessoasMedidas })} · ${t('evolucao.competencyCount', { n: cargo.porCompetencia.length })}`}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <PageFooter t={t} />
      </Page>

      {/* ───────────────── 2. Avanço por cargo ───────────────── */}
      {paginarCargosNoAvanco(recortesCargo).map((grupoCargos, pagina) => (
        <Page key={`avanco-${pagina}`} size="A4" style={pageStyles.page} wrap={false}>
          <PageHeader logoBase64={logoBase64} label={label} />
          <View style={s.section}>
            <ReportSectionTitle>{pagina === 0 ? t('evolucao.mostAdvanced') : t('evolucao.mostAdvancedContinued')}</ReportSectionTitle>
            <View style={s.legenda}>
              <View style={{ ...s.legendaPonto, backgroundColor: colors.gray400 }} />
              <Text style={s.legendaTexto}>{t('evolucao.atInitialDiagnosis')}</Text>
              <View style={{ ...s.legendaPonto, backgroundColor: colors.cyan }} />
              <Text style={s.legendaTexto}>{t('evolucao.atJourneyClosing')}</Text>
            </View>
            {grupoCargos.map((cargo) => (
              <View key={cargo.cargo} style={{ marginBottom: 9 }} wrap={false}>
                <CabecalhoCargo recorte={cargo} t={t} />
                {cargo.porCompetencia.slice(0, 6).map((competencia) => (
                  <BarraEvolucao key={competencia.chave} item={competencia} t={t} idioma={idioma} />
                ))}
              </View>
            ))}
          </View>
          <PageFooter t={t} />
        </Page>
      ))}

      {/* ───────────────── 3. Radares por cargo e competência ───────────────── */}
      {recortesCargo.flatMap((cargo) => {
        const paginas = paginarRadares(montarRadaresPorCompetencia(cargo.porCompetencia, cargo.porDescritor, idioma));
        return paginas.map((grupo, pagina) => (
          <Page key={`radares-${cargo.cargo}-${pagina}`} size="A4" style={pageStyles.page} wrap={false}>
            <PageHeader logoBase64={logoBase64} label={label} />
            <View style={s.section}>
              <ReportSectionTitle>{pagina === 0 ? t('evolucao.radarsTitle') : t('evolucao.radarsTitleContinued')}</ReportSectionTitle>
              <CabecalhoCargo recorte={cargo} t={t} />
              {pagina === 0 && (
                <Text style={s.p}>
                  {t('evolucao.radarsIntro')}
                </Text>
              )}
              {grupo.map((item) => <RadarCompetencia key={item.competencia.chave} item={item} t={t} idioma={idioma} />)}
            </View>
            <PageFooter t={t} />
          </Page>
        ));
      })}

      {/* ───────────────── 4. Comportamentos por cargo ───────────────── */}
      {recortesCargo.flatMap((cargo) => {
        const paginas = paginarComportamentos(cargo.porDescritor);
        return paginas.map((grupo, pagina) => (
          <Page key={`comportamentos-${cargo.cargo}-${pagina}`} size="A4" style={pageStyles.page} wrap={false}>
            <PageHeader logoBase64={logoBase64} label={label} />
            <View style={s.section}>
              <ReportSectionTitle>{pagina === 0 ? t('evolucao.behaviorByBehavior') : t('evolucao.behaviorsContinued')}</ReportSectionTitle>
              <CabecalhoCargo recorte={cargo} t={t} />
              {pagina === 0 && (
                <Text style={s.p}>
                  {t('evolucao.behaviorsIntro')}
                </Text>
              )}
              <TabelaComportamentos comportamentos={grupo} t={t} idioma={idioma} />
            </View>
            <PageFooter t={t} />
          </Page>
        ));
      })}

      {/* ───────────────── 5. Pessoas por cargo ───────────────── */}
      {recortesCargo.flatMap((cargo) => {
        const paginas = paginarPessoas(cargo.pessoas);
        return paginas.map((grupo, pagina) => (
          <Page key={`pessoas-${cargo.cargo}-${pagina}`} size="A4" style={pageStyles.page} wrap={false}>
            <PageHeader logoBase64={logoBase64} label={label} />
            <View style={s.section}>
              <ReportSectionTitle>{pagina === 0 ? t('evolucao.personByPerson') : t('evolucao.personByPersonContinued')}</ReportSectionTitle>
              <CabecalhoCargo recorte={cargo} t={t} />
              {pagina === 0 && (
                <Text style={s.p}>
                  {t('evolucao.peopleIntro')}
                </Text>
              )}
              <TabelaPessoas pessoas={grupo} t={t} idioma={idioma} />
            </View>
            <PageFooter t={t} />
          </Page>
        ));
      })}

      {/* ───────────────── 6. Próximos passos por cargo ───────────────── */}
      {recortesCargo.map((cargo) => {
        const multiplicadores = selecionarMultiplicadores(cargo.pessoas);
        return (
          <Page key={`proximos-${cargo.cargo}`} size="A4" style={pageStyles.page} wrap>
            <PageHeader logoBase64={logoBase64} label={label} />
            <View style={s.section}>
              <ReportSectionTitle>{t('evolucao.nextSteps')}</ReportSectionTitle>
              <CabecalhoCargo recorte={cargo} t={t} />
            </View>

            {cargo.proximasAcoes.proximoCiclo.length > 0 && (
              <View style={s.section}>
                <Text style={s.h3}>{t('evolucao.nextJourneyCandidates')}</Text>
                <View style={s.boxAccent}>
                  <Text style={s.p}>
                    {t('evolucao.nextJourneyCandidatesText')}
                  </Text>
                  {cargo.proximasAcoes.proximoCiclo.map((d) => (
                    <Text key={d.chave} style={s.pStrong}>
                      {`• ${d.chave}: ${t('evolucao.peopleCount', { n: d.n })}, ${t('evolucao.progressOf', { value: comSinal(d.delta, idioma) })}`}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {cargo.proximasAcoes.precisamApoio.length > 0 && (
              <View style={s.section}>
                <Text style={s.h3}>{t('evolucao.conversationsFirst')}</Text>
                <View style={s.box}>
                  <Text style={s.p}>
                    {t('evolucao.conversationsFirstText', { zero: numeroNoPdf(0, idioma, 1) })}
                  </Text>
                  {cargo.proximasAcoes.precisamApoio.slice(0, 6).map((p, i) => (
                    <Text key={`${p.colaboradorId}::${p.competencia}::${i}`} style={s.pStrong}>
                      {`• ${p.nome}`}
                      {p.competencia ? ` · ${p.competencia}` : ''}
                      {p.proximoPasso ? `. ${t('evolucao.suggestedNextStep', { step: p.proximoPasso })}` : ''}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {multiplicadores.length > 0 && (
              <View style={s.section}>
                <Text style={s.h3}>{t('evolucao.whoCanMultiply')}</Text>
                <View style={s.box}>
                  <Text style={s.p}>
                    {t('evolucao.whoCanMultiplyText')}
                  </Text>
                  {multiplicadores.map((p, i) => (
                    <View key={`${p.colaboradorId}::${p.competencia}::${i}`} style={{ marginBottom: 6 }}>
                      <Text style={s.pStrong}>
                        {`• ${p.nome}: ${t('evolucao.levelFourIn', { competency: p.competencia || t('evolucao.journeyCompetency') })}, ${t('evolucao.progressOf', { value: comSinal(p.delta, idioma) })}`}
                      </Text>
                      {p.insight ? <Text style={{ ...s.caption, marginLeft: 10 }}>{p.insight}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <PageFooter t={t} />
          </Page>
        );
      })}
    </Document>
  );
}
