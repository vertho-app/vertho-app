/**
 * O que a pessoa leva para casa da temporada: o PDF e a tela de onde ele sai.
 *
 * 🔴 POR QUE (16/09/2026). O dono abriu o PDF da Elisângela e encontrou o que as
 * telas de admin e do gestor tinham deixado de mostrar em 14/09: um card
 * "Regressões", o par "de 2,0 para 3,2" em cada descritor, a nota média do
 * fechamento e o rótulo "Estagnação". A régua não tem veredito de regressão
 * desde 01/09 e a decisão de mostrar só o AVANÇO (com piso em zero) já existia
 * em `avancoExibido`; faltava valer nestes quatro lugares, que são justamente os
 * do colaborador. E a lista de descritores corria sem dizer a qual das duas
 * competências da trilha DUO cada um pertence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { avancoDoPdf, avancoValorPdf, contadoresDoPdf } from '@/lib/temporada-concluida-pdf';
import { agruparPorCompetencia } from '@/lib/season-engine/evolucao-por-competencia';
import { semComentarios } from '../helpers/fonte';

describe('avanço no PDF', () => {
  it('só o avanço, com vírgula decimal', () => {
    expect(avancoDoPdf(2.0, 3.2)).toBe('+1,2');
    expect(avancoDoPdf(2.1, 2.4)).toBe('+0,3');
  });

  it('queda vira 0,0: o PDF não afirma piora', () => {
    expect(avancoDoPdf(2.3, 2.1)).toBe('0,0');
    expect(avancoDoPdf(2, 2)).toBe('0,0');
  });

  it('nota ausente não vira avanço inventado', () => {
    expect(avancoDoPdf(null, 2.5)).toBeNull();
    expect(avancoDoPdf(2.5, undefined)).toBeNull();
  });
});

describe('contadores do topo', () => {
  it('são três, e regressão de relatório antigo conta como estável', () => {
    expect(contadoresDoPdf({ confirmadas: 1, parciais: 5, estagnacoes: 3, regressoes: 2 }))
      .toEqual({ confirmadas: 1, parciais: 5, estaveis: 5 });
    expect(contadoresDoPdf(undefined)).toEqual({ confirmadas: 0, parciais: 0, estaveis: 0 });
  });
});

describe('descritores agrupados por competência', () => {
  it('mantém a ordem do relatório e separa as duas competências da trilha DUO', () => {
    const grupos = agruparPorCompetencia([
      { competencia: 'Avaliação e monitoramento de resultados', descritor: 'Leitura de avaliações externas' },
      { competencia: 'Avaliação e monitoramento de resultados', descritor: 'Definição de metas' },
      { competencia: 'Apoio técnico e monitoramento das unidades', descritor: 'Orientação técnico-pedagógica' },
    ]);
    expect(grupos.map((g) => [g.competencia, g.descritores.length])).toEqual([
      ['Avaliação e monitoramento de resultados', 2],
      ['Apoio técnico e monitoramento das unidades', 1],
    ]);
  });

  it('descritor sem competência não some: fica num grupo sem título', () => {
    const grupos = agruparPorCompetencia([{ descritor: 'X' }, { competencia: '  ', descritor: 'Y' }]);
    expect(grupos).toEqual([{
      competencia: null, descritores: [{ descritor: 'X' }, { competencia: '  ', descritor: 'Y' }],
      avancoMedio: null, nivelInicial: null, nivelFinal: null, subiuDeNivel: false,
    }]);
    expect(agruparPorCompetencia(null)).toEqual([]);
  });

  /**
   * 🔴 O caso que o dono apontou (16/09/2026): "Apoio técnico" listava +0,1, 0,0,
   * +0,3, +0,3 e 0,0 e o cabeçalho dizia "Avanço médio 0,0", porque a conta era
   * média das notas finais menos média das iniciais, e as quedas de Registro e
   * devolutiva (2,0 → 1,4) e Presença (2,9 → 2,2) entravam escondidas. Notas
   * REAIS da Elisângela.
   */
  it('avanço médio da competência é a média dos avanços EXIBIDOS (notas reais da Elisângela)', () => {
    const [avaliacao, apoio] = agruparPorCompetencia([
      { competencia: 'Avaliação', nota_pre: 2, nota_pos: 3.2 },
      { competencia: 'Avaliação', nota_pre: 2, nota_pos: 2.5 },
      { competencia: 'Avaliação', nota_pre: 2.5, nota_pos: 2.1 },
      { competencia: 'Avaliação', nota_pre: 2.5, nota_pos: 2.3 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 2.1 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 1.4 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 2.3 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 2.3 },
      { competencia: 'Apoio', nota_pre: 2.9, nota_pos: 2.2 },
    ]);
    expect(avancoValorPdf(apoio.avancoMedio)).toBe('+0,1');     // (0,1 + 0 + 0,3 + 0,3 + 0) / 5
    expect(avancoValorPdf(avaliacao.avancoMedio)).toBe('+0,4'); // (1,2 + 0,5 + 0 + 0) / 4
  });

  it('nível final é o da MÉDIA das notas; subiu só quando o nível da média sobe', () => {
    // Helmar, Planejamento: média 1,70 (N1) → 2,53 (N2).
    const [subiu] = agruparPorCompetencia([
      { competencia: 'P', nota_pre: 1.5, nota_pos: 2.4 },
      { competencia: 'P', nota_pre: 1.9, nota_pos: 2.66 },
    ]);
    expect(subiu).toMatchObject({ nivelInicial: 1, nivelFinal: 2, subiuDeNivel: true });
    // Elisângela, Avaliação: 2,25 (N2) → 2,53 (N2): mesmo nível, sem parabéns.
    const [manteve] = agruparPorCompetencia([
      { competencia: 'A', nota_pre: 2.25, nota_pos: 2.53 },
    ]);
    expect(manteve).toMatchObject({ nivelFinal: 2, subiuDeNivel: false });
    // N4 abre acima de 3,5 (régua oficial), não em 4,0.
    const [n4] = agruparPorCompetencia([{ competencia: 'X', nota_pre: 3.2, nota_pos: 3.6 }]);
    expect(n4).toMatchObject({ nivelInicial: 3, nivelFinal: 4, subiuDeNivel: true });
  });

  it('descritor sem nota fica fora do avanço e do nível em vez de contar como zero', () => {
    const [g] = agruparPorCompetencia([
      { competencia: 'C', nota_pre: 2, nota_pos: 2.4 },
      { competencia: 'C', nota_pre: null, nota_pos: 3 },
    ]);
    expect(g.avancoMedio).toBe(0.4);
    expect(g).toMatchObject({ nivelInicial: 2, nivelFinal: 2 });
    const [vazio] = agruparPorCompetencia([{ competencia: 'C', nota_pre: null, nota_pos: null }]);
    expect(avancoValorPdf(vazio.avancoMedio)).toBeNull();
    expect(vazio.nivelFinal).toBeNull();
  });
});

