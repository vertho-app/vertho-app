/**
 * Gera o "conteúdo final" entregável (PDF premium branded) a partir do
 * markdown de micro_conteudos.conteudo_inline.
 *
 * Reusa a infra premium dos relatórios (paleta Vertho + NotoSans/Unicode +
 * padrão de capa do PdfCover). Texto preservado integralmente — o markdown é a
 * fonte única, nada é reescrito.
 *
 * Dois modos de corpo:
 *  1) PLANO EDITORIAL (lib/conteudo-layout-plan): se um `plan` é fornecido,
 *     renderiza páginas com função distinta (contexto, conceito, exemplo,
 *     comparativo, ferramenta, aplicação, reflexão) e tratamentos visuais
 *     ricos (pull quote, cards numerados, fluxo, checklist, box de síntese,
 *     comparativo lado a lado, cards de reflexão). O texto vem dos blocos por
 *     id — a IA só decide layout.
 *  2) FALLBACK FLAT: sem plano, corre o markdown numa página única (H1/H2/H3,
 *     parágrafos, listas → cards/bullets, blockquotes → pull quotes).
 */

import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import '@/components/pdf/styles'; // registra a fonte NotoSans (efeito colateral)
import { getLogoCoverBase64, getLogoDarkBase64 } from '@/lib/pdf-assets';
import { parseBlocks } from '@/lib/conteudo-layout-plan';
import type { RawBlock, LayoutPlan, PlanItem, PageRole } from '@/lib/conteudo-layout-plan';

// ── Brand book oficial Vertho ────────────────────────────────────────────────
const colors = {
  navy: '#142F57',
  cyan: '#34C5CC',
  cyanLight: '#9AE2E6',
  grayBg: '#F4F7FA',
  textPrimary: '#142F57',
  textSecondary: '#5F6B7A',
  white: '#FFFFFF',
  border: '#E2E8F0',
  gray400: '#94A3B8',
  gray500: '#5F6B7A',
};

