import { describe, it, expect } from 'vitest';
import { renderConteudoFinalPDF } from '@/lib/conteudo-final-pdf';

// Render REAL de PDF (@react-pdf): estes são dos testes mais lentos da suíte.
// O teto vive em `vitest.config.ts` (testTimeout), calibrado pela medição da
// suíte inteira — não por arquivo.
import { parseBlocks, type LayoutPlan, type PlanItem } from '@/lib/conteudo-layout-plan';

const md = `# Título Principal de Teste

## Contexto
Parágrafo de introdução com **negrito** e conteúdo suficiente para extrair um trecho.

> Uma citação forte e memorável.

## Passos
1. Primeiro passo do processo
2. Segundo passo do processo

## Checklist
- Item acionável um
- Item acionável dois

## Antes vs Depois
Texto que descreve o lado antes.

Texto que descreve o lado depois.

## Perguntas
- Você reflete sobre isso?
- E sobre aquilo?
`;

function byKind(blocks: ReturnType<typeof parseBlocks>) {
  return (kind: string, n = 0) => blocks.filter(b => b.kind === kind)[n].id;
}

describe('renderConteudoFinalPDF', () => {
  it('renderiza com plano editorial exercitando todos os tratamentos', async () => {
    const blocks = parseBlocks(md, { skipFirstH1: true });
    const k = byKind(blocks);
    const h2s = blocks.filter(b => b.kind === 'h2').map(b => b.id);
    const ps = blocks.filter(b => b.kind === 'p').map(b => b.id);

    const plan: LayoutPlan = {
      summary: 'Teste de estrutura visual',
      pages: [
        {
          role: 'contexto',
          heroImage: true,
          items: [
            { as: 'heading', ref: h2s[0] },
            { as: 'synthesis', ref: ps[0] },
            { as: 'pullquoteText', ref: ps[0], text: 'extrair um trecho' },
            { as: 'pullquote', ref: k('quote') },
          ] as PlanItem[],
        },
        {
          role: 'ferramenta',
          items: [
            { as: 'heading', ref: h2s[1] },
            { as: 'flow', ref: k('ol') },
            { as: 'heading', ref: h2s[2] },
            { as: 'checklist', ref: k('ul') },
          ] as PlanItem[],
        },
        {
          role: 'comparativo',
          items: [
            { as: 'heading', ref: h2s[3] },
            { as: 'comparison', left: { label: 'Antes', refs: [ps[1]] }, right: { label: 'Depois', refs: [ps[2]] } },
          ] as PlanItem[],
        },
        {
          role: 'reflexao',
          items: [
            { as: 'heading', ref: h2s[4] },
            { as: 'reflectionCards', ref: k('ul', 1) },
          ] as PlanItem[],
        },
      ],
    };

    const buf = await renderConteudoFinalPDF({
      titulo: 'Título Principal de Teste',
      conteudoMd: md,
      competencia: 'Pensamento Estratégico',
      descritor: 'Tomada de decisão',
      formato: 'texto',
      empresaNome: 'Empresa Teste',
      coverBase64: null,
      plan,
      sectionImageBase64: null,
    });
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('renderiza caseCard e roles novos (sintese/cuidados)', async () => {
    const blocks = parseBlocks(md, { skipFirstH1: true });
    const ps = blocks.filter(b => b.kind === 'p').map(b => b.id);
    const ols = blocks.filter(b => b.kind === 'ol').map(b => b.id);

    const plan: LayoutPlan = {
      summary: 'Teste de caseCard',
      pages: [
        { role: 'exemplo', items: [{ as: 'caseCard', ref: ps[0] }] as PlanItem[] },
        { role: 'sintese', items: [{ as: 'synthesis', ref: ps[1] }] as PlanItem[] },
        { role: 'cuidados', items: [{ as: 'caseCard', ref: ols[0] }, { as: 'paragraph', ref: ps[2] }] as PlanItem[] },
      ],
    };

    const buf = await renderConteudoFinalPDF({
      titulo: 'Título Principal de Teste',
      conteudoMd: md,
      competencia: 'Pensamento Estratégico',
      formato: 'texto',
      coverBase64: null,
      plan,
      sectionImageBase64: null,
    });
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('renderiza o diagram "o que é / o que não é"', async () => {
    const blocks = parseBlocks(md, { skipFirstH1: true });
    const ps = blocks.filter(b => b.kind === 'p').map(b => b.id);
    const uls = blocks.filter(b => b.kind === 'ul').map(b => b.id);

    const plan: LayoutPlan = {
      summary: 'Teste de diagram',
      pages: [
        {
          role: 'conceito',
          items: [
            { as: 'diagram', affirm: { refs: [ps[0], uls[0]] }, negate: { refs: [ps[1]] } },
          ] as PlanItem[],
        },
      ],
    };

    const buf = await renderConteudoFinalPDF({
      titulo: 'Título Principal de Teste',
      conteudoMd: md,
      competencia: 'Pensamento Estratégico',
      formato: 'texto',
      coverBase64: null,
      plan,
      sectionImageBase64: null,
    });
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('renderiza comparison como grid (listas paralelas) e script', async () => {
    const gridMd = `# T
## Reativo vs Antecipativo
### Reativo
- Espera o problema estourar
- Decide no susto, sob pressão
- Custo alto e moral abalada
### Antecipativo
- Lê os sinais antes
- Decide com calma e dados
- Custo menor e equipe confiante
## Roteiro
- Posso te fazer uma pergunta sobre isso?
- O que você faria diferente numa próxima vez?
`;
    const blocks = parseBlocks(gridMd, { skipFirstH1: true });
    const uls = blocks.filter(b => b.kind === 'ul').map(b => b.id);
    const h2s = blocks.filter(b => b.kind === 'h2').map(b => b.id);

    const plan: LayoutPlan = {
      summary: 'grid + script',
      pages: [
        {
          role: 'comparativo',
          items: [
            { as: 'heading', ref: h2s[0] },
            { as: 'comparison', left: { label: 'Reativo', refs: [uls[0]] }, right: { label: 'Antecipativo', refs: [uls[1]] } },
          ] as PlanItem[],
        },
        {
          role: 'ferramenta',
          items: [
            { as: 'heading', ref: h2s[1] },
            { as: 'script', ref: uls[2] },
          ] as PlanItem[],
        },
      ],
    };

    const buf = await renderConteudoFinalPDF({
      titulo: 'T', conteudoMd: gridMd, competencia: 'Pensamento Estratégico',
      formato: 'texto', coverBase64: null, plan, sectionImageBase64: null,
    });
    expect(buf.length).toBeGreaterThan(2000);
  });

  it('renderiza no modo flat (sem plano)', async () => {
    const buf = await renderConteudoFinalPDF({
      titulo: 'Título Principal de Teste',
      conteudoMd: md,
      competencia: 'Pensamento Estratégico',
      formato: 'texto',
      coverBase64: null,
      plan: null,
    });
    expect(buf.length).toBeGreaterThan(2000);
  });
});
