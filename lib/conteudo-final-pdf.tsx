/**
 * Gera o "conteúdo final" entregável (PDF premium branded) a partir do
 * markdown de micro_conteudos.conteudo_inline.
 *
 * Reusa a infra premium dos relatórios (paleta Vertho + NotoSans/Unicode +
 * padrão de capa do PdfCover) em vez do markdown-to-pdf.ts cru (Helvetica,
 * sem marca, que removia acentos). Texto preservado integralmente — o
 * markdown é a fonte única, nada é reescrito.
 *
 * Layout: capa navy (logo + eyebrow competência›descritor + título) →
 * corpo editorial (H1/H2/H3, parágrafos, listas → cards numerados / bullets,
 * blockquotes `>` → pull quotes) → contracapa com logo.
 */

import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import '@/components/pdf/styles'; // registra a fonte NotoSans (efeito colateral)
import { getLogoCoverBase64 } from '@/lib/pdf-assets';

// ── Brand book oficial Vertho ────────────────────────────────────────────────
// Hexes exatos do brand book (não os do mockup PDI). Logo oficial via
// getLogoCoverBase64 (Logo Vertho H claro — alta visibilidade sobre o navy).
const colors = {
  navy: '#142F57',          // azul escuro institucional
  cyan: '#34C5CC',          // ciano/turquesa principal
  cyanLight: '#9AE2E6',     // azul claro suave
  grayBg: '#F4F7FA',        // cinza claro elegante
  textPrimary: '#142F57',
  textSecondary: '#5F6B7A', // cinza texto secundário
  white: '#FFFFFF',
  border: '#E2E8F0',
  gray400: '#94A3B8',
  gray500: '#5F6B7A',
};

// ── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Capa
  cover: { flexDirection: 'column', backgroundColor: colors.navy, fontFamily: 'NotoSans', position: 'relative' },
  coverAccent1: {
    position: 'absolute', right: -60, top: '36%', width: 230, height: 230,
    borderWidth: 18, borderColor: colors.cyanLight, borderRadius: 115,
  },
  coverAccent2: {
    position: 'absolute', right: 12, top: '42%', width: 145, height: 145,
    borderWidth: 10, borderColor: colors.cyan, borderRadius: 72,
  },
  // Fundo full-bleed gerado por GPT Image + degradê navy (3 camadas) à esquerda.
  // Sem gradiente nativo no @react-pdf: 3 retângulos da esquerda, opacidade
  // decrescente = fade suave. Esquerda escura (texto legível), direita revela a imagem.
  coverImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
  coverScrim1: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '48%', backgroundColor: 'rgba(15,28,57,0.42)' },
  coverScrim2: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '60%', backgroundColor: 'rgba(15,28,57,0.22)' },
  coverScrim3: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '72%', backgroundColor: 'rgba(15,28,57,0.12)' },
  coverTop: { paddingHorizontal: 50, paddingTop: 50 },
  coverLogo: { height: 28, width: 118 },
  coverMiddle: { flex: 1, paddingHorizontal: 50, justifyContent: 'center' },
  coverEyebrow: {
    fontSize: 8.5, fontWeight: 600, color: colors.cyan, letterSpacing: 2.2,
    textTransform: 'uppercase', marginBottom: 14, maxWidth: 320,
  },
  coverTitle: { fontSize: 32, fontWeight: 800, color: colors.white, lineHeight: 1.15, marginBottom: 22, maxWidth: 320 },
  coverDivider: { width: 56, height: 2.2, backgroundColor: colors.cyan, marginBottom: 26 },
  coverMetaRow: { flexDirection: 'row' },
  coverMetaItem: { marginRight: 32 },
  coverMetaLabel: {
    fontSize: 7.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
    letterSpacing: 1, fontWeight: 500, marginBottom: 3,
  },
  coverMetaValue: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 600 },
  coverBottom: {
    paddingHorizontal: 50, paddingVertical: 28, borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', justifyContent: 'space-between',
  },
  coverBottomText: {
    fontSize: 7.5, color: 'rgba(255,255,255,0.35)', letterSpacing: 1,
    textTransform: 'uppercase', fontWeight: 500,
  },

  // Corpo
  page: {
    backgroundColor: colors.white, fontFamily: 'NotoSans',
    paddingTop: 64, paddingBottom: 48, paddingHorizontal: 48,
    fontSize: 10.5, color: colors.textPrimary, lineHeight: 1.55,
  },
  topMeta: {
    position: 'absolute', top: 30, left: 48, right: 48,
    flexDirection: 'row', justifyContent: 'space-between',
    fontSize: 7, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 1,
  },
  footer: {
    position: 'absolute', bottom: 22, left: 48, right: 48,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 6,
  },
  footerText: { fontSize: 7, color: colors.gray500, letterSpacing: 0.4 },

  h1: { fontSize: 18, fontWeight: 800, color: colors.navy, marginTop: 6, marginBottom: 10 },
  h1Rule: { width: 40, height: 2.5, backgroundColor: colors.cyan, marginBottom: 14 },
  h2: { fontSize: 14, fontWeight: 700, color: colors.navy, marginTop: 16, marginBottom: 6 },
  h3: { fontSize: 11.5, fontWeight: 700, color: colors.textSecondary, marginTop: 12, marginBottom: 4 },
  paragraph: { marginBottom: 9, color: colors.textPrimary },

  bulletRow: { flexDirection: 'row', marginBottom: 6, paddingRight: 8 },
  bulletDot: { color: colors.cyan, fontWeight: 700, marginRight: 8, fontSize: 11 },
  bulletText: { flex: 1, color: colors.textPrimary },

  numCard: {
    flexDirection: 'row', marginBottom: 8, padding: 10,
    backgroundColor: colors.grayBg, borderRadius: 6,
    borderLeftWidth: 3, borderLeftColor: colors.cyan,
  },
  numBadge: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: colors.navy,
    color: colors.white, fontSize: 9.5, fontWeight: 700,
    textAlign: 'center', paddingTop: 4, marginRight: 10,
  },
  numText: { flex: 1, color: colors.textPrimary, paddingTop: 2 },

  quote: {
    marginVertical: 12, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: colors.grayBg, borderLeftWidth: 3, borderLeftColor: colors.cyan, borderRadius: 4,
  },
  quoteText: { fontSize: 12.5, fontStyle: 'italic', color: colors.navy, fontWeight: 600, lineHeight: 1.45 },

  bold: { fontWeight: 700 },
});

