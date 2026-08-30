import { describe, expect, it } from 'vitest';
import { getRecommendedContentHref } from '@/lib/home/recommended-content-link';

describe('destino dos cards de capacitação recomendada', () => {
  it('abre texto e case dentro da experiência do dashboard', () => {
    expect(getRecommendedContentHref({ id: 'texto-1', formato: 'texto', url: null }))
      .toBe('/dashboard/conteudo/texto-1');
    expect(getRecommendedContentHref({ id: 'case-1', formato: 'case', url: null }))
      .toBe('/dashboard/conteudo/case-1');
  });

  it('abre áudio dentro da experiência do dashboard', () => {
    expect(getRecommendedContentHref({ id: 'audio-1', formato: 'audio', url: null }))
      .toBe('/dashboard/conteudo/audio-1');
  });

  it('mantém PDF e vídeo dentro da experiência quando existe uma fonte', () => {
    expect(getRecommendedContentHref({ id: 'pdf-1', formato: 'pdf', url: 'https://cdn.test/material.pdf' }))
      .toBe('/dashboard/conteudo/pdf-1');
    expect(getRecommendedContentHref({
      id: 'video-1',
      formato: 'video',
      bunny_video_id: '64c4f43d-7c5d-4b1e-9433-725a1dddbf34',
    })).toBe('/dashboard/conteudo/video-1');
  });

  it('não cria navegação para conteúdo sem uma fonte consumível', () => {
    expect(getRecommendedContentHref({ id: 'sem-fonte', formato: 'pdf', url: null })).toBeNull();
    expect(getRecommendedContentHref({ id: 'video-sem-fonte', formato: 'video' })).toBeNull();
    expect(getRecommendedContentHref({ id: '', formato: 'audio' })).toBeNull();
  });
});
