import { describe, it, expect } from 'vitest';
import { parseBlocks } from '@/lib/conteudo-layout-plan';

describe('parseBlocks — listas soltas (loose lists)', () => {
  it('mantém itens separados por linha em branco na MESMA lista numerada', () => {
    const md = `1. Primeiro item

2. Segundo item

3. Terceiro item`;
    const blocks = parseBlocks(md);
    const ols = blocks.filter(b => b.kind === 'ol');
    expect(ols).toHaveLength(1);
    expect((ols[0] as { items: string[] }).items).toEqual(['Primeiro item', 'Segundo item', 'Terceiro item']);
  });

  it('mantém itens separados por linha em branco na MESMA lista de marcadores', () => {
    const md = `- um

- dois

- três`;
    const blocks = parseBlocks(md);
    const uls = blocks.filter(b => b.kind === 'ul');
    expect(uls).toHaveLength(1);
    expect((uls[0] as { items: string[] }).items).toEqual(['um', 'dois', 'três']);
  });

  it('encerra a lista quando vem um parágrafo, heading ou hr', () => {
    const md = `1. a

2. b

Um parágrafo encerra a lista.

3. c`;
    const blocks = parseBlocks(md);
    const ols = blocks.filter(b => b.kind === 'ol');
    expect(ols).toHaveLength(2);
    expect((ols[0] as { items: string[] }).items).toEqual(['a', 'b']);
    expect((ols[1] as { items: string[] }).items).toEqual(['c']);
    expect(blocks.some(b => b.kind === 'p')).toBe(true);
  });

  it('parágrafos separados por linha em branco continuam blocos distintos', () => {
    const md = `Parágrafo um.

Parágrafo dois.`;
    const blocks = parseBlocks(md);
    expect(blocks.filter(b => b.kind === 'p')).toHaveLength(2);
  });
});
