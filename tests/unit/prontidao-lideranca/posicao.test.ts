import { describe, expect, it } from 'vitest';
import { classificarNota, calcularPosicoes, type NotaDescritor } from '@/lib/prontidao-lideranca/posicao';

const CORTE = 3.0;

/**
 * O corte é BINÁRIO desde 14/09/2026 (o dono descartou a banda de revisão). O
 * valor MODAL da base é exatamente 3,00 (medido: 34% das notas caem sobre 2,00
 * ou 3,00), então a inclusividade da fronteira não é detalhe: ela decide a
 * classificação da maior massa de pessoas da base.
 */
describe('classificarNota: corte binário, fronteira INCLUSIVA', () => {
  it('o próprio corte demonstra; um centésimo abaixo não', () => {
    expect(classificarNota(3.0, CORTE)).toBe('demonstra');
    expect(classificarNota(2.99, CORTE)).toBe('nao_demonstra');
  });

  it('não sobrou terceiro estado: tudo cai num dos dois lados', () => {
    for (const n of [1, 2.67, 2.999, 3.0, 3.01, 3.33, 4]) {
      expect(['demonstra', 'nao_demonstra']).toContain(classificarNota(n, CORTE));
    }
  });

  it('corte fracionário que não fecha em binário ainda inclui a própria fronteira', () => {
    expect(classificarNota(3.3, 1.1 + 2.2)).toBe('demonstra'); // 1.1 + 2.2 = 3.3000000000000003
  });
});

const notas = (colaboradorId: string, competencia: string, valores: number[]): NotaDescritor[] =>
  valores.map((nota, i) => ({ colaboradorId, competencia, descritor: `D${i + 1}`, nota }));

const PROGRAMA = ['Priorização', 'Gestão por dados', 'Delegação'];

describe('calcularPosicoes', () => {
  it('média por competência, média geral e posição da pessoa; gaps nomeados', () => {
    const entrada = [
      ...notas('p1', 'Priorização', [3.5, 3.5, 3.5]),          // 3,50 demonstra
      ...notas('p1', 'Gestão por dados', [2.0, 2.5, 2.4]),     // 2,30 não demonstra, vira gap
      ...notas('p1', 'Delegação', [3.4, 3.4, 3.5]),            // 3,43 demonstra
    ];
    const pos = calcularPosicoes(entrada, PROGRAMA, CORTE).get('p1')!;
    expect(pos.completo).toBe(true);
    expect(pos.competencias.map((c) => c.media)).toEqual([3.5, 2.3, 3.43]);
    expect(pos.competencias.map((c) => c.nivel)).toEqual([3, 2, 3]);
    expect(pos.mediaGeral).toBe(3.08);
    expect(pos.nivelGeral).toBe(3);
    expect(pos.posicao).toBe('demonstra'); // 3,08 está acima do corte 3,00
    expect(pos.gaps).toEqual(['Gestão por dados']);
  });

  it('pessoa com competência faltando é incompleta: sem média geral, sem posição, faltantes nomeadas', () => {
    const entrada = [...notas('p2', 'Priorização', [4, 4]), ...notas('p2', 'Delegação', [4, 4])];
    const pos = calcularPosicoes(entrada, PROGRAMA, CORTE).get('p2')!;
    expect(pos.completo).toBe(false);
    expect(pos.cobertas).toBe(2);
    expect(pos.total).toBe(3);
    expect(pos.faltantes).toEqual(['Gestão por dados']);
    expect(pos.mediaGeral).toBeNull();
    expect(pos.posicao).toBeNull();
  });

  it('ignora competências fora do programa e nomes casam sem acento/caixa', () => {
    const entrada = [
      ...notas('p3', 'PRIORIZAÇÃO', [4]),
      ...notas('p3', 'gestao por dados', [4]),
      ...notas('p3', 'Delegação', [4]),
      ...notas('p3', 'Negociação', [1]), // fora do programa: não pode puxar a média
    ];
    const pos = calcularPosicoes(entrada, PROGRAMA, CORTE).get('p3')!;
    expect(pos.completo).toBe(true);
    expect(pos.mediaGeral).toBe(4);
    expect(pos.posicao).toBe('demonstra');
  });

  it('descritor gravado com duas grafias entra UMA vez, pela média das duas', () => {
    const entrada: NotaDescritor[] = [
      // O travessão aqui é DADO, não prosa: é assim que o descritor chega do banco,
      // e é exatamente essa grafia que `chaveDescritor` tem que juntar com a outra.
      { colaboradorId: 'p4', competencia: 'Priorização', descritor: 'COO03_D6 — Busca de apoio', nota: 2 },
      { colaboradorId: 'p4', competencia: 'Priorização', descritor: 'Busca de apoio (COO03_D6)', nota: 4 },
      { colaboradorId: 'p4', competencia: 'Priorização', descritor: 'Outro', nota: 4 },
    ];
    const pos = calcularPosicoes(entrada, ['Priorização'], CORTE).get('p4')!;
    expect(pos.competencias[0].descritores).toBe(2);
    expect(pos.competencias[0].media).toBe(3.5); // (3 + 4) / 2, não (2 + 4 + 4) / 3
  });

  it('nota não numérica é descartada; pessoa sem nota válida não aparece', () => {
    const entrada = [{ colaboradorId: 'p5', competencia: 'Priorização', descritor: 'D1', nota: Number.NaN }];
    expect(calcularPosicoes(entrada, PROGRAMA, CORTE).has('p5')).toBe(false);
  });
});
