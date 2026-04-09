import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts, lh } from './styles';

const s = StyleSheet.create({
  page: {
    flexDirection: 'column', backgroundColor: colors.white,
    paddingHorizontal: 34, paddingTop: 34, paddingBottom: 30,
    fontFamily: 'Inter', alignItems: 'center', justifyContent: 'center',
  },
  logo: { width: 90, marginBottom: 18 },
  title: {
    fontWeight: 700, fontSize: fonts.coverTitle, color: colors.titleStrong,
    textAlign: 'center', lineHeight: lh.sectionTitle, marginBottom: 18,
  },
  name: {
    fontWeight: 600, fontSize: fonts.coverName, color: '#111827',
    textAlign: 'center', lineHeight: lh.coverName, marginBottom: 6,
  },
  cargo: {
    fontWeight: 500, fontSize: fonts.coverCargo, color: colors.textSecondary,
    textAlign: 'center', marginBottom: 2,
  },
  empresa: {
    fontSize: fonts.coverEmpresa, color: colors.textSecondary,
    textAlign: 'center', marginBottom: 2,
  },
  date: {
    fontSize: fonts.coverDate, color: colors.textMuted,
    textAlign: 'center', marginBottom: 24,
  },
  seal: {
    fontWeight: 500, fontSize: fonts.coverSeal, color: colors.textMuted,
    textAlign: 'center', paddingVertical: 6, paddingHorizontal: 10,
    borderWidth: 1, borderColor: colors.borderLight, borderRadius: 6,
  },
});

export default function PdfCover({ logoBase64, nome, cargo, empresa, data }) {
  const dataFormatada = data
    ? new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Page size="A4" style={s.page}>
      {logoBase64 && <Image src={logoBase64} style={s.logo} />}
      <Text style={s.title}>PLANO DE DESENVOLVIMENTO INDIVIDUAL</Text>
      <Text style={s.name}>{nome}</Text>
      <Text style={s.cargo}>{cargo}</Text>
      {empresa && <Text style={s.empresa}>{empresa}</Text>}
      <Text style={s.date}>{dataFormatada}</Text>
      <Text style={s.seal}>{'CONFIDENCIAL | USO RESTRITO A COLABORADOR, GESTOR DIRETO E RH'}</Text>
    </Page>
  );
}