// ── Parser markdown ──────────────────────────────────────────────────────────
type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] };

function parse(md: string, { skipFirstH1 = false }: { skipFirstH1?: boolean } = {}): Block[] {
  const lines = String(md || '').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let ul: string[] = [];
  let ol: string[] = [];
  let firstH1Skipped = !skipFirstH1;

  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  const flushUl = () => { if (ul.length) { blocks.push({ type: 'ul', items: ul }); ul = []; } };
  const flushOl = () => { if (ol.length) { blocks.push({ type: 'ol', items: ol }); ol = []; } };
  const flushAll = () => { flushPara(); flushUl(); flushOl(); };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushAll(); continue; }
    if (/^([-*_])\1{2,}$/.test(line)) { flushAll(); continue; } // hr

    if (line.startsWith('### ')) { flushAll(); blocks.push({ type: 'h3', text: line.slice(4) }); continue; }
    if (line.startsWith('## ')) { flushAll(); blocks.push({ type: 'h2', text: line.slice(3) }); continue; }
    if (line.startsWith('# ')) {
      flushAll();
      if (!firstH1Skipped) { firstH1Skipped = true; continue; }
      blocks.push({ type: 'h1', text: line.slice(2) });
      continue;
    }
    if (line.startsWith('> ')) { flushPara(); flushUl(); flushOl(); blocks.push({ type: 'quote', text: line.slice(2) }); continue; }
    if (/^[-*]\s+/.test(line)) { flushPara(); flushOl(); ul.push(line.replace(/^[-*]\s+/, '')); continue; }
    if (/^\d+\.\s+/.test(line)) { flushPara(); flushUl(); ol.push(line.replace(/^\d+\.\s+/, '')); continue; }

    flushUl(); flushOl();
    para.push(line);
  }
  flushAll();
  return blocks;
}

// Renderiza **negrito** inline
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? React.createElement(Text, { key: i, style: s.bold }, part.slice(2, -2))
      : part
  );
}

// ── Documento ────────────────────────────────────────────────────────────────
interface Params {
  titulo: string;
  conteudoMd: string;
  competencia?: string | null;
  descritor?: string | null;
  formato?: string | null;
  empresaNome?: string | null;
  locale?: string;
  /** Fundo de capa gerado por GPT Image (data URI). Sem ele, cai no fundo vetorial. */
  coverBase64?: string | null;
}