// ── Estilos ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  // Capa
  cover: { flexDirection: 'column', backgroundColor: colors.navy, fontFamily: 'NotoSans', position: 'relative' },
  coverAccent1: { position: 'absolute', right: -60, top: '36%', width: 230, height: 230, borderWidth: 18, borderColor: colors.cyanLight, borderRadius: 115 },
  coverAccent2: { position: 'absolute', right: 12, top: '42%', width: 145, height: 145, borderWidth: 10, borderColor: colors.cyan, borderRadius: 72 },
  coverImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
  coverScrim1: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '48%', backgroundColor: 'rgba(15,28,57,0.42)' },
  coverScrim2: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '60%', backgroundColor: 'rgba(15,28,57,0.22)' },
  coverScrim3: { position: 'absolute', top: 0, left: 0, bottom: 0, width: '72%', backgroundColor: 'rgba(15,28,57,0.12)' },
  coverTop: { paddingHorizontal: 50, paddingTop: 50 },
  coverLogo: { height: 28, width: 118 },
  coverMiddle: { flex: 1, paddingHorizontal: 50, justifyContent: 'center' },
  coverCompetencia: { fontSize: 11, fontWeight: 700, color: colors.cyan, letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 5, maxWidth: 340 },
  coverDescritor: { fontSize: 8.5, fontWeight: 600, color: colors.cyanLight, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14, maxWidth: 320 },
  coverTitle: { fontSize: 32, fontWeight: 800, color: colors.white, lineHeight: 1.15, marginBottom: 22, maxWidth: 320 },
  coverDivider: { width: 56, height: 2.2, backgroundColor: colors.cyan, marginBottom: 26 },
  coverMetaRow: { flexDirection: 'row' },
  coverMetaItem: { marginRight: 32 },
  coverMetaLabel: { fontSize: 7.5, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500, marginBottom: 3 },
  coverMetaValue: { fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: 600 },
  coverBottom: { paddingHorizontal: 50, paddingVertical: 28, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', justifyContent: 'space-between' },
  coverBottomText: { fontSize: 7.5, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 500 },

  // Corpo
  page: { backgroundColor: colors.white, fontFamily: 'NotoSans', paddingTop: 64, paddingBottom: 48, paddingHorizontal: 48, fontSize: 10.5, color: colors.textPrimary, lineHeight: 1.55 },
  topMeta: { position: 'absolute', top: 30, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 1 },
  footer: { position: 'absolute', bottom: 22, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 6 },
  footerText: { fontSize: 7, color: colors.gray500, letterSpacing: 0.4 },

  h1: { fontSize: 18, fontWeight: 800, color: colors.navy, marginTop: 6, marginBottom: 10 },
  h1Rule: { width: 40, height: 2.5, backgroundColor: colors.cyan, marginBottom: 14 },
  h2: { fontSize: 14, fontWeight: 700, color: colors.navy, marginTop: 16, marginBottom: 6 },
  h3: { fontSize: 11.5, fontWeight: 700, color: colors.textSecondary, marginTop: 12, marginBottom: 4 },
  paragraph: { marginBottom: 9, color: colors.textPrimary },

  bulletRow: { flexDirection: 'row', marginBottom: 6, paddingRight: 8 },
  bulletDot: { color: colors.cyan, fontWeight: 700, marginRight: 8, fontSize: 11 },
  bulletText: { flex: 1, color: colors.textPrimary },

  numCard: { flexDirection: 'row', marginBottom: 8, padding: 10, backgroundColor: colors.grayBg, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: colors.cyan },
  numBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.navy, color: colors.white, fontSize: 9.5, fontWeight: 700, textAlign: 'center', paddingTop: 4, marginRight: 10 },
  numText: { flex: 1, color: colors.textPrimary, paddingTop: 2 },

  quote: { marginVertical: 12, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: colors.grayBg, borderLeftWidth: 3, borderLeftColor: colors.cyan, borderRadius: 4 },
  quoteText: { fontSize: 12.5, fontStyle: 'italic', color: colors.navy, fontWeight: 600, lineHeight: 1.45 },

  bold: { fontWeight: 700 },

  // ── Plano editorial ──────────────────────────────────────────────────────
  roleHeader: { marginBottom: 16 },
  roleEyebrow: { fontSize: 8.5, fontWeight: 700, color: colors.cyan, letterSpacing: 2.4, textTransform: 'uppercase' },
  roleRule: { width: 34, height: 2, backgroundColor: colors.cyan, marginTop: 6 },

  hero: { marginHorizontal: -48, marginTop: -64, marginBottom: 22, height: 230, position: 'relative' },
  heroImg: { width: '100%', height: '100%', objectFit: 'cover' },
  heroScrim: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(15,28,57,0.5)' },
  heroTextWrap: { position: 'absolute', left: 48, right: 48, bottom: 20 },
  heroEyebrow: { fontSize: 9, fontWeight: 700, color: colors.cyanLight, letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 5 },

  pullBig: { marginVertical: 16, paddingLeft: 18, borderLeftWidth: 3, borderLeftColor: colors.cyan },
  pullBigText: { fontSize: 15.5, fontWeight: 700, fontStyle: 'italic', color: colors.navy, lineHeight: 1.38 },

  synthBox: { marginVertical: 12, padding: 14, backgroundColor: colors.grayBg, borderRadius: 8, borderWidth: 0.8, borderColor: colors.cyanLight },
  synthLabel: { fontSize: 7.5, fontWeight: 700, color: colors.cyan, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 5 },
  synthText: { color: colors.textPrimary, lineHeight: 1.5 },

  checkRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  checkBox: { width: 11, height: 11, borderWidth: 1.4, borderColor: colors.cyan, borderRadius: 2.5, marginRight: 10, marginTop: 2.5 },
  checkText: { flex: 1, color: colors.textPrimary },

  flowStep: { flexDirection: 'row' },
  flowRail: { width: 20, alignItems: 'center' },
  flowBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.navy, color: colors.white, fontSize: 9.5, fontWeight: 700, textAlign: 'center', paddingTop: 4 },
  flowLine: { width: 1.4, flexGrow: 1, backgroundColor: colors.cyanLight, marginVertical: 3 },
  flowBody: { flex: 1, paddingLeft: 12, paddingBottom: 14 },
  flowText: { color: colors.textPrimary, lineHeight: 1.5 },

  reflectCard: { marginBottom: 12, padding: 16, backgroundColor: colors.grayBg, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: colors.cyan },
  reflectMark: { fontSize: 15, color: colors.cyan, fontWeight: 800, marginBottom: 4 },
  reflectText: { color: colors.navy, fontSize: 11.5, lineHeight: 1.5 },

  cmpRow: { flexDirection: 'row', marginVertical: 12 },
  cmpCol: { flex: 1, padding: 12, backgroundColor: colors.grayBg, borderRadius: 8 },
  cmpColLeft: { marginRight: 6 },
  cmpColRight: { marginLeft: 6 },
  cmpLabel: { fontSize: 8, fontWeight: 700, color: colors.white, backgroundColor: colors.navy, letterSpacing: 1.2, textTransform: 'uppercase', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 4, marginBottom: 8, alignSelf: 'flex-start' },
  cmpText: { fontSize: 9.5, color: colors.textPrimary, lineHeight: 1.45, marginBottom: 5 },

  caseCard: { marginVertical: 12, padding: 14, backgroundColor: colors.white, borderWidth: 0.8, borderColor: colors.border, borderLeftWidth: 3, borderLeftColor: colors.navy, borderRadius: 8 },
  caseLabel: { fontSize: 7.5, fontWeight: 700, color: colors.navy, letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 6 },
  caseText: { color: colors.textPrimary, lineHeight: 1.5, marginBottom: 4 },

  closing: { marginTop: 36, alignItems: 'center' },
  closingDivider: { width: 40, height: 2, backgroundColor: colors.cyan, marginBottom: 18 },
  closingLogo: { height: 24, width: 100 },
  closingTagline: { fontSize: 7.5, color: colors.gray400, letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 10 },
});

