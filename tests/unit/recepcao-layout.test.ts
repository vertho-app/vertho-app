import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'postcss';

const source = (file: string) => readFileSync(path.resolve(file), 'utf8');
const css = parse(source('components/recepcao/treino.module.css'));
const treino = source('components/recepcao/treino.tsx');

describe('layout do simulador de atendimento', () => {
  it('usa o mesmo container e hero de vendas, sem um segundo cabeçalho próprio', () => {
    expect(treino).toContain("import { PageContainer, PageHero } from '@/components/page-shell'");
    expect(treino).toContain('<PageContainer className={styles.root}>');
    expect(treino).toContain('<PageHero');
    expect(treino).toContain("title={t('title')}");
    expect(treino).not.toContain('styles.header');
    expect(source('components/simulador-vendas/treino.tsx')).toContain('<PageContainer className={styles.root}>');
  });

  it('herda largura, espaçamento e tipografia do shell, mantendo o tema escuro', () => {
    const declarations = new Map<string, string>();
    css.walkRules('.root', rule => {
      rule.walkDecls(d => { declarations.set(d.prop, d.value); });
    });
    expect(declarations.get('color-scheme')).toBe('dark');
    expect(declarations.get('--atendimento-accent')).toBe('var(--brand-400, #22d3ee)');
    for (const prop of ['background', 'font-family', 'padding', 'max-width']) {
      expect(declarations.has(prop), prop).toBe(false);
    }
  });

  it('não reintroduz superfícies brancas opacas nos estados do simulador', () => {
    css.walkDecls(/^background/, declaration => {
      expect(declaration.value, declaration.parent?.toString()).not.toMatch(/^(white|#fff|#ffffff)$/i);
    });
    expect(css.toString()).not.toContain('--paper');
  });

  it('mantém foco visível, redução de movimento e coluna única no celular', () => {
    const rules: string[] = [];
    css.walkRules(rule => { rules.push(rule.selector); });
    expect(rules.some(s => s.includes('summary, a):focus-visible'))).toBe(true);
    const media: string[] = [];
    css.walkAtRules('media', rule => { media.push(rule.toString()); });
    expect(media.some(s => s.includes('prefers-reduced-motion: reduce') && s.includes('animation: none'))).toBe(true);
    expect(media.some(s => s.includes('max-width: 800px') && s.includes('.workspace') && s.includes('grid-template-columns: minmax(0, 1fr)'))).toBe(true);
  });
});

it('preserva os atalhos móveis e os painéis novos com todas as classes definidas', () => {
  const selectors: string[] = [];
  css.walkRules(rule => { selectors.push(rule.selector); });
  for (const name of ['chatPrimeiro', 'linkFicha', 'matriz', 'segmento', 'visao', 'visaoBusca', 'cellNote', 'cellUp', 'reviewSummary', 'evolucao']) {
    expect(selectors.some(s => s.includes('.' + name)), name).toBe(true);
  }
  expect(css.toString()).toContain('.chatPrimeiro .conversa { order: -1; }');
});

