import { describe, expect, it } from 'vitest';
import {
  CONCORRENTES_VERTHO,
  selecionarConcorrenteVertho,
  type FrenteCompetitiva,
} from '@/lib/simulador-vendas/concorrentes-vertho';

describe('repertório competitivo da versão Vertho', () => {
  it('mantém o confronto de simuladores na frente de simulação', () => {
    const escolhido = selecionarConcorrenteVertho('simulacao', 0);
    expect(escolhido.id).toBe('yoodli');
    expect(selecionarConcorrenteVertho('simulacao', 8, ['yoodli']).id).toBe(
      'yoodli',
    );
  });

  it('evita repetição enquanto houver alternativas pertinentes', () => {
    const anterior = selecionarConcorrenteVertho('competencias', 0);
    const proximo = selecionarConcorrenteVertho('competencias', 0, [
      anterior.id,
      'yoodli',
    ]);
    expect(proximo.id).not.toBe(anterior.id);
    expect(proximo.frentes).toContain('competencias');
  });

  it('reabre o conjunto da frente quando todas as alternativas já apareceram', () => {
    const ids = CONCORRENTES_VERTHO.map((c) => c.id);
    for (const indice of [0, 1, 10, Number.MAX_SAFE_INTEGER]) {
      expect(
        selecionarConcorrenteVertho('aprendizagem', indice, ids).frentes,
      ).toContain('aprendizagem');
    }
  });

  it('recusa entrada que poderia gerar uma seleção ausente', () => {
    for (const indice of [-1, 0.5, NaN, Infinity]) {
      expect(() => selecionarConcorrenteVertho('mentoria', indice)).toThrow();
    }
    expect(() =>
      selecionarConcorrenteVertho('inexistente' as FrenteCompetitiva, 0),
    ).toThrow();
  });

  it('exige rastreabilidade de todos os fatos fornecidos aos futuros cenários', () => {
    const ids = new Set<string>();
    for (const c of CONCORRENTES_VERTHO) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      const fontes = new Map(c.fontes.map((f) => [f.id, f]));
      for (const fato of c.fatos) {
        const fonte = fontes.get(fato.fonteId);
        expect(fonte, `${c.nome}: ${fato.descricao}`).toBeDefined();
        expect(new URL(fonte!.url).protocol).toBe('https:');
      }
    }
  });
});
