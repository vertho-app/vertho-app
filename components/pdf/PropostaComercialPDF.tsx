import React from 'react';
import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, pageStyles } from './styles';
import { SectionTitle } from './SectionTitle';
import { fmtBRL, fmtDate } from '@/lib/sales/formatters';
import type { ProposalDocumentVM } from '@/lib/sales/proposal-document';

const s = StyleSheet.create({
  // Hero (cabeçalho do documento, abaixo da barra navy)
  hero: { marginBottom: 18 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroTitle: { fontSize: fonts.heading1, fontWeight: 700, color: colors.navy, marginBottom: 4 },
  heroNumero: { fontSize: fonts.body, color: colors.textMuted, fontWeight: 600 },
  heroMeta: { alignItems: 'flex-end' },
  heroMetaLabel: {
    fontSize: 7, fontWeight: 700, color: colors.gray500,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  heroMetaValue: { fontSize: fonts.small, color: colors.textPrimary, fontWeight: 600, marginBottom: 5 },
  // Selo (badge)
  selo: {
    alignSelf: 'flex-start',
    fontSize: 8, fontWeight: 700, color: colors.white,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6,
  },
  // Bloco "Para"
  paraBlock: {
    backgroundColor: colors.perfilBg,
    borderWidth: 0.5, borderColor: colors.perfilBorder,
    borderRadius: 3, padding: 12, marginBottom: 14,
  },
  paraLabel: {
    fontSize: 7, fontWeight: 700, color: colors.gray500,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4,
  },
  paraNome: { fontSize: 13, fontWeight: 700, color: colors.navy },
  paraTipo: { fontSize: fonts.small, color: colors.textSecondary, marginTop: 2 },
  // Texto de corpo
  section: { marginBottom: 14 },
  text: { fontSize: fonts.body, color: colors.textSecondary, lineHeight: 1.65 },
  // Lista de escopo
  listItem: { flexDirection: 'row', marginBottom: 4 },
  listPrefix: { fontSize: fonts.body, fontWeight: 700, color: colors.cyan, width: 12 },
  listText: { fontSize: fonts.body, color: colors.textPrimary, flex: 1, lineHeight: 1.55 },
  // Tabela de investimento
  table: { width: '100%', marginTop: 4 },
  tableRow: {
    flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
  },
  tableRowAlt: {
    flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10,
    borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
    backgroundColor: colors.gray100,
  },
  tableLabel: { fontSize: fonts.body, color: colors.textSecondary, flex: 1 },
  tableValue: { fontSize: fonts.body, color: colors.navy, fontWeight: 700, textAlign: 'right' },
  // Linha de total (destaque navy)
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.navy, borderRadius: 3,
    paddingVertical: 10, paddingHorizontal: 12, marginTop: 6,
  },
  totalLabel: {
    fontSize: 8, fontWeight: 700, color: colors.cyan,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  totalValue: { fontSize: 15, fontWeight: 700, color: colors.white },
  // Bloco de contato
  contatoBlock: {
    backgroundColor: colors.gray100,
    borderWidth: 0.5, borderColor: colors.borderLight,
    borderRadius: 3, padding: 12,
  },
  contatoNome: { fontSize: 11, fontWeight: 700, color: colors.navy, marginBottom: 3 },
  contatoLinha: { fontSize: fonts.small, color: colors.textSecondary, marginTop: 1 },
});

function PageHeader({ logoBase64 }: { logoBase64?: string }) {
  return (
    <View style={pageStyles.header} fixed>
      {logoBase64 ? <Image src={logoBase64} style={pageStyles.headerLogo} /> : <View />}
      <Text style={pageStyles.headerLabel}>Proposta Comercial</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={pageStyles.footer} fixed>
      <Text style={pageStyles.footerText}>Vertho · vertho.ai · Documento confidencial</Text>
      <Text style={pageStyles.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function InvestimentoRow({ label, value, alt }: { label: string; value: string; alt?: boolean }) {
  return (
    <View style={alt ? s.tableRowAlt : s.tableRow}>
      <Text style={s.tableLabel}>{label}</Text>
      <Text style={s.tableValue}>{value}</Text>
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

  return (
    <Document title={`Proposta Comercial ${doc.numero}`}>
      <Page size="A4" style={pageStyles.page} wrap>
        <PageHeader logoBase64={logoBase64} />

        {/* HERO — título + número + datas + selo */}
        <View style={s.hero}>
          <View style={s.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>Proposta Comercial</Text>
              <Text style={s.heroNumero}>Nº {doc.numero}</Text>
              {aceita ? (
                <Text style={{ ...s.selo, backgroundColor: colors.green }}>Aceita</Text>
              ) : doc.expirada ? (
                <Text style={{ ...s.selo, backgroundColor: colors.flagRed }}>Expirada</Text>
              ) : null}
            </View>
            <View style={s.heroMeta}>
              <Text style={s.heroMetaLabel}>Emitida em</Text>
              <Text style={s.heroMetaValue}>{fmtDate(doc.emitidaEm)}</Text>
              <Text style={s.heroMetaLabel}>Válida até</Text>
              <Text style={s.heroMetaValue}>{fmtDate(doc.validaAte)}</Text>
            </View>
          </View>
        </View>

        {/* PARA */}
        <View style={s.paraBlock}>
          <Text style={s.paraLabel}>Para</Text>
          <Text style={s.paraNome}>{cliente.nome}</Text>
          {cliente.tipo && <Text style={s.paraTipo}>{cliente.tipo}</Text>}
        </View>

        {/* PARÁGRAFO INSTITUCIONAL */}
        <View style={s.section}>
          <Text style={s.text}>
            A Vertho desenvolve competências por IA: diagnóstico por cargo, trilha individual e um
            Mentor IA que acompanha a aplicação prática no dia a dia.
          </Text>
        </View>

        {/* ESCOPO INCLUÍDO */}
        <View style={s.section}>
          <SectionTitle>Escopo incluído</SectionTitle>
          {escopoVazio ? (
            <Text style={s.text}>Pacote: {doc.produto || '—'}</Text>
          ) : (
            doc.escopoItens.map((item, i) => (
              <View key={i} style={s.listItem}>
                <Text style={s.listPrefix}>+</Text>
                <Text style={s.listText}>{item}</Text>
              </View>
            ))
          )}
        </View>

        {/* INVESTIMENTO */}
        <View style={s.section}>
          <SectionTitle>Investimento</SectionTitle>
          <View style={s.table}>
            <InvestimentoRow label="Valor mensal" value={fmtBRL(investimento.mensal)} />
            <InvestimentoRow
              label="Vigência"
              value={investimento.meses != null ? `${investimento.meses} meses` : '—'}
              alt
            />
            {investimento.descontoPercent != null && investimento.descontoPercent > 0 && (
              <InvestimentoRow label="Desconto aplicado" value={`${investimento.descontoPercent}%`} />
            )}
            {investimento.condicoesPagamento && (
              <InvestimentoRow
                label="Condições de pagamento"
                value={investimento.condicoesPagamento}
                alt={investimento.descontoPercent == null || investimento.descontoPercent <= 0}
              />
            )}
          </View>
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Valor total do contrato</Text>
            <Text style={s.totalValue}>{fmtBRL(investimento.total)}</Text>
          </View>
        </View>

        {/* OBSERVAÇÕES */}
        {doc.notasComerciais && (
          <View style={s.section}>
            <SectionTitle>Observações</SectionTitle>
            <Text style={s.text}>{doc.notasComerciais}</Text>
          </View>
        )}

        {/* CONTATO */}
        <View style={s.section} wrap={false}>
          <SectionTitle>Seu contato na Vertho</SectionTitle>
          <View style={s.contatoBlock}>
            <Text style={s.contatoNome}>{representante.nome}</Text>
            {representante.email && <Text style={s.contatoLinha}>{representante.email}</Text>}
            {representante.telefone && <Text style={s.contatoLinha}>{representante.telefone}</Text>}
          </View>
        </View>

        <PageFooter />
      </Page>
    </Document>
  );
}