// Renderiza **negrito** inline
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? React.createElement(Text, { key: i, style: s.bold }, part.slice(2, -2))
      : part
  );
}

const ROLE_LABEL: Record<PageRole, string> = {
  contexto: 'Contexto',
  conceito: 'Conceito',
  exemplo: 'Na prática',
  comparativo: 'Comparativo',
  ferramenta: 'Ferramenta',
  aplicacao: 'Aplicação',
  cuidados: 'Cuidados',
  sintese: 'Síntese',
  reflexao: 'Para refletir',
  corpo: '',
};

// ── Renderização de blocos por tratamento ─────────────────────────────────────
const e = React.createElement;

function headingNodes(b: RawBlock, key: string): React.ReactNode[] {
  if (b.kind === 'h1') {
    return [e(Text, { key, style: s.h1 }, (b as any).text), e(View, { key: `${key}r`, style: s.h1Rule })];
  }
  if (b.kind === 'h2') return [e(Text, { key, style: s.h2 }, (b as any).text)];
  if (b.kind === 'h3') return [e(Text, { key, style: s.h3 }, (b as any).text)];
  // não é heading → trata como parágrafo
  return [e(Text, { key, style: s.paragraph }, inline(blockText(b)))];
}

function blockText(b: RawBlock): string {
  return b.kind === 'ul' || b.kind === 'ol' ? (b as any).items.join(' ') : (b as any).text;
}

function bulletsNodes(items: string[], key: string): React.ReactNode[] {
  return items.map((it, j) =>
    e(View, { key: `${key}-${j}`, style: s.bulletRow, wrap: false },
      e(Text, { style: s.bulletDot }, '•'),
      e(Text, { style: s.bulletText }, inline(it)),
    )
  );
}

function numberedNodes(items: string[], key: string): React.ReactNode[] {
  return items.map((it, j) =>
    e(View, { key: `${key}-${j}`, style: s.numCard, wrap: false },
      e(Text, { style: s.numBadge }, String(j + 1)),
      e(Text, { style: s.numText }, inline(it)),
    )
  );
}

function flowNodes(items: string[], key: string): React.ReactNode[] {
  return items.map((it, j) =>
    e(View, { key: `${key}-${j}`, style: s.flowStep, wrap: false },
      e(View, { style: s.flowRail },
        e(Text, { style: s.flowBadge }, String(j + 1)),
        j < items.length - 1 ? e(View, { style: s.flowLine }) : null,
      ),
      e(View, { style: s.flowBody }, e(Text, { style: s.flowText }, inline(it))),
    )
  );
}

function checklistNodes(items: string[], key: string): React.ReactNode[] {
  return items.map((it, j) =>
    e(View, { key: `${key}-${j}`, style: s.checkRow, wrap: false },
      e(View, { style: s.checkBox }),
      e(Text, { style: s.checkText }, inline(it)),
    )
  );
}

function reflectionNodes(items: string[], key: string): React.ReactNode[] {
  return items.map((it, j) =>
    e(View, { key: `${key}-${j}`, style: s.reflectCard, wrap: false },
      e(Text, { style: s.reflectMark }, '?'),
      e(Text, { style: s.reflectText }, inline(it)),
    )
  );
}

function caseCardNodes(b: RawBlock, key: string): React.ReactNode[] {
  const body = b.kind === 'ul' || b.kind === 'ol'
    ? (b as any).items.map((it: string, j: number) =>
        e(Text, { key: `${key}-${j}`, style: s.caseText }, inline(it)))
    : [e(Text, { key: `${key}-t`, style: s.caseText }, inline((b as any).text))];
  return [e(View, { key, style: s.caseCard, wrap: false },
    e(Text, { style: s.caseLabel }, 'Na prática'),
    ...body,
  )];
}

