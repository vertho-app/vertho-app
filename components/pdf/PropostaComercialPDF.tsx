import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Font, Svg, Path, Line } from '@react-pdf/renderer';
import { fmtBRL, fmtDate, fmtDateTime, fmtTelefone } from '@/lib/sales/formatters';
import type { ProposalDocumentVM } from '@/lib/sales/proposal-document';
import { brand, neutralRamps } from '@/components/pdf/tokens';

// PDF do documento da proposta. Consome o MESMO VM da página pública
// (`buildProposalDocument`) e segue a mesma ordem de seções: quem lê na tela e
// quem baixa o arquivo precisa receber a mesma proposta. Ao mexer numa seção
// aqui, olhe `app/proposta/[token]/page.tsx` — e vice-versa.

// ── Fontes do template (registradas localmente, mesmo padrão do fontsource) ──
const FS = 'https://cdn.jsdelivr.net/fontsource/fonts';
Font.register({
  family: 'SpaceGrotesk',
  fonts: [
    { src: `${FS}/space-grotesk@latest/latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${FS}/space-grotesk@latest/latin-500-normal.ttf`, fontWeight: 500 },
    { src: `${FS}/space-grotesk@latest/latin-600-normal.ttf`, fontWeight: 600 },
    { src: `${FS}/space-grotesk@latest/latin-700-normal.ttf`, fontWeight: 700 },
  ],
});
Font.register({
  family: 'IBMPlexSans',
  fonts: [
    { src: `${FS}/ibm-plex-sans@latest/latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${FS}/ibm-plex-sans@latest/latin-500-normal.ttf`, fontWeight: 500 },
    { src: `${FS}/ibm-plex-sans@latest/latin-600-normal.ttf`, fontWeight: 600 },
  ],
});
Font.register({
  family: 'IBMPlexMono',
  fonts: [
    { src: `${FS}/ibm-plex-mono@latest/latin-400-normal.ttf`, fontWeight: 400 },
    { src: `${FS}/ibm-plex-mono@latest/latin-500-normal.ttf`, fontWeight: 500 },
  ],
});
Font.registerHyphenationCallback((word: string) => [word]);

// ── Paleta oficial da marca (16/09/2026) ────────────────────────────────────
// Mesma troca da página pública: navy, cyan, roxo e a rampa neutra indigo-tinted
// vêm dos tokens; o índigo #4F46E5 do template saiu. O cyan não serve de TEXTO
// pequeno sobre branco (reprova no contraste): pinta fundo, ponto e marcador.
const N = neutralRamps.indigo;
const c = {
  navy: brand.navy[500],
  navyClaro: brand.navy[300],
  cyan: brand.cyan[500],
  cyanClaro: brand.cyan[300],
  cyanSoft: brand.cyan[100],
  cyanMarca: brand.cyan[700],
  roxo: brand.purple[500],
  // ⚠️ react-pdf NÃO entende `rgba()` — uma cor assim sai com o canal errado
  // (a linha da capa renderizou VERDE). Sobre a capa navy, os tons de branco
  // vão PRÉ-COMPOSTOS em hex. Nada de rgba neste arquivo.
  brancoDim: '#A4AEBE',      // branco 62% sobre navy
  brancoSuave: '#C1C8D3',    // 74%
  seloCyanBg: '#164766',
  seloNeutroBg: '#31496C',
  cardBg: N.bgLight,
  ink: N.textStrong,
  ink2: N.g700,
  muted: N.g600,
  faint: N.g500,
  border: N.border,
  white: brand.white,
};

const PAD_H = 46;

