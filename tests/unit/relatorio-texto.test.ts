/**
 * "A colab conduziu o Conselho de Classe…" saiu na síntese de uma missão, no
 * relatório que a pessoa leva para casa (revisão de 17/09/2026). O pedido foi
 * escrever "colaborador(a)" por extenso.
 */
import { describe, it, expect } from 'vitest';
import { semAbreviacaoColab, semCodigoDaMatriz, textosDoRelatorio } from '@/lib/season-engine/relatorio-texto';

describe('semAbreviacaoColab', () => {
  it('escreve por extenso, com o artigo em gênero neutro', () => {
    expect(semAbreviacaoColab('A colab conduziu o Conselho de Classe.')).toBe('O(a) colaborador(a) conduziu o Conselho de Classe.');
    expect(semAbreviacaoColab('Segundo o colab, a reunião rendeu.')).toBe('Segundo o(a) colaborador(a), a reunião rendeu.');
    expect(semAbreviacaoColab('A fala da colab mostra método.')).toBe('A fala do(a) colaborador(a) mostra método.');
    expect(semAbreviacaoColab('Foi proposto pela colab e aceito.')).toBe('Foi proposto pelo(a) colaborador(a) e aceito.');
    expect(semAbreviacaoColab('Coube à colab decidir.')).toBe('Coube ao(à) colaborador(a) decidir.');
    expect(semAbreviacaoColab('Na colab havia dúvida.')).toBe('No(a) colaborador(a) havia dúvida.');
    expect(semAbreviacaoColab('Colab relatou avanço.')).toBe('Colaborador(a) relatou avanço.');
    expect(semAbreviacaoColab('Os colabs relataram.')).toBe('Os(as) colaboradores(as) relataram.');
    expect(semAbreviacaoColab('terminou com o colab.')).toBe('terminou com o(a) colaborador(a).');
  });

  it('não mexe em palavra que só começa com "colab"', () => {
    for (const intacto of ['A colaboradora conduziu.', 'O colaborador conduziu.', 'Houve colaboração.', 'Colaborar é a meta.']) {
      expect(semAbreviacaoColab(intacto)).toBe(intacto);
    }
    expect(semAbreviacaoColab(null)).toBeNull();
    expect(semAbreviacaoColab(undefined)).toBeUndefined();
  });
});

describe('semCodigoDaMatriz', () => {
  it('tira o código em qualquer posição do texto', () => {
    expect(semCodigoDaMatriz('Avançou em COO03_D6 — Busca de apoio.')).toBe('Avançou em Busca de apoio.');
    expect(semCodigoDaMatriz('Busca de apoio (COO03_D6) avançou.')).toBe('Busca de apoio avançou.');
  });

  it('não mexe em texto sem código', () => {
    for (const intacto of ['Nível 2 em 2026', 'COVID-19 atrasou', 'meta_D3 minúsculo']) expect(semCodigoDaMatriz(intacto)).toBe(intacto);
  });
});

describe('textosDoRelatorio', () => {
  it('corrige todo texto de IA que vira leitura para a pessoa, e só ele', () => {
    const dados = textosDoRelatorio({
      colab: { nome: 'Pessoa' },
      evolutionReport: {
        insight_geral: 'A colab evoluiu.', proximo_passo: 'O colab deve registrar.',
        descritores: [{ descritor: 'COO03_D1 — Consciência de limites', antes: 'A colab resolvia.', depois: 'A colab registra.', nota_pre: 1, nota_pos: 2 }],
        resumo: { parciais: 1 },
      },
      momentos: [{ semana: 1, descritor: 'COO03_D6 — Busca de apoio', insight: 'A colab percebeu.' }],
      missoes: [{ semana: 4, compromisso: 'O colab vai conduzir.', sintese: 'A colab conduziu.' }],
      sem14: { cenario: 'colab no cenário', resumo_avaliacao: { mensagem_geral: 'A colab mostrou método.' } },
    });
    const texto = JSON.stringify([
      dados.evolutionReport.insight_geral, dados.evolutionReport.proximo_passo,
      dados.evolutionReport.descritores[0].antes, dados.evolutionReport.descritores[0].depois,
      dados.momentos[0].insight, dados.missoes[0].compromisso, dados.missoes[0].sintese,
      dados.sem14.resumo_avaliacao.mensagem_geral,
    ]);
    expect(texto).not.toMatch(/colab(?![\p{L}])/u);
    expect(dados.missoes[0].sintese).toBe('O(a) colaborador(a) conduziu.');
    expect(dados.evolutionReport.descritores[0].descritor).toBe('Consciência de limites');
    expect(dados.momentos[0].descritor).toBe('Busca de apoio');
    // o que não é texto para a pessoa passa intacto
    expect(dados.sem14.cenario).toBe('colab no cenário');
    expect(dados.evolutionReport.descritores[0].nota_pos).toBe(2);
    expect(dados.evolutionReport.resumo).toEqual({ parciais: 1 });
  });
});
