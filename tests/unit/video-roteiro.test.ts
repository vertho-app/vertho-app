import { describe, expect, it } from 'vitest';
import { normalizarRoteiro, type VideoRoteiro } from '@/lib/video/roteiro-prompt';

function roteiro(scenes: VideoRoteiro['scenes']): VideoRoteiro {
  return { title: 'Teste', theme: 'Video', scenes };
}

describe('normalizarRoteiro', () => {
  it('saneia campos visuais dos novos templates antes do render', () => {
    const r = normalizarRoteiro(roteiro([
      { id: 'a', type: 'avatar_intro', title: 'Intro', narration: 'Abrir.', key_idea: 'Abertura' },
      { id: 'b', type: 'maturity_ladder', title: 'Maturidade', narration: 'Evoluir.', key_idea: 'Evolucao', target: 99 },
      { id: 'c', type: 'myth_truth', title: 'Equivoco', narration: 'Corrigir.', key_idea: 'Criterio' },
      { id: 'd', type: 'definition_card', title: 'Criterio', narration: 'Definir.', key_idea: 'Clareza' },
      { id: 'e', type: 'reflection_prompt', title: 'Pergunta', narration: 'Refletir.', key_idea: 'Aplicacao' },
      { id: 'f', type: 'avatar_outro', title: 'Fecho', narration: 'Fechar.', key_idea: 'Pergunta final' },
    ]));

    const ladder = r.scenes.find((s) => s.type === 'maturity_ladder');
    expect(ladder?.rungs).toHaveLength(4);
    expect(ladder?.target).toBe(3);

    const myth = r.scenes.find((s) => s.type === 'myth_truth');
    expect(myth?.myth).toBeTruthy();
    expect(myth?.truth).toBe('Criterio');

    const definition = r.scenes.find((s) => s.type === 'definition_card');
    expect(definition?.term).toBe('Criterio');
    expect(definition?.definition).toBe('Clareza');

    const prompt = r.scenes.find((s) => s.type === 'reflection_prompt');
    expect(prompt?.prompt).toBeTruthy();
    expect(prompt?.tag).toBe('Pra pensar');
  });

  it('converte stat_highlight sem numero em quote_spotlight renderizavel', () => {
    const r = normalizarRoteiro(roteiro([
      { id: 'a', type: 'avatar_intro', title: 'Intro', narration: 'Abrir.', key_idea: 'Abertura' },
      { id: 'b', type: 'stat_highlight', title: 'Dado', narration: 'Sem numero.', key_idea: 'Sem estatistica', stat: 'muitos casos' },
      { id: 'c', type: 'avatar_outro', title: 'Fecho', narration: 'Fechar.', key_idea: 'Pergunta final' },
    ]));

    const scene = r.scenes[1];
    expect(scene.type).toBe('quote_spotlight');
    expect(scene.quote).toBe('Sem estatistica');
    expect(scene.subtitle).toBe('Mentora Vertho');
  });
});