/**
 * Âncoras EXATAS do que foi removido, em vez de regex larga: o mesmo arquivo
 * tem `nota_media_pos` legítimo (dado carregado, variante piloto) e uma regex
 * sobre "nota" casaria outra coisa.
 */
const SUPERFICIES: Array<[string, string[]]> = [
  ['lib/temporada-concluida-pdf.tsx', ['label="Regressões"', 'transicao(', 'Nota média pós-temporada', "label: 'Regressão'", "label: 'Estagnação'"]],
  ['app/dashboard/temporada/concluida/page.tsx', ["t('stats.regressions')", "labelKey: 'regression'", "t('final.postAverage')", '→ {d.nota_pos}']],
  ['app/dashboard/temporada/page.tsx', ["label: 'Regressão'", "label: 'Estagnação'", '{d.nota_pre} →', 'consolidado.pre.toFixed']],
  ['app/dashboard/temporada/sem14/page.tsx', ["t('done.pre')", "t('done.post')", '{avaliacao.delta_medio}']],
];

describe('superfícies do colaborador sem regressão e sem nota absoluta', () => {
  it.each(SUPERFICIES)('%s', (arquivo, proibidos) => {
    const fonte = semComentarios(readFileSync(arquivo, 'utf8'));
    for (const p of proibidos) expect(fonte, `"${p}" voltou em ${arquivo}`).not.toContain(p);
    // e o avanço passa pela régua única, não por conta feita na tela
    expect(fonte).toMatch(/formatarAvanco|avancoDoPdf/);
  });
});

describe('traduções', () => {
  for (const loc of ['pt-BR', 'pt-PT', 'en-US', 'es-ES']) {
    it(`${loc}: sem rótulo de regressão e com "estável" no lugar de estagnação`, () => {
      const j = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8'));
      expect(j.SeasonDone.stats.regressions).toBeUndefined();
      expect(j.SeasonDone.classification.regression).toBeUndefined();
      expect(j.SeasonDone.final.postAverage).toBeUndefined();
      expect(j.SeasonFinal.done.pre).toBeUndefined();
      expect(j.SeasonFinal.done.progress).toBeTruthy();
      expect(j.SeasonDone.competencyProgress).toBeTruthy();
      expect(String(j.SeasonDone.classification.stagnation)).toMatch(/^(Estável|Stable|Estable)$/);
    });
  }
});
