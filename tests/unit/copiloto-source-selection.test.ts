import { describe, expect, it } from 'vitest';
import { limitSourcesByKind } from '@/lib/copiloto/source-selection';
import type { CopilotSourceKind } from '@/lib/copiloto/types';

function sources(kind: CopilotSourceKind, amount: number) {
  return Array.from({ length: amount }, (_value, index) => ({
    title: `${kind} ${index + 1}`,
    url: `https://${kind}.example/${index + 1}`,
    kind,
  }));
}

describe('cotas de fontes do Copiloto', () => {
  it('reserva até oito posições para cada trilha e ordena o ledger', () => {
    const selected = limitSourcesByKind([
      ...sources('social', 11),
      ...sources('site', 10),
      ...sources('news', 9),
    ]);

    expect(selected).toHaveLength(24);
    expect(selected.map((source) => source.kind)).toEqual([
      ...Array(8).fill('site'),
      ...Array(8).fill('news'),
      ...Array(8).fill('social'),
    ]);
    expect(selected.filter((source) => source.kind === 'site').map((source) => source.title))
      .toEqual(sources('site', 8).map((source) => source.title));
  });

  it('não duplica a mesma URL entre trilhas', () => {
    const duplicate = { title: 'Mesma evidência', url: 'https://example.com/evidencia', kind: 'site' as const };
    const selected = limitSourcesByKind([
      duplicate,
      { ...duplicate, title: 'Classificação posterior', kind: 'news' },
    ]);

    expect(selected).toEqual([duplicate]);
  });
});
