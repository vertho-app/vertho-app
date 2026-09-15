import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Font, Svg, Path, Line } from '@react-pdf/renderer';
import { fmtBRL, fmtDate, fmtDateTime, fmtTelefone } from '@/lib/sales/formatters';
import type { ProposalDocumentVM } from '@/lib/sales/proposal-document';

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

// ── Paleta clara / editorial + capa navy da marca ───────────────────────────
const c = {
  navy: '#0F2B54',
  cyan: '#34C5CC',
  // ⚠️ react-pdf NÃO entende `rgba()` — uma cor assim sai com o canal errado
  // (a linha da capa renderizou VERDE). Sobre a capa navy, os tons de branco
  // vão PRÉ-COMPOSTOS em hex. Nada de rgba neste arquivo.
  brancoDim: '#A4AEBE',      // branco 62% sobre navy
  brancoSuave: '#C1C8D3',    // 74%
  brancoFraco: '#939FB2',    // 55%
  linhaCapa: '#354D6F',      // 16%
  seloCyanBg: '#164766',
  seloNeutroBg: '#31496C',
  indigo: '#4F46E5',
  indigoSoft: '#C3BFF7',   // texto sobre a barra índigo
  chipBg: '#EEF0FE',
  cardBg: '#F5F6FA',
  ink: '#0E1116',
  ink2: '#2B313C',
  muted: '#5A6472',
  faint: '#8189A0',
  border: '#E7E9EF',
  borderFooter: '#ECEEF3',
  pink: '#C4488A',
  green: '#166534',
  greenBg: '#DCFCE7',
  white: '#FFFFFF',
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
  // ⚠️ O divisor e um View de 1pt PREENCHIDO, nao um `borderTopWidth`: com
  // borda o react-pdf pintou a linha de VERDE sobre a capa navy (visto no
  // PDF renderizado, 14/09/2026) — nao e o hex, e a borda.
  capaDivisor: { height: 1, backgroundColor: c.linhaCapa, marginTop: 22 },
  capaTotalWrap: { marginTop: 16 },
  capaTotalLabel: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1.3, color: c.brancoFraco, textTransform: 'uppercase' },
  capaTotalLinha: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  capaTotalValor: { fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 28, color: c.white, letterSpacing: -0.6 },
  capaTotalCond: { fontSize: 10, color: c.brancoSuave, marginLeft: 12, marginBottom: 4 },

  // Faixa de métricas
  metricas: {
    marginHorizontal: -PAD_H, paddingHorizontal: PAD_H,
    backgroundColor: c.chipBg, paddingVertical: 12,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  metrica: { flex: 1, alignItems: 'center' },
  metricaValor: { fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 17, color: c.indigo, letterSpacing: -0.4 },
  metricaLabel: { fontSize: 8, color: c.muted, marginTop: 1 },

  // Seções
  section: { marginTop: 24 },
  sectionLabel: {
    fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1.3, color: c.indigo,
    textTransform: 'uppercase', marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 16, color: c.ink,
    letterSpacing: -0.4, marginBottom: 10,
  },

  // Corpo
  bodyText: { fontSize: 10.5, lineHeight: 1.6, color: c.ink2 },
  indigoStrong: { color: c.indigo, fontWeight: 600 },

  // Pilares
  pilarRow: { flexDirection: 'row', justifyContent: 'space-between' },
  pilar: {
    width: '32%', borderWidth: 1, borderColor: c.border, borderRadius: 10,
    paddingVertical: 13, paddingHorizontal: 12,
  },
  pilarNum: { fontFamily: 'IBMPlexMono', fontSize: 8.5, color: c.indigo, marginBottom: 5 },
  pilarTitulo: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 11, color: c.ink, marginBottom: 4 },
  pilarTexto: { fontSize: 8.8, lineHeight: 1.5, color: c.muted },

  // Escopo chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  chip: {
    width: '48.5%', backgroundColor: c.chipBg, borderRadius: 8,
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
    backgroundColor: c.indigo, borderRadius: 12,
    paddingVertical: 18, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1.3, color: c.indigoSoft, textTransform: 'uppercase' },
  totalCond: { fontSize: 9.5, color: c.white, marginTop: 6 },
  totalDesconto: { fontSize: 8.5, color: c.indigoSoft, marginTop: 4 },
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
    backgroundColor: c.indigo,
  },
  cronoHead: { flexDirection: 'row', alignItems: 'baseline' },
  cronoFase: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 11, color: c.ink },
  cronoDuracao: { fontFamily: 'IBMPlexMono', fontSize: 8, color: c.faint, marginLeft: 8 },
  cronoDesc: { fontSize: 9.5, color: c.muted, lineHeight: 1.5, marginTop: 2 },
  cronoEntrega: { fontSize: 9, color: c.indigo, lineHeight: 1.45, marginTop: 3 },
  cronoEntregaRotulo: { fontWeight: 600 },

  // Condições (premissas + não incluso)
  condRow: { flexDirection: 'row', justifyContent: 'space-between' },
  condCol: { width: '48.5%', backgroundColor: c.cardBg, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 14 },
  condTitulo: { fontSize: 10, fontWeight: 600, color: c.ink, marginBottom: 8 },
  condItem: { flexDirection: 'row', marginBottom: 6 },
  condMarkIndigo: { color: c.indigo, fontSize: 9.5, marginRight: 7, lineHeight: 1.5 },
  condMarkPink: { marginRight: 7, marginTop: 2.5 },
  condTexto: { flex: 1, fontSize: 8.8, color: c.ink2, lineHeight: 1.5 },

  // Observações
  obsText: { fontSize: 10, color: c.ink2, lineHeight: 1.55 },

  // Próximos passos
  passosGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  passoCard: {
    width: '48.5%', backgroundColor: c.cardBg, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 12,
  },
  passoNum: { fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 11, color: c.indigo },
  passoText: { fontSize: 10, color: c.ink2, marginTop: 6, lineHeight: 1.5 },

  // Aceite
  aceiteBox: {
    marginTop: 24, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 18,
    backgroundColor: c.greenBg,
  },
  aceiteTitulo: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 13, color: c.green },
  aceiteTexto: { fontSize: 9.5, color: c.ink2, lineHeight: 1.55, marginTop: 5 },
  chamadaBox: {
    marginTop: 24, borderRadius: 12, paddingVertical: 16, paddingHorizontal: 18,
    backgroundColor: c.chipBg,
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
    borderTopWidth: 1, borderTopColor: c.borderFooter, paddingTop: 8,
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
function Check({ cor = c.indigo }: { cor?: string }) {
  return (
    <Svg width={8} height={8} viewBox="0 0 12 12">
      <Path d="M1.8 6.4 L4.6 9.2 L10.2 3" stroke={cor} strokeWidth={1.9} fill="none" />
    </Svg>
  );
}

function Xis({ cor = c.pink }: { cor?: string }) {
  return (
    <Svg width={7} height={7} viewBox="0 0 12 12">
      <Line x1={2} y1={2} x2={10} y2={10} stroke={cor} strokeWidth={1.7} />
      <Line x1={10} y1={2} x2={2} y2={10} stroke={cor} strokeWidth={1.7} />
    </Svg>
  );
}

function Secao(
  { eyebrow, titulo, children, semQuebra }:
  { eyebrow: string; titulo?: string; children: React.ReactNode; semQuebra?: boolean },
) {
  return (
    // `semQuebra` mantém título e conteúdo na MESMA página: sem isso o react-pdf
    // deixou "O que acontece depois do aceite" sozinho no pé de uma página e os
    // quatro cards na seguinte.
    <View style={s.section} wrap={!semQuebra}>
      <Text style={s.sectionLabel}>{eyebrow}</Text>
      {titulo ? <Text style={s.sectionTitle}>{titulo}</Text> : null}
      {children}
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
}: {
  doc: ProposalDocumentVM;
  logoBase64?: string;
}) {
  const { cliente, investimento: inv, programa: pg, contato } = doc;
  const aceita = doc.status === 'accepted' || doc.aceite != null;
  const escopoVazio = doc.escopoItens.length === 0;
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

          {inv.total != null && (
            <View>
              <View style={s.capaDivisor} />
              <View style={s.capaTotalWrap}>
                <Text style={s.capaTotalLabel}>
                  {inv.vendidoPorProjeto ? 'Investimento total do programa' : 'Valor total do contrato'}
                </Text>
                <View style={s.capaTotalLinha}>
                  <Text style={s.capaTotalValor}>{fmtBRL(inv.total)}</Text>
                  {inv.condicoesPagamento ? (
                    <Text style={s.capaTotalCond}>{inv.condicoesPagamento}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          )}
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
        <Secao eyebrow="// Contexto" titulo="Por que este programa">
          {doc.contexto ? <Text style={{ ...s.bodyText, marginBottom: 8 }}>{doc.contexto}</Text> : null}
          <Text style={s.bodyText}>
            Formação genérica trata pessoas diferentes como se fossem a mesma pessoa — e termina sem
            deixar rastro do que mudou. A Vertho faz o contrário: entende o perfil e o nível de cada
            participante, entrega o desenvolvimento no formato em que ela aprende e{' '}
            <Text style={s.indigoStrong}>mede a evolução</Text> com evidência ao fim de cada ciclo.
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

        {/* ESCOPO */}
        <Secao eyebrow="// Escopo desta proposta" titulo="O que está dimensionado aqui">
          {escopoVazio ? (
            <Text style={s.bodyText}>Pacote: {doc.produto || '—'}</Text>
          ) : (
            <View style={s.chipGrid}>
              {doc.escopoItens.map((item, i) => (
                <Text key={i} style={s.chip}>{item}</Text>
              ))}
            </View>
          )}
          {pg?.conteudosPorPessoaCiclo != null && (
            <Text style={s.notaFina}>
              {/* Por PESSOA — ver o comentário gêmeo na página pública. */}
              São {fmtNum(pg.conteudosPorPessoaCiclo)} conteúdos por pessoa a cada ciclo
              {pg.ciclos && pg.ciclos > 1
                ? ` — ${fmtNum(pg.conteudosPorPessoaCiclo * pg.ciclos)} ao longo dos ${pg.ciclos} ciclos`
                : ''}.
            </Text>
          )}
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
              { titulo: 'Cada participante recebe', itens: doc.paraPessoa, cor: c.indigo },
              { titulo: 'A instituição recebe', itens: doc.paraInstituicao, cor: c.navy },
            ].map((bloco, i) => (
              <View key={i} style={{ ...s.lado, borderTopWidth: 2.5, borderTopColor: bloco.cor }} wrap={false}>
                <Text style={s.ladoTitulo}>{bloco.titulo}</Text>
                {bloco.itens.map((item, j) => (
                  <View key={j} style={s.ladoItem}>
                    <Text style={{ ...s.ladoMark, color: bloco.cor }}>›</Text>
                    <Text style={s.ladoTexto}>{item}</Text>
                  </View>
                ))}
              </View>
            ))}
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
          <Secao eyebrow="// Próximos passos" titulo="O que acontece depois do aceite" semQuebra>
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
          <Secao eyebrow="// Observações">
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
                      <Text style={s.condMarkIndigo}>›</Text>
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
                      <View style={s.condMarkPink}><Xis /></View>
                      <Text style={s.condTexto}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </Secao>
        )}

        {/* ACEITE / CHAMADA */}
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

        <Footer />
      </Page>
    </Document>
  );
}
