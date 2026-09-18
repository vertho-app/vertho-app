import { describe, it, expect } from 'vitest';
import { travaRegeracao } from '@/lib/season-engine/trava-regeracao';

// Regerar grava na MESMA linha da trilha, com status ativa e snapshot nulo nos
// presets. A trava existe para isso não reabrir, apagar ou trocar formato.

describe('travaRegeracao', () => {
  it('sem trilha existente: livre', () => {
    expect(travaRegeracao(null, { modoNovo: 'jornada' })).toBeNull();
  });

  it('Macaé: jornada CONCLUÍDA não é regerada por cima (reabriria e apagaria o fechamento)', () => {
    const r = travaRegeracao({ status: 'concluida', programa_modo: 'jornada' }, { modoNovo: 'jornada' });
    expect(r?.codigo).toBe('trilha_concluida');
  });

  it('Ibipeba: snapshot de plano próprio não é apagado por um preset', () => {
    const existente = { status: 'ativa', programa_modo: 'regular_duo', programa_config: { semanas: 9 } };
    expect(travaRegeracao(existente, { modoNovo: 'regular_duo' })?.codigo).toBe('trilha_com_snapshot');
  });

  it('custom regerado em custom é permitido (o snapshot é derivado de novo)', () => {
    const existente = { status: 'ativa', programa_modo: 'custom', programa_config: { semanas: 2 } };
    expect(travaRegeracao(existente, { modoNovo: 'custom' })).toBeNull();
  });

  it('formato diferente é recusado, inclusive legado sem carimbo', () => {
    expect(travaRegeracao({ status: 'ativa', programa_modo: 'regular_duo' }, { modoNovo: 'jornada' })?.codigo)
      .toBe('trilha_formato_diferente');
    expect(travaRegeracao({ status: 'ativa', programa_modo: null }, { modoNovo: 'regular_duo' })?.codigo)
      .toBe('trilha_formato_diferente');
  });

  it('mesma trilha ativa, mesmo formato, sem snapshot: regerar é permitido', () => {
    expect(travaRegeracao({ status: 'ativa', programa_modo: 'jornada', programa_config: null }, { modoNovo: 'jornada' })).toBeNull();
  });

  it('linha NOVA nunca é travada: encadeamento (novaJornada) e troca de participação', () => {
    const concluida = { status: 'concluida', programa_modo: 'jornada', turma_membro_id: 'tm-antiga' };
    expect(travaRegeracao(concluida, { modoNovo: 'jornada', novaJornada: true })).toBeNull();
    expect(travaRegeracao(concluida, { modoNovo: 'jornada', turmaMembroId: 'tm-nova' })).toBeNull();
    // mesma participação não é troca
    expect(travaRegeracao(concluida, { modoNovo: 'jornada', turmaMembroId: 'tm-antiga' })?.codigo).toBe('trilha_concluida');
  });

  it('a mensagem diz o que aconteceria e que nada mudou', () => {
    const r = travaRegeracao({ status: 'ativa', programa_modo: 'regular_duo' }, { modoNovo: 'jornada' });
    expect(r?.mensagem).toContain('regular_duo');
    expect(r?.mensagem).toContain('jornada');
  });
});
