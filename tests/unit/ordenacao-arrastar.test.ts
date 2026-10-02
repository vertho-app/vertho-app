import { describe, expect, it } from 'vitest';
import { ordemAoArrastar } from '@/lib/ordenacao-arrastar';

/**
 * Arrastar para reordenar as preferências de aprendizagem (02/10/2026). A tela mede o
 * ponto médio vertical de cada linha; a decisão de ONDE o item cai é esta função pura.
 * Linhas de 60px empilhadas: A=30, B=90, C=150, D=210 (pontos médios).
 */
const MEDIOS = { A: 30, B: 90, C: 150, D: 210 };
const ORDEM = ['A', 'B', 'C', 'D'];

describe('ordemAoArrastar', () => {
  it('ponteiro sobre a própria posição não muda nada', () => {
    expect(ordemAoArrastar(ORDEM, 'B', 90, MEDIOS)).toEqual(ORDEM);
  });

  it('arrastar para BAIXO passa o item por cima das linhas cujo ponto médio ficou acima do ponteiro', () => {
    expect(ordemAoArrastar(ORDEM, 'A', 160, MEDIOS)).toEqual(['B', 'C', 'A', 'D']);
    expect(ordemAoArrastar(ORDEM, 'A', 400, MEDIOS)).toEqual(['B', 'C', 'D', 'A']);
  });

  it('arrastar para CIMA põe o item antes das linhas que ficaram abaixo do ponteiro', () => {
    expect(ordemAoArrastar(ORDEM, 'D', 80, MEDIOS)).toEqual(['A', 'D', 'B', 'C']);
    expect(ordemAoArrastar(ORDEM, 'D', -20, MEDIOS)).toEqual(['D', 'A', 'B', 'C']);
  });

  it('🔴 não oscila: depois de trocar, os pontos médios deslocam meia linha e a decisão repete o mesmo resultado', () => {
    // A foi arrastado até y=160 -> B C A D. Agora C e B sobem e A ocupa a 3ª linha.
    const depois = { B: 30, C: 90, A: 150, D: 210 };
    expect(ordemAoArrastar(['B', 'C', 'A', 'D'], 'A', 160, depois)).toEqual(['B', 'C', 'A', 'D']);
  });

  it('é uma permutação: nenhum formato some nem se repete', () => {
    for (const y of [-50, 0, 60, 120, 180, 300]) {
      const nova = ordemAoArrastar(ORDEM, 'B', y, MEDIOS);
      expect([...nova].sort()).toEqual([...ORDEM].sort());
    }
  });

  it('item que não está na lista, ou linha sem medida, não quebra a ordem', () => {
    expect(ordemAoArrastar(ORDEM, 'Z', 100, MEDIOS)).toEqual(ORDEM);
    // sem medida de C (ainda não montada): C simplesmente não conta como "acima"
    expect(ordemAoArrastar(ORDEM, 'A', 160, { A: 30, B: 90, D: 210 })).toEqual(['B', 'A', 'C', 'D']);
  });
});
