import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONVERGENCIA,
  CORTE_ATENCAO,
  CORTE_CONFIRMADA,
  CORTE_PARCIAL,
  classificarConvergencia,
  rotuloConvergencia,
} from '@/lib/season-engine/convergencia';

/**
 * A régua de convergência decide o veredito que a pessoa lê no relatório e que
 * o gestor lê no painel. Ela nasceu privada dentro do motor e ganhou um arquivo
 * quando o fixture da demo virou um segundo produtor — este teste existe para
 * que a segunda cópia não volte por descuido.
 */
describe('Régua de convergência', () => {
  it('exige delta E leitura qualitativa para confirmar', () => {
    // Delta grande sozinho NÃO confirma: é a diferença entre "o número subiu"
    // e "a mudança foi percebida". Trocar o `&&` por `||` no motor faz este
    // caso virar confirmada e o teste falhar.
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 3, nivel_percebido: null }))
      .toBe(CONVERGENCIA.PARCIAL);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 3, nivel_percebido: 3 }))
      .toBe(CONVERGENCIA.CONFIRMADA);
  });

  it('sustenta evolução parcial só com a leitura qualitativa', () => {
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2, nivel_percebido: 3 }))
      .toBe(CONVERGENCIA.PARCIAL);
  });

  it('separa estável de requer atenção no corte de -0,2', () => {
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 1.85, nivel_percebido: null }))
      .toBe(CONVERGENCIA.ESTAVEL);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 1.7, nivel_percebido: null }))
      .toBe(CONVERGENCIA.ATENCAO);
  });

  it('trata as fronteiras dos cortes como inclusivas para o lado melhor', () => {
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2 + CORTE_PARCIAL, nivel_percebido: null }))
      .toBe(CONVERGENCIA.PARCIAL);
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2 + CORTE_CONFIRMADA, nivel_percebido: 2.5 }))
      .toBe(CONVERGENCIA.CONFIRMADA);
    // Exatamente no corte de atenção ainda é estável (a régua usa `<`).
    expect(classificarConvergencia({ nota_pre: 2, nota_pos: 2 + CORTE_ATENCAO, nivel_percebido: null }))
      .toBe(CONVERGENCIA.ESTAVEL);
  });

  it('rotula sem expor o vocabulário do banco', () => {
    expect(rotuloConvergencia(CONVERGENCIA.ESTAVEL)).toBe('Estável');
    expect(rotuloConvergencia(CONVERGENCIA.ATENCAO)).toBe('Requer atenção');
    expect(rotuloConvergencia(null)).toBe('Sem medição');
    expect(rotuloConvergencia('valor_que_nao_existe')).toBe('Sem medição');
  });

  /**
   * O motor tem que CONSUMIR a régua, não reimplementá-la. Sem esta asserção,
   * alguém pode colar de volta um `if (delta >= 0.5)` dentro do core e os dois
   * caminhos passam a divergir em silêncio, que é exatamente o histórico da
   * régua nota→nível nesta base.
   */
  it('o motor de Evolution Report não tem régua própria', () => {
    const core = readFileSync('lib/season-engine/evolution-report-core.ts', 'utf8');
    expect(core).toContain("from './convergencia'");
    expect(core).not.toContain('function classificarConvergencia');
    expect(core).not.toMatch(/'evolucao_confirmada'/);
    expect(core).not.toMatch(/'estagnacao'/);
  });
});