export function ConteudoFinalPDF({ titulo, conteudoMd, competencia, descritor, empresaNome, locale = 'pt-BR', coverBase64 }: Params) {
  const logo = getLogoCoverBase64();
  const blocks = parse(conteudoMd, { skipFirstH1: Boolean(titulo) });
  const eyebrow = [competencia, descritor].filter(Boolean).join('  ›  ') || 'Conteúdo de desenvolvimento';
  const dataFmt = new Date().toLocaleDateString(locale, { day: '2-digit', month: 'long', year: 'numeric' });

  return React.createElement(Document, { title: titulo, author: 'Vertho' },
    // Capa
    React.createElement(Page, { size: 'A4', style: s.cover },
      // Fundo: imagem GPT Image full-bleed + scrim navy à esquerda. Sem imagem,
      // usa os anéis vetoriais à direita (fallback). Em ambos, o texto fica numa
      // coluna esquerda com maxWidth, então nunca colide com o visual à direita.
      coverBase64
        ? React.createElement(React.Fragment, null,
            React.createElement(Image, { src: coverBase64, style: s.coverImage, fixed: true }),
            React.createElement(View, { style: s.coverScrim3, fixed: true }),
            React.createElement(View, { style: s.coverScrim2, fixed: true }),
            React.createElement(View, { style: s.coverScrim1, fixed: true }),
          )
        : React.createElement(React.Fragment, null,
            React.createElement(View, { style: s.coverAccent1, fixed: true }),
            React.createElement(View, { style: s.coverAccent2, fixed: true }),
          ),
      React.createElement(View, { style: s.coverTop },
        logo ? React.createElement(Image, { src: logo, style: s.coverLogo }) : null,
      ),
      React.createElement(View, { style: s.coverMiddle },
        React.createElement(Text, { style: s.coverEyebrow }, eyebrow),
        React.createElement(Text, { style: s.coverTitle }, titulo),
        React.createElement(View, { style: s.coverDivider }),
        React.createElement(View, { style: s.coverMetaRow },
          empresaNome
            ? React.createElement(View, { style: s.coverMetaItem },
                React.createElement(Text, { style: s.coverMetaLabel }, 'Organização'),
                React.createElement(Text, { style: s.coverMetaValue }, empresaNome),
              )
            : null,
          React.createElement(View, { style: s.coverMetaItem },
            React.createElement(Text, { style: s.coverMetaLabel }, 'Data'),
            React.createElement(Text, { style: s.coverMetaValue }, dataFmt),
          ),
        ),
      ),
      React.createElement(View, { style: s.coverBottom },
        React.createElement(Text, { style: s.coverBottomText }, 'Material de desenvolvimento'),
        React.createElement(Text, { style: s.coverBottomText }, 'vertho.ai'),
      ),
    ),

    // Corpo
    React.createElement(Page, { size: 'A4', style: s.page },
      React.createElement(View, { style: s.topMeta, fixed: true },
        React.createElement(Text, null, eyebrow),
        React.createElement(Text, { render: ({ pageNumber }: any) => String(pageNumber) }),
      ),
      ...blocks.flatMap((b, i) => {
        if (b.type === 'h1') {
          return [
            React.createElement(Text, { key: i, style: s.h1 }, b.text),
            React.createElement(View, { key: `${i}r`, style: s.h1Rule }),
          ];
        }
        if (b.type === 'h2') return [React.createElement(Text, { key: i, style: s.h2 }, b.text)];
        if (b.type === 'h3') return [React.createElement(Text, { key: i, style: s.h3 }, b.text)];
        if (b.type === 'quote') {
          return [React.createElement(View, { key: i, style: s.quote, wrap: false },
            React.createElement(Text, { style: s.quoteText }, inline(b.text)),
          )];
        }
        if (b.type === 'ul') {
          return b.items.map((it, j) =>
            React.createElement(View, { key: `${i}-${j}`, style: s.bulletRow, wrap: false },
              React.createElement(Text, { style: s.bulletDot }, '•'),
              React.createElement(Text, { style: s.bulletText }, inline(it)),
            )
          );
        }
        if (b.type === 'ol') {
          return b.items.map((it, j) =>
            React.createElement(View, { key: `${i}-${j}`, style: s.numCard, wrap: false },
              React.createElement(Text, { style: s.numBadge }, String(j + 1)),
              React.createElement(Text, { style: s.numText }, inline(it)),
            )
          );
        }
        return [React.createElement(Text, { key: i, style: s.paragraph }, inline(b.text))];
      }),
      React.createElement(View, { style: s.footer, fixed: true },
        React.createElement(Text, { style: s.footerText }, 'Vertho Mentor IA'),
        React.createElement(Text, { style: s.footerText }, 'vertho.ai'),
      ),
    ),
  );
}

export async function renderConteudoFinalPDF(params: Params): Promise<Uint8Array> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(ConteudoFinalPDF(params));
}

export type { Params as ConteudoFinalPDFParams };
