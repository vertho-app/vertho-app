/**
 * PDF da tela "Temporada Concluída" do colaborador.
 * Usa @react-pdf/renderer (mesma lib do markdown-to-pdf.js).
 */
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import React from 'react';

const styles = StyleSheet.create({
  page: { padding: 44, fontSize: 10, fontFamily: 'Helvetica', lineHeight: 1.5, color: '#1f2937' },
  h1: { fontSize: 22, fontWeight: 700, color: '#0d1426', marginBottom: 4 },
  h2: { fontSize: 13, fontWeight: 700, color: '#0d1426', marginTop: 14, marginBottom: 8, borderBottomWidth: 1, borderColor: '#e5e7eb', paddingBottom: 3 },
  h3: { fontSize: 11, fontWeight: 700, color: '#1f2937', marginTop: 8, marginBottom: 3 },
  eyebrow: { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  subtitle: { fontSize: 10, color: '#6b7280', marginBottom: 14 },
  card: { border: '1 solid #e5e7eb', borderRadius: 4, padding: 8, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  rowLabel: { fontSize: 9, fontWeight: 700 },
  rowValue: { fontSize: 9, color: '#6b7280' },
  statGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  stat: { flex: 1, border: '1 solid #e5e7eb', borderRadius: 4, padding: 8 },
  statLabel: { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontSize: 18, fontWeight: 700, marginTop: 2 },
  quote: { fontSize: 10, fontStyle: 'italic', color: '#374151', borderLeft: '2 solid #06B6D4', paddingLeft: 8, marginVertical: 8 },
  paragraph: { marginBottom: 6 },
  footer: { position: 'absolute', bottom: 20, left: 44, right: 44, textAlign: 'center', fontSize: 8, color: '#9ca3af' },
  pill: { fontSize: 7, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2, marginTop: 2 },
});

// Sanitiza chars fora WinAnsi (fontes Helvetica padrão não suportam todos unicode)
function sanitize(s) {
  return String(s || '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
}

const CONV_COR = {
  evolucao_confirmada: '#059669', // emerald
  evolucao_parcial:    '#D97706', // amber
  estagnacao:          '#6B7280', // gray
  regressao:           '#DC2626', // red
};
const CONV_LABEL = {
  evolucao_confirmada: 'Evolução confirmada',
  evolucao_parcial:    'Evolução parcial',
  estagnacao:          'Estagnação',
  regressao:           'Regressão',
};

export function TemporadaConcluidaPDF({ dados }) {
  const { colab, trilha, evolutionReport, momentos, missoes, sem14 } = dados;
  const descritores = evolutionReport?.descritores || [];
  const resumo = evolutionReport?.resumo || {};
  const firstName = sanitize((colab?.nome || '').split(' ')[0]);

  return React.createElement(Document, { title: `Temporada ${trilha.numeroTemporada} — ${colab.nome}` },
    React.createElement(Page, { size: 'A4', style: styles.page },
      // Cabeçalho
      React.createElement(Text, { style: styles.eyebrow }, `Temporada ${trilha.numeroTemporada} concluida`),
      React.createElement(Text, { style: styles.h1 }, `${firstName}, veja o que mudou em voce`),
      React.createElement(Text, { style: styles.subtitle }, sanitize(`14 semanas dedicadas a ${trilha.competencia}.`)),

      // Resumo numérico
      React.createElement(View, { style: styles.statGrid },
        stat('Confirmadas', resumo.confirmadas || 0, CONV_COR.evolucao_confirmada),
        stat('Parciais', resumo.parciais || 0, CONV_COR.evolucao_parcial),
        stat('Estagnadas', resumo.estagnacoes || 0, CONV_COR.estagnacao),
        stat('Regressoes', resumo.regressoes || 0, CONV_COR.regressao),
      ),

      evolutionReport?.insight_geral && React.createElement(Text, { style: styles.quote },
        `"${sanitize(evolutionReport.insight_geral)}"`
      ),

      // Descritor a descritor
      React.createElement(Text, { style: styles.h2 }, 'Descritor a descritor'),
      ...descritores.map((d, i) => {
        const conv = CONV_LABEL[d.convergencia] || CONV_LABEL.estagnacao;
        const cor = CONV_COR[d.convergencia] || CONV_COR.estagnacao;
        const deltaNum = d.nota_pos - d.nota_pre;
        const delta = deltaNum.toFixed(1);
        return React.createElement(View, { key: i, style: styles.card, wrap: false },
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.rowLabel }, sanitize(d.descritor)),
            React.createElement(Text, { style: { ...styles.rowValue, color: cor, fontWeight: 700 } },
              `${d.nota_pre} → ${d.nota_pos} (${deltaNum > 0 ? '+' : ''}${delta})`
            ),
          ),
          React.createElement(Text, { style: { ...styles.pill, color: cor } }, sanitize(conv)),
          d.antes && React.createElement(Text, { style: { ...styles.rowValue, marginTop: 3 } },
            `Antes: ${sanitize(d.antes)}`
          ),
          d.depois && React.createElement(Text, { style: { ...styles.rowValue, color: '#374151' } },
            `Depois: ${sanitize(d.depois)}`
          ),
        );
      }),

      // Momentos de insight
      momentos?.length > 0 && React.createElement(Text, { style: styles.h2 }, 'Momentos de insight'),
      ...(momentos || []).map((m, i) =>
        React.createElement(View, { key: i, style: styles.card, wrap: false },
          React.createElement(Text, { style: styles.eyebrow }, `Semana ${m.semana} - ${sanitize(m.descritor || '')}`),
          React.createElement(Text, { style: { fontSize: 10, fontStyle: 'italic', color: '#374151' } },
            sanitize(m.insight)
          ),
        )
      ),

      // Missões
      missoes?.length > 0 && React.createElement(Text, { style: styles.h2 }, 'Missoes executadas'),
      ...(missoes || []).map((m, i) =>
        React.createElement(View, { key: i, style: styles.card, wrap: false },
          React.createElement(Text, { style: styles.eyebrow }, `Semana ${m.semana} - ${m.modo === 'pratica' ? 'Missao real' : 'Cenario escrito'}`),
          m.compromisso && React.createElement(Text, { style: { ...styles.rowValue, color: '#374151' } },
            `Compromisso: ${sanitize(m.compromisso)}`
          ),
          m.sintese && React.createElement(Text, { style: styles.rowValue },
            `Sintese: ${sanitize(m.sintese)}`
          ),
        )
      ),

      // Avaliação final
      sem14 && React.createElement(Text, { style: styles.h2 }, 'Avaliacao final'),
      sem14?.resumo_avaliacao && React.createElement(View, { style: styles.card },
        React.createElement(Text, { style: styles.h3 }, 'Devolutiva'),
        React.createElement(Text, null, sanitize(sem14.resumo_avaliacao)),
        sem14.nota_media_pos != null && React.createElement(Text, { style: { ...styles.rowValue, marginTop: 4 } },
          `Nota media pos-temporada: ${Number(sem14.nota_media_pos).toFixed(1)}/4.0`
        ),
      ),

      // Próximos passos
      evolutionReport?.proximo_passo && React.createElement(Text, { style: styles.h2 }, 'Proximos passos'),
      evolutionReport?.proximo_passo && React.createElement(Text, { style: styles.paragraph },
        sanitize(evolutionReport.proximo_passo)
      ),

      React.createElement(Text, { style: styles.footer, fixed: true }, 'Vertho Mentor IA'),
    )
  );
}

function stat(label, valor, cor) {
  return React.createElement(View, { style: styles.stat },
    React.createElement(Text, { style: styles.statLabel }, label),
    React.createElement(Text, { style: { ...styles.statValue, color: cor } }, String(valor)),
  );
}

export async function renderTemporadaConcluidaPDF(dados) {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(TemporadaConcluidaPDF({ dados }));
}
