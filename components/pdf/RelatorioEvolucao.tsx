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
import { COR_VEREDITO_PAPEL } from '@/lib/season-engine/convergencia-cores';
import { DICA_VEREDITO } from '@/lib/season-engine/convergencia-dicas';
import { CONVERGENCIA, rotuloConvergencia } from '@/lib/season-engine/convergencia';
import { nivelDaNota } from '@/lib/nivel-regua';
import { descritorParaHumano } from '@/lib/descritor-humano';
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

  // Pílula de veredito
  pill: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 7, alignSelf: 'flex-start' },
  pillText: { fontFamily: 'NotoSans', fontSize: 6.5, fontWeight: 600 },

  vazio: { backgroundColor: colors.melhorarBg, borderWidth: 1, borderColor: colors.melhorarBorder, borderRadius: 8, padding: 14 },
});

/** Paleta por veredito. Uma só, para a pílula e o cartão não divergirem. */
const TINTA = {
  // Paleta única do veredito (`convergencia-cores`): confirmada verde escuro, parcial verde claro.
  [CONVERGENCIA.CONFIRMADA]: { fg: COR_VEREDITO_PAPEL[CONVERGENCIA.CONFIRMADA].fg, bg: COR_VEREDITO_PAPEL[CONVERGENCIA.CONFIRMADA].bg, border: COR_VEREDITO_PAPEL[CONVERGENCIA.CONFIRMADA].borda },
  [CONVERGENCIA.PARCIAL]: { fg: COR_VEREDITO_PAPEL[CONVERGENCIA.PARCIAL].fg, bg: COR_VEREDITO_PAPEL[CONVERGENCIA.PARCIAL].bg, border: COR_VEREDITO_PAPEL[CONVERGENCIA.PARCIAL].borda },
  [CONVERGENCIA.ESTAVEL]: { fg: '#78350F', bg: '#FFFBEB', border: '#FDE68A' },
  semVeredito: { fg: colors.gray600, bg: colors.gray100, border: colors.gray200 },
};

