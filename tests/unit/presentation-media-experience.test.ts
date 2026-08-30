import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_PRESENTATION_WEEK_VIDEO } from '@/lib/demo/reset-acme-demo';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

describe('experiência de mídia na apresentação', () => {
  const week = read('app/dashboard/temporada/semana/[week]/page.tsx');
  const content = read('app/dashboard/conteudo/[id]/content-experience.tsx');
  const bunny = read('components/bunny-video-player.tsx');
  const tracking = read('lib/use-bunny-tracking.ts');

  it('mantém texto e case no leitor interno da semana', () => {
    expect(week).not.toContain('target="_blank"');
    expect(week).toContain("ativo === 'texto' || ativo === 'case'");
    expect(week).toContain('/api/conteudo/${encodeURIComponent(fonteId)}/pdf');
  });

  it('cada nova abertura de vídeo ou podcast começa em 00:00', () => {
    expect(bunny).toContain('player.setCurrentTime(0)');
    expect(tracking).toContain('player.setCurrentTime(0)');
    expect(week).toContain('event.currentTarget.currentTime = 0');
    expect(content).toContain('event.currentTarget.currentTime = 0');
    expect(week).toContain('setMediaSession((current) => current + 1)');
  });

  it('usa o vídeo nominal da Bruna com voz única', () => {
    expect(DEMO_PRESENTATION_WEEK_VIDEO.personalizedBunnyVideoId)
      .toBe('2f1d3db8-afb4-4329-bf0a-8ed8408a5a54');
  });
});

describe('resultados e perfis da apresentação', () => {
  it('mostra somente o nível por competência, sem badge de nota', () => {
    const assessment = read('app/dashboard/assessment/page.tsx');
    expect(assessment).toContain("t('done.level')");
    expect(assessment).not.toContain("t('done.score')");
  });

  it('faz cada card do gestor abrir o perfil comportamental interno', () => {
    const page = read('app/dashboard/gestor/page.tsx');
    const action = read('app/dashboard/gestor/actions.ts');
    expect(page).toContain('setSelecionado(p)');
    expect(page).toContain('<PerfilComportamentalModal');
    expect(page).toContain('intensidadeQualitativa(dimensao.value)');
    expect(action).toContain('d_natural, i_natural, s_natural, c_natural');
  });
});
