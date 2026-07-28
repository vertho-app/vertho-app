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

/**
 * Onboarding (semanasMissao [4,7,9]; competenciasNaMissao {4:[0,1], 7:[0,1,2,3], 9:[-1]}):
 * a regra da janela vale para ele TAMBÉM — antes do teste, nada travava regressão
 * nele e o comentário da config ainda dizia "M2 = 0..3". Com a janela, a M2 cobre
 * só o bloco fechado desde a M1 (Comps 2+3, entregues nas semanas 5-6).
 */
const ONB = [
  D('C0 descritor', 'C0', [2]),
  D('C1 descritor', 'C1', [3]),
  D('C2 descritor', 'C2', [5]),
  D('C3 descritor', 'C3', [6]),
  D('C4 descritor', 'C4', [8]),
];

describe('descritoresEntreguesNaMissao — janela no Onboarding', () => {
  it('M1 (sem 4, desde=1): Comps 0+1 (semanas 2-3)', () => {
    const out = descritoresEntreguesNaMissao(ONB, 4, ['C0', 'C1'], 1);
    expect(out.map((d) => d.competencia)).toEqual(['C0', 'C1']);
  });

  it('M2 (sem 7, desde=5): SÓ Comps 2+3 — Comps 0+1 já foram avaliadas na M1', () => {
    // É a mudança de comportamento no Onboarding: o conjunto candidato da config
    // é [0,1,2,3], mas a janela corta o que foi entregue antes da missão anterior.
    const out = descritoresEntreguesNaMissao(ONB, 7, ['C0', 'C1', 'C2', 'C3'], 5);
    expect(out.map((d) => d.competencia)).toEqual(['C2', 'C3']);
  });

  it('M3 (sem 9, última, desde=1): cumulativa — as 5 competências', () => {
    const out = descritoresEntreguesNaMissao(ONB, 9, ['C0', 'C1', 'C2', 'C3', 'C4'], 1);
    expect(out).toHaveLength(5);
  });
});
