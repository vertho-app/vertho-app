import { describe, it, expect } from 'vitest';
import { bancoEmMemoria } from '../helpers/tabelas-em-memoria';
import { resolverFilaBlueprint100 } from '@/lib/blueprint/core';

/**
 * A fila do blueprint com a competência DA PESSOA (mig 287, Amazon Bowling 15/10/2026). O cargo não tem foco
 * nenhum; a fila que lia só o cargo devolvia vazio e o fluxo seguia "nada pendente", sem blueprint, PDI ou trilha
 * para ninguém. Banco em memória: os filtros são de verdade.
 */
function banco(over: Record<string, any[]> = {}) {
  return bancoEmMemoria({
    colaboradores: [
      { id: 'a', empresa_id: 'e', nome_completo: 'Ana', cargo: 'SUPERVISAO', foco_individual: ['Rotina'] },
      { id: 'b', empresa_id: 'e', nome_completo: 'Bia', cargo: 'SUPERVISAO', foco_individual: ['Simplicidade'] },
      { id: 'c', empresa_id: 'e', nome_completo: 'Caio', cargo: 'SUPERVISAO', foco_individual: null },
    ],
    cargos_empresa: [{ empresa_id: 'e', nome: 'SUPERVISAO', competencias_foco: [], competencia_foco: null }],
    descriptor_assessments: [
      { empresa_id: 'e', colaborador_id: 'a', competencia: 'Rotina' },
      { empresa_id: 'e', colaborador_id: 'b', competencia: 'Simplicidade' },
      { empresa_id: 'e', colaborador_id: 'c', competencia: 'Rotina' },
    ],
    ...over,
  });
}

describe('resolverFilaBlueprint100 com a competência de cada pessoa', () => {
  it('cargo sem foco: entra quem tem competência própria mapeada, cada um com a SUA', async () => {
    const fila = await resolverFilaBlueprint100(banco().client);
    expect(fila.map((f) => [f.id, f.foco])).toEqual([['a', ['Rotina']], ['b', ['Simplicidade']]]);
  });

  it('a competência própria vence o foco do cargo', async () => {
    const fila = await resolverFilaBlueprint100(banco({
      cargos_empresa: [{ empresa_id: 'e', nome: 'SUPERVISAO', competencias_foco: ['Rotina'], competencia_foco: 'Rotina' }],
    }).client);
    expect(fila.find((f) => f.id === 'b')?.foco).toEqual(['Simplicidade']);
    expect(fila.find((f) => f.id === 'c')?.foco).toEqual(['Rotina']);
  });

  it('a regra dos 100% vale para a competência própria (sem mapeamento dela, fica de fora)', async () => {
    const fila = await resolverFilaBlueprint100(banco({
      descriptor_assessments: [{ empresa_id: 'e', colaborador_id: 'a', competencia: 'Rotina' }, { empresa_id: 'e', colaborador_id: 'b', competencia: 'Rotina' }],
    }).client);
    expect(fila.map((f) => f.id)).toEqual(['a']);
  });

  it('falha ao ler a competência própria LANÇA, em vez de tirar essas pessoas da fila em silêncio', async () => {
    // O `falharEm` do mock não distingue dois selects na mesma tabela; só a leitura da competência própria falha aqui.
    const real = banco().client;
    const tdb = {
      from: (t: string) => {
        const q = real.from(t);
        if (t !== 'colaboradores') return q;
        return {
          select: (cols: string) => (cols.includes('foco_individual')
            ? { not: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }
            : q.select(cols)),
        };
      },
    };
    await expect(resolverFilaBlueprint100(tdb)).rejects.toThrow(/competência própria/);
  });
});

/**
 * "Mapeada" é na JORNADA ATUAL (17/10/2026, Ibipeba Temporada 2). Com o foco do cargo ainda na competência da
 * Temporada 1, as notas antigas punham a pessoa na fila e o blueprint seria regerado na competência errada.
 */
describe('resolverFilaBlueprint100: notas da jornada atual', () => {
  const MARCO = '2026-10-07T12:22:33Z';
  const participacoes = [
    { empresa_id: 'e', id: 'p1', turma_id: 't1', colaborador_id: 'a', status: 'concluido', created_at: '2026-07-13T00:00:00Z', marco_jornada: null },
    { empresa_id: 'e', id: 'p2', turma_id: 't2', colaborador_id: 'a', status: 'ativo', created_at: MARCO, marco_jornada: MARCO },
  ];

  it('nota de ANTES do marco não mapeia a jornada nova; nota de depois mapeia; sem participação, conta', async () => {
    const fila = await resolverFilaBlueprint100(banco({
      turma_membros: participacoes,
      descriptor_assessments: [
        { empresa_id: 'e', colaborador_id: 'a', competencia: 'Rotina', assessment_date: '2026-10-02T12:13:09Z' },
        { empresa_id: 'e', colaborador_id: 'b', competencia: 'Simplicidade', assessment_date: '2026-07-20T00:00:00Z' },
      ],
    }).client);
    expect(fila.map((f) => f.id)).toEqual(['b']);

    const depois = await resolverFilaBlueprint100(banco({
      turma_membros: participacoes,
      descriptor_assessments: [{ empresa_id: 'e', colaborador_id: 'a', competencia: 'Rotina', assessment_date: '2026-10-20T00:00:00Z' }],
    }).client);
    expect(depois.map((f) => f.id)).toEqual(['a']);
  });

  it('falha ao ler as notas LANÇA (não vira "ninguém mapeado")', async () => {
    const real = banco().client;
    const tdb = {
      from: (t: string) => (t === 'descriptor_assessments'
        ? { select: () => Promise.resolve({ data: null, error: { message: 'timeout' } }) }
        : real.from(t)),
    };
    await expect(resolverFilaBlueprint100(tdb)).rejects.toThrow(/descriptor_assessments: timeout/);
  });
});
