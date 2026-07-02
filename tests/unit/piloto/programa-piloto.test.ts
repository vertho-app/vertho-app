import { describe, it, expect } from 'vitest';
import {
  PROGRAMA_PILOTO,
  PROGRAMA_REGULAR_DUO,
  PROGRAMA_REGULAR,
  PROGRAMA_ONBOARDING,
  getProgramaConfig,
  semanaCalendario,
} from '@/lib/season-engine/programa-config';
import { selectDescriptorsPiloto } from '@/lib/season-engine/select-descriptors';

/**
 * Modo Piloto = degustação de 2 semanas: 1 competência, 4 conteúdos
 * (2/semana, top-4 descritores por gap), fechamento no slot 3 com
 * calendário espelhado na sem 2. Estes testes pegam regressão estrutural
 * e garantem que a config dos OUTROS modos permanece intocada.
 */
describe('Piloto — programa-config', () => {
  it('estrutura: 2 semanas de conteúdo + slot 3 de fechamento', () => {
    expect(PROGRAMA_PILOTO.modo).toBe('piloto');
    expect(PROGRAMA_PILOTO.semanas).toBe(3);
    expect(PROGRAMA_PILOTO.slotsConteudo).toEqual([1, 2]);
    expect(PROGRAMA_PILOTO.semanasAvaliacao).toEqual([3]);
    expect(PROGRAMA_PILOTO.semanaCenarioB).toBe(3);
    expect(PROGRAMA_PILOTO.conteudosPorSemana).toBe(2);
  });

  it('SEM missões e 1 competência', () => {
    expect(PROGRAMA_PILOTO.semanasMissao).toEqual([]);
    expect(PROGRAMA_PILOTO.numCompetencias).toBe(1);
    expect(PROGRAMA_PILOTO.semanaParaCompetenciaIdx).toBeUndefined();
    expect(PROGRAMA_PILOTO.competenciasNaMissao).toBeUndefined();
  });

  it('acumulada persiste na sem 2 (não é semana de conversa qualitativa)', () => {
    expect(PROGRAMA_PILOTO.semanaAcumulada).toBe(2);
    expect(PROGRAMA_PILOTO.semanaAcumulada).not.toBe(PROGRAMA_PILOTO.semanaCenarioB);
  });

  it('fechamento (sem 3) herda o CALENDÁRIO da sem 2 — gate real é progressão', () => {
    expect(PROGRAMA_PILOTO.semanaEspelhoCalendario).toEqual({ 3: 2 });
    expect(semanaCalendario(PROGRAMA_PILOTO, 3)).toBe(2);
    expect(semanaCalendario(PROGRAMA_PILOTO, 1)).toBe(1);
    expect(semanaCalendario(PROGRAMA_PILOTO, 2)).toBe(2);
  });

  it('getProgramaConfig("piloto") resolve o template', () => {
    const c = getProgramaConfig({ programa_modo: 'piloto' });
    expect(c.modo).toBe('piloto');
    expect(c.semanas).toBe(3);
  });

  it('espelho de calendário NÃO existe nos outros modos (vanilla inalterado)', () => {
    for (const cfg of [PROGRAMA_REGULAR, PROGRAMA_REGULAR_DUO, PROGRAMA_ONBOARDING]) {
      expect(cfg.semanaEspelhoCalendario).toBeUndefined();
      expect(cfg.conteudosPorSemana).toBeUndefined();
      expect(semanaCalendario(cfg, 14)).toBe(14);
    }
  });
});

describe('Piloto — selectDescriptorsPiloto', () => {
  const assessment = [
    { descritor: 'D-alto', nota: 3.4 },   // proficiente
    { descritor: 'D-gap3', nota: 2.6 },
    { descritor: 'D-gap1', nota: 1.2 },   // maior gap
    { descritor: 'D-gap2', nota: 1.9 },
    { descritor: 'D-gap4', nota: 2.8 },
    { descritor: 'D-topo', nota: 3.8 },   // proficiente mais alto
  ];

  it('top-4 por gap DECRESCENTE, exatamente 4 distintos, 2 por semana', () => {
    const r = selectDescriptorsPiloto('Comp X', assessment, [1, 2], 2);
    expect(r).toHaveLength(4);
    expect(r.map(d => d.descritor)).toEqual(['D-gap1', 'D-gap2', 'D-gap3', 'D-gap4']);
    expect(r.map(d => d.semanas_ids)).toEqual([[1], [1], [2], [2]]);
  });

  it('SEM doubling: todo descritor tem exatamente 1 slot', () => {
    const r = selectDescriptorsPiloto('Comp X', assessment, [1, 2], 2);
    r.forEach(d => {
      expect(d.semanas_alocadas).toBe(1);
      expect(d.semanas_ids).toHaveLength(1);
    });
    // Distintos por construção
    expect(new Set(r.map(d => d.descritor)).size).toBe(4);
  });

  it('gap profundo (nota < 2.0) NÃO ganha 2 semanas (diferente do single)', () => {
    const r = selectDescriptorsPiloto('Comp X', assessment, [1, 2], 2);
    const profundo = r.find(d => d.descritor === 'D-gap1')!;
    expect(profundo.semanas_alocadas).toBe(1);
  });

  it('preenche competencia e gap coerentes', () => {
    const r = selectDescriptorsPiloto('Comp X', assessment, [1, 2], 2);
    expect(r.every(d => d.competencia === 'Comp X')).toBe(true);
    expect(r[0].gap).toBeCloseTo(1.8); // 3.0 − 1.2
  });

  it('completa com proficientes (mais alto primeiro) quando faltam gaps', () => {
    const poucos = [
      { descritor: 'G1', nota: 1.5 },
      { descritor: 'P1', nota: 3.2 },
      { descritor: 'P2', nota: 3.9 },
      { descritor: 'P3', nota: 3.5 },
    ];
    const r = selectDescriptorsPiloto('Comp X', poucos, [1, 2], 2);
    expect(r.map(d => d.descritor)).toEqual(['G1', 'P2', 'P3', 'P1']);
    expect(r[1].gap).toBe(0);
  });

  it('assessment com MENOS de 4 descritores → retorna quantos há (caller valida por presença)', () => {
    const r = selectDescriptorsPiloto('Comp X', [
      { descritor: 'A', nota: 2.0 },
      { descritor: 'B', nota: 2.5 },
      { descritor: 'C', nota: 1.0 },
    ], [1, 2], 2);
    expect(r).toHaveLength(3);
  });

  it('assessment vazio → []', () => {
    expect(selectDescriptorsPiloto('Comp X', [], [1, 2], 2)).toEqual([]);
  });

  it('dedupe defensivo por descritor', () => {
    const r = selectDescriptorsPiloto('Comp X', [
      { descritor: 'A', nota: 1.0 },
      { descritor: 'A', nota: 2.9 },
      { descritor: 'B', nota: 2.0 },
    ], [1, 2], 2);
    expect(r.filter(d => d.descritor === 'A')).toHaveLength(1);
    expect(r.find(d => d.descritor === 'A')!.nota_atual).toBe(1.0); // maior gap vence
  });
});