function num(v: number, casas = 2): string {
  return (v ?? 0).toFixed(casas).replace('.', ',');
}
export function comSinal(v: number): string {
  const avanco = Math.max(0, Number(v) || 0);
  return `${avanco > 0 ? '+' : ''}${num(avanco)}`;
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

function CabecalhoCargo({ recorte }: { recorte: EvolucaoRecorteCargo }) {
  return (
    <View style={s.cargoHead} wrap={false}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={s.cargoEyebrow}>Recorte por cargo</Text>
        <Text style={s.cargoNome}>{recorte.cargo}</Text>
      </View>
      <Text style={s.cargoContagem}>
        {`${recorte.pessoasMedidas} ${recorte.pessoasMedidas === 1 ? 'pessoa medida' : 'pessoas medidas'}`}
      </Text>
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
    { nivel: 1, width: '33.33%', label: 'N1' },
    { nivel: 2, width: '33.34%', label: 'N2' },
    { nivel: 3, width: '16.66%', label: 'N3' },
    { nivel: 4, width: '16.67%', label: 'N4' },
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
function BarraEvolucao({ item }: { item: EvolucaoAgregado }) {
  const positivo = item.delta > 0;
  const mudouNivel = item.nivelPos > item.nivelPre;
  return (
    <View style={s.compRow} wrap={false}>
      <View style={s.compHead}>
        <Text style={s.compName}>{item.chave}</Text>
        <Text style={{ ...s.compDelta, color: positivo ? colors.green : colors.textMuted }}>{comSinal(item.delta)}</Text>
      </View>
      <View style={s.compMetaLinha}>
        <Text style={s.compMeta}>
          {item.competencia ? `${item.competencia}  ·  ` : ''}
          {item.n === 1 ? '1 pessoa' : `${item.n} pessoas`}
          {'  ·  '}
          {`de ${num(item.mediaPre)} para ${num(item.mediaPos)}`}
        </Text>
        {mudouNivel ? (
          <View style={s.nivelMudou}>
            <Text style={s.nivelMudouTexto}>{`Mudança de nível · N${item.nivelPre} para N${item.nivelPos}`}</Text>
          </View>
        ) : (
          <Text style={s.nivelManteve}>{`Nível N${item.nivelPos}`}</Text>
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
      <Text style={s.cardHint}>{total ? `${share}% das competências medidas` : '—'}</Text>
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
): CompetenciaRadar[] {
  return porCompetencia.map((competencia) => ({
    competencia,
    descritores: porDescritor
      .filter((descritor) => descritor.competencia === competencia.chave)
      .slice()
      .sort((a, b) => descritorParaHumano(a.chave).localeCompare(descritorParaHumano(b.chave), 'pt-BR')),
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

function RadarCompetencia({ item }: { item: CompetenciaRadar }) {
  const { competencia, descritores } = item;
  const total = descritores.length;
  const valoresAntes = descritores.map((descritor) => descritor.mediaPre);
  const valoresDepois = descritores.map((descritor) => descritor.mediaPos);
  const niveis = [1, 2, 3, 4];

  return (
    <View style={s.radarCard} wrap={false}>
      <Text style={s.radarTitle}>{competencia.chave}</Text>
      <Text style={s.radarSub}>
        {`${competencia.n === 1 ? '1 pessoa' : `${competencia.n} pessoas`} · de ${num(competencia.mediaPre)} para ${num(competencia.mediaPos)} · avanço ${comSinal(competencia.delta)}`}
      </Text>
      <View style={s.radarLegenda}>
        <View style={{ ...s.legendaPonto, backgroundColor: colors.gray400 }} />
        <Text style={s.legendaTexto}>Diagnóstico inicial</Text>
        <View style={{ ...s.legendaPonto, backgroundColor: colors.cyan }} />
        <Text style={s.legendaTexto}>Fechamento da jornada</Text>
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
            {descritores.map((descritor, indice) => (
              <View key={`${competencia.chave}::${descritor.chave}`} style={s.radarLinha}>
                <View style={s.radarNumero}><Text style={s.radarNumeroTexto}>{indice + 1}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.radarDescritor}>{descritorParaHumano(descritor.chave)}</Text>
                  <Text style={s.radarValores}>
                    {`${num(descritor.mediaPre)} para ${num(descritor.mediaPos)} · avanço ${comSinal(descritor.delta)}`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View>
          <Text style={s.radarAviso}>
            {'Esta competência tem menos de três descritores medidos; por isso a evolução aparece em linhas, sem formar um polígono artificial.'}
          </Text>
          {descritores.map((descritor, indice) => (
            <View key={`${competencia.chave}::${descritor.chave}`} style={s.radarLinha}>
              <View style={s.radarNumero}><Text style={s.radarNumeroTexto}>{indice + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.radarDescritor}>{descritorParaHumano(descritor.chave)}</Text>
                <Text style={s.radarValores}>{`${num(descritor.mediaPre)} para ${num(descritor.mediaPos)} · avanço ${comSinal(descritor.delta)}`}</Text>
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

function TabelaPessoas({ pessoas }: { pessoas: EvolucaoPessoa[] }) {
  return (
    <>
      <View style={s.th}>
        <Text style={{ ...s.thText, flex: 2.4, paddingRight: 7 }}>Pessoa</Text>
        <Text style={{ ...s.thText, flex: 1.4, paddingRight: 7 }}>Cargo</Text>
        <Text style={{ ...s.thText, flex: 2, paddingRight: 7 }}>Competência</Text>
        <Text style={{ ...s.thText, width: 38, textAlign: 'center' }}>Antes</Text>
        <Text style={{ ...s.thText, width: 40, textAlign: 'center' }}>Depois</Text>
        <Text style={{ ...s.thText, width: 40, textAlign: 'center' }}>Avanço</Text>
        <Text style={{ ...s.thText, width: 88, paddingLeft: 6 }}>Leitura</Text>
      </View>
      {pessoas.map((p, i) => (
        <View key={`${p.colaboradorId}::${p.competencia}::${p.concluidoEm || i}`} style={i % 2 ? s.trAlt : s.tr} wrap={false}>
          <Text style={{ ...s.tdStrong, flex: 2.4, paddingRight: 7 }}>{p.nome}</Text>
          <Text style={{ ...s.td, flex: 1.4, paddingRight: 7 }}>{p.cargo || '—'}</Text>
          <Text style={{ ...s.td, flex: 2, fontSize: 7.5, paddingRight: 7 }}>{p.competencia || '—'}</Text>
          <Text style={{ ...s.td, width: 38, textAlign: 'center' }}>{num(p.mediaPre)}</Text>
          <Text style={{ ...s.td, width: 40, textAlign: 'center' }}>{num(p.mediaPos)}</Text>
          <Text style={{ ...s.tdStrong, width: 40, textAlign: 'center', color: p.delta > 0 ? colors.green : colors.textMuted }}>
            {comSinal(p.delta)}
          </Text>
          <View style={{ width: 88, paddingLeft: 6 }}>
            <Pill veredito={p.veredito} rotulo={p.vereditoRotulo} />
          </View>
        </View>
      ))}
    </>
  );
}

function TabelaComportamentos({ comportamentos }: { comportamentos: EvolucaoAgregado[] }) {
  return (
    <>
      <View style={s.th}>
        <Text style={{ ...s.thText, flex: 3, paddingRight: 8 }}>Comportamento</Text>
        <Text style={{ ...s.thText, flex: 2.4 }}>Competência</Text>
        <Text style={{ ...s.thText, width: 46, textAlign: 'center' }}>Pessoas</Text>
        <Text style={{ ...s.thText, width: 42, textAlign: 'center' }}>Antes</Text>
        <Text style={{ ...s.thText, width: 42, textAlign: 'center' }}>Depois</Text>
        <Text style={{ ...s.thText, width: 40, textAlign: 'center' }}>Avanço</Text>
      </View>
      {comportamentos.map((d, i) => (
        <View key={`${d.competencia} :: ${d.chave}`} style={i % 2 ? s.trAlt : s.tr} wrap={false}>
          <Text style={{ ...s.tdStrong, flex: 3, paddingRight: 8 }}>{descritorParaHumano(d.chave)}</Text>
          <Text style={{ ...s.td, flex: 2.4, fontSize: 7.5 }}>{d.competencia || '—'}</Text>
          <Text style={{ ...s.td, width: 46, textAlign: 'center' }}>{d.n}</Text>
          <Text style={{ ...s.td, width: 42, textAlign: 'center' }}>{num(d.mediaPre)}</Text>
          <Text style={{ ...s.td, width: 42, textAlign: 'center' }}>{num(d.mediaPos)}</Text>
          <Text style={{ ...s.tdStrong, width: 40, textAlign: 'center', color: d.delta > 0 ? colors.green : colors.textMuted }}>
            {comSinal(d.delta)}
          </Text>
        </View>
      ))}
    </>
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
  const totalClassificadas = resumo.confirmadas + resumo.parciais + resumo.estaveis;
  // Compatibilidade com payloads materializados antes da separação por cargo.
  // A produção já recebe `porCargo` do agregador; o fallback evita que um PDF
  // histórico deixe de abrir e o identifica como um único recorte explícito.
  const recortesCargo: EvolucaoRecorteCargo[] = data.porCargo?.length ? data.porCargo : [{
    cargo: recorte || 'Cargo não informado',
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
            {` O avanço médio por competência medida foi de ${comSinal(resumo.deltaMedio)} ponto na régua de 1 a 4.`}
          </Text>
        </View>

        <View style={s.section}>
          <View style={s.cards}>
            <CartaoVeredito
              n={resumo.confirmadas} total={totalClassificadas} veredito={CONVERGENCIA.CONFIRMADA}
              hint={DICA_VEREDITO[CONVERGENCIA.CONFIRMADA]}
            />
            <CartaoVeredito
              n={resumo.parciais} total={totalClassificadas} veredito={CONVERGENCIA.PARCIAL}
              hint={DICA_VEREDITO[CONVERGENCIA.PARCIAL]}
            />
            <CartaoVeredito
              n={resumo.estaveis} total={totalClassificadas} veredito={CONVERGENCIA.ESTAVEL} ultimo
              hint={DICA_VEREDITO[CONVERGENCIA.ESTAVEL]}
            />
          </View>
        </View>

        <View style={s.section}>
          <ReportSectionTitle>Recortes deste relatório</ReportSectionTitle>
          <Text style={s.p}>
            {`Os resultados das próximas páginas estão separados em ${recortesCargo.length} ${recortesCargo.length === 1 ? 'cargo' : 'cargos'}. Nenhuma média de competência ou comportamento mistura funções diferentes.`}
          </Text>
          <View style={s.cargoResumo}>
            {recortesCargo.map((cargo) => (
              <View key={cargo.cargo} style={s.cargoResumoItem} wrap={false}>
                <Text style={s.cargoResumoNome}>{cargo.cargo}</Text>
                <Text style={s.cargoResumoMeta}>
                  {`${cargo.pessoasMedidas} ${cargo.pessoasMedidas === 1 ? 'pessoa medida' : 'pessoas medidas'} · ${cargo.porCompetencia.length} ${cargo.porCompetencia.length === 1 ? 'competência' : 'competências'}`}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <PageFooter />
      </Page>

      {/* ───────────────── 2. Avanço por cargo ───────────────── */}
      {paginarCargosNoAvanco(recortesCargo).map((grupoCargos, pagina) => (
        <Page key={`avanco-${pagina}`} size="A4" style={pageStyles.page} wrap={false}>
          <PageHeader logoBase64={logoBase64} label={label} />
          <View style={s.section}>
            <ReportSectionTitle>{pagina === 0 ? 'Onde o grupo mais avançou' : 'Onde o grupo mais avançou · continuação'}</ReportSectionTitle>
            <View style={s.legenda}>
              <View style={{ ...s.legendaPonto, backgroundColor: colors.gray400 }} />
              <Text style={s.legendaTexto}>No diagnóstico inicial</Text>
              <View style={{ ...s.legendaPonto, backgroundColor: colors.cyan }} />
              <Text style={s.legendaTexto}>No fechamento da jornada</Text>
            </View>
            {grupoCargos.map((cargo) => (
              <View key={cargo.cargo} style={{ marginBottom: 9 }} wrap={false}>
                <CabecalhoCargo recorte={cargo} />
                {cargo.porCompetencia.slice(0, 6).map((competencia) => (
                  <BarraEvolucao key={competencia.chave} item={competencia} />
                ))}
              </View>
            ))}
          </View>
          <PageFooter />
        </Page>
      ))}

      {/* ───────────────── 3. Radares por cargo e competência ───────────────── */}
      {recortesCargo.flatMap((cargo) => {
        const paginas = paginarRadares(montarRadaresPorCompetencia(cargo.porCompetencia, cargo.porDescritor));
        return paginas.map((grupo, pagina) => (
          <Page key={`radares-${cargo.cargo}-${pagina}`} size="A4" style={pageStyles.page} wrap={false}>
            <PageHeader logoBase64={logoBase64} label={label} />
            <View style={s.section}>
              <ReportSectionTitle>{pagina === 0 ? 'Evolução dos descritores por competência' : 'Evolução dos descritores · continuação'}</ReportSectionTitle>
              <CabecalhoCargo recorte={cargo} />
              {pagina === 0 && (
                <Text style={s.p}>
                  {'Cada radar mostra uma competência isoladamente. Os eixos são seus descritores; quanto mais distante do centro, maior a nota na régua de 1 a 4. A área cinza é o diagnóstico e a área ciano é o fechamento.'}
                </Text>
              )}
              {grupo.map((item) => <RadarCompetencia key={item.competencia.chave} item={item} />)}
            </View>
            <PageFooter />
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
              <ReportSectionTitle>{pagina === 0 ? 'Comportamento por comportamento' : 'Comportamentos · continuação'}</ReportSectionTitle>
              <CabecalhoCargo recorte={cargo} />
              {pagina === 0 && (
                <Text style={s.p}>
                  {'A competência é o título; o que se observa é o comportamento. Esta lista usa somente as pessoas deste cargo.'}
                </Text>
              )}
              <TabelaComportamentos comportamentos={grupo} />
            </View>
            <PageFooter />
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
              <ReportSectionTitle>{pagina === 0 ? 'Pessoa por pessoa' : 'Pessoa por pessoa · continuação'}</ReportSectionTitle>
              <CabecalhoCargo recorte={cargo} />
              {pagina === 0 && (
                <Text style={s.p}>
                  {'Cada linha mostra uma pessoa em uma competência. Competências diferentes nunca são somadas ou mediadas; quando a variação é negativa, o avanço exibido é zero.'}
                </Text>
              )}
              <TabelaPessoas pessoas={grupo} />
            </View>
            <PageFooter />
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
              <ReportSectionTitle>Próximos passos</ReportSectionTitle>
              <CabecalhoCargo recorte={cargo} />
            </View>

            {cargo.proximasAcoes.proximoCiclo.length > 0 && (
              <View style={s.section}>
                <Text style={s.h3}>Candidatos ao próximo ciclo</Text>
                <View style={s.boxAccent}>
                  <Text style={s.p}>
                    {'As competências em que este cargo menos avançou. Os comportamentos da seção anterior ajudam a definir a abordagem dentro de cada competência.'}
                  </Text>
                  {cargo.proximasAcoes.proximoCiclo.map((d) => (
                    <Text key={d.chave} style={s.pStrong}>
                      {`• ${d.chave} — ${d.n === 1 ? '1 pessoa' : `${d.n} pessoas`}, avanço de ${comSinal(d.delta)}`}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {cargo.proximasAcoes.precisamApoio.length > 0 && (
              <View style={s.section}>
                <Text style={s.h3}>Conversas a ter primeiro</Text>
                <View style={s.box}>
                  <Text style={s.p}>
                    {'Quem terminou uma competência sem evolução confirmada neste cargo. Não é uma lista de problema: é onde uma conversa de gestor pode mudar mais o próximo ciclo.'}
                  </Text>
                  {cargo.proximasAcoes.precisamApoio.slice(0, 6).map((p, i) => (
                    <Text key={`${p.colaboradorId}::${p.competencia}::${i}`} style={s.pStrong}>
                      {`• ${p.nome}`}
                      {p.competencia ? ` · ${p.competencia}` : ''}
                      {`: ${p.vereditoRotulo}, avanço de ${comSinal(p.delta)}`}
                      {p.proximoPasso ? `. Próximo passo sugerido: ${p.proximoPasso}` : ''}
                    </Text>
                  ))}
                </View>
              </View>
            )}

            {multiplicadores.length > 0 && (
              <View style={s.section}>
                <Text style={s.h3}>Quem pode multiplicar</Text>
                <View style={s.box}>
                  <Text style={s.p}>
                    {'Pessoas deste cargo que encerraram uma competência no N4, o nível de referência.'}
                  </Text>
                  {multiplicadores.map((p, i) => (
                    <View key={`${p.colaboradorId}::${p.competencia}::${i}`} style={{ marginBottom: 6 }}>
                      <Text style={s.pStrong}>
                        {`• ${p.nome}: N4 em ${p.competencia || 'competência do ciclo'}, avanço de ${comSinal(p.delta)}`}
                      </Text>
                      {p.insight ? <Text style={{ ...s.caption, marginLeft: 10 }}>{p.insight}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            )}

            <PageFooter />
          </Page>
        );
      })}
    </Document>
  );
}