function comparisonNodes(
  left: { label?: string; refs: number[] }, right: { label?: string; refs: number[] },
  byId: Map<number, RawBlock>, key: string,
): React.ReactNode {
  const col = (side: { label?: string; refs: number[] }, extraStyle: any, ck: string) =>
    e(View, { key: ck, style: [s.cmpCol, extraStyle] },
      side.label ? e(Text, { style: s.cmpLabel }, side.label) : null,
      ...side.refs.flatMap((r, ri) => {
        const b = byId.get(r);
        if (!b) return [];
        if (b.kind === 'ul' || b.kind === 'ol') {
          return (b as any).items.map((it: string, ii: number) =>
            e(Text, { key: `${ck}-${ri}-${ii}`, style: s.cmpText }, inline(`• ${it}`)));
        }
        return [e(Text, { key: `${ck}-${ri}`, style: s.cmpText }, inline((b as any).text))];
      }),
    );
  return e(View, { key, style: s.cmpRow, wrap: false },
    col(left, s.cmpColLeft, `${key}-l`),
    col(right, s.cmpColRight, `${key}-r`),
  );
}

function renderItem(item: PlanItem, byId: Map<number, RawBlock>, key: string): React.ReactNode[] {
  if (item.as === 'comparison') return [comparisonNodes(item.left, item.right, byId, key)];
  if (item.as === 'pullquoteText') {
    return [e(View, { key, style: s.pullBig, wrap: false }, e(Text, { style: s.pullBigText }, inline(item.text)))];
  }
  const b = byId.get(item.ref);
  if (!b) return [];
  const items = b.kind === 'ul' || b.kind === 'ol' ? (b as any).items as string[] : null;
  switch (item.as) {
    case 'heading': return headingNodes(b, key);
    case 'pullquote':
      return [e(View, { key, style: s.pullBig, wrap: false }, e(Text, { style: s.pullBigText }, inline(blockText(b))))];
    case 'synthesis':
      return [e(View, { key, style: s.synthBox, wrap: false },
        e(Text, { style: s.synthLabel }, 'Síntese'),
        e(Text, { style: s.synthText }, inline(blockText(b))))];
    case 'bullets': return items ? bulletsNodes(items, key) : [e(Text, { key, style: s.paragraph }, inline(blockText(b)))];
    case 'numberedCards': return items ? numberedNodes(items, key) : [e(Text, { key, style: s.paragraph }, inline(blockText(b)))];
    case 'flow': return items ? flowNodes(items, key) : [e(Text, { key, style: s.paragraph }, inline(blockText(b)))];
    case 'checklist': return items ? checklistNodes(items, key) : [e(Text, { key, style: s.paragraph }, inline(blockText(b)))];
    case 'reflectionCards': return items ? reflectionNodes(items, key) : [e(Text, { key, style: s.paragraph }, inline(blockText(b)))];
    case 'caseCard': return caseCardNodes(b, key);
    case 'paragraph':
    default:
      return [e(Text, { key, style: s.paragraph }, inline(blockText(b)))];
  }
}

// ── Página do plano editorial ─────────────────────────────────────────────────
function planPage(
  pg: LayoutPlan['pages'][number], pageIdx: number, byId: Map<number, RawBlock>,
  eyebrow: string, sectionImageBase64: string | null,
): React.ReactNode {
  const roleLabel = ROLE_LABEL[pg.role] || '';
  const hero = pg.heroImage && sectionImageBase64;
  const isReflexao = pg.role === 'reflexao';
  const logoDark = isReflexao ? getLogoDarkBase64() : null;

  return e(Page, { key: `pg-${pageIdx}`, size: 'A4', style: s.page },
    e(View, { style: s.topMeta, fixed: true },
      e(Text, null, eyebrow),
      e(Text, { render: ({ pageNumber }: any) => String(pageNumber) }),
    ),
    // Cabeçalho da seção: banda com imagem (hero) ou eyebrow simples.
    hero
      ? e(View, { style: s.hero },
          e(Image, { src: sectionImageBase64 as string, style: s.heroImg }),
          e(View, { style: s.heroScrim }),
          roleLabel ? e(View, { style: s.heroTextWrap }, e(Text, { style: s.heroEyebrow }, roleLabel)) : null,
        )
      : roleLabel
        ? e(View, { style: s.roleHeader },
            e(Text, { style: s.roleEyebrow }, roleLabel),
            e(View, { style: s.roleRule }),
          )
        : null,
    ...pg.items.flatMap((it, i) => renderItem(it, byId, `p${pageIdx}-i${i}`)),
    // Fechamento na página de reflexão.
    isReflexao
      ? e(View, { style: s.closing },
          e(View, { style: s.closingDivider }),
          logoDark ? e(Image, { src: logoDark, style: s.closingLogo }) : null,
          e(Text, { style: s.closingTagline }, 'vertho.ai'),
        )
      : null,
    e(View, { style: s.footer, fixed: true },
      e(Text, { style: s.footerText }, 'Vertho Mentor IA'),
      e(Text, { style: s.footerText }, 'vertho.ai'),
    ),
  );
}

