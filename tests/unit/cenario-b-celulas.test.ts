import { describe, it, expect } from 'vitest';
import { celulasSemCenarioB, ehIntegrador } from '@/lib/season-engine/cenario-b';
import { ehCargoAncoraLideranca } from '@/lib/simuladores/lideranca/matriz-global';

// O lote da Fase 5 gerava um B por cenário A; numa rede há um A por PPP e a
// mesma célula recebia N B de uma vez (FMEA F-C14, 12 B em Ibipeba em 01/09/2026).
const A = (id: string, cargo: string, competencia_id: string, extra: Record<string, unknown> = {}) => ({
  id, titulo: `t-${id}`, descricao: `d-${id}`, cargo, competencia_id, ppp_escola_id: null, created_at: '2026-09-01T00:00:00Z', ...extra,
});
const NOMES = new Map([
  ['c-plan', 'Planejamento e Organização'],
  ['c-auto', 'Autocuidado e resiliência emocional'],
  ['c-conf', 'GERENCIAMENTO DE CONFLITOS'],
]);

describe('celulasSemCenarioB', () => {
  it('três cenários A da mesma célula (um por PPP) viram UMA geração, com o A de rede como referência', () => {
    const cenariosA = [
      A('a-ppp1', 'Gestão Escolar', 'c-plan', { ppp_escola_id: 'ppp1', created_at: '2026-09-10T00:00:00Z' }),
      A('a-rede', 'Gestão Escolar', 'c-plan', { ppp_escola_id: null, created_at: '2026-08-01T00:00:00Z' }),
      A('a-ppp2', 'Gestão Escolar', 'c-plan', { ppp_escola_id: 'ppp2', created_at: '2026-09-12T00:00:00Z' }),
    ];
    const r = celulasSemCenarioB(cenariosA, [], NOMES);
    expect(r).toHaveLength(1);
    expect(r[0].referencia.id).toBe('a-rede');
    expect(r[0].totalA).toBe(3);
  });

  it('sem A de rede: o mais recente é a referência', () => {
    const cenariosA = [
      A('a-velho', 'Gestão Escolar', 'c-plan', { ppp_escola_id: 'p1', created_at: '2026-08-01T00:00:00Z' }),
      A('a-novo', 'Gestão Escolar', 'c-plan', { ppp_escola_id: 'p2', created_at: '2026-09-01T00:00:00Z' }),
    ];
    expect(celulasSemCenarioB(cenariosA, [], NOMES)[0].referencia.id).toBe('a-novo');
  });

  it('célula que já tem B do cargo é pulada', () => {
    const cenariosA = [A('a1', 'Diretor(a) Escolar', 'c-conf')];
    const cenariosB = [{ competencia_id: 'c-conf', cargo: 'Diretor(a) Escolar', alternativas: {} }];
    expect(celulasSemCenarioB(cenariosA, cenariosB, NOMES)).toHaveLength(0);
  });

  it('célula coberta por B integrador do mesmo cargo é pulada (Ibipeba)', () => {
    const cenariosA = [A('a1', 'Gestão Escolar', 'c-auto')];
    const integrador = {
      competencia_id: 'c-plan', cargo: 'Gestão Escolar',
      alternativas: { competencias_integradas: ['Planejamento e Organização', 'Autocuidado e resiliência emocional'] },
    };
    expect(celulasSemCenarioB(cenariosA, [integrador], NOMES)).toHaveLength(0);
  });

  it("B de 'todos' não cobre a célula de um cargo: o do cargo tem o contexto dele", () => {
    const cenariosA = [A('a1', 'Diretor(a) Escolar', 'c-conf')];
    const todos = { competencia_id: 'c-conf', cargo: 'todos', alternativas: {} };
    expect(celulasSemCenarioB(cenariosA, [todos], NOMES)).toHaveLength(1);
  });

  it('B de outra competência não cobre a célula', () => {
    const cenariosA = [A('a1', 'Diretor(a) Escolar', 'c-conf')];
    const outra = { competencia_id: 'c-plan', cargo: 'Diretor(a) Escolar', alternativas: {} };
    expect(celulasSemCenarioB(cenariosA, [outra], NOMES)).toHaveLength(1);
  });

  it('cargos-âncora do simulador de liderança não levam B', () => {
    const cenariosA = [A('a1', 'Líder', 'c-conf'), A('a2', 'Futuro Líder', 'c-conf'), A('a3', 'Diretor(a) Escolar', 'c-conf')];
    const r = celulasSemCenarioB(cenariosA, [], NOMES, { excluirCargo: ehCargoAncoraLideranca });
    expect(r.map((c) => c.referencia.id)).toEqual(['a3']);
  });

  it('A sem competência ou sem cargo é ignorado', () => {
    const cenariosA = [A('a1', '', 'c-conf'), { ...A('a2', 'Diretor(a) Escolar', 'c-conf'), competencia_id: null }];
    expect(celulasSemCenarioB(cenariosA as any[], [], NOMES)).toHaveLength(0);
  });
});

describe('ehIntegrador', () => {
  it('só é integrador quem cobre mais de uma competência', () => {
    expect(ehIntegrador({ competencias_integradas: ['A', 'B'] })).toBe(true);
    expect(ehIntegrador({ competencias_integradas: ['A'] })).toBe(false);
    expect(ehIntegrador({ competencias_integradas: ['A', '  '] })).toBe(false);
    expect(ehIntegrador({})).toBe(false);
    expect(ehIntegrador(null)).toBe(false);
  });
});
