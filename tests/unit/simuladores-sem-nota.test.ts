import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import RelatorioCompetencias from '@/components/simuladores/relatorio-competencias';
import { nivelDaNotaPace } from '@/lib/simulador-vendas/nota';
import { niveisParaCsv } from '@/lib/simulador-vendas/csv-niveis';
import { semComentarios } from '../helpers/fonte';

/**
 * Os três simuladores mostram NÍVEL, nunca nota decimal (R-35, 04/10/2026).
 *
 * Antes: "Média geral: Nível 3 · 2,5 de 4" e "2,5 de 4" em cada competência (relatório
 * comum a vendas, atendimento e liderança); "Nota PACE 2,5" no histórico e "Média
 * 2,5 / 4" no relatório antigo do vendas; "Média" e "X de 4" por caso e por atendimento
 * na equipe do atendimento; e o CSV do vendas com PL, P, A, C, E e Média decimais.
 * Decisão 1 do dono (revisão de 02/10): nível por competência, sem "X de 4", CSV com
 * nível. A nota decimal fica no admin da Vertho.
 */

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const mensagens = (locale: string) => JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));

const competencia = (codigo: string, nota: number, nivel: number | null) => ({
  codigo, nome: `Competência ${codigo}`, nota, nivel, observados: 4, total: 4, suficiente: nivel != null, descritores: [],
});

function html(locale: string, props: any) {
  return renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale, messages: mensagens(locale), timeZone: 'America/Sao_Paulo',
    children: createElement(RelatorioCompetencias, props),
  }));
}

describe('relatório por competência (comum aos três simuladores)', () => {
  const props = {
    competencias: [competencia('A', 2.5, 2), competencia('B', 3.45, 3), competencia('C', 1.2, 1)],
    media: { nota: 2.38, nivel: 2, competencias: 3, suficiente: true },
    regra: { minDescritores: 3, minCompetencias: 2 },
  };

  it.each(LOCALES)('%s: mostra o nível de cada competência e o nível geral, sem nota e sem "de 4"', (locale) => {
    const h = html(locale, props);
    const nivel = (n: number) => mensagens(locale).SimuladoresRelatorio.level.replace('{n}', String(n));
    expect(h).toContain(nivel(2));
    expect(h).toContain(nivel(3));
    expect(h).toContain(nivel(1));
    // nenhuma das notas (2,5 · 3,45 · 1,2 · 2,38) nem a escala "de 4"
    expect(h).not.toMatch(/2[.,]5|3[.,]45?|1[.,]2|2[.,]38/);
    // ("4 de 4 comportamentos observados" é a cobertura, não a escala: o que não pode é nota + "de 4")
    expect(h).not.toMatch(/\d[.,]\d+\s*(?:de|of|\/)\s*4/);
  });

  it.each(LOCALES)('%s: o rótulo geral é "nível", não "média"', (locale) => {
    const h = html(locale, props);
    expect(h).not.toMatch(/M[ée]dia|Media|Promedio|Average|average/);
    const { overall } = mensagens(locale).SimuladoresRelatorio;
    expect(h).toContain(overall);
    expect(overall).toMatch(/[Nn][ií]vel|[Ll]evel|Nivel/);
  });

  it('competência sem nível diz por quê, sem inventar nota', () => {
    const h = html('pt-BR', { ...props, competencias: [competencia('A', 0, null)], media: { nota: null, nivel: null, competencias: 0, suficiente: false } });
    expect(h).toContain('Nível geral');
    expect(h).not.toMatch(/\d[.,]\d/);
  });
});

describe('nivelDaNotaPace', () => {
  it('converte pela régua oficial (N3 vai até 3,50) e trata zero e ausência como sem evidência', () => {
    expect([1.9, 2.0, 3.0, 3.5, 3.51, 4].map(nivelDaNotaPace)).toEqual([1, 2, 3, 3, 4, 4]);
    for (const vazio of [0, null, undefined]) expect(nivelDaNotaPace(vazio as any)).toBeNull();
  });
});

