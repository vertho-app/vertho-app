import { describe, expect, it } from 'vitest';
import { progressoDoMapeamento } from '@/lib/assessment/competencias-do-mapeamento';

/**
 * A conta do mapeamento na home é a do cabeçalho do assessment. A home contava
 * todas as respostas da pessoa contra o tamanho do Top 5 e, na Temporada 2 de
 * Ibipeba (Top 5 = só Comunicação), as duas respostas da jornada 1 davam "2 de 1":
 * fase concluída, barra em 100% e botão "Ver resultado" com o mapeamento novo
 * intocado.
 */
describe('progressoDoMapeamento', () => {
  const top5 = [{ nome: 'Comunicação', ids: ['comp-com-d1', 'comp-com-d2'] }];

  it('respostas de competências FORA do Top 5 não contam', () => {
    const respostas = [
      { competencia_id: 'comp-plan', competencia_nome: 'Planejamento e Organização' },
      { competencia_id: 'comp-auto', competencia_nome: 'Autocuidado e resiliência emocional' },
    ];
    expect(progressoDoMapeamento(top5, respostas)).toEqual({ respondidas: 0, total: 1 });
  });

  it('conta pela id de QUALQUER linha da competência (o cenário aponta uma delas)', () => {
    expect(progressoDoMapeamento(top5, [{ competencia_id: 'comp-com-d2', competencia_nome: null }])).toEqual({ respondidas: 1, total: 1 });
  });

  it('conta pelo nome (catálogo recomposto com outra id), sem acento e sem caixa', () => {
    expect(progressoDoMapeamento(top5, [{ competencia_id: 'outra', competencia_nome: 'comunicacao' }])).toEqual({ respondidas: 1, total: 1 });
  });

  it('cargo sem Top 5 dá 0 de 0 (não "concluído")', () => {
    expect(progressoDoMapeamento([], [{ competencia_id: 'x', competencia_nome: 'X' }])).toEqual({ respondidas: 0, total: 0 });
  });

  it('duas respostas antigas não completam um Top 5 de uma competência nova', () => {
    const r = progressoDoMapeamento(
      [{ nome: 'Comunicação', ids: [] }],
      [{ competencia_id: 'a', competencia_nome: 'A' }, { competencia_id: 'b', competencia_nome: 'B' }],
    );
    expect(r.respondidas).toBeLessThan(r.total);
  });
});
