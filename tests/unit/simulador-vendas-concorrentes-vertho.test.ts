import { describe, expect, it } from 'vitest';
import {
  CONCORRENTES_VERTHO,
  selecionarConcorrenteVertho,
} from '@/lib/simulador-vendas/concorrentes-vertho';

describe('repertório competitivo da versão Vertho', () => {
  it('inclui soluções e ferramentas do processo de desenvolvimento sem selecionar oferta', () => {
    const escolhidos = CONCORRENTES_VERTHO.map((_, i) =>
      selecionarConcorrenteVertho(i).id,
    );
    expect(new Set(escolhidos).size).toBe(CONCORRENTES_VERTHO.length);
    expect(escolhidos).toEqual(
      expect.arrayContaining(['qulture-rocks', 'revvo', 'coachhub-aimy', 'yoodli']),
    );
  });

  it('evita repetição enquanto houver alternativas', () => {
    const anterior = selecionarConcorrenteVertho(0);
    const proximo = selecionarConcorrenteVertho(0, [
      anterior.id,
      'yoodli',
    ]);
    expect(proximo.id).not.toBe(anterior.id);
    expect(proximo.id).not.toBe('yoodli');
  });

  it('reabre o repertório quando todas as alternativas já apareceram', () => {
    const ids = CONCORRENTES_VERTHO.map((c) => c.id);
    for (const indice of [0, 1, 10, Number.MAX_SAFE_INTEGER]) {
      expect(ids).toContain(selecionarConcorrenteVertho(indice, ids).id);
    }
  });

  it('recusa entrada que poderia gerar uma seleção ausente', () => {
    for (const indice of [-1, 0.5, NaN, Infinity]) {
      expect(() => selecionarConcorrenteVertho(indice)).toThrow();
    }
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
