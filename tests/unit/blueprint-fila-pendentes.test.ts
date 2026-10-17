import { describe, it, expect } from 'vitest';
import { separarPorBlueprintExistente } from '@/lib/blueprint/core';
import type { FilaBlueprintItem } from '@/lib/blueprint/core';

/**
 * Elegível ≠ pendente.
 *
 * `resolverFilaBlueprint100` responde "quem tem as competências foco 100%
 * mapeadas". O lote tratava isso como "quem precisa ser gerado", e o persist é
 * `upsert` com `onConflict (empresa_id, colaborador_id)` — então incluir quem já
 * tem SOBRESCREVE.
 *
 * Cenário real de 31/08/2026 (Macaé): 81 elegíveis, 43 professores sem blueprint
 * e 38 diretores que já tinham o seu desde 14/08, todos auditados, 34 deles já
 * virados PDI e entregues por WhatsApp em 17/08.
 */

const item = (id: string, nome: string): FilaBlueprintItem => ({ id, nome, foco: ['Autocuidado'] });

const PROFESSORES = Array.from({ length: 43 }, (_, i) => item(`prof-${i}`, `Professor ${i}`));
const DIRETORES = Array.from({ length: 38 }, (_, i) => item(`dir-${i}`, `Diretor ${i}`));
const FILA = [...PROFESSORES, ...DIRETORES];

/**
 * `tdb` mínimo: o `.from('development_blueprints').select()` e as participações (`turma_membros`, paginado) que a
 * função lê para saber a jornada atual de cada pessoa.
 */
function tdbCom(
  idsComBlueprint: string[],
  erro?: string,
  extra: { participacoes?: any[]; geradoEm?: Record<string, string>; erroTurmas?: string } = {},
) {
  return {
    from(tabela: string) {
      if (tabela === 'turma_membros') {
        const res = extra.erroTurmas
          ? { data: null, error: { message: extra.erroTurmas } }
          : { data: extra.participacoes || [], error: null };
        return { select: () => ({ order: () => ({ range: async () => res }) }) };
      }
      if (tabela !== 'development_blueprints') throw new Error(`tabela inesperada: ${tabela}`);
      return {
        select: async () => (erro
          ? { data: null, error: { message: erro } }
          : {
            data: idsComBlueprint.map((id) => ({ colaborador_id: id, gerado_em: extra.geradoEm?.[id] ?? '2026-08-14T00:00:00Z' })),
            error: null,
          }),
      };
    },
  };
}

describe('separarPorBlueprintExistente', () => {
  it('separa os 43 pendentes dos 38 que já têm — o caso de Macaé', async () => {
    const { pendentes, jaTem } = await separarPorBlueprintExistente(
      tdbCom(DIRETORES.map((d) => d.id)), FILA,
    );
    expect(pendentes).toHaveLength(43);
    expect(jaTem).toHaveLength(38);
    expect(pendentes.every((p) => p.id.startsWith('prof-'))).toBe(true);
  });

  it('preserva a ordem e o conteúdo dos itens (o `foco` vai junto)', async () => {
    const { pendentes } = await separarPorBlueprintExistente(tdbCom([]), FILA);
    expect(pendentes).toEqual(FILA);
  });

  it('fila vazia não consulta o banco', async () => {
    const tdb = { from: () => { throw new Error('não devia consultar'); } };
    await expect(separarPorBlueprintExistente(tdb, [])).resolves.toEqual({ pendentes: [], jaTem: [] });
  });

  it('ninguém tem blueprint → todos pendentes', async () => {
    const { pendentes, jaTem } = await separarPorBlueprintExistente(tdbCom([]), FILA);
    expect(pendentes).toHaveLength(81);
    expect(jaTem).toHaveLength(0);
  });

  it('todos já têm → nenhum pendente (o lote não deve disparar)', async () => {
    const { pendentes, jaTem } = await separarPorBlueprintExistente(
      tdbCom(FILA.map((f) => f.id)), FILA,
    );
    expect(pendentes).toHaveLength(0);
    expect(jaTem).toHaveLength(81);
  });

  /**
   * 🔴 O ramo que decide se o defeito volta pela porta dos fundos.
   *
   * supabase-js RETORNA `{ error }`, não lança. Sem a checagem, uma falha de
   * leitura viraria `comBp` VAZIO — indistinguível de "ninguém tem blueprint" —
   * e o lote regeraria a coorte inteira, sobrescrevendo o que já foi auditado e
   * entregue. Falhar alto aqui é seguro: nada foi gerado nem pago ainda.
   */
  it('erro de leitura LANÇA em vez de virar "ninguém tem"', async () => {
    await expect(
      separarPorBlueprintExistente(tdbCom([], 'connection reset'), FILA),
    ).rejects.toThrow(/development_blueprints: connection reset/);
  });

  /**
   * Jornada nova (17/10/2026, Ibipeba Temporada 2): 25 das 34 pessoas que responderam tinham o blueprint da
   * Temporada 1 e eram "já tem". O blueprint só conta se nasceu na janela da participação ATIVA.
   */
  describe('jornada atual (participação com marco)', () => {
    const MARCO = '2026-10-07T12:22:33Z';
    const T1 = { id: 'p1', turma_id: 't1', status: 'concluido', created_at: '2026-07-13T00:00:00Z', marco_jornada: null };
    const T2 = { id: 'p2', turma_id: 't2', status: 'ativo', created_at: MARCO, marco_jornada: MARCO };
    const fila = [item('helmar', 'Helmar'), item('elda', 'Elda'), item('macae', 'Pessoa sem turma')];
    const participacoes = [
      { ...T1, colaborador_id: 'helmar' }, { ...T2, colaborador_id: 'helmar' },
      { ...T1, id: 'p3', colaborador_id: 'elda' }, { ...T2, id: 'p4', colaborador_id: 'elda' },
    ];

    it('o blueprint da jornada ANTERIOR não conta: a pessoa vai para pendentes', async () => {
      const { pendentes, jaTem } = await separarPorBlueprintExistente(
        tdbCom(['helmar', 'elda', 'macae'], undefined, {
          participacoes,
          geradoEm: { helmar: '2026-10-02T12:19:04Z', elda: '2026-10-20T10:00:00Z', macae: '2026-08-14T00:00:00Z' },
        }),
        fila,
      );
      expect(pendentes.map((p) => p.id)).toEqual(['helmar']); // T1: regera
      expect(jaTem.map((p) => p.id)).toEqual(['elda', 'macae']); // T2 já gerado; sem turma = conta de sempre
    });

    it('falha ao ler as participações LANÇA (não vira "todo blueprint vale")', async () => {
      await expect(
        separarPorBlueprintExistente(tdbCom(['helmar'], undefined, { erroTurmas: 'timeout' }), fila),
      ).rejects.toThrow(/participações: timeout/);
    });
  });
});
