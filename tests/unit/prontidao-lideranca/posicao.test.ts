import { describe, expect, it } from 'vitest';
import { classificarNota, calcularPosicoes, type NotaDescritor } from '@/lib/prontidao-lideranca/posicao';

const CORTE = 3.0;
const BANDA = 0.33;

describe('classificarNota — corte com banda de revisão', () => {
  it('fronteira superior INCLUSIVA: corte + banda demonstra; um centésimo abaixo é zona', () => {
    expect(classificarNota(3.33, CORTE, BANDA)).toBe('demonstra');
    expect(classificarNota(CORTE + BANDA, CORTE, BANDA)).toBe('demonstra'); // 3 + 0.33 ≠ 3.33 em binário
    expect(classificarNota(3.32, CORTE, BANDA)).toBe('zona_de_revisao');
  });

  it('fronteira inferior INCLUSIVA: corte − banda não demonstra; um centésimo acima é zona', () => {
    expect(classificarNota(2.67, CORTE, BANDA)).toBe('nao_demonstra');
    expect(classificarNota(CORTE - BANDA, CORTE, BANDA)).toBe('nao_demonstra');
    expect(classificarNota(2.68, CORTE, BANDA)).toBe('zona_de_revisao');
  });

  it('o próprio corte cai na zona — é exatamente o caso que a banda existe para segurar', () => {
    expect(classificarNota(3.0, CORTE, BANDA)).toBe('zona_de_revisao');
  });

  it('banda 0 vira corte simples, sem zona', () => {
    expect(classificarNota(3.0, CORTE, 0)).toBe('demonstra');
    expect(classificarNota(2.99, CORTE, 0)).toBe('nao_demonstra');
  });
});

const notas = (colaboradorId: string, competencia: string, valores: number[]): NotaDescritor[] =>
  valores.map((nota, i) => ({ colaboradorId, competencia, descritor: `D${i + 1}`, nota }));

const PROGRAMA = ['Priorização', 'Gestão por dados', 'Delegação'];

describe('calcularPosicoes', () => {
  it('média por competência, média geral e posição da pessoa; gaps nomeados', () => {
    const entrada = [
      ...notas('p1', 'Priorização', [3.5, 3.5, 3.5]),          // 3,50 demonstra
      ...notas('p1', 'Gestão por dados', [2.0, 2.5, 2.4]),     // 2,30 não demonstra → gap
      ...notas('p1', 'Delegação', [3.4, 3.4, 3.5]),            // 3,43 demonstra
    ];
    const pos = calcularPosicoes(entrada, PROGRAMA, CORTE, BANDA).get('p1')!;
    expect(pos.completo).toBe(true);
    expect(pos.competencias.map((c) => c.media)).toEqual([3.5, 2.3, 3.43]);
    expect(pos.competencias.map((c) => c.nivel)).toEqual([3, 2, 3]);
    expect(pos.mediaGeral).toBe(3.08);
    expect(pos.nivelGeral).toBe(3);
    expect(pos.posicao).toBe('zona_de_revisao');
    expect(pos.gaps).toEqual(['Gestão por dados']);
  });

  it('pessoa com competência faltando é incompleta: sem média geral, sem posição, faltantes nomeadas', () => {
    const entrada = [...notas('p2', 'Priorização', [4, 4]), ...notas('p2', 'Delegação', [4, 4])];
    const pos = calcularPosicoes(entrada, PROGRAMA, CORTE, BANDA).get('p2')!;
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
      ...notas('p3', 'Negociação', [1]), // fora do programa — não pode puxar a média
    ];
    const pos = calcularPosicoes(entrada, PROGRAMA, CORTE, BANDA).get('p3')!;
    expect(pos.completo).toBe(true);
    expect(pos.mediaGeral).toBe(4);
    expect(pos.posicao).toBe('demonstra');
  });

  it('descritor gravado com duas grafias entra UMA vez, pela média das duas', () => {
    const entrada: NotaDescritor[] = [
      { colaboradorId: 'p4', competencia: 'Priorização', descritor: 'COO03_D6 — Busca de apoio', nota: 2 },
      { colaboradorId: 'p4', competencia: 'Priorização', descritor: 'Busca de apoio (COO03_D6)', nota: 4 },
      { colaboradorId: 'p4', competencia: 'Priorização', descritor: 'Outro', nota: 4 },
    ];
    const pos = calcularPosicoes(entrada, ['Priorização'], CORTE, BANDA).get('p4')!;
    expect(pos.competencias[0].descritores).toBe(2);
    expect(pos.competencias[0].media).toBe(3.5); // (3 + 4) / 2, não (2 + 4 + 4) / 3
  });

  it('nota não numérica é descartada; pessoa sem nota válida não aparece', () => {
    const entrada = [{ colaboradorId: 'p5', competencia: 'Priorização', descritor: 'D1', nota: Number.NaN }];
    expect(calcularPosicoes(entrada, PROGRAMA, CORTE, BANDA).has('p5')).toBe(false);
  });
});
