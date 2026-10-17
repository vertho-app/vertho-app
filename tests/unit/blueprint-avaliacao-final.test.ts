import { describe, it, expect } from 'vitest';
import { montarSemanasDeAvaliacao } from '@/lib/blueprint/avaliacao-final';

/**
 * A semana de avaliação montada em código a partir dos objetivos (decisão do dono, 16/10/2026): a avaliação cobra
 * EXATAMENTE as evidências e os critérios que os objetivos prometem. Caso real da Amazon: o objetivo pedia 20
 * registros e a avaliação gerada pela IA cobrava 12.
 */
const bp = () => ({
  competencias: [{
    nome: 'Agilidade e Flexibilidade',
    objetivos_30_dias: [
      { id: 'obj-1', objetivo: 'Vou registrar imprevistos', evidencia_de_execucao: 'Caderno com ao menos oito registros de imprevisto.', criterio_de_sucesso: 'A chefia identifica o imprevisto e a ação.' },
      { id: 'obj-2', objetivo: 'Vou fazer ações preventivas', evidencia_de_execucao: 'Checklist com ao menos 20 registros de ação preventiva', criterio_de_sucesso: 'A chefia verifica as 20 ações; ' },
    ],
  }],
  trilha: {
    semanas: [
      { semana: 1, tipo: 'conteudo', competencia_foco: ['Agilidade e Flexibilidade'], conexao_com_pdi: ['obj-1'], evidencia_esperada: 'x', criterio_de_sucesso: 'y' },
      { semana: 7, tipo: 'avaliacao', competencia_foco: ['Agilidade e Flexibilidade'], descritores_foco: ['Iniciativa'], objetivo_da_semana: 'Demonstrar o que praticou', conexao_com_pdi: ['obj-1'], evidencia_esperada: 'ao menos 12 registros de ação preventiva', criterio_de_sucesso: 'velho' },
    ],
  },
});

describe('montarSemanasDeAvaliacao', () => {
  it('a avaliação cobra a evidência e o critério de CADA objetivo, com os mesmos números (20, não 12)', () => {
    const m: any = montarSemanasDeAvaliacao(bp());
    const s = m.trilha.semanas[1];
    expect(s.conexao_com_pdi).toEqual(['obj-1', 'obj-2']);
    expect(s.evidencia_esperada).toBe('Apresentar, com os registros das semanas anteriores: (1) Caderno com ao menos oito registros de imprevisto; (2) Checklist com ao menos 20 registros de ação preventiva.');
    expect(s.criterio_de_sucesso).toBe('A avaliação verifica cada objetivo do PDI, item a item: (1) A chefia identifica o imprevisto e a ação; (2) A chefia verifica as 20 ações.');
    expect(s.evidencia_esperada).not.toMatch(/12/);
  });

  it('não mexe nas semanas de conteúdo, no objetivo da semana nem nos descritores; não altera a entrada', () => {
    const entrada = bp();
    const m: any = montarSemanasDeAvaliacao(entrada);
    expect(m.trilha.semanas[0]).toEqual(entrada.trilha.semanas[0]);
    expect(m.trilha.semanas[1].objetivo_da_semana).toBe('Demonstrar o que praticou');
    expect(m.trilha.semanas[1].descritores_foco).toEqual(['Iniciativa']);
    expect(entrada.trilha.semanas[1].evidencia_esperada).toBe('ao menos 12 registros de ação preventiva');
  });

  it('com duas competências, cada semana de avaliação cobra só os objetivos da sua (nome casado sem acento e sem caixa)', () => {
    const b: any = bp();
    b.competencias.push({ nome: 'Rotina', objetivos_30_dias: [{ id: 'obj-3', objetivo: 'Vou cumprir horários', evidencia_de_execucao: 'ao menos 10 registros de horário', criterio_de_sucesso: 'horários conferidos' }] });
    b.trilha.semanas.push({ semana: 8, tipo: 'avaliacao', competencia_foco: ['ROTINA'], conexao_com_pdi: ['obj-1'] });
    const m: any = montarSemanasDeAvaliacao(b);
    expect(m.trilha.semanas[1].conexao_com_pdi).toEqual(['obj-1', 'obj-2']);
    expect(m.trilha.semanas[2].conexao_com_pdi).toEqual(['obj-3']);
    expect(m.trilha.semanas[2].evidencia_esperada).toMatch(/\(1\) ao menos 10 registros de horário\.$/);
  });

  it('objetivo sem evidência ou critério entra com o próprio texto; sem objetivos, a semana fica como veio', () => {
    const b: any = bp();
    delete b.competencias[0].objetivos_30_dias[1].evidencia_de_execucao;
    const m: any = montarSemanasDeAvaliacao(b);
    expect(m.trilha.semanas[1].evidencia_esperada).toMatch(/\(2\) Vou fazer ações preventivas\.$/);
    const vazio: any = bp(); vazio.competencias[0].objetivos_30_dias = [];
    expect(montarSemanasDeAvaliacao(vazio).trilha.semanas[1].evidencia_esperada).toBe('ao menos 12 registros de ação preventiva');
  });
});
