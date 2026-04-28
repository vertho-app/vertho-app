import React from 'react';
import { Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { colors, fonts } from './styles';

const s = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: colors.navy,
    fontFamily: 'NotoSans',
    position: 'relative',
  },
  // Decorações geométricas no fundo (círculos cyan da paleta brand)
  // react-pdf ignora opacity em borderColor — usa hex sólido direto.
  accent1: {
    position: 'absolute',
    right: -60,
    top: '38%',
    width: 230,
    height: 230,
    borderWidth: 18,
    borderColor: colors.cyanLight, // #9AE2E6
    borderRadius: 115,
  },
  accent2: {
    position: 'absolute',
    right: 12,
    top: '44%',
    width: 145,
    height: 145,
    borderWidth: 10,
    borderColor: colors.cyan, // #34C5CC
    borderRadius: 72,
  },
  // Topo (logo) — ratio fixo do "Logo Vertho H claro" (~4.23:1)
  top: { paddingHorizontal: 50, paddingTop: 50 },
  logo: { height: 28, width: 118 },
  // Meio (título principal)
  middle: {
    flex: 1,
    paddingHorizontal: 50,
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 8.5,
    fontWeight: 600,
    color: colors.cyan,
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  name: {
    fontSize: 48,
    fontWeight: 800,
    color: colors.white,
    lineHeight: 1.1,
    marginBottom: 22,
  },
  role: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 32,
  },
  divider: {
    width: 56,
    height: 2.2,
    backgroundColor: colors.cyan,
    marginBottom: 32,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 28,
  },
  metaItem: { marginRight: 28 },
  metaLabel: {
    fontSize: 7.5,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: 500,
    marginBottom: 3,
  },
  metaValue: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: 600,
  },
  // Base (rodapé navy com confidencial)
  bottom: {
    paddingHorizontal: 50,
    paddingVertical: 28,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bottomText: {
    fontSize: 7.5,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontWeight: 500,
  },
});

interface PdfCoverProps {
  logoBase64?: string;
  nome?: string;
  cargo?: string;
  empresa?: string;
  data?: string | Date;
  tipo?: string;
  ciclo?: string;
}

export default function PdfCover({
  logoBase64,
  nome,
  cargo,
  empresa,
  data,
  tipo = 'Plano de Desenvolvimento Individual',
  ciclo = '30 dias',
}: PdfCoverProps) {
  const dataFormatada = data
    ? new Date(data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const cargoLine = [cargo, empresa].filter(Boolean).join(' · ');
  const primeiroNome = (nome || '').split(' ')[0] || nome;

  return (
    <Page size="A4" style={s.page}>
      {/* Decorações geométricas */}
      <View style={s.accent1} fixed />
      <View style={s.accent2} fixed />

      <View style={s.top}>
        {logoBase64 && <Image src={logoBase64} style={s.logo} />}
      </View>

      <View style={s.middle}>
        <Text style={s.eyebrow}>{tipo}</Text>
        <Text style={s.name}>{primeiroNome}</Text>
        {cargoLine && <Text style={s.role}>{cargoLine}</Text>}
        <View style={s.divider} />
        <View style={s.metaRow}>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Data</Text>
            <Text style={s.metaValue}>{dataFormatada}</Text>
          </View>
        </View>
      </View>

      <View style={s.bottom}>
        <Text style={s.bottomText}>Confidencial — Uso restrito a colaborador, gestor e RH</Text>
        <Text style={s.bottomText}>vertho.ai</Text>
      </View>
    </Page>
  );
}

// Contracapa: navy com logo grande + linha de status
export function PdfBackCover({ logoBase64 }: { logoBase64?: string }) {
  const bs = StyleSheet.create({
    page: {
      flexDirection: 'column',
      backgroundColor: colors.navy,
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'NotoSans',
      gap: 20,
    },
    logo: { height: 60, width: 254, opacity: 0.85 },
    line: {
      fontSize: 8,
      color: 'rgba(255,255,255,0.3)',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      fontWeight: 500,
      marginTop: 16,
    },
  });

  return (
    <Page size="A4" style={bs.page}>
      {logoBase64 && <Image src={logoBase64} style={bs.logo} />}
      <Text style={bs.line}>Vertho Mentor IA · vertho.ai</Text>
    </Page>
  );
}