const s = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: c.white,
    paddingTop: 0,
    paddingBottom: 56,
    paddingHorizontal: PAD_H,
    fontFamily: 'IBMPlexSans',
    color: c.ink,
  },

  // Capa navy (sangra para as bordas: a página tem padding horizontal)
  capa: {
    marginHorizontal: -PAD_H,
    paddingHorizontal: PAD_H,
    paddingTop: 34,
    paddingBottom: 26,
    backgroundColor: c.navy,
  },
  capaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  capaLogo: { height: 17, width: 72, objectFit: 'contain' },
  brandName: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 15, color: c.white, letterSpacing: -0.2 },
  capaMeta: { alignItems: 'flex-end' },
  capaMetaLine: { fontFamily: 'IBMPlexMono', fontSize: 8, color: c.brancoDim, lineHeight: 1.85 },
  capaMetaValue: { color: c.white },
  eyebrowCyan: {
    fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1.4,
    color: c.cyan, textTransform: 'uppercase', marginBottom: 8,
  },
  capaTitulo: {
    fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 30, lineHeight: 1.05,
    letterSpacing: -0.8, color: c.white, maxWidth: '86%',
  },
  capaPara: { fontSize: 11, color: c.brancoSuave, marginTop: 12 },
  capaParaNome: { color: c.white, fontWeight: 600 },
  capaSelo: {
    marginTop: 14, alignSelf: 'flex-start',
    fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1.1, textTransform: 'uppercase',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5,
  },

  // Faixa de métricas
  metricas: {
    marginHorizontal: -PAD_H, paddingHorizontal: PAD_H,
    backgroundColor: c.cyanSoft, paddingVertical: 12,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  metrica: { flex: 1, alignItems: 'center' },
  metricaValor: { fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 17, color: c.navy, letterSpacing: -0.4 },
  metricaLabel: { fontSize: 8, color: c.muted, marginTop: 1 },

  // Seções
  section: { marginTop: 24 },
  sectionLabel: {
    fontFamily: 'IBMPlexMono', fontWeight: 500, fontSize: 10, letterSpacing: 1.2, color: c.roxo,
    textTransform: 'uppercase', marginBottom: 7,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 16, color: c.ink,
    letterSpacing: -0.4, marginBottom: 10,
  },

  // Corpo
  bodyText: { fontSize: 10.5, lineHeight: 1.6, color: c.ink2 },
  destaque: { color: c.navy, fontWeight: 600 },

  // Pilares
  pilarRow: { flexDirection: 'row', justifyContent: 'space-between' },
  pilar: {
    width: '32%', borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 13, paddingHorizontal: 12,
  },
  pilarNum: { fontFamily: 'IBMPlexMono', fontSize: 8.5, color: c.roxo, marginBottom: 5 },
  pilarTitulo: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 11, color: c.ink, marginBottom: 4 },
  pilarTexto: { fontSize: 8.8, lineHeight: 1.5, color: c.muted },

  // Curadoria humana + IA
  blocoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bloco: {
    width: '48.5%', borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 14, borderTopWidth: 2.5,
  },
  blocoTitulo: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 11, color: c.ink },
  blocoResumo: { fontSize: 9, color: c.muted, lineHeight: 1.45, marginTop: 3, marginBottom: 7 },

  // Exemplo de cenário
  cenarioRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cenarioSituacao: { width: '40%', backgroundColor: c.navy, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 14 },
  cenarioRotulo: {
    fontFamily: 'IBMPlexMono', fontWeight: 500, fontSize: 7.5, letterSpacing: 1, color: c.cyan,
    textTransform: 'uppercase', marginBottom: 7,
  },
  cenarioTexto: { fontSize: 9.5, lineHeight: 1.55, color: c.white },
  cenarioPerguntas: { width: '57.5%' },
  pergunta: {
    flexDirection: 'row', borderWidth: 1, borderColor: c.border, borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 10, marginBottom: 5,
  },
  perguntaNum: { fontFamily: 'IBMPlexMono', fontSize: 8, color: c.roxo, width: 18, marginTop: 1 },
  perguntaNome: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 9.5, color: c.ink },
  perguntaTexto: { fontSize: 8.8, lineHeight: 1.45, color: c.ink2, marginTop: 1 },
  faixaCyan: {
    backgroundColor: c.cyanSoft, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    marginTop: 4, fontSize: 9, lineHeight: 1.5, color: c.ink2,
  },

  // Personalização
  intro: { fontSize: 10, lineHeight: 1.55, color: c.ink2, marginBottom: 9 },
  pessoaGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  pessoaCard: { borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 12, marginBottom: 9 },
  pessoaNome: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 10.5, color: c.ink },
  pessoaTexto: { fontSize: 8.8, lineHeight: 1.45, color: c.muted, marginTop: 3 },
  pessoaFoco: {
    marginTop: 7, paddingLeft: 7, borderLeftWidth: 2, borderLeftColor: c.cyan,
    fontSize: 8.8, fontWeight: 600, color: c.navy,
  },
  fechamento: { fontSize: 10, lineHeight: 1.5, color: c.ink2, fontWeight: 500, marginTop: 2 },

  // Fundadores
  fundRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fundCard: {
    width: '32%', borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 13, paddingHorizontal: 10, alignItems: 'center',
  },
  fundFoto: { width: 58, height: 58, borderRadius: 29, marginBottom: 8, objectFit: 'cover' },
  fundNome: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 10.5, color: c.ink, textAlign: 'center' },
  fundBio: { fontSize: 8.5, lineHeight: 1.45, color: c.muted, textAlign: 'center', marginTop: 4 },

  // Inteligência para a gestão
  gestaoBox: { borderWidth: 1, borderColor: c.border, borderRadius: 10 },
  gestaoItem: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 12 },
  gestaoMarca: { color: c.cyanMarca, fontSize: 10, marginRight: 8, lineHeight: 1.4 },
  gestaoTexto: { flex: 1, fontSize: 10, lineHeight: 1.4, color: c.ink },
  gestaoNiveis: {
    backgroundColor: c.cardBg, paddingVertical: 7, paddingHorizontal: 12,
    fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 0.8, color: c.muted, textTransform: 'uppercase',
    borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
  },

  // Trajetória (quadro de logos)
  trajetoria: {
    borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  trajetoriaImg: { width: '100%', objectFit: 'contain' },

  // Escopo chips
  chipLinha: { flexDirection: 'row', justifyContent: 'space-between' },
  chip: {
    width: '48.5%', backgroundColor: c.cyanSoft, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 9,
    fontSize: 10, fontWeight: 500, color: c.ink2, lineHeight: 1.45,
  },
  notaFina: { fontSize: 9, color: c.muted, marginTop: 2 },

  // Entregas
  entregaGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  entrega: { width: '48%', flexDirection: 'row', marginBottom: 11 },
  entregaMark: { marginRight: 7, marginTop: 2.5 },
  entregaTitulo: { fontSize: 10, fontWeight: 600, color: c.ink },
  entregaTexto: { fontSize: 8.8, lineHeight: 1.5, color: c.muted, marginTop: 2 },

  // Dois lados
  ladoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  lado: {
    width: '48.5%', borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 14,
  },
  ladoTitulo: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 11, color: c.ink, marginBottom: 8 },
  ladoItem: { flexDirection: 'row', marginBottom: 6 },
  ladoMark: { fontSize: 9.5, marginRight: 7, lineHeight: 1.5 },
  ladoTexto: { flex: 1, fontSize: 9, color: c.ink2, lineHeight: 1.5 },

  // Investimento
  totalBar: {
    backgroundColor: c.navy, borderRadius: 12,
    paddingVertical: 18, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1.3, color: c.cyanClaro, textTransform: 'uppercase' },
  totalCond: { fontSize: 9.5, color: c.white, marginTop: 6 },
  totalDesconto: { fontSize: 8.5, color: c.cyanClaro, marginTop: 4 },
  totalValue: { fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 26, color: c.white, letterSpacing: -0.4 },
  invRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  invCard: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 13 },
  invCardLabel: { fontSize: 8.5, color: c.faint, lineHeight: 1.35 },
  invCardValue: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 15, color: c.ink, marginTop: 4 },

  // Cronograma
  cronoWrap: { borderLeftWidth: 1.5, borderLeftColor: c.border, paddingLeft: 18 },
  cronoItem: { position: 'relative', marginBottom: 13 },
  cronoDot: {
    position: 'absolute', left: -22.5, top: 2, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: c.cyan,
  },
  cronoHead: { flexDirection: 'row', alignItems: 'baseline' },
  cronoFase: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 11, color: c.ink },
  cronoDuracao: { fontFamily: 'IBMPlexMono', fontSize: 8, color: c.faint, marginLeft: 8 },
  cronoDesc: { fontSize: 9.5, color: c.muted, lineHeight: 1.5, marginTop: 2 },
  cronoEntrega: { fontSize: 9, color: c.navyClaro, lineHeight: 1.45, marginTop: 3 },
  cronoEntregaRotulo: { fontWeight: 600 },

  // Condições (premissas + não incluso)
  condRow: { flexDirection: 'row', justifyContent: 'space-between' },
  condCol: { width: '48.5%', backgroundColor: c.cardBg, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 14 },
  condTitulo: { fontSize: 10, fontWeight: 600, color: c.ink, marginBottom: 8 },
  condItem: { flexDirection: 'row', marginBottom: 6 },
  condMarkSeta: { color: c.cyanMarca, fontSize: 9.5, marginRight: 7, lineHeight: 1.5 },
  condMarkXis: { marginRight: 7, marginTop: 2.5 },
  condTexto: { flex: 1, fontSize: 8.8, color: c.ink2, lineHeight: 1.5 },

  // Observações
  obsText: { fontSize: 10, color: c.ink2, lineHeight: 1.55 },

  // Próximos passos
  passosGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  passoCard: {
    width: '48.5%', backgroundColor: c.cardBg, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12,
  },
  passoNum: { fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 11, color: c.roxo },
  passoText: { fontSize: 10, color: c.ink2, marginTop: 6, lineHeight: 1.5 },

  // Aceite
  aceiteBox: {
    marginTop: 24, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 18,
    backgroundColor: c.cyanSoft,
  },
  aceiteTitulo: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 13, color: c.navy },
  aceiteTexto: { fontSize: 9.5, color: c.ink2, lineHeight: 1.55, marginTop: 5 },
  chamadaBox: {
    marginTop: 24, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 18,
    backgroundColor: c.cyanSoft,
  },
  chamadaTitulo: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 13, color: c.ink },
  chamadaTexto: { fontSize: 9.5, color: c.ink2, lineHeight: 1.55, marginTop: 5 },

  // Contato
  contato: {
    marginTop: 16, borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingVertical: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 11, backgroundColor: c.navy,
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  avatarText: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 16, color: c.white },
  contatoLabel: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1.1, color: c.faint, textTransform: 'uppercase' },
  contatoNome: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 15, color: c.ink, marginTop: 4 },
  contatoLinha: { fontSize: 10, color: c.muted, marginTop: 2 },

  // Footer
  footer: {
    position: 'absolute', bottom: 26, left: PAD_H, right: PAD_H,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8,
  },
  footerText: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 0.6, color: c.faint },
});