// ── Corpo flat (fallback) ─────────────────────────────────────────────────────
function flatBody(blocks: RawBlock[], eyebrow: string): React.ReactNode {
  return e(Page, { size: 'A4', style: s.page },
    e(View, { style: s.topMeta, fixed: true },
      e(Text, null, eyebrow),
      e(Text, { render: ({ pageNumber }: any) => String(pageNumber) }),
    ),
    ...blocks.flatMap((b, i) => {
      const key = `f${i}`;
      if (b.kind === 'h1' || b.kind === 'h2' || b.kind === 'h3') return headingNodes(b, key);
      if (b.kind === 'quote') {
        return [e(View, { key, style: s.quote, wrap: false }, e(Text, { style: s.quoteText }, inline((b as any).text)))];
      }
      if (b.kind === 'ul') return bulletsNodes((b as any).items, key);
      if (b.kind === 'ol') return numberedNodes((b as any).items, key);
      return [e(Text, { key, style: s.paragraph }, inline((b as any).text))];
    }),
    e(View, { style: s.footer, fixed: true },
      e(Text, { style: s.footerText }, 'Vertho Mentor IA'),
      e(Text, { style: s.footerText }, 'vertho.ai'),
    ),
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
  /** Plano editorial (IA). Sem ele, usa o corpo flat. */
  plan?: LayoutPlan | null;
  /** Imagem conceitual de seção (data URI) usada na página marcada com heroImage. */
  sectionImageBase64?: string | null;
}

export function ConteudoFinalPDF({ titulo, conteudoMd, competencia, descritor, empresaNome, coverBase64, plan, sectionImageBase64 }: Params) {
  const logo = getLogoCoverBase64();
  const blocks = parseBlocks(conteudoMd, { skipFirstH1: Boolean(titulo) });
  const byId = new Map(blocks.map(b => [b.id, b]));
  const eyebrow = [competencia, descritor].filter(Boolean).join('  ›  ') || 'Conteúdo de desenvolvimento';
  const coverComp = competencia || 'Conteúdo de desenvolvimento';

  const cover = e(Page, { size: 'A4', style: s.cover },
    coverBase64
      ? e(React.Fragment, null,
          e(Image, { src: coverBase64, style: s.coverImage, fixed: true }),
          e(View, { style: s.coverScrim3, fixed: true }),
          e(View, { style: s.coverScrim2, fixed: true }),
          e(View, { style: s.coverScrim1, fixed: true }),
        )
      : e(React.Fragment, null,
          e(View, { style: s.coverAccent1, fixed: true }),
          e(View, { style: s.coverAccent2, fixed: true }),
        ),
    e(View, { style: s.coverTop }, logo ? e(Image, { src: logo, style: s.coverLogo }) : null),
    e(View, { style: s.coverMiddle },
      e(Text, { style: s.coverCompetencia }, coverComp),
      descritor ? e(Text, { style: s.coverDescritor }, descritor) : null,
      e(Text, { style: s.coverTitle }, titulo),
      e(View, { style: s.coverDivider }),
      empresaNome
        ? e(View, { style: s.coverMetaRow },
            e(View, { style: s.coverMetaItem },
              e(Text, { style: s.coverMetaLabel }, 'Organização'),
              e(Text, { style: s.coverMetaValue }, empresaNome),
            ),
          )
        : null,
    ),
    e(View, { style: s.coverBottom },
      e(Text, { style: s.coverBottomText }, 'Material de desenvolvimento'),
      e(Text, { style: s.coverBottomText }, 'vertho.ai'),
    ),
  );

  const body = plan && plan.pages.length
    ? plan.pages.map((pg, i) => planPage(pg, i, byId, eyebrow, sectionImageBase64 || null))
    : [flatBody(blocks, eyebrow)];

  return e(Document, { title: titulo, author: 'Vertho' }, cover, ...body);
}

export async function renderConteudoFinalPDF(params: Params): Promise<Uint8Array> {
  const { renderToBuffer } = await import('@react-pdf/renderer');
  return renderToBuffer(ConteudoFinalPDF(params));
}

export type { Params as ConteudoFinalPDFParams };
