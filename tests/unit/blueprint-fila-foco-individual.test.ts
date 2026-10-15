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