function initiais(nome: string): string {
  const parts = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'V';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtNum(v: number | null | undefined): string {
  return v == null ? '—' : v.toLocaleString('pt-BR');
}

/**
 * Check e xis DESENHADOS.
 *
 * A fonte do PDF (IBM Plex no subset latin) não tem ✓ nem ✕: o react-pdf
 * desenha VAZIO, sem erro nenhum — a linha chega ao cliente sem marcação. Foi o
 * que aconteceu com a coluna "não está incluso" até 14/09/2026 (dívida
 * declarada em tests/unit/pdf-glifos-guard.test.ts). Svg não depende de fonte.
 */
function Check({ cor = c.cyanMarca }: { cor?: string }) {
  return (
    <Svg width={8} height={8} viewBox="0 0 12 12">
      <Path d="M1.8 6.4 L4.6 9.2 L10.2 3" stroke={cor} strokeWidth={1.9} fill="none" />
    </Svg>
  );
}

function Xis({ cor = c.roxo }: { cor?: string }) {
  return (
    <Svg width={7} height={7} viewBox="0 0 12 12">
      <Line x1={2} y1={2} x2={10} y2={10} stroke={cor} strokeWidth={1.7} />
      <Line x1={10} y1={2} x2={2} y2={10} stroke={cor} strokeWidth={1.7} />
    </Svg>
  );
}

/**
 * Seção do documento. Por padrão fica INTEIRA numa página: partida, o react-pdf
 * deixava o título no pé de uma página e o conteúdo na seguinte (medido
 * 16/09/2026 no escopo, com um chip cortado ao meio). Corrigir seção por seção
 * não fecha — segurar uma empurra a próxima e deixa o título DELA órfão — e
 * `minPresenceAhead` no título não segurou.
 *
 * ⚠️ Inteira só serve para conteúdo de tamanho CONHECIDO. Seção maior que a
 * página com `wrap={false}` sobrepõe o texto e perde itens (medido com 30 itens
 * de escopo injetados). Conteúdo que vem de dado passa `podeQuebrar` e, se for
 * lista, entrega a primeira linha em `primeiraLinha`: ela viaja presa ao título.
 */
function Secao(
  { eyebrow, titulo, children, podeQuebrar, primeiraLinha }:
  {
    eyebrow: string; titulo?: string; children?: React.ReactNode;
    podeQuebrar?: boolean; primeiraLinha?: React.ReactNode;
  },
) {
  return (
    <View style={s.section} wrap={!!podeQuebrar}>
      <View wrap={false}>
        <Text style={s.sectionLabel}>{eyebrow}</Text>
        {titulo ? <Text style={s.sectionTitle}>{titulo}</Text> : null}
        {primeiraLinha}
      </View>
      {children}
    </View>
  );
}

/** Pares [a, b], [c, d]… — cada linha de chips é uma unidade que não parte. */
function emLinhas<T>(itens: T[], porLinha = 2): T[][] {
  const linhas: T[][] = [];
  for (let i = 0; i < itens.length; i += porLinha) linhas.push(itens.slice(i, i + porLinha));
  return linhas;
}

function LinhaChips({ itens }: { itens: string[] }) {
  return (
    <View style={s.chipLinha} wrap={false}>
      {itens.map((item, i) => <Text key={i} style={s.chip}>{item}</Text>)}
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>Vertho · vertho.ai · Documento confidencial</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export default function PropostaComercialPDF({
  doc,
  logoBase64,
  trajetoriaLogosBase64,
  fotosFundadores,
}: {
  doc: ProposalDocumentVM;
  logoBase64?: string;
  /** Quadro "Por onde já caminhamos"; sem ele a seção some. */
  trajetoriaLogosBase64?: string;
  /** Foto de cada fundador por `arquivo`; foto ausente só esconde a imagem. */
  fotosFundadores?: Record<string, string>;
}) {
  const { cliente, investimento: inv, programa: pg, contato } = doc;
  const aceita = doc.status === 'accepted' || doc.aceite != null;
  const escopoVazio = doc.escopoItens.length === 0;
  const escopoLinhas = emLinhas(doc.escopoItens);
  const temDesconto = inv.descontoPercent != null && Number(inv.descontoPercent) > 0;

  const pessoas = pg?.pessoas ?? null;
  const metricas: { valor: string; label: string }[] = [];
  if (pessoas) metricas.push({ valor: fmtNum(pessoas), label: pessoas === 1 ? 'participante' : 'participantes' });
  if (pg?.cargos) metricas.push({ valor: fmtNum(pg.cargos), label: pg.cargos === 1 ? 'cargo mapeado' : 'cargos mapeados' });
  if (pg?.ciclos) metricas.push({ valor: fmtNum(pg.ciclos), label: pg.ciclos === 1 ? 'ciclo' : 'ciclos' });
  if (pg?.mesesPrograma) metricas.push({ valor: fmtNum(pg.mesesPrograma), label: pg.mesesPrograma === 1 ? 'mês' : 'meses de programa' });
  else if (!inv.vendidoPorProjeto && inv.meses) metricas.push({ valor: fmtNum(inv.meses), label: 'meses de contrato' });

  const invCards = [
    inv.porPessoa != null ? { label: 'Por participante, no programa inteiro', valor: fmtBRL(inv.porPessoa) } : null,
    inv.mensal != null
      ? { label: inv.vendidoPorProjeto ? 'Valor de cada parcela' : 'Valor mensal', valor: fmtBRL(inv.mensal) }
      : null,
    inv.meses != null
      ? {
        label: inv.vendidoPorProjeto ? 'Parcelas' : 'Vigência',
        valor: inv.vendidoPorProjeto ? `${inv.meses}×` : `${inv.meses} meses`,
      }
      : null,
  ].filter(Boolean) as { label: string; valor: string }[];

  return (
    <Document title={`Proposta Comercial ${doc.numero}`}>
      <Page size="A4" style={s.page} wrap>
        {/* CAPA */}
        <View style={s.capa}>
          <View style={s.capaTopo}>
            {logoBase64 ? (
              <Image src={logoBase64} style={s.capaLogo} />
            ) : (
              <Text style={s.brandName}>vertho</Text>
            )}
            <View style={s.capaMeta}>
              <Text style={s.capaMetaLine}>Nº <Text style={s.capaMetaValue}>{doc.numero}</Text></Text>
              <Text style={s.capaMetaLine}>EMITIDA <Text style={s.capaMetaValue}>{fmtDate(doc.emitidaEm)}</Text></Text>
              <Text style={s.capaMetaLine}>VÁLIDA ATÉ <Text style={s.capaMetaValue}>{fmtDate(doc.validaAte)}</Text></Text>
            </View>
          </View>

          <View style={{ marginTop: 30 }}>
            <Text style={s.eyebrowCyan}>Proposta comercial</Text>
            <Text style={s.capaTitulo}>Programa de desenvolvimento de competências</Text>
            {cliente.nome ? (
              <Text style={s.capaPara}>
                Preparada para <Text style={s.capaParaNome}>{cliente.nome}</Text>
                {cliente.tipo ? ` · ${cliente.tipo}` : ''}
              </Text>
            ) : null}
          </View>

          {aceita && (
            <Text style={{ ...s.capaSelo, backgroundColor: c.seloCyanBg, color: c.cyan }}>
              Proposta aceita
            </Text>
          )}
          {doc.expirada && !aceita && (
            <Text style={{ ...s.capaSelo, backgroundColor: c.seloNeutroBg, color: c.white }}>
              Validade expirada
            </Text>
          )}

          {/* SEM valor na capa (decisão do Rodrigo, 16/09/2026): o escopo vem antes
              do preço. O investimento fica só na seção "// Investimento". */}
        </View>

        {/* MÉTRICAS */}
        {metricas.length > 0 && (
          <View style={s.metricas}>
            {metricas.map((m, i) => (
              <View key={i} style={s.metrica}>
                <Text style={s.metricaValor}>{m.valor}</Text>
                <Text style={s.metricaLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* CONTEXTO */}
        {/* `podeQuebrar`: o contexto é texto livre da oportunidade. */}
        <Secao eyebrow="// Contexto" titulo="Por que este programa" podeQuebrar>
          {doc.contexto ? <Text style={{ ...s.bodyText, marginBottom: 8 }}>{doc.contexto}</Text> : null}
          <Text style={s.bodyText}>
            Formação genérica trata pessoas diferentes como se fossem a mesma pessoa — e termina sem
            deixar rastro do que mudou. A Vertho faz o contrário: entende o perfil e o nível de cada
            participante, entrega o desenvolvimento no formato em que ela aprende e{' '}
            <Text style={s.destaque}>mede a evolução</Text> com evidência ao fim de cada ciclo.
          </Text>
        </Secao>

        {/* PILARES */}
        <Secao eyebrow="// Como a Vertho trabalha" titulo="Diagnóstico, trilha e evidência no mesmo fluxo">
          <View style={s.pilarRow}>
            {doc.pilares.map((p, i) => (
              <View key={i} style={s.pilar} wrap={false}>
                <Text style={s.pilarNum}>{String(i + 1).padStart(2, '0')}</Text>
                <Text style={s.pilarTitulo}>{p.titulo}</Text>
                <Text style={s.pilarTexto}>{p.texto}</Text>
              </View>
            ))}
          </View>
        </Secao>

        {/* CURADORIA HUMANA + IA */}
        <Secao eyebrow="// Pessoas e IA" titulo="Curadoria humana e IA, cada uma no seu papel">
          <View style={s.blocoRow}>
            {[
              { bloco: doc.curadoria.humano, cor: c.navy },
              { bloco: doc.curadoria.ia, cor: c.cyan },
            ].map(({ bloco, cor }, i) => (
              <View key={i} style={{ ...s.bloco, borderTopColor: cor }}>
                <Text style={s.blocoTitulo}>{bloco.titulo}</Text>
                <Text style={s.blocoResumo}>{bloco.resumo}</Text>
                {bloco.itens.map((item, j) => (
                  <View key={j} style={s.ladoItem}>
                    <Text style={{ ...s.ladoMark, color: i === 0 ? c.navy : c.cyanMarca }}>›</Text>
                    <Text style={s.ladoTexto}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Secao>

        {/* EXEMPLO DE CENÁRIO */}
        <Secao eyebrow="// Diagnóstico" titulo="Diagnosticar não é fazer prova. É entender comportamento">
          <View style={s.cenarioRow}>
            <View style={s.cenarioSituacao}>
              <Text style={s.cenarioRotulo}>{doc.cenario.rotulo}</Text>
              <Text style={s.cenarioTexto}>{doc.cenario.situacao}</Text>
            </View>
            <View style={s.cenarioPerguntas}>
              {doc.cenario.perguntas.map((q, i) => (
                <View key={i} style={s.pergunta}>
                  <Text style={s.perguntaNum}>{String(i + 1).padStart(2, '0')}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.perguntaNome}>{q.nome}</Text>
                    <Text style={s.perguntaTexto}>{q.pergunta}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          <Text style={s.faixaCyan}>{doc.cenario.fechamento}</Text>
        </Secao>

        {/* PERSONALIZAÇÃO */}
        <Secao eyebrow="// Personalização" titulo={doc.personalizacao.titulo}>
          <Text style={s.intro}>{doc.personalizacao.intro}</Text>
          <View style={s.pessoaGrid}>
            {doc.personalizacao.pessoas.map((pessoa, i) => (
              <View
                key={i}
                style={{ ...s.pessoaCard, width: doc.personalizacao.pessoas.length === 3 ? '32%' : '48.5%' }}
              >
                <Text style={s.pessoaNome}>{pessoa.nome}</Text>
                <Text style={s.pessoaTexto}>{pessoa.necessidade}</Text>
                <Text style={s.pessoaFoco}>Foco: {pessoa.foco}</Text>
              </View>
            ))}
          </View>
          <Text style={s.fechamento}>{doc.personalizacao.fechamento}</Text>
        </Secao>

        {/* TRAJETÓRIA — "e de seus fundadores" de propósito: nem todo logo é
            cliente da Vertho. Ver o comentário gêmeo na página pública. */}
        {trajetoriaLogosBase64 ? (
          <Secao eyebrow="// Por onde já caminhamos" titulo="Experiências da Vertho e de seus fundadores">
            <View style={s.trajetoria}>
              <Image src={trajetoriaLogosBase64} style={s.trajetoriaImg} />
            </View>
          </Secao>
        ) : null}

        {/* QUEM MOVE A VERTHO */}
        <Secao eyebrow="// Quem move a Vertho" titulo="Experiência em educação, aprendizagem e tecnologia">
          <View style={s.fundRow}>
            {doc.fundadores.map((f) => (
              <View key={f.nome} style={s.fundCard}>
                {fotosFundadores?.[f.arquivo] ? (
                  <Image src={fotosFundadores[f.arquivo]} style={s.fundFoto} />
                ) : null}
                <Text style={s.fundNome}>{f.nome}</Text>
                <Text style={s.fundBio}>{f.bio}</Text>
              </View>
            ))}
          </View>
        </Secao>

        {/* ESCOPO — única lista que vem de DADO (`included_scope`, uma linha por
            item): cresce sem teto, então quebra por linha de chips. */}
        <Secao
          eyebrow="// Escopo desta proposta"
          titulo="O que está dimensionado aqui"
          podeQuebrar
          primeiraLinha={escopoVazio ? (
            <Text style={s.bodyText}>Pacote: {doc.produto || '—'}</Text>
          ) : (
            <LinhaChips itens={escopoLinhas[0]} />
          )}
        >
          {escopoLinhas.slice(1).map((linha, i) => <LinhaChips key={i} itens={linha} />)}
          {/* Sem contagem de conteúdos: ver o comentário gêmeo na página pública. */}
        </Secao>

        {/* ENTREGAS */}
        <Secao eyebrow="// O que está incluso" titulo="Tudo o que acompanha o programa">
          <View style={s.entregaGrid}>
            {doc.entregas.map((e, i) => (
              <View key={i} style={s.entrega} wrap={false}>
                <View style={s.entregaMark}><Check /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.entregaTitulo}>{e.titulo}</Text>
                  <Text style={s.entregaTexto}>{e.texto}</Text>
                </View>
              </View>
            ))}
          </View>
        </Secao>

        {/* DOIS LADOS */}
        <Secao eyebrow="// Quem recebe o quê" titulo="Para cada pessoa, e para a instituição">
          <View style={s.ladoRow}>
            {[
              { titulo: 'Cada participante recebe', itens: doc.paraPessoa, borda: c.cyan, marca: c.cyanMarca },
              { titulo: 'A instituição recebe', itens: doc.paraInstituicao, borda: c.navy, marca: c.navy },
            ].map((bloco, i) => (
              <View key={i} style={{ ...s.lado, borderTopWidth: 2.5, borderTopColor: bloco.borda }} wrap={false}>
                <Text style={s.ladoTitulo}>{bloco.titulo}</Text>
                {bloco.itens.map((item, j) => (
                  <View key={j} style={s.ladoItem}>
                    <Text style={{ ...s.ladoMark, color: bloco.marca }}>›</Text>
                    <Text style={s.ladoTexto}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Secao>

        {/* INTELIGÊNCIA PARA A GESTÃO */}
        <Secao eyebrow="// Inteligência para a gestão" titulo="Enquanto cada pessoa evolui, a gestão enxerga o todo">
          <Text style={s.intro}>
            A gestão deixa de acompanhar só a presença e passa a acompanhar evolução, evidências e prioridades.
          </Text>
          <View style={s.gestaoBox}>
            {doc.gestao.perguntas.map((q, i) => (
              <View
                key={i}
                style={{ ...s.gestaoItem, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.border }}
              >
                <Text style={s.gestaoMarca}>›</Text>
                <Text style={s.gestaoTexto}>{q}</Text>
              </View>
            ))}
            <Text style={s.gestaoNiveis}>Visão por nível: {doc.gestao.niveis}</Text>
          </View>
        </Secao>

        {/* INVESTIMENTO */}
        <Secao eyebrow="// Investimento" titulo="O que está sendo proposto">
          <View style={s.totalBar} wrap={false}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.totalLabel}>
                {inv.vendidoPorProjeto ? 'Investimento total do programa' : 'Valor total do contrato'}
              </Text>
              {inv.condicoesPagamento ? <Text style={s.totalCond}>{inv.condicoesPagamento}</Text> : null}
              {temDesconto ? (
                <Text style={s.totalDesconto}>Inclui desconto comercial de {Number(inv.descontoPercent)}%.</Text>
              ) : null}
            </View>
            <Text style={s.totalValue}>{fmtBRL(inv.total)}</Text>
          </View>
          {invCards.length > 0 && (
            <View style={s.invRow}>
              {invCards.map((card, i) => (
                <View
                  key={i}
                  style={{ ...s.invCard, marginRight: i < invCards.length - 1 ? 10 : 0 }}
                >
                  <Text style={s.invCardLabel}>{card.label}</Text>
                  <Text style={s.invCardValue}>{card.valor}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={{ ...s.notaFina, marginTop: 10 }}>
            Esta proposta é válida até {fmtDate(doc.validaAte)}.
          </Text>
        </Secao>

        {/* CRONOGRAMA */}
        {doc.cronograma.length > 0 && (
          <Secao eyebrow="// Como funciona" titulo="Do setup ao relatório de evolução">
            <View style={s.cronoWrap}>
              {doc.cronograma.map((fase, i) => (
                <View key={i} style={s.cronoItem} wrap={false}>
                  <View style={s.cronoDot} />
                  <View style={s.cronoHead}>
                    <Text style={s.cronoFase}>{fase.fase}</Text>
                    {fase.duracao ? <Text style={s.cronoDuracao}>{fase.duracao}</Text> : null}
                  </View>
                  <Text style={s.cronoDesc}>{fase.descricao}</Text>
                  {fase.entrega ? (
                    <Text style={s.cronoEntrega}>
                      {/* Sem seta: → não existe no subset da fonte e sai vazio. */}
                      <Text style={s.cronoEntregaRotulo}>Entrega: </Text>{fase.entrega}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </Secao>
        )}

        {/* PRÓXIMOS PASSOS */}
        {doc.proximosPassos.length > 0 && (
          <Secao eyebrow="// Próximos passos" titulo="O que acontece depois do aceite">
            <View style={s.passosGrid} wrap={false}>
              {doc.proximosPassos.map((passo, i) => (
                <View key={i} style={s.passoCard} wrap={false}>
                  <Text style={s.passoNum}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={s.passoText}>{passo}</Text>
                </View>
              ))}
            </View>
          </Secao>
        )}

        {/* OBSERVAÇÕES */}
        {doc.notasComerciais && (
          <Secao eyebrow="// Observações" podeQuebrar>
            <Text style={s.obsText}>{doc.notasComerciais}</Text>
          </Secao>
        )}

        {/* CONDIÇÕES */}
        {(doc.premissas.length > 0 || doc.naoIncluso.length > 0) && (
          <Secao eyebrow="// Condições" titulo="Premissas e limites do escopo">
            <View style={s.condRow}>
              {doc.premissas.length > 0 && (
                <View style={s.condCol}>
                  <Text style={s.condTitulo}>Premissas</Text>
                  {doc.premissas.map((item, i) => (
                    <View key={i} style={s.condItem}>
                      <Text style={s.condMarkSeta}>›</Text>
                      <Text style={s.condTexto}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
              {doc.naoIncluso.length > 0 && (
                <View style={s.condCol}>
                  <Text style={s.condTitulo}>O que não está incluso</Text>
                  {doc.naoIncluso.map((item, i) => (
                    <View key={i} style={s.condItem}>
                      <View style={s.condMarkXis}><Xis /></View>
                      <Text style={s.condTexto}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Secao>
        )}

        {/* ACEITE / CHAMADA + CONTATO — no MESMO bloco sem quebra: separados, o
            contato caía sozinho numa página em branco (medido 16/09/2026). */}
        <View wrap={false}>
          {aceita ? (
            <View style={s.aceiteBox} wrap={false}>
              <Text style={s.aceiteTitulo}>Proposta aceita</Text>
              <Text style={s.aceiteTexto}>
                {doc.aceite
                  ? `Registrado por ${doc.aceite.nome}${doc.aceite.cargo ? ` (${doc.aceite.cargo})` : ''} em ${fmtDateTime(doc.aceite.em)}.`
                  : 'O aceite desta proposta já está registrado.'}
              </Text>
            </View>
          ) : doc.podeAceitar ? (
            <View style={s.chamadaBox} wrap={false}>
              <Text style={s.chamadaTitulo}>Vamos começar?</Text>
              <Text style={s.chamadaTexto}>
                O aceite pode ser registrado na própria página desta proposta, ou respondendo ao seu
                contato na Vertho. O ambiente da instituição fica no ar em até 2 dias úteis após o
                recebimento do material de setup.
              </Text>
            </View>
          ) : null}

          {/* CONTATO */}
          <View style={s.contato} wrap={false}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initiais(contato.nome)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.contatoLabel}>Seu contato na Vertho</Text>
              <Text style={s.contatoNome}>{contato.nome}</Text>
              {contato.email && <Text style={s.contatoLinha}>{contato.email}</Text>}
              {contato.whatsapp && <Text style={s.contatoLinha}>{fmtTelefone(contato.whatsapp)}</Text>}
            </View>
          </View>
        </View>

        <Footer />
      </Page>
    </Document>
  );
}
