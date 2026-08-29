import { describe, expect, it } from 'vitest';
import { getRecommendedContentHref } from '@/lib/home/recommended-content-link';

describe('destino dos cards de capacitação recomendada', () => {
  it('abre texto e case pela rota interna que entrega o PDF', () => {
    expect(getRecommendedContentHref({ id: 'texto-1', formato: 'texto', url: null }))
      .toBe('/api/conteudo/texto-1/pdf');
    expect(getRecommendedContentHref({ id: 'case-1', formato: 'case', url: null }))
      .toBe('/api/conteudo/case-1/pdf');
  });

  it('abre áudio pela rota interna que entrega o podcast', () => {
    expect(getRecommendedContentHref({ id: 'audio-1', formato: 'audio', url: null }))
      .toBe('/api/conteudo/audio-1/podcast');
  });

  it('mantém a URL publicada para os demais formatos', () => {
    expect(getRecommendedContentHref({ id: 'pdf-1', formato: 'pdf', url: 'https://cdn.test/material.pdf' }))
      .toBe('https://cdn.test/material.pdf');
    expect(getRecommendedContentHref({ id: 'sem-fonte', formato: 'pdf', url: null })).toBeNull();
  });
});
