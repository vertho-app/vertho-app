import { describe, expect, it } from 'vitest';
import { descritoresEntreguesNaMissao } from '@/lib/season-engine/build-season';

/**
 * Regra de 28/07 (decisão de produto): a semana de aplicação AVALIA — e avaliação
 * só cobra conteúdo já entregue. Antes, a missão da semana 4 integrava TODOS os
 * descritores das 2 competências (12 no Ibipeba), cobrando Autocuidado cujo
 * conteúdo só chega na semana 5. O corte é por `semanas_ids` (alocação real no
 * build), não por fatia da seleção — que quebraria na semana 8, quando os 6
 * primeiros descritores entregues atravessam as 2 competências.
 */

const D = (descritor: string, competencia: string, semanas_ids: number[]) =>
  ({ descritor, competencia, semanas_ids, nota: 1, nivel: 'N1' }) as any;

const SELECAO = [
  // Bloco 1 (semanas 1-3): Planejamento
  D('Definição de metas', 'Planejamento', [1, 9]),
  D('Organização do plano', 'Planejamento', [2]),
  D('Gestão de riscos', 'Planejamento', [3]),
  D('Priorização estratégica', 'Planejamento', [10]),
  D('Acompanhamento de execução', 'Planejamento', [11]),
  D('Entrega de resultados', 'Planejamento', [11]),
  // Bloco 2 (semanas 5-7): Autocuidado
  D('Sustentabilidade pessoal', 'Autocuidado', [5]),
  D('Protagonismo do bem-estar', 'Autocuidado', [6]),
  D('Regulação sob pressão', 'Autocuidado', [7]),
  D('Busca de apoio e rede', 'Autocuidado', [9]),
  D('Consciência de limites', 'Autocuidado', [10]),
  D('Limites profissionais', 'Autocuidado', [11]),
];

const JANELA = ['Planejamento', 'Autocuidado'];

describe('descritoresEntreguesNaMissao — a missão cobre o bloco que acabou de fechar', () => {
  it('semana 4: só o bloco 1 (semanas 1-3), nada de Autocuidado', () => {
    const out = descritoresEntreguesNaMissao(SELECAO, 4, JANELA);
    expect(out.map((d) => d.descritor)).toEqual([
      'Definição de metas', 'Organização do plano', 'Gestão de riscos',
    ]);
    expect(out.every((d) => d.competencia === 'Planejamento')).toBe(true);
  });

  it('semana 8 com janela desde a missão anterior (desde=5): SÓ o bloco 2 (semanas 5-7)', () => {
    const out = descritoresEntreguesNaMissao(SELECAO, 8, JANELA, 5);
    expect(out.map((d) => d.descritor)).toEqual([
      'Sustentabilidade pessoal', 'Protagonismo do bem-estar', 'Regulação sob pressão',
    ]);
    expect(out.every((d) => d.competencia === 'Autocuidado')).toBe(true);
  });

  it('semana 8 sem janela (desde=1) pegaria os 2 blocos — é o comportamento que NÃO queremos', () => {
    // Trava da decisão: o default é cumulativo, quem calcula a janela é o caller
    // (montarSemanaAplicacao): missão do meio = bloco fechado, última = tudo.
    const out = descritoresEntreguesNaMissao(SELECAO, 8, JANELA);
    expect(out).toHaveLength(6);
  });

  it('semana 12 (cumulativa, desde=1): tudo que foi entregue nas 9 semanas de conteúdo', () => {
    const out = descritoresEntreguesNaMissao(SELECAO, 12, JANELA);
    expect(out).toHaveLength(12);
  });

  it('descritor alocado NA própria semana da missão não conta como entregue', () => {
    const sel = [D('X', 'A', [4]), D('Y', 'A', [3])];
    expect(descritoresEntreguesNaMissao(sel, 4, ['A']).map((d) => d.descritor)).toEqual(['Y']);
  });

  it('competência fora da janela fica de fora mesmo com semana anterior', () => {
    const sel = [D('X', 'Terceira', [1]), D('Y', 'Planejamento', [1])];
    expect(descritoresEntreguesNaMissao(sel, 4, JANELA).map((d) => d.descritor)).toEqual(['Y']);
  });

  it('sem semanas_ids (dado legado) não entra — não dá para afirmar que foi entregue', () => {
    const sel = [{ descritor: 'X', competencia: 'A', nota: 1 } as any];
    expect(descritoresEntreguesNaMissao(sel, 4, ['A'])).toEqual([]);
  });
});