describe('CSV do histórico do vendas: nível, sem nota decimal', () => {
  it('PL, P, A, C, E e geral saem em nível; sem evidência sai vazio, nunca "1"', () => {
    expect(niveisParaCsv({ PL: 2.4, P: 3.5, A: 3.6, C: 1.1, E: 0, Media: 2.6 })).toEqual([2, 3, 4, 1, '', 2]);
    expect(niveisParaCsv({ PL: null, P: null, A: null, C: null, E: null, Media: null })).toEqual(['', '', '', '', '', '']);
  });

  it('a tela exporta pela função de nível e não pela nota', () => {
    const fonte = semComentarios(readFileSync('components/simulador-vendas/gestao.tsx', 'utf8'));
    expect(fonte).toContain('...niveisParaCsv(r)');
    expect(fonte).not.toMatch(/\br\.(PL|Media)\b/);
    expect(fonte).not.toContain('(1' + String.fromCharCode(0x2013) + '4)');
  });

  it.each(LOCALES)('%s: o cabeçalho diz "nível", não "média"', (locale) => {
    const v = mensagens(locale).SimuladorVendas;
    expect(v.csvLevelOverall).toMatch(/[Nn][ií]vel|Nivel|[Ll]evel/);
    expect(v.csvLevelUnit).toMatch(/n[ií]vel|nivel|level/);
    expect(v.average).toBeUndefined();
  });
});

describe('as telas dos simuladores não imprimem nota decimal', () => {
  const ARQUIVOS = [
    'components/simuladores/relatorio-competencias.tsx',
    'components/simulador-vendas/relatorio.tsx',
    'components/simulador-vendas/treino.tsx',
    'components/simulador-vendas/gestao.tsx',
    'components/recepcao/treino.tsx',
    'components/recepcao/gestao.tsx',
  ];

  it.each(ARQUIVOS)('%s', (arquivo) => {
    const fonte = semComentarios(readFileSync(arquivo, 'utf8'));
    for (const proibido of ['formatarNotaPace', 'scoreOf4', "t('score'", 'historyScore\'', "t('noScore')", "t('teamAverage')", "t('reviewScore')", 'scoreLabel', '<meter', 'mediaNota']) {
      expect(fonte, `${arquivo} voltou a usar ${proibido}`).not.toContain(proibido);
    }
    // número com casas decimais em tela de cliente: só data, custo e porcentagem de cobertura podem ter
    expect(fonte).not.toMatch(/\bnumero\(\s*(?:relatorio|rel|item|s|g)\.(?:nota|media)/);
    expect(fonte).not.toMatch(/\.(?:nota|media|Media)\s*\)?\s*\.(?:toFixed|toLocaleString)/);
  });

  it.each(LOCALES)('%s: as chaves de nota saíram dos três namespaces e as de nível entraram', (locale) => {
    const m = mensagens(locale);
    expect(m.SimuladoresRelatorio.score).toBeUndefined();
    for (const chave of ['scoreOf4', 'scoreOf4Short', 'noScore', 'historyScore', 'teamAverage', 'reviewScore']) {
      expect(m.SimuladorAtendimento[chave], `SimuladorAtendimento.${chave}`).toBeUndefined();
    }
    for (const chave of ['score', 'scoreLabel', 'average']) expect(m.SimuladorVendas[chave], `SimuladorVendas.${chave}`).toBeUndefined();
    expect(m.SimuladorAtendimento.teamLevel).toBeTruthy();
    expect(m.SimuladorAtendimento.reviewLevel).toBeTruthy();
    expect(m.SimuladorAtendimento.coverage).toContain('{coverage}');
    expect(m.SimuladorVendas.resultLevel).toBeTruthy();
  });

  it.each(LOCALES)('%s: nenhum texto dos simuladores promete "nota PACE" nem usa "de 4"', (locale) => {
    const m = mensagens(locale);
    const textos = [
      ...Object.values<string>(m.SimuladorVendas), ...Object.values<string>(m.SimuladorAtendimento), ...Object.values<string>(m.SimuladoresRelatorio),
    ].filter((v) => typeof v === 'string');
    const achados = textos.filter((v) => /nota PACE|PACE score|puntuación PACE|\{score\} de 4|\{score\} of 4|\{score\} out of 4/i.test(v));
    expect(achados).toEqual([]);
  });
});
