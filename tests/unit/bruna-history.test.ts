import { describe, expect, it } from 'vitest';
import { montarHistoricoBruna } from '@/lib/demo/bruna-history';

const plano = Array.from({ length: 7 }, (_, indice) => ({
  semana: indice + 1,
  tipo: indice === 6 ? 'avaliacao' : 'conteudo',
  competencia: indice === 6 ? undefined : 'Negociação e Fechamento',
  descritor: indice === 6 ? null : `Comportamento ${indice + 1}`,
  descritores_cobertos: indice === 6 ? ['A', 'B'] : [`Comportamento ${indice + 1}`],
  conteudo: indice === 6 ? undefined : { texto: `Conteúdo ${indice + 1}` },
}));

describe('histórico demonstrativo da Bruna', () => {
  it('cria a temporada 1 concluída sem empobrecer o plano consultável', () => {
    const resultado = montarHistoricoBruna({
      id: 'trilha-atual',
      numero_temporada: 1,
      status: 'ativa',
      competencia_foco: 'Negociação e Fechamento',
      competencias_foco: ['Negociação e Fechamento'],
      temporada_plano: plano,
      descritores_selecionados: [],
      programa_modo: 'jornada',
      programa_config: null,
    }, new Date('2026-09-21T15:00:00.000Z'));

    expect(resultado.trilha).toMatchObject({
      numero_temporada: 1,
      status: 'concluida',
      competencia_foco: 'Negociação e Fechamento',
      competencias_foco: ['Negociação e Fechamento'],
      programa_modo: 'jornada',
    });
    expect(resultado.trilha.temporada_plano).toEqual(plano);
    expect(resultado.trilha.temporada_plano).not.toBe(plano);
    expect(resultado.trilha.evolution_report).toMatchObject({ demo_fixture: true });
    expect(resultado.progresso).toHaveLength(7);
    expect(resultado.progresso.every((linha) => linha.status === 'concluido')).toBe(true);
    expect(resultado.progresso.every((linha) => linha.conteudo_consumido)).toBe(true);
    expect(resultado.progresso[0].reflexao).toMatchObject({ qualidade_reflexao: 'alta' });
    expect(resultado.progresso[6].feedback).toMatchObject({
      demo_fixture: true,
      cenario_resposta: expect.any(String),
    });
  });

  it('recusa um plano incompleto para não criar histórico decorativo', () => {
    expect(() => montarHistoricoBruna({
      id: 'trilha-atual',
      numero_temporada: 1,
      status: 'ativa',
      competencia_foco: 'Negociação e Fechamento',
      competencias_foco: ['Negociação e Fechamento'],
      temporada_plano: plano.slice(0, 2),
      descritores_selecionados: [],
      programa_modo: 'jornada',
      programa_config: null,
    })).toThrow('esperava 7 semanas');
  });
});
