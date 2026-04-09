import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';

const s = StyleSheet.create({
  page: {
    flexDirection: 'column', backgroundColor: colors.white,
    paddingHorizontal: 40, paddingVertical: 40, fontFamily: 'Helvetica',
  },
  topBar: {
    width: '100%', height: 4, backgroundColor: colors.coverAccent,
    borderRadius: 2, marginBottom: 40,
  },
  logo: { width: 64, height: 64, marginBottom: 16 },
  brandName: {
    fontSize: fonts.coverTitle, fontWeight: 'bold', color: colors.navy,
    letterSpacing: 6, marginBottom: 4,
  },
  accent: {
    width: 60, height: 2, backgroundColor: colors.coverAccent,
    marginTop: 8, marginBottom: 32,
  },
  reportType: {
    fontSize: 14, color: colors.textMuted, letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 48,
  },
  name: {
    fontSize: 22, fontWeight: 'bold', color: colors.navy, marginBottom: 6,
  },
  cargo: {
    fontSize: 12, color: colors.textSecondary, marginBottom: 4,
  },
  empresa: {
    fontSize: 11, color: colors.textMuted, marginTop: 8,
  },
  bottomArea: { marginTop: 'auto' },
  date: {
    fontSize: 9, color: colors.textMuted, marginBottom: 12,
  },
  confidential: {
    fontSize: 7, color: colors.gray400, letterSpacing: 1,
    textTransform: 'uppercase', paddingTop: 8,
    borderTopWidth: 0.5, borderTopColor: colors.gray300,
  },
});

export default function PdfCover({ logoBase64, nome, cargo, empresa, data, tipo = 'Plano de Desenvolvimento Individual' }) {
  const dataFormatada = data
    ? new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Page size="A4" style={s.page}>
      <View style={s.topBar} />

      {logoBase64 && <Image src={logoBase64} style={s.logo} />}
      <Text style={s.brandName}>VERTHO</Text>
      <View style={s.accent} />
      <Text style={s.reportType}>{tipo}</Text>

      <Text style={s.name}>{nome}</Text>
      <Text style={s.cargo}>{cargo}</Text>
      {empresa && <Text style={s.empresa}>{empresa}</Text>}

      <View style={s.bottomArea}>
        <Text style={s.date}>{dataFormatada}</Text>
        <Text style={s.confidential}>
          Documento confidencial — Uso restrito a colaborador, gestor direto e RH
        </Text>
      </View>
    </Page>
  );
}
