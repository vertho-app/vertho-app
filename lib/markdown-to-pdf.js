/**
 * Renderiza markdown simples em PDF buffer.
 * Suporta: # ## ### títulos, **negrito**, listas - e 1., parágrafos.
 * Útil para gerar versão PDF de artigos/cases armazenados como markdown
 * em micro_conteudos.conteudo_inline.
 */

import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import React from 'react';

const styles = StyleSheet.create({
  page: { padding: 50, fontSize: 11, fontFamily: 'Helvetica', lineHeight: 1.55, color: '#1f2937' },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 12, color: '#0d1426' },
  h2: { fontSize: 16, fontWeight: 700, marginTop: 14, marginBottom: 6, color: '#0d1426' },
  h3: { fontSize: 13, fontWeight: 700, marginTop: 10, marginBottom: 4, color: '#1f2937' },
  paragraph: { marginBottom: 8 },
  listItem: { marginBottom: 4, paddingLeft: 12 },
  meta: { fontSize: 8, color: '#9ca3af', marginBottom: 16 },
  footer: { position: 'absolute', bottom: 20, left: 50, right: 50, textAlign: 'center', fontSize: 8, color: '#9ca3af' },
});

// Sanitiza chars fora WinAnsi (fontes standard pdf-lib não suportam Unicode amplo)
function sanitize(s) {
  return String(s || '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '');
}

// Parse simples: divide por linhas, identifica tipo de cada bloco.
function parseMarkdown(md) {
  const lines = String(md || '').split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }

    if (line.startsWith('### ')) { flush(); blocks.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# ')) { flush(); blocks.push({ type: 'h1', text: line.slice(2) }); continue; }
    if (/^[-*]\s+/.test(line)) { flush(); blocks.push({ type: 'li', text: line.replace(/^[-*]\s+/, '') }); continue; }
    if (/^\d+\.\s+/.test(line)) { flush(); blocks.push({ type: 'li-num', text: line.replace(/^\d+\.\s+/, ''), num: line.match(/^(\d+)/)[1] }); continue; }

    paragraph.push(line);
  }
  flush();
  return blocks;
}

// Renderiza texto com **negrito** parseado em runs
function renderBold(text) {
  const parts = sanitize(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return React.createElement(Text, { key: i, style: { fontWeight: 700 } }, part.slice(2, -2));
    }
    return part;
  });
}

export function MarkdownPDF({ titulo, conteudoMd, meta }) {
  const blocks = parseMarkdown(conteudoMd);
  return React.createElement(Document, { title: titulo },
    React.createElement(Page, { size: 'A4', style: styles.page },
      titulo ? React.createElement(Text, { style: styles.h1 }, sanitize(titulo)) : null,
      meta ? React.createElement(Text, { style: styles.meta }, sanitize(meta)) : null,
      ...blocks.map((b, i) => {
        if (b.type === 'h1') return React.createElement(Text, { key: i, style: styles.h1 }, sanitize(b.text));
        if (b.type === 'h2') return React.createElement(Text, { key: i, style: styles.h2 }, sanitize(b.text));
        if (b.type === 'h3') return React.createElement(Text, { key: i, style: styles.h3 }, sanitize(b.text));
        if (b.type === 'li') return React.createElement(Text, { key: i, style: styles.listItem }, '• ', renderBold(b.text));
        if (b.type === 'li-num') return React.createElement(Text, { key: i, style: styles.listItem }, `${b.num}. `, renderBold(b.text));
        return React.createElement(Text, { key: i, style: styles.paragraph }, renderBold(b.text));
      }),
      React.createElement(Text, { style: styles.footer, fixed: true }, 'Vertho Mentor IA')
    )
  );
}

/**
 * Gera PDF buffer do markdown e retorna Uint8Array.
 */
export async function renderMarkdownPDF({ titulo, conteudoMd, meta }) {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(MarkdownPDF({ titulo, conteudoMd, meta }));
}
