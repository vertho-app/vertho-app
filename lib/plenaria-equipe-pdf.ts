/**
 * PDF de Plenária da Equipe — relatório consolidado pro gestor apresentar
 * pra RH/direção. Uma página de sumário + 1 bloco por liderado com evolução.
 */
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import React from 'react';

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10, fontFamily: 'Helvetica', lineHeight: 1.5, color: '#1f2937' },
  h1: { fontSize: 22, fontWeight: 700, color: '#0d1426', marginBottom: 4 },
  h2: { fontSize: 13, fontWeight: 700, color: '#0d1426', marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 3 },
  h3: { fontSize: 11, fontWeight: 700, marginTop: 6, marginBottom: 3 },
  eyebrow: { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 },
  subtitle: { fontSize: 10, color: '#6b7280', marginBottom: 14 },
  statGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  stat: { flex: 1, border: '1 solid #e5e7eb', borderRadius: 4, padding: 6 },
  statLabel: { fontSize: 7, color: '#9ca3af', textTransform: 'uppercase' },
  statValue: { fontSize: 15, fontWeight: 700, marginTop: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  small: { fontSize: 9, color: '#6b7280' },
  card: { border: '1 solid #e5e7eb', borderRadius: 4, padding: 8, marginBottom: 6 },
  pill: { fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
  footer: { position: 'absolute', bottom: 20, left: 44, right: 44, textAlign: 'center', fontSize: 8, color: '#9ca3af' },
});

function sanitize(s) {
  return String(s || '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
}

const COR = {
  em_andamento:         '#0891B2', // cyan
  evolucao_confirmada:  '#059669',
  evolucao_parcial:     '#D97706',
  estagnacao:           '#6B7280',
  regressao:            '#DC2626',
  sem_trilha:           '#9CA3AF',
  arquivada:            '#9CA3AF',
};
const LABEL = {
  em_andamento:         'Em andamento',
  evolucao_confirmada:  'Evolucao confirmada',
  evolucao_parcial:     'Evolucao parcial',
  estagnacao:           'Estagnacao',
  regressao:            'Regressao',
  sem_trilha:           'Sem trilha',
  arquivada:            'Arquivada',
};

export function PlenariaEquipePDF({ gestorNome, empresa, resumo, rows }) {
  return React.createElement(Document, { title: `Plenaria - ${empresa || 'Equipe'}` },
    React.createElement(Page, { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.eyebrow }, 'Plenaria de evolucao da equipe'),
      React.createElement(Text, { style: styles.h1 }, sanitize(empresa || 'Equipe')),
      gestorNome && React.createElement(Text, { style: styles.subtitle }, `Gestor: ${sanitize(gestorNome)}`),

      // Sumário
      React.createElement(Text, { style: styles.h2 }, 'Sumario'),
      React.createElement(View, { style: styles.statGrid },
        stat('Total', resumo.total || 0, '#0d1426'),
        stat('Confirmadas', resumo.evolucaoConfirmada || 0, COR.evolucao_confirmada),
        stat('Parciais', resumo.evolucaoParcial || 0, COR.evolucao_parcial),
        stat('Em andamento', resumo.emAndamento || 0, COR.em_andamento),
      ),
      React.createElement(View, { style: styles.statGrid },
        stat('Estagnacao', resumo.estagnacao || 0, COR.estagnacao),
        stat('Regressao', resumo.regressao || 0, COR.regressao),
        stat('Sem trilha', resumo.semTrilha || 0, COR.sem_trilha),
        React.createElement(View, { style: { flex: 1 } }),
      ),

      // Cada liderado
      React.createElement(Text, { style: styles.h2 }, 'Liderados'),
      ...rows.map((r, i) => {
        const cor = COR[r.status] || COR.sem_trilha;
        const label = LABEL[r.status] || r.status;
        return React.createElement(View, { key: i, style: styles.card, wrap: false },
          React.createElement(View, { style: styles.row },
            React.createElement(View, { style: { flex: 1 } },
              React.createElement(Text, { style: { fontWeight: 700, fontSize: 10 } }, sanitize(r.colab)),
              React.createElement(Text, { style: styles.small }, sanitize(`${r.cargo || '-'}${r.competencia ? ' - ' + r.competencia : ''}`)),
            ),
            React.createElement(View, { style: { alignItems: 'flex-end' } },
              r.delta != null && React.createElement(Text, { style: { fontSize: 9, color: cor, fontWeight: 700 } },
                `${r.mediaPre.toFixed(1)} -> ${r.mediaPos.toFixed(1)} (${r.delta > 0 ? '+' : ''}${r.delta.toFixed(1)})`
              ),
              React.createElement(Text, { style: { ...styles.pill, color: cor, marginTop: 2 } }, sanitize(label)),
            ),
          ),
        );
      }),

      React.createElement(Text, { style: styles.footer, fixed: true },
        `Vertho Mentor IA - Gerado em ${new Date().toLocaleDateString('pt-BR')}`
      ),
    )
  );
}

function stat(label, valor, cor) {
  return React.createElement(View, { style: styles.stat },
    React.createElement(Text, { style: styles.statLabel }, label),
    React.createElement(Text, { style: { ...styles.statValue, color: cor } }, String(valor)),
  );
}

export async function renderPlenariaEquipePDF(payload) {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(PlenariaEquipePDF(payload));
}
