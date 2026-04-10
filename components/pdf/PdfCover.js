import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors } from './styles';

const s = StyleSheet.create({
  page: {
    flexDirection: 'column', backgroundColor: colors.white,
    paddingHorizontal: 50, paddingVertical: 50, fontFamily: 'NotoSans',
  },
  topBar: { width: '100%', height: 3, backgroundColor: colors.coverAccent, marginBottom: 80 },
  // Logo: 3148x744 original → ratio ~4.23:1
  logo: { width: 150, height: 38, marginBottom: 40 },
  accent: { width: 40, height: 2, backgroundColor: colors.coverAccent, marginBottom: 28 },
  reportType: {
    fontSize: 11, color: colors.textMuted, letterSpacing: 1.5,
    textTransform: 'uppercase', marginBottom: 60,
  },
  name: { fontSize: 26, fontWeight: 'bold', color: colors.navy, marginBottom: 4 },
  cargo: { fontSize: 11, color: colors.textSecondary, marginBottom: 2 },
  empresa: { fontSize: 10, color: colors.textMuted, marginTop: 6 },
  bottomArea: {
    marginTop: 'auto', paddingTop: 20,
    borderTopWidth: 0.5, borderTopColor: colors.gray200,
  },
  date: { fontSize: 8, color: colors.textMuted, marginBottom: 6 },
  confidential: {
    fontSize: 6.5, color: colors.gray400, letterSpacing: 0.8, textTransform: 'uppercase',
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
      <View style={s.accent} />
      <Text style={s.reportType}>{tipo}</Text>

      <Text style={s.name}>{nome}</Text>
      <Text style={s.cargo}>{cargo}</Text>
      {empresa && <Text style={s.empresa}>{empresa}</Text>}

      <View style={s.bottomArea}>
        <Text style={s.date}>{dataFormatada}</Text>
        <Text style={s.confidential}>Confidencial  |  Uso restrito a colaborador, gestor direto e RH</Text>
      </View>
    </Page>
  );
}
