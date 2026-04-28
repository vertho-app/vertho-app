// components/pdf/RelatorioTemplate.js — A4 PDF template wrapper for Vertho reports

import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { pageStyles, colors } from './styles';

/**
 * Reusable A4 report template with Vertho header and footer.
 * @param {object} props
 * @param {string} [props.title] - Optional document title (metadata)
 * @param {React.ReactNode} props.children - Page content
 */
export default function RelatorioTemplate({ title, children }: { title?: string; children: React.ReactNode }) {
  const today = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <Document title={title || 'Relatório Vertho'}>
      <Page size="A4" style={pageStyles.page}>
        {/* Header */}
        <View style={pageStyles.header} fixed>
          <Text style={pageStyles.headerLabel}>VERTHO</Text>
          <Text style={pageStyles.headerLabel}>{today}</Text>
        </View>

        {/* Content */}
        <View style={(pageStyles as any).content}>{children}</View>

        {/* Footer */}
        <View style={pageStyles.footer} fixed>
          <Text style={pageStyles.footerText}>
            Vertho Mentor IA — Confidencial
          </Text>
          <Text
            style={pageStyles.footerText}
            render={({ pageNumber, totalPages }) =>
              `Página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
