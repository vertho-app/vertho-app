import { describe, it, expect } from 'vitest';
import { temTrabalhoDoColaborador, classificarOrfas } from '@/lib/season-engine/trilha-core';

/**
 * INVARIANTE: regenerar uma trilha NÃO apaga o que o colaborador escreveu.
 *
 * `persistirTrilha` fazia `delete` da linha inteira de `temporada_semana_progresso`
 * e reinseria. O `delete` não apagava "progresso" — apagava REFLEXÕES, FEEDBACKS,
 * transcripts de tira-dúvidas e as marcações de conteúdo consumido. Texto que a
 * pessoa produziu, sem backup e sem aviso. Um admin regenerando a trilha de alguém
 * no meio do programa destruía o registro das avaliações dele.
 *
 * Medido em 27/07, antes da correção: de 675 linhas, 36 guardavam
 * reflexão/feedback/tira-dúvidas e 55 tinham consumo marcado.
 *
 * A régua: `status` e timestamps são estado do SISTEMA (reescrever é legítimo);
 * reflexão, feedback, tira-dúvidas e consumo são da PESSOA (nunca reescrever).
 */

describe('temTrabalhoDoColaborador · o que nunca pode ser apagado', () => {
  it('reflexão conta como trabalho', () => {
    expect(temTrabalhoDoColaborador({ reflexao: { texto: 'aprendi X' } })).toBe(true);
  });
  it('feedback conta', () => {
    expect(temTrabalhoDoColaborador({ feedback: { nota: 5 } })).toBe(true);
  });
  it('transcript do tira-dúvidas conta', () => {
    expect(temTrabalhoDoColaborador({ tira_duvidas: [{ q: 'a', r: 'b' }] })).toBe(true);
  });
  it('conteúdo consumido conta — é ação da pessoa, não estado do sistema', () => {
    expect(temTrabalhoDoColaborador({ conteudo_consumido: true })).toBe(true);
  });

  it('status e timestamps NÃO contam — são estado do sistema', () => {
    // Se contassem, nenhuma linha jamais seria descartável e o plano nunca encolheria.
    expect(temTrabalhoDoColaborador({ status: 'concluida', iniciado_em: '2026-07-01', concluido_em: '2026-07-05' })).toBe(false);
  });

  it('linha vazia não tem trabalho', () => {
    expect(temTrabalhoDoColaborador({ semana: 3, tipo: 'conteudo' })).toBe(false);
    expect(temTrabalhoDoColaborador(null)).toBe(false);
  });

  it('conteudo_consumido=false não é trabalho (é o default)', () => {
    expect(temTrabalhoDoColaborador({ conteudo_consumido: false })).toBe(false);
  });
});

describe('classificarOrfas · plano que encolhe não pode levar dado junto', () => {
  const plano2 = [{ semana: 1 }, { semana: 2 }];

  it('semana fora do plano e VAZIA → descartável', () => {
    const r = classificarOrfas([{ semana: 5 }, { semana: 6 }], plano2);
    expect(r.descartaveis).toEqual([5, 6]);
    expect(r.preservadas).toEqual([]);
  });

  it('semana fora do plano COM reflexão → preservada (o caso que motivou a correção)', () => {
    // Trocar o modo do programa (14 semanas → piloto de 2) não pode apagar o que
    // alguém escreveu na semana 8.
    const r = classificarOrfas([{ semana: 8, reflexao: { texto: 'minha evidência' } }], plano2);
    expect(r.preservadas).toEqual([8]);
    expect(r.descartaveis).toEqual([]);
  });

  it('mistura: descarta as vazias e guarda as com trabalho', () => {
    const r = classificarOrfas([
      { semana: 3 },
      { semana: 4, conteudo_consumido: true },
      { semana: 5 },
      { semana: 9, tira_duvidas: [{ q: 'x' }] },
    ], plano2);
    expect(r.descartaveis.sort()).toEqual([3, 5]);
    expect(r.preservadas.sort()).toEqual([4, 9]);
  });

  it('semana que CONTINUA no plano nunca é órfã, mesmo vazia', () => {
    const r = classificarOrfas([{ semana: 1 }, { semana: 2 }], plano2);
    expect(r.descartaveis).toEqual([]);
    expect(r.preservadas).toEqual([]);
  });

  it('plano que cresce não descarta nada', () => {
    const r = classificarOrfas([{ semana: 1 }], [{ semana: 1 }, { semana: 2 }, { semana: 3 }]);
    expect(r.descartaveis).toEqual([]);
  });

  it('tolera entradas vazias', () => {
    expect(classificarOrfas([], plano2)).toEqual({ descartaveis: [], preservadas: [] });
    expect(classificarOrfas(null as any, null as any)).toEqual({ descartaveis: [], preservadas: [] });
  });

  it('compara semana por NÚMERO — string "3" não escapa da classificação', () => {
    const r = classificarOrfas([{ semana: '3' as any }], [{ semana: 1 }]);
    expect(r.descartaveis).toEqual([3]);
  });
});
