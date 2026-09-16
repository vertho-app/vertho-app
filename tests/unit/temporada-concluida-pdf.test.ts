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
import { avancoDoPdf, contadoresDoPdf } from '@/lib/temporada-concluida-pdf';
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
      competencia: null, descritores: [{ descritor: 'X' }, { competencia: '  ', descritor: 'Y' }], mediaPre: null, mediaPos: null,
    }]);
    expect(agruparPorCompetencia(null)).toEqual([]);
  });

  it('o resultado da competência é o AVANÇO médio, com o mesmo piso do descritor', () => {
    // Elisângela, 16/09: as duas competências da trilha DUO, notas reais.
    const [avaliacao, apoio] = agruparPorCompetencia([
      { competencia: 'Avaliação', nota_pre: 2, nota_pos: 3.2 },
      { competencia: 'Avaliação', nota_pre: 2, nota_pos: 2.5 },
      { competencia: 'Avaliação', nota_pre: 2.5, nota_pos: 2.1 },
      { competencia: 'Avaliação', nota_pre: 2.5, nota_pos: 2.3 },
      { competencia: 'Apoio', nota_pre: 2.9, nota_pos: 2.2 },
      { competencia: 'Apoio', nota_pre: 2, nota_pos: 1.4 },
    ]);
    // média 2,25 → 2,525: +0,3
    expect(avancoDoPdf(avaliacao.mediaPre, avaliacao.mediaPos)).toBe('+0,3');
    // média 2,45 → 1,8: cai, e o papel diz 0,0
    expect(avancoDoPdf(apoio.mediaPre, apoio.mediaPos)).toBe('0,0');
  });

  it('descritor sem nota fica fora da média em vez de contar como zero', () => {
    const [g] = agruparPorCompetencia([
      { competencia: 'C', nota_pre: 2, nota_pos: 2.4 },
      { competencia: 'C', nota_pre: null, nota_pos: 3 },
    ]);
    expect(g.mediaPre).toBe(2);
    expect(g.mediaPos).toBe(2.4);
    const [vazio] = agruparPorCompetencia([{ competencia: 'C', nota_pre: null, nota_pos: null }]);
    expect(avancoDoPdf(vazio.mediaPre, vazio.mediaPos)).toBeNull();
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
