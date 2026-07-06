import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';
import type { ProposalDocumentVM } from '@/lib/sales/proposal-document';

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

// ── Paleta clara / editorial ────────────────────────────────────────────────
const c = {
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
  white: '#FFFFFF',
};

const s = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: c.white,
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 46,
    fontFamily: 'IBMPlexSans',
    color: c.ink,
  },

  // Brand + pill
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandLeft: { flexDirection: 'row', alignItems: 'center' },
  brandSquare: { width: 16, height: 16, borderRadius: 4, backgroundColor: c.indigo, marginRight: 8 },
  brandName: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 15, color: c.ink, letterSpacing: -0.2 },
  brandLogo: { height: 16, width: 68, objectFit: 'contain' },
  pill: {
    fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1.5,
    color: c.faint, backgroundColor: c.chipBg,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 5,
    textTransform: 'uppercase',
  },

  // Hero
  hero: { marginTop: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  heroTitle: { fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 34, lineHeight: 1, letterSpacing: -0.6, color: c.ink },
  heroMeta: { alignItems: 'flex-end' },
  heroMetaLine: { fontFamily: 'IBMPlexMono', fontSize: 8.5, color: c.muted, lineHeight: 1.9 },
  heroMetaValue: { color: c.ink },

  // Selo
  seloRow: { marginTop: 12, flexDirection: 'row' },
  selo: {
    fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1.2,
    color: c.white, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5,
    textTransform: 'uppercase',
  },

  // Para
  paraBlock: {
    marginTop: 24, borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  paraLabel: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1.3, color: c.faint, textTransform: 'uppercase' },
  paraNome: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 16, color: c.ink, marginTop: 4 },
  paraTipo: {
    fontSize: 9, color: c.muted, backgroundColor: c.cardBg,
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999,
  },

  // Seções
  section: { marginTop: 26 },
  sectionLabel: {
    fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1.3, color: c.indigo,
    textTransform: 'uppercase', marginBottom: 12,
  },

  // Contexto / corpo
  bodyText: { fontSize: 11, lineHeight: 1.6, color: c.ink2 },
  indigoStrong: { color: c.indigo, fontWeight: 600 },

  // Escopo chips
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  chip: {
    width: '48.5%', backgroundColor: c.chipBg, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 9,
    fontSize: 10, fontWeight: 500, color: c.ink,
  },

  // Investimento cards
  invRow: { flexDirection: 'row', justifyContent: 'space-between' },
  invCard: {
    flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 14,
  },
  invCardLabel: { fontSize: 9, color: c.faint },
  invCardValue: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 16, color: c.ink, marginTop: 4 },
  totalBar: {
    marginTop: 11, backgroundColor: c.indigo, borderRadius: 12,
    paddingVertical: 18, paddingHorizontal: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontFamily: 'IBMPlexMono', fontSize: 7.5, letterSpacing: 1.3, color: c.indigoSoft, textTransform: 'uppercase' },
  totalCond: { fontSize: 9, color: c.indigoSoft, marginTop: 6 },
  totalValue: { fontFamily: 'SpaceGrotesk', fontWeight: 700, fontSize: 26, color: c.white, letterSpacing: -0.4 },

  // Cronograma
  cronoWrap: { borderLeftWidth: 1.5, borderLeftColor: c.border, paddingLeft: 18 },
  cronoItem: { position: 'relative', marginBottom: 13 },
  cronoDot: {
    position: 'absolute', left: -22.5, top: 2, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: c.indigo,
  },
  cronoFase: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 11, color: c.ink },
  cronoDesc: { fontSize: 9.5, color: c.muted, lineHeight: 1.5, marginTop: 2 },

  // Não incluso
  naoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  naoItem: { width: '48%', flexDirection: 'row', marginBottom: 9 },
  naoMark: { color: c.pink, fontSize: 9.5, marginRight: 8, lineHeight: 1.5 },
  naoText: { flex: 1, fontSize: 9.5, color: c.ink2, lineHeight: 1.5 },

  // Premissas
  premItem: { flexDirection: 'row', marginBottom: 8 },
  premMark: { color: c.indigo, fontSize: 10, marginRight: 8, lineHeight: 1.5 },
  premText: { flex: 1, fontSize: 10, color: c.ink2, lineHeight: 1.5 },

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

  // Contato
  contato: {
    marginTop: 26, borderWidth: 1, borderColor: c.border, borderRadius: 12,
    paddingVertical: 18, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 11, backgroundColor: c.indigo,
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  avatarText: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 16, color: c.white },
  contatoLabel: { fontFamily: 'IBMPlexMono', fontSize: 8, letterSpacing: 1.1, color: c.faint, textTransform: 'uppercase' },
  contatoNome: { fontFamily: 'SpaceGrotesk', fontWeight: 600, fontSize: 15, color: c.ink, marginTop: 4 },
  contatoLinha: { fontSize: 10, color: c.muted, marginTop: 2 },

  // Footer
  footer: {
    position: 'absolute', bottom: 26, left: 46, right: 46,
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
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
  const { cliente, investimento, representante } = doc;
  const aceita = doc.status === 'accepted';
  const escopoVazio = doc.escopoItens.length === 0;
  const temDesconto = investimento.descontoPercent != null && investimento.descontoPercent > 0;

  return (
    <Document title={`Proposta Comercial ${doc.numero}`}>
      <Page size="A4" style={s.page} wrap>
        {/* BRAND + PILL */}
        <View style={s.brandRow}>
          <View style={s.brandLeft}>
            {logoBase64 ? (
              <Image src={logoBase64} style={s.brandLogo} />
            ) : (
              <>
                <View style={s.brandSquare} />
                <Text style={s.brandName}>vertho</Text>
              </>
            )}
          </View>
          <Text style={s.pill}>Proposta Comercial</Text>
        </View>

        {/* HERO */}
        <View style={s.hero}>
          <Text style={s.heroTitle}>Proposta{'\n'}Comercial</Text>
          <View style={s.heroMeta}>
            <Text style={s.heroMetaLine}>
              Nº <Text style={s.heroMetaValue}>{doc.numero}</Text>
            </Text>
            <Text style={s.heroMetaLine}>
              EMITIDA <Text style={s.heroMetaValue}>{fmtDate(doc.emitidaEm)}</Text>
            </Text>
            <Text style={s.heroMetaLine}>
              VÁLIDA <Text style={s.heroMetaValue}>{fmtDate(doc.validaAte)}</Text>
            </Text>
          </View>
        </View>

        {/* SELO */}
        {(aceita || doc.expirada) && (
          <View style={s.seloRow}>
            {aceita ? (
              <Text style={{ ...s.selo, backgroundColor: c.indigo }}>Aceita</Text>
            ) : (
              <Text style={{ ...s.selo, backgroundColor: c.pink }}>Expirada</Text>
            )}
          </View>
        )}

        {/* PARA */}
        <View style={s.paraBlock} wrap={false}>
          <View style={{ flex: 1 }}>
            <Text style={s.paraLabel}>Para</Text>
            <Text style={s.paraNome}>{cliente.nome}</Text>
          </View>
          {cliente.tipo && <Text style={s.paraTipo}>{cliente.tipo}</Text>}
        </View>

        {/* CONTEXTO */}
        <View style={s.section}>
          <SectionLabel>// Contexto</SectionLabel>
          <Text style={s.bodyText}>
            {doc.contexto ? `${doc.contexto} ` : ''}
            A Vertho desenvolve competências por IA: diagnóstico por cargo, trilha individual e um{' '}
            <Text style={s.indigoStrong}>Mentor IA</Text> que acompanha a aplicação prática no dia a dia.
          </Text>
        </View>

        {/* ESCOPO */}
        <View style={s.section}>
          <SectionLabel>// Escopo incluído</SectionLabel>
          {escopoVazio ? (
            <Text style={s.bodyText}>Pacote: {doc.produto || '—'}</Text>
          ) : (
            <View style={s.chipGrid}>
              {doc.escopoItens.map((item, i) => (
                <Text key={i} style={s.chip}>{item}</Text>
              ))}
            </View>
          )}
        </View>

        {/* INVESTIMENTO */}
        <View style={s.section}>
          <SectionLabel>// Investimento</SectionLabel>
          <View style={s.invRow}>
            <View style={{ ...s.invCard, marginRight: 10 }}>
              <Text style={s.invCardLabel}>Valor total do contrato</Text>
              <Text style={s.invCardValue}>{fmtBRL(investimento.total)}</Text>
            </View>
            <View style={{ ...s.invCard, marginRight: temDesconto ? 10 : 0 }}>
              <Text style={s.invCardLabel}>Vigência</Text>
              <Text style={s.invCardValue}>
                {investimento.meses != null ? `${investimento.meses} meses` : '—'}
              </Text>
            </View>
            {temDesconto && (
              <View style={s.invCard}>
                <Text style={s.invCardLabel}>Desconto</Text>
                <Text style={s.invCardValue}>{investimento.descontoPercent}%</Text>
              </View>
            )}
          </View>
          <View style={s.totalBar} wrap={false}>
            <View style={{ flex: 1 }}>
              <Text style={s.totalLabel}>Valor mensal</Text>
              {investimento.condicoesPagamento && (
                <Text style={s.totalCond}>{investimento.condicoesPagamento}</Text>
              )}
            </View>
            <Text style={s.totalValue}>{fmtBRL(investimento.mensal)}</Text>
          </View>
        </View>

        {/* CRONOGRAMA */}
        {doc.cronograma.length > 0 && (
          <View style={s.section}>
            <SectionLabel>// Cronograma</SectionLabel>
            <View style={s.cronoWrap}>
              {doc.cronograma.map((fase, i) => (
                <View key={i} style={s.cronoItem} wrap={false}>
                  <View style={s.cronoDot} />
                  <Text style={s.cronoFase}>{fase.fase}</Text>
                  <Text style={s.cronoDesc}>{fase.descricao}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* NÃO INCLUSO */}
        {doc.naoIncluso.length > 0 && (
          <View style={s.section}>
            <SectionLabel>// O que não está incluso</SectionLabel>
            <View style={s.naoGrid}>
              {doc.naoIncluso.map((item, i) => (
                <View key={i} style={s.naoItem}>
                  <Text style={s.naoMark}>✕</Text>
                  <Text style={s.naoText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* PREMISSAS */}
        {doc.premissas.length > 0 && (
          <View style={s.section}>
            <SectionLabel>// Premissas</SectionLabel>
            {doc.premissas.map((item, i) => (
              <View key={i} style={s.premItem}>
                <Text style={s.premMark}>›</Text>
                <Text style={s.premText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {/* OBSERVAÇÕES */}
        {doc.notasComerciais && (
          <View style={s.section}>
            <SectionLabel>// Observações</SectionLabel>
            <Text style={s.obsText}>{doc.notasComerciais}</Text>
          </View>
        )}

        {/* PRÓXIMOS PASSOS */}
        {doc.proximosPassos.length > 0 && (
          <View style={s.section}>
            <SectionLabel>// Próximos passos</SectionLabel>
            <View style={s.passosGrid}>
              {doc.proximosPassos.map((passo, i) => (
                <View key={i} style={s.passoCard} wrap={false}>
                  <Text style={s.passoNum}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={s.passoText}>{passo}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* CONTATO */}
        <View style={s.contato} wrap={false}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initiais(representante.nome)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.contatoLabel}>Seu contato na Vertho</Text>
            <Text style={s.contatoNome}>{representante.nome}</Text>
            {representante.email && <Text style={s.contatoLinha}>{representante.email}</Text>}
            {representante.telefone && <Text style={s.contatoLinha}>{representante.telefone}</Text>}
          </View>
        </View>

        <Footer />
      </Page>
    </Document>
  );
}
